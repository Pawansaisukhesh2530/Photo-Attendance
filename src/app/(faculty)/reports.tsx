import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import {
  AppHeader,
  AttendanceTrendChart,
  Badge,
  Card,
  ClassAttendanceBar,
  ClassCodeTag,
  EmptyState,
  ErrorState,
  FilterChips,
  Icon,
  MetricCard,
  ProgressRing,
  SectionHeader,
  SkeletonCard,
  SkeletonListItem,
  StudentStatRow,
  Text,
  type FilterChipOption,
} from '@/components';
import { useClasses } from '@/hooks/useClasses';
import { useInfiniteReportStudents, useReport } from '@/hooks/useReports';
import { palette, radius, spacing, useResponsive } from '@/theme';
import type { ClassAttendanceStat, StudentAttendanceStat } from '@/types';
import { formatShortDate } from '@/utils/datetime';
import {
  REPORT_RANGE_OPTIONS,
  resolveReportRange,
  toReportRangeKey,
  type ReportRangeKey,
} from '@/utils/reportRange';

/** Scope of the report: every assigned class, or one of them. */
type ScopeFilter = 'ALL' | string;

/** Which students the roll shows. */
type RollFilter = 'ALL' | 'LOW';

/**
 * Faculty reports.
 *
 * Read-only analytics over attendance already recorded. It adds no capture, no editing and no
 * authority over attendance data — every figure on screen is computed by `ReportService` and this
 * screen only formats it. Nothing here recomputes a percentage, because a second definition of
 * "attendance" would eventually disagree with the first.
 *
 * No Stitch screen exists for reports; the desktop design only names the destination in its sidebar
 * and offers a "Generate Report" button. So this extends the established mobile language — the same
 * `MetricCard` grid as Attendance Results, the same chip row as My Classes and Students, the same
 * amber `tertiary` pairing for below-threshold that Phase 7 established, and hand-drawn SVG for the
 * chart in the manner of `ProgressRing`.
 *
 * Structurally it is one `FlatList` whose data is the per-student roll, with the summary, chart,
 * class breakdown and low-attendance section in `ListHeaderComponent`. Two long lists stacked in a
 * ScrollView would nest virtualised lists — which React Native warns about and which loses
 * virtualisation entirely — so the roll owns the scroll and everything else rides above it.
 *
 * The threshold is always `report.threshold`, never the local `ATTENDANCE_THRESHOLD`. It is
 * institution policy that the backend owns, and hard-coding it here would put a number on screen
 * the server never agreed to.
 */
export default function ReportsScreen() {
  const { classId, range } = useLocalSearchParams<{ classId?: string; range?: string }>();
  const { screenPadding, isExpanded } = useResponsive();

  /*
   * Scope lives in the route, not in component state.
   *
   * Reports is a tab screen, so navigating to it from Class Detail does not remount it. Seeding
   * `useState` from the param therefore only worked the very first time: arriving from a second
   * class showed whichever scope was last selected, silently reporting the wrong class's figures.
   * Verified on device before this was changed.
   *
   * Deriving from the param instead makes the URL the single source of truth, so an incoming
   * `classId` always wins and repeat navigations to the same class behave identically to the first.
   */
  const scope: ScopeFilter = classId && classId.length > 0 ? classId : 'ALL';

  const setScope = useCallback((next: ScopeFilter) => {
    // Empty rather than undefined: `setParams` keeps the key, and '' reads back as "no scope".
    router.setParams({ classId: next === 'ALL' ? '' : next });
  }, []);

  /*
   * Reporting window, like the scope, lives in the URL rather than component state — same
   * tab-remount reasoning. The param stores the preset key, not the computed dates: "last 7 days"
   * must mean seven days from whenever the screen is opened, so the bounds are recomputed from the
   * key each render rather than frozen at selection time.
   */
  const rangeKey: ReportRangeKey = toReportRangeKey(range);
  const setRange = useCallback((next: ReportRangeKey) => {
    router.setParams({ range: next });
  }, []);

  const { from, to } = useMemo(() => resolveReportRange(rangeKey), [rangeKey]);

  // Ephemeral view state, not a navigable scope, so this stays local.
  const [roll, setRoll] = useState<RollFilter>('ALL');

  const { data: classes } = useClasses();

  const reportQuery = useMemo(() => {
    const query = {
      ...(scope === 'ALL' ? {} : { classId: scope }),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };
    return Object.keys(query).length > 0 ? query : undefined;
  }, [scope, from, to]);

  const {
    data: report,
    isLoading: reportLoading,
    isRefetching: reportRefetching,
    error: reportError,
    refetch: refetchReport,
  } = useReport(reportQuery);

  const studentQuery = useMemo(
    () => ({
      ...(scope === 'ALL' ? {} : { classId: scope }),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(roll === 'LOW' ? { lowAttendanceOnly: true } : {}),
    }),
    [scope, from, to, roll],
  );

  const {
    data: studentPages,
    isLoading: studentsLoading,
    error: studentsError,
    refetch: refetchStudents,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteReportStudents(
    Object.keys(studentQuery).length > 0 ? studentQuery : undefined,
  );

  /** Loaded pages, flattened. Rebuilt only when a page arrives. */
  const students = useMemo(
    () => (studentPages?.pages ?? []).flatMap((p) => p.items),
    [studentPages],
  );

  const studentTotal =
    studentPages?.pages[studentPages.pages.length - 1]?.total ?? 0;
  const studentPageSize = studentPages?.pages[0]?.pageSize ?? 0;

  const scopedClass = classes?.find((c) => c.id === scope);

  const scopeOptions = useMemo<FilterChipOption<ScopeFilter>[]>(
    () => [
      { value: 'ALL', label: 'All my classes' },
      ...(classes ?? []).map((c) => ({ value: c.id, label: c.displayCode })),
    ],
    [classes],
  );

  /* ---------------------------------------------------------------- *
   * Actions
   * ---------------------------------------------------------------- */

  const refreshAll = useCallback(() => {
    // Both queries, so pulling down refreshes the summary and every loaded page of the roll.
    void refetchReport();
    void refetchStudents();
  }, [refetchReport, refetchStudents]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  /** Explicit retry after a failed page. Unguarded — the user asked for it. */
  const retryNextPage = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  const openStudent = useCallback((stat: StudentAttendanceStat) => {
    router.push({
      pathname: '/(faculty)/students/[studentId]',
      params: { studentId: stat.studentId },
    });
  }, []);

  /** Tapping a class in the breakdown narrows the whole report to it. */
  const scopeToClass = useCallback(
    (stat: ClassAttendanceStat) => setScope(stat.classId),
    [setScope],
  );

  /*
   * Back arrow only when there is somewhere to go back to.
   *
   * The scope now lives in the URL, so a `classId` param no longer implies "arrived from Class
   * Detail" — selecting a chip on the tab sets one too. Keying the arrow off the param would put a
   * back button on a tab root, where pressing it leaves the tab entirely.
   */
  const header = (
    <AppHeader
      title="Reports"
      subtitle={scopedClass ? scopedClass.displayCode : 'All my classes'}
      {...(router.canGoBack() ? { onBack: () => router.back() } : {})}
    />
  );

  /* ---------------------------------------------------------------- *
   * Whole-screen states
   * ---------------------------------------------------------------- */

  if (reportError && !reportLoading) {
    return (
      <>
        {header}
        <View style={styles.centre}>
          <ErrorState error={reportError} onRetry={refreshAll} />
        </View>
      </>
    );
  }

  if (reportLoading || !report) {
    return (
      <>
        {header}
        <View style={[styles.loading, { paddingHorizontal: screenPadding }]}>
          <SkeletonCard height={96} />
          <SkeletonCard height={240} />
          <SkeletonCard height={160} />
          <Card padded={false} style={styles.skeletonCard}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </Card>
        </View>
      </>
    );
  }

  const threshold = report.threshold;
  const hasData = report.totalSessions > 0;

  /**
   * The date-range selector, reused by the empty state and the loaded header so a too-narrow
   * range can always be widened without leaving the screen. Presets only — see `reportRange`.
   */
  const rangeChips = (
    <FilterChips
      options={[...REPORT_RANGE_OPTIONS]}
      selected={rangeKey}
      onSelect={setRange}
      contentInset={screenPadding}
    />
  );

  /**
   * Nothing has been recorded in scope.
   *
   * Distinct from an error and from a loading state: the request succeeded and the honest answer is
   * that there is nothing to report yet. Showing a 0% chart here would invent a finding.
   */
  if (!hasData) {
    return (
      <>
        {header}
        <View style={[styles.loading, { paddingHorizontal: screenPadding }]}>
          {scopeOptions.length > 1 ? (
            <FilterChips
              options={scopeOptions}
              selected={scope}
              onSelect={setScope}
              contentInset={screenPadding}
            />
          ) : null}
          {rangeChips}
          <Card>
            <EmptyState
              icon="reports"
              title={rangeKey !== 'all' ? 'Nothing in this date range' : 'Nothing to report yet'}
              message={
                rangeKey !== 'all'
                  ? `No attendance was recorded in ${scope === 'ALL' ? 'your classes' : (scopedClass?.displayCode ?? 'this class')} in the selected date range. Try a wider range.`
                  : scope === 'ALL'
                    ? 'Once you take attendance, this screen will show overall figures, a trend over time, and a breakdown by class and student.'
                    : `No attendance has been recorded for ${scopedClass?.displayCode ?? 'this class'}. Take attendance, or switch to all your classes.`
              }
              {...(rangeKey !== 'all'
                ? { actionLabel: 'Show all time', onAction: () => setRange('all') }
                : scope !== 'ALL'
                  ? { actionLabel: 'Show all my classes', onAction: () => setScope('ALL') }
                  : {})}
            />
          </Card>
        </View>
      </>
    );
  }

  /* ---------------------------------------------------------------- *
   * Header content
   * ---------------------------------------------------------------- */

  const overallLow = report.overallPercentage < threshold;
  const metricCell = isExpanded ? styles.cellThird : styles.cellHalf;

  const listHeader = (
    <View style={styles.headerBlocks}>
      {/* Scope */}
      {scopeOptions.length > 1 ? (
        <FilterChips
          options={scopeOptions}
          selected={scope}
          onSelect={setScope}
          contentInset={screenPadding}
        />
      ) : null}

      {/* Active scope, with a way back to the overall report. Mirrors the Students screen. */}
      {scope !== 'ALL' ? (
        <View style={styles.scopeRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Scoped to
          </Text>
          <ClassCodeTag code={scopedClass?.displayCode ?? scope} />
          <Text
            variant="labelMd"
            color={palette.primary}
            onPress={() => setScope('ALL')}
            accessibilityRole="button"
            accessibilityLabel="Show the report for all my classes"
          >
            Show all classes
          </Text>
        </View>
      ) : null}

      {/* Reporting window. Selecting a preset re-queries the report for that range; the caption
          below shows the dates actually covered by the data within it. */}
      <View style={styles.rangeBlock}>
        {rangeChips}
        <View style={styles.rangeRow}>
          <Icon name="history" size={14} color={palette.outline} />
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {formatShortDate(report.from)} to {formatShortDate(report.to)}
          </Text>
        </View>
      </View>

      {/* Overall */}
      <Card>
        <View style={styles.overallRow}>
          <ProgressRing percentage={report.overallPercentage} size={72} strokeWidth={6} />
          <View style={styles.overallText}>
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              OVERALL ATTENDANCE
            </Text>
            <Text variant="bodyMd" color={palette.onSurface}>
              {scope === 'ALL'
                ? `Across ${report.byClass.length} ${report.byClass.length === 1 ? 'class' : 'classes'}`
                : (scopedClass?.subject ?? 'This class')}
            </Text>
            {overallLow ? (
              <View style={styles.warnRow}>
                <Icon name="warning" size={14} color={palette.onTertiaryFixedVariant} />
                <Text variant="labelMd" color={palette.onTertiaryFixedVariant}>
                  Below the {threshold}% threshold
                </Text>
              </View>
            ) : (
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                Threshold {threshold}%
              </Text>
            )}
          </View>
        </View>
      </Card>

      {/* Counts */}
      <View style={styles.grid}>
        <View style={metricCell}>
          <MetricCard
            label="Sessions"
            value={report.totalSessions}
            icon="history"
            accent={palette.primary}
            well={palette.primaryFixed}
          />
        </View>
        <View style={metricCell}>
          <MetricCard
            label="Students"
            value={report.studentCount}
            icon="students"
            accent={palette.onSurface}
            well={palette.surfaceContainerHigh}
          />
        </View>
        <View style={isExpanded ? metricCell : styles.cellFull}>
          <MetricCard
            label={`Below ${threshold}%`}
            value={report.lowAttendanceCount}
            icon="warning"
            accent={palette.onTertiaryFixedVariant}
            well={palette.tertiaryContainer}
            cardBackground={report.lowAttendanceCount > 0 ? palette.tertiaryFixed : undefined}
            cardBorder={report.lowAttendanceCount > 0 ? palette.tertiaryFixedDim : undefined}
            suffix={`/${report.studentCount}`}
            {...(report.lowAttendanceCount > 0 ? { flag: 'Needs attention' } : {})}
          />
        </View>
      </View>

      {/* Trend */}
      <View>
        <SectionHeader
          title="Trend"
          meta={`${report.trend.length} ${report.trend.length === 1 ? 'day' : 'days'}`}
          divider
        />
        <AttendanceTrendChart points={report.trend} threshold={threshold} />
      </View>

      {/* By class. Hidden when scoped to a single class — a one-bar comparison says nothing the
          overall figure above has not already said. */}
      {report.byClass.length > 1 ? (
        <View>
          <SectionHeader title="By class" meta="Tap to scope" divider />
          <Card>
            {report.byClass.map((stat, index) => (
              <ClassAttendanceBar
                key={stat.classId}
                stat={stat}
                threshold={threshold}
                onPress={scopeToClass}
                last={index === report.byClass.length - 1}
              />
            ))}
          </Card>
        </View>
      ) : null}

      {/* Low attendance */}
      <View>
        <SectionHeader
          title="Low attendance"
          meta={
            report.lowAttendanceCount > 0
              ? `${report.lowAttendanceCount} below ${threshold}%`
              : undefined
          }
          divider
        />

        {report.lowAttendanceCount === 0 ? (
          <Card>
            <View style={styles.clearRow}>
              <View style={styles.clearWell}>
                <Icon name="present" size={20} color={palette.secondary} />
              </View>
              <Text variant="bodyMd" color={palette.onSurface} style={styles.flex}>
                Every student is at or above the {threshold}% threshold in this period.
              </Text>
            </View>
          </Card>
        ) : (
          <Card padded={false} style={styles.lowCard}>
            <View style={styles.lowIntro}>
              <Text variant="bodyMd" color={palette.onTertiaryFixedVariant}>
                {report.lowAttendanceCount === 1
                  ? '1 student is below the threshold'
                  : `${report.lowAttendanceCount} students are below the threshold`}
                {report.lowAttendanceStudents.length < report.lowAttendanceCount
                  ? `. Showing the ${report.lowAttendanceStudents.length} lowest.`
                  : '.'}
              </Text>
            </View>

            {report.lowAttendanceStudents.map((stat, index) => (
              <StudentStatRow
                key={stat.studentId}
                stat={stat}
                threshold={threshold}
                onPress={openStudent}
                last={index === report.lowAttendanceStudents.length - 1}
              />
            ))}

            {/* Flips the roll below to the full flagged list rather than opening another screen. */}
            {report.lowAttendanceCount > report.lowAttendanceStudents.length ? (
              <View style={styles.lowFooter}>
                <Text
                  variant="labelMd"
                  color={palette.primary}
                  onPress={() => setRoll('LOW')}
                  accessibilityRole="button"
                  accessibilityLabel={`Show all ${report.lowAttendanceCount} students below the threshold`}
                >
                  Show all {report.lowAttendanceCount} below threshold
                </Text>
              </View>
            ) : null}
          </Card>
        )}
      </View>

      {/* Per-student roll */}
      <View>
        <SectionHeader title="By student" divider />

        <FilterChips
          options={[
            { value: 'ALL', label: 'All students' },
            { value: 'LOW', label: `Below ${threshold}%` },
          ]}
          selected={roll}
          onSelect={setRoll}
          contentInset={screenPadding}
        />

        {!studentsLoading ? (
          <View style={styles.countRow}>
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              {hasNextPage
                ? `Showing ${students.length} of ${studentTotal}`
                : `${studentTotal} ${studentTotal === 1 ? 'student' : 'students'}`}
            </Text>
            {roll === 'LOW' && studentTotal > 0 ? (
              <Badge
                label={`Below ${threshold}%`}
                background={palette.tertiaryFixed}
                foreground={palette.onTertiaryFixedVariant}
                border={palette.tertiaryFixedDim}
                icon="warning"
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  /* ---------------------------------------------------------------- *
   * Roll states
   * ---------------------------------------------------------------- */

  const listEmpty = studentsLoading ? (
    <Card padded={false} style={styles.skeletonCard}>
      <SkeletonListItem />
      <SkeletonListItem />
      <SkeletonListItem />
    </Card>
  ) : studentsError ? (
    // The summary above is valid, so this failure is reported in place rather than replacing the
    // whole screen with an error.
    <Card>
      <ErrorState
        error={studentsError}
        title="Could not load the student breakdown"
        onRetry={() => void refetchStudents()}
      />
    </Card>
  ) : (
    <Card>
      <EmptyState
        icon={roll === 'LOW' ? 'present' : 'students'}
        title={roll === 'LOW' ? 'No students below the threshold' : 'No students in scope'}
        message={
          roll === 'LOW'
            ? `Every student in this scope is at or above ${threshold}%.`
            : 'No students are enrolled in the classes covered by this report.'
        }
        {...(roll === 'LOW'
          ? { actionLabel: 'Show all students', onAction: () => setRoll('ALL') }
          : {})}
      />
    </Card>
  );

  /**
   * Paging footer.
   *
   * Never a full-screen loader: replacing the report while fetching page two would discard the
   * summary, the chart and the user's scroll position.
   */
  const listFooter =
    students.length === 0 ? null : isFetchingNextPage ? (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={palette.primary} />
        <Text variant="labelMd" color={palette.onSurfaceVariant}>
          Loading more students...
        </Text>
      </View>
    ) : isFetchNextPageError ? (
      <View style={styles.footer}>
        <Icon name="warning" size={16} color={palette.onTertiaryFixedVariant} />
        <Text variant="labelMd" color={palette.onSurfaceVariant}>
          Could not load more students.
        </Text>
        <Text
          variant="labelMd"
          color={palette.primary}
          onPress={retryNextPage}
          accessibilityRole="button"
          accessibilityLabel="Retry loading more students"
        >
          Retry
        </Text>
      </View>
    ) : studentTotal > studentPageSize ? (
      <View style={styles.footer}>
        <Text variant="labelMd" color={palette.outline}>
          All {studentTotal} students loaded
        </Text>
      </View>
    ) : null;

  return (
    <>
      {header}

      <FlatList
        data={students}
        keyExtractor={(item) => item.studentId}
        ListHeaderComponent={listHeader}
        renderItem={({ item, index }) => (
          <View style={[styles.rowWrap, { marginHorizontal: screenPadding }]}>
            <StudentStatRow
              stat={item}
              threshold={threshold}
              onPress={openStudent}
              last={index === students.length - 1}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ marginHorizontal: screenPadding }}>{listEmpty}</View>
        }
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.listContent}
        onRefresh={refreshAll}
        refreshing={reportRefetching}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        // Paging bounds what is fetched; virtualisation bounds what is mounted. The header is tall
        // and the rows are uniform, so keep the window tight.
        initialNumToRender={10}
        windowSize={9}
        maxToRenderPerBatch={10}
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
    paddingBottom: spacing.xxl,
    backgroundColor: palette.surfaceContainerLow,
  },
  headerBlocks: {
    gap: spacing.md,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rangeBlock: {
    gap: spacing.sm,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  overallText: {
    flex: 1,
    gap: spacing.xs,
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  cellHalf: {
    width: '50%',
    padding: spacing.xs,
  },
  cellThird: {
    width: '33.333%',
    padding: spacing.xs,
  },
  cellFull: {
    width: '100%',
    padding: spacing.xs,
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  clearWell: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.secondaryContainer,
  },
  lowCard: {
    backgroundColor: palette.tertiaryFixed,
    borderColor: palette.tertiaryFixedDim,
  },
  lowIntro: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  lowFooter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: palette.tertiaryFixedDim,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.screen,
  },
  flex: {
    flex: 1,
  },
  rowWrap: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: palette.surfaceContainerLowest,
  },
});
