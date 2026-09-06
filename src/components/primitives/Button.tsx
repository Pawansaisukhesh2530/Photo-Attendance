import {
  ActivityIndicator,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { palette, radius, shadows, spacing, touch } from '@/theme';

import { Icon, type IconName } from './Icon';
import { AnimatedPressable } from './Pressable';
import { Text } from './Text';

/**
 * Button variants, derived from the button treatments used across the Stitch screens:
 *
 *   primary    solid `primary` fill, white label — "Take Attendance", "Sign In"
 *   secondary  `surface-container-lowest` fill with an `outline-variant` border
 *   tonal      `primary-container` fill — used for emphasis without full weight
 *   ghost      no fill or border — "Decide Later", "View All History"
 *   danger     `error` fill, for destructive confirmation only
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: 'leading' | 'trailing';
  disabled?: boolean;
  loading?: boolean;
  /** Stretches to fill the parent's cross-axis. Default on phones for primary actions. */
  fullWidth?: boolean;
  /** Fully rounded, as on the Stitch camera capture button. */
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; gap: number }> = {
  sm: { height: touch.min, paddingHorizontal: spacing.md, gap: spacing.xs },
  md: { height: touch.comfortable, paddingHorizontal: spacing.lg, gap: spacing.sm },
  lg: { height: touch.large, paddingHorizontal: spacing.xl, gap: spacing.sm },
};

interface VariantStyle {
  background: string;
  label: string;
  border: string | null;
  shadow: keyof typeof shadows;
}

const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: {
    background: palette.primary,
    label: palette.onPrimary,
    border: null,
    shadow: 'resting',
  },
  secondary: {
    background: 'rgba(255,255,255,0.10)',
    label: palette.onSurface,
    border: palette.outlineVariant,
    shadow: 'resting',
  },
  tonal: {
    background: palette.primaryContainer,
    label: palette.onPrimary,
    border: null,
    shadow: 'none',
  },
  ghost: {
    background: 'transparent',
    label: palette.primary,
    border: null,
    shadow: 'none',
  },
  danger: {
    background: palette.error,
    label: palette.onError,
    border: null,
    shadow: 'resting',
  },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'leading',
  disabled = false,
  loading = false,
  fullWidth = false,
  pill = false,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const tokens = VARIANTS[variant];
  const dimensions = SIZES[size];
  const inactive = disabled || loading;

  // A loading button stays the same width and swaps its label for a spinner, so the
  // layout does not jump while a request is in flight.
  //
  // Press feedback is native-driven via AnimatedPressable rather than the style-function
  // callback, so pressing does not re-render the button. Stitch specifies `active:scale-[0.98]`;
  // the shared `press.scale` token is the same order of movement.
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={inactive}
      feedback={fullWidth ? 'card' : 'scale'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        {
          height: dimensions.height,
          paddingHorizontal: dimensions.paddingHorizontal,
          gap: dimensions.gap,
          backgroundColor: tokens.background,
          borderRadius: pill ? radius.full : radius.card,
          borderWidth: tokens.border ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: tokens.border ?? 'transparent',
        },
        shadows[tokens.shadow],
        fullWidth && styles.fullWidth,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tokens.label} />
      ) : (
        <View style={[styles.content, { gap: dimensions.gap }]}>
          {icon && iconPosition === 'leading' ? (
            <Icon name={icon} size={size === 'sm' ? 16 : 20} color={tokens.label} />
          ) : null}
          {/*
            Stitch is internally inconsistent about button text: the desktop login uses
            `title-lg` (18px), while the generated mobile login uses `label-md` (12px).
            12px is too small for a primary action on a 48px control, and 18px reads
            chunky on a phone. `bodyLg` (16px) is the standard mobile size and sits
            between the two Stitch answers.
          */}
          <Text
            variant={size === 'sm' ? 'labelMd' : size === 'lg' ? 'titleLg' : 'bodyLg'}
            color={tokens.label}
            numberOfLines={1}
          >
            {label}
          </Text>
          {icon && iconPosition === 'trailing' ? (
            <Icon name={icon} size={size === 'sm' ? 16 : 20} color={tokens.label} />
          ) : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});
