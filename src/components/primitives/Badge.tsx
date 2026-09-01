import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { palette, radius, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface BadgeProps {
  label: string;
  /** Pill fill. Defaults to the neutral treatment Stitch uses in its status column. */
  background?: string;
  foreground?: string;
  border?: string;
  /** Small leading dot, as on the Stitch Present/Absent pills. */
  dotColor?: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

/**
 * Compact status pill. Matches the Stitch pill: fully rounded, hairline border,
 * optional 6px leading dot, `label-md` text.
 */
export function Badge({
  label,
  background = palette.surfaceContainerLow,
  foreground = palette.onSurface,
  border = palette.outlineVariant,
  dotColor,
  icon,
  style,
}: BadgeProps) {
  return (
    <View
      style={[styles.badge, { backgroundColor: background, borderColor: border }, style]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      {icon ? <Icon name={icon} size={14} color={foreground} /> : null}
      <Text variant="labelMd" color={foreground} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
});
