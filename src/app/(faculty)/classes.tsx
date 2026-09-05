import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Card,
  ClassListCard,
  EmptyState,
  ErrorState,
  FilterChips,
  Screen,
  SearchField,
  SkeletonCard,
  Text,
  type FilterChipOption,
} from '@/components';
import { useClasses } from '@/hooks/useClasses';
import { palette, spacing, useResponsive } from '@/theme';
import type { CourseClass } from '@/types';

/** Filters derived from the class catalogue returned by the backend. */
type ClassFilter = 'ALL' | 'SEM_3' | 'SEM_5' | 'LABS';

const FILTERS: FilterChipOption<ClassFilter>[] = [
  { value: 'ALL', label: 'All' },
  { value: 'SEM_3', label: 'Semester 3' },
  { value: 'SEM_5', label: 'Semester 5' },
  { value: 'LABS', label: 'Labs' },
];

/**
 * My Classes.
 *
 * Implements the Stitch My Classes screen for mobile. Stitch renders a three-up card grid
 * beneath a page header with "Filter" and "New Class Request" buttons; here the cards stack
 * full width (two-up on tablets), the desktop filter popover becomes a scrolling chip row,
 * and the global search that lived in the desktop top bar moves into the content.
 *
 * "New Class Request" is dropped — creating classes is an administrative action, and the
 * brief scopes class creation to the admin interface in Phase 9.
 *
 * Uses `FlatList` rather than a mapped ScrollView. A faculty member may hold a dozen
 * classes and each card is tall; virtualisation keeps scrolling smooth and matches the
 * approach the roster screens will need.
 */
export default function ClassesScreen() {
  const { data, isLoading, isRefetching, error, refetch } = useClasses();
  const { isExpanded, screenPadding } = useResponsive();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ClassFilter>('ALL');

  // Filtering happens client-side against the fetched list. The service also accepts a
  // `search` argument; once the roster is large enough to paginate, this should move
  // server-side rather than filtering a partial page.
  const visible = useMemo(() => {
    let result = data ?? [];

    if (filter === 'SEM_3') result = result.filter((c) => c.semester === 3);
    if (filter === 'SEM_5') result = result.filter((c) => c.semester === 5);
    if (filter === 'LABS') {
      result = result.filter(
        (c) => c.subject.toLowerCase().includes('lab') || c.displayCode.includes('-L'),
      );
    }

    const needle = search.trim().toLowerCase();
    if (needle) {
      result = result.filter(
        (c) =>
          c.subject.toLowerCase().includes(needle) ||
          c.displayCode.toLowerCase().includes(needle),
      );
    }

    return result;
  }, [data, filter, search]);

  const handleOpen = useCallback((item: CourseClass) => {
    router.push({
      pathname: '/(faculty)/class/[classId]',
      params: { classId: item.id },
    });
  }, []);

  const handleTakeAttendance = useCallback((item: CourseClass) => {
    router.push({
      pathname: '/attendance/[classId]/select',
      params: { classId: item.id },
    });
  }, []);

  const header = <AppHeader title="My Classes" subtitle="Assigned this session" />;

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

  const controls = (
    <View style={styles.controls}>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search subject or class code"
      />
      <FilterChips
        options={FILTERS}
        selected={filter}
        onSelect={setFilter}
        contentInset={screenPadding}
      />
      {!isLoading ? (
        <Text variant="labelMd" color={palette.onSurfaceVariant}>
          {visible.length} {visible.length === 1 ? 'class' : 'classes'}
        </Text>
      ) : null}
    </View>
  );

  if (isLoading) {
    return (
      <>
        {header}
        <Screen scrollable respectBottomInset={false}>
          {controls}
          <View style={styles.skeletons}>
            <SkeletonCard height={230} />
            <SkeletonCard height={230} />
            <SkeletonCard height={230} />
          </View>
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        numColumns={isExpanded ? 2 : 1}
        // numColumns cannot change on a mounted FlatList, so remount on orientation or
        // size-class change rather than letting React Native throw.
        key={isExpanded ? 'grid' : 'list'}
        columnWrapperStyle={isExpanded ? styles.column : undefined}
        ListHeaderComponent={controls}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: screenPadding },
        ]}
        renderItem={({ item }) => (
          <View style={isExpanded ? styles.gridCell : styles.listCell}>
            <ClassListCard
              item={item}
              onPress={handleOpen}
              onTakeAttendance={handleTakeAttendance}
            />
          </View>
        )}
        ListEmptyComponent={
          <Card style={styles.empty}>
            {search.trim() || filter !== 'ALL' ? (
              <EmptyState
                icon="search"
                title="No matches"
                message="No classes match your search or filter."
                actionLabel="Clear filters"
                onAction={() => {
                  setSearch('');
                  setFilter('ALL');
                }}
              />
            ) : (
              <EmptyState
                icon="classes"
                title="No classes assigned"
                message="Once your department assigns classes for this session, they will appear here."
              />
            )}
          </Card>
        }
        onRefresh={refetch}
        refreshing={isRefetching}
        showsVerticalScrollIndicator={false}
        // Tuned for tall cards: a small window keeps memory flat on long lists.
        initialNumToRender={4}
        windowSize={5}
        removeClippedSubviews
      />
    </>
  );
}

const styles = StyleSheet.create({
  controls: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  skeletons: {
    gap: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  listCell: {
    marginBottom: spacing.md,
  },
  gridCell: {
    flex: 1,
    marginBottom: spacing.md,
  },
  column: {
    gap: spacing.md,
  },
  empty: {
    marginTop: spacing.md,
  },
});
