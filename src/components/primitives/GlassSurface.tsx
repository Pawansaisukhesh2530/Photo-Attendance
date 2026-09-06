import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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
  const content = (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(255,255,255,0.11)',
          'rgba(255,255,255,0.018)',
          'rgba(119,96,255,0.045)',
        ]}
        locations={[0, 0.46, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.specularEdge} />
      {children}
    </>
  );

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
        {content}
      </GlassView>
    );
  }

  return (
    <BlurView
      tint="systemUltraThinMaterialDark"
      intensity={intensity}
      style={[styles.surface, style, styles.fallback]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {content}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: 'rgba(12, 16, 29, 0.60)',
  },
  specularEdge: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
});
