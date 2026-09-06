import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { fontFamilies, palette, radius, spacing } from '@/theme';
import type { ClassAttendanceState, TodayClass } from '@/types';
import { formatScheduleTime } from '@/utils/datetime';

import { ClassCodeTag } from './ClassCodeTag';

export interface ClassCardProps {
  item: TodayClass;
  onTakeAttendance: (item: TodayClass) => void;
  onViewRecord: (item: TodayClass) => void;
  onPress?: (item: TodayClass) => void;
}

/** Status pill treatment per state, reusing the Stitch My Classes pill language. */
const STATE_BADGE: Record<
  ClassAttendanceState,
  { label: string; background: string; foreground: string; border: string; dot?: string }
> = {
  PENDING: {
    label: 'Pending',
    background: palette.secondaryContainer,
    foreground: palette.onSecondaryContainer,
    border: palette.secondaryFixed,
    dot: palette.secondary,
  },
  IN_PROGRESS: {
    label: 'Processing',
    background: palette.primaryFixed,
    foreground: palette.onPrimaryFixedVariant,
    border: palette.primaryFixedDim,
    dot: palette.primary,
  },
  AWAITING_REVIEW: {
    label: 'Needs review',
    background: palette.tertiaryFixed,
    foreground: palette.onTertiaryFixedVariant,
    border: palette.tertiaryFixedDim,
    dot: palette.tertiary,
  },
  COMPLETED: {
    label: 'Taken',
    background: palette.surfaceContainer,
    foreground: palette.onSurfaceVariant,
    border: palette.outlineVariant,
  },
  NO_CLASS_TODAY: {
    label: 'No class today',
    background: palette.surfaceContainer,
    foreground: palette.onSurfaceVariant,
    border: palette.outlineVariant,
  },
};

/**
 * Today's class card, from the Stitch Faculty Dashboard.
 *
 * Mobile adaptation: the Stitch card is a wide horizontal row — time block far left,
 * details centre, action button far right. At 390dp that yields a squeezed button and a
 * truncated subject, so the layout restacks. Time block and subject share the top row,
 * metadata sits beneath, and the action becomes a full-width button along the bottom edge
 * where a thumb rests. This is the single most-used control in the app, so it gets the
 * most reachable position on the card.
 *
 * Preserved from Stitch exactly: the tinted time well with hour stacked over meridiem, the
 * 4px-radius class-code tag, the strikethrough subject and 75% card opacity once taken,
 * the green "Attendance completed (n/n present)" line, and the switch from a filled
 * primary action to an outlined "View record".
 *
 * Two controls, two boundaries. The card holds a tappable summary (opens Class Detail) and an
 * action button (opens the camera, or the record). Those are siblings inside a non-interactive
 * card, not one nested inside the other.
 *
 * That structure is deliberate. Making the whole card pressable *and* putting a button inside it
 * produces a control nested in a control: on the web react-native-web renders both an
 * `accessibilityRole="button"` card and the button as real `<button>` elements, and a `<button>`
 * inside a `<button>` is invalid HTML. Browsers recover by closing the outer element early, React
 * logs a hydration error, and the accessibility tree ends up with an interactive node inside
 * another interactive node — so a screen reader cannot address the action cleanly and hit-testing
 * over the button is ambiguous. Keeping them as siblings gives each its own valid boundary while
 * the layout stays exactly as it was.
 */
export function ClassCard({
  item,
  onTakeAttendance,
  onViewRecord,
  onPress,
}: ClassCardProps) {
  const badge = STATE_BADGE[item.attendanceState];
  const isDone = item.attendanceState === 'COMPLETED';
  const isDisabled = item.attendanceState === 'NO_CLASS_TODAY';
  const needsReview = item.attendanceState === 'AWAITING_REVIEW';

  const [hour, minute] = item.startTime.split(':');
  const hourNumber = Number(hour ?? '0');
  const meridiem = hourNumber >= 12 ? 'PM' : 'AM';
  const displayHour = String(hourNumber % 12 === 0 ? 12 : hourNumber % 12).padStart(2, '0');

  const summaryLabel = `${item.subject}, ${item.displayCode}, ${formatScheduleTime(item.startTime)}, ${item.studentCount} ${item.studentCount === 1 ? 'student' : 'students'}, ${badge.label}`;

  const summary = (
    <>
      <View style={styles.topRow}>
        <View style={[styles.timeWell, isDone && styles.timeWellDone]}>
          <Text
            variant="headlineSm"
            color={isDone ? palette.onSurfaceVariant : palette.primary}
            style={styles.timeValue}
          >
            {displayHour}:{minute ?? '00'}
          </Text>
          <Text
            variant="labelMd"
            color={isDone ? palette.onSurfaceVariant : palette.primary}
            style={styles.meridiem}
          >
            {meridiem}
          </Text>
        </View>

        <View style={styles.headings}>
          <Text
            variant="titleLg"
            color={palette.onSurface}
            numberOfLines={2}
            style={isDone ? styles.struck : undefined}
          >
            {item.subject}
          </Text>

          <View style={styles.tagRow}>
            <ClassCodeTag code={item.displayCode} />
            <Badge
              label={badge.label}
              background={badge.background}
              foreground={badge.foreground}
              border={badge.border}
              {...(badge.dot ? { dotColor: badge.dot } : {})}
              {...(isDone ? { icon: 'present' as const } : {})}
            />
          </View>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Icon name="students" size={16} color={palette.outline} />
          <Text variant="bodyMd" color={palette.onSurfaceVariant}>
            {item.studentCount} {item.studentCount === 1 ? 'student' : 'students'}
          </Text>
        </View>
        <View style={styles.meta}>
          <Icon name="room" size={16} color={palette.outline} />
          <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={1}>
            {item.room}
          </Text>
        </View>
      </View>

      {isDone && item.presentCount !== null ? (
        <View style={styles.statusLine}>
          <Icon name="present" size={16} color={palette.secondary} />
          <Text variant="bodyMd" color={palette.secondary} style={styles.statusText}>
            Attendance completed ({item.presentCount}/{item.studentCount} present)
          </Text>
        </View>
      ) : null}

      {needsReview ? (
        <View style={styles.statusLine}>
          <Icon name="review" size={16} color={palette.onTertiaryFixedVariant} />
          <Text
            variant="bodyMd"
            color={palette.onTertiaryFixedVariant}
            style={styles.statusText}
          >
            Some students still need review
          </Text>
        </View>
      ) : null}
    </>
  );

  return (
    <Card
      style={isDone || isDisabled ? styles.dimmed : undefined}
      // Only the non-tappable form labels the card itself. When the summary is tappable it owns the
      // label, so the description is announced once rather than by both the wrapper and the control.
      {...(onPress ? {} : { accessibilityLabel: summaryLabel })}
    >
      {onPress ? (
        <AnimatedPressable
          onPress={() => onPress(item)}
          // `card` keeps the same press movement the whole card used to have; it now applies to the
          // summary, which is the region actually being pressed.
          feedback="card"
          accessibilityRole="button"
          accessibilityLabel={summaryLabel}
          accessibilityHint={`Opens class details for ${item.subject}`}
        >
          {summary}
        </AnimatedPressable>
      ) : (
        summary
      )}

      {/* Sibling of the summary, never a descendant of it. */}
      <View style={styles.action}>
        {isDone || needsReview ? (
          <Button
            label={needsReview ? 'Resolve review' : 'View record'}
            icon={needsReview ? 'review' : 'visible'}
            variant="secondary"
            fullWidth
            onPress={() => onViewRecord(item)}
          />
        ) : (
          <Button
            label="Take attendance"
            icon="takeAttendance"
            variant="primary"
            fullWidth
            disabled={isDisabled}
            onPress={() => onTakeAttendance(item)}
            accessibilityHint={`Opens the camera to capture attendance for ${item.subject}`}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  dimmed: {
    // Stitch applies opacity-75 to a completed card.
    opacity: 0.75,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeWell: {
    minWidth: 70,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: palette.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeWellDone: {
    backgroundColor: palette.surfaceContainerHighest,
  },
  timeValue: {
    fontFamily: fontFamilies.bold,
  },
  meridiem: {
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  headings: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  struck: {
    textDecorationLine: 'line-through',
    textDecorationColor: palette.outlineVariant,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  statusText: {
    flex: 1,
  },
  action: {
    marginTop: spacing.md,
  },
});
