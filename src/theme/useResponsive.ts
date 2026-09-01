import { useWindowDimensions } from 'react-native';

import { sizeClassForWidth, spacing, type SizeClass } from './layout';

export interface Responsive {
  width: number;
  height: number;
  sizeClass: SizeClass;
  /** True on tablets/iPads, where two-pane layouts and wider gutters make sense. */
  isExpanded: boolean;
  /** True on small phones, where labels may need to shorten and grids collapse to one column. */
  isCompact: boolean;
  isLandscape: boolean;
  /** Horizontal screen padding: Stitch `margin-mobile` on phones, `gutter` on tablets. */
  screenPadding: number;
  /**
   * Column count for card grids. Stitch's desktop dashboard uses a 4-up metric grid
   * and a 3-up class grid; on phones those become 2-up and 1-up respectively.
   */
  metricColumns: number;
  cardColumns: number;
}

/**
 * Single source of responsive decisions, so screens never branch on raw widths.
 *
 * Reacts to orientation changes and to iPad multitasking / Android split-screen,
 * both of which change window width without changing device.
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const sizeClass = sizeClassForWidth(width);
  const isExpanded = sizeClass === 'expanded';
  const isCompact = sizeClass === 'compact';

  return {
    width,
    height,
    sizeClass,
    isExpanded,
    isCompact,
    isLandscape: width > height,
    screenPadding: isExpanded ? spacing.gutter : spacing.screen,
    metricColumns: isExpanded ? 4 : 2,
    cardColumns: isExpanded ? 2 : 1,
  };
}
