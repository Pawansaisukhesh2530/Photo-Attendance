import { create } from 'zustand';

import { deleteStoredItem, getStoredItem, setStoredItem } from './authStorage';

/**
 * Device-local user preferences.
 *
 * ============================================================================
 * These are DEVICE state, not server state, and that is deliberate.
 *
 * There is no preferences endpoint and no `PreferencesService`. Every value here describes how
 * this installation should behave — whether to draw a framing guide, whether to animate — and
 * none of it is institutional record. Routing it through the API would invent backend contract
 * surface for settings the backend has no opinion about, and would put a personal toggle on the
 * same audited path as institution policy (`InstitutionSettings`, which is admin-owned and
 * audits every change as `SETTING_CHANGED`).
 *
 * Consequences worth stating plainly:
 *
 *   - Preferences do not follow a user to another device. A lecturer who turns the framing guide
 *     off on their phone still sees it on the staff-room tablet.
 *   - They are cleared on sign-out, because a shared staff-room device must not hand one person's
 *     settings to the next. That is the reason `clear()` exists and why `authStore.logout` calls
 *     it — not tidiness, but the fact that these devices are shared.
 *
 * Persistence goes through `authStorage`, which is the OS keychain / Android Keystore on native
 * and `localStorage` on web. Nothing stored here is sensitive, so the web path's lack of
 * encryption — documented at length in that module — does not matter for this data.
 * ============================================================================
 */

/**
 * How much motion the interface should use.
 *
 * `SYSTEM` defers to the OS "reduce motion" setting, which is what the app did before this
 * existed and remains the default. The two explicit values exist because the OS setting is
 * global: someone who wants calmer animation in this app specifically, or who wants full motion
 * despite a system-wide preference set for a different app, could not express that before.
 */
export type MotionPreference = 'SYSTEM' | 'REDUCED' | 'STANDARD';

export interface Preferences {
  motion: MotionPreference;
  /**
   * Whether the camera draws corner brackets and a rule-of-thirds grid over the viewfinder.
   *
   * Presentation only. It does not change what is captured, uploaded, detected or recognised —
   * the guide is inert geometry drawn on top of the preview, and the camera performs no on-device
   * analysis either way.
   */
  showCameraFramingGuide: boolean;
}

/** Single storage key. One JSON blob, so adding a preference is not a migration. */
const PREFERENCES_KEY = 'edutrace.preferences';

/**
 * Defaults, which are also the pre-Phase-10 behaviour.
 *
 * `SYSTEM` and a visible framing guide are exactly what every screen did before preferences
 * existed, so a fresh install and an upgraded one behave identically.
 */
export const DEFAULT_PREFERENCES: Preferences = {
  motion: 'SYSTEM',
  showCameraFramingGuide: true,
};

const MOTION_VALUES: readonly MotionPreference[] = ['SYSTEM', 'REDUCED', 'STANDARD'];

function isMotionPreference(value: unknown): value is MotionPreference {
  return typeof value === 'string' && MOTION_VALUES.includes(value as MotionPreference);
}

/**
 * Reads stored JSON back into a known-good shape.
 *
 * Every field is validated individually and falls back to its default rather than being trusted,
 * because stored data outlives the code that wrote it: a preference removed in a later version, a
 * hand-edited `localStorage` entry, or a half-written value all have to degrade to "use the
 * default" instead of putting an unexpected value into the theme layer.
 */
function parsePreferences(raw: string | null): Preferences {
  if (raw === null) return { ...DEFAULT_PREFERENCES };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFERENCES };

    const candidate = parsed as Record<string, unknown>;

    return {
      motion: isMotionPreference(candidate.motion)
        ? candidate.motion
        : DEFAULT_PREFERENCES.motion,
      showCameraFramingGuide:
        typeof candidate.showCameraFramingGuide === 'boolean'
          ? candidate.showCameraFramingGuide
          : DEFAULT_PREFERENCES.showCameraFramingGuide,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

interface PreferencesState extends Preferences {
  /**
   * True once storage has been read.
   *
   * The root layout holds the splash screen until this flips, so no screen ever renders with a
   * default that is about to be replaced — otherwise a lecturer who turned the framing guide off
   * would see it appear and vanish on every cold start.
   */
  hydrated: boolean;

  restore: () => Promise<void>;
  setMotion: (motion: MotionPreference) => void;
  setShowCameraFramingGuide: (show: boolean) => void;
  clear: () => Promise<void>;
}

function snapshot(state: Preferences): Preferences {
  return {
    motion: state.motion,
    showCameraFramingGuide: state.showCameraFramingGuide,
  };
}

/**
 * Writes through on every change.
 *
 * Fire-and-forget: a storage failure must not block the UI or reject a setter. The value is
 * already applied in memory, so the worst case is that it does not survive a restart — which is
 * the same outcome as storage being unavailable in the first place.
 */
function write(preferences: Preferences): void {
  void setStoredItem(PREFERENCES_KEY, JSON.stringify(preferences)).catch(() => {});
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...DEFAULT_PREFERENCES,
  hydrated: false,

  async restore() {
    try {
      const stored = await getStoredItem(PREFERENCES_KEY);
      set({ ...parsePreferences(stored), hydrated: true });
    } catch {
      // Storage unavailable. Fall back to defaults rather than leaving `hydrated` false, which
      // would hold the splash screen forever.
      set({ ...DEFAULT_PREFERENCES, hydrated: true });
    }
  },

  setMotion(motion) {
    set({ motion });
    write(snapshot(get()));
  },

  setShowCameraFramingGuide(show) {
    set({ showCameraFramingGuide: show });
    write(snapshot(get()));
  },

  async clear() {
    // In-memory first, so a storage failure still leaves the next user on defaults.
    set({ ...DEFAULT_PREFERENCES });
    await deleteStoredItem(PREFERENCES_KEY).catch(() => {});
  },
}));

/** Selector helpers, so components subscribe narrowly and re-render less. */
export const selectMotionPreference = (state: PreferencesState): MotionPreference => state.motion;
export const selectShowCameraFramingGuide = (state: PreferencesState): boolean =>
  state.showCameraFramingGuide;
