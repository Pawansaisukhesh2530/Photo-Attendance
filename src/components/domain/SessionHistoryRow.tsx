import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/primitives/Badge';
import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { ATTENDANCE_THRESHOLD } from '@/constants/config';
import { palette, radius, spacing, touch } from '@/theme';
import type { AttendanceSessionSummary } from '@/types';
import { classLabel } from '@/utils/attendanceGrouping';
import { formatRelativeDay } from '@/utils/datetime';

export interface SessionHistoryRowProps {
  session: AttendanceSessionSummary;
  onPress?: (session: AttendanceSessionSummary) => void;
  /** Hides the bottom hairline on the last row of a card. */
  last?: boolean;
}

/**
 * One past session, used by the dashboard's Recent Activity list and the history screen.
 *
 * From the Stitch dashboard Recent Activity item: subject with class code, a relative date
 * top-right, the total and present counts with a coloured dot, and the percentage set
 * large on the right. Percentages below the institutional threshold render in `error`,
 * exactly as Stitch does, with "(Low)" appended.
 *
 * Memoised because the history screen renders these in a virtualised list.
 */
export const SessionHistoryRow = memo(function SessionHistoryRow({
  session,
  onPress,
  last = false,
}: SessionHistoryRowProps) {
  const { present, total, percentage } = session.summary;
  const isLow = percentage < ATTENDANCE_THRESHOLD;
  const accent = isLow ? palette.error : palette.secondary;
  const pendingReview = session.summary.review > 0;

  return (
    <AnimatedPressable
      onPress={onPress ? () => onPress(session) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${session.className}, ${session.classDisplayCode}, ${formatRelativeDay(session.capturedAt)}, ${present} of ${total} present, ${percentage} percent`}
      feedback="opacity"
      style={[
        styles.row,
        !last && styles.divider,
      ]}
    >
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1} style={styles.title}>
            {session.className}
          </Text>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {formatRelativeDay(session.capturedAt)}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {/* "CSE-5A" or "CSE-5A +1" for a combined session. */}
            {classLabel(session.classDisplayCode, session.classCount)} • Total {total}
          </Text>

          {session.classCount > 1 ? (
            <View style={styles.flag}>
              <Icon name="classes" size={12} color={palette.primary} />
              <Text variant="labelMd" color={palette.primary}>
                {session.classCount} {session.classCount === 1 ? 'class' : 'classes'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text variant="bodyMd" color={accent}>
            {present} present{isLow ? ' (Low)' : ''}
          </Text>

          {pendingReview ? (
            <Badge
              label={`${session.summary.review} to review`}
              background={palette.tertiaryFixed}
              foreground={palette.onTertiaryFixedVariant}
              border={palette.tertiaryFixedDim}
              icon="review"
            />
          ) : null}

          {session.hasManualEdits ? (
            <View style={styles.editedFlag}>
              <Icon name="edit" size={12} color={palette.onSurfaceVariant} />
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                Edited
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.trailing}>
        <Text variant="headlineSm" color={isLow ? palette.error : palette.onSurface}>
          {percentage}%
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
    gap: spacing.sm,
    minHeight: touch.large + 12,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  main: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  editedFlag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
