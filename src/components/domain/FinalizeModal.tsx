import { StyleSheet, View } from 'react-native';

import { ConfirmationModal } from '@/components/primitives/ConfirmationModal';
import { Icon } from '@/components/primitives/Icon';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, statusColors } from '@/theme';
import type { AttendanceStatus, AttendanceSummary } from '@/types';

export interface FinalizeModalProps {
  visible: boolean;
  summary: AttendanceSummary;
  /** Records still flagged `reviewRequired` — REVIEW plus unresolved UNKNOWN. */
  unresolvedCount: number;
  submitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function CountRow({
  status,
  label,
  value,
}: {
  status: AttendanceStatus | 'TOTAL';
  label: string;
  value: number;
}) {
  const accent = status === 'TOTAL' ? palette.onSurfaceVariant : statusColors[status].accent;

  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        {status === 'TOTAL' ? null : <View style={[styles.dot, { backgroundColor: accent }]} />}
        <Text
          variant="bodyMd"
          color={status === 'TOTAL' ? palette.onSurfaceVariant : palette.onSurface}
        >
          {label}
        </Text>
      </View>
      <Text variant="bodyLg" color={status === 'TOTAL' ? palette.onSurfaceVariant : accent}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Finalize confirmation.
 *
 * Built on `ConfirmationModal` — a centred dialog, deliberately not a bottom sheet. A sheet
 * dismisses on a casual downward flick, and that is precisely the accidental gesture that
 * must not be able to commit a register. Finalizing requires a deliberate tap on a button,
 * and Cancel is the visually quieter control placed first, so the committing action is never
 * the path of least resistance.
 *
 * When review items remain, the tone shifts to warning and the copy names the count. The
 * service also refuses a silent finalize in that case — the client has to pass
 * `acknowledgeUnresolvedReviews` explicitly — so an accidental tap cannot record an
 * incomplete register even if this dialog were bypassed.
 *
 * The copy states plainly that attendance stays editable afterwards. Faculty who believe
 * finalizing locks the register will avoid finalizing at all, which leaves sessions
 * perpetually open.
 */
export function FinalizeModal({
  visible,
  summary,
  unresolvedCount,
  submitting = false,
  onConfirm,
  onCancel,
}: FinalizeModalProps) {
  const hasUnresolved = unresolvedCount > 0;

  const message = hasUnresolved
    ? `${unresolvedCount} ${unresolvedCount === 1 ? 'student' : 'students'} still ${unresolvedCount === 1 ? 'needs' : 'need'} review. You can finalize now and resolve them later, or go back and resolve them first.`
    : 'Attendance will be recorded for this class session. You can still edit it afterwards.';

  return (
    <ConfirmationModal
      visible={visible}
      tone={hasUnresolved ? 'warning' : 'default'}
      icon={hasUnresolved ? 'warning' : 'finalize'}
      title="Finalize attendance?"
      message={message}
      confirmLabel={hasUnresolved ? 'Finalize anyway' : 'Finalize'}
      cancelLabel={hasUnresolved ? 'Go back' : 'Cancel'}
      confirmLoading={submitting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <View style={styles.card}>
        <CountRow status="TOTAL" label="Total students" value={summary.total} />
        <View style={styles.divider} />
        <CountRow status="PRESENT" label="Present" value={summary.present} />
        <CountRow status="ABSENT" label="Absent" value={summary.absent} />
        <CountRow status="REVIEW" label="Needs review" value={summary.review} />
        {summary.unknown > 0 ? (
          <CountRow status="UNKNOWN" label="Undetermined" value={summary.unknown} />
        ) : null}
      </View>

      {hasUnresolved ? (
        <View style={styles.warning}>
          <Icon name="warning" size={16} color={palette.onTertiaryFixedVariant} />
          <Text
            variant="labelMd"
            color={palette.onTertiaryFixedVariant}
            style={styles.warningText}
          >
            Unresolved students stay marked for review and can be corrected from Attendance
            History.
          </Text>
        </View>
      ) : null}
    </ConfirmationModal>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainerLow,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: palette.outlineVariant,
    marginVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 26,
  },
  rowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.tertiaryFixed,
  },
  warningText: {
    flex: 1,
  },
});
