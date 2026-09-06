import { useEffect } from 'react';
import { StyleSheet, type ColorValue } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { palette, radius } from '@/theme';

import { Icon, type IconName } from './Icon';

export interface LiquidTabIconProps {
  name: IconName;
  color: ColorValue;
  focused: boolean;
}

/** A springing, lens-like tab glyph that responds when navigation selection changes. */
export function LiquidTabIcon({ name, color, focused }: LiquidTabIconProps) {
  const selection = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    selection.value = withSpring(focused ? 1 : 0, {
      damping: 15,
      stiffness: 190,
      mass: 0.7,
    });
  }, [focused, selection]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(selection.value, [0, 1], [0, -2]) },
      { scale: interpolate(selection.value, [0, 1], [1, 1.12]) },
    ],
  }));

  return (
    <Animated.View style={[styles.lens, focused && styles.lensActive, animatedStyle]}>
      <Icon name={name} size={21} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  lens: {
    width: 42,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  lensActive: {
    backgroundColor: 'rgba(169,156,255,0.20)',
    borderColor: 'rgba(226,221,255,0.30)',
    boxShadow: `0 5px 18px ${palette.primaryFixedDim}66`,
  },
});
