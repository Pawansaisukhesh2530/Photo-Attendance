import { Badge } from '@/components/primitives/Badge';
import { palette } from '@/theme';
import type { FacultyStatus } from '@/types';

export interface FacultyStatusBadgeProps {
  status: FacultyStatus | undefined;
}

/**
 * Employment status.
 *
 * Absent is rendered as ACTIVE, matching the contract note on `Faculty.status` — records predating
 * the admin area are active, not a mysterious fourth state.
 *
 * Each state carries a glyph as well as a tint, so the distinction survives for anyone who cannot
 * separate the colours. ON_LEAVE deliberately reads as a temporary state and INACTIVE as a
 * terminal one, because an administrator acts on them differently.
 */
export function FacultyStatusBadge({ status }: FacultyStatusBadgeProps) {
  const resolved = status ?? 'ACTIVE';

  if (resolved === 'ACTIVE') {
    return (
      <Badge
        label="Active"
        icon="present"
        background={palette.secondaryContainer}
        foreground={palette.onSecondaryContainer}
        border={palette.secondaryContainer}
      />
    );
  }

  if (resolved === 'ON_LEAVE') {
    return (
      <Badge
        label="On leave"
        icon="clock"
        background={palette.tertiaryFixed}
        foreground={palette.onTertiaryFixedVariant}
        border={palette.tertiaryFixedDim}
      />
    );
  }

  return (
    <Badge
      label="Inactive"
      icon="unknown"
      background={palette.surfaceContainerHigh}
      foreground={palette.onSurfaceVariant}
      border={palette.outlineVariant}
    />
  );
}
