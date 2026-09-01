import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/primitives/Icon';
import { Text } from '@/components/primitives/Text';
import { palette, spacing } from '@/theme';

export interface PagedListFooterProps {
  loadedCount: number;
  total: number;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  onRetry: () => void;
  /** Page size, so the "all loaded" note is suppressed when there was only ever one page. */
  pageSize: number;
  noun?: string;
}

/**
 * Footer for every paged admin list.
 *
 * One component so all five admin lists behave identically, and so the rule that matters is
 * enforced in one place: a next-page fetch never replaces the rows already on screen. Loading page
 * two must not discard page one and the user's scroll position — the footer does the talking while
 * the list stays put.
 *
 * A failed page is recoverable in place with an inline retry, because the loaded rows are still
 * valid and an error screen would throw them away.
 */
export function PagedListFooter({
  loadedCount,
  total,
  isFetchingNextPage,
  isFetchNextPageError,
  onRetry,
  pageSize,
  noun = 'records',
}: PagedListFooterProps) {
  if (loadedCount === 0) return null;

  if (isFetchingNextPage) {
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={palette.primary} />
        <Text variant="labelMd" color={palette.onSurfaceVariant}>
          Loading more {noun}...
        </Text>
      </View>
    );
  }

  if (isFetchNextPageError) {
    return (
      <View style={styles.footer}>
        <Icon name="warning" size={16} color={palette.onTertiaryFixedVariant} />
        <Text variant="labelMd" color={palette.onSurfaceVariant}>
          Could not load more {noun}.
        </Text>
        <Text
          variant="labelMd"
          color={palette.primary}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={`Retry loading more ${noun}`}
        >
          Retry
        </Text>
      </View>
    );
  }

  // Only worth saying when there was more than one page to load.
  if (total > pageSize) {
    return (
      <View style={styles.footer}>
        <Text variant="labelMd" color={palette.outline}>
          All {total} {noun} loaded
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.screen,
  },
});
