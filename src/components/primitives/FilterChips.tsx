import { memo, useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { palette, radius, spacing, timing, touch, useReducedMotion } from '@/theme';

import { AnimatedPressable } from './Pressable';

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
}

export interface FilterChipsProps<T extends string> {
  options: FilterChipOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  /** Screen padding to bleed into, so the row can scroll edge to edge. */
  contentInset?: number;
}

/**
 * One chip. Memoised so selecting a chip animates only the two chips whose state actually changed,
 * rather than re-rendering the whole row.
 */
const Chip = memo(function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, reduceMotion ? { duration: 0 } : timing.micro);
  }, [active, reduceMotion, progress]);

  // Fill and border cross-fade rather than snapping, so moving between filters reads as one
  // continuous change instead of two independent flickers.
  const chipStyle = useAnimatedStyle(() => ({
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

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [palette.onSurfaceVariant, palette.onPrimary],
    ),
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      feedback="scale"
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Filter by ${label}`}
      style={styles.chipWrapper}
    >
      <Animated.View style={[styles.chip, chipStyle]}>
        {/* Animated.Text so the colour transition stays on the UI thread. */}
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </AnimatedPressable>
  );
});

/**
 * Horizontally scrollable filter chips.
 *
 * Replaces the Stitch "Filter" button, which on desktop opens a popover menu. A popover anchored to
 * a small button is awkward on touch; an always-visible scrolling chip row shows the available
 * filters and the active one without a second tap, matching platform convention on both OSes.
 *
 * The row bleeds past the screen margin so a partially visible chip at the right edge signals that
 * more exist.
 */
export function FilterChips<T extends string>({
  options,
  selected,
  onSelect,
  contentInset = spacing.screen,
}: FilterChipsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, { marginHorizontal: -contentInset }]}
      contentContainerStyle={[styles.content, { paddingHorizontal: contentInset }]}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          active={option.value === selected}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  chipWrapper: {
    borderRadius: radius.full,
  },
  chip: {
    minHeight: touch.min - 8,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  label: {
    // label-md from the Stitch scale, inlined because Animated.Text drives colour itself.
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
});
