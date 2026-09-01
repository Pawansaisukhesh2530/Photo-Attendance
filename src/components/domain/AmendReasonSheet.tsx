import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedOverlay } from '@/components/primitives/AnimatedOverlay';
import { Button } from '@/components/primitives/Button';
import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { palette, radius, shadows, spacing, statusColors, touch, typography } from '@/theme';
import type { AttendanceRecord, AttendanceStatus } from '@/types';

export interface AmendReasonSheetProps {
  visible: boolean;
  record: AttendanceRecord | null;
  /** The status the faculty member chose, pending a reason. */
  nextStatus: AttendanceStatus | null;
  submitting?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/**
 * Preset reasons, covering the cases that actually come up when a register is corrected after
 * the fact. "Other" reveals a free-text field rather than forcing one on every amendment.
 */
const PRESETS = [
  'Marked in error',
  'Student arrived late',
  'Verified in person',
  'Student left early',
] as const;

/**
 * Captures why a finalized register is being amended.
 *
 * Only appears for finalized sessions. Editing a draft needs no justification — the lecturer is
 * still working through the results — but changing a register that has already been recorded is
 * an amendment to an official document, and the audit trail is far more useful with a reason
 * than without one.
 *
 * A preset is one tap, so the common cases cost nothing. Free text is available but never
 * required, because a mandatory text field on a phone is exactly the kind of friction that
 * teaches people to avoid correcting records at all.
 *
 * The reason is passed to the service and stored by the backend. The frontend does not build an
 * audit history from it — that remains the server's responsibility.
 */
export function AmendReasonSheet({
  visible,
  record,
  nextStatus,
  submitting = false,
  onConfirm,
  onCancel,
}: AmendReasonSheetProps) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);

  if (!record || !nextStatus) return null;

  const fromTokens = statusColors[record.status];
  const toTokens = statusColors[nextStatus];

  const reset = (): void => {
    setSelected(null);
    setNote('');
    setShowNote(false);
  };

  const submit = (reason: string): void => {
    onConfirm(reason);
    reset();
  };

  const label = (status: AttendanceStatus): string =>
    status.charAt(0) + status.slice(1).toLowerCase();

  const dismiss = (): void => {
    reset();
    onCancel();
  };

  return (
    <AnimatedOverlay
      visible={visible}
      variant="sheet"
      onRequestClose={dismiss}
      // Dismissing abandons the amendment entirely; the record keeps its current status, so
      // nothing is committed without a reason.
      onBackdropPress={dismiss}
    >
      <View
        style={[styles.sheet, shadows.raised, { paddingBottom: insets.bottom + spacing.md }]}
      >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Icon name="edit" size={20} color={palette.onTertiaryFixedVariant} />
            </View>
            <View style={styles.flex}>
              <Text variant="titleLg" color={palette.onSurface}>
                Why the change?
              </Text>
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                This register is already finalized, so the change is recorded as an amendment.
              </Text>
            </View>
          </View>

          {/* What is actually changing. */}
          <View style={styles.transition}>
            <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
              {record.studentName}
            </Text>
            <View style={styles.transitionRow}>
              <View style={styles.chip}>
                <View style={[styles.dot, { backgroundColor: fromTokens.accent }]} />
                <Text variant="labelMd" color={palette.onSurfaceVariant}>
                  {label(record.status)}
                </Text>
              </View>
              <Icon name="forward" size={16} color={palette.outline} />
              <View style={styles.chip}>
                <View style={[styles.dot, { backgroundColor: toTokens.accent }]} />
                <Text variant="labelMd" color={palette.onSurface}>
                  {label(nextStatus)}
                </Text>
              </View>
            </View>
          </View>

          {showNote ? (
            <View style={styles.noteBlock}>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a short note (optional)"
                placeholderTextColor={palette.outline}
                multiline
                maxLength={140}
                autoFocus
                accessibilityLabel="Amendment note"
              />
              <Text variant="labelMd" color={palette.outline} align="right">
                {note.length}/140
              </Text>
              <Button
                label="Save amendment"
                icon="check"
                size="lg"
                fullWidth
                loading={submitting}
                onPress={() => submit(note.trim() || 'Other')}
              />
              <Button
                label="Back"
                variant="ghost"
                fullWidth
                disabled={submitting}
                onPress={() => setShowNote(false)}
              />
            </View>
          ) : (
            <View style={styles.presets}>
              {PRESETS.map((preset) => (
                <AnimatedPressable
                  key={preset}
                  onPress={() => {
                    setSelected(preset);
                    submit(preset);
                  }}
                  disabled={submitting}
                  feedback="card"
                  accessibilityRole="button"
                  accessibilityLabel={preset}
                  style={[styles.preset, selected === preset && styles.presetActive]}
                >
                  <Text variant="bodyLg" color={palette.onSurface} style={styles.flex}>
                    {preset}
                  </Text>
                  <Icon name="chevronRight" size={18} color={palette.outline} />
                </AnimatedPressable>
              ))}

              <AnimatedPressable
                onPress={() => setShowNote(true)}
                disabled={submitting}
                feedback="card"
                accessibilityRole="button"
                accessibilityLabel="Other reason"
                style={styles.preset}
              >
                <Text variant="bodyLg" color={palette.primary} style={styles.flex}>
                  Other…
                </Text>
                <Icon name="edit" size={18} color={palette.primary} />
              </AnimatedPressable>

              <Button
                label="Cancel"
                variant="ghost"
                fullWidth
                disabled={submitting}
                onPress={dismiss}
              />
            </View>
          )}
      </View>
    </AnimatedOverlay>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: palette.surfaceContainerLowest,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: palette.outlineVariant,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tertiaryFixed,
  },
  flex: {
    flex: 1,
  },
  transition: {
    gap: spacing.xs,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainerLow,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  transitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  presets: {
    gap: spacing.sm,
  },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.large,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    backgroundColor: palette.surfaceContainerLowest,
  },
  presetActive: {
    backgroundColor: palette.surfaceContainer,
    borderColor: palette.primaryFixedDim,
  },
  noteBlock: {
    gap: spacing.sm,
  },
  noteInput: {
    ...typography.bodyLg,
    color: palette.onSurface,
    minHeight: 88,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    backgroundColor: palette.surfaceContainerLowest,
    textAlignVertical: 'top',
  },
});
