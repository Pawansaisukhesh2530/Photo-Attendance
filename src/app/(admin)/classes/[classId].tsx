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
  ConfirmationModal,
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
import { useAcademicTree } from '@/hooks/useAcademic';
import { useAssignFaculty, useUpdateClass, useUpdateEnrolment } from '@/hooks/useClassAdmin';
import { useClass } from '@/hooks/useClasses';
import { useInfiniteFaculty } from '@/hooks/useFacultyAdmin';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { useStudents } from '@/hooks/useStudents';
import { palette, radius, spacing, useResponsive } from '@/theme';
import type { AttendanceSessionSummary, Faculty, Student } from '@/types';

/** Rows previewed before deferring to a fuller list. */
const ROSTER_PREVIEW = 8;
const SESSION_PREVIEW = 5;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const { data: academic } = useAcademicTree();
  const { data: course, isLoading, isRefetching, error, refetch } = useClass(classId);

  const roster = useStudents(classId ? { classId, pageSize: 100 } : undefined);
  const studentDirectory = useStudents(course?.sectionId ? { sectionId:course.sectionId, pageSize:100 } : undefined);
  const history = useAttendanceHistory(classId ? { classId } : undefined);

  // Active members only: an inactive lecturer cannot be assigned, so offering them would be a dead
  // end the service would reject.
  const { data: facultyPages } = useInfiniteFaculty({ status:'ACTIVE', pageSize:100, ...(course?.departmentId ? { departmentId:course.departmentId } : {}) });
  const assignable = useMemo(
    () => (facultyPages?.pages ?? []).flatMap((p) => p.items),
    [facultyPages],
  );

  const assign = useAssignFaculty();
  const updateClass = useUpdateClass();
  const updateEnrolment = useUpdateEnrolment();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [confirmArchive,setConfirmArchive]=useState(false);

  const students = useMemo(() => roster.data?.items ?? [], [roster.data?.items]);
  const enrolledIds = useMemo(() => new Set(students.map((student) => student.id)), [students]);
  const availableStudents = useMemo(
    () => (studentDirectory.data?.items ?? []).filter((student) => !enrolledIds.has(student.id)),
    [studentDirectory.data?.items, enrolledIds],
  );
  const totalStudents = roster.data?.total ?? course?.studentCount ?? 0;
  const sessions = history.data ?? [];
  const threshold = settings?.attendanceThreshold;
  const academicPath=useMemo(()=>{
    if(!course||!academic) return course?.department ?? 'Academic placement not set';
    return [
      academic.schools.find(item=>item.id===course.schoolId)?.code,
      academic.departments.find(item=>item.id===course.departmentId)?.code,
      academic.programs.find(item=>item.id===course.programId)?.code,
      academic.batches.find(item=>item.id===course.batchId)?.name,
      academic.sections.find(item=>item.id===course.sectionId)?.code,
    ].filter(Boolean).join(' · ') || course.department || 'Academic placement not set';
  },[academic,course]);

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

  const enrolStudent = useCallback(
    async (student: Student) => {
      setStudentPickerOpen(false);
      if (!classId) return;
      try {
        await updateEnrolment.mutateAsync({ classId, addStudentIds: [student.id] });
        toast.show({ message: `${student.name} enrolled`, tone: 'success' });
      } catch (e) {
        toast.show({
          message: isApiError(e) ? e.message : 'Could not enrol the student.',
          tone: 'error',
        });
      }
    },
    [classId, toast, updateEnrolment],
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
                  {academicPath}
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
            <Button label={(course.status ?? 'ACTIVE') === 'ARCHIVED' ? 'Restore class' : 'Archive class'} variant="ghost" icon={(course.status ?? 'ACTIVE') === 'ARCHIVED' ? 'retake' : 'delete'} loading={updateClass.isPending} onPress={() => (course.status ?? 'ACTIVE') === 'ARCHIVED' ? void updateClass.mutateAsync({classId:course.id,status:'ACTIVE'}).then(()=>toast.show({message:'Class restored',tone:'success'})) : setConfirmArchive(true)} />
          </Card>
        </View>

        <View style={styles.block}>
          <SectionHeader title="Setup readiness" divider />
          <Card padded={false}>
            {[
              {label:'Academic placement',ready:Boolean(course.sectionId&&course.programSubjectId)},
              {label:'Active lecturer assigned',ready:Boolean(course.facultyId)},
              {label:'Timetable configured',ready:course.schedule.length>0},
              {label:'Students enrolled',ready:totalStudents>0},
            ].map((item,index,array)=>(
              <View key={item.label} style={[styles.readinessRow,index<array.length-1&&styles.scheduleDivider]}>
                <Icon name={item.ready?'present':'warning'} size={18} color={item.ready?palette.secondary:palette.onTertiaryFixedVariant} />
                <Text variant="bodyMd" color={palette.onSurface} style={styles.flex}>{item.label}</Text>
                <Text variant="labelMd" color={item.ready?palette.secondary:palette.onTertiaryFixedVariant}>{item.ready?'Ready':'Action needed'}</Text>
              </View>
            ))}
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

        <View style={styles.block}>
          <SectionHeader title="Timetable" meta={`${course.schedule.length} ${course.schedule.length === 1 ? 'slot' : 'slots'}`} actionLabel="Manage" onAction={() => router.push({ pathname:'/(admin)/timetable', params:{ classId:course.id, ...(course.sectionId ? { sectionId:course.sectionId } : {}) } })} divider />
          <Card padded={false}>
            {course.schedule.length ? course.schedule.map((slot,index) => <View key={`${slot.dayOfWeek}-${slot.startTime}-${slot.room}`} style={[styles.scheduleRow,index<course.schedule.length-1&&styles.scheduleDivider]}><View style={styles.flex}><Text variant="bodyLg" color={palette.onSurface}>{DAYS[slot.dayOfWeek] ?? `Day ${slot.dayOfWeek}`}</Text><Text variant="labelMd" color={palette.onSurfaceVariant}>{slot.startTime} – {slot.endTime}</Text></View><Text color={palette.onSurfaceVariant}>{slot.room || 'Room not set'}</Text></View>) : <EmptyState icon="calendar" title="No timetable" message="Add a timetable slot before this class begins teaching." />}
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

          <View style={styles.rosterAction}>
            <Button
              label="Add student"
              icon="add"
              variant="tonal"
              fullWidth
              onPress={() => setStudentPickerOpen(true)}
              loading={updateEnrolment.isPending}
            />
          </View>

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
              {students.slice(0, ROSTER_PREVIEW).map((student, index) => (
                <StudentRosterRow
                  key={student.id}
                  student={student}
                  onPress={openStudent}
                  meta={student.studentId}
                  last={index === Math.min(ROSTER_PREVIEW, students.length) - 1}
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

        <View style={styles.block}>
          <SectionHeader title="Activity" divider />
          <Card padded={false} style={styles.activityCard}>
            {(course.activity ?? []).length === 0 ? (
              <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.activityEmpty}>
                No class activity has been recorded yet.
              </Text>
            ) : (
              (course.activity ?? []).map((entry, index, activity) => (
                <View
                  key={entry.id}
                  style={[styles.activityRow, index < activity.length - 1 && styles.scheduleDivider]}
                >
                  <View style={styles.activityIcon}>
                    <Icon name="audit" size={16} color={palette.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="bodyMd" color={palette.onSurface}>
                      {entry.action.replaceAll('_', ' ')}
                    </Text>
                    <Text variant="labelMd" color={palette.outline}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </Text>
                    {entry.reason ? (
                      <Text variant="labelMd" color={palette.onSurfaceVariant}>
                        {entry.reason}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </Card>
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
      <ConfirmationModal visible={confirmArchive} tone="warning" icon="delete" title="Archive class?" message="The class will leave active lists. Its roster, timetable, attendance history, and audit trail will remain available." confirmLabel="Archive" confirmLoading={updateClass.isPending} onCancel={() => setConfirmArchive(false)} onConfirm={() => void updateClass.mutateAsync({classId:course.id,status:'ARCHIVED'}).then(()=>{setConfirmArchive(false);toast.show({message:'Class archived',tone:'success'});})} />
      <SelectionSheet
        visible={studentPickerOpen}
        title="Add student to class"
        subtitle={`Choose a student to enrol in ${course.displayCode}. You can reopen this list to add more.`}
        searchable
        searchPlaceholder="Search name, student ID or roll number"
        emptyMessage="Every available student is already enrolled in this class."
        onClose={() => setStudentPickerOpen(false)}
        onSelect={(id) => {
          const student = availableStudents.find((item) => item.id === id);
          if (student) void enrolStudent(student);
        }}
        options={availableStudents.map((student) => ({
          id: student.id,
          label: student.name,
          description: `${student.rollNumber} · Semester ${student.semester} · Section ${student.section}`,
          icon: 'students' as const,
          searchText: `${student.studentId} ${student.department}`,
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
  rosterAction: {
    marginBottom: spacing.sm,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  scheduleDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
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
  activityCard: {
    paddingHorizontal: spacing.md,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryFixed,
  },
  activityEmpty: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  sheetEmpty: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  flex: {
    flex: 1,
  },
});
