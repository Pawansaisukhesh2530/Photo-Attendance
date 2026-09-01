import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Badge,
  Card,
  ClassCodeTag,
  EmptyState,
  ErrorState,
  FilterChips,
  Icon,
  SearchField,
  SessionHistoryRow,
  SkeletonCard,
  SkeletonListItem,
  Text,
  type FilterChipOption,
} from '@/components';
import { useAttendanceHistory } from '@/hooks/useAttendance';
import { useClass } from '@/hooks/useClasses';
import { palette, radius, spacing, useResponsive } from '@/theme';
import type { AttendanceSessionSummary, SessionStatus } from '@/types';
import {
  groupSessionsByDate,
  searchSessions,
  summariseHistory,
} from '@/utils/historyGrouping';

/**
 * Status facets.
 *
 * "Needs review" maps to PENDING_REVIEW rather than a client-side scan, because that is the state
 * a lecturer opens this screen to find — unfinished work.
 */
type HistoryFilter = 'ALL' | 'PENDING_REVIEW' | 'FINALIZED';

const FILTERS: FilterChipOption<HistoryFilter>[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING_REVIEW', label: 'Needs review' },
  { value: 'FINALIZED', label: 'Finalized' },
];

const SERVICE_STATUS: Record<HistoryFilter, SessionStatus | undefined> = {
  ALL: undefined,
  PENDING_REVIEW: 'PENDING_REVIEW',
  FINALIZED: 'FINALIZED',
};

/**
 * Attendance history.
 *
 * The entry point to reviewing and correcting past sessions. Tapping a session opens the existing
 * results screen, which already handles the finalized state, per-student editing, amendment reasons
 * and the audit trail — so this deliberately does not introduce a second, near-identical detail
 * screen. History is the missing *route in*, not a new surface.
 *
 * No Stitch screen exists for this. It extends the dashboard's Recent Activity panel, reusing
 * `SessionHistoryRow` verbatim so a session looks identical wherever it appears.
 *
 * Accepts an optional `classId` param, so "View all" from Class Detail lands here already scoped,
 * with a removable filter chip making that scope visible rather than mysterious.
 */
export default function HistoryScreen() {
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  const { screenPadding } = useResponsive();

  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [search, setSearch] = useState('');
  const [scopedClassId, setScopedClassId] = useState<string | undefined>(classId);

  const { data: scopedClass } = useClass(scopedClassId);

  const query = useMemo(
    () => ({
      ...(scopedClassId ? { classId: scopedClassId } : {}),
      ...(SERVICE_STATUS[filter] ? { status: SERVICE_STATUS[filter] } : {}),
    }),
    [scopedClassId, filter],
  );

  const { data, isLoading, isRefetching, error, refetch } = useAttendanceHistory(
    Object.keys(query).length > 0 ? query : undefined,
  );

  // Search stays client-side: it is a text match over already-fetched rows, and round-tripping
  // every keystroke would make typing feel laggy.
  const visible = useMemo(() => searchSessions(data ?? [], search), [data, search]);

  const sections = useMemo(() => groupSessionsByDate(visible), [visible]);
  const stats = useMemo(() => summariseHistory(visible), [visible]);

  const openSession = useCallback((session: AttendanceSessionSummary) => {
    router.push({
      pathname: '/attendance/[classId]/results',
      params: { classId: session.classId, sessionId: session.id },
    });
  }, []);

  const hasFilters = filter !== 'ALL' || search.trim().length > 0 || Boolean(scopedClassId);

  const clearAll = useCallback(() => {
    setFilter('ALL');
    setSearch('');
    setScopedClassId(undefined);
  }, []);

  const header = (
    <AppHeader
      title="Attendance History"
      subtitle={
        scopedClass ? scopedClass.displayCode : 'Review and correct past sessions'
      }
      {...(classId ? { onBack: () => router.back() } : {})}
    />
  );

  if (error && !isLoading) {
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
      {/* Aggregate strip. Gives the list a sense of scale before any row is read. */}
      {!isLoading && stats.sessionCount > 0 ? (
        <Card style={styles.statsCard} padded={false}>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text variant="headlineSm" color={palette.onSurface}>
                {stats.sessionCount}
              </Text>
              <Text variant="labelMd" color={palette.onSurfaceVariant} align="center">
                SESSIONS
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.stat}>
              <Text variant="headlineSm" color={palette.onSurface}>
                {stats.averagePercentage === null ? '--' : `${stats.averagePercentage}%`}
              </Text>
              <Text variant="labelMd" color={palette.onSurfaceVariant} align="center">
                AVERAGE
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.stat}>
              <Text
                variant="headlineSm"
                color={
                  stats.pendingReviews > 0 ? palette.onTertiaryFixedVariant : palette.onSurface
                }
              >
                {stats.pendingReviews}
              </Text>
              <Text variant="labelMd" color={palette.onSurfaceVariant} align="center">
                TO REVIEW
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {/* Outstanding work gets a prompt, since it is the reason to open this screen. */}
      {stats.openCount > 0 && filter !== 'PENDING_REVIEW' ? (
        <Card style={styles.openPrompt}>
          <View style={styles.openPromptRow}>
            <Icon name="review" size={18} color={palette.onTertiaryFixedVariant} />
            <Text
              variant="bodyMd"
              color={palette.onTertiaryFixedVariant}
              style={styles.flex}
            >
              {stats.openCount === 1
                ? '1 session is not finalized yet'
                : `${stats.openCount} sessions are not finalized yet`}
            </Text>
            <Text
              variant="labelMd"
              color={palette.primary}
              onPress={() => setFilter('PENDING_REVIEW')}
              accessibilityRole="button"
            >
              Show
            </Text>
          </View>
        </Card>
      ) : null}

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search subject or class code"
      />

      <FilterChips
        options={FILTERS}
        selected={filter}
        onSelect={setFilter}
        contentInset={screenPadding}
      />

      {/* Class scope, when arrived at from Class Detail. Removable, so the user is never stuck. */}
      {scopedClassId ? (
        <View style={styles.scopeRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Filtered to
          </Text>
          <ClassCodeTag code={scopedClass?.displayCode ?? scopedClassId} />
          <Text
            variant="labelMd"
            color={palette.primary}
            onPress={() => setScopedClassId(undefined)}
            accessibilityRole="button"
            accessibilityLabel="Show all classes"
          >
            Show all
          </Text>
        </View>
      ) : null}

      {!isLoading ? (
        <View style={styles.countRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {visible.length} {visible.length === 1 ? 'session' : 'sessions'}
          </Text>
          {stats.lowAttendanceCount > 0 ? (
            <Badge
              label={`${stats.lowAttendanceCount} below threshold`}
              background={palette.errorContainer}
              foreground={palette.onErrorContainer}
              border={palette.errorContainer}
              icon="warning"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (isLoading) {
    return (
      <>
        {header}
        <View style={[styles.loading, { paddingHorizontal: screenPadding }]}>
          <SkeletonCard height={78} />
          <SkeletonCard height={48} />
          <Card padded={false} style={styles.skeletonCard}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </Card>
        </View>
      </>
    );
  }

  return (
    <>
      {header}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { paddingHorizontal: screenPadding }]}>
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              {section.title.toUpperCase()}
            </Text>
            <View style={styles.sectionRule} />
            <Text variant="labelMd" color={palette.outline}>
              {section.data.length}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={[styles.rowWrap, { marginHorizontal: screenPadding }]}>
            <SessionHistoryRow
              session={item}
              onPress={openSession}
              last={index === section.data.length - 1}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ marginHorizontal: screenPadding }}>
            <Card>
              {hasFilters ? (
                <EmptyState
                  icon="search"
                  title="No sessions match"
                  message="Try a different search, class or status filter."
                  actionLabel="Clear filters"
                  onAction={clearAll}
                />
              ) : (
                <EmptyState
                  icon="history"
                  title="No attendance yet"
                  message="Sessions you record will appear here, grouped by date. You can reopen and correct any of them, including finalized ones."
                  actionLabel="Go to today's classes"
                  onAction={() => router.push('/(faculty)/dashboard')}
                />
              )}
            </Card>
          </View>
        }
        contentContainerStyle={styles.listContent}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        // Rows are compact but history grows without bound, so keep the window small.
        initialNumToRender={12}
        windowSize={9}
        removeClippedSubviews
      />
    </>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    backgroundColor: palette.surfaceContainerLow,
  },
  loading: {
    flex: 1,
    gap: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: palette.surfaceContainerLow,
  },
  skeletonCard: {
    padding: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xl,
    backgroundColor: palette.surfaceContainerLow,
  },
  listHeader: {
    gap: spacing.sm,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  statsCard: {
    marginBottom: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: palette.outlineVariant,
    marginVertical: spacing.sm,
  },
  openPrompt: {
    backgroundColor: palette.tertiaryFixed,
    borderColor: palette.tertiaryFixedDim,
  },
  openPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: palette.outlineVariant,
  },
  rowWrap: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: palette.surfaceContainerLowest,
  },
});
