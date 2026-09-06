import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedOverlay } from '@/components/primitives/AnimatedOverlay';
import { Avatar } from '@/components/primitives/Avatar';
import { GlassSurface } from '@/components/primitives/GlassSurface';
import { Button } from '@/components/primitives/Button';
import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import { palette, radius, shadows, spacing } from '@/theme';
import type { TwinResolution, TwinReview, TwinReviewCandidate } from '@/types';

export interface TwinReviewModalProps {
  review: TwinReview | null;
  visible: boolean;
  submitting?: boolean;
  onResolve: (resolution: TwinResolution) => void;
  onDismiss: () => void;
  /** e.g. "1 of 2" when several cases are queued. */
  positionLabel?: string;
}

/** First name only, so the action buttons stay readable at phone width. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function CandidateCard({ candidate }: { candidate: TwinReviewCandidate }) {
  return (
    <View style={styles.candidate}>
      <Avatar name={candidate.name} uri={candidate.avatarUrl} size={72} />

      <Text variant="titleLg" color={palette.onSurface} align="center" numberOfLines={2}>
        {candidate.name}
      </Text>

      <View style={styles.factList}>
        <View style={styles.factRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Roll No.
          </Text>
          <Text variant="bodyMd" color={palette.onSurface} numberOfLines={1}>
            {candidate.rollNumber}
          </Text>
        </View>
        <View style={styles.factRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Semester
          </Text>
          <Text variant="bodyMd" color={palette.onSurface}>
            {candidate.semester}
          </Text>
        </View>
      </View>

      {/* Similarity, not certainty. Both candidates score near 50% by definition. */}
      <View style={styles.similarity}>
        <ProgressBar
          progress={candidate.confidence}
          color={palette.tertiaryFixedDim}
          height={4}
          animated={false}
        />
        <Text variant="labelMd" color={palette.tertiaryContainer}>
          {Math.round(candidate.confidence * 100)}% similarity
        </Text>
      </View>
    </View>
  );
}

/**
 * Twin / ambiguous match review.
 *
 * Implements the Stitch "Review Ambiguous Match" modal: amber header with a warning glyph
 * and the exact Stitch copy, the detected face crop, two candidate cards separated by a
 * "VS" badge, the question "Are both students present?", and four actions.
 *
 * Mobile adaptations:
 *   - Presented as a bottom-anchored sheet rather than a centred 2xl dialog, which at 390dp would
 *     leave almost no margin. It slides up from the bottom edge but is not draggable, and cannot
 *     be swiped away — see below.
 *   - The two candidate cards stay side by side, because the whole point is direct visual
 *     comparison. Stacking them would defeat the screen.
 *   - Action labels use first names ("Only Arjun") exactly as Stitch does, which is what
 *     keeps two buttons readable on one row.
 *
 * Dismissal is deliberately narrow. There is no backdrop-tap-to-close and no swipe: the
 * only ways out are an explicit action or "Decide Later", which is itself a recorded
 * decision that keeps both records at REVIEW. A case must never be closed by accident,
 * because doing so silently would leave two students' attendance unresolved with no trace.
 */
export function TwinReviewModal({
  review,
  visible,
  submitting = false,
  onResolve,
  onDismiss,
  positionLabel,
}: TwinReviewModalProps) {
  const insets = useSafeAreaInsets();

  if (!review) return null;

  const { studentA, studentB } = review;

  return (
    <AnimatedOverlay
      visible={visible}
      variant="sheet"
      // Android hardware back maps to "Decide Later" via onDismiss, which keeps both records under
      // REVIEW rather than closing the case.
      onRequestClose={onDismiss}
      // `onBackdropPress` is deliberately omitted, so the backdrop is inert. A stray tap outside
      // this sheet must never resolve or close an ambiguous case — the only ways out are an
      // explicit action or Decide Later, which is itself a recorded decision.
    >
      <View
        style={[styles.sheet, shadows.raised, { paddingBottom: insets.bottom }]}
        accessibilityRole="alert"
      >
          <GlassSurface intensity={90} style={StyleSheet.absoluteFill} />
          {/* Header — Stitch tints this tertiary-fixed-dim. */}
          <View style={styles.header}>
            <Icon name="review" size={22} color={palette.onTertiaryFixedVariant} />
            <View style={styles.headerText}>
              <Text variant="titleLg" color={palette.onTertiaryFixedVariant}>
                Possible Twin Match
              </Text>
              <Text variant="bodyMd" color={palette.onTertiaryFixedVariant}>
                The system could not reliably distinguish between these students.
              </Text>
            </View>
            {positionLabel ? (
              <View style={styles.positionChip}>
                <Text variant="labelMd" color={palette.onTertiaryFixedVariant}>
                  {positionLabel}
                </Text>
              </View>
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Detected face */}
            <View style={styles.detectedBlock}>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                DETECTED FACE
              </Text>
              <View style={styles.detectedFrame}>
                {review.detectedFaceUrl ? (
                  <Image
                    source={{ uri: review.detectedFaceUrl }}
                    style={styles.detectedImage}
                    contentFit="cover"
                    accessibilityLabel="Face detected in the classroom photograph"
                  />
                ) : (
                  <View style={styles.detectedPlaceholder}>
                    <Icon name="focus" size={26} color={palette.onTertiaryFixedVariant} />
                  </View>
                )}
                <View style={styles.detectedCaption}>
                  <Icon name="focus" size={12} color={palette.onSurface} />
                  <Text variant="labelMd" color={palette.onSurface}>
                    From capture
                  </Text>
                </View>
              </View>
            </View>

            {/* Candidates */}
            <View style={styles.comparison}>
              <CandidateCard candidate={studentA} />
              <CandidateCard candidate={studentB} />
              <View style={styles.vsBadge}>
                <Text variant="labelMd" color={palette.onSurfaceVariant}>
                  VS
                </Text>
              </View>
            </View>

            <Text variant="titleLg" color={palette.onSurface} align="center">
              Are both students present?
            </Text>
          </ScrollView>

          {/* Actions */}
          <View style={styles.footer}>
            <Button
              label="Both present"
              icon="bothPresent"
              fullWidth
              disabled={submitting}
              onPress={() => onResolve('BOTH_PRESENT')}
            />

            <View style={styles.footerRow}>
              <Button
                label={`Only ${firstName(studentA.name)}`}
                icon="personConfirm"
                variant="secondary"
                disabled={submitting}
                onPress={() => onResolve('ONLY_A')}
                style={styles.footerHalf}
              />
              <Button
                label={`Only ${firstName(studentB.name)}`}
                icon="personConfirm"
                variant="secondary"
                disabled={submitting}
                onPress={() => onResolve('ONLY_B')}
                style={styles.footerHalf}
              />
            </View>

            <AnimatedPressable
              onPress={() => onResolve('DEFERRED')}
              disabled={submitting}
              feedback="opacity"
              accessibilityRole="button"
              accessibilityLabel="Decide later"
              accessibilityHint="Leaves both students marked as needing review"
              style={styles.deferButton}
            >
              <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.deferLabel}>
                Decide later
              </Text>
            </AnimatedPressable>

            <Text variant="labelMd" color={palette.outline} align="center">
              Deciding later keeps both students under review. Nothing is chosen for you.
            </Text>
          </View>
      </View>
    </AnimatedOverlay>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '94%',
    backgroundColor: 'transparent',
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: palette.outlineVariant,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: palette.tertiaryFixedDim,
    borderBottomWidth: 1,
    borderBottomColor: palette.outlineVariant,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  positionChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: palette.tertiaryFixed,
  },
  body: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  detectedBlock: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  detectedFrame: {
    width: 112,
    height: 112,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: palette.tertiaryFixedDim,
    backgroundColor: palette.surfaceContainer,
  },
  detectedImage: {
    width: '100%',
    height: '100%',
  },
  detectedPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tertiaryFixed,
  },
  detectedCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderTopWidth: 1,
    borderTopColor: palette.outlineVariant,
  },
  comparison: {
    flexDirection: 'row',
    gap: spacing.sm,
    position: 'relative',
  },
  candidate: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.xl,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  factList: {
    alignSelf: 'stretch',
    gap: spacing.xs,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.base,
    backgroundColor: palette.surfaceContainerLow,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  similarity: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.xs,
  },
  vsBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -16,
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceContainer,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    ...shadows.resting,
  },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: palette.surfaceContainerLow,
    borderTopWidth: 1,
    borderTopColor: palette.outlineVariant,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  footerHalf: {
    flex: 1,
  },
  deferButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  deferLabel: {
    textDecorationLine: 'underline',
  },
});
