import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

export interface GlassSurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  intensity?: number;
  accessibilityLabel?: string;
  testID?: string;
}

/** Native Liquid Glass on supported iOS versions, with a consistent dark blur elsewhere. */
export function GlassSurface({
  children,
  style,
  interactive = false,
  intensity = 70,
  accessibilityLabel,
  testID,
}: GlassSurfaceProps) {
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor="rgba(24, 30, 54, 0.28)"
        isInteractive={interactive}
        style={[styles.surface, style]}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      tint="dark"
      intensity={intensity}
      style={[styles.surface, style]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
  },
});
