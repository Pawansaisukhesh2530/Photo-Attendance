import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { usePreferencesStore } from '@/store/preferences';

/**
 * Whether the interface should collapse its animations.
 *
 * Resolved from two sources, in order:
 *
 *   1. The in-app Motion preference, when it is set to `REDUCED` or `STANDARD`. An explicit
 *      in-app choice wins, because the OS setting is global and someone may want calmer motion
 *      here specifically — or full motion here despite a system preference set for something else.
 *   2. Otherwise the OS "reduce motion" setting, which is what this hook returned before the
 *      preference existed and remains the default (`SYSTEM`).
 *
 * The OS value is read through `AccessibilityInfo` rather than a library helper so the behaviour
 * is explicit and does not depend on a particular Reanimated version. Its listener stays
 * subscribed regardless of the preference, so switching back to `SYSTEM` is immediately correct
 * rather than stale until the next toggle.
 *
 * Consumers collapse animations to near-zero duration rather than removing them, so state changes
 * still land in one frame and nothing depends on motion to be understood. Selection, errors,
 * loading and success are all conveyed by colour, iconography and text independently — motion only
 * ever softens the transition between them.
 */
export function useReducedMotion(): boolean {
  const preference = usePreferencesStore((state) => state.motion);
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setSystemReduced(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setSystemReduced(enabled),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  if (preference === 'REDUCED') return true;
  if (preference === 'STANDARD') return false;
  return systemReduced;
}
