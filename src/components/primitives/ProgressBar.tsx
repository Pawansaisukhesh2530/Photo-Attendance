import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { palette, radius } from '@/theme';

export interface ProgressBarProps {
  /** 0..1. Values outside the range are clamped. */
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
  /** Set false for confidence meters, which should not animate on every row render. */
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Determinate progress bar.
 *
 * Used for both the processing pipeline and the per-student AI confidence meters in
 * the results table (the 1.5px amber/green bars in the Stitch design).
 */
export function ProgressBar({
  progress,
  color = palette.primary,
  trackColor = palette.surfaceContainerHigh,
  height = 6,
  animated = true,
  style,
  accessibilityLabel,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const width = useSharedValue(animated ? 0 : clamped);

  useEffect(() => {
    if (animated) {
      width.value = withTiming(clamped, { duration: 400 });
    } else {
      width.value = clamped;
    }
  }, [clamped, animated, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  return (
    <View
      style={[styles.track, { height, backgroundColor: trackColor }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
});
