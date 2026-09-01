import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/primitives/Text';
import { palette, spacing } from '@/theme';

export interface SectionHeaderProps {
  title: string;
  /** Muted count or status on the right, e.g. "3 scheduled". */
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Stitch draws a hairline under section headers on the dashboard. */
  divider?: boolean;
}

/**
 * Section heading row.
 *
 * Matches the Stitch pattern: `title-lg` on the left, a muted count or a primary-coloured
 * text action on the right, optionally underlined with a hairline.
 */
export function SectionHeader({
  title,
  meta,
  actionLabel,
  onAction,
  divider = false,
}: SectionHeaderProps) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <Text variant="titleLg" color={palette.onSurface} style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {meta ? (
        <Text variant="labelMd" color={palette.onSurfaceVariant}>
          {meta}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text variant="labelMd" color={palette.primary}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: palette.outlineVariant,
    marginBottom: spacing.xs,
  },
  title: {
    flexShrink: 1,
  },
});
