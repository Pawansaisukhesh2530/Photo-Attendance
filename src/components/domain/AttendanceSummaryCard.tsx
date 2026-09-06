import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/primitives/Card';
import { Icon, type IconName } from '@/components/primitives/Icon';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, statusColors, useResponsive } from '@/theme';
import type { AttendanceStatus, AttendanceSummary } from '@/types';

export interface MetricCardProps {
  label: string;
  value: string | number;
  icon: IconName;
  accent: string;
  well: string;
  /** Tints the whole card, as Stitch does for the Needs Review tile. */
  cardBackground?: string;
  cardBorder?: string;
  suffix?: string;
  progress?: number;
  flag?: string;
  selected?: boolean;
  onPress?: () => void;
}

/**
 * A single summary tile.
 *
 * From the Stitch Attendance Results bento grid: a small tinted circular icon well beside an
 * ALL-CAPS caption, with the count set in `display-lg` beneath and coloured by status.
 * Stitch tints the entire Needs Review card `tertiary-fixed`; that is reproduced via
 * `cardBackground`.
 *
 * The value steps down to `headlineLg` on compact phones — 48px numerals overflow a two-up
 * grid at 320dp once a value reaches three characters.
 */
export function MetricCard({
  label,
  value,
  icon,
  accent,
  well,
  cardBackground,
  cardBorder,
  suffix,
  progress,
  flag,
  selected = false,
  onPress,
}: MetricCardProps) {
  const { isCompact } = useResponsive();

  return (
    <Card
      onPress={onPress}
      style={[
        styles.metricCard,
        isCompact ? styles.metricCardCompact : styles.metricCardExpanded,
        cardBackground ? { backgroundColor: cardBackground } : null,
        cardBorder ? { borderColor: cardBorder } : null,
        selected ? styles.metricSelected : null,
      ]}
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.metricHeader}>
        <View style={[styles.iconWell, { backgroundColor: well }]}>
          <Icon name={icon} size={16} color={accent} />
        </View>
        <Text
          variant="labelMd"
          color={palette.onSurfaceVariant}
          numberOfLines={1}
          style={styles.metricLabel}
        >
          {label.toUpperCase()}
        </Text>
      </View>

      <View style={styles.valueRow}>
        <Text variant={isCompact ? 'headlineLg' : 'displayLg'} color={accent}>
          {value}
        </Text>
        {suffix ? (
          <Text variant="headlineSm" color={palette.outlineVariant}>
            {suffix}
          </Text>
        ) : null}
      </View>

      {progress !== undefined ? (
        <ProgressBar progress={progress} color={accent} height={6} style={styles.metricProgress} />
      ) : null}

      {flag ? (
        <View style={styles.flag}>
          <Text variant="labelMd" color={palette.error} style={styles.flagText}>
            {flag}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

export interface AttendanceSummaryCardProps {
  summary: AttendanceSummary;
  /** Currently active roster filter, so the matching tile reads as selected. */
  activeFilter?: AttendanceStatus | 'ALL';
  onPressStatus?: (status: AttendanceStatus) => void;
}

/**
 * The attendance summary grid.
 *
 * Stitch shows four tiles: Present, Absent, Needs Review, Recognized. This shows five —
 * Undetermined (UNKNOWN) is added as its own tile whenever the count is non-zero, because
 * folding it into Absent would conflate "we could not tell" with "this student was not
 * here". Those are different claims about a student's record and the brief is explicit that
 * they must not look alike.
 *
 * Recognized keeps its Stitch treatment: the "46/48" readout with a progress bar beneath.
 * Tiles double as roster filters, replacing the desktop table's column sorting.
 */
export function AttendanceSummaryCard({
  summary,
  activeFilter = 'ALL',
  onPressStatus,
}: AttendanceSummaryCardProps) {
  const { isExpanded } = useResponsive();
  const showUnknown = summary.unknown > 0;
  const cell = isExpanded ? styles.cellThird : styles.cellHalf;

  return (
    <View style={styles.grid}>
      <View style={cell}>
        <MetricCard
          label="Present"
          value={summary.present}
          icon="present"
          accent={statusColors.PRESENT.accent}
          well={palette.secondaryContainer}
          selected={activeFilter === 'PRESENT'}
          {...(onPressStatus ? { onPress: () => onPressStatus('PRESENT') } : {})}
        />
      </View>

      <View style={cell}>
        <MetricCard
          label="Absent"
          value={summary.absent}
          icon="absent"
          accent={statusColors.ABSENT.accent}
          well={palette.errorContainer}
          selected={activeFilter === 'ABSENT'}
          {...(onPressStatus ? { onPress: () => onPressStatus('ABSENT') } : {})}
        />
      </View>

      <View style={cell}>
        <MetricCard
          label="Needs review"
          value={summary.review}
          icon="review"
          accent={palette.onTertiaryFixedVariant}
          well={palette.tertiaryContainer}
          // Stitch tints this entire card.
          cardBackground={palette.tertiaryFixed}
          cardBorder={palette.tertiaryFixedDim}
          selected={activeFilter === 'REVIEW'}
          {...(summary.review > 0 ? { flag: 'Action needed' } : {})}
          {...(onPressStatus ? { onPress: () => onPressStatus('REVIEW') } : {})}
        />
      </View>

      {showUnknown ? (
        <View style={cell}>
          <MetricCard
            label="Undetermined"
            value={summary.unknown}
            icon="unknown"
            accent={statusColors.UNKNOWN.accent}
            well={palette.surfaceContainerHigh}
            selected={activeFilter === 'UNKNOWN'}
            {...(onPressStatus ? { onPress: () => onPressStatus('UNKNOWN') } : {})}
          />
        </View>
      ) : null}

      <View style={showUnknown && !isExpanded ? styles.cellFull : cell}>
        <MetricCard
          label="Recognized"
          value={summary.recognized}
          icon="recognition"
          accent={palette.primary}
          well={palette.primaryFixed}
          suffix={`/${summary.total}`}
          progress={summary.total === 0 ? 0 : summary.recognized / summary.total}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  cellHalf: {
    width: '50%',
    padding: spacing.xs,
  },
  cellThird: {
    width: '33.333%',
    padding: spacing.xs,
  },
  cellFull: {
    width: '100%',
    padding: spacing.xs,
  },
  metricCard: {
    justifyContent: 'space-between',
  },
  metricCardCompact: {
    minHeight: 128,
    height: 128,
  },
  metricCardExpanded: {
    minHeight: 176,
    height: 176,
  },
  metricSelected: {
    borderColor: palette.primary,
    borderWidth: 2,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  iconWell: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  metricProgress: {
    marginTop: spacing.sm,
  },
  flag: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: palette.errorContainer,
  },
  flagText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
});
