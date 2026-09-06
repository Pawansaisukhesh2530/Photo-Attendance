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
          'rgba(255,255,255,0.22)',
          'rgba(255,255,255,0.025)',
          'rgba(84,205,255,0.085)',
        ]}
        locations={[0, 0.42, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.085)', 'rgba(255,255,255,0)']}
        locations={[0.18, 0.5, 0.82]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.specularEdge} />
      <View pointerEvents="none" style={styles.topHighlight} />
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
    backgroundColor: 'rgba(8, 15, 28, 0.44)',
  },
  specularEdge: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
});
