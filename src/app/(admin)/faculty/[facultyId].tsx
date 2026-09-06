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
  AnimatedPressable,
  ProgressBar,
  Screen,
  SectionHeader,
  SelectionSheet,
  SkeletonCard,
  Text,
  useToast,
  type IconName,
} from '@/components';
import { useInfiniteClasses, useAssignFaculty } from '@/hooks/useClassAdmin';
import { useFacultyMember, useSetFacultyStatus } from '@/hooks/useFacultyAdmin';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, radius, spacing, useResponsive } from '@/theme';
import type { CourseClass, FacultyStatus } from '@/types';
import { formatShortDate } from '@/utils/datetime';

function FactRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.factRow, !last && styles.factDivider]}>
      <Icon name={icon} size={16} color={palette.outline} />
      <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.flex}>
        {label}
      </Text>
      <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Faculty profile.
 *
 * Shows the person, their teaching load, and the two administrative actions that belong to a
 * profile rather than a form: change status, and assign a class.
 *
 * Assignment is presented from this side as "add a class to this lecturer" and from class detail as
 * "choose a lecturer for this class" — the same `assignFaculty` call, approached from whichever
 * direction the administrator is thinking in. Classes already assigned to this person are excluded
 * from the picker, so a duplicate assignment is not offerable.
 */
export default function AdminFacultyProfileScreen() {
  const { facultyId } = useLocalSearchParams<{ facultyId: string }>();
  const { isExpanded } = useResponsive();
  const toast = useToast();

  const { data: settings } = useInstitutionSettings();
  const { data: member, isLoading, isRefetching, error, refetch } = useFacultyMember(facultyId);

  // The whole catalogue, so the picker can offer any class. Institutions have hundreds of students
  // but tens of classes, so one generous page is appropriate here.
  const { data: classPages } = useInfiniteClasses({ pageSize: 100 });
  const allClasses = useMemo(
    () => (classPages?.pages ?? []).flatMap((p) => p.items),
    [classPages],
  );

  const setStatus = useSetFacultyStatus();
  const assign = useAssignFaculty();

  const [statusSheet, setStatusSheet] = useState(false);
  const [assignSheet, setAssignSheet] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState<CourseClass | null>(null);

  const assignedClasses = useMemo(
    () => allClasses.filter((c) => member?.assignedClassIds.includes(c.id)),
    [allClasses, member],
  );

  /** Classes this lecturer could be given. Already-assigned ones are not offered. */
  const assignable = useMemo(
    () =>
      allClasses.filter(
        (c) => c.facultyId !== member?.id && (c.status ?? 'ACTIVE') === 'ACTIVE',
      ),
    [allClasses, member],
  );

  const changeStatus = useCallback(
    async (next: FacultyStatus) => {
      setStatusSheet(false);
      if (!facultyId) return;
      try {
        const saved = await setStatus.mutateAsync({ facultyId, status: next });
        toast.show({
          message: `${saved.name} is now ${next.replace('_', ' ').toLowerCase()}`,
          tone: 'success',
        });
      } catch (e) {
        toast.show({
          message: isApiError(e) ? e.message : 'Could not change status.',
          tone: 'error',
        });
      }
    },
    [facultyId, setStatus, toast],
  );

  const assignClass = useCallback(
    async (course: CourseClass) => {
      setAssignSheet(false);
      if (!facultyId) return;
      try {
        await assign.mutateAsync({ classId: course.id, facultyId });
        toast.show({ message: `${course.displayCode} assigned`, tone: 'success' });
      } catch (e) {
        toast.show({
          message: isApiError(e) ? e.message : 'Could not assign the class.',
          tone: 'error',
        });
      }
    },
    [facultyId, assign, toast],
  );

  const unassignClass = useCallback(async () => {
    const course = confirmUnassign;
    setConfirmUnassign(null);
    if (!course) return;
    try {
      await assign.mutateAsync({ classId: course.id, facultyId: null });
      toast.show({ message: `${course.displayCode} unassigned`, tone: 'success' });
    } catch (e) {
      toast.show({
        message: isApiError(e) ? e.message : 'Could not unassign the class.',
        tone: 'error',
      });
    }
  }, [confirmUnassign, assign, toast]);

  const scaffold = {
    active: 'faculty',
    title: member?.name ?? 'Faculty',
    subtitle: member ? `${member.designation} · ${member.employeeId}` : undefined,
    breadcrumbs: [
      { label: 'Administration', href: '/(admin)/dashboard' },
      { label: 'Faculty', href: '/(admin)/faculty' },
      { label: member?.name ?? 'Profile' },
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
            <SkeletonCard height={150} />
            <SkeletonCard height={180} />
            <SkeletonCard height={160} />
          </View>
        </Screen>
      </AdminScaffold>
    );
  }

  if (error || !member) {
    const notFound = isApiError(error) && error.kind === 'NOT_FOUND';
    return (
      <AdminScaffold {...scaffold}>
        <Screen>
          {notFound ? (
            <EmptyState
              icon="unknown"
              title="Faculty member not found"
              message="This record may have been removed, or the link is out of date."
              actionLabel="Back to faculty"
              onAction={() => router.back()}
            />
          ) : (
            <ErrorState error={error} onRetry={() => void refetch()} />
          )}
        </Screen>
      </AdminScaffold>
    );
  }

  return (
    <AdminScaffold
      {...scaffold}
      action={
        <Button
          label={isExpanded ? 'Edit details' : 'Edit'}
          icon="edit"
          variant="secondary"
          {...(isExpanded ? {} : { size: 'sm' as const })}
          onPress={() =>
            router.push({ pathname: '/(admin)/faculty/new', params: { facultyId: member.id } })
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
        {/* Identity */}
        <View style={styles.block}>
          <Card>
            <View style={styles.identity}>
              <Avatar name={member.name} uri={member.avatarUrl} size={64} />
              <View style={styles.identityText}>
                <Text variant="headlineSm" color={palette.onSurface} numberOfLines={2}>
                  {member.name}
                </Text>
                <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                  {member.designation}
                </Text>
                <View style={styles.identityBadges}>
                  <FacultyStatusBadge status={member.status} />
                  <Badge
                    label={`${member.assignedClassIds.length} ${member.assignedClassIds.length === 1 ? 'class' : 'classes'}`}
                    icon="classes"
                  />
                </View>
              </View>
            </View>

            <Button
              label="Change status"
              variant="tonal"
              icon="edit"
              fullWidth
              onPress={() => setStatusSheet(true)}
              loading={setStatus.isPending}
              style={styles.statusButton}
            />
          </Card>
        </View>

        {/* Contact and academic detail */}
        <View style={styles.block}>
          <SectionHeader title="Details" divider />
          <Card padded={false} style={styles.factCard}>
            <FactRow icon="faculty" label="Faculty ID" value={member.employeeId} />
            <FactRow icon="person" label="Email" value={member.email} />
            <FactRow icon="institution" label="Department" value={member.department ?? '—'} />
            <FactRow icon="clock" label="Phone" value={member.phone ?? 'Not recorded'} />
            <FactRow
              icon="calendar"
              label="Joined"
              value={member.joinedAt ? formatShortDate(member.joinedAt) : 'Not recorded'}
              last
            />
          </Card>
        </View>

        {/* Teaching load */}
        <View style={styles.block}>
          <SectionHeader
            title="Assigned classes"
            meta={`${assignedClasses.length} assigned`}
            divider
          />

          {assignedClasses.length === 0 ? (
            <Card>
              <EmptyState
                icon="classes"
                title="No classes assigned"
                message={
                  member.status === 'INACTIVE'
                    ? 'This member is inactive and cannot be assigned classes.'
                    : 'Assign a class so this lecturer can take attendance for it.'
                }
              />
            </Card>
          ) : (
            <Card padded={false}>
              {assignedClasses.map((course, index) => (
                <View
                  key={course.id}
                  style={[
                    styles.classRow,
                    index < assignedClasses.length - 1 && styles.factDivider,
                  ]}
                >
                  <AnimatedPressable
                    onPress={() =>
                      router.push({
                        pathname: '/(admin)/classes/[classId]',
                        params: { classId: course.id },
                      })
                    }
                    feedback="opacity"
                    accessibilityRole="button"
                    accessibilityLabel={`${course.subject}, ${course.displayCode}, ${course.studentCount} ${course.studentCount === 1 ? 'student' : 'students'}`}
                    style={styles.classMain}
                  >
                    <View style={styles.classTop}>
                      <ClassCodeTag code={course.displayCode} />
                      <Text
                        variant="bodyLg"
                        color={palette.onSurface}
                        numberOfLines={1}
                        style={styles.flex}
                      >
                        {course.subject}
                      </Text>
                      <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                        {course.attendancePercentage}%
                      </Text>
                    </View>
                    <ProgressBar
                      progress={course.attendancePercentage / 100}
                      height={4}
                      animated={false}
                    />
                    <Text variant="labelMd" color={palette.outline}>
                      Semester {course.semester} · {course.studentCount} {course.studentCount === 1 ? 'student' : 'students'}
                    </Text>
                  </AnimatedPressable>

                  <AnimatedPressable
                    onPress={() => setConfirmUnassign(course)}
                    feedback="opacity"
                    accessibilityRole="button"
                    accessibilityLabel={`Unassign ${course.displayCode}`}
                    style={styles.unassign}
                  >
                    <Icon name="close" size={18} color={palette.outline} />
                  </AnimatedPressable>
                </View>
              ))}
            </Card>
          )}

          {member.status !== 'INACTIVE' ? (
            <Button
              label="Assign a class"
              icon="add"
              variant="secondary"
              fullWidth
              onPress={() => setAssignSheet(true)}
              loading={assign.isPending}
              style={styles.assignButton}
            />
          ) : null}
        </View>
      </Screen>

      {/* Status change. Three mutually exclusive options is exactly what a sheet is for. */}
      <SelectionSheet
        visible={statusSheet}
        title="Employment status"
        subtitle="Inactive members keep their history but cannot take on new classes."
        onClose={() => setStatusSheet(false)}
        onSelect={(id) => void changeStatus(id as FacultyStatus)}
        options={[
          {
            id: 'ACTIVE',
            label: 'Active',
            description: 'Teaching this session',
            icon: 'present',
            selected: (member.status ?? 'ACTIVE') === 'ACTIVE',
          },
          {
            id: 'ON_LEAVE',
            label: 'On leave',
            description: 'Temporarily away; keeps assigned classes',
            icon: 'clock',
            selected: member.status === 'ON_LEAVE',
          },
          {
            id: 'INACTIVE',
            label: 'Inactive',
            description: 'No longer at the institution',
            icon: 'unknown',
            selected: member.status === 'INACTIVE',
          },
        ]}
      />

      {/*
        Class assignment. Classes this lecturer already holds are absent from `assignable`, so a
        duplicate assignment is not offerable — the UI cannot produce the invalid state at all,
        rather than producing it and reporting an error afterwards.
      */}
      <SelectionSheet
        visible={assignSheet}
        title="Assign a class"
        subtitle="Assigning replaces any lecturer currently holding the class."
        searchable
        searchPlaceholder="Search subject, code or lecturer"
        emptyMessage="Every active class is already assigned to this lecturer."
        onClose={() => setAssignSheet(false)}
        onSelect={(id) => {
          const course = assignable.find((c) => c.id === id);
          if (course) void assignClass(course);
        }}
        options={assignable.map((course) => ({
          id: course.id,
          label: `${course.displayCode} · ${course.subject}`,
          description: course.facultyName
            ? `Currently ${course.facultyName}`
            : 'No lecturer assigned',
          icon: 'classes' as const,
          searchText: `${course.department ?? ''} ${course.semester}`,
        }))}
      />

      <ConfirmationModal
        visible={confirmUnassign !== null}
        tone="default"
        icon="classes"
        title="Unassign this class?"
        message={
          confirmUnassign
            ? `${confirmUnassign.displayCode} will have no lecturer until someone else is assigned. Attendance already recorded is not affected.`
            : ''
        }
        confirmLabel="Unassign"
        onConfirm={() => void unassignClass()}
        onCancel={() => setConfirmUnassign(null)}
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
  block: {
    marginTop: spacing.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  identityBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs / 2,
  },
  statusButton: {
    marginTop: spacing.md,
  },
  factCard: {
    paddingHorizontal: spacing.md,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  factDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  classMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm + 2,
  },
  classTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unassign: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    marginLeft: spacing.xs,
  },
  assignButton: {
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
