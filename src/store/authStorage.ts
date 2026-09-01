import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Persistence for the auth session, abstracted over platform.
 *
 * ============================================================================
 * SECURITY NOTE — READ BEFORE CHANGING
 *
 * These two backends are NOT equivalent.
 *
 *   Native (iOS / Android)
 *     `expo-secure-store`, which is the iOS Keychain and the Android Keystore. Values are
 *     encrypted at rest by the OS and are not readable by other apps.
 *
 *   Web
 *     `localStorage`. This is NOT secure storage. It is plain text, readable by any script
 *     running on the origin, and therefore exposed to XSS. It offers no encryption and no
 *     protection from other code on the page.
 *
 * A production web deployment should NOT keep tokens here. The session should be held in a
 * server-managed, `httpOnly`, `Secure`, `SameSite` cookie that JavaScript cannot read, so a
 * script injection cannot exfiltrate credentials. That requires a real auth backend, which
 * does not exist yet.
 *
 * `localStorage` is used for now because the alternative is an Admin web app that cannot sign
 * in at all: `expo-secure-store` ships `export default {}` on web — an empty stub with no
 * implementation — so every call to it throws. Given the app currently authenticates against a
 * mock service and holds no real credentials, this is an acceptable development-time choice and
 * a documented handoff item, not a decision to defend in production.
 * ============================================================================
 *
 * Deliberately narrow: three methods, string in and string out. The auth store keeps all of its
 * own logic and only changes which module it reads and writes through.
 */

const isWeb = Platform.OS === 'web';

/**
 * Guards against `localStorage` being unavailable.
 *
 * It can be absent or throw during server-side rendering, in private browsing modes on some
 * browsers, and when a user has blocked site data. A storage failure must degrade to "no stored
 * session" rather than taking the app down on launch.
 */
function webStorage(): Storage | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

export async function getStoredItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return webStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setStoredItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      webStorage()?.setItem(key, value);
    } catch {
      // Quota exceeded, or site data blocked. The session stays in memory for this tab, which
      // is the same behaviour as declining "Remember me".
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteStoredItem(key: string): Promise<void> {
  if (isWeb) {
    try {
      webStorage()?.removeItem(key);
    } catch {
      // Nothing recoverable to do; sign-out has already cleared in-memory state.
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/**
 * True when the platform can persist a session across a full restart.
 *
 * Lets the UI describe "Remember me" honestly rather than offering a promise the platform
 * cannot keep.
 */
export const canPersistSession = isWeb ? webStorage() !== null : true;
