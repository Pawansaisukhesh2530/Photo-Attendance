import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ClassCodeTag } from '@/components/domain/ClassCodeTag';
import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import { palette, spacing } from '@/theme';
import type { ClassAttendanceStat } from '@/types';

export interface ClassAttendanceBarProps {
  stat: ClassAttendanceStat;
  /** From `AttendanceReport.threshold`, never a local constant. */
  threshold: number;
  onPress?: (stat: ClassAttendanceStat) => void;
  last?: boolean;
}

/**
 * One class in the by-class breakdown.
 *
 * A horizontal bar rather than a second chart: comparing four to a dozen classes is a ranking
 * question, and stacked bars answer it more directly than a grouped chart would — while reusing
 * `ProgressBar`, which the app already uses for every other proportion.
 *
 * Below-threshold classes take the amber `tertiary` pairing used for low attendance throughout the
 * app, and additionally carry a warning glyph and the words "below threshold" in the accessibility
 * label, so the state never depends on colour alone.
 */
export const ClassAttendanceBar = memo(function ClassAttendanceBar({
  stat,
  threshold,
  onPress,
  last = false,
}: ClassAttendanceBarProps) {
  const low = stat.percentage < threshold;
  const accent = low ? palette.tertiaryFixedDim : palette.primary;

  return (
    <AnimatedPressable
      onPress={onPress ? () => onPress(stat) : undefined}
      disabled={!onPress}
      feedback={onPress ? 'opacity' : 'none'}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${stat.className}, ${stat.displayCode}, ${stat.percentage} percent across ${stat.sessionCount} ${stat.sessionCount === 1 ? 'session' : 'sessions'}${low ? `, below the ${threshold} percent threshold` : ''}`}
      style={[styles.row, !last && styles.divider]}
    >
      <View style={styles.topRow}>
        <ClassCodeTag code={stat.displayCode} />
        <Text variant="bodyMd" color={palette.onSurface} numberOfLines={1} style={styles.name}>
          {stat.className}
        </Text>
        {low ? <Icon name="warning" size={14} color={palette.onTertiaryFixedVariant} /> : null}
        <Text
          variant="bodyLg"
          color={low ? palette.onTertiaryFixedVariant : palette.onSurface}
        >
          {stat.percentage}%
        </Text>
        {onPress ? <Icon name="chevronRight" size={16} color={palette.outline} /> : null}
      </View>

      <ProgressBar
        progress={stat.percentage / 100}
        color={accent}
        height={6}
        animated={false}
      />

      <Text variant="labelMd" color={palette.onSurfaceVariant}>
        {stat.sessionCount} {stat.sessionCount === 1 ? 'session' : 'sessions'} in this period
      </Text>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
  },
});
