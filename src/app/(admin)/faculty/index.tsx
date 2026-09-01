import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AdminPagedList,
  AdminScaffold,
  Avatar,
  Badge,
  Button,
  Card,
  DataTableRow,
  FacultyStatusBadge,
  FilterChips,
  Icon,
  AnimatedPressable,
  SearchField,
  Text,
  type DataColumn,
  type FilterChipOption,
} from '@/components';
import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInfiniteFaculty } from '@/hooks/useFacultyAdmin';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, radius, spacing, touch, useResponsive } from '@/theme';
import type { Faculty, FacultyStatus } from '@/types';

type StatusFilter = 'ALL' | FacultyStatus;
type DeptFilter = 'ALL' | string;

/**
 * Faculty directory.
 *
 * Filters live in the route, not in component state. This screen is a tab root, so navigating to it
 * with a `department` or `status` param does not remount it — seeding `useState` from a param would
 * go stale exactly as it did on the Students and Reports screens. Deriving from the route makes the
 * URL the single source of truth, which also means a desktop admin can bookmark or share a filtered
 * view.
 */
export default function AdminFacultyListScreen() {
  const params = useLocalSearchParams<{ q?: string; dept?: string; status?: string }>();
  const { isExpanded, screenPadding } = useResponsive();
  const { data: settings } = useInstitutionSettings();

  const search = params.q ?? '';
  const department: DeptFilter = params.dept && params.dept.length > 0 ? params.dept : 'ALL';
  const status: StatusFilter =
    params.status === 'ACTIVE' || params.status === 'INACTIVE' || params.status === 'ON_LEAVE'
      ? params.status
      : 'ALL';

  const setParam = useCallback((key: 'q' | 'dept' | 'status', value: string) => {
    router.setParams({ [key]: value });
  }, []);

  // The field stays responsive; only the query waits for a pause in typing.
  const debouncedSearch = useDebouncedValue(search.trim());

  const query = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(department !== 'ALL' ? { department } : {}),
      ...(status !== 'ALL' ? { status } : {}),
    }),
    [debouncedSearch, department, status],
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
  } = useInfiniteFaculty(Object.keys(query).length > 0 ? query : undefined);

  const rows = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data]);
  const total = data?.pages[data.pages.length - 1]?.total ?? 0;
  const pageSize = data?.pages[0]?.pageSize ?? DEFAULT_PAGE_SIZE;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const openMember = useCallback((member: Faculty) => {
    router.push({ pathname: '/(admin)/faculty/[facultyId]', params: { facultyId: member.id } });
  }, []);

  const hasFilters = search.trim().length > 0 || department !== 'ALL' || status !== 'ALL';
  const clearFilters = useCallback(() => {
    router.setParams({ q: '', dept: '', status: '' });
  }, []);

  const deptOptions = useMemo<FilterChipOption<DeptFilter>[]>(
    () => [
      { value: 'ALL', label: 'All departments' },
      ...(settings?.departments ?? []).map((d) => ({
        value: d,
        // Abbreviated: full department names do not fit a chip on a phone.
        label: d.split(' ').map((w) => w[0]).join('').toUpperCase(),
      })),
    ],
    [settings],
  );

  const columns = useMemo<DataColumn<Faculty>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        flex: 3,
        render: (row) => (
          <View style={styles.nameCell}>
            <Avatar name={row.name} uri={row.avatarUrl} size={32} />
            <View style={styles.nameText}>
              <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
                {row.name}
              </Text>
              <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                {row.email}
              </Text>
            </View>
          </View>
        ),
      },
      {
        key: 'employeeId',
        header: 'Faculty ID',
        flex: 1.4,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={1}>
            {row.employeeId}
          </Text>
        ),
      },
      {
        key: 'department',
        header: 'Department',
        flex: 2.2,
        minWidth: 1100,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={2}>
            {row.department ?? '—'}
          </Text>
        ),
      },
      {
        key: 'designation',
        header: 'Designation',
        flex: 1.8,
        minWidth: 1320,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={1}>
            {row.designation}
          </Text>
        ),
      },
      {
        key: 'classes',
        header: 'Classes',
        flex: 1,
        align: 'right',
        render: (row) => (
          <Text variant="bodyLg" color={palette.onSurface}>
            {row.assignedClassIds.length}
          </Text>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        flex: 1.4,
        render: (row) => <FacultyStatusBadge status={row.status} />,
      },
    ],
    [],
  );

  const addButton = (
    <Button
      label={isExpanded ? 'Add faculty' : 'Add'}
      icon="add"
      onPress={() => router.push('/(admin)/faculty/new')}
      {...(isExpanded ? {} : { size: 'sm' as const })}
    />
  );

  return (
    <AdminScaffold
      active="faculty"
      title="Faculty"
      subtitle={`${total} ${total === 1 ? 'member' : 'members'} across the institution`}
      breadcrumbs={[{ label: 'Administration', href: '/(admin)/dashboard' }, { label: 'Faculty' }]}
      action={addButton}
      {...(settings
        ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
        : {})}
    >
      <AdminPagedList<Faculty>
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
        noun="faculty"
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyIcon="faculty"
        emptyTitle="No faculty yet"
        emptyMessage="Add a faculty member to begin assigning classes."
        filteredEmptyTitle="No faculty match"
        filteredEmptyMessage="Try a different search, department or status."
        columns={columns}
        renderTableRow={(row, index, width) => (
          <DataTableRow
            row={row}
            columns={columns}
            width={width}
            onPress={openMember}
            last={index === rows.length - 1}
            accessibilityLabel={`${row.name}, ${row.employeeId}, ${row.department ?? 'no department'}, ${row.assignedClassIds.length} classes, ${row.status ?? 'ACTIVE'}`}
          />
        )}
        renderCard={(row) => (
          <AnimatedPressable
            onPress={() => openMember(row)}
            feedback="card"
            accessibilityRole="button"
            accessibilityLabel={`${row.name}, ${row.employeeId}, ${row.assignedClassIds.length} classes, ${row.status ?? 'ACTIVE'}`}
          >
            <Card>
              <View style={styles.cardTop}>
                <Avatar name={row.name} uri={row.avatarUrl} size={44} />
                <View style={styles.cardText}>
                  <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                    {row.designation}
                  </Text>
                </View>
                <Icon name="chevronRight" size={20} color={palette.outline} />
              </View>

              <View style={styles.cardMeta}>
                <FacultyStatusBadge status={row.status} />
                <Badge
                  label={`${row.assignedClassIds.length} ${row.assignedClassIds.length === 1 ? 'class' : 'classes'}`}
                  icon="classes"
                />
              </View>

              <View style={styles.cardFacts}>
                <Text variant="labelMd" color={palette.outline} numberOfLines={1}>
                  {row.employeeId}
                </Text>
                <Text variant="labelMd" color={palette.outline} numberOfLines={1}>
                  {row.department ?? '—'}
                </Text>
              </View>
            </Card>
          </AnimatedPressable>
        )}
        filters={
          <>
            <SearchField
              value={search}
              onChangeText={(value) => setParam('q', value)}
              placeholder="Search name, ID, email or department"
            />

            <FilterChips
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'ON_LEAVE', label: 'On leave' },
                { value: 'INACTIVE', label: 'Inactive' },
              ]}
              selected={status}
              onSelect={(value) => setParam('status', value === 'ALL' ? '' : value)}
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

            {department !== 'ALL' ? (
              <View style={styles.scopeRow}>
                <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.flex}>
                  {department}
                </Text>
                <Text
                  variant="labelMd"
                  color={palette.primary}
                  onPress={() => setParam('dept', '')}
                  accessibilityRole="button"
                  accessibilityLabel="Show all departments"
                >
                  Clear
                </Text>
              </View>
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
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cardFacts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: palette.outlineVariant,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.min - 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainer,
  },
  flex: {
    flex: 1,
  },
});
