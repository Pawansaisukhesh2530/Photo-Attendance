import { Badge } from '@/components/primitives/Badge';
import { statusColors } from '@/theme';
import type { AttendanceStatus } from '@/types';

const LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  REVIEW: 'Review',
  UNKNOWN: 'Unknown',
};

export interface AttendanceStatusBadgeProps {
  status: AttendanceStatus;
  /**
   * `dot` reproduces the Stitch results-table pill: neutral fill with a coloured dot.
   * `solid` uses the status's own container colour, for higher emphasis in summaries.
   */
  emphasis?: 'dot' | 'solid';
}

/**
 * The canonical way to render an attendance status. Nowhere in the app should map a
 * status to a colour or label independently — the four states carry real consequences
 * for a student, so their presentation must be identical everywhere.
 */
export function AttendanceStatusBadge({
  status,
  emphasis = 'dot',
}: AttendanceStatusBadgeProps) {
  const tokens = statusColors[status];

  if (emphasis === 'solid') {
    return (
      <Badge
        label={LABELS[status]}
        background={tokens.surface}
        foreground={tokens.onSurface}
        border={tokens.border}
        dotColor={tokens.accent}
      />
    );
  }

  return (
    <Badge
      label={LABELS[status]}
      background={statusColors.PRESENT.surface}
      foreground={statusColors.PRESENT.onSurface}
      border={statusColors.PRESENT.border}
      dotColor={tokens.accent}
    />
  );
}

export function attendanceStatusLabel(status: AttendanceStatus): string {
  return LABELS[status];
}
