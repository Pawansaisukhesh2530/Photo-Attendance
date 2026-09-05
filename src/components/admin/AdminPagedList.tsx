import type { ReactElement, ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Card } from '@/components/primitives/Card';
import { SkeletonListItem } from '@/components/primitives/Skeleton';
import { EmptyState, ErrorState } from '@/components/primitives/StateViews';
import { Text } from '@/components/primitives/Text';
import { palette, spacing, useResponsive } from '@/theme';
import type { IconName } from '@/components/primitives/Icon';

import { DataTableHeader, type DataColumn } from './DataTable';
import { PagedListFooter } from './PagedListFooter';

export interface AdminPagedListProps<T> {
  rows: T[];
  total: number;
  pageSize: number;
  keyExtractor: (row: T) => string;

  isLoading: boolean;
  isRefetching: boolean;
  error: unknown;
  onRetry: () => void;
  onRefresh: () => void;

  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  onEndReached: () => void;
  onRetryNextPage: () => void;

  /** Search field, chip rows, scope notes. Rendered above the list on every size class. */
  filters?: ReactNode;

  /** Desktop table columns. When omitted the list renders cards at every size. */
  columns?: DataColumn<T>[];
  /** Desktop row renderer. Required when `columns` is provided. */
  renderTableRow?: (row: T, index: number, width: number) => ReactElement;
  /** Mobile card renderer. */
  renderCard: (row: T, index: number) => ReactElement;

  /** Empty state when no filter is active. */
  emptyTitle: string;
  emptyMessage: string;
  emptyIcon?: IconName;
  /** Empty state when filters are narrowing the result. */
  filteredEmptyTitle?: string;
  filteredEmptyMessage?: string;
  hasFilters?: boolean;
  onClearFilters?: () => void;

  noun?: string;
}

/**
 * The list frame every admin directory uses.
 *
 * Written once because these five screens share the same obligations and the same failure modes:
 *
 *   - a loading state that is never a blank screen
 *   - an empty state distinct from a filtered-empty state, because "nothing exists" and "nothing
 *     matches your filter" call for different copy and different actions
 *   - an error state with retry
 *   - paging that appends rather than replacing, so fetching page two never discards page one or
 *     the user's scroll position
 *   - a table on desktop where extra columns carry real information, cards on touch, and never a
 *     table squeezed onto a phone
 *
 * The desktop/mobile switch happens here rather than in each screen, so a new admin list gets both
 * treatments correct without deciding anything.
 */
export function AdminPagedList<T>({
  rows,
  total,
  pageSize,
  keyExtractor,
  isLoading,
  isRefetching,
  error,
  onRetry,
  onRefresh,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  onEndReached,
  onRetryNextPage,
  filters,
  columns,
  renderTableRow,
  renderCard,
  emptyTitle,
  emptyMessage,
  emptyIcon = 'empty',
  filteredEmptyTitle = 'No matches',
  filteredEmptyMessage = 'Try a different search or filter.',
  hasFilters = false,
  onClearFilters,
  noun = 'records',
}: AdminPagedListProps<T>) {
  const { isExpanded, screenPadding, width } = useResponsive();
  const useTable = isExpanded && Boolean(columns && renderTableRow);

  // A first-load failure has nothing to preserve, so it takes the whole surface.
  if (error && !isLoading && rows.length === 0) {
    return (
      <View style={[styles.centre, { paddingHorizontal: screenPadding }]}>
        <ErrorState error={error} onRetry={onRetry} />
      </View>
    );
  }

  const header = (
    <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
      {filters}

      {!isLoading ? (
        <View style={styles.countRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {hasNextPage
              ? `Showing ${rows.length} of ${total}`
              : `${total} ${total === 1 ? noun.replace(/s$/, '') : noun}`}
          </Text>
        </View>
      ) : null}

      {useTable && rows.length > 0 ? (
        <View style={styles.tableHeader}>
          <DataTableHeader columns={columns!} width={width} />
        </View>
      ) : null}
    </View>
  );

  const empty = isLoading ? (
    <View style={{ paddingHorizontal: screenPadding }}>
      <Card padded={false} style={styles.skeletonCard}>
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
      </Card>
    </View>
  ) : (
    <View style={{ paddingHorizontal: screenPadding }}>
      <Card>
        {hasFilters ? (
          <EmptyState
            icon="search"
            title={filteredEmptyTitle}
            message={filteredEmptyMessage}
            {...(onClearFilters
              ? { actionLabel: 'Clear filters', onAction: onClearFilters }
              : {})}
          />
        ) : (
          <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />
        )}
      </Card>
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      renderItem={({ item, index }) =>
        useTable ? (
          <View style={[styles.tableBody, { marginHorizontal: screenPadding }]}>
            {renderTableRow!(item, index, width)}
          </View>
        ) : (
          <View style={[styles.cardWrap, { marginHorizontal: screenPadding }]}>
            {renderCard(item, index)}
          </View>
        )
      }
      ListEmptyComponent={empty}
      ListFooterComponent={
        <PagedListFooter
          loadedCount={rows.length}
          total={total}
          isFetchingNextPage={isFetchingNextPage}
          isFetchNextPageError={isFetchNextPageError}
          onRetry={onRetryNextPage}
          pageSize={pageSize}
          noun={noun}
        />
      }
      contentContainerStyle={styles.content}
      onRefresh={onRefresh}
      refreshing={isRefetching}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      // Paging bounds what is fetched; virtualisation bounds what is mounted. Institutional lists
      // need both.
      initialNumToRender={12}
      windowSize={9}
      maxToRenderPerBatch={12}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: palette.surfaceContainerLow,
  },
  content: {
    paddingBottom: spacing.xxl,
    backgroundColor: palette.surfaceContainerLow,
  },
  header: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tableHeader: {
    marginTop: spacing.xs,
  },
  tableBody: {
    overflow: 'hidden',
  },
  cardWrap: {
    marginBottom: spacing.sm,
  },
  skeletonCard: {
    padding: spacing.md,
  },
});
