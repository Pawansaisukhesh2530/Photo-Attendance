import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/primitives/Icon';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import { fontFamilies, palette, radius, spacing } from '@/theme';
import type { ProcessingStage } from '@/types';

export interface ProcessingStepperProps {
  stage: ProcessingStage;
  progress: number;
  detail: string | null;
  /** Set when the pipeline aborted, so the active step renders as failed. */
  failed?: boolean;
}

/** Display order and copy, taken from the Stitch AI Processing stepper. */
const STEPS: { stage: ProcessingStage; label: string }[] = [
  { stage: 'CAPTURED', label: 'Image captured' },
  { stage: 'UPLOADING', label: 'Uploading image' },
  { stage: 'DETECTING_FACES', label: 'Detecting faces' },
  { stage: 'IDENTIFYING_STUDENTS', label: 'Identifying students' },
  { stage: 'MATCHING_ROSTER', label: 'Comparing with class roster' },
  { stage: 'GENERATING_RECORD', label: 'Generating attendance' },
  { stage: 'PREPARING_REVIEW', label: 'Preparing review results' },
];

const ORDER: ProcessingStage[] = [...STEPS.map((s) => s.stage), 'DONE'];

/** Spinning indicator for the in-progress step. */
function Spinner({ color }: { color: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1100 }), -1, false);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Icon name="processing" size={18} color={color} />
    </Animated.View>
  );
}

/**
 * Vertical stepper showing pipeline progress.
 *
 * Reproduces the Stitch AI Processing stepper: a connecting rail behind numbered nodes,
 * completed steps with a filled green check on a tinted well, the active step raised onto
 * its own tinted card with a progress bar and percentage, and pending steps at 50% opacity
 * with a hollow dot.
 *
 * Mobile adaptation: Stitch splits this screen into a 7/12 image panel beside a 5/12 step
 * panel. On a phone the photo sits above and the stepper below, in one scrolling column.
 *
 * The step labels report what the *backend* is doing. Nothing here inspects the photograph.
 */
export function ProcessingStepper({
  stage,
  progress,
  detail,
  failed = false,
}: ProcessingStepperProps) {
  const activeIndex = ORDER.indexOf(stage);

  return (
    <View style={styles.container}>
      {/* Rail behind the nodes. */}
      <View style={styles.rail} />
      <View
        style={[
          styles.railFill,
          {
            height: `${Math.max(0, Math.min(1, (activeIndex + 0.5) / STEPS.length)) * 100}%`,
            backgroundColor: failed ? palette.error : palette.primary,
          },
        ]}
      />

      {STEPS.map((step, index) => {
        const isComplete = activeIndex > index || stage === 'DONE';
        const isActive = activeIndex === index && stage !== 'DONE';
        const isFailedStep = isActive && failed;

        return (
          <View
            key={step.stage}
            style={[
              styles.step,
              isActive && !failed && styles.stepActive,
              isFailedStep && styles.stepFailed,
              !isComplete && !isActive && styles.stepPending,
            ]}
          >
            {/* Node */}
            <View
              style={[
                styles.node,
                isComplete && styles.nodeComplete,
                isActive && !failed && styles.nodeActive,
                isFailedStep && styles.nodeFailed,
                !isComplete && !isActive && styles.nodePending,
              ]}
            >
              {isComplete ? (
                <Icon name="present" size={16} color={palette.secondary} />
              ) : isFailedStep ? (
                <Icon name="error" size={16} color={palette.error} />
              ) : isActive ? (
                <Spinner color={palette.primary} />
              ) : (
                <View style={styles.dot} />
              )}
            </View>

            <View style={styles.body}>
              <Text
                variant={isActive ? 'headlineSm' : 'bodyLg'}
                color={
                  isFailedStep
                    ? palette.error
                    : isActive
                      ? palette.primary
                      : palette.onSurface
                }
                style={isActive ? styles.activeLabel : undefined}
              >
                {isActive && !failed ? `${step.label}…` : step.label}
              </Text>

              {(isActive || isComplete) && detail && (isActive || activeIndex === index + 1) ? (
                <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.detail}>
                  {detail}
                </Text>
              ) : null}

              {isActive && !failed ? (
                <>
                  <ProgressBar
                    progress={progress}
                    color={palette.primary}
                    height={6}
                    style={styles.progress}
                  />
                  <Text variant="labelMd" color={palette.primary} align="right">
                    {Math.round(progress * 100)}% complete
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const NODE_SIZE = 26;
const RAIL_LEFT = NODE_SIZE / 2 - 1;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    gap: spacing.md,
  },
  rail: {
    position: 'absolute',
    left: RAIL_LEFT,
    top: NODE_SIZE / 2,
    bottom: NODE_SIZE / 2,
    width: 2,
    backgroundColor: palette.surfaceVariant,
  },
  railFill: {
    position: 'absolute',
    left: RAIL_LEFT,
    top: NODE_SIZE / 2,
    width: 2,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepActive: {
    // Stitch raises the in-progress step onto a tinted card that bleeds past the column.
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.primaryFixedDim,
  },
  stepFailed: {
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: palette.errorContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.error,
  },
  stepPending: {
    opacity: 0.5,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceContainerLowest,
  },
  nodeComplete: {
    backgroundColor: palette.secondaryContainer,
  },
  nodeActive: {
    backgroundColor: palette.surfaceContainerLowest,
  },
  nodeFailed: {
    backgroundColor: palette.errorContainer,
  },
  nodePending: {
    backgroundColor: palette.surfaceContainer,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: palette.outlineVariant,
  },
  body: {
    flex: 1,
    gap: 2,
    paddingTop: 2,
  },
  activeLabel: {
    fontFamily: fontFamilies.bold,
  },
  detail: {
    marginTop: 2,
  },
  progress: {
    marginTop: spacing.sm,
  },
});
