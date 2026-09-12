import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AdminScaffold,
  Button,
  Card,
  ConfirmationModal,
  EmptyState,
  ErrorState,
  Screen,
  SelectionSheet,
  SkeletonCard,
  Text,
  useToast,
  WeeklyTimetable,
} from '@/components';
import { useAcademicTree } from '@/hooks/useAcademic';
import { useInfiniteClasses } from '@/hooks/useClassAdmin';
import { useFacultyMember, useInfiniteFaculty } from '@/hooks/useFacultyAdmin';
import { useAdminTimetable, useDeleteTimetableSlot } from '@/hooks/useTimetable';
import { palette, spacing } from '@/theme';
import type { TimetableSlot } from '@/types';

/**
 * Timetable editor.
 *
 * Shows the full weekly schedule for a faculty member with per-row edit/delete
 * affordances and an "Add slot" button. The actual form lives in /new.
 */
export default function AdminTimetableEditorScreen() {
  const { facultyId, classId, sectionId } = useLocalSearchParams<{ facultyId?: string; classId?: string; sectionId?: string }>();
  const toast = useToast();
  const deleteSlot = useDeleteTimetableSlot();

  const globalSchedule = useAdminTimetable({ ...(facultyId ? { facultyId } : {}), ...(classId ? { classId } : {}), ...(sectionId ? { sectionId } : {}), pageSize: 100 });
  const slots = globalSchedule.data?.items;
  const slotsLoading = globalSchedule.isLoading;
  const isRefetching = globalSchedule.isRefetching;
  const error = globalSchedule.error;
  const refetch = globalSchedule.refetch;
  const faculty = useInfiniteFaculty({ status:'ACTIVE', pageSize:100 });
  const classes = useInfiniteClasses({ status:'ACTIVE', pageSize:100 });
  const academic = useAcademicTree();
  const facultyRows = useMemo(() => (faculty.data?.pages ?? []).flatMap((page) => page.items), [faculty.data]);
  const classRows = useMemo(() => (classes.data?.pages ?? []).flatMap((page) => page.items), [classes.data]);
  const selectedClass = classRows.find((item) => item.id === classId);
  const effectiveFacultyId = facultyId || selectedClass?.facultyId || undefined;
  const { data: member, isLoading: memberLoading } = useFacultyMember(effectiveFacultyId);

  const [confirmDelete, setConfirmDelete] = useState<TimetableSlot | null>(null);
  const [picker, setPicker] = useState<'faculty'|'class'|'section'|null>(null);

  const handleAdd = useCallback(() => {
    if (!effectiveFacultyId) return;
    router.push({
      pathname: '/(admin)/timetable/new' as never,
      params: { facultyId: effectiveFacultyId, ...(classId ? { classId } : {}) },
    });
  }, [effectiveFacultyId, classId]);

  const handleEdit = useCallback(
    (slot: TimetableSlot) => {
      router.push({
        pathname: '/(admin)/timetable/new' as never,
        params: { facultyId:slot.faculty_id, slotId: slot.id, ...(slot.class_id ? { classId:slot.class_id } : {}) },
      });
    },
    [],
  );

  const handleDelete = useCallback(
    async (slot: TimetableSlot) => {
      setConfirmDelete(null);
      try {
        await deleteSlot.mutateAsync(slot.id);
        toast.show({ message: 'Slot deleted', tone: 'success' });
      } catch {
        toast.show({ message: 'Could not delete slot', tone: 'error' });
      }
    },
    [deleteSlot, toast],
  );

  const isLoading = (effectiveFacultyId ? memberLoading : false) || slotsLoading;

  const scaffold = {
    active: 'timetable' as const,
    title: 'Timetable',
    subtitle: member?.name ?? (sectionId ? 'Section schedule' : classId ? 'Class schedule' : 'Institution teaching schedule'),
    breadcrumbs: facultyId ? [
      { label: 'Administration', href: '/(admin)/dashboard' },
      { label: 'Faculty', href: '/(admin)/faculty' },
      { label: member?.name ?? 'Profile', href: `/(admin)/faculty/${facultyId}` },
      { label: 'Timetable' },
    ] : [{ label:'Administration', href:'/(admin)/dashboard' }, { label:'Timetable' }],
    ...(facultyId || classId || sectionId ? { onBack: () => router.back() } : {}),
  };

  if (isLoading) {
    return (
      <AdminScaffold {...scaffold}>
        <Screen scrollable>
          <View style={styles.skeletons}>
            <SkeletonCard height={300} />
            <SkeletonCard height={200} />
          </View>
        </Screen>
      </AdminScaffold>
    );
  }

  if (error) {
    return (
      <AdminScaffold {...scaffold}>
        <Screen>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Screen>
      </AdminScaffold>
    );
  }

  return (
    <AdminScaffold
      {...scaffold}
      action={effectiveFacultyId ?
        <Button
          label="Add slot"
          icon="add"
          variant="primary"
          size="sm"
          onPress={handleAdd}
        /> : undefined}
    >
      <Screen
        scrollable
        respectBottomInset={false}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        contentContainerStyle={styles.content}
      >
        <View style={styles.filters}>
          <Button label={member?.name ?? 'All faculty'} variant="secondary" size="sm" onPress={() => setPicker('faculty')} />
          <Button label={classRows.find((item) => item.id === classId)?.displayCode ?? 'All classes'} variant="secondary" size="sm" onPress={() => setPicker('class')} />
          <Button label={academic.data?.sections.find((item) => item.id === sectionId)?.name ?? 'All sections'} variant="secondary" size="sm" onPress={() => setPicker('section')} />
          {facultyId || classId || sectionId ? <Button label="Clear" variant="ghost" size="sm" onPress={() => router.setParams({ facultyId:'', classId:'', sectionId:'' })} /> : null}
        </View>
        {!slots || slots.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar"
              title="No timetable slots"
              message={effectiveFacultyId ? "Add slots to build this teaching schedule." : 'Assign a lecturer before adding a teaching slot.'}
              actionLabel={effectiveFacultyId ? 'Add first slot' : 'Open faculty'}
              onAction={effectiveFacultyId ? handleAdd : () => router.push('/(admin)/faculty')}
            />
          </Card>
        ) : (
          <>
            <View style={styles.meta}>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                {slots.length} {slots.length === 1 ? 'slot' : 'slots'} scheduled
              </Text>
            </View>
            <WeeklyTimetable
              slots={slots}
              onEdit={handleEdit}
              onDelete={(slot) => setConfirmDelete(slot)}
            />
          </>
        )}
      </Screen>

      <ConfirmationModal
        visible={confirmDelete !== null}
        tone="danger"
        icon="delete"
        title="Delete slot?"
        message={
          confirmDelete?.slot_type === 'CLASS'
            ? `Remove ${confirmDelete.class_name} from the schedule?`
            : 'Remove this free period from the schedule?'
        }
        confirmLabel="Delete"
        onConfirm={() => void handleDelete(confirmDelete!)}
        onCancel={() => setConfirmDelete(null)}
      />
      <SelectionSheet visible={picker === 'faculty'} title="Filter by faculty" searchable onClose={() => setPicker(null)} onSelect={(id) => { router.setParams({ facultyId:id }); setPicker(null); }} options={facultyRows.map((item) => ({ id:item.id, label:item.name, description:`${item.employeeId} · ${item.department ?? 'No department'}`, selected:item.id === facultyId }))} />
      <SelectionSheet visible={picker === 'class'} title="Filter by class" searchable onClose={() => setPicker(null)} onSelect={(id) => { router.setParams({ classId:id }); setPicker(null); }} options={classRows.map((item) => ({ id:item.id, label:item.displayCode, description:item.subject, selected:item.id === classId }))} />
      <SelectionSheet visible={picker === 'section'} title="Filter by section" searchable onClose={() => setPicker(null)} onSelect={(id) => { router.setParams({ sectionId:id }); setPicker(null); }} options={(academic.data?.sections ?? []).filter((item) => item.active).map((item) => ({ id:item.id, label:item.name, description:item.path?.map((part) => part.code).join(' / ') ?? item.code, selected:item.id === sectionId }))} />
    </AdminScaffold>
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
  meta: {
    marginBottom: spacing.sm,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
});
