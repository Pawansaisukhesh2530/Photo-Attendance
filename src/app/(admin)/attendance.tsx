import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AdminPagedList,
  AdminScaffold,
  Badge,
  ClassCodeTag,
  DataTableRow,
  FilterChips,
  SearchField,
  SessionHistoryRow,
  Text,
  type DataColumn,
  type FilterChipOption,
} from '@/components';
import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { useInfiniteAttendanceHistory } from '@/hooks/useAttendance';
import { useInfiniteClasses } from '@/hooks/useClassAdmin';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, spacing, useResponsive } from '@/theme';
import type { AttendanceSessionSummary, SessionStatus } from '@/types';
import { formatRelativeDay, formatTime } from '@/utils/datetime';

type StatusFilter = 'ALL' | SessionStatus | 'PENDING';

/**
 * Attendance oversight.
 *
 * Every recorded session across the institution, paged. Uses `getPagedAttendanceHistory`, which is
 * additive — the faculty History screen still uses the unpaged method and is unchanged.
 *
 * Opening a session goes to the existing results screen. There is deliberately no second
 * attendance-results implementation: an administrator inspecting a register must see exactly what
 * the lecturer saw, including which classes were in scope for a multi-class capture, the REVIEW and
 * UNKNOWN states, and the AI-versus-final comparison. Admin gets no privileged path around review,
 * finalization or audit.
 */
export default function AdminAttendanceScreen() {
  const params = useLocalSearchParams<{
    q?: string;
    classId?: string;
    status?: string;
    pending?: string;
  }>();
  const { isExpanded, screenPadding } = useResponsive();
  const { data: settings } = useInstitutionSettings();

  const search = params.q ?? '';
  const classId = params.classId && params.classId.length > 0 ? params.classId : undefined;
  const pendingOnly = params.pending === '1';
  const status: StatusFilter =
    params.status === 'FINALIZED' || params.status === 'READY' || params.status === 'PENDING_REVIEW'
      ? params.status
      : 'ALL';

  const setParam = useCallback(
    (key: 'q' | 'classId' | 'status' | 'pending', value: string) => {
      router.setParams({ [key]: value });
    },
    [],
  );

  const debouncedSearch = useDebouncedValue(search.trim());

  const { data: classPages } = useInfiniteClasses({ pageSize: 100 });
  const allClasses = useMemo(
    () => (classPages?.pages ?? []).flatMap((p) => p.items),
    [classPages],
  );
  const scopedClass = allClasses.find((c) => c.id === classId);

  const query = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(classId ? { classId } : {}),
      ...(status !== 'ALL' ? { status: status as SessionStatus } : {}),
      ...(pendingOnly ? { pendingReviewOnly: true } : {}),
    }),
    [debouncedSearch, classId, status, pendingOnly],
  );

  const {
    data,
    isLoading,
    isRefetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteAttendanceHistory(Object.keys(query).length > 0 ? query : undefined);

  const rows = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data]);
  const total = data?.pages[data.pages.length - 1]?.total ?? 0;
  const pageSize = data?.pages[0]?.pageSize ?? DEFAULT_PAGE_SIZE;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const openSession = useCallback((session: AttendanceSessionSummary) => {
    router.push({
      pathname: '/attendance/[classId]/results',
      params: { classId: session.classId, sessionId: session.id },
    });
  }, []);

  const hasFilters =
    search.trim().length > 0 || Boolean(classId) || status !== 'ALL' || pendingOnly;
  const clearFilters = useCallback(() => {
    router.setParams({ q: '', classId: '', status: '', pending: '' });
  }, []);

  const classOptions = useMemo<FilterChipOption<string>[]>(
    () => [
      { value: 'ALL', label: 'All classes' },
      ...allClasses.slice(0, 30).map((c) => ({ value: c.id, label: c.displayCode })),
    ],
    [allClasses],
  );

  const columns = useMemo<DataColumn<AttendanceSessionSummary>[]>(
    () => [
      {
        key: 'class',
        header: 'Class',
        flex: 2.6,
        render: (row) => (
          <View style={styles.classCell}>
            <ClassCodeTag code={row.classDisplayCode} />
            <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1} style={styles.flex}>
              {row.className}
            </Text>
            {row.classCount > 1 ? <Badge label={`+${row.classCount - 1}`} icon="classes" /> : null}
          </View>
        ),
      },
      {
        key: 'when',
        header: 'Captured',
        flex: 1.6,
        render: (row) => (
          <View>
            <Text variant="bodyMd" color={palette.onSurface}>
              {formatRelativeDay(row.date)}
            </Text>
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              {formatTime(row.capturedAt)}
            </Text>
          </View>
        ),
      },
      {
        key: 'present',
        header: 'Present',
        flex: 1.2,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurface}>
            {row.summary.present}/{row.summary.total}
          </Text>
        ),
      },
      {
        key: 'review',
        header: 'Review',
        flex: 1,
        minWidth: 1180,
        render: (row) =>
          row.summary.review > 0 ? (
            <Badge
              label={String(row.summary.review)}
              icon="review"
              background={palette.tertiaryFixed}
              foreground={palette.onTertiaryFixedVariant}
              border={palette.tertiaryFixedDim}
            />
          ) : (
            <Text variant="bodyMd" color={palette.outline}>
              —
            </Text>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        flex: 1.5,
        render: (row) =>
          row.status === 'FINALIZED' ? (
            <Badge
              label="Finalized"
              icon="finalize"
              background={palette.secondaryContainer}
              foreground={palette.onSecondaryContainer}
              border={palette.secondaryContainer}
            />
          ) : row.status === 'PENDING_REVIEW' ? (
            <Badge
              label="Pending review"
              icon="review"
              background={palette.tertiaryFixed}
              foreground={palette.onTertiaryFixedVariant}
              border={palette.tertiaryFixedDim}
            />
          ) : (
            <Badge label={row.status.replace(/_/g, ' ').toLowerCase()} />
          ),
      },
      {
        key: 'edits',
        header: 'Edited',
        flex: 0.9,
        align: 'right',
        minWidth: 1320,
        render: (row) => (
          <Text variant="bodyMd" color={row.hasManualEdits ? palette.onSurface : palette.outline}>
            {row.hasManualEdits ? 'Yes' : '—'}
          </Text>
        ),
      },
    ],
    [],
  );

  return (
    <AdminScaffold
      active="attendance"
      title="Attendance"
      subtitle={
        scopedClass
          ? `${scopedClass.displayCode} · ${total} sessions`
          : `${total} recorded ${total === 1 ? 'session' : 'sessions'}`
      }
      breadcrumbs={[
        { label: 'Administration', href: '/(admin)/dashboard' },
        { label: 'Attendance' },
      ]}
      onBack={isExpanded ? undefined : () => router.back()}
      {...(settings
        ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
        : {})}
    >
      <AdminPagedList<AttendanceSessionSummary>
        rows={rows}
        total={total}
        pageSize={pageSize}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        isRefetching={isRefetching}
        error={error}
        onRetry={() => void refetch()}
        onRefresh={() => void refetch()}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={isFetchNextPageError}
        onEndReached={loadMore}
        onRetryNextPage={() => void fetchNextPage()}
        noun="sessions"
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyIcon="history"
        emptyTitle="No attendance recorded"
        emptyMessage="Sessions appear here as lecturers capture their classes."
        filteredEmptyTitle="No sessions match"
        filteredEmptyMessage="Try a different class, status or search."
        columns={columns}
        renderTableRow={(row, index, width) => (
          <DataTableRow
            row={row}
            columns={columns}
            width={width}
            onPress={openSession}
            last={index === rows.length - 1}
            accessibilityLabel={`${row.className}, ${row.classDisplayCode}, ${formatRelativeDay(row.date)}, ${row.summary.present} of ${row.summary.total} present, ${row.status.replace(/_/g, ' ').toLowerCase()}`}
          />
        )}
        renderCard={(row, index) => (
          <View style={styles.rowWrap}>
            <SessionHistoryRow
              session={row}
              onPress={openSession}
              last={index === rows.length - 1}
            />
          </View>
        )}
        filters={
          <>
            <SearchField
              value={search}
              onChangeText={(value) => setParam('q', value)}
              placeholder="Search class, code or lecturer"
            />

            <FilterChips
              options={[
                { value: 'ALL', label: 'All sessions' },
                { value: 'PENDING_REVIEW', label: 'Pending review' },
                { value: 'FINALIZED', label: 'Finalized' },
              ]}
              selected={status}
              onSelect={(value) => setParam('status', value === 'ALL' ? '' : value)}
              contentInset={screenPadding}
            />

            <FilterChips
              options={classOptions}
              selected={classId ?? 'ALL'}
              onSelect={(value) => setParam('classId', value === 'ALL' ? '' : value)}
              contentInset={screenPadding}
            />

            {pendingOnly ? (
              <View style={styles.noteRow}>
                <Text variant="labelMd" color={palette.onTertiaryFixedVariant} style={styles.flex}>
                  Showing only sessions with unresolved review cases.
                </Text>
                <Text
                  variant="labelMd"
                  color={palette.primary}
                  onPress={() => setParam('pending', '')}
                  accessibilityRole="button"
                  accessibilityLabel="Show all sessions"
                >
                  Clear
                </Text>
              </View>
            ) : null}
          </>
        }
      />
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  classCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  rowWrap: {
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: 16,
    overflow: 'hidden',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: palette.tertiaryFixed,
  },
  flex: {
    flex: 1,
  },
});
