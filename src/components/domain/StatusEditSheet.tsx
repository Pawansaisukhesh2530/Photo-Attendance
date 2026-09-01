import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedOverlay } from '@/components/primitives/AnimatedOverlay';
import { Avatar } from '@/components/primitives/Avatar';
import { Icon, type IconName } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { palette, radius, shadows, spacing, statusColors, touch } from '@/theme';
import type { AttendanceRecord, AttendanceStatus } from '@/types';

export interface StatusEditSheetProps {
  record: AttendanceRecord | null;
  visible: boolean;
  submitting?: boolean;
  onSelect: (status: AttendanceStatus) => void;
  onDismiss: () => void;
  /** Shown when editing an already-finalized session. */
  finalized?: boolean;
  /** Offers "Resolve as twin match" for TWIN_AMBIGUITY records. */
  onOpenTwinReview?: () => void;
}

const OPTIONS: {
  status: Extract<AttendanceStatus, 'PRESENT' | 'ABSENT'>;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  {
    status: 'PRESENT',
    label: 'Present',
    description: 'Mark this student as attending',
    icon: 'present',
  },
  {
    status: 'ABSENT',
    label: 'Absent',
    description: 'Mark this student as not attending',
    icon: 'absent',
  },
];

const REASON_COPY: Record<string, string> = {
  TWIN_AMBIGUITY: 'Could not be told apart from a similar-looking student.',
  LOW_CONFIDENCE: 'A match was found, but not confidently enough to record.',
  OCCLUDED: 'This student was partly hidden in the photo.',
  NOT_DETECTED: 'This student was not found anywhere in the photo.',
  POOR_IMAGE_QUALITY: 'Image quality was too low for a reliable match.',
};

/**
 * Manual attendance editing.
 *
 * Replaces the desktop `more_vert` overflow menu, which has no touch equivalent. Tapping a
 * roster row raises this sheet with two large targets.
 *
 * Only PRESENT and ABSENT are offered. REVIEW and UNKNOWN are states the *system* produces,
 * not decisions a human makes — a lecturer resolving a case is always concluding "this
 * person was here" or "was not". Letting them set a record back to REVIEW would create a
 * state nobody can act on. To leave a case open, they simply close this sheet.
 *
 * Unlike finalization, this is a reversible per-student change, so a dismissible sheet is
 * the right weight of interaction here.
 *
 * `aiStatus` is never shown as editable and is never sent — the AI recommendation is
 * displayed read-only for context and remains untouched by any edit.
 */
export function StatusEditSheet({
  record,
  visible,
  submitting = false,
  onSelect,
  onDismiss,
  finalized = false,
  onOpenTwinReview,
}: StatusEditSheetProps) {
  const insets = useSafeAreaInsets();

  if (!record) return null;

  const aiTokens = statusColors[record.aiStatus];
  const wasCorrected = record.status !== record.aiStatus;
  const reason = record.reviewReason ? REASON_COPY[record.reviewReason] : null;

  return (
    <AnimatedOverlay
      visible={visible}
      variant="sheet"
      onRequestClose={onDismiss}
      // A per-student status change is reversible, so a casual dismissal is fine here.
      onBackdropPress={onDismiss}
    >
      <View
        style={[styles.sheet, shadows.raised, { paddingBottom: insets.bottom + spacing.md }]}
      >
          <View style={styles.handle} />

          {/* Student */}
          <View style={styles.header}>
            <Avatar
              name={record.studentName}
              uri={record.avatarUrl}
              size={48}
              {...(record.reviewReason === 'TWIN_AMBIGUITY'
                ? { ringColor: palette.tertiaryFixedDim }
                : {})}
            />
            <View style={styles.headerText}>
              <Text variant="titleLg" color={palette.onSurface} numberOfLines={1}>
                {record.studentName}
              </Text>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                {record.rollNumber}
              </Text>
            </View>
          </View>

          {/* Read-only AI context. */}
          <View style={styles.context}>
            <View style={styles.contextRow}>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                AI RECOMMENDATION
              </Text>
              <View style={styles.contextValue}>
                <View style={[styles.dot, { backgroundColor: aiTokens.accent }]} />
                <Text variant="bodyMd" color={palette.onSurface}>
                  {record.aiStatus.charAt(0) + record.aiStatus.slice(1).toLowerCase()}
                </Text>
                {record.confidence !== null ? (
                  <Text variant="labelMd" color={palette.onSurfaceVariant}>
                    · {Math.round(record.confidence * 100)}%
                  </Text>
                ) : null}
              </View>
            </View>

            {reason ? (
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                {reason}
              </Text>
            ) : null}

            {wasCorrected ? (
              <View style={styles.correctedRow}>
                <Icon name="edit" size={14} color={palette.primary} />
                <Text variant="labelMd" color={palette.primary} style={styles.flexText}>
                  You changed this from the AI recommendation.
                </Text>
              </View>
            ) : null}
          </View>

          {finalized ? (
            <View style={styles.finalizedNotice}>
              <Icon name="info" size={16} color={palette.onTertiaryFixedVariant} />
              <Text
                variant="labelMd"
                color={palette.onTertiaryFixedVariant}
                style={styles.flexText}
              >
                This session is finalized. Your change will be recorded as an amendment.
              </Text>
            </View>
          ) : null}

          {/* Options */}
          <View style={styles.options}>
            {OPTIONS.map((option) => {
              const isCurrent = record.status === option.status;
              const tokens = statusColors[option.status];

              return (
                <AnimatedPressable
                  key={option.status}
                  onPress={() => onSelect(option.status)}
                  disabled={submitting || isCurrent}
                  feedback="card"
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent, disabled: submitting }}
                  accessibilityLabel={`Mark ${option.label}`}
                  style={[styles.option, isCurrent && styles.optionCurrent]}
                >
                  <View style={[styles.optionIcon, { backgroundColor: tokens.container }]}>
                    <Icon name={option.icon} size={20} color={tokens.accent} />
                  </View>

                  <View style={styles.optionText}>
                    <Text variant="bodyLg" color={palette.onSurface}>
                      {option.label}
                    </Text>
                    <Text variant="labelMd" color={palette.onSurfaceVariant}>
                      {isCurrent ? 'Current status' : option.description}
                    </Text>
                  </View>

                  {isCurrent ? (
                    <Icon name="check" size={20} color={tokens.accent} />
                  ) : (
                    <Icon name="chevronRight" size={18} color={palette.outline} />
                  )}
                </AnimatedPressable>
              );
            })}

            {record.reviewReason === 'TWIN_AMBIGUITY' && onOpenTwinReview ? (
              <AnimatedPressable
                onPress={onOpenTwinReview}
                disabled={submitting}
                feedback="card"
                accessibilityRole="button"
                accessibilityLabel="Compare with the similar student"
                style={styles.option}
              >
                <View style={[styles.optionIcon, { backgroundColor: palette.tertiaryFixed }]}>
                  <Icon name="twin" size={20} color={palette.onTertiaryFixedVariant} />
                </View>
                <View style={styles.optionText}>
                  <Text variant="bodyLg" color={palette.onSurface}>
                    Compare side by side
                  </Text>
                  <Text variant="labelMd" color={palette.onSurfaceVariant}>
                    Open the twin match review
                  </Text>
                </View>
                <Icon name="chevronRight" size={18} color={palette.outline} />
              </AnimatedPressable>
            ) : null}
          </View>
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
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  context: {
    gap: spacing.xs,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainerLow,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  contextValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  correctedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  flexText: {
    flex: 1,
  },
  finalizedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.tertiaryFixed,
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: touch.large + 8,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    backgroundColor: palette.surfaceContainerLowest,
  },
  optionCurrent: {
    backgroundColor: palette.surfaceContainerLow,
    borderColor: palette.primaryFixedDim,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
});
