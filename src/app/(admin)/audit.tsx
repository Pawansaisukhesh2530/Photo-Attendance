import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AdminPagedList,
  AdminScaffold,
  AuditTimeline,
  Card,
  DataTableRow,
  FilterChips,
  Icon,
  SearchField,
  Text,
  type DataColumn,
  type FilterChipOption,
} from '@/components';
import { DEFAULT_PAGE_SIZE } from '@/constants/config';
import { useInfiniteAuditEntries } from '@/hooks/useAudit';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, radius, spacing, useResponsive } from '@/theme';
import type { AuditAction, AuditEntry } from '@/types';
import { formatShortDate, formatTime } from '@/utils/datetime';

type ActionFilter = 'ALL' | AuditAction;
type GroupFilter = 'ALL' | 'ATTENDANCE' | 'ADMIN';

const ATTENDANCE_ACTIONS: AuditAction[] = [
  'ATTENDANCE_CAPTURED',
  'STATUS_CHANGED',
  'TWIN_RESOLVED',
  'SESSION_FINALIZED',
  'FINALIZED_SESSION_EDITED',
];

/** Human labels, so the filter row does not show raw enum values. */
const ACTION_LABELS: Partial<Record<AuditAction, string>> = {
  ATTENDANCE_CAPTURED: 'Captured',
  STATUS_CHANGED: 'Status changed',
  TWIN_RESOLVED: 'Twin resolved',
  SESSION_FINALIZED: 'Finalized',
  FINALIZED_SESSION_EDITED: 'Amended',
  FACULTY_CREATED: 'Faculty added',
  FACULTY_UPDATED: 'Faculty updated',
  FACULTY_STATUS_CHANGED: 'Status changed',
  CLASS_CREATED: 'Class created',
  CLASS_UPDATED: 'Class updated',
  FACULTY_ASSIGNED: 'Assigned',
  ENROLMENT_UPDATED: 'Enrolment',
  SETTING_CHANGED: 'Setting changed',
};

/**
 * Institution-wide audit log.
 *
 * READ-ONLY, permanently. There is no edit and no delete anywhere on this screen or in the contract
 * behind it, and there must never be: an audit trail an administrator can alter is not evidence of
 * anything. The service exposes only reads.
 *
 * Distinct from the faculty audit screen, which is scoped to a single session and shown as a
 * timeline. This one spans the institution, mixes attendance and administrative actions in one
 * chronology — so "what happened to this class in March" is one query, not two — and pages, because
 * the log grows without bound.
 *
 * On desktop it becomes a table where before/after values get their own column. On touch it reuses
 * `AuditTimeline`, the same component the faculty screen renders.
 */
export default function AdminAuditScreen() {
  const params = useLocalSearchParams<{ q?: string; action?: string; group?: string }>();
  const { isExpanded, screenPadding } = useResponsive();
  const { data: settings } = useInstitutionSettings();

  const search = params.q ?? '';
  const action = (params.action && params.action.length > 0 ? params.action : 'ALL') as ActionFilter;
  const group: GroupFilter =
    params.group === 'ATTENDANCE' || params.group === 'ADMIN' ? params.group : 'ALL';

  const setParam = useCallback((key: 'q' | 'action' | 'group', value: string) => {
    router.setParams({ [key]: value });
  }, []);

  const debouncedSearch = useDebouncedValue(search.trim());

  const query = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(action !== 'ALL' ? { action } : {}),
    }),
    [debouncedSearch, action],
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
  } = useInfiniteAuditEntries(Object.keys(query).length > 0 ? query : undefined);

  const allRows = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data]);

  /*
   * The attendance/administration split is applied client-side over loaded pages.
   *
   * `AuditQuery` has `action` and `entityType` but no "kind" dimension, and inventing one on the
   * contract for a two-way UI convenience would be the wrong trade. Stated in the UI so the count
   * is not mistaken for a server total.
   */
  const rows = useMemo(() => {
    if (group === 'ALL') return allRows;
    const isAttendance = (e: AuditEntry): boolean => ATTENDANCE_ACTIONS.includes(e.action);
    return allRows.filter((e) => (group === 'ATTENDANCE' ? isAttendance(e) : !isAttendance(e)));
  }, [allRows, group]);

  const total = data?.pages[data.pages.length - 1]?.total ?? 0;
  const pageSize = data?.pages[0]?.pageSize ?? DEFAULT_PAGE_SIZE;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const hasFilters = search.trim().length > 0 || action !== 'ALL' || group !== 'ALL';
  const clearFilters = useCallback(() => {
    router.setParams({ q: '', action: '', group: '' });
  }, []);

  const actionOptions = useMemo<FilterChipOption<ActionFilter>[]>(() => {
    const pool: AuditAction[] =
      group === 'ATTENDANCE'
        ? ATTENDANCE_ACTIONS
        : group === 'ADMIN'
          ? (Object.keys(ACTION_LABELS) as AuditAction[]).filter(
              (a) => !ATTENDANCE_ACTIONS.includes(a),
            )
          : (Object.keys(ACTION_LABELS) as AuditAction[]);

    return [
      { value: 'ALL', label: 'All actions' },
      ...pool.map((a) => ({ value: a, label: ACTION_LABELS[a] ?? a })),
    ];
  }, [group]);

  const columns = useMemo<DataColumn<AuditEntry>[]>(
    () => [
      {
        key: 'when',
        header: 'When',
        flex: 1.4,
        render: (row) => (
          <View>
            <Text variant="bodyMd" color={palette.onSurface}>
              {formatShortDate(row.at)}
            </Text>
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              {formatTime(row.at)}
            </Text>
          </View>
        ),
      },
      {
        key: 'action',
        header: 'Action',
        flex: 1.6,
        render: (row) => (
          <Text variant="bodyMd" color={palette.onSurface} numberOfLines={2}>
            {ACTION_LABELS[row.action] ?? row.action}
          </Text>
        ),
      },
      {
        key: 'subject',
        header: 'Subject',
        flex: 2.2,
        render: (row) => (
          <View>
            <Text variant="bodyMd" color={palette.onSurface} numberOfLines={1}>
              {row.studentName ?? row.entityLabel ?? row.classDisplayCode ?? '—'}
            </Text>
            {row.rollNumber ? (
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                {row.rollNumber}
              </Text>
            ) : null}
          </View>
        ),
      },
      {
        key: 'change',
        header: 'Change',
        flex: 2.4,
        minWidth: 1180,
        render: (row) => {
          const previous = row.previousStatus ?? row.previousValue;
          const next = row.newStatus ?? row.newValue;
          if (!previous && !next) {
            return (
              <Text variant="bodyMd" color={palette.outline}>
                —
              </Text>
            );
          }
          return (
            <View style={styles.changeCell}>
              <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                {previous ?? 'Not set'}
              </Text>
              <Icon name="forward" size={13} color={palette.outline} />
              <Text variant="labelMd" color={palette.onSurface} numberOfLines={1}>
                {next ?? 'Cleared'}
              </Text>
            </View>
          );
        },
      },
      {
        key: 'actor',
        header: 'By',
        flex: 1.8,
        render: (row) => (
          <View>
            <Text variant="bodyMd" color={palette.onSurface} numberOfLines={1}>
              {row.actorName}
            </Text>
            <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
              {row.actorRole}
            </Text>
          </View>
        ),
      },
      {
        key: 'reason',
        header: 'Reason',
        flex: 2,
        minWidth: 1420,
        render: (row) => (
          <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={2}>
            {row.reason ?? '—'}
          </Text>
        ),
      },
    ],
    [],
  );

  return (
    <AdminScaffold
      active="audit"
      title="Audit log"
      subtitle={`${total} recorded ${total === 1 ? 'change' : 'changes'} · read-only`}
      breadcrumbs={[{ label: 'Administration', href: '/(admin)/dashboard' }, { label: 'Audit' }]}
      onBack={isExpanded ? undefined : () => router.back()}
      {...(settings
        ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
        : {})}
    >
      <AdminPagedList<AuditEntry>
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
        noun="entries"
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        emptyIcon="audit"
        emptyTitle="Nothing recorded yet"
        emptyMessage="Changes to attendance, faculty, classes and settings appear here."
        filteredEmptyTitle="No entries match"
        filteredEmptyMessage="Try a different action, group or search."
        columns={columns}
        renderTableRow={(row, index, width) => (
          <DataTableRow
            row={row}
            columns={columns}
            width={width}
            last={index === rows.length - 1}
            accessibilityLabel={`${ACTION_LABELS[row.action] ?? row.action} by ${row.actorName} on ${formatShortDate(row.at)}`}
          />
        )}
        renderCard={(row) => (
          <Card padded={false} style={styles.timelineCard}>
            <AuditTimeline entries={[row]} />
          </Card>
        )}
        filters={
          <>
            <View style={styles.readOnlyNote}>
              <Icon name="lock" size={14} color={palette.outline} />
              <Text variant="labelMd" color={palette.outline} style={styles.flex}>
                Audit entries are permanent and cannot be edited or deleted.
              </Text>
            </View>

            <SearchField
              value={search}
              onChangeText={(value) => setParam('q', value)}
              placeholder="Search actor, student, class or reason"
            />

            <FilterChips
              options={[
                { value: 'ALL', label: 'Everything' },
                { value: 'ATTENDANCE', label: 'Attendance' },
                { value: 'ADMIN', label: 'Administration' },
              ]}
              selected={group}
              onSelect={(value) => {
                setParam('group', value === 'ALL' ? '' : value);
                // An action from the other group would contradict the new group filter.
                setParam('action', '');
              }}
              contentInset={screenPadding}
            />

            <FilterChips
              options={actionOptions}
              selected={action}
              onSelect={(value) => setParam('action', value === 'ALL' ? '' : value)}
              contentInset={screenPadding}
            />

            {group !== 'ALL' ? (
              <Text variant="labelMd" color={palette.outline}>
                Showing {rows.length} of the {allRows.length} loaded entries. The group filter is
                applied to loaded pages, not by the server.
              </Text>
            ) : null}
          </>
        }
      />
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  changeCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  timelineCard: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  readOnlyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainer,
  },
  flex: {
    flex: 1,
  },
});
