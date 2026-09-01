import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { palette, radius, spacing } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shimmering placeholder block.
 *
 * Skeletons are preferred over spinners wherever the shape of the incoming content is
 * known, because they keep layout stable and make the wait feel shorter. The Stitch
 * processing screen uses a comparable shimmer on its in-progress step.
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = radius.base, style }: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 900 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.block, { width, height, borderRadius }, animatedStyle, style]}
    />
  );
}

/** Roster-row skeleton, shaped like `StudentListItem` so the swap is not jarring. */
export function SkeletonListItem() {
  return (
    <View style={styles.row}>
      <Skeleton width={40} height={40} borderRadius={radius.full} />
      <View style={styles.rowText}>
        <Skeleton width="55%" height={16} />
        <Skeleton width="32%" height={12} />
      </View>
      <Skeleton width={72} height={24} borderRadius={radius.full} />
    </View>
  );
}

/** Card-shaped skeleton for dashboard and class lists. */
export function SkeletonCard({ height = 120 }: { height?: number }) {
  return <Skeleton height={height} borderRadius={radius.card} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: palette.surfaceContainerHigh,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs + 2,
  },
});
