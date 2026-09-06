import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  ProgressRing,
  Screen,
  SectionHeader,
  SessionHistoryRow,
  SkeletonCard,
  SkeletonListItem,
  StudentRosterRow,
  Text,
  type IconName,
} from '@/components';
import { ATTENDANCE_THRESHOLD } from '@/constants/config';
import { useAttendanceHistory } from '@/hooks/useAttendance';
import { useClass } from '@/hooks/useClasses';
import { useStudents } from '@/hooks/useStudents';
import { palette, radius, spacing } from '@/theme';
import type { AttendanceSessionSummary, Student } from '@/types';
import { formatScheduleTime } from '@/utils/datetime';

/** How many roster rows to preview before deferring to the full list. */
const ROSTER_PREVIEW = 5;
const SESSION_PREVIEW = 3;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function FactRow({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={16} color={palette.outline} />
      <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={1} style={styles.factText}>
        {label}
      </Text>
    </View>
  );
}

function StatTile({
  label,
  value,
  accent = palette.onSurface,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <View style={styles.statTile}>
      <Text variant="headlineSm" color={accent}>
        {value}
      </Text>
      <Text variant="labelMd" color={palette.onSurfaceVariant} align="center" numberOfLines={2}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * Class detail.
 *
 * No Stitch screen exists for this, so it is composed from the established EduTrace Pro
 * mobile language: the summary ring from the My Classes card, the metric tiles from the
 * dashboard, the roster row from the attendance list, and the session row from Recent
 * Activity. No new visual idiom is introduced.
 *
 * Deliberately a preview-and-drill screen rather than a full roster. Rendering 48 student
 * rows plus history inside one ScrollView would defeat virtualisation and make the Take
 * Attendance action — the reason a lecturer opens this — a long scroll away. The primary
 * action sits directly under the summary; the roster and history show a handful of rows and
 * hand off to their own screens.
 */
export default function ClassDetailScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();

  const classQuery = useClass(classId);
  // Only the preview rows are needed here; `total` still reports the full roster size, so
  // "View all 48" stays accurate while fetching five records instead of twenty-five.
  const studentsQuery = useStudents(
    classId ? { classId, pageSize: ROSTER_PREVIEW } : undefined,
  );
  const historyQuery = useAttendanceHistory(classId ? { classId } : undefined);

  const course = classQuery.data;
  const students = studentsQuery.data?.items ?? [];
  const totalStudents = studentsQuery.data?.total ?? course?.studentCount ?? 0;
  const sessions = historyQuery.data ?? [];

  const lowAttendanceCount = students.filter(
    (s) => s.overallAttendance < ATTENDANCE_THRESHOLD,
  ).length;

  const averagePresent =
    sessions.length === 0
      ? null
      : Math.round(sessions.reduce((sum, s) => sum + s.summary.present, 0) / sessions.length);

  const handleTakeAttendance = useCallback(() => {
    if (!classId) return;
    router.push({
      pathname: '/attendance/[classId]/select',
      params: { classId },
    });
  }, [classId]);

  const handleTestUpload = useCallback(() => {
    if (!classId) return;
    router.push({
      pathname: '/attendance/[classId]/upload',
      params: { classId, classIds: classId },
    });
  }, [classId]);

  const handleOpenSession = useCallback((session: AttendanceSessionSummary) => {
    router.push({
      pathname: '/attendance/[classId]/results',
      params: { classId: session.classId, sessionId: session.id },
    });
  }, []);

  const handleOpenStudent = useCallback((student: Student) => {
    // Phase 7: the profile is a screen inside the students stack, so the roster row now lands
    // directly on the student rather than on the list with a dangling `studentId` param.
    router.push({
      pathname: '/(faculty)/students/[studentId]',
      params: { studentId: student.id },
    });
  }, []);

  const header = (
    <AppHeader
      title={course?.subject ?? 'Class'}
      {...(course?.displayCode ? { subtitle: course.displayCode } : {})}
      onBack={() => router.back()}
    />
  );

  if (classQuery.error) {
    return (
      <>
        {header}
        <Screen respectBottomInset={false}>
          <ErrorState error={classQuery.error} onRetry={() => void classQuery.refetch()} />
        </Screen>
      </>
    );
  }

  if (classQuery.isLoading || !course) {
    return (
      <>
        {header}
        <Screen scrollable respectBottomInset={false}>
          <View style={styles.skeletons}>
            <SkeletonCard height={180} />
            <SkeletonCard height={48} />
            <SkeletonCard height={90} />
            <SkeletonCard height={220} />
          </View>
        </Screen>
      </>
    );
  }

  const firstSlot = course.schedule[0];
  const scheduleLabel = firstSlot
    ? `${DAY_LABELS[firstSlot.dayOfWeek] ?? ''} ${formatScheduleTime(firstSlot.startTime)} • ${firstSlot.room}`
    : 'Not scheduled';

  return (
    <>
      {header}
      <Screen
        scrollable
        respectBottomInset={false}
        onRefresh={() => {
          void classQuery.refetch();
          void studentsQuery.refetch();
          void historyQuery.refetch();
        }}
        refreshing={classQuery.isRefetching}
        contentContainerStyle={styles.content}
      >
        {/* Summary */}
        <Card style={styles.summary}>
          <View style={styles.summaryTop}>
            <ProgressRing
              percentage={course.attendancePercentage}
              size={88}
              strokeWidth={8}
              caption="attendance"
            />

            <View style={styles.facts}>
              <FactRow icon="students" label={`${totalStudents} ${totalStudents === 1 ? 'student' : 'students'}`} />
              <FactRow icon="classes" label={`Semester ${course.semester} • Section ${course.section}`} />
              <FactRow icon="clock" label={scheduleLabel} />
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.facultyRow}>
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              FACULTY
            </Text>
            <Text variant="bodyMd" color={palette.onSurface} numberOfLines={1}>
              {course.facultyName}
            </Text>
          </View>
        </Card>

        {/* Primary action, placed high because it is why this screen gets opened. */}
        <Button
          label="Take attendance"
          icon="takeAttendance"
          size="lg"
          fullWidth
          onPress={handleTakeAttendance}
          style={styles.primaryAction}
          accessibilityHint={`Opens the camera to capture attendance for ${course.subject}`}
        />
        <Button
          label="Upload test photo"
          icon="gallery"
          variant="secondary"
          fullWidth
          onPress={handleTestUpload}
          style={styles.testUploadAction}
          accessibilityHint={`Chooses an existing classroom photo to test attendance for ${course.subject}`}
        />

        {/* Stats */}
        <Card style={styles.statCard} padded={false}>
          <View style={styles.statRow}>
            <StatTile label="Sessions" value={sessions.length} />
            <View style={styles.statSeparator} />
            <StatTile label="Avg present" value={averagePresent ?? '--'} />
            <View style={styles.statSeparator} />
            <StatTile
              label="Low attendance"
              value={lowAttendanceCount}
              accent={
                lowAttendanceCount > 0 ? palette.onTertiaryFixedVariant : palette.onSurface
              }
            />
          </View>
        </Card>

        {/* Roster */}
        <View style={styles.section}>
          <SectionHeader
            title="Enrolled Students"
            actionLabel={totalStudents > ROSTER_PREVIEW ? `View all ${totalStudents}` : undefined}
            onAction={
              totalStudents > ROSTER_PREVIEW
                ? () =>
                    router.push({
                      pathname: '/(faculty)/students',
                      params: { classId: course.id },
                    })
                : undefined
            }
            divider
          />

          {studentsQuery.isLoading ? (
            <Card>
              <SkeletonListItem />
              <SkeletonListItem />
              <SkeletonListItem />
            </Card>
          ) : studentsQuery.error ? (
            <Card>
              <ErrorState
                error={studentsQuery.error}
                title="Could not load the roster"
                onRetry={() => void studentsQuery.refetch()}
              />
            </Card>
          ) : students.length === 0 ? (
            <Card>
              <EmptyState
                icon="students"
                title="No students enrolled"
                message="Enrolments are managed by the administration office."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {students.slice(0, ROSTER_PREVIEW).map((student, index) => (
                <StudentRosterRow
                  key={student.id}
                  student={student}
                  onPress={handleOpenStudent}
                  last={index === Math.min(ROSTER_PREVIEW, students.length) - 1}
                />
              ))}
            </Card>
          )}
        </View>

        {/* History */}
        <View style={styles.section}>
          <SectionHeader
            title="Recent Sessions"
            actionLabel={sessions.length > 0 ? 'View all' : undefined}
            onAction={
              sessions.length > 0
                ? () =>
                    // Scoped, so History opens filtered to this class rather than everything.
                    router.push({
                      pathname: '/(faculty)/history',
                      params: { classId: course.id },
                    })
                : undefined
            }
            divider
          />

          {historyQuery.isLoading ? (
            <Card>
              <SkeletonListItem />
              <SkeletonListItem />
            </Card>
          ) : sessions.length === 0 ? (
            <Card>
              <EmptyState
                icon="history"
                title="No sessions recorded"
                message="Take attendance for this class and it will appear here."
                actionLabel="Take attendance"
                onAction={handleTakeAttendance}
              />
            </Card>
          ) : (
            <Card padded={false}>
              {sessions.slice(0, SESSION_PREVIEW).map((session, index) => (
                <SessionHistoryRow
                  key={session.id}
                  session={session}
                  onPress={handleOpenSession}
                  last={index === Math.min(SESSION_PREVIEW, sessions.length) - 1}
                />
              ))}
            </Card>
          )}
        </View>

        {/*
          Analytics entry point.
          Hands the class id to Reports, which scopes every figure to it and offers a way back to
          the overall report. Deliberately a link into the existing Reports screen rather than a
          class-specific report screen — two report surfaces would be two places for the same
          numbers to drift apart.
        */}
        <View style={styles.section}>
          <SectionHeader title="Analytics" divider />

          {sessions.length === 0 ? (
            <Card>
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                Attendance reports appear once this class has at least one recorded session.
              </Text>
            </Card>
          ) : (
            <Card
              onPress={() =>
                router.push({
                  pathname: '/(faculty)/reports',
                  params: { classId: course.id },
                })
              }
              accessibilityLabel={`View the attendance report for ${course.displayCode}`}
            >
              <View style={styles.reportRow}>
                <View style={styles.reportWell}>
                  <Icon name="reports" size={20} color={palette.primary} />
                </View>
                <View style={styles.reportText}>
                  <Text variant="titleLg" color={palette.onSurface}>
                    Attendance report
                  </Text>
                  <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                    Trend over time, and every student&apos;s percentage for {course.displayCode}.
                  </Text>
                </View>
                <Icon name="chevronRight" size={20} color={palette.outline} />
              </View>
            </Card>
          )}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  skeletons: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  summary: {
    marginTop: spacing.md,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  facts: {
    flex: 1,
    gap: spacing.sm,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  factText: {
    flex: 1,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: palette.outlineVariant,
    marginVertical: spacing.md,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
  },
  reportWell: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryFixed,
  },
  reportText: {
    flex: 1,
    gap: 2,
  },
  facultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  primaryAction: {
    marginTop: spacing.md,
  },
  testUploadAction: {
    marginTop: spacing.sm,
  },
  statCard: {
    marginTop: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  statSeparator: {
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: palette.outlineVariant,
    marginVertical: spacing.sm,
    borderRadius: radius.full,
  },
  section: {
    marginTop: spacing.lg,
  },
});
