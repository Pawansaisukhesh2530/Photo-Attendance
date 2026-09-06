import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AdminPagedList,
  AdminScaffold,
  Badge,
  Button,
  Card,
  ClassCodeTag,
  DataTableRow,
  FilterChips,
  Icon,
  AnimatedPressable,
  ProgressBar,
  SearchField,
  Text,
  type DataColumn,
  type FilterChipOption,
} from '@/components';
import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { useInfiniteClasses } from '@/hooks/useClassAdmin';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, spacing, useResponsive } from '@/theme';
import type { CourseClass } from '@/types';

type ScopeFilter = 'ALL' | 'UNASSIGNED' | 'ARCHIVED';
type DeptFilter = 'ALL' | string;

/**
 * Class catalogue.
 *
 * Uses `getPagedClasses`, which spans the institution. The faculty class list still calls the
 * unpaged `getClasses` and is scoped to the signed-in lecturer — two entry points over one filtering
 * routine in the service, so a query cannot mean different things on the two screens.
 *
 * The scope chips answer the two questions an administrator actually arrives with: which classes
 * have nobody teaching them, and which are archived.
 */
export default function AdminClassesScreen() {
  const params = useLocalSearchParams<{ q?: string; dept?: string; sem?: string; scope?: string }>();
  const { isExpanded, screenPadding } = useResponsive();
  const { data: settings } = useInstitutionSettings();

  const search = params.q ?? '';
  const department: DeptFilter = params.dept && params.dept.length > 0 ? params.dept : 'ALL';
  const semester = params.sem && params.sem.length > 0 ? params.sem : 'ALL';
  const scope: ScopeFilter =
    params.scope === 'UNASSIGNED' || params.scope === 'ARCHIVED' ? params.scope : 'ALL';

  const setParam = useCallback((key: 'q' | 'dept' | 'sem' | 'scope', value: string) => {
    router.setParams({ [key]: value });
  }, []);

  const debouncedSearch = useDebouncedValue(search.trim());
  const threshold = settings?.attendanceThreshold;

  const query = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(department !== 'ALL' ? { department } : {}),
      ...(semester !== 'ALL' ? { semester: Number(semester) } : {}),
      ...(scope === 'UNASSIGNED' ? { unassignedOnly: true } : {}),
      // Archived is opt-in: an admin looking at "classes" means the ones running now.
      ...(scope === 'ARCHIVED' ? { status: 'ARCHIVED' as const } : { status: 'ACTIVE' as const }),
    }),
    [debouncedSearch, department, semester, scope],
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
  } = useInfiniteClasses(query);

  const rows = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data]);
  const total = data?.pages[data.pages.length - 1]?.total ?? 0;
  const pageSize = data?.pages[0]?.pageSize ?? DEFAULT_PAGE_SIZE;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const openClass = useCallback((course: CourseClass) => {
    router.push({ pathname: '/(admin)/classes/[classId]', params: { classId: course.id } });
  }, []);

  const hasFilters =
    search.trim().length > 0 || department !== 'ALL' || semester !== 'ALL' || scope !== 'ALL';
  const clearFilters = useCallback(() => {
    router.setParams({ q: '', dept: '', sem: '', scope: '' });
  }, []);

  const deptOptions = useMemo<FilterChipOption<DeptFilter>[]>(
    () => [
      { value: 'ALL', label: 'All departments' },
      ...(settings?.departments ?? []).map((d) => ({
        value: d,
        label: d.split(' ').map((w) => w[0]).join('').toUpperCase(),
      })),
    ],
    [settings],
  );

  const semesterOptions = useMemo<FilterChipOption<string>[]>(() => {
    const count = settings?.semesterCount ?? 8;
    return [
      { value: 'ALL', label: 'All semesters' },
      ...Array.from({ length: count }, (_, i) => ({ value: String(i + 1), label: `Sem ${i + 1}` })),
    ];
  }, [settings]);

  const columns = useMemo<DataColumn<CourseClass>[]>(
    () => [
      {
        key: 'subject',
        header: 'Class',
        flex: 3,
        render: (row) => (
          <View style={styles.subjectCell}>
            <ClassCodeTag code={row.displayCode} />
            <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1} style={styles.flex}>
              {row.subject}
            </Text>
          </View>
        ),
      },
      {
        key: 'faculty',
        header: 'Lecturer',
        flex: 2.2,
        render: (row) =>
          row.facultyName ? (
            <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={1}>
              {row.facultyName}
            </Text>
          ) : (
            // Called out rather than left blank: an unassigned class is an action item.
            <Badge
              label="Unassigned"
              icon="warning"
              background={palette.tertiaryFixed}
              foreground={palette.onTertiaryFixedVariant}
              border={palette.tertiaryFixedDim}
            />
          ),
      },
      {
        key: 'department',
        header: 'Department',
        flex: 2,
        minWidth: 1220,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={2}>
            {row.department ?? '—'}
          </Text>
        ),
      },
      {
        key: 'semester',
        header: 'Sem',
        flex: 0.7,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurfaceVariant}>
            {row.semester}
          </Text>
        ),
      },
      {
        key: 'students',
        header: 'Students',
        flex: 1,
        align: 'right',
        render: (row) => (
          <Text variant="bodyLg" color={palette.onSurface}>
            {row.studentCount}
          </Text>
        ),
      },
      {
        key: 'attendance',
        header: 'Attendance',
        flex: 1.4,
        render: (row) => {
          const low = threshold !== undefined && row.attendancePercentage < threshold;
          return (
            <View style={styles.pctCell}>
              <Text
                variant="bodyMd"
                color={low ? palette.onTertiaryFixedVariant : palette.onSurface}
              >
                {row.attendancePercentage}%
              </Text>
              <ProgressBar
                progress={row.attendancePercentage / 100}
                color={low ? palette.tertiaryFixedDim : palette.primary}
                height={4}
                animated={false}
              />
            </View>
          );
        },
      },
    ],
    [threshold],
  );

  return (
    <AdminScaffold
      active="classes"
      title="Classes"
      subtitle={`${total} ${total === 1 ? 'class' : 'classes'} in the catalogue`}
      breadcrumbs={[{ label: 'Administration', href: '/(admin)/dashboard' }, { label: 'Classes' }]}
      action={
        <Button
          label={isExpanded ? 'Create class' : 'Create'}
          icon="add"
          onPress={() => router.push('/(admin)/classes/new')}
          {...(isExpanded ? {} : { size: 'sm' as const })}
        />
      }
      {...(settings
        ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
        : {})}
    >
      <AdminPagedList<CourseClass>
        rows={rows}
        total={total}
        pageSize={pageSize}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        isRefetching={isRefetching}
        error={error}
        onRetry={() => void refetch()}
        onRefresh={() => void refetch()}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={isFetchNextPageError}
        onEndReached={loadMore}
        onRetryNextPage={() => void fetchNextPage()}
        noun="classes"
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyIcon="classes"
        emptyTitle="No classes yet"
        emptyMessage="Create a class to begin assigning lecturers and enrolling students."
        filteredEmptyTitle="No classes match"
        filteredEmptyMessage="Try a different search, department or semester."
        columns={columns}
        renderTableRow={(row, index, width) => (
          <DataTableRow
            row={row}
            columns={columns}
            width={width}
            onPress={openClass}
            last={index === rows.length - 1}
            accessibilityLabel={`${row.subject}, ${row.displayCode}, ${row.facultyName || 'unassigned'}, ${row.studentCount} ${row.studentCount === 1 ? 'student' : 'students'}, ${row.attendancePercentage} percent`}
          />
        )}
        renderCard={(row) => (
          <AnimatedPressable
            onPress={() => openClass(row)}
            feedback="card"
            accessibilityRole="button"
            accessibilityLabel={`${row.subject}, ${row.displayCode}, ${row.facultyName || 'unassigned'}, ${row.studentCount} ${row.studentCount === 1 ? 'student' : 'students'}`}
          >
            <Card>
              <View style={styles.cardTop}>
                <ClassCodeTag code={row.displayCode} />
                <Text
                  variant="bodyLg"
                  color={palette.onSurface}
                  numberOfLines={1}
                  style={styles.flex}
                >
                  {row.subject}
                </Text>
                <Icon name="chevronRight" size={20} color={palette.outline} />
              </View>

              <View style={styles.cardMeta}>
                {row.facultyName ? (
                  <Badge label={row.facultyName} icon="faculty" />
                ) : (
                  <Badge
                    label="Unassigned"
                    icon="warning"
                    background={palette.tertiaryFixed}
                    foreground={palette.onTertiaryFixedVariant}
                    border={palette.tertiaryFixedDim}
                  />
                )}
                <Badge label={`Sem ${row.semester}`} icon="calendar" />
                <Badge label={`${row.studentCount} ${row.studentCount === 1 ? 'student' : 'students'}`} icon="students" />
              </View>

              <View style={styles.cardBar}>
                <Text variant="labelMd" color={palette.onSurfaceVariant}>
                  {row.attendancePercentage}% attendance
                </Text>
                <ProgressBar
                  progress={row.attendancePercentage / 100}
                  color={
                    threshold !== undefined && row.attendancePercentage < threshold
                      ? palette.tertiaryFixedDim
                      : palette.primary
                  }
                  height={5}
                  animated={false}
                />
              </View>
            </Card>
          </AnimatedPressable>
        )}
        filters={
          <>
            <SearchField
              value={search}
              onChangeText={(value) => setParam('q', value)}
              placeholder="Search subject, code or lecturer"
            />

            <FilterChips
              options={[
                { value: 'ALL', label: 'Active' },
                { value: 'UNASSIGNED', label: 'Needs a lecturer' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
              selected={scope}
              onSelect={(value) => setParam('scope', value === 'ALL' ? '' : value)}
              contentInset={screenPadding}
            />

            <FilterChips
              options={semesterOptions}
              selected={semester}
              onSelect={(value) => setParam('sem', value === 'ALL' ? '' : value)}
              contentInset={screenPadding}
            />

            {deptOptions.length > 2 ? (
              <FilterChips
                options={deptOptions}
                selected={department}
                onSelect={(value) => setParam('dept', value === 'ALL' ? '' : value)}
                contentInset={screenPadding}
              />
            ) : null}
          </>
        }
      />
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  subjectCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  pctCell: {
    gap: spacing.xs,
    minWidth: 0,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cardBar: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
