import { createApiError } from '@/api/client';
import type { ApiErrorKind } from '@/types';

/**
 * Makes the mock layer behave like a network.
 *
 * Without artificial latency, every screen renders instantly and loading states never
 * get exercised, so skeletons and spinners rot untested until the real backend arrives
 * and exposes them all at once. These delays are deliberately noticeable.
 */

const BASE_DELAY_MS = 320;
const JITTER_MS = 220;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function networkDelay(multiplier = 1): Promise<void> {
  await delay((BASE_DELAY_MS + Math.random() * JITTER_MS) * multiplier);
}

/**
 * Forced-failure switchboard for demonstrating error states.
 *
 * Nothing fails randomly — random failure in a mock is indistinguishable from a bug
 * and wastes debugging time. Instead a developer opts in explicitly, and Phase 10 can
 * wire these to a debug menu.
 */
const forcedFailures = new Map<string, ApiErrorKind>();

export function forceFailure(operation: string, kind: ApiErrorKind): void {
  forcedFailures.set(operation, kind);
}

export function clearFailure(operation: string): void {
  forcedFailures.delete(operation);
}

export function clearAllFailures(): void {
  forcedFailures.clear();
}

/** Called at the top of every mock service method. */
export function assertNoForcedFailure(operation: string): void {
  const kind = forcedFailures.get(operation);
  if (!kind) return;
  throw createApiError(kind, `Simulated ${kind} failure for "${operation}".`);
}

export async function mockRequest<T>(
  operation: string,
  produce: () => T,
  multiplier = 1,
): Promise<T> {
  assertNoForcedFailure(operation);
  await networkDelay(multiplier);
  assertNoForcedFailure(operation);
  return produce();
}
