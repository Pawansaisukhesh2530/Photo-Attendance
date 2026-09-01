/**
 * Spacing, radii, shadows and breakpoints.
 *
 * `spacing` and `radius` are transcribed verbatim from the Stitch
 * `tailwind.config` blocks. `touch`, `breakpoints` and the shadow elevation names
 * are mobile additions with no Stitch equivalent — Stitch only ever targeted a
 * 2560x2048 desktop canvas, so touch sizing and phone/tablet breakpoints had to be
 * introduced here.
 */

import { Platform, type ViewStyle } from 'react-native';

/** Stitch `tailwind.config.spacing`. `unit` is the 4px base all others derive from. */
export const spacing = {
  unit: 4,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  /** Stitch `gutter` — desktop page gutter, reused as tablet content gutter. */
  gutter: 24,
  /** Stitch `margin-mobile` — the horizontal screen margin on phones. */
  screen: 16,
  /** Stitch `container-max`. Only relevant on tablets; phones are always fluid. */
  containerMax: 1280,
} as const;

/** Stitch `tailwind.config.borderRadius`, plus the ad-hoc 16px seen inline on cards. */
export const radius = {
  none: 0,
  base: 4,
  lg: 8,
  xl: 12,
  /** Stitch cards use an inline `rounded-[16px]` / `rounded-2xl`. */
  card: 16,
  full: 9999,
} as const;

/**
 * Stitch uses exactly two shadow recipes:
 *   resting card  0 1px 3px  rgba(15,23,42,0.08)
 *   raised card   0 10px 15px -3px rgba(15,23,42,0.1)
 *
 * React Native cannot express a negative spread, so the raised variant is
 * approximated with a larger radius and matching elevation on Android.
 */
export const shadows: Record<'none' | 'resting' | 'raised', ViewStyle> = {
  none: {},
  resting: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0f172a',
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    android: { elevation: 1 },
    default: {},
  })!,
  raised: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0f172a',
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 6 },
    default: {},
  })!,
};

/**
 * Minimum touch target sizes. Mobile addition — no Stitch equivalent, since the
 * desktop design relies on hover and 8px-tall click targets in places.
 * 44 is the iOS HIG minimum; 48 the Android Material minimum. We use 48 as the
 * floor for primary actions so both platforms are satisfied and the control is
 * comfortable for a lecturer holding a phone one-handed.
 */
export const touch = {
  min: 44,
  comfortable: 48,
  large: 56,
} as const;

/**
 * Width breakpoints, in dp. Chosen to match real device classes rather than
 * Stitch's Tailwind `md`/`lg` web breakpoints, which are meaningless on device.
 *
 *   compact  small phones (iPhone SE 320-375, small Android)
 *   regular  standard and large phones
 *   expanded tablets / iPads, where two-pane layouts become worthwhile
 */
export const breakpoints = {
  compact: 0,
  regular: 400,
  expanded: 768,
} as const;

export type SizeClass = 'compact' | 'regular' | 'expanded';

export function sizeClassForWidth(width: number): SizeClass {
  if (width >= breakpoints.expanded) return 'expanded';
  if (width >= breakpoints.regular) return 'regular';
  return 'compact';
}
