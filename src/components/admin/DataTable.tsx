import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, touch } from '@/theme';

export interface DataColumn<T> {
  key: string;
  header: string;
  /** Flex weight. Columns share the row proportionally rather than at fixed pixel widths. */
  flex: number;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /**
   * Hidden below this width, in dp. Lets one column set serve a 1000dp laptop and a 1600dp
   * monitor without either becoming cramped or sparse.
   */
  minWidth?: number;
}

export interface DataTableHeaderProps<T> {
  columns: DataColumn<T>[];
  width: number;
}

/**
 * Column header row. Rendered as a FlatList header so it scrolls with the body on short viewports
 * but stays a single source of column geometry.
 */
export function DataTableHeader<T>({ columns, width }: DataTableHeaderProps<T>) {
  return (
    <View style={styles.headerRow}>
      {columns
        .filter((c) => !c.minWidth || width >= c.minWidth)
        .map((column) => (
          <View key={column.key} style={{ flex: column.flex, minWidth: 0 }}>
            <Text
              variant="labelMd"
              color={palette.onSurfaceVariant}
              numberOfLines={1}
              align={column.align === 'right' ? 'right' : 'left'}
            >
              {column.header.toUpperCase()}
            </Text>
          </View>
        ))}
    </View>
  );
}

export interface DataTableRowProps<T> {
  row: T;
  columns: DataColumn<T>[];
  width: number;
  onPress?: (row: T) => void;
  last?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * One table row.
 *
 * Desktop-only by convention — callers render cards on `compact`/`regular` instead. A table
 * squeezed onto a phone is the failure mode this whole component exists to avoid, so the decision
 * is made by the screen, which knows its own size class, rather than hidden in here.
 *
 * `minWidth: 0` on every cell is load-bearing on web: without it a long unbroken value forces the
 * row wider than its container and produces horizontal page overflow.
 */
export function DataTableRow<T>({
  row,
  columns,
  width,
  onPress,
  last = false,
  style,
  accessibilityLabel,
}: DataTableRowProps<T>) {
  return (
    <AnimatedPressable
      onPress={onPress ? () => onPress(row) : undefined}
      disabled={!onPress}
      feedback={onPress ? 'opacity' : 'none'}
      accessibilityRole={onPress ? 'button' : 'text'}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={[styles.row, !last && styles.rowDivider, style]}
    >
      {columns
        .filter((c) => !c.minWidth || width >= c.minWidth)
        .map((column) => (
          <View
            key={column.key}
            style={[
              { flex: column.flex, minWidth: 0 },
              column.align === 'right' && styles.cellRight,
            ]}
          >
            {column.render(row)}
          </View>
        ))}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: palette.surfaceContainer,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: palette.outlineVariant,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.large,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.surfaceContainerLowest,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  cellRight: {
    alignItems: 'flex-end',
  },
});
