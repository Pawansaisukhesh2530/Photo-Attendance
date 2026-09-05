import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/api/client';
import {
  AmendReasonSheet,
  AppHeader,
  AttendanceSummaryCard,
  Badge,
  Button,
  Card,
  ClassCodeTag,
  ClassroomPhotoViewer,
  EmptyState,
  ErrorState,
  FilterChips,
  FinalizeModal,
  Icon,
  LoadingState,
  SearchField,
  StatusEditSheet,
  StudentListItem,
  Text,
  TwinReviewModal,
  useToast,
  type FilterChipOption,
} from '@/components';
import {
  useAttendanceSession,
  useFinalizeAttendance,
  useResolveTwinReview,
  useUpdateAttendance,
} from '@/hooks/useAttendance';
import { palette, radius, spacing, useResponsive } from '@/theme';
import { useAuthStore } from '@/store/authStore';
import { attendanceService } from '@/services';
import type {
  AttendanceRecord,
  AttendanceStatus,
  TwinResolution,
  TwinReview,
} from '@/types';
import { groupRecordsByClass, isMultiClass } from '@/utils/attendanceGrouping';
import { formatShortDate, formatTime } from '@/utils/datetime';

type RosterFilter = AttendanceStatus | 'ALL';

const FILTERS: FilterChipOption<RosterFilter>[] = [
  { value: 'ALL', label: 'All' },
  { value: 'REVIEW', label: 'Needs review' },
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'UNKNOWN', label: 'Undetermined' },
];

/**
 * Attendance results, review and finalization.
 *
 * Implements the Stitch Attendance Results screen for mobile. The desktop five-column table
 * with hover actions and pagination becomes a virtualised `FlatList` of stacked rows with
 * explicit Resolve buttons; the summary bento grid keeps its Stitch treatment but reflows
 * two-up, and gains a distinct Undetermined tile.
 *
 * This screen is also the post-finalization editing surface. Nothing here branches on
 * `FINALIZED` to disable editing — a finalized session shows a "Finalized" state and keeps
 * every control live, because the brief is explicit that finalizing must not imply a lock.
 * The same code path therefore serves Phase 6's Attendance History → Detail → Edit flow.
 */
export default function ResultsScreen() {
  const { classId, sessionId } = useLocalSearchParams<{
    classId: string;
    sessionId: string;
  }>();

  const insets = useSafeAreaInsets();
  const { screenPadding, isExpanded } = useResponsive();
  const toast = useToast();
  const readOnly = useAuthStore((state) => state.user?.role === 'ADMIN');

  const { data: session, isLoading, error, refetch, isRefetching } =
    useAttendanceSession(sessionId);

  const updateAttendance = useUpdateAttendance();
  const resolveTwin = useResolveTwinReview();
  const finalize = useFinalizeAttendance();

  const [filter, setFilter] = useState<RosterFilter>('ALL');
  /** Class id, or ALL_CLASSES. Only surfaced for combined sessions. */
  const [classFilter, setClassFilter] = useState<string>('ALL_CLASSES');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [activeTwin, setActiveTwin] = useState<TwinReview | null>(null);
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);
  const [showFinalize, setShowFinalize] = useState(false);
  const [showPhoto, setShowPhoto] = useState(true);

  /**
   * Progress through a run of consecutive twin reviews.
   *
   * `total` is captured when the run starts rather than recomputed per case, so the label
   * reads a stable "2 of 3" instead of counting down as cases leave the open set.
   */
  const [chain, setChain] = useState<{ total: number; index: number } | null>(null);

  /** A status change on a finalized session, held while a reason is captured. */
  const [pendingAmend, setPendingAmend] = useState<{
    record: AttendanceRecord;
    status: AttendanceStatus;
  } | null>(null);

  const isFinalized = session?.status === 'FINALIZED';

  const unresolvedCount = useMemo(
    () => (session?.records ?? []).filter((r) => r.reviewRequired).length,
    [session?.records],
  );

  const openTwinReviews = useMemo(
    () => (session?.twinReviews ?? []).filter((t) => t.resolution === null),
    [session?.twinReviews],
  );

  const multiClass = session ? isMultiClass(session) : false;

  /** Per-class breakdown, in selection order. Empty for a single-class session. */
  const classGroups = useMemo(
    () => (session && multiClass ? groupRecordsByClass(session) : []),
    [session, multiClass],
  );

  const classFilterOptions = useMemo<FilterChipOption<string>[]>(
    () => [
      { value: 'ALL_CLASSES', label: 'All classes' },
      ...(session?.classes ?? []).map((c) => ({ value: c.id, label: c.displayCode })),
    ],
    [session?.classes],
  );

  const visibleRecords = useMemo(() => {
    let rows = session?.records ?? [];

    // Class filter first — it is the coarser cut, and on a combined session it is what the
    // lecturer reaches for before narrowing by status.
    if (classFilter !== 'ALL_CLASSES') rows = rows.filter((r) => r.classId === classFilter);

    if (filter !== 'ALL') rows = rows.filter((r) => r.status === filter);

    const needle = search.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(
        (r) =>
          r.studentName.toLowerCase().includes(needle) ||
          r.rollNumber.toLowerCase().includes(needle),
      );
    }

    // Surface anything needing attention first — that is the work to be done.
    return [...rows].sort((a, b) => {
      const weight = (r: AttendanceRecord): number => (r.reviewRequired ? 0 : 1);
      const diff = weight(a) - weight(b);
      return diff !== 0 ? diff : a.rollNumber.localeCompare(b.rollNumber);
    });
  }, [session?.records, filter, search, classFilter]);

  /* ---------------------------------------------------------------- *
   * Actions
   * ---------------------------------------------------------------- */

  /** Applies a status change, optionally with an amendment reason. */
  const commitStatusChange = useCallback(
    async (record: AttendanceRecord, status: AttendanceStatus, reason?: string): Promise<void> => {
      try {
        await updateAttendance.mutateAsync({
          recordId: record.id,
          status,
          ...(reason ? { reason } : {}),
        });
        toast.show({
          message: `${record.studentName} marked ${status.toLowerCase()}`,
          tone: 'success',
        });
      } catch (caught) {
        toast.show({
          message: isApiError(caught) ? caught.message : 'Could not save that change.',
          tone: 'error',
        });
      }
    },
    [updateAttendance, toast],
  );

  /**
   * Handles a status choice from the edit sheet.
   *
   * On a draft session the change applies immediately — the lecturer is still working through
   * results and a justification prompt would just be friction. On a finalized session the
   * change is an amendment to a recorded document, so it routes through the reason sheet first.
   */
  const handleStatusChange = useCallback(
    (status: AttendanceStatus): void => {
      if (!editing) return;
      const record = editing;
      setEditing(null);

      if (isFinalized) {
        setPendingAmend({ record, status });
        return;
      }

      void commitStatusChange(record, status);
    },
    [editing, isFinalized, commitStatusChange],
  );

  const handleAmendConfirm = useCallback(
    (reason: string): void => {
      if (!pendingAmend) return;
      const { record, status } = pendingAmend;
      setPendingAmend(null);
      void commitStatusChange(record, status, reason);
    },
    [pendingAmend, commitStatusChange],
  );

  /** Opens a run of reviews starting at `first`. */
  const startTwinChain = useCallback((first: TwinReview, total: number) => {
    setActiveTwin(first);
    setChain({ total, index: 1 });
  }, []);

  const endTwinChain = useCallback(() => {
    setActiveTwin(null);
    setChain(null);
  }, []);

  /**
   * Records a decision and, when `advance` is set, moves straight to the next open case.
   *
   * Chaining matters because reviews arrive in small clusters — twins are usually enrolled in
   * the same class, so a session with one ambiguous pair often has two or three. Bouncing back
   * to a 48-row list between each one makes the lecturer re-find the next case every time.
   *
   * The next case is taken from the *updated* session returned by the mutation, filtered to
   * `resolution === null`. That excludes the case just handled — including a deferral, which
   * is recorded as DEFERRED and so leaves the open set even though both records stay REVIEW.
   * Without that, deferring would re-present the same case forever.
   *
   * Per-case toasts are suppressed mid-run: on iOS a React Native `Modal` is a separate native
   * window, so a toast fired while the next case is opening would render behind it and never
   * be seen. The advancing modal and its "2 of 3" label are the feedback during a run; a
   * single summary toast fires when the run ends.
   */
  const handleTwinResolution = useCallback(
    async (resolution: TwinResolution, advance = true): Promise<void> => {
      if (!activeTwin) return;
      const review = activeTwin;

      const describe = (): string => {
        if (resolution === 'DEFERRED') {
          return 'Left for later — both students still need review';
        }
        if (resolution === 'BOTH_PRESENT') return 'Both students marked present';
        return `Only ${resolution === 'ONLY_A' ? review.studentA.name : review.studentB.name} marked present`;
      };

      try {
        const updated = await resolveTwin.mutateAsync({ reviewId: review.id, resolution });

        const remaining = updated.twinReviews.filter((t) => t.resolution === null);

        if (advance && remaining.length > 0) {
          const next = remaining[0]!;
          setActiveTwin(next);
          setChain((current) =>
            current
              ? { ...current, index: current.index + 1 }
              : { total: remaining.length + 1, index: 2 },
          );
          return;
        }

        endTwinChain();

        // Summary once the run is over. Distinguishes "all done" from "some still open", since
        // a run of deferrals leaves work outstanding and the user should know.
        if (remaining.length === 0) {
          toast.show({
            message:
              chain && chain.total > 1
                ? 'All ambiguous matches reviewed'
                : describe(),
            tone: resolution === 'DEFERRED' ? 'info' : 'success',
          });
        } else {
          toast.show({
            message: `${remaining.length} ${remaining.length === 1 ? 'match' : 'matches'} still need review`,
            tone: 'info',
          });
        }
      } catch (caught) {
        endTwinChain();
        toast.show({
          message: isApiError(caught) ? caught.message : 'Could not save that decision.',
          tone: 'error',
        });
      }
    },
    [activeTwin, resolveTwin, toast, chain, endTwinChain],
  );

  const handleResolve = useCallback(
    (record: AttendanceRecord) => {
      // Twin cases open the comparison directly; everything else uses the status sheet.
      if (record.reviewReason === 'TWIN_AMBIGUITY') {
        const match = openTwinReviews.find(
          (t) =>
            t.studentA.studentId === record.studentId ||
            t.studentB.studentId === record.studentId,
        );
        if (match) {
          // Opened from a specific row, so start the run at that case and count the rest.
          const position = openTwinReviews.indexOf(match);
          setActiveTwin(match);
          setChain({ total: openTwinReviews.length, index: position + 1 });
          return;
        }
      }
      setEditing(record);
    },
    [openTwinReviews],
  );

  const handleFinalize = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    setShowFinalize(false);

    try {
      await finalize.mutateAsync({
        sessionId,
        // Required by the service when reviews remain open, so finalizing an incomplete
        // register is always a deliberate act.
        acknowledgeUnresolvedReviews: unresolvedCount > 0,
      });
      toast.show({ message: 'Attendance finalized', tone: 'success' });
    } catch (caught) {
      toast.show({
        message: isApiError(caught) ? caught.message : 'Could not finalize attendance.',
        tone: 'error',
      });
    }
  }, [sessionId, finalize, unresolvedCount, toast]);

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  const header = (
    <AppHeader
      title={isFinalized ? 'Attendance record' : 'Attendance generated'}
      {...(session
        ? { subtitle: `${session.classDisplayCode} · ${formatShortDate(session.capturedAt)}` }
        : {})}
      onBack={() => router.back()}
      actions={[
        {
          icon: showPhoto ? 'hidden' : 'photo',
          accessibilityLabel: showPhoto ? 'Hide classroom photo' : 'Show classroom photo',
          onPress: () => setShowPhoto((v) => !v),
        },
      ]}
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <View style={styles.centre}>
          <LoadingState message="Loading attendance…" />
        </View>
      </>
    );
  }

  if (error || !session) {
    return (
      <>
        {header}
        <View style={styles.centre}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </View>
      </>
    );
  }

  const listHeader = (
    <View style={styles.listHeader}>
      {/*
        Finalized banner.

        States the finalized fact and, crucially, offers Edit Attendance right beside it. A
        lecturer who believes finalizing locks the register will avoid finalizing at all, which
        leaves sessions open indefinitely — so the edit route has to be visible here, not
        discovered by guessing that rows are still tappable.
      */}
      {isFinalized ? (
        <View style={styles.finalizedBanner}>
          <View style={styles.finalizedTop}>
            <Icon name="finalize" size={20} color={palette.secondary} />
            <View style={styles.flexText}>
              <Text variant="titleLg" color={palette.secondary}>
                Attendance finalized
              </Text>
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                Recorded {session.finalizedAt ? formatTime(session.finalizedAt) : ''}. This
                register can still be corrected.
              </Text>
            </View>
          </View>

          <View style={styles.finalizedActions}>
            <Button
              label="Edit attendance"
              icon="edit"
              variant="secondary"
              onPress={() => {
                // Focus the roster on what is most likely to need correcting, then let the
                // lecturer tap any student.
                setFilter('ALL');
                setSearch('');
                toast.show({
                  message: 'Tap any student to change their attendance',
                  tone: 'info',
                });
              }}
              style={styles.finalizedAction}
            />
            <Button
              label="Change history"
              icon="audit"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/attendance/[classId]/audit',
                  params: { classId: classId ?? session.classId, sessionId: session.id },
                })
              }
              style={styles.finalizedAction}
            />
          </View>
        </View>
      ) : null}

      {showPhoto ? (
        <ClassroomPhotoViewer
          photoUri={session.photoUri}
          photoWidth={session.photoWidth}
          photoHeight={session.photoHeight}
          records={session.records}
          focusedRecordId={focusedRecordId}
          onSelectRecord={(record) => {
            setFocusedRecordId(record.id);
            setEditing(record);
          }}
          caption={`Captured ${formatTime(session.capturedAt)}`}
        />
      ) : null}

      {/* Non-fatal warnings from the pipeline. */}
      {session.warnings.length > 0 ? (
        <View style={styles.warnings}>
          {session.warnings.map((warning) => (
            <View
              key={warning.code}
              style={[
                styles.warning,
                warning.severity === 'WARNING' ? styles.warningStrong : null,
              ]}
            >
              <Icon
                name={warning.severity === 'WARNING' ? 'warning' : 'info'}
                size={16}
                color={
                  warning.severity === 'WARNING'
                    ? palette.onTertiaryFixedVariant
                    : palette.primary
                }
              />
              <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.flexText}>
                {warning.message}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Session scope, for combined sessions. */}
      {multiClass ? (
        <View style={styles.scopeCard}>
          <View style={styles.scopeHeader}>
            <Icon name="classes" size={18} color={palette.primary} />
            <Text variant="titleLg" color={palette.onSurface} style={styles.flexText}>
              {session.classes.length} classes · {session.summary.total} students
            </Text>
          </View>

          {/* Per-class reconciliation. Totals here sum to the overall figures above. */}
          {classGroups.map((group) => (
            <View key={group.class.id} style={styles.scopeRow}>
              <ClassCodeTag code={group.class.displayCode} />
              <Text variant="bodyMd" color={palette.onSurface} numberOfLines={1} style={styles.flexText}>
                {group.class.subject}
              </Text>
              <Text variant="labelMd" color={palette.secondary}>
                {group.summary.present} present
              </Text>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                / {group.summary.total}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <AttendanceSummaryCard
        summary={session.summary}
        activeFilter={filter}
        onPressStatus={(status) => setFilter((current) => (current === status ? 'ALL' : status))}
      />

      {/* Open twin cases get a prominent, dedicated entry point. */}
      {openTwinReviews.length > 0 ? (
        <Card style={styles.twinPrompt}>
          <View style={styles.twinPromptHeader}>
            <Icon name="twin" size={20} color={palette.onTertiaryFixedVariant} />
            <Text variant="titleLg" color={palette.onTertiaryFixedVariant} style={styles.flexText}>
              {openTwinReviews.length === 1
                ? '1 ambiguous match'
                : `${openTwinReviews.length} ambiguous matches`}
            </Text>
          </View>
          <Text variant="bodyMd" color={palette.onSurfaceVariant}>
            Some students could not be told apart. Compare them side by side to decide.
          </Text>
          <Button
            label={
              openTwinReviews.length === 1
                ? 'Review match'
                : `Review all ${openTwinReviews.length}`
            }
            icon="twin"
            fullWidth
            onPress={() => {
              const first = openTwinReviews[0];
              if (first) startTwinChain(first, openTwinReviews.length);
            }}
            style={styles.twinPromptButton}
          />
        </Card>
      ) : null}

      {/* Roster controls */}
      <View style={styles.controls}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or roll number"
        />

        {/* Class chips appear only for combined sessions, above the status chips. */}
        {multiClass ? (
          <FilterChips
            options={classFilterOptions}
            selected={classFilter}
            onSelect={setClassFilter}
            contentInset={screenPadding}
          />
        ) : null}

        <FilterChips
          options={FILTERS}
          selected={filter}
          onSelect={setFilter}
          contentInset={screenPadding}
        />
        <View style={styles.countRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Showing {visibleRecords.length} of {session.summary.total}
          </Text>
          {unresolvedCount > 0 ? (
            <Badge
              label={`${unresolvedCount} to resolve`}
              background={palette.tertiaryFixed}
              foreground={palette.onTertiaryFixedVariant}
              border={palette.tertiaryFixedDim}
              icon="review"
            />
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <>
      {header}

      <FlatList
        data={visibleRecords}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <StudentListItem
            record={item}
            onPress={readOnly ? undefined : setEditing}
            onResolve={readOnly ? undefined : handleResolve}
            showConfidence={!isFinalized}
          />
        )}
        ItemSeparatorComponent={null}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Card>
              <EmptyState
                icon="search"
                title="No students match"
                message="Try a different search or filter."
                actionLabel="Clear filters"
                onAction={() => {
                  setSearch('');
                  setFilter('ALL');
                }}
              />
            </Card>
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 144 },
          isExpanded && styles.listConstrained,
        ]}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        showsVerticalScrollIndicator={false}
        // Rosters run to 60+ rows; a small window keeps memory flat and scrolling smooth.
        initialNumToRender={12}
        windowSize={9}
        maxToRenderPerBatch={10}
        removeClippedSubviews
      />

      {/* Sticky primary action */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.exportBar}>
          {(['csv', 'xlsx', 'pdf', 'json'] as const).map((format) => (
            <Button key={format} label={format.toUpperCase()} variant="ghost" size="sm" onPress={() => void attendanceService.downloadSession(sessionId, format).catch(() => toast.show({ message: 'Could not download the export.', tone: 'error' }))} />
          ))}
        </View>
        <Button
          label={isFinalized || readOnly ? 'Done' : 'Finalize attendance'}
          icon={isFinalized || readOnly ? 'present' : 'finalize'}
          size="lg"
          fullWidth
          loading={finalize.isPending}
          onPress={() => (isFinalized || readOnly ? router.dismissAll() : setShowFinalize(true))}
          accessibilityHint={
            isFinalized || readOnly
              ? 'Closes the attendance flow'
              : 'Opens a confirmation before recording attendance'
          }
        />
      </View>

      {/* Overlays */}
      <StatusEditSheet
        record={editing}
        visible={editing !== null}
        submitting={updateAttendance.isPending}
        finalized={isFinalized}
        onSelect={handleStatusChange}
        onDismiss={() => setEditing(null)}
        {...(editing?.reviewReason === 'TWIN_AMBIGUITY'
          ? {
              onOpenTwinReview: () => {
                const match = openTwinReviews.find(
                  (t) =>
                    t.studentA.studentId === editing.studentId ||
                    t.studentB.studentId === editing.studentId,
                );
                setEditing(null);
                if (match) {
                  startTwinChain(match, openTwinReviews.length);
                }
              },
            }
          : {})}
      />

      <TwinReviewModal
        review={activeTwin}
        visible={activeTwin !== null}
        submitting={resolveTwin.isPending}
        // An explicit action advances to the next open case, so a cluster of ambiguous
        // matches is cleared in one pass.
        onResolve={(resolution) => void handleTwinResolution(resolution, true)}
        // Hardware back / backdrop leaves the run entirely. The current case is still recorded
        // as DEFERRED so nothing is chosen on the user's behalf, but remaining cases are left
        // for later rather than being forced through one at a time.
        onDismiss={() => void handleTwinResolution('DEFERRED', false)}
        {...(chain && chain.total > 1
          ? { positionLabel: `${chain.index} of ${chain.total}` }
          : {})}
      />

      <AmendReasonSheet
        visible={pendingAmend !== null}
        record={pendingAmend?.record ?? null}
        nextStatus={pendingAmend?.status ?? null}
        submitting={updateAttendance.isPending}
        onConfirm={handleAmendConfirm}
        onCancel={() => setPendingAmend(null)}
      />

      <FinalizeModal
        visible={showFinalize}
        summary={session.summary}
        unresolvedCount={unresolvedCount}
        submitting={finalize.isPending}
        onConfirm={() => void handleFinalize()}
        onCancel={() => setShowFinalize(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    backgroundColor: palette.surfaceContainerLow,
  },
  listContent: {
    backgroundColor: palette.surfaceContainerLow,
  },
  listConstrained: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  listHeader: {
    gap: spacing.md,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  finalizedBanner: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: palette.secondaryContainer,
  },
  finalizedTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  finalizedActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  finalizedAction: {
    flex: 1,
  },
  warnings: {
    gap: spacing.xs,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainer,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  warningStrong: {
    backgroundColor: palette.tertiaryFixed,
    borderColor: palette.tertiaryFixedDim,
  },
  twinPrompt: {
    backgroundColor: palette.tertiaryFixed,
    borderColor: palette.tertiaryFixedDim,
    gap: spacing.xs,
  },
  twinPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  twinPromptButton: {
    marginTop: spacing.sm,
  },
  controls: {
    gap: spacing.sm,
  },
  scopeCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: palette.surfaceContainerLowest,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: palette.outlineVariant,
  },
  scopeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: palette.outlineVariant,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  emptyWrap: {
    paddingHorizontal: spacing.screen,
  },
  flexText: {
    flex: 1,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.sm,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: palette.outlineVariant,
  },
  exportBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
});
