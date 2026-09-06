import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, timing, touch, useReducedMotion } from '@/theme';
import type { CourseClass } from '@/types';

import { ClassCodeTag } from './ClassCodeTag';

export interface ClassSelectRowProps {
  item: CourseClass;
  selected: boolean;
  onToggle: (item: CourseClass) => void;
  /** Marks the class the faculty member arrived from. */
  isOrigin?: boolean;
  last?: boolean;
}

/**
 * A selectable class row.
 *
 * A row rather than a reused `ClassListCard`. That card carries a progress ring, a schedule line
 * and its own Take Attendance button — none of which belong in a picker, and the embedded button
 * would compete with the row's own selection tap. The row still uses the same tokens, the same
 * `ClassCodeTag`, and the same 4px-radius vocabulary, so it reads as part of the family.
 *
 * The whole row is the target, not just the checkbox: a 20dp box is a poor thing to aim at when
 * the intent of the row is unambiguous.
 */
export const ClassSelectRow = memo(function ClassSelectRow({
  item,
  selected,
  onToggle,
  isOrigin = false,
  last = false,
}: ClassSelectRowProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, reduceMotion ? { duration: 0 } : timing.micro);
  }, [selected, reduceMotion, progress]);

  // The row tint and the checkbox move together, so one tap reads as one change.
  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [palette.surfaceContainerLowest, palette.surfaceContainerLow],
    ),
  }));

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [palette.surfaceContainerLowest, palette.primary],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [palette.outlineVariant, palette.primary],
    ),
  }));

  const tickStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.6 + progress.value * 0.4 }],
  }));

  return (
    <AnimatedPressable
      onPress={() => onToggle(item)}
      // Opacity rather than scale: a shrinking full-width row inside a list reads as a layout jump.
      feedback="opacity"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${item.subject}, ${item.displayCode}, ${item.studentCount} ${item.studentCount === 1 ? 'student' : 'students'}`}
      accessibilityHint={selected ? 'Removes this class from the session' : 'Adds this class to the session'}
      style={[styles.rowOuter, !last && styles.divider]}
    >
      <Animated.View style={[styles.row, rowStyle]}>
      <Animated.View style={[styles.box, boxStyle]}>
        <Animated.View style={tickStyle}>
          <Icon name="check" size={16} color={palette.onPrimary} />
        </Animated.View>
      </Animated.View>

      <View style={styles.body}>
        <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
          {item.subject}
        </Text>

        <View style={styles.metaRow}>
          <ClassCodeTag code={item.displayCode} />
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {item.studentCount} {item.studentCount === 1 ? 'student' : 'students'}
          </Text>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Sem {item.semester}
          </Text>
        </View>
      </View>

      {isOrigin ? (
        <View style={styles.originChip}>
          <Text variant="labelMd" color={palette.onPrimaryFixedVariant}>
            This class
          </Text>
        </View>
      ) : null}
      </Animated.View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  rowOuter: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: touch.large + 12,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.base,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  originChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: palette.primaryFixed,
  },
});
