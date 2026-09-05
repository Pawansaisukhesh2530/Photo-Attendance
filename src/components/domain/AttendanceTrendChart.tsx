import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, typography, useResponsive } from '@/theme';
import type { AttendanceTrendPoint } from '@/types';
import { formatAxisDate, formatShortDate } from '@/utils/datetime';

export interface AttendanceTrendChartProps {
  points: AttendanceTrendPoint[];
  /**
   * The institutional threshold, 0..100, as reported by the service.
   *
   * Passed in rather than read from `constants/config` on purpose: the threshold is institution
   * policy that the backend owns, so the chart must draw the figure the report actually carries.
   */
  threshold: number;
  height?: number;
}

/** Vertical span. Attendance rarely drops below 40%, so a 0-100 axis wastes half the chart. */
const Y_MIN = 40;
const Y_MAX = 100;

const PADDING = { top: spacing.md, right: spacing.md, bottom: spacing.lg, left: spacing.xl + 4 };

/** Y gridlines, in percent. Kept sparse — four labels is all a phone width can carry. */
const GRIDLINES = [40, 60, 80, 100];

function clampToAxis(percentage: number): number {
  return Math.max(Y_MIN, Math.min(Y_MAX, percentage));
}

/**
 * Attendance trend over time.
 *
 * Drawn directly with `react-native-svg`. No chart library: this is a polyline, four gridlines and
 * a dashed reference line, and a charting dependency would add a large surface for one small
 * shape. `ProgressRing` already establishes the precedent for hand-drawn SVG here.
 *
 * Design notes, since there is no Stitch screen for reports:
 *
 *   - The Y axis starts at 40% rather than 0. A cohort's attendance lives between roughly 60 and
 *     100, and a 0-based axis compresses every real movement into the top third. Values below the
 *     floor are clamped and the axis is labelled, so nothing is hidden.
 *   - The threshold is a dashed amber line using the same `tertiary` pairing that marks a
 *     below-threshold student everywhere else in the app, so the colour already means "attention"
 *     to anyone who has seen the Students screen.
 *   - X labels are thinned to at most four. Eleven dates at phone width overlap into mush, and an
 *     unreadable label is worse than no label.
 *
 * Accessibility: the chart carries a full textual summary, and every figure it plots is also
 * printed as text beneath it, so nothing is available only by reading pixel positions. Colour is
 * never the sole carrier of meaning — the threshold line is dashed and labelled.
 */
export function AttendanceTrendChart({
  points,
  threshold,
  height = 180,
}: AttendanceTrendChartProps) {
  const { width: windowWidth, screenPadding, isCompact } = useResponsive();

  // Card padding is spacing.md each side, inside the screen margin.
  const chartWidth = Math.max(
    240,
    windowWidth - screenPadding * 2 - spacing.md * 2,
  );

  const plot = {
    width: chartWidth - PADDING.left - PADDING.right,
    height: height - PADDING.top - PADDING.bottom,
  };

  const geometry = useMemo(() => {
    const toX = (index: number): number => {
      if (points.length <= 1) return PADDING.left + plot.width / 2;
      return PADDING.left + (index / (points.length - 1)) * plot.width;
    };

    const toY = (percentage: number): number => {
      const ratio = (clampToAxis(percentage) - Y_MIN) / (Y_MAX - Y_MIN);
      return PADDING.top + (1 - ratio) * plot.height;
    };

    const coords = points.map((point, index) => ({
      x: toX(index),
      y: toY(point.percentage),
      point,
    }));

    // A single explicit path rather than <Polyline>, so the same string can be closed into the
    // area fill below without recomputing anything.
    const line = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(' ');

    const baseline = PADDING.top + plot.height;
    const area =
      coords.length > 1
        ? `${line} L${coords[coords.length - 1]!.x.toFixed(2)} ${baseline} L${coords[0]!.x.toFixed(2)} ${baseline} Z`
        : '';

    return { coords, line, area, toY, baseline };
  }, [points, plot.width, plot.height]);

  /** At most four date labels, evenly spaced, always including the first and last. */
  const labelIndices = useMemo(() => {
    const max = isCompact ? 3 : 4;
    if (points.length <= max) return points.map((_, i) => i);

    const step = (points.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => Math.round(i * step));
  }, [points, isCompact]);

  /* ---------------------------------------------------------------- *
   * Empty
   * ---------------------------------------------------------------- */

  if (points.length === 0) {
    return (
      <Card>
        <View style={[styles.empty, { height }]}>
          <Text variant="bodyMd" color={palette.onSurfaceVariant} align="center">
            No attendance has been recorded in this period yet, so there is no trend to show.
          </Text>
        </View>
      </Card>
    );
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const lowest = points.reduce((min, p) => (p.percentage < min.percentage ? p : min), first);
  const highest = points.reduce((max, p) => (p.percentage > max.percentage ? p : max), first);
  const belowCount = points.filter((p) => p.percentage < threshold).length;

  /**
   * Textual equivalent of the chart, read by screen readers in place of the graphic.
   *
   * States range, direction, extremes and how often the cohort fell below the threshold — the four
   * things the shape of the line is there to convey.
   */
  const summary = [
    `Attendance trend across ${points.length} ${points.length === 1 ? 'day' : 'days'},`,
    `from ${formatShortDate(first.date)} at ${first.percentage} percent`,
    `to ${formatShortDate(last.date)} at ${last.percentage} percent.`,
    `Lowest ${lowest.percentage} percent on ${formatShortDate(lowest.date)},`,
    `highest ${highest.percentage} percent on ${formatShortDate(highest.date)}.`,
    `Threshold ${threshold} percent.`,
    belowCount === 0
      ? 'No day fell below the threshold.'
      : `${belowCount} ${belowCount === 1 ? 'day' : 'days'} fell below the threshold.`,
  ].join(' ');

  const thresholdY = geometry.toY(threshold);
  const thresholdVisible = threshold >= Y_MIN && threshold <= Y_MAX;

  return (
    <Card>
      <View accessible accessibilityRole="image" accessibilityLabel={summary}>
        <Svg width={chartWidth} height={height}>
          {/* Gridlines with Y labels. */}
          {GRIDLINES.map((value) => {
            const y = geometry.toY(value);
            return (
              <Line
                key={`grid-${value}`}
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + plot.width}
                y2={y}
                stroke={palette.outlineVariant}
                strokeWidth={StyleSheet.hairlineWidth * 2}
              />
            );
          })}

          {GRIDLINES.map((value) => (
            <SvgText
              key={`ylabel-${value}`}
              x={PADDING.left - 6}
              y={geometry.toY(value) + 4}
              fill={palette.outline}
              fontSize={10}
              fontFamily={typography.labelMd.fontFamily}
              textAnchor="end"
            >
              {`${value}%`}
            </SvgText>
          ))}

          {/* Area under the line, a faint primary wash for shape rather than precision. */}
          {geometry.area ? (
            <Path d={geometry.area} fill={palette.primaryFixed} fillOpacity={0.55} />
          ) : null}

          {/* The threshold reference line. Dashed and labelled, so it does not rely on colour. */}
          {thresholdVisible ? (
            <>
              <Line
                x1={PADDING.left}
                y1={thresholdY}
                x2={PADDING.left + plot.width}
                y2={thresholdY}
                stroke={palette.tertiaryFixedDim}
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              <SvgText
                x={PADDING.left + plot.width}
                y={thresholdY - 5}
                fill={palette.onTertiaryFixedVariant}
                fontSize={10}
                fontFamily={typography.labelMd.fontFamily}
                textAnchor="end"
              >
                {`Threshold ${threshold}%`}
              </SvgText>
            </>
          ) : null}

          {/* The trend itself. */}
          {geometry.coords.length > 1 ? (
            <Path
              d={geometry.line}
              fill="none"
              stroke={palette.primary}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {/* Points. Below-threshold days switch to amber so the dip is identifiable on the line
              as well as in the text beneath. */}
          {geometry.coords.map((c) => {
            const low = c.point.percentage < threshold;
            return (
              <Circle
                key={c.point.date}
                cx={c.x}
                cy={c.y}
                r={low ? 4.5 : 3.5}
                fill={low ? palette.tertiaryFixedDim : palette.primary}
                stroke={palette.surfaceContainerLowest}
                strokeWidth={1.5}
              />
            );
          })}

          {/* X labels, thinned. */}
          {labelIndices.map((index) => {
            const c = geometry.coords[index];
            if (!c) return null;
            const isFirst = index === 0;
            const isLast = index === points.length - 1;
            return (
              <SvgText
                key={`xlabel-${c.point.date}`}
                x={c.x}
                y={height - PADDING.bottom + 16}
                fill={palette.onSurfaceVariant}
                fontSize={10}
                fontFamily={typography.labelMd.fontFamily}
                textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
              >
                {formatAxisDate(c.point.date)}
              </SvgText>
            );
          })}
        </Svg>
      </View>

      {/*
        Every plotted figure, in text. The chart is a summary; this is the record. A lecturer
        reading percentages off pixel positions would be guessing, and a screen reader cannot read
        pixel positions at all.
      */}
      <View style={styles.readout}>
        <View style={styles.readoutRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Latest
          </Text>
          <Text variant="bodyLg" color={palette.onSurface}>
            {last.percentage}% on {formatShortDate(last.date)}
          </Text>
        </View>
        <View style={styles.readoutRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Range
          </Text>
          <Text variant="bodyLg" color={palette.onSurface}>
            {lowest.percentage}%-{highest.percentage}%
          </Text>
        </View>
        <View style={styles.readoutRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Below {threshold}%
          </Text>
          <Text
            variant="bodyLg"
            color={belowCount > 0 ? palette.onTertiaryFixedVariant : palette.onSurface}
          >
            {belowCount} of {points.length} {points.length === 1 ? 'day' : 'days'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  readout: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: palette.outlineVariant,
    borderRadius: radius.none,
    gap: spacing.xs,
  },
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
