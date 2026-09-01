import { forwardRef, type ReactNode } from 'react';
import {
  Platform,
  Pressable as RNPressable,
  type GestureResponderEvent,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { press, timing, useReducedMotion } from '@/theme';

export interface AnimatedPressableProps extends Omit<RNPressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * `scale` for buttons and compact controls, `card` for wide surfaces (a deep scale on a
   * full-width card reads as a layout shift), `opacity` for rows where any scale would fight the
   * list geometry.
   */
  feedback?: 'scale' | 'card' | 'opacity' | 'none';
  /**
   * Marks this control as the one representing the user's current location, e.g. the active
   * destination in the admin sidebar.
   *
   * Native screen readers take that from `accessibilityState.selected`, so set both. On the web
   * `aria-selected` is only valid inside a `listbox`/`tablist`/`grid` — on a `role="link"` it is
   * ignored, which left the active sidebar item conveyed by colour alone. `aria-current` is the
   * correct attribute there and `react-native-web` forwards it; React Native's own prop types stop
   * at `aria-selected`, which is why it is declared here.
   */
  'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | boolean;
  /**
   * Web-only key handler. Declared here because React Native's `PressableProps` has no notion of
   * key events, while react-native-web forwards `onKeyDown` to the DOM node.
   */
  onKeyDown?: (event: WebKeyEvent) => void;
}

/** The slice of a DOM keyboard event this primitive needs. */
interface WebKeyEvent {
  key: string;
  preventDefault?: () => void;
}

const AnimatedView = Animated.createAnimatedComponent(RNPressable);

/**
 * Pressable with native-driven press feedback.
 *
 * React Native's `Pressable` style-function callback re-renders on every press, which makes the
 * feedback a hard switch and, inside a virtualised list, drags a re-render along with it. Driving
 * scale and opacity from a Reanimated shared value keeps the whole interaction on the UI thread —
 * the row never re-renders, so a 48-student roster stays smooth.
 *
 * Press feedback is never the only signal for anything; it just makes taps feel answered.
 */
export const AnimatedPressable = forwardRef<View, AnimatedPressableProps>(
  function AnimatedPressable({ children, style, feedback = 'scale', ...rest }, ref) {
    const reduceMotion = useReducedMotion();
    const active = useSharedValue(0);

    const config = reduceMotion ? { duration: 0 } : timing.micro;

    const animatedStyle = useAnimatedStyle(() => {
      if (feedback === 'none') return {};

      const scaleTarget =
        feedback === 'card' ? press.cardScale : feedback === 'scale' ? press.scale : 1;

      return {
        opacity: 1 - active.value * (1 - press.opacity),
        transform: [{ scale: 1 - active.value * (1 - scaleTarget) }],
      };
    });

    /*
      Keyboard activation for link-role controls on the web.

      react-native-web's press responder gives `role="button"` elements Enter and Space activation,
      but a `role="link"` div never completes that cycle. Measured in Chromium against this app:
      Enter on a focused submit button, filter chip and table row each fired `onPress`, while Enter
      on a focused admin sidebar destination did nothing at all. That left the console's primary
      navigation reachable by Tab but operable only by mouse — a keyboard failure (WCAG 2.1.1),
      and the worst possible one to have on a navigation rail.

      Deliberately narrow: web only, `link` role only, and only when there is an `onPress` to run.
      Everywhere the responder already works it keeps sole ownership, so `onPress` cannot fire twice.
      Space is included because these behave as in-app navigation rather than document links, and it
      is prevented from scrolling the page. A caller's own `onKeyDown` still runs.
    */
    const handlesKeys =
      Platform.OS === 'web' && rest.accessibilityRole === 'link' && rest.onPress != null;

    const onKeyDown = handlesKeys
      ? (event: WebKeyEvent) => {
          rest.onKeyDown?.(event);
          if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
          event.preventDefault?.();
          // The handler is a navigation callback that ignores its argument; there is no gesture to
          // describe, so the key event stands in for it.
          rest.onPress?.(event as unknown as GestureResponderEvent);
        }
      : rest.onKeyDown;

    // Merged into one object rather than passed as a JSX attribute because Reanimated derives its
    // prop types from React Native's, which have no key events. `onKeyDown` and `aria-current` are
    // real on react-native-web and inert on native, and both travel through this spread.
    const pressableProps: Omit<AnimatedPressableProps, 'children'> = { ...rest, onKeyDown };

    return (
      <AnimatedView
        ref={ref}
        style={[style, animatedStyle]}
        onPressIn={(event) => {
          active.value = withTiming(1, config);
          rest.onPressIn?.(event);
        }}
        onPressOut={(event) => {
          active.value = withTiming(0, config);
          rest.onPressOut?.(event);
        }}
        {...pressableProps}
      >
        {children}
      </AnimatedView>
    );
  },
);
