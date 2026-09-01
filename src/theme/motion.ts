import { Easing } from 'react-native-reanimated';

/**
 * Motion language.
 *
 * Three tiers, so timings are chosen from a scale rather than invented per component:
 *
 *   micro  — press states, checkmarks, chip selection. Must feel instant.
 *   overlay — modals and bottom sheets. Long enough to read as a transition, short enough that
 *             nobody waits for it.
 *   screen  — route transitions, owned by the navigator.
 *
 * Deliberately restrained. This is a register a lecturer opens several times a day; motion here
 * exists to explain what changed, not to entertain.
 */
export const duration = {
  micro: 140,
  overlayIn: 220,
  overlayOut: 170,
  screen: 260,
} as const;

/**
 * Easings.
 *
 * `decelerate` for anything entering — fast to start, settling at the end, which reads as the
 * element arriving. `accelerate` for anything leaving. Nothing uses linear: constant velocity is
 * the one curve that never occurs physically and always looks mechanical.
 */
export const easing = {
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
  standard: Easing.inOut(Easing.quad),
} as const;

/** Ready-made timing configs. */
export const timing = {
  micro: { duration: duration.micro, easing: easing.standard },
  enter: { duration: duration.overlayIn, easing: easing.decelerate },
  exit: { duration: duration.overlayOut, easing: easing.accelerate },
} as const;

/**
 * Press feedback values.
 *
 * Scale is kept shallow on purpose. Anything past ~4% starts to look like a game control, and on
 * a wide card a visible shrink also reads as a layout shift.
 */
export const press = {
  scale: 0.97,
  cardScale: 0.99,
  opacity: 0.92,
} as const;

/** Backdrop opacity. Dims enough to focus attention while leaving the screen behind legible. */
export const BACKDROP_OPACITY = 0.4;
