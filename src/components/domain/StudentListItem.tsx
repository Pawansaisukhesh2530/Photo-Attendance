import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/primitives/Avatar';
import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, statusColors, touch } from '@/theme';
import type { AttendanceRecord, ReviewReason } from '@/types';

import { AttendanceStatusBadge } from './AttendanceStatusBadge';

export interface StudentListItemProps {
  record: AttendanceRecord;
  onPress?: (record: AttendanceRecord) => void;
  /** Renders a Resolve action on rows still flagged for review. */
  onResolve?: (record: AttendanceRecord) => void;
  /** Shows the AI confidence meter. Hidden on finalized sessions where it is noise. */
  showConfidence?: boolean;
}

/** Short flags shown under the name. Keep terse — they share a wrapping row. */
const REASON_FLAG: Record<ReviewReason, { label: string; icon: 'twin' | 'unknown' | 'warning' }> = {
  TWIN_AMBIGUITY: { label: 'Twin detected', icon: 'twin' },
  LOW_CONFIDENCE: { label: 'Low confidence', icon: 'warning' },
  OCCLUDED: { label: 'Partly hidden', icon: 'unknown' },
  NOT_DETECTED: { label: 'Not detected', icon: 'unknown' },
  POOR_IMAGE_QUALITY: { label: 'Poor image', icon: 'warning' },
};

/**
 * One student row in an attendance session.
 *
 * Replaces the five-column Stitch results table, which cannot work on a phone: Roll No,
 * Student, AI Confidence, Status and a hover-revealed Action column would each get roughly
 * 70dp. Instead the row is a stacked cell — avatar, name, roll number and flags, status badge
 * — with the confidence meter as a thin bar beneath.
 *
 * Preserved from Stitch: the amber row tint and 4px left accent bar on review rows, the
 * amber ring on twin avatars, the "Twin Detected" flag, the confidence meter coloured by
 * status, and the explicit Resolve button that replaces the hidden `more_vert` affordance.
 *
 * Interactive boundaries. The row itself is a plain container. The tappable summary and the
 * Resolve action are siblings inside it, never one inside the other.
 *
 * That matters because a pressable row wrapping a pressable Resolve is a control nested in a
 * control: react-native-web renders both `accessibilityRole="button"` elements as real `<button>`
 * tags, and a `<button>` inside a `<button>` is invalid HTML. The browser recovers by closing the
 * outer element early, React logs a hydration error, and the accessibility tree ends up with one
 * interactive node inside another, so a screen reader cannot address Resolve cleanly and a tap near
 * it is ambiguous.
 *
 * When there is no Resolve action the trailing column holds nothing interactive, so it stays inside
 * the summary and the whole row remains a single tap target exactly as before. Only rows that
 * actually carry a Resolve button are split, which keeps the change off every finalized and
 * historical row.
 *
 * Memoised because rosters run past 60 rows inside a virtualised list; without it every
 * parent state change re-renders every sibling.
 */
export const StudentListItem = memo(function StudentListItem({
  record,
  onPress,
  onResolve,
  showConfidence = true,
}: StudentListItemProps) {
  const needsAttention = record.status === 'REVIEW' || record.status === 'UNKNOWN';
  const isReview = record.status === 'REVIEW';
  const isTwin = record.reviewReason === 'TWIN_AMBIGUITY';
  const wasEdited = record.editedAt !== null;
  const wasCorrected = record.status !== record.aiStatus;
  const flag = record.reviewReason ? REASON_FLAG[record.reviewReason] : null;
  const tokens = statusColors[record.status];
  const showResolve = needsAttention && record.reviewRequired && onResolve !== undefined;
  const summaryLabel = `${record.studentName}, roll ${record.rollNumber}, ${record.status.toLowerCase()}`;

  /*
    Status badge plus the row's trailing affordance. Lives inside the summary when that affordance is
    a decorative chevron, and beside the summary when it is the Resolve button, so Resolve always
    gets its own interactive boundary. The column itself is identical either way, which is what keeps
    the layout unchanged.
  */
  const trailing = (
    <View style={styles.trailing}>
      <AttendanceStatusBadge status={record.status} />

      {showResolve && onResolve ? (
        <AnimatedPressable
          onPress={() => onResolve(record)}
          feedback="scale"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Resolve ${record.studentName}`}
          accessibilityHint="Opens the review this student is flagged for"
          style={styles.resolveButton}
        >
          <Text variant="labelMd" color={palette.onSurface}>
            Resolve
          </Text>
        </AnimatedPressable>
      ) : onPress ? (
        <Icon name="chevronRight" size={18} color={palette.outline} />
      ) : null}
    </View>
  );

  const summaryContent = (
    <>
      <Avatar
        name={record.studentName}
        uri={record.avatarUrl}
        size={40}
        {...(isTwin ? { ringColor: statusColors.REVIEW.border } : {})}
      />

      <View style={styles.body}>
        <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
          {record.studentName}
        </Text>

        <View style={styles.metaRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {record.rollNumber}
          </Text>

          {flag ? (
            <View style={styles.flag}>
              <Icon
                name={flag.icon}
                size={12}
                color={isReview ? palette.tertiaryContainer : palette.outline}
              />
              <Text
                variant="labelMd"
                color={isReview ? palette.tertiaryContainer : palette.outline}
              >
                {flag.label}
              </Text>
            </View>
          ) : null}

          {wasEdited ? (
            <View style={styles.flag}>
              <Icon name="edit" size={12} color={palette.primary} />
              <Text variant="labelMd" color={palette.primary}>
                {wasCorrected ? 'Corrected' : 'Edited'}
              </Text>
            </View>
          ) : null}
        </View>

        {showConfidence && record.confidence !== null ? (
          <View style={styles.confidenceRow}>
            <ProgressBar
              progress={record.confidence}
              color={tokens.accent}
              height={4}
              animated={false}
              style={styles.confidenceBar}
              accessibilityLabel={`Recognition confidence ${Math.round(record.confidence * 100)} percent`}
            />
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              {Math.round(record.confidence * 100)}%
            </Text>
          </View>
        ) : null}
      </View>

      {showResolve ? null : trailing}
    </>
  );

  return (
    <View
      style={[
        styles.row,
        isReview && styles.reviewRow,
        record.status === 'UNKNOWN' && styles.unknownRow,
      ]}
    >
      {needsAttention ? (
        <View style={[styles.accent, { backgroundColor: tokens.accent }]} />
      ) : null}

      {onPress ? (
        <AnimatedPressable
          onPress={() => onPress(record)}
          accessibilityRole="button"
          accessibilityLabel={summaryLabel}
          accessibilityHint="Opens attendance options for this student"
          // Opacity feedback, driven natively. A scale on a full-width roster row would read as the
          // list shifting, and the style-callback form would re-render the row on every press.
          feedback="opacity"
          style={styles.summary}
        >
          {summaryContent}
        </AnimatedPressable>
      ) : (
        // Not tappable, so not a control — but still one labelled unit for a screen reader, which is
        // what the row announced before.
        <View accessibilityRole="text" accessibilityLabel={summaryLabel} style={styles.summary}>
          {summaryContent}
        </View>
      )}

      {showResolve ? trailing : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: touch.large + 12,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.surfaceContainerLowest,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  reviewRow: {
    // Stitch tints review rows and adds a 4px left accent bar; both reproduced.
    backgroundColor: statusColors.REVIEW.surface,
    paddingLeft: spacing.md + 4,
  },
  unknownRow: {
    // Neutral tint, deliberately unlike the amber review row and unlike a plain absent row.
    backgroundColor: statusColors.UNKNOWN.surface,
    paddingLeft: spacing.md + 4,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  /*
    Carries the row's own flex layout so the geometry is unchanged by the split. With no Resolve
    button this is the row's only child and holds the trailing column too, reproducing the original
    single-pressable row exactly; with one, it sits beside the trailing column and the outer row's
    gap supplies the same spacing the row gap used to.
  */
  summary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  confidenceBar: {
    flex: 1,
    maxWidth: 110,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  resolveButton: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.base,
    backgroundColor: palette.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
});
