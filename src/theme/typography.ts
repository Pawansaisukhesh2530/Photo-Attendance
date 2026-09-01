/**
 * Type scale transcribed from the Stitch `tailwind.config.fontSize` block.
 * Family is Inter across every role (Stitch `designTheme.font: INTER`).
 *
 * Stitch expresses weights numerically; React Native on Android does not reliably
 * honour numeric `fontWeight` for custom fonts, so each role also carries an explicit
 * `fontFamily` pointing at a statically-loaded Inter face. Always use `fontFamily`,
 * not `fontWeight`, when styling text with these tokens.
 */

import type { TextStyle } from 'react-native';

/** Keys must match the names registered in `useAppFonts`. */
export const fontFamilies = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

type Role =
  | 'displayLg'
  | 'headlineLg'
  | 'headlineLgMobile'
  | 'headlineMd'
  | 'headlineSm'
  | 'titleLg'
  | 'bodyLg'
  | 'bodyMd'
  | 'labelMd';

/**
 * `letterSpacing` is converted from Stitch's `em` units to React Native's
 * absolute points by multiplying against the role's own font size.
 */
export const typography: Record<Role, TextStyle> = {
  // 48px / 1.2 / -0.02em / 700
  displayLg: {
    fontFamily: fontFamilies.bold,
    fontSize: 48,
    lineHeight: 58,
    letterSpacing: -0.96,
  },
  // 32px / 40px / -0.01em / 600
  headlineLg: {
    fontFamily: fontFamilies.semibold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.32,
  },
  // 24px / 32px / 600 — the one genuinely mobile-aware token Stitch defines.
  headlineLgMobile: {
    fontFamily: fontFamilies.semibold,
    fontSize: 24,
    lineHeight: 32,
  },
  // 24px / 32px / -0.01em / 600
  headlineMd: {
    fontFamily: fontFamilies.semibold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.24,
  },
  // 20px / 28px / 600
  headlineSm: {
    fontFamily: fontFamilies.semibold,
    fontSize: 20,
    lineHeight: 28,
  },
  // 18px / 24px / 600
  titleLg: {
    fontFamily: fontFamilies.semibold,
    fontSize: 18,
    lineHeight: 24,
  },
  // 16px / 24px / 400
  bodyLg: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  // 14px / 20px / 400
  bodyMd: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  // 12px / 16px / +0.05em / 500
  labelMd: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
};

export type TypographyRole = Role;
