import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Badge,
  Card,
  ClassCodeTag,
  EmptyState,
  ErrorState,
  FilterChips,
  Icon,
  SearchField,
  SkeletonListItem,
  StudentRosterRow,
  Text,
  type FilterChipOption,
} from '@/components';
import { ATTENDANCE_THRESHOLD } from '@/constants/config';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useClass, useClasses } from '@/hooks/useClasses';
import { useInfiniteStudents } from '@/hooks/useStudents';
import { palette, radius, spacing, useResponsive } from '@/theme';
import type { Student } from '@/types';

/** Semester facet. `ALL` plus whichever semesters the assigned classes actually cover. */
type SemesterFilter = 'ALL' | string;

/**
 * Student roster.
 *
 * Read-and-inspect only: this screen displays students and routes to their profiles. It adds no
 * attendance capability and touches none of the recognition, review or finalization logic.
 *
 * No Stitch screen exists for this, so it extends the established language — the same search field,
 * chip row, card and row components used by My Classes, History and the class roster. A student row
 * is `StudentRosterRow`, unchanged from the one already used inside Class Detail, so a student looks
 * identical wherever they appear.
 *
 * Honours a `classId` param from Class Detail's "View all", scoping the list and showing a removable
 * chip, mirroring the pattern established on the History screen.
 *
 * Paged rather than capped. The directory spans every assigned class, so a single page could never
 * reach the whole cohort; `useInfiniteStudents` appends a page as the user reaches the end, and
 * every filter narrows the paged set on the server rather than in a fetched array.
 */
export default function StudentsScreen() {
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  const { screenPadding } = useResponsive();

  /*
   * Class scope lives in the route, not in component state.
   *
   * This screen is the root of the students tab, so navigating to it from Class Detail does not
   * remount it. Seeding `useState` from the param therefore only worked the first time: arriving
   * from a second class kept whichever scope was already showing, silently listing the wrong
   * roster. The same defect was found on device in Reports and fixed the same way.
   *
   * Deriving from the param makes the URL the single source of truth, so an incoming `classId`
   * always wins and repeat navigations to the same class behave exactly like the first.
   */
  const scopedClassId = classId && classId.length > 0 ? classId : undefined;

  const setScopedClassId = useCallback((next: string | undefined) => {
    // Empty rather than undefined: `setParams` keeps the key, and '' reads back as "no scope".
    router.setParams({ classId: next ?? '' });
  }, []);

  const [search, setSearch] = useState('');
  const [semester, setSemester] = useState<SemesterFilter>('ALL');
  const [lowOnly, setLowOnly] = useState(false);

  const { data: classes } = useClasses();
  const { data: scopedClass } = useClass(scopedClassId);

  /**
   * Semester facets derived from the faculty member's own classes rather than hard-coded, so the row
   * only ever offers values that can actually return results.
   */
  const semesterOptions = useMemo<FilterChipOption<SemesterFilter>[]>(() => {
    const semesters = [...new Set((classes ?? []).map((c) => c.semester))].sort();
    return [
      { value: 'ALL', label: 'All' },
      ...semesters.map((s) => ({ value: String(s), label: `Semester ${s}` })),
    ];
  }, [classes]);

  /**
   * Filtering runs through the service, not over a fetched array, so the same code path holds when
   * the roster is large enough to page server-side.
   */
  // The field stays fully responsive; only the query waits for a pause in typing.
  const debouncedSearch = useDebouncedValue(search.trim());

  const query = useMemo(
    () => ({
      ...(scopedClassId ? { classId: scopedClassId } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(semester !== 'ALL' ? { semester: Number(semester) } : {}),
      ...(lowOnly ? { lowAttendanceOnly: true } : {}),
    }),
    [scopedClassId, debouncedSearch, semester, lowOnly],
  );

  const {
    data,
    isLoading,
    isRefetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteStudents(Object.keys(query).length > 0 ? query : undefined);

  /** Loaded pages, flattened. Rebuilt only when a page arrives, not on every render. */
  const students = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data]);

  // Read from the newest page: it is the freshest statement of the filtered total.
  const total = data?.pages[data.pages.length - 1]?.total ?? 0;
  const pageSize = data?.pages[0]?.pageSize ?? 0;

  /**
   * Asks for the next page when the user reaches the end.
   *
   * Guarded on both flags. `hasNextPage` stops requests past the last page; `isFetchingNextPage`
   * stops FlatList firing the same request several times, which it will do while a fetch is in
   * flight and the content height has not yet grown. Also guarded on the error flag so a failed
   * page is retried deliberately rather than hammered on every scroll tick.
   */
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  /** Explicit retry after a failed page. Unguarded — the user asked for it. */
  const retryNextPage = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  const openProfile = useCallback((student: Student) => {
    router.push({
      pathname: '/(faculty)/students/[studentId]',
      params: { studentId: student.id },
    });
  }, []);

  const hasFilters =
    Boolean(scopedClassId) || search.trim().length > 0 || semester !== 'ALL' || lowOnly;

  const clearAll = useCallback(() => {
    setScopedClassId(undefined);
    setSearch('');
    setSemester('ALL');
    setLowOnly(false);
  }, [setScopedClassId]);

  /*
   * Back arrow only when there is somewhere to go back to.
   *
   * Keying it off the param would remove the arrow the moment "Show all" cleared the scope,
   * stranding anyone who arrived from Class Detail with no way back.
   */
  const header = (
    <AppHeader
      title="Students"
      subtitle={scopedClass ? scopedClass.displayCode : 'Across your classes'}
      {...(router.canGoBack() ? { onBack: () => router.back() } : {})}
    />
  );

  if (error && !isLoading) {
    return (
      <>
        {header}
        <View style={styles.centre}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </View>
      </>
    );
  }

  const listHeader = (
    <View style={styles.listHeader}>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search name, ID or roll number"
      />

      {/* Semester facet, only when there is more than one to choose between. */}
      {semesterOptions.length > 2 ? (
        <FilterChips
          options={semesterOptions}
          selected={semester}
          onSelect={setSemester}
          contentInset={screenPadding}
        />
      ) : null}

      {/* Low-attendance is a toggle rather than a chip row: it composes with the semester facet. */}
      <FilterChips
        options={[
          { value: 'ALL', label: 'All students' },
          { value: 'LOW', label: `Below ${ATTENDANCE_THRESHOLD}%` },
        ]}
        selected={lowOnly ? 'LOW' : 'ALL'}
        onSelect={(value) => setLowOnly(value === 'LOW')}
        contentInset={screenPadding}
      />

      {/* Class scope, when arrived at from Class Detail. Removable, so nobody gets stuck. */}
      {scopedClassId ? (
        <View style={styles.scopeRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Filtered to
          </Text>
          <ClassCodeTag code={scopedClass?.displayCode ?? scopedClassId} />
          <Text
            variant="labelMd"
            color={palette.primary}
            onPress={() => setScopedClassId(undefined)}
            accessibilityRole="button"
            accessibilityLabel="Show students from all classes"
          >
            Show all
          </Text>
        </View>
      ) : null}

      {/*
        Counts the loaded slice against the filtered total, both straight from the service. When
        a class filter is active the total is that class's, so this never claims "of 175" while
        looking at a 48-student roster.
      */}
      {!isLoading ? (
        <View style={styles.countRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {hasNextPage
              ? `Showing ${students.length} of ${total}`
              : `${total} ${total === 1 ? 'student' : 'students'}`}
          </Text>
          {lowOnly && total > 0 ? (
            <Badge
              label={`${total} below threshold`}
              background={palette.errorContainer}
              foreground={palette.onErrorContainer}
              border={palette.errorContainer}
              icon="warning"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  /**
   * Footer for the paging state.
   *
   * Deliberately never a full-screen skeleton: replacing loaded rows while fetching page two
   * would throw away the user's scroll position and read as a crash. The already-loaded students
   * stay put and the footer does the talking.
   */
  const listFooter =
    students.length === 0 ? null : isFetchingNextPage ? (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={palette.primary} />
        <Text variant="labelMd" color={palette.onSurfaceVariant}>
          Loading more students...
        </Text>
      </View>
    ) : isFetchNextPageError ? (
      // A failed page is recoverable in place. The loaded rows are still valid, so this is an
      // inline retry rather than an error screen that discards them.
      <View style={styles.footer}>
        <Icon name="warning" size={16} color={palette.onTertiaryFixedVariant} />
        <Text variant="labelMd" color={palette.onSurfaceVariant}>
          Could not load more students.
        </Text>
        <Text
          variant="labelMd"
          color={palette.primary}
          onPress={retryNextPage}
          accessibilityRole="button"
          accessibilityLabel="Retry loading more students"
        >
          Retry
        </Text>
      </View>
    ) : total > pageSize ? (
      // Only worth saying when there was more than one page to load; on a short filtered result
      // it would be noise.
      <View style={styles.footer}>
        <Text variant="labelMd" color={palette.outline}>
          All {total} students loaded
        </Text>
      </View>
    ) : null;

  if (isLoading) {
    return (
      <>
        {header}
        <View style={[styles.loading, { paddingHorizontal: screenPadding }]}>
          <Card padded={false} style={styles.skeletonCard}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </Card>
        </View>
      </>
    );
  }

  return (
    <>
      {header}

      <FlatList
        data={students}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item, index }) => (
          <View style={[styles.rowWrap, { marginHorizontal: screenPadding }]}>
            <StudentRosterRow
              student={item}
              onPress={openProfile}
              // Institutional ID as secondary context; the roll number alone is ambiguous once the
              // list spans classes.
              meta={item.studentId}
              last={index === students.length - 1}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ marginHorizontal: screenPadding }}>
            <Card>
              {hasFilters ? (
                <EmptyState
                  icon="search"
                  title="No students match"
                  message="Try a different search, semester or class filter."
                  actionLabel="Clear filters"
                  onAction={clearAll}
                />
              ) : (
                <EmptyState
                  icon="students"
                  title="No students yet"
                  message="Students appear here once the administration office enrols them in your classes."
                />
              )}
            </Card>
          </View>
        }
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.listContent}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        onEndReached={loadMore}
        // Half a screen of runway. Enough that the next page usually lands before the user
        // reaches the bottom, without prefetching pages they may never scroll to.
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Rows are compact and rosters run long, so keep the render window tight. Paging bounds
        // what is fetched; virtualisation bounds what is mounted. Both are needed.
        initialNumToRender={14}
        windowSize={9}
        maxToRenderPerBatch={12}
        removeClippedSubviews
      />
    </>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    backgroundColor: palette.surfaceContainerLow,
  },
  loading: {
    flex: 1,
    paddingTop: spacing.md,
    backgroundColor: palette.surfaceContainerLow,
  },
  skeletonCard: {
    padding: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xl,
    backgroundColor: palette.surfaceContainerLow,
  },
  listHeader: {
    gap: spacing.sm,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.screen,
  },
  rowWrap: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: palette.surfaceContainerLowest,
  },
});
