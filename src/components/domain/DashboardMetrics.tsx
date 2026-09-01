import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/primitives/Card';
import { Icon, type IconName } from '@/components/primitives/Icon';
import { ProgressRing } from '@/components/primitives/ProgressRing';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, useResponsive } from '@/theme';

export interface FacultyMetrics {
  todayClassCount: number;
  attendanceDone: number;
  pendingReviews: number;
  averageAttendance: number | null;
}

export interface DashboardMetricsProps {
  metrics: FacultyMetrics;
  onPressPendingReviews?: () => void;
}

interface TileProps {
  label: string;
  value: string | number;
  icon: IconName;
  accent: string;
  well: string;
  flag?: string;
  ring?: number | null;
  onPress?: () => void;
}

/**
 * One metric tile.
 *
 * Reproduces the Stitch bento metric card: tinted icon well top-left, an optional chip
 * top-right, an ALL-CAPS `label-md` caption, and a `display-lg` value.
 *
 * The value drops from Stitch's 48px to `headlineLg` (32px) on compact phones. At 320dp a
 * two-up grid gives each tile about 145dp of inner width, and 48px numerals overflow that
 * as soon as a value reaches three characters like "100%".
 */
function MetricTile({ label, value, icon, accent, well, flag, ring, onPress }: TileProps) {
  const { isCompact } = useResponsive();

  return (
    <Card onPress={onPress} style={styles.tile}>
      <View style={styles.tileHeader}>
        <View style={[styles.iconWell, { backgroundColor: well }]}>
          <Icon name={icon} size={18} color={accent} />
        </View>
        {flag ? (
          <View style={styles.flag}>
            <Text variant="labelMd" color={palette.error} style={styles.flagText}>
              {flag}
            </Text>
          </View>
        ) : null}
      </View>

      <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>

      <View style={styles.valueRow}>
        <Text variant={isCompact ? 'headlineLg' : 'displayLg'} color={palette.onSurface}>
          {value}
        </Text>
        {ring !== undefined ? (
          <ProgressRing percentage={ring} size={44} strokeWidth={4} hideSuffix />
        ) : null}
      </View>
    </Card>
  );
}

/**
 * The dashboard metric grid.
 *
 * Stitch lays this out `grid-cols-2 md:grid-cols-4`. The 2-up phone arrangement is already
 * the Stitch mobile answer, so it is kept; tablets get 4-up via `useResponsive`.
 *
 * Note the colour choice on Pending Reviews: Stitch tints this tile with `error`, not the
 * amber it uses for the REVIEW *status* elsewhere. That is deliberate in the original and
 * is preserved — as a dashboard metric it signals "you have outstanding work", which is a
 * stronger call than an individual record being ambiguous.
 */
export function DashboardMetrics({ metrics, onPressPendingReviews }: DashboardMetricsProps) {
  const { isExpanded } = useResponsive();
  const cellStyle = isExpanded ? styles.cellQuarter : styles.cellHalf;

  return (
    <View style={styles.grid}>
      <View style={cellStyle}>
        <MetricTile
          label="Today's classes"
          value={metrics.todayClassCount}
          icon="classes"
          accent={palette.primary}
          well={palette.primaryFixed}
        />
      </View>

      <View style={cellStyle}>
        <MetricTile
          label="Attendance done"
          value={metrics.attendanceDone}
          icon="present"
          accent={palette.secondary}
          well={palette.secondaryContainer}
        />
      </View>

      <View style={cellStyle}>
        <MetricTile
          label="Pending review"
          value={metrics.pendingReviews}
          icon="review"
          accent={palette.error}
          well={palette.errorContainer}
          {...(metrics.pendingReviews > 0 ? { flag: 'Action needed' } : {})}
          {...(metrics.pendingReviews > 0 && onPressPendingReviews
            ? { onPress: onPressPendingReviews }
            : {})}
        />
      </View>

      <View style={cellStyle}>
        <MetricTile
          label="Avg attendance"
          value={metrics.averageAttendance === null ? '--' : `${metrics.averageAttendance}%`}
          icon="trend"
          accent={palette.primary}
          well={palette.primaryFixed}
          ring={metrics.averageAttendance}
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
  cellQuarter: {
    width: '25%',
    padding: spacing.xs,
  },
  tile: {
    minHeight: 124,
    justifyContent: 'space-between',
  },
  tileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: palette.errorContainer,
  },
  flagText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
});
