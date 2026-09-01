import { palette, statusColors } from './colors';
import { fontFamilies, typography } from './typography';
import { radius, shadows, spacing, touch } from './layout';

export const theme = {
  colors: palette,
  status: statusColors,
  typography,
  fontFamilies,
  spacing,
  radius,
  shadows,
  touch,
} as const;

export type Theme = typeof theme;

export { palette, statusColors } from './colors';
export { typography, fontFamilies, type TypographyRole } from './typography';
export {
  spacing,
  radius,
  shadows,
  touch,
  breakpoints,
  sizeClassForWidth,
  type SizeClass,
} from './layout';
export { useAppFonts } from './useAppFonts';
export { useReducedMotion } from './useReducedMotion';
export { useResponsive, type Responsive } from './useResponsive';
export { BACKDROP_OPACITY, duration, easing, press, timing } from './motion';
