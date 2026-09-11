import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AdminScaffold,
  Button,
  Card,
  ConfirmationModal,
  EmptyState,
  ErrorState,
  Screen,
  SkeletonCard,
  Text,
  useToast,
  WeeklyTimetable,
} from '@/components';
import { useFacultyMember } from '@/hooks/useFacultyAdmin';
import { useDeleteTimetableSlot, useFacultyTimetable } from '@/hooks/useTimetable';
import { palette, spacing } from '@/theme';
import type { TimetableSlot } from '@/types';

/**
 * Timetable editor.
 *
 * Shows the full weekly schedule for a faculty member with per-row edit/delete
 * affordances and an "Add slot" button. The actual form lives in /new.
 */
export default function AdminTimetableEditorScreen() {
  const { facultyId } = useLocalSearchParams<{ facultyId: string }>();
  const toast = useToast();
  const deleteSlot = useDeleteTimetableSlot();

  const { data: member, isLoading: memberLoading } = useFacultyMember(facultyId);
  const {
    data: slots,
    isLoading: slotsLoading,
    isRefetching,
    error,
    refetch,
  } = useFacultyTimetable(facultyId);

  const [confirmDelete, setConfirmDelete] = useState<TimetableSlot | null>(null);

  const handleAdd = useCallback(() => {
    router.push({
      pathname: '/(admin)/timetable/new' as never,
      params: { facultyId },
    });
  }, [facultyId]);

  const handleEdit = useCallback(
    (slot: TimetableSlot) => {
      router.push({
        pathname: '/(admin)/timetable/new' as never,
        params: { facultyId, slotId: slot.id },
      });
    },
    [facultyId],
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

  const isLoading = memberLoading || slotsLoading;

  const scaffold = {
    active: 'faculty' as const,
    title: 'Timetable',
    subtitle: member?.name ?? 'Loading...',
    breadcrumbs: [
      { label: 'Administration', href: '/(admin)/dashboard' },
      { label: 'Faculty', href: '/(admin)/faculty' },
      { label: member?.name ?? 'Profile', href: `/(admin)/faculty/${facultyId}` },
      { label: 'Timetable' },
    ],
    onBack: () => router.back(),
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
      action={
        <Button
          label="Add slot"
          icon="add"
          variant="primary"
          size="sm"
          onPress={handleAdd}
        />
      }
    >
      <Screen
        scrollable
        respectBottomInset={false}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        contentContainerStyle={styles.content}
      >
        {!slots || slots.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar"
              title="No timetable slots"
              message="Add slots to build this faculty member's weekly schedule."
              actionLabel="Add first slot"
              onAction={handleAdd}
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
});
