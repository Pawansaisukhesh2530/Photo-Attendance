import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { BACKDROP_OPACITY, timing, useReducedMotion } from '@/theme';

export type OverlayVariant = 'center' | 'sheet';

export interface AnimatedOverlayProps {
  visible: boolean;
  variant: OverlayVariant;
  children: ReactNode;
  /** Android hardware back / iOS accessibility escape. */
  onRequestClose: () => void;
  /**
   * Backdrop tap handler. Omit entirely to make the backdrop inert — which is what the twin
   * review needs, since a stray tap must never close a case.
   */
  onBackdropPress?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * The single animated container behind every modal and bottom sheet.
 *
 * It exists to solve one concrete problem: React Native's `Modal` tears its subtree down the moment
 * `visible` flips to false, so a Reanimated `exiting` animation never gets a chance to run. Every
 * sheet in the app therefore *appeared* smoothly and vanished instantly. This keeps the native
 * modal mounted until the exit animation has finished, then unmounts.
 *
 * Centralising it also means the motion language is defined once. Individual screens cannot drift
 * into their own durations or easings.
 *
 * `center` fades the backdrop and scales the dialog 0.96 → 1.
 * `sheet` fades the backdrop and slides the panel up from its own measured height, so it reads as
 * physically attached to the bottom edge rather than fading in place.
 *
 * Under reduced motion both collapse to a single frame. State still changes, and every state is
 * conveyed by colour, icon and text independently — motion only softens the transition.
 */
export function AnimatedOverlay({
  visible,
  variant,
  children,
  onRequestClose,
  onBackdropPress,
  contentStyle,
  accessibilityLabel,
}: AnimatedOverlayProps) {
  const reduceMotion = useReducedMotion();

  /** Keeps the native modal alive through the exit animation. */
  const [mounted, setMounted] = useState(visible);

  const progress = useSharedValue(0);
  /** Measured sheet height, so the slide starts exactly offscreen for this content. */
  const sheetHeight = useSharedValue(0);
  /** Gates the first paint until the sheet has been measured. */
  const measured = useSharedValue(variant === 'center' ? 1 : 0);

  const enterConfig = reduceMotion ? { duration: 0 } : timing.enter;
  const exitConfig = reduceMotion ? { duration: 0 } : timing.exit;

  const finishExit = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) {
      const mountTimer = setTimeout(() => setMounted(true), 0);
      progress.value = withTiming(1, enterConfig);
      return () => clearTimeout(mountTimer);
    }

    if (!mounted) return;

    progress.value = withTiming(0, exitConfig, (completed) => {
      if (completed) runOnJS(finishExit)();
    });
    // `mounted` is intentionally read but not depended on: adding it would restart the exit
    // animation when it sets itself false.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSheetLayout = (event: LayoutChangeEvent): void => {
    const height = event.nativeEvent.layout.height;
    if (height <= 0) return;
    sheetHeight.value = height;
    measured.value = 1;
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * BACKDROP_OPACITY,
  }));

  const centerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    // 0.96 -> 1. Any deeper and the dialog reads as zooming rather than settling.
    transform: [{ scale: 0.96 + progress.value * 0.04 }],
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: measured.value,
    transform: [{ translateY: (1 - progress.value) * sheetHeight.value }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      // Animation is ours; the native one would fight it.
      animationType="none"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={variant === 'center' ? styles.centerRoot : styles.sheetRoot}>
        {/* Backdrop. Always covers the screen so background taps cannot reach content beneath. */}
        <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" />

        {onBackdropPress ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onBackdropPress}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
        ) : (
          // Inert blocker: swallows taps without dismissing.
          <View style={StyleSheet.absoluteFill} />
        )}

        {variant === 'center' ? (
          <Animated.View
            style={[styles.centerContent, centerStyle, contentStyle]}
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
          >
            {children}
          </Animated.View>
        ) : (
          <Animated.View
            onLayout={handleSheetLayout}
            style={[styles.sheetContent, sheetStyle, contentStyle]}
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
          >
            {children}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    // inverseSurface, matching the scrim Stitch uses behind overlays.
    backgroundColor: '#302f39',
  },
  centerContent: {
    width: '100%',
    alignItems: 'center',
  },
  sheetContent: {
    width: '100%',
  },
});
