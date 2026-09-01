import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AdminPagedList,
  AdminScaffold,
  Avatar,
  Badge,
  Card,
  DataTableRow,
  FilterChips,
  Icon,
  AnimatedPressable,
  SearchField,
  StudentRosterRow,
  Text,
  type DataColumn,
  type FilterChipOption,
} from '@/components';
import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { useInfiniteStudents } from '@/hooks/useStudents';
import { palette, spacing, useResponsive } from '@/theme';
import type { Student } from '@/types';

type SemesterFilter = 'ALL' | string;
type DeptFilter = 'ALL' | string;

/**
 * Institution-wide student directory.
 *
 * Reuses the Phase 7 student architecture wholesale: the same `StudentQuery`, the same
 * `useInfiniteStudents` hook, the same pagination. Admin scope is not a new capability — an
 * unfiltered `getStudents` already spans the institution, and faculty screens narrow it by class.
 *
 * On touch this renders `StudentRosterRow`, unchanged from the faculty directory, so a student looks
 * identical wherever they appear. On desktop it becomes a table, where the extra columns
 * (department, semester, face enrolment) carry information a card has no room for.
 *
 * Filters live in the route, so a filtered directory can be bookmarked and a tab-root remount
 * cannot leave the scope stale.
 */
export default function AdminStudentsScreen() {
  const params = useLocalSearchParams<{ q?: string; sem?: string; dept?: string; low?: string }>();
  const { isExpanded, screenPadding } = useResponsive();
  const { data: settings } = useInstitutionSettings();

  const search = params.q ?? '';
  const semester: SemesterFilter = params.sem && params.sem.length > 0 ? params.sem : 'ALL';
  const department: DeptFilter = params.dept && params.dept.length > 0 ? params.dept : 'ALL';
  const lowOnly = params.low === '1';

  const setParam = useCallback((key: 'q' | 'sem' | 'dept' | 'low', value: string) => {
    router.setParams({ [key]: value });
  }, []);

  const debouncedSearch = useDebouncedValue(search.trim());
  const threshold = settings?.attendanceThreshold;

  const query = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(semester !== 'ALL' ? { semester: Number(semester) } : {}),
      ...(department !== 'ALL' ? { department } : {}),
      ...(lowOnly ? { lowAttendanceOnly: true } : {}),
    }),
    [debouncedSearch, semester, department, lowOnly],
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

  const rows = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data]);
  const total = data?.pages[data.pages.length - 1]?.total ?? 0;
  const pageSize = data?.pages[0]?.pageSize ?? DEFAULT_PAGE_SIZE;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const openStudent = useCallback((student: Student) => {
    router.push({
      pathname: '/(admin)/students/[studentId]',
      params: { studentId: student.id },
    });
  }, []);

  const hasFilters =
    search.trim().length > 0 || semester !== 'ALL' || department !== 'ALL' || lowOnly;
  const clearFilters = useCallback(() => {
    router.setParams({ q: '', sem: '', dept: '', low: '' });
  }, []);

  const semesterOptions = useMemo<FilterChipOption<SemesterFilter>[]>(() => {
    const count = settings?.semesterCount ?? 8;
    return [
      { value: 'ALL', label: 'All semesters' },
      ...Array.from({ length: count }, (_, i) => ({
        value: String(i + 1),
        label: `Sem ${i + 1}`,
      })),
    ];
  }, [settings]);

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

  const columns = useMemo<DataColumn<Student>[]>(
    () => [
      {
        key: 'name',
        header: 'Student',
        flex: 3,
        render: (row) => (
          <View style={styles.nameCell}>
            <Avatar name={row.name} uri={row.avatarUrl} size={32} />
            <View style={styles.nameText}>
              <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
                {row.name}
              </Text>
              <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                {row.rollNumber}
              </Text>
            </View>
          </View>
        ),
      },
      {
        key: 'studentId',
        header: 'Student ID',
        flex: 1.5,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={1}>
            {row.studentId}
          </Text>
        ),
      },
      {
        key: 'department',
        header: 'Department',
        flex: 2.2,
        minWidth: 1180,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={2}>
            {row.department}
          </Text>
        ),
      },
      {
        key: 'semester',
        header: 'Sem / Sec',
        flex: 1.1,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurfaceVariant}>
            {row.semester} / {row.section}
          </Text>
        ),
      },
      {
        key: 'face',
        header: 'Face',
        flex: 1.2,
        minWidth: 1340,
        render: (row) =>
          // Display only. A boolean the backend owns; nothing here captures or stores biometrics.
          row.faceEnrolled ? (
            <Badge
              label="Enrolled"
              icon="present"
              background={palette.secondaryContainer}
              foreground={palette.onSecondaryContainer}
              border={palette.secondaryContainer}
            />
          ) : (
            <Badge label="Not enrolled" icon="unknown" />
          ),
      },
      {
        key: 'attendance',
        header: 'Attendance',
        flex: 1.2,
        align: 'right',
        render: (row) => {
          const low = threshold !== undefined && row.overallAttendance < threshold;
          return (
            <View style={styles.pctCell}>
              {low ? (
                <Icon name="warning" size={14} color={palette.onTertiaryFixedVariant} />
              ) : null}
              <Text
                variant="bodyLg"
                color={low ? palette.onTertiaryFixedVariant : palette.onSurface}
              >
                {row.overallAttendance}%
              </Text>
            </View>
          );
        },
      },
    ],
    [threshold],
  );

  return (
    <AdminScaffold
      active="students"
      title="Students"
      subtitle={`${total} ${total === 1 ? 'student' : 'students'} across the institution`}
      breadcrumbs={[{ label: 'Administration', href: '/(admin)/dashboard' }, { label: 'Students' }]}
      {...(settings
        ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
        : {})}
    >
      <AdminPagedList<Student>
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
        noun="students"
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyIcon="students"
        emptyTitle="No students enrolled"
        emptyMessage="Students appear here once the administration office enrols them."
        filteredEmptyTitle="No students match"
        filteredEmptyMessage="Try a different search, semester or department."
        columns={columns}
        renderTableRow={(row, index, width) => (
          <DataTableRow
            row={row}
            columns={columns}
            width={width}
            onPress={openStudent}
            last={index === rows.length - 1}
            accessibilityLabel={`${row.name}, ${row.rollNumber}, semester ${row.semester}, ${row.overallAttendance} percent attendance`}
          />
        )}
        renderCard={(row, index) => (
          <View style={styles.rowWrap}>
            <StudentRosterRow
              student={row}
              onPress={openStudent}
              meta={row.studentId}
              last={index === rows.length - 1}
            />
          </View>
        )}
        filters={
          <>
            <SearchField
              value={search}
              onChangeText={(value) => setParam('q', value)}
              placeholder="Search name, ID or roll number"
            />

            <FilterChips
              options={[
                { value: 'ALL', label: 'All students' },
                { value: 'LOW', label: threshold ? `Below ${threshold}%` : 'Below threshold' },
              ]}
              selected={lowOnly ? 'LOW' : 'ALL'}
              onSelect={(value) => setParam('low', value === 'LOW' ? '1' : '')}
              contentInset={screenPadding}
            />

            <FilterChips
              options={semesterOptions}
              selected={semester}
              onSelect={(value) => setParam('sem', value === 'ALL' ? '' : value)}
              contentInset={screenPadding}
            />

            {isExpanded && deptOptions.length > 2 ? (
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
  nameCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  nameText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  pctCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowWrap: {
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
