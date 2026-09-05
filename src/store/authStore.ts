import { create } from 'zustand';

import { configureClient, isApiError } from '@/api/client';
import { authService } from '@/services';
import type { AuthSession, LoginRequest, User } from '@/types';

import { deleteStoredItem, getStoredItem, setStoredItem } from './authStorage';
import { usePreferencesStore } from './preferences';

/**
 * Authentication state.
 *
 * Persistence goes through `authStorage`, which is the OS keychain / Android Keystore on native
 * and `localStorage` on web. Those are not equivalent and the difference is documented at length
 * in that module — on web this is not secure credential storage, and a production deployment
 * should move to server-managed httpOnly cookies. Only the token pair and a minimal user record
 * are persisted; everything else is rehydrated from the API on launch.
 */

const TOKEN_KEY = 'edutrace.auth.tokens';
const USER_KEY = 'edutrace.auth.user';

type Status = 'restoring' | 'authenticated' | 'unauthenticated';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface AuthState {
  status: Status;
  user: User | null;
  tokens: StoredTokens | null;
  /** Non-null when the last login attempt failed, for display on the login screen. */
  error: string | null;
  /**
   * Per-field messages from a VALIDATION failure, keyed by field name.
   *
   * Surfaced separately from `error` so the login screen can attach them to the right
   * input instead of showing one generic banner. A real backend returning 422 with
   * `fieldErrors` will flow straight through here.
   */
  fieldErrors: Record<string, string> | null;
  isSubmitting: boolean;

  restore: () => Promise<void>;
  login: (request: LoginRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshSession: () => Promise<string | null>;
}

async function persist(session: AuthSession, remember: boolean): Promise<void> {
  const tokens: StoredTokens = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  };

  // When the user declines "Remember me" we keep the session in memory only, so
  // closing the app signs them out. On a shared staff-room device that matters.
  if (!remember) return;

  await setStoredItem(TOKEN_KEY, JSON.stringify(tokens));
  await setStoredItem(USER_KEY, JSON.stringify(session.user));
}

async function clearPersisted(): Promise<void> {
  await deleteStoredItem(TOKEN_KEY).catch(() => {});
  await deleteStoredItem(USER_KEY).catch(() => {});
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'restoring',
  user: null,
  tokens: null,
  error: null,
  fieldErrors: null,
  isSubmitting: false,

  async restore() {
    try {
      const [rawTokens, rawUser] = await Promise.all([
        getStoredItem(TOKEN_KEY),
        getStoredItem(USER_KEY),
      ]);

      if (!rawTokens || !rawUser) {
        set({ status: 'unauthenticated', user: null, tokens: null });
        return;
      }

      const tokens = JSON.parse(rawTokens) as StoredTokens;
      const user = JSON.parse(rawUser) as User;

      if (new Date(tokens.expiresAt).getTime() <= Date.now()) {
        set({ user, tokens });
        const renewed=await get().refreshSession();
        if(!renewed){await clearPersisted();set({status:'unauthenticated',user:null,tokens:null})}
        return;
      }

      set({ status: 'authenticated', user, tokens });
    } catch {
      await clearPersisted();
      set({ status: 'unauthenticated', user: null, tokens: null });
    }
  },

  async login(request) {
    set({ isSubmitting: true, error: null, fieldErrors: null });
    try {
      const session = await authService.login(request);
      await persist(session, request.rememberMe);
      set({
        status: 'authenticated',
        user: session.user,
        tokens: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
        },
        isSubmitting: false,
        error: null,
        fieldErrors: null,
      });
      return true;
    } catch (error) {
      // A VALIDATION failure carries field-level detail; anything else is shown as a
      // single banner. Field errors deliberately suppress the banner so the user is not
      // told the same thing twice.
      if (isApiError(error) && error.kind === 'VALIDATION' && error.fieldErrors) {
        set({
          isSubmitting: false,
          error: null,
          fieldErrors: error.fieldErrors,
        });
        return false;
      }

      const message = isApiError(error)
        ? error.message
        : 'Sign in failed. Please try again.';
      set({ isSubmitting: false, error: message, fieldErrors: null });
      return false;
    }
  },

  async logout() {
    // Clear local state first: a failed network call must never leave the user
    // stranded in a signed-in shell they cannot use.
    set({ status: 'unauthenticated', user: null, tokens: null, error: null, fieldErrors: null });
    await clearPersisted();
    // Device-local preferences go with the session. These are shared staff-room devices, so one
    // lecturer's motion and camera settings must not greet the next person who signs in.
    await usePreferencesStore.getState().clear();
    await authService.logout().catch(() => {});
  },

  async refreshSession() {
    const current=get().tokens;
    if(!current?.refreshToken)return null;
    try{
      const session=await authService.refresh(current.refreshToken);
      await persist(session,true);
      set({status:'authenticated',user:session.user,tokens:{accessToken:session.accessToken,refreshToken:session.refreshToken,expiresAt:session.expiresAt}});
      return session.accessToken;
    }catch{return null}
  },

  clearError() {
    set({ error: null, fieldErrors: null });
  },
}));

/**
 * Connects the HTTP client to auth state. Called once from the root layout.
 * Lives here rather than in the client to keep `api/client.ts` free of store imports.
 */
export function wireAuthToApiClient(): void {
  configureClient({
    tokenProvider: () => useAuthStore.getState().tokens?.accessToken ?? null,
    unauthorizedHandler: () => {
      void useAuthStore.getState().logout();
    },
    tokenRefresher: () => useAuthStore.getState().refreshSession(),
  });
}

/** Selector helpers, so components subscribe narrowly and re-render less. */
export const selectUser = (state: AuthState): User | null => state.user;
export const selectIsAuthenticated = (state: AuthState): boolean =>
  state.status === 'authenticated';
