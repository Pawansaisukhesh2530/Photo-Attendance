import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { palette, radius, spacing, timing, touch, useReducedMotion } from '@/theme';

import { Icon } from './Icon';
import { AnimatedPressable } from './Pressable';
import { Text } from './Text';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  /**
   * Accessible name, when it cannot be the visible label.
   *
   * Defaults to `label`, which is the right answer wherever the checkbox carries its own text.
   * A settings row already states what the setting is, so repeating it beside the box would
   * duplicate it visually — but the control still needs a name of its own, because a screen
   * reader focuses the checkbox, not the row around it.
   */
  accessibilityLabel?: string;
}

/**
 * Checkbox with an animated check.
 *
 * The Stitch mobile login draws a 16x16 box with a 4px radius, an `outline-variant` border and a
 * filled primary check. That visual is reproduced, but the pressable area covers the whole row plus
 * hit slop — a bare 16dp target is roughly a third of the iOS minimum.
 *
 * The box fill and border cross-fade while the tick scales in from 0.6. Deliberately no spring: a
 * bouncing checkbox in a class picker draws attention to itself instead of to what was selected.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  accessibilityLabel,
}: CheckboxProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(checked ? 1 : 0, reduceMotion ? { duration: 0 } : timing.micro);
  }, [checked, reduceMotion, progress]);

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
      onPress={() => onChange(!checked)}
      disabled={disabled}
      feedback="opacity"
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      /*
        `aria-checked` is set explicitly as well as `accessibilityState`.

        Measured in Chromium against this app: a checkbox rendered with `accessibilityState={{
        checked }}` alone came out as `role="checkbox"` with NO `aria-checked` attribute at all
        under react-native-web 0.21 — verified on both this control and the login screen's
        "Remember me". A checkbox whose checked state is absent from the accessibility tree reads
        as unchecked to every screen reader, whatever it looks like, so the one piece of
        information the control exists to convey was the piece not being exposed.

        This is the same class of gap already documented on `AnimatedPressable`, where
        `accessibilityState.selected` did not survive to the DOM and `aria-current` had to be
        declared by hand for the admin sidebar. `accessibilityState` is kept because it is what
        native reads; `aria-checked` is inert on native and correct on web.
      */
      aria-checked={checked}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.row, disabled && styles.disabled]}
    >
      <Animated.View style={[styles.box, boxStyle]}>
        <Animated.View style={tickStyle}>
          <Icon name="check" size={14} color={palette.onPrimary} />
        </Animated.View>
      </Animated.View>

      {label ? (
        <Text variant="bodyMd" color={palette.onSurfaceVariant}>
          {label}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.min,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: radius.base,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
