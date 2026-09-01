import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import {
  AdminScaffold,
  AttendanceTrendChart,
  Avatar,
  Badge,
  Card,
  ClassAttendanceBar,
  ClassCodeTag,
  EmptyState,
  ErrorState,
  FilterChips,
  Icon,
  MetricCard,
  AnimatedPressable,
  ProgressBar,
  ProgressRing,
  SearchField,
  SectionHeader,
  SkeletonCard,
  SkeletonListItem,
  StudentStatRow,
  Text,
  type FilterChipOption,
} from '@/components';
import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInfiniteReportStudents, useReport } from '@/hooks/useReports';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, radius, spacing, useResponsive } from '@/theme';
import type {
  ClassAttendanceStat,
  FacultyAttendanceStat,
  StudentAttendanceStat,
} from '@/types';
import { formatShortDate } from '@/utils/datetime';
import {
  REPORT_RANGE_OPTIONS,
  resolveReportRange,
  toReportRangeKey,
  type ReportRangeKey,
} from '@/utils/reportRange';

type RollFilter = 'ALL' | 'LOW';

/**
 * Institution reports.
 *
 * Reuses the Phase 8 reporting architecture rather than duplicating it: the same
 * `AttendanceTrendChart`, `ClassAttendanceBar` and `StudentStatRow`, the same `useReport` and
 * `useInfiniteReportStudents` hooks, and the same aggregation in the service. The difference is
 * scope — `institutionWide: true`, optionally narrowed by department, faculty or class — plus the
 * faculty breakdown, which only means anything above a single lecturer.
 *
 * The threshold always comes from `report.threshold`, which the service derives from institution
 * settings. Changing the threshold in Settings moves every figure here with no client change, and
 * `ATTENDANCE_THRESHOLD` is never read.
 *
 * Scope lives in the route, so a filtered report is bookmarkable and a tab-root remount cannot
 * leave it stale.
 */
export default function AdminReportsScreen() {
  const params = useLocalSearchParams<{
    dept?: string;
    facultyId?: string;
    classId?: string;
    roll?: string;
    q?: string;
    range?: string;
  }>();
  const { isExpanded, screenPadding } = useResponsive();
  const { data: settings } = useInstitutionSettings();

  const department = params.dept && params.dept.length > 0 ? params.dept : undefined;
  const facultyId = params.facultyId && params.facultyId.length > 0 ? params.facultyId : undefined;
  const classId = params.classId && params.classId.length > 0 ? params.classId : undefined;
  const roll: RollFilter = params.roll === 'LOW' ? 'LOW' : 'ALL';
  const search = params.q ?? '';

  // Date range lives in the URL like every other scope filter. The param holds the preset key, not
  // the computed dates, so the window is always relative to now rather than frozen at selection.
  const rangeKey: ReportRangeKey = toReportRangeKey(params.range);
  const { from, to } = useMemo(() => resolveReportRange(rangeKey), [rangeKey]);

  const setParam = useCallback(
    (key: 'dept' | 'facultyId' | 'classId' | 'roll' | 'q' | 'range', value: string) => {
      router.setParams({ [key]: value });
    },
    [],
  );

  const debouncedSearch = useDebouncedValue(search.trim());

  /** Scope shared by the summary and the student roll, so the two always agree — date range too. */
  const scope = useMemo(
    () => ({
      institutionWide: true,
      ...(department ? { department } : {}),
      ...(facultyId ? { facultyId } : {}),
      ...(classId ? { classId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [department, facultyId, classId, from, to],
  );

  const {
    data: report,
    isLoading,
    isRefetching,
    error,
    refetch: refetchReport,
  } = useReport(scope);

  const studentQuery = useMemo(
    () => ({
      ...scope,
      ...(roll === 'LOW' ? { lowAttendanceOnly: true } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [scope, roll, debouncedSearch],
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
  } = useInfiniteReportStudents(studentQuery);

  const students = useMemo(
    () => (studentPages?.pages ?? []).flatMap((p) => p.items),
    [studentPages],
  );
  const studentTotal = studentPages?.pages[studentPages.pages.length - 1]?.total ?? 0;
  const studentPageSize = studentPages?.pages[0]?.pageSize ?? DEFAULT_PAGE_SIZE;

  const refreshAll = useCallback(() => {
    void refetchReport();
    void refetchStudents();
  }, [refetchReport, refetchStudents]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const openStudent = useCallback((stat: StudentAttendanceStat) => {
    router.push({
      pathname: '/(admin)/students/[studentId]',
      params: { studentId: stat.studentId },
    });
  }, []);

  const clearScope = useCallback(() => {
    router.setParams({ dept: '', facultyId: '', classId: '' });
  }, []);

  const deptOptions = useMemo<FilterChipOption<string>[]>(
    () => [
      { value: 'ALL', label: 'Whole institution' },
      ...(settings?.departments ?? []).map((d) => ({
        value: d,
        label: d.split(' ').map((w) => w[0]).join('').toUpperCase(),
      })),
    ],
    [settings],
  );

  const scaffold = {
    active: 'reports',
    title: 'Reports',
    subtitle:
      report?.scope === 'CLASS'
        ? 'Single class'
        : report?.scope === 'FACULTY'
          ? 'Single lecturer'
          : report?.scope === 'DEPARTMENT'
            ? (report.scopeId ?? 'Department')
            : 'Institution-wide attendance',
    breadcrumbs: [
      { label: 'Administration', href: '/(admin)/dashboard' },
      { label: 'Reports' },
    ],
    onBack: isExpanded ? undefined : () => router.back(),
    ...(settings
      ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
      : {}),
  };

  if (error && !isLoading) {
    return (
      <AdminScaffold {...scaffold}>
        <View style={styles.centre}>
          <ErrorState error={error} onRetry={refreshAll} />
        </View>
      </AdminScaffold>
    );
  }

  if (isLoading || !report) {
    return (
      <AdminScaffold {...scaffold}>
        <View style={[styles.loading, { paddingHorizontal: screenPadding }]}>
          <SkeletonCard height={100} />
          <SkeletonCard height={240} />
          <SkeletonCard height={160} />
          <Card padded={false} style={styles.skeletonCard}>
            <SkeletonListItem />
            <SkeletonListItem />
          </Card>
        </View>
      </AdminScaffold>
    );
  }

  const threshold = report.threshold;
  const hasData = report.totalSessions > 0;
  const scoped = Boolean(department || facultyId || classId);

  /**
   * Date-range selector, reused by the empty state and the loaded header so a too-narrow range can
   * always be widened in place. Presets only — see `reportRange`.
   */
  const rangeChips = (
    <FilterChips
      options={[...REPORT_RANGE_OPTIONS]}
      selected={rangeKey}
      onSelect={(value) => setParam('range', value)}
      contentInset={screenPadding}
    />
  );

  if (!hasData) {
    return (
      <AdminScaffold {...scaffold}>
        <View style={[styles.loading, { paddingHorizontal: screenPadding }]}>
          <FilterChips
            options={deptOptions}
            selected={department ?? 'ALL'}
            onSelect={(value) => setParam('dept', value === 'ALL' ? '' : value)}
            contentInset={screenPadding}
          />
          {rangeChips}
          <Card>
            <EmptyState
              icon="reports"
              title={rangeKey !== 'all' ? 'Nothing in this date range' : 'Nothing to report yet'}
              message={
                rangeKey !== 'all'
                  ? 'No attendance was recorded in this scope in the selected date range. Try a wider range, or widen the scope.'
                  : scoped
                    ? 'No attendance has been recorded in this scope. Widen the scope, or wait until lecturers capture their classes.'
                    : 'Once lecturers begin taking attendance, this screen will show institution figures, a trend over time, and breakdowns by class, lecturer and student.'
              }
              {...(rangeKey !== 'all'
                ? { actionLabel: 'Show all time', onAction: () => setParam('range', 'all') }
                : scoped
                  ? { actionLabel: 'Show whole institution', onAction: clearScope }
                  : {})}
            />
          </Card>
        </View>
      </AdminScaffold>
    );
  }

  const overallLow = report.overallPercentage < threshold;
  const cell = isExpanded ? styles.cellThird : styles.cellHalf;

  const scopeToClass = (stat: ClassAttendanceStat): void => setParam('classId', stat.classId);
  const scopeToFaculty = (stat: FacultyAttendanceStat): void =>
    setParam('facultyId', stat.facultyId);

  const listHeader = (
    <View style={styles.headerBlocks}>
      {/* Department scope */}
      <FilterChips
        options={deptOptions}
        selected={department ?? 'ALL'}
        onSelect={(value) => {
          setParam('dept', value === 'ALL' ? '' : value);
          // A class or lecturer from another department would contradict the new scope.
          setParam('classId', '');
          setParam('facultyId', '');
        }}
        contentInset={screenPadding}
      />

      {/* Active scope, with a way back to the whole institution. */}
      {scoped ? (
        <View style={styles.scopeRow}>
          <Icon name="filter" size={14} color={palette.onSurfaceVariant} />
          <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.flex}>
            {report.scope === 'CLASS'
              ? `Scoped to one class`
              : report.scope === 'FACULTY'
                ? 'Scoped to one lecturer'
                : `Scoped to ${report.scopeId}`}
          </Text>
          <Text
            variant="labelMd"
            color={palette.primary}
            onPress={clearScope}
            accessibilityRole="button"
            accessibilityLabel="Show the whole institution"
          >
            Clear scope
          </Text>
        </View>
      ) : null}

      {/* Reporting window. Selecting a preset re-queries every figure for that range; the caption
          shows the dates actually covered by the data within it. */}
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
              {report.byClass.length} {report.byClass.length === 1 ? 'class' : 'classes'}
              {report.byFaculty.length > 1 ? ` · ${report.byFaculty.length} lecturers` : ''}
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
        <View style={cell}>
          <MetricCard
            label="Sessions"
            value={report.totalSessions}
            icon="history"
            accent={palette.primary}
            well={palette.primaryFixed}
          />
        </View>
        <View style={cell}>
          <MetricCard
            label="Students"
            value={report.studentCount}
            icon="students"
            accent={palette.onSurface}
            well={palette.surfaceContainerHigh}
          />
        </View>
        <View style={isExpanded ? cell : styles.cellFull}>
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
          title="Attendance trend"
          meta={`${report.trend.length} ${report.trend.length === 1 ? 'day' : 'days'}`}
          divider
        />
        <AttendanceTrendChart points={report.trend} threshold={threshold} />
      </View>

      {/* By faculty. Only meaningful above a single lecturer, and the service returns an empty
          array below two entries, so no guard is needed beyond this. */}
      {report.byFaculty.length > 1 ? (
        <View>
          <SectionHeader
            title="By lecturer"
            meta="Weakest first · tap to scope"
            divider
          />
          <Card padded={false}>
            {report.byFaculty.map((stat, index) => {
              const low = stat.percentage < threshold;
              return (
                <AnimatedPressable
                  key={stat.facultyId}
                  onPress={() => scopeToFaculty(stat)}
                  feedback="opacity"
                  accessibilityRole="button"
                  accessibilityLabel={`${stat.facultyName}, ${stat.percentage} percent across ${stat.classCount} classes and ${stat.sessionCount} sessions${low ? `, below the ${threshold} percent threshold` : ''}`}
                  style={[
                    styles.facultyRow,
                    index < report.byFaculty.length - 1 && styles.rowDivider,
                  ]}
                >
                  <Avatar name={stat.facultyName} size={36} />
                  <View style={styles.facultyText}>
                    <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
                      {stat.facultyName}
                    </Text>
                    <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                      {stat.classCount} {stat.classCount === 1 ? 'class' : 'classes'} ·{' '}
                      {stat.sessionCount} sessions
                      {stat.lowAttendanceCount > 0
                        ? ` · ${stat.lowAttendanceCount} below threshold`
                        : ''}
                    </Text>
                    <ProgressBar
                      progress={stat.percentage / 100}
                      color={low ? palette.tertiaryFixedDim : palette.primary}
                      height={4}
                      animated={false}
                      style={styles.facultyBar}
                    />
                  </View>
                  <View style={styles.facultyTrailing}>
                    {low ? (
                      <Icon name="warning" size={14} color={palette.onTertiaryFixedVariant} />
                    ) : null}
                    <Text
                      variant="bodyLg"
                      color={low ? palette.onTertiaryFixedVariant : palette.onSurface}
                    >
                      {stat.percentage}%
                    </Text>
                  </View>
                </AnimatedPressable>
              );
            })}
          </Card>
          {/*
            Stated plainly: this measures attendance recorded in a lecturer's classes. It is not a
            judgement of the lecturer, and presenting it as one would be unfair — a cohort of
            habitual non-attenders is not evidence about whoever teaches them.
          */}
          <View style={styles.caveat}>
            <Icon name="info" size={14} color={palette.outline} />
            <Text variant="labelMd" color={palette.outline} style={styles.flex}>
              Attendance recorded in each lecturer&apos;s classes. Not a measure of teaching
              performance.
            </Text>
          </View>
        </View>
      ) : null}

      {/* By class */}
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
                Every student in this scope is at or above the {threshold}% threshold.
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
            {report.lowAttendanceCount > report.lowAttendanceStudents.length ? (
              <View style={styles.lowFooter}>
                <Text
                  variant="labelMd"
                  color={palette.primary}
                  onPress={() => setParam('roll', 'LOW')}
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

      {/* Student roll */}
      <View>
        <SectionHeader title="By student" divider />

        <SearchField
          value={search}
          onChangeText={(value) => setParam('q', value)}
          placeholder="Search student name or roll number"
        />

        <View style={styles.rollFilter}>
          <FilterChips
            options={[
              { value: 'ALL', label: 'All students' },
              { value: 'LOW', label: `Below ${threshold}%` },
            ]}
            selected={roll}
            onSelect={(value) => setParam('roll', value === 'LOW' ? 'LOW' : '')}
            contentInset={screenPadding}
          />
        </View>

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
                icon="warning"
                background={palette.tertiaryFixed}
                foreground={palette.onTertiaryFixedVariant}
                border={palette.tertiaryFixedDim}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  const listEmpty = studentsLoading ? (
    <Card padded={false} style={styles.skeletonCard}>
      <SkeletonListItem />
      <SkeletonListItem />
    </Card>
  ) : studentsError ? (
    // The summary above is valid, so this failure is reported in place rather than replacing it.
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
        title={roll === 'LOW' ? 'No students below the threshold' : 'No students match'}
        message={
          roll === 'LOW'
            ? `Every student in this scope is at or above ${threshold}%.`
            : 'Try a different search, or widen the scope.'
        }
        {...(roll === 'LOW'
          ? { actionLabel: 'Show all students', onAction: () => setParam('roll', '') }
          : {})}
      />
    </Card>
  );

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
          onPress={() => void fetchNextPage()}
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
    <AdminScaffold {...scaffold}>
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
        refreshing={isRefetching}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        windowSize={9}
        maxToRenderPerBatch={10}
        removeClippedSubviews
      />
    </AdminScaffold>
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
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainer,
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
    minWidth: 0,
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
  facultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  facultyText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  facultyBar: {
    marginTop: 2,
  },
  facultyTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  caveat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
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
  rollFilter: {
    marginTop: spacing.sm,
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
  rowWrap: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: palette.surfaceContainerLowest,
  },
  flex: {
    flex: 1,
  },
});
