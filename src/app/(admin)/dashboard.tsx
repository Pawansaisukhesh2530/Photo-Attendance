import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  AdminScaffold,
  AttendanceTrendChart,
  AuditTimeline,
  Card,
  ClassAttendanceBar,
  EmptyState,
  ErrorState,
  Icon,
  MetricCard,
  ProgressRing,
  Screen,
  SectionHeader,
  SessionHistoryRow,
  SkeletonCard,
  SkeletonListItem,
  Text,
  AnimatedPressable,
} from '@/components';
import { useAcademicOverview } from '@/hooks/useAcademic';
import { useAdminDashboard } from '@/hooks/useAdminDashboard';
import { palette, radius, spacing, useResponsive } from '@/theme';
import type { AttendanceSessionSummary, ClassAttendanceStat } from '@/types';

/**
 * Institution dashboard.
 *
 * Read-only. Every figure comes from `useAdminDashboard`, which composes the services; nothing is
 * computed here beyond formatting.
 *
 * Laid out to be scannable in a few seconds: six metrics first, then the trend, then the three
 * things that might need action — classes below threshold, sessions awaiting review, recent
 * administrative activity. Dense three-up metrics on desktop, two-up on phones.
 *
 * The threshold is read from institution settings via the hook, never from the local constant.
 */
export default function AdminDashboardScreen() {
  const dashboard = useAdminDashboard();
  const academic = useAcademicOverview();
  const { isExpanded, screenPadding, metricColumns } = useResponsive();

  const scaffoldProps = {
    active: 'dashboard',
    title: 'Dashboard',
    subtitle: dashboard.institutionName
      ? `${dashboard.institutionName} · attendance overview`
      : 'Institution overview',
    ...(dashboard.institutionName ? { institutionName: dashboard.institutionName } : {}),
    ...(dashboard.institutionCode ? { institutionCode: dashboard.institutionCode } : {}),
  };

  if ((dashboard.error || academic.error) && !dashboard.isLoading && !academic.isLoading) {
    return (
      <AdminScaffold {...scaffoldProps}>
        <View style={styles.centre}>
          <ErrorState error={dashboard.error ?? academic.error} onRetry={() => { dashboard.refetch(); void academic.refetch(); }} />
        </View>
      </AdminScaffold>
    );
  }

  if (dashboard.isLoading || academic.isLoading) {
    return (
      <AdminScaffold {...scaffoldProps}>
        <View style={[styles.loading, { paddingHorizontal: screenPadding }]}>
          <SkeletonCard height={110} />
          <SkeletonCard height={240} />
          <Card padded={false} style={styles.skeletonCard}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </Card>
        </View>
      </AdminScaffold>
    );
  }

  const threshold = dashboard.threshold ?? dashboard.report?.threshold;
  const cell = metricColumns === 4 ? styles.cellQuarter : metricColumns === 3 ? styles.cellThird : styles.cellHalf;
  const openSession = (session: AttendanceSessionSummary): void => {
    router.push({
      pathname: '/attendance/[classId]/results',
      params: { classId: session.classId, sessionId: session.id },
    });
  };
  const openClass = (stat: ClassAttendanceStat): void => {
    router.push({ pathname: '/(admin)/classes/[classId]', params: { classId: stat.classId } });
  };

  return (
    <AdminScaffold {...scaffoldProps}>
      <Screen
        scrollable
        respectBottomInset={!isExpanded}
        onRefresh={dashboard.refetch}
        refreshing={dashboard.isRefetching}
        contentContainerStyle={styles.content}
      >
        {/* The institutional catalogue is the dashboard's primary navigation. */}
        <View style={styles.grid}>
          {[
            ['Schools', academic.data?.counts.schools ?? 0, 'institution', '/(admin)/academic-structure?kind=schools'],
            ['Departments', academic.data?.counts.departments ?? 0, 'institution', '/(admin)/academic-structure?kind=departments'],
            ['Programmes', academic.data?.counts.programs ?? 0, 'classes', '/(admin)/academic-structure?kind=programs'],
            ['Batches', academic.data?.counts.batches ?? 0, 'calendar', '/(admin)/academic-structure?kind=batches'],
            ['Sections', academic.data?.counts.sections ?? 0, 'students', '/(admin)/academic-structure?kind=sections'],
            ['Subjects', academic.data?.counts.subjects ?? 0, 'reports', '/(admin)/curriculum'],
            ['Students', academic.data?.counts.students ?? 0, 'students', '/(admin)/students'],
            ['Faculty', academic.data?.counts.faculty ?? 0, 'faculty', '/(admin)/faculty'],
            ['Classes', academic.data?.counts.classes ?? 0, 'classes', '/(admin)/classes'],
          ].map(([label, value, icon, href]) => (
            <View key={String(label)} style={cell}>
              <MetricCard label={String(label)} value={Number(value)} icon={icon as 'classes'} accent={palette.onSurface} well={palette.surfaceContainerHigh} onPress={() => router.push(href as never)} />
            </View>
          ))}
        </View>

        <View style={styles.block}>
          <SectionHeader title="Attention required" divider />
          <Card padded={false}>
            {(academic.data?.attention ?? []).filter((item) => item.count > 0).length ? (
              (academic.data?.attention ?? []).filter((item) => item.count > 0).map((item, index, items) => (
                <AnimatedPressable
                  key={item.key}
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: item.href as never, params: Object.fromEntries(Object.entries(item.query).map(([key, value]) => [key, String(value)])) } as never)}
                  style={[styles.attentionRow, index < items.length - 1 && styles.attentionDivider]}
                >
                  <View style={styles.attentionWell}><Icon name="warning" size={18} color={palette.onTertiaryFixedVariant} /></View>
                  <Text variant="bodyLg" color={palette.onSurface} style={styles.flex}>{item.label}</Text>
                  <Text variant="titleLg" color={palette.tertiaryFixedDim}>{item.count}</Text>
                  <Icon name="chevronRight" color={palette.outline} />
                </AnimatedPressable>
              ))
            ) : (
              <View style={styles.clearRow}><View style={styles.clearWell}><Icon name="present" size={20} color={palette.secondary} /></View><Text variant="bodyMd" color={palette.onSurface}>No setup or processing issues need attention.</Text></View>
            )}
          </Card>
        </View>

        {/* Today's attendance, stated in words as well as the ring. */}
        <View style={styles.block}>
          <SectionHeader title="Today" divider />
          <Card>
            <View style={styles.todayRow}>
              <ProgressRing percentage={dashboard.todayPercentage} size={64} strokeWidth={6} />
              <View style={styles.todayText}>
                {dashboard.todaySessions === 0 ? (
                  <>
                    <Text variant="bodyLg" color={palette.onSurface}>
                      No attendance recorded yet today
                    </Text>
                    <Text variant="labelMd" color={palette.onSurfaceVariant}>
                      Figures appear here as lecturers capture their classes.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text variant="bodyLg" color={palette.onSurface}>
                      {dashboard.todaySessions} session
                      {dashboard.todaySessions === 1 ? '' : 's'} recorded today
                    </Text>
                    <Text variant="labelMd" color={palette.onSurfaceVariant}>
                      Weighted across every student registered in those sessions.
                    </Text>
                  </>
                )}
              </View>
            </View>
          </Card>
        </View>

        {/* Institution trend. Reuses the faculty chart; the threshold line comes from the report. */}
        {dashboard.report ? (
          <View style={styles.block}>
            <SectionHeader
              title="Attendance trend"
              meta={`${dashboard.report.trend.length} days`}
              actionLabel="Reports"
              onAction={() => router.push('/(admin)/reports')}
              divider
            />
            <AttendanceTrendChart
              points={dashboard.report.trend}
              threshold={dashboard.report.threshold}
            />
          </View>
        ) : null}

        {/* Classes needing attention. */}
        <View style={styles.block}>
          <SectionHeader
            title="Classes needing attention"
            meta={
              threshold !== undefined && dashboard.classesNeedingAttention.length > 0
                ? `Below ${threshold}%`
                : undefined
            }
            divider
          />
          {dashboard.classesNeedingAttention.length === 0 ? (
            <Card>
              <View style={styles.clearRow}>
                <View style={styles.clearWell}>
                  <Icon name="present" size={20} color={palette.secondary} />
                </View>
                <Text variant="bodyMd" color={palette.onSurface} style={styles.flex}>
                  Every class with recorded attendance is at or above the threshold.
                </Text>
              </View>
            </Card>
          ) : (
            <Card>
              {dashboard.classesNeedingAttention.map((stat, index) => (
                <ClassAttendanceBar
                  key={stat.classId}
                  stat={stat}
                  threshold={threshold ?? dashboard.report?.threshold ?? 0}
                  onPress={openClass}
                  last={index === dashboard.classesNeedingAttention.length - 1}
                />
              ))}
            </Card>
          )}
        </View>

        {/* Recent sessions. */}
        <View style={styles.block}>
          <SectionHeader
            title="Recent attendance"
            actionLabel="View all"
            onAction={() => router.push('/(admin)/attendance')}
            divider
          />
          {dashboard.recentSessions.length === 0 ? (
            <Card>
              <EmptyState
                icon="history"
                title="No sessions recorded"
                message="Attendance appears here once lecturers begin capturing classes."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {dashboard.recentSessions.map((session, index) => (
                <SessionHistoryRow
                  key={session.id}
                  session={session}
                  onPress={openSession}
                  last={index === dashboard.recentSessions.length - 1}
                />
              ))}
            </Card>
          )}
        </View>

        {/* Administrative activity. */}
        <View style={styles.block}>
          <SectionHeader
            title="Recent activity"
            actionLabel="Audit log"
            onAction={() => router.push('/(admin)/audit')}
            divider
          />
          {dashboard.recentActivity.length === 0 ? (
            <Card>
              <EmptyState
                icon="audit"
                title="Nothing recorded yet"
                message="Changes to attendance, faculty, classes and settings appear here."
              />
            </Card>
          ) : (
            <Card>
              <AuditTimeline entries={dashboard.recentActivity} />
            </Card>
          )}
        </View>
      </Screen>
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
  content: {
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
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
  cellQuarter: {
    width: '25%',
    padding: spacing.xs,
  },
  block: {
    marginTop: spacing.md,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  todayText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
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
  flex: {
    flex: 1,
  },
  attentionRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  attentionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  attentionWell: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tertiaryContainer,
  },
});
