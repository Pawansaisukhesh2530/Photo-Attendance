import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/primitives/Icon';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, statusColors } from '@/theme';
import type { AttendanceStatus, AuditAction, AuditEntry } from '@/types';
import { formatShortDate, formatTime } from '@/utils/datetime';

export interface AuditTimelineProps {
  entries: AuditEntry[];
}

/** Presentation per action: glyph, tint, and a human sentence. */
const ACTION_META: Record<
  AuditAction,
  { icon: IconName; accent: string; well: string; title: string }
> = {
  ATTENDANCE_CAPTURED: {
    icon: 'camera',
    accent: palette.primary,
    well: palette.primaryFixed,
    title: 'Attendance captured',
  },
  STATUS_CHANGED: {
    icon: 'edit',
    accent: palette.primary,
    well: palette.primaryFixed,
    title: 'Status changed',
  },
  TWIN_RESOLVED: {
    icon: 'twin',
    accent: palette.onTertiaryFixedVariant,
    well: palette.tertiaryFixed,
    title: 'Ambiguous match resolved',
  },
  SESSION_FINALIZED: {
    icon: 'finalize',
    accent: palette.secondary,
    well: palette.secondaryContainer,
    title: 'Attendance finalized',
  },
  FINALIZED_SESSION_EDITED: {
    icon: 'edit',
    accent: palette.onTertiaryFixedVariant,
    well: palette.tertiaryFixed,
    title: 'Amended after finalization',
  },
  STUDENT_ENROLLED: {
    icon: 'students',
    accent: palette.primary,
    well: palette.primaryFixed,
    title: 'Student enrolled',
  },
  FACE_ENROLLED: {
    icon: 'person',
    accent: palette.primary,
    well: palette.primaryFixed,
    title: 'Face enrolled',
  },

  /*
   * Administrative actions.
   *
   * Neutral surface tints rather than the primary/amber pairs used above: configuration changes
   * are routine record-keeping, and giving them the same visual weight as an attendance amendment
   * would make a genuine attendance dispute harder to spot in a mixed timeline.
   */
  FACULTY_CREATED: {
    icon: 'faculty',
    accent: palette.onSurface,
    well: palette.surfaceContainerHigh,
    title: 'Faculty added',
  },
  FACULTY_UPDATED: {
    icon: 'faculty',
    accent: palette.onSurface,
    well: palette.surfaceContainerHigh,
    title: 'Faculty updated',
  },
  FACULTY_STATUS_CHANGED: {
    icon: 'faculty',
    accent: palette.onTertiaryFixedVariant,
    well: palette.tertiaryFixed,
    title: 'Faculty status changed',
  },
  CLASS_CREATED: {
    icon: 'classes',
    accent: palette.onSurface,
    well: palette.surfaceContainerHigh,
    title: 'Class created',
  },
  CLASS_UPDATED: {
    icon: 'classes',
    accent: palette.onSurface,
    well: palette.surfaceContainerHigh,
    title: 'Class updated',
  },
  FACULTY_ASSIGNED: {
    icon: 'enrollments',
    accent: palette.primary,
    well: palette.primaryFixed,
    title: 'Faculty assignment changed',
  },
  ENROLMENT_UPDATED: {
    icon: 'students',
    accent: palette.onSurface,
    well: palette.surfaceContainerHigh,
    title: 'Enrolment updated',
  },
  SETTING_CHANGED: {
    icon: 'settings',
    accent: palette.onTertiaryFixedVariant,
    well: palette.tertiaryFixed,
    title: 'Institution setting changed',
  },
};

function StatusChip({ status, muted = false }: { status: AttendanceStatus; muted?: boolean }) {
  const tokens = statusColors[status];
  return (
    <View style={[styles.chip, muted && styles.chipMuted]}>
      <View style={[styles.dot, { backgroundColor: tokens.accent }]} />
      <Text variant="labelMd" color={muted ? palette.onSurfaceVariant : palette.onSurface}>
        {status.charAt(0) + status.slice(1).toLowerCase()}
      </Text>
    </View>
  );
}

const AuditRow = memo(function AuditRow({
  entry,
  last,
}: {
  entry: AuditEntry;
  last: boolean;
}) {
  const meta = ACTION_META[entry.action];
  const hasTransition = entry.previousStatus !== null && entry.newStatus !== null;
  const hasValueChange =
    entry.previousValue !== undefined || entry.newValue !== undefined;

  return (
    <View style={styles.row}>
      {/* Rail and node */}
      <View style={styles.gutter}>
        <View style={[styles.node, { backgroundColor: meta.well }]}>
          <Icon name={meta.icon} size={16} color={meta.accent} />
        </View>
        {!last ? <View style={styles.rail} /> : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodyLg" color={palette.onSurface} style={styles.flex}>
            {meta.title}
          </Text>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {formatTime(entry.at)}
          </Text>
        </View>

        {/* Student, when the entry is about one. */}
        {entry.studentName ? (
          <Text variant="bodyMd" color={palette.onSurfaceVariant}>
            {entry.studentName}
            {entry.rollNumber ? ` · ${entry.rollNumber}` : ''}
          </Text>
        ) : null}

        {/*
          Subject of an administrative entry. Without this an admin action would render as a bare
          title with no indication of which faculty member or class it concerned.
        */}
        {!entry.studentName && entry.entityLabel ? (
          <Text variant="bodyMd" color={palette.onSurfaceVariant}>
            {entry.entityLabel}
            {entry.classDisplayCode && entry.classDisplayCode !== entry.entityLabel
              ? ` · ${entry.classDisplayCode}`
              : ''}
          </Text>
        ) : null}

        {/* Original -> new. */}
        {hasTransition ? (
          <View style={styles.transition}>
            <StatusChip status={entry.previousStatus!} muted />
            <Icon name="forward" size={14} color={palette.outline} />
            <StatusChip status={entry.newStatus!} />
          </View>
        ) : null}

        {/*
          Before/after for a non-attendance change, using the same left-to-right arrow as a status
          transition so one visual grammar covers both. Rendered only when there is no status
          transition, so an entry never shows two competing before/after rows.
        */}
        {!hasTransition && hasValueChange ? (
          <View style={styles.transition}>
            <View style={[styles.chip, styles.chipMuted]}>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                {entry.previousValue ?? 'Not set'}
              </Text>
            </View>
            <Icon name="forward" size={14} color={palette.outline} />
            <View style={styles.chip}>
              <Text variant="labelMd" color={palette.onSurface}>
                {entry.newValue ?? 'Cleared'}
              </Text>
            </View>
          </View>
        ) : null}

        {entry.reason ? (
          <View style={styles.reason}>
            <Icon name="info" size={13} color={palette.onSurfaceVariant} />
            <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.flex}>
              {entry.reason}
            </Text>
          </View>
        ) : null}

        {/* Attribution. */}
        <Text variant="labelMd" color={palette.outline}>
          {entry.actorName}
          {entry.actorRole ? ` · ${entry.actorRole}` : ''} · {formatShortDate(entry.at)}
        </Text>
      </View>
    </View>
  );
});

/**
 * Change history for an attendance session.
 *
 * A vertical timeline rather than the wide table the Stitch desktop design implies. The audit
 * fields — student, original status, new status, changed by, changed at, reason — are six
 * columns, which at phone width would give each about 60dp. Stacking them per entry keeps every
 * field legible and puts the most recent change first, which is what someone opening this
 * screen is looking for.
 *
 * Strictly read-only. These entries come from the backend, which owns the persisted audit
 * history. The frontend does not derive this list from `aiStatus` versus `status`; that
 * comparison drives an "edited" hint in the roster and nothing more.
 */
export function AuditTimeline({ entries }: AuditTimelineProps) {
  return (
    <View>
      {entries.map((entry, index) => (
        <AuditRow key={entry.id} entry={entry} last={index === entries.length - 1} />
      ))}
    </View>
  );
}

const NODE = 32;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  gutter: {
    width: NODE,
    alignItems: 'center',
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: {
    flex: 1,
    width: 2,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: palette.outlineVariant,
    borderRadius: radius.full,
  },
  body: {
    flex: 1,
    gap: 3,
    paddingBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  transition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  chipMuted: {
    backgroundColor: palette.surfaceContainer,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
