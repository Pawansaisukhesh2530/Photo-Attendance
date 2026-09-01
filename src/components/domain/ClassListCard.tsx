import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { ProgressRing } from '@/components/primitives/ProgressRing';
import { Text } from '@/components/primitives/Text';
import { ATTENDANCE_THRESHOLD } from '@/constants/config';
import { palette, spacing } from '@/theme';
import type { CourseClass } from '@/types';
import { formatScheduleTime } from '@/utils/datetime';

import { ClassCodeTag } from './ClassCodeTag';

export interface ClassListCardProps {
  item: CourseClass;
  onPress: (item: CourseClass) => void;
  onTakeAttendance: (item: CourseClass) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A class in the My Classes list.
 *
 * From the Stitch My Classes card: tinted header strip carrying the subject and a
 * percentage ring, a body with the student count, and an action area.
 *
 * Mobile adaptations:
 *   - Stitch renders these three-up in a `lg:grid-cols-3`. On a phone they stack full
 *     width; on a tablet `useResponsive` allows two columns.
 *   - Stitch's 2x2 action grid ("Take Attendance" spanning two columns, then "View
 *     Students", "Reports", "View History") puts four buttons on every card, which is
 *     heavy when four cards stack. Only the primary action stays a button; the rest
 *     collapse into the card tap, which opens Class Detail where they live as sections.
 *     That keeps the roster and history one tap away without four controls per card.
 *
 * The tappable summary (header plus metadata) and the "Take attendance" button are siblings inside
 * a non-interactive card, not one nested inside the other. A pressable card wrapping a button is a
 * control inside a control: on the web both render as real `<button>` elements, and a `<button>`
 * inside a `<button>` is invalid HTML — the browser closes the outer one early, React logs a
 * hydration error, and the accessibility tree nests one interactive node inside another. The
 * padding is split across the two regions so the layout is unchanged.
 */
export function ClassListCard({ item, onPress, onTakeAttendance }: ClassListCardProps) {
  const belowThreshold = item.attendancePercentage < ATTENDANCE_THRESHOLD;
  const firstSlot = item.schedule[0];

  const scheduleLabel = firstSlot
    ? `${DAY_LABELS[firstSlot.dayOfWeek] ?? ''} ${formatScheduleTime(firstSlot.startTime)}`
    : 'Not scheduled';

  return (
    <Card padded={false}>
      <AnimatedPressable
        onPress={() => onPress(item)}
        feedback="card"
        accessibilityRole="button"
        accessibilityLabel={`${item.subject}, ${item.displayCode}, semester ${item.semester}, ${item.studentCount} students, ${item.attendancePercentage} percent attendance`}
        accessibilityHint={`Opens class details for ${item.subject}`}
      >
        {/* Header strip — Stitch tints this `slate-50`, mapped to surface-container-low. */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="titleLg" color={palette.onSurface} numberOfLines={2}>
              {item.subject}
            </Text>
            <View style={styles.tagRow}>
              <ClassCodeTag code={item.displayCode} />
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                Sem {item.semester} • {item.academicSession}
              </Text>
            </View>
          </View>

          <ProgressRing percentage={item.attendancePercentage} size={52} strokeWidth={4} />
        </View>

        <View style={styles.infoBody}>
          <View style={styles.metaRow}>
            <View style={styles.meta}>
              <Icon name="students" size={16} color={palette.outline} />
              <Text variant="bodyMd" color={palette.onSurface}>
                {item.studentCount} students
              </Text>
            </View>
            <View style={styles.meta}>
              <Icon name="calendar" size={16} color={palette.outline} />
              <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                {scheduleLabel}
              </Text>
            </View>
          </View>

          {belowThreshold ? (
            <View style={styles.warning}>
              <Icon name="warning" size={16} color={palette.onTertiaryFixedVariant} />
              <Text
                variant="labelMd"
                color={palette.onTertiaryFixedVariant}
                style={styles.warningText}
              >
                Below the {ATTENDANCE_THRESHOLD}% attendance threshold
              </Text>
            </View>
          ) : null}
        </View>
      </AnimatedPressable>

      {/* Sibling of the summary, never a descendant of it. */}
      <View style={styles.actionArea}>
        <Button
          label="Take attendance"
          icon="takeAttendance"
          fullWidth
          onPress={() => onTakeAttendance(item)}
          style={styles.action}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surfaceContainerLow,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: palette.outlineVariant,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  /*
    The body used to be one padded block holding the metadata and the button. Splitting the button
    into a sibling region means the padding has to be split too, and it is divided so the rendered
    spacing is identical to before:

      before  padding md all round, gap sm between children, button marginTop xs
      after   infoBody  paddingTop md + paddingHorizontal md, gap sm
              actionArea paddingTop sm + paddingHorizontal md + paddingBottom md, button marginTop xs

    Gap between the last metadata row and the button is sm + xs either way, and the outer padding is
    unchanged on all four sides.
  */
  infoBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  actionArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  warningText: {
    flex: 1,
  },
  action: {
    marginTop: spacing.xs,
  },
});
