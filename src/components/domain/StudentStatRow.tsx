import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/primitives/Avatar';
import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import { palette, spacing, touch } from '@/theme';
import type { StudentAttendanceStat } from '@/types';

export interface StudentStatRowProps {
  stat: StudentAttendanceStat;
  /** From `AttendanceReport.threshold`. */
  threshold: number;
  onPress?: (stat: StudentAttendanceStat) => void;
  last?: boolean;
}

/**
 * A student in the report's per-student breakdown.
 *
 * Distinct from `StudentRosterRow`, which renders a whole `Student` and shows lifetime standing
 * from `Student.overallAttendance`. This renders a `StudentAttendanceStat` — a figure computed for
 * one reporting period — and shows the sessions behind it, which is the part a lecturer needs in
 * order to trust the percentage.
 *
 * Visually it follows the roster row deliberately: same avatar size, same name and roll treatment,
 * same amber low-attendance pairing. A student should look like the same person wherever they
 * appear.
 *
 * `belowThreshold` comes from the service. The row does not recompute it, so the definition of
 * "low" lives in exactly one place.
 *
 * Memoised and fixed-height for virtualisation; the roll can run to several hundred rows.
 */
export const StudentStatRow = memo(function StudentStatRow({
  stat,
  threshold,
  onPress,
  last = false,
}: StudentStatRowProps) {
  const low = stat.belowThreshold;
  const undetermined = stat.totalSessions === 0;
  const accent = low ? palette.tertiaryFixedDim : palette.primary;

  const ratio = `${stat.attendedSessions} of ${stat.totalSessions}`;

  return (
    <AnimatedPressable
      onPress={onPress ? () => onPress(stat) : undefined}
      disabled={!onPress}
      feedback="opacity"
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={
        undetermined
          ? `${stat.name}, roll ${stat.rollNumber}, no sessions determined in this period`
          : `${stat.name}, roll ${stat.rollNumber}, ${stat.percentage} percent, attended ${ratio} sessions${low ? `, below the ${threshold} percent threshold` : ''}`
      }
      style={[styles.row, !last && styles.divider]}
    >
      <Avatar name={stat.name} uri={stat.avatarUrl} size={40} />

      <View style={styles.body}>
        <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
          {stat.name}
        </Text>

        <View style={styles.metaRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {stat.rollNumber}
          </Text>
          {/*
            The sessions behind the percentage. "82%" alone is unreadable without knowing whether
            it came from 9 of 11 or 41 of 50.
          */}
          <Text variant="labelMd" color={palette.outline}>
            {undetermined ? 'No sessions recorded' : `${ratio} sessions`}
          </Text>
        </View>

        {!undetermined ? (
          <ProgressBar
            progress={stat.percentage / 100}
            color={accent}
            height={4}
            animated={false}
            style={styles.bar}
          />
        ) : null}
      </View>

      <View style={styles.trailing}>
        {/* Warning glyph as well as colour, so "low" is never colour-only. */}
        {low ? <Icon name="warning" size={16} color={palette.onTertiaryFixedVariant} /> : null}
        <Text
          variant="bodyLg"
          color={
            undetermined
              ? palette.outline
              : low
                ? palette.onTertiaryFixedVariant
                : palette.onSurface
          }
        >
          {undetermined ? '--' : `${stat.percentage}%`}
        </Text>
        {onPress ? <Icon name="chevronRight" size={18} color={palette.outline} /> : null}
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: touch.large + 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bar: {
    marginTop: 2,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
