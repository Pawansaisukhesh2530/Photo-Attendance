import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  Screen,
  SkeletonCard,
  WeeklyTimetable,
} from '@/components';
import { useMyTimetable } from '@/hooks/useTimetable';
import { spacing } from '@/theme';

/**
 * My Classes — weekly timetable view.
 *
 * 5-column table: Day | Time | Location | Class Name | Subject.
 * FREE slots are greyed and non-actionable.
 */
export default function ClassesScreen() {
  const { data, isLoading, isRefetching, error, refetch } = useMyTimetable();

  const header = <AppHeader title="My Classes" subtitle="Weekly timetable" />;

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
        {!data || data.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No timetable"
            message="No timetable slots have been assigned yet."
          />
        ) : (
          <WeeklyTimetable slots={data} />
        )}
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
});
