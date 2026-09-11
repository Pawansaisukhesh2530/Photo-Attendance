import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  ClassListCard,
  EmptyState,
  ErrorState,
  Screen,
  SectionHeader,
  SkeletonCard,
  WeeklyTimetable,
} from '@/components';
import { useClasses } from '@/hooks/useClasses';
import { useMyTimetable } from '@/hooks/useTimetable';
import { spacing } from '@/theme';

/**
 * My Classes — weekly timetable view.
 *
 * 5-column table: Day | Time | Location | Class Name | Subject.
 * FREE slots are greyed and non-actionable.
 */
export default function ClassesScreen() {
  const router = useRouter();
  const timetable = useMyTimetable();
  const classes = useClasses();
  const isLoading = timetable.isLoading || classes.isLoading;
  const isRefetching = timetable.isRefetching || classes.isRefetching;
  const error = timetable.error ?? classes.error;
  const refetch = () => {
    void timetable.refetch();
    void classes.refetch();
  };

  const header = <AppHeader title="My Classes" subtitle="Assigned classes and weekly timetable" />;

  if (error && !isLoading) {
    return (
      <>
        {header}
        <Screen respectBottomInset={false}>
          <ErrorState error={error} onRetry={refetch} />
        </Screen>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        {header}
        <Screen scrollable respectBottomInset={false}>
          <View style={styles.skeletons}>
            <SkeletonCard height={300} />
            <SkeletonCard height={300} />
          </View>
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen
        scrollable
        respectBottomInset={false}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={styles.content}
      >
        <SectionHeader title="Assigned Classes" divider />
        {!classes.data || classes.data.length === 0 ? (
          <EmptyState
            icon="classes"
            title="No assigned classes"
            message="Classes will appear here after an administrator assigns them to you."
          />
        ) : (
          <View style={styles.classList}>
            {classes.data.map((item) => (
              <ClassListCard
                key={item.id}
                item={item}
                onPress={(selected) => router.push({
                  pathname: '/(faculty)/class/[classId]',
                  params: { classId: selected.id },
                })}
                onTakeAttendance={(selected) => router.push({
                  pathname: '/attendance/[classId]/select',
                  params: { classId: selected.id },
                })}
              />
            ))}
          </View>
        )}

        <View style={styles.timetableSection}>
          <SectionHeader title="Weekly Timetable" divider />
          {!timetable.data || timetable.data.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No timetable"
              message="No timetable slots have been assigned yet."
            />
          ) : (
            <WeeklyTimetable slots={timetable.data} />
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
  },
  classList: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  timetableSection: {
    marginTop: spacing.xl,
  },
});
