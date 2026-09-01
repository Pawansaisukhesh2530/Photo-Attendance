import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { palette, radius, shadows, spacing } from '@/theme';

import { AnimatedPressable } from './Pressable';

export interface CardProps {
  children: ReactNode;
  /** Elevates on press. Omit for static cards. */
  onPress?: () => void;
  padded?: boolean;
  elevation?: 'none' | 'resting' | 'raised';
  /** Coloured left accent bar — Stitch uses this on rows needing review. */
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * The surface every grouped block sits on.
 *
 * Matches the Stitch card recipe: `surface-container-lowest` fill, `outline-variant`
 * hairline border, 16px radius, and the resting shadow
 * (`0 1px 3px rgba(15,23,42,0.08)`).
 */
export function Card({
  children,
  onPress,
  padded = true,
  elevation = 'resting',
  accentColor,
  style,
  accessibilityLabel,
  testID,
}: CardProps) {
  const content = (
    <>
      {accentColor ? (
        <View style={[styles.accent, { backgroundColor: accentColor }]} />
      ) : null}
      <View style={padded ? styles.padded : undefined}>{children}</View>
    </>
  );

  const base: StyleProp<ViewStyle> = [
    styles.card,
    shadows[elevation],
    accentColor ? styles.withAccent : null,
    style,
  ];

  if (!onPress) {
    return (
      <View style={base} testID={testID} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      feedback="card"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={base}
    >
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: palette.outlineVariant,
    overflow: 'hidden',
  },
  withAccent: {
    // Leaves room for the 4px accent bar without shifting the content box.
    paddingLeft: 4,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  padded: {
    padding: spacing.md,
  },
});
