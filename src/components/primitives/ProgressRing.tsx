import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ATTENDANCE_THRESHOLD } from '@/constants/config';
import { palette, radius } from '@/theme';

import { Text } from './Text';

export interface ProgressRingProps {
  /** Percentage 0..100. Pass null when there is no data yet. */
  percentage: number | null;
  size?: number;
  strokeWidth?: number;
  /** Overrides the threshold-derived colour. */
  color?: string;
  /** Caption rendered beneath the value, inside the ring. */
  caption?: string;
  /** Suppresses the "%" suffix. */
  hideSuffix?: boolean;
}

/**
 * Circular attendance ring.
 *
 * Stitch uses two different treatments for this: the dashboard metric card draws a real
 * SVG arc via `stroke-dashoffset`, while the My Classes cards draw a *full* 4px border
 * ring with the percentage as text inside, regardless of value.
 *
 * This implements the arc for both. A full ring next to the text "78%" misrepresents the
 * number it sits beside — the ring reads as complete while the label says it is not — and
 * the brief is explicit that usability wins over visual similarity. The colour, stroke
 * weight and diameter still match Stitch.
 *
 * Colour is derived from the institutional threshold unless overridden, so a struggling
 * class is visually distinct without the caller having to decide.
 */
export function ProgressRing({
  percentage,
  size = 48,
  strokeWidth = 4,
  color,
  caption,
  hideSuffix = false,
}: ProgressRingProps) {
  const hasValue = percentage !== null && Number.isFinite(percentage);
  const value = hasValue ? Math.max(0, Math.min(100, percentage)) : 0;

  const resolvedColor =
    color ??
    (!hasValue
      ? palette.outline
      : value < ATTENDANCE_THRESHOLD
        ? palette.tertiaryFixedDim
        : palette.primary);

  const textColor =
    color ??
    (!hasValue
      ? palette.outline
      : value < ATTENDANCE_THRESHOLD
        ? palette.onTertiaryFixedVariant
        : palette.primary);

  // SVG geometry: radius must leave room for half the stroke on each side or the arc
  // clips at the viewBox edge.
  const centre = size / 2;
  const r = centre - strokeWidth / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - value / 100);

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={
        hasValue
          ? `${Math.round(value)} percent${caption ? ` ${caption}` : ' attendance'}`
          : 'Attendance not available'
      }
      accessibilityValue={hasValue ? { min: 0, max: 100, now: Math.round(value) } : undefined}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={centre}
          cy={centre}
          r={r}
          stroke={palette.surfaceContainerHighest}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {hasValue ? (
          <Circle
            cx={centre}
            cy={centre}
            r={r}
            stroke={resolvedColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            // Start the arc at 12 o'clock rather than 3 o'clock.
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        ) : null}
      </Svg>

      <View style={styles.label} pointerEvents="none">
        <Text
          variant={size >= 72 ? 'headlineSm' : 'labelMd'}
          color={textColor}
          style={styles.value}
        >
          {hasValue ? `${Math.round(value)}${hideSuffix ? '' : '%'}` : '--'}
        </Text>
        {caption && size >= 72 ? (
          <Text variant="labelMd" color={palette.onSurfaceVariant} align="center">
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  svg: {
    position: 'absolute',
  },
  label: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    // Inter's default line height leaves the numeral optically high inside a ring.
    includeFontPadding: false,
  },
});
