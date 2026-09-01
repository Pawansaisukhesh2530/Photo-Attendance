import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  AdminScaffold,
  Avatar,
  Badge,
  Button,
  Card,
  ClassCodeTag,
  EmptyState,
  ErrorState,
  FacultyStatusBadge,
  Icon,
  ProgressRing,
  Screen,
  SectionHeader,
  SelectionSheet,
  SessionHistoryRow,
  SkeletonCard,
  SkeletonListItem,
  StudentRosterRow,
  Text,
  useToast,
} from '@/components';
import { useAttendanceHistory } from '@/hooks/useAttendance';
import { useAssignFaculty } from '@/hooks/useClassAdmin';
import { useClass } from '@/hooks/useClasses';
import { useInfiniteFaculty } from '@/hooks/useFacultyAdmin';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { useStudents } from '@/hooks/useStudents';
import { palette, radius, spacing, useResponsive } from '@/theme';
import type { AttendanceSessionSummary, Faculty, Student } from '@/types';

/** Rows previewed before deferring to a fuller list. */
const ROSTER_PREVIEW = 8;
const SESSION_PREVIEW = 5;

/**
 * Class detail, admin side.
 *
 * Shows the class, its lecturer, its roster and its recorded attendance, and hosts the lecturer
 * assignment workflow from the class side.
 *
 * Attendance sessions link to the existing results screen rather than a second attendance surface.
 * Admin inspects what the lecturer recorded — including which classes were in scope for a
 * multi-class capture — through the same screen the lecturer used. Nothing here bypasses review,
 * finalization or audit.
 */
export default function AdminClassDetailScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { isExpanded } = useResponsive();
  const toast = useToast();

  const { data: settings } = useInstitutionSettings();
  const { data: course, isLoading, isRefetching, error, refetch } = useClass(classId);

  const roster = useStudents(classId ? { classId, pageSize: ROSTER_PREVIEW } : undefined);
  const history = useAttendanceHistory(classId ? { classId } : undefined);

  // Active members only: an inactive lecturer cannot be assigned, so offering them would be a dead
  // end the service would reject.
  const { data: facultyPages } = useInfiniteFaculty({ status: 'ACTIVE', pageSize: 100 });
  const assignable = useMemo(
    () => (facultyPages?.pages ?? []).flatMap((p) => p.items),
    [facultyPages],
  );

  const assign = useAssignFaculty();
  const [pickerOpen, setPickerOpen] = useState(false);

  const students = roster.data?.items ?? [];
  const totalStudents = roster.data?.total ?? course?.studentCount ?? 0;
  const sessions = history.data ?? [];
  const threshold = settings?.attendanceThreshold;

  const currentHolder = useMemo(
    () => assignable.find((f) => f.id === course?.facultyId),
    [assignable, course],
  );

  const assignTo = useCallback(
    async (member: Faculty | null) => {
      setPickerOpen(false);
      if (!classId) return;
      try {
        await assign.mutateAsync({ classId, facultyId: member?.id ?? null });
        toast.show({
          message: member ? `${member.name} assigned` : 'Lecturer removed',
          tone: 'success',
        });
      } catch (e) {
        toast.show({
          message: isApiError(e) ? e.message : 'Could not change the assignment.',
          tone: 'error',
        });
      }
    },
    [classId, assign, toast],
  );

  const openSession = useCallback((session: AttendanceSessionSummary) => {
    router.push({
      pathname: '/attendance/[classId]/results',
      params: { classId: session.classId, sessionId: session.id },
    });
  }, []);

  const openStudent = useCallback((student: Student) => {
    router.push({
      pathname: '/(admin)/students/[studentId]',
      params: { studentId: student.id },
    });
  }, []);

  const scaffold = {
    active: 'classes',
    title: course?.subject ?? 'Class',
    subtitle: course ? `${course.displayCode} · Semester ${course.semester}` : undefined,
    breadcrumbs: [
      { label: 'Administration', href: '/(admin)/dashboard' },
      { label: 'Classes', href: '/(admin)/classes' },
      { label: course?.displayCode ?? 'Class' },
    ],
    onBack: () => router.back(),
    ...(settings
      ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
      : {}),
  };

  if (isLoading) {
    return (
      <AdminScaffold {...scaffold}>
        <Screen scrollable>
          <View style={styles.skeletons}>
            <SkeletonCard height={160} />
            <SkeletonCard height={140} />
            <SkeletonCard height={180} />
          </View>
        </Screen>
      </AdminScaffold>
    );
  }

  if (error || !course) {
    const notFound = isApiError(error) && error.kind === 'NOT_FOUND';
    return (
      <AdminScaffold {...scaffold}>
        <Screen>
          {notFound ? (
            <EmptyState
              icon="unknown"
              title="Class not found"
              message="This class may have been removed, or the link is out of date."
              actionLabel="Back to classes"
              onAction={() => router.back()}
            />
          ) : (
            <ErrorState error={error} onRetry={() => void refetch()} />
          )}
        </Screen>
      </AdminScaffold>
    );
  }

  const low = threshold !== undefined && course.attendancePercentage < threshold;

  return (
    <AdminScaffold
      {...scaffold}
      action={
        <Button
          label={isExpanded ? 'Edit class' : 'Edit'}
          icon="edit"
          variant="secondary"
          {...(isExpanded ? {} : { size: 'sm' as const })}
          onPress={() =>
            router.push({ pathname: '/(admin)/classes/new', params: { classId: course.id } })
          }
        />
      }
    >
      <Screen
        scrollable
        respectBottomInset={!isExpanded}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        contentContainerStyle={styles.content}
      >
        {/* Summary */}
        <View style={styles.block}>
          <Card>
            <View style={styles.summaryTop}>
              <ProgressRing percentage={course.attendancePercentage} size={72} strokeWidth={6} />
              <View style={styles.summaryText}>
                <View style={styles.summaryTags}>
                  <ClassCodeTag code={course.displayCode} />
                  {(course.status ?? 'ACTIVE') === 'ARCHIVED' ? (
                    <Badge label="Archived" icon="unknown" />
                  ) : null}
                </View>
                <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                  {course.department ?? 'No department'}
                </Text>
                <Text variant="labelMd" color={palette.outline}>
                  {course.academicSession} · Semester {course.semester} · Section {course.section}
                </Text>
                {low ? (
                  <View style={styles.warnRow}>
                    <Icon name="warning" size={14} color={palette.onTertiaryFixedVariant} />
                    <Text variant="labelMd" color={palette.onTertiaryFixedVariant}>
                      Below the {threshold}% threshold
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        </View>

        {/* Lecturer assignment */}
        <View style={styles.block}>
          <SectionHeader title="Lecturer" divider />
          <Card>
            {course.facultyId ? (
              <View style={styles.holderRow}>
                <Avatar name={course.facultyName} size={44} />
                <View style={styles.holderText}>
                  <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
                    {course.facultyName}
                  </Text>
                  {currentHolder ? (
                    <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                      {currentHolder.designation} · {currentHolder.employeeId}
                    </Text>
                  ) : null}
                </View>
                {currentHolder ? <FacultyStatusBadge status={currentHolder.status} /> : null}
              </View>
            ) : (
              <View style={styles.unassignedRow}>
                <View style={styles.warnWell}>
                  <Icon name="warning" size={20} color={palette.onTertiaryFixedVariant} />
                </View>
                <Text variant="bodyMd" color={palette.onSurface} style={styles.flex}>
                  No lecturer assigned. Attendance cannot be taken for this class until one is.
                </Text>
              </View>
            )}

            <View style={styles.holderActions}>
              <Button
                label={course.facultyId ? 'Change lecturer' : 'Assign lecturer'}
                icon={course.facultyId ? 'edit' : 'add'}
                variant={course.facultyId ? 'tonal' : 'primary'}
                fullWidth
                onPress={() => setPickerOpen(true)}
                loading={assign.isPending}
              />
              {course.facultyId ? (
                <Button
                  label="Remove"
                  variant="ghost"
                  fullWidth
                  onPress={() => void assignTo(null)}
                  disabled={assign.isPending}
                />
              ) : null}
              {currentHolder ? (
                <Button
                  label="View lecturer profile"
                  variant="ghost"
                  icon="chevronRight"
                  iconPosition="trailing"
                  fullWidth
                  onPress={() =>
                    router.push({
                      pathname: '/(admin)/faculty/[facultyId]',
                      params: { facultyId: currentHolder.id },
                    })
                  }
                />
              ) : null}
            </View>
          </Card>
        </View>

        {/* Enrolment */}
        <View style={styles.block}>
          <SectionHeader
            title="Enrolled students"
            meta={`${totalStudents} enrolled`}
            actionLabel={totalStudents > ROSTER_PREVIEW ? 'View all' : undefined}
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

          {roster.isLoading ? (
            <Card padded={false} style={styles.skeletonCard}>
              <SkeletonListItem />
              <SkeletonListItem />
            </Card>
          ) : students.length === 0 ? (
            <Card>
              <EmptyState
                icon="students"
                title="No students enrolled"
                message="Enrolment is managed by the administration office. This class has no roster yet."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {students.map((student, index) => (
                <StudentRosterRow
                  key={student.id}
                  student={student}
                  onPress={openStudent}
                  meta={student.studentId}
                  last={index === students.length - 1}
                />
              ))}
            </Card>
          )}
        </View>

        {/* Attendance */}
        <View style={styles.block}>
          <SectionHeader
            title="Recent sessions"
            actionLabel={sessions.length > 0 ? 'All attendance' : undefined}
            onAction={
              sessions.length > 0
                ? () =>
                    router.push({
                      pathname: '/(admin)/attendance',
                      params: { classId: course.id },
                    })
                : undefined
            }
            divider
          />

          {history.isLoading ? (
            <Card padded={false} style={styles.skeletonCard}>
              <SkeletonListItem />
              <SkeletonListItem />
            </Card>
          ) : sessions.length === 0 ? (
            <Card>
              <EmptyState
                icon="history"
                title="No attendance recorded"
                message="Sessions appear here once the lecturer captures attendance."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {sessions.slice(0, SESSION_PREVIEW).map((session, index) => (
                <SessionHistoryRow
                  key={session.id}
                  session={session}
                  onPress={openSession}
                  last={index === Math.min(SESSION_PREVIEW, sessions.length) - 1}
                />
              ))}
            </Card>
          )}
        </View>
      </Screen>

      {/*
        Lecturer picker. Searchable, because an institution has dozens of lecturers. Only active
        faculty appear — the service rejects assigning an inactive member, so offering them would be
        a dead end. The currently assigned lecturer is marked rather than hidden, so the existing
        state stays visible while choosing.
      */}
      <SelectionSheet
        visible={pickerOpen}
        title="Assign a lecturer"
        subtitle="Only active faculty can be assigned. Attendance already recorded is unaffected."
        searchable
        searchPlaceholder="Search name, ID or department"
        emptyMessage="No active faculty are available to assign."
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          const member = assignable.find((f) => f.id === id);
          if (member) void assignTo(member);
        }}
        options={assignable.map((member) => ({
          id: member.id,
          label: member.name,
          description: `${member.designation} · ${member.assignedClassIds.length} ${member.assignedClassIds.length === 1 ? 'class' : 'classes'}`,
          icon: 'faculty' as const,
          selected: member.id === course.facultyId,
          searchText: `${member.employeeId} ${member.department ?? ''}`,
        }))}
      />
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  skeletons: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  skeletonCard: {
    padding: spacing.md,
  },
  block: {
    marginTop: spacing.md,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  summaryTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  holderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  holderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  unassignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  warnWell: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tertiaryFixed,
  },
  holderActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sheetEmpty: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  flex: {
    flex: 1,
  },
});
