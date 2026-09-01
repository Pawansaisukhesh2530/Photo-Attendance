/**
 * ============================================================================
 * MOCK ONLY — THIS FILE CONTAINS NO COMPUTER VISION AND NO MACHINE LEARNING.
 * ============================================================================
 *
 * It emits a scripted sequence of progress events on a timer. It never opens, reads,
 * decodes or inspects the captured photograph — the image URI is not passed to it at all.
 * It does not detect, encode, compare or recognise anything.
 *
 * The real pipeline — SCRFD detection, ArcFace/InsightFace embedding, vector search,
 * roster matching — is the backend developer's responsibility and lives entirely
 * server-side. When the real endpoint exists, delete this file: its only consumer is
 * `mocks/services.ts`, and the `ProcessingProgress` values it produces are exactly what a
 * real progress stream would deliver.
 * ============================================================================
 */

import { createApiError } from '@/api/client';
import type { ProcessingProgress, ProcessingStage } from '@/types';

/**
 * Outcomes the mock can be told to produce.
 *
 * Selected explicitly by a developer, never at random — a randomly failing mock is
 * indistinguishable from a real bug and wastes debugging time. Phase 10 can expose these
 * through a debug menu.
 */
export type ProcessingScenario =
  | 'SUCCESS'
  | 'NO_FACES_DETECTED'
  | 'NO_RECOGNIZABLE_STUDENTS'
  | 'POOR_IMAGE_QUALITY'
  | 'PROCESSING_FAILURE'
  | 'TIMEOUT';

let scenario: ProcessingScenario = 'SUCCESS';

export function setProcessingScenario(next: ProcessingScenario): void {
  scenario = next;
}

export function getProcessingScenario(): ProcessingScenario {
  return scenario;
}

export function resetProcessingScenario(): void {
  scenario = 'SUCCESS';
}

interface ScriptedStep {
  stage: ProcessingStage;
  progress: number;
  detail: string | null;
  /** Delay after the previous step, in ms. */
  afterMs: number;
}

/**
 * The seven display steps.
 *
 * "Image captured" comes from the Stitch AI Processing stepper, which shows it as an
 * already-complete first step. The remaining six are the stages specified for this phase.
 * Copy is taken from Stitch where it exists ("42 individuals detected in the seating
 * area", "Cross-referencing detected faces with student profiles").
 */
function script(detectedCount: number, rosterSize: number): ScriptedStep[] {
  return [
    {
      stage: 'CAPTURED',
      progress: 0.06,
      detail: 'High-resolution classroom photo secured.',
      afterMs: 350,
    },
    {
      stage: 'UPLOADING',
      progress: 0.18,
      detail: 'Uploading image to the attendance service.',
      afterMs: 900,
    },
    {
      stage: 'DETECTING_FACES',
      progress: 0.34,
      detail: `${detectedCount} individuals detected in the seating area.`,
      afterMs: 1100,
    },
    {
      stage: 'IDENTIFYING_STUDENTS',
      progress: 0.56,
      detail: 'Cross-referencing detected faces with student profiles.',
      afterMs: 1400,
    },
    {
      stage: 'MATCHING_ROSTER',
      progress: 0.74,
      detail: `Comparing against ${rosterSize} enrolled students.`,
      afterMs: 1000,
    },
    {
      stage: 'GENERATING_RECORD',
      progress: 0.88,
      detail: 'Generating the attendance record.',
      afterMs: 800,
    },
    {
      stage: 'PREPARING_REVIEW',
      progress: 0.97,
      detail: 'Preparing items that need your review.',
      afterMs: 700,
    },
    { stage: 'DONE', progress: 1, detail: null, afterMs: 300 },
  ];
}

/** The stage at which each failure scenario aborts. */
const FAILURE_STAGE: Record<Exclude<ProcessingScenario, 'SUCCESS'>, ProcessingStage> = {
  NO_FACES_DETECTED: 'DETECTING_FACES',
  NO_RECOGNIZABLE_STUDENTS: 'MATCHING_ROSTER',
  POOR_IMAGE_QUALITY: 'DETECTING_FACES',
  PROCESSING_FAILURE: 'IDENTIFYING_STUDENTS',
  TIMEOUT: 'UPLOADING',
};

function failureFor(kind: Exclude<ProcessingScenario, 'SUCCESS'>) {
  switch (kind) {
    case 'NO_FACES_DETECTED':
      return createApiError(
        'VALIDATION',
        'No faces were found in that photo. Move so more of the room is visible and take another.',
      );
    case 'NO_RECOGNIZABLE_STUDENTS':
      return createApiError(
        'VALIDATION',
        'Faces were found, but none matched this class roster. Check you selected the right class.',
      );
    case 'POOR_IMAGE_QUALITY':
      return createApiError(
        'VALIDATION',
        'The photo is too blurry or dark to work with. Hold steady and try again in better light.',
      );
    case 'PROCESSING_FAILURE':
      return createApiError(
        'SERVER',
        'Processing could not be completed. Your photo is saved, so you can retry without retaking it.',
      );
    case 'TIMEOUT':
      return createApiError(
        'TIMEOUT',
        'The upload took too long. Your photo is saved, so you can retry without retaking it.',
      );
  }
}

/**
 * Runs the scripted sequence.
 *
 * Returns a cancel function; cancelling stops further emissions immediately, which is what
 * the "Cancel" control on the processing screen needs so a lecturer is never trapped
 * watching a progress bar.
 */
export function runMockProcessing(
  options: { detectedCount: number; rosterSize: number },
  onProgress: (progress: ProcessingProgress) => void,
  onError: (error: unknown) => void,
): () => void {
  const steps = script(options.detectedCount, options.rosterSize);
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;
  let elapsed = 0;

  const activeScenario = scenario;
  const abortStage =
    activeScenario === 'SUCCESS' ? null : FAILURE_STAGE[activeScenario];

  for (const step of steps) {
    elapsed += step.afterMs;

    timers.push(
      setTimeout(() => {
        if (cancelled) return;

        // Emit the stage, then fail on it — so the UI shows which step broke rather than
        // a bare error with no context about how far it got.
        onProgress({ stage: step.stage, progress: step.progress, detail: step.detail });

        if (abortStage && step.stage === abortStage) {
          cancelled = true;
          for (const timer of timers) clearTimeout(timer);
          onError(failureFor(activeScenario as Exclude<ProcessingScenario, 'SUCCESS'>));
        }
      }, elapsed),
    );
  }

  return () => {
    cancelled = true;
    for (const timer of timers) clearTimeout(timer);
  };
}

/** Total scripted duration, for callers that want a determinate estimate. */
export const MOCK_PROCESSING_DURATION_MS = script(0, 0).reduce(
  (sum, s) => sum + s.afterMs,
  0,
);
