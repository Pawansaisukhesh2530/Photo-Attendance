import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types';

export interface AuthGuardProps {
  children: ReactNode;
  /** Role required for this subtree. Omit to require only that the user is signed in. */
  requireRole?: UserRole;
}

/**
 * Route guard for authenticated navigation groups.
 *
 * `app/index.tsx` routes the user to the right tree on launch, but that alone is not a
 * guard: expo-router resolves deep links and restored navigation state directly to a
 * nested route, so a signed-out user following `edutrace://(faculty)/dashboard` would
 * otherwise render the faculty shell and only fail later when a request 401s.
 *
 * Also handles role mismatch — a faculty account cannot reach the admin tree by URL.
 *
 * `restoring` renders nothing rather than redirecting. Redirecting during restore would
 * bounce an already-signed-in user to the login screen for a frame before sending them
 * back. In practice the root layout holds the splash screen until restore finishes, so
 * this branch is only a safety net.
 */
export function AuthGuard({ children, requireRole }: AuthGuardProps) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  if (status === 'restoring') return null;

  if (status !== 'authenticated' || !user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (requireRole && user.role !== requireRole) {
    // Send the user to their own tree rather than showing a dead end.
    return user.role === 'ADMIN' ? (
      <Redirect href="/(admin)/dashboard" />
    ) : (
      <Redirect href="/(faculty)/dashboard" />
    );
  }

  return <>{children}</>;
}

/**
 * Inverse guard for the auth group: keeps a signed-in user out of the login screen.
 *
 * Without this, backgrounding the app on the login screen and returning after a session
 * restore would leave a signed-in user staring at a sign-in form.
 */
export function GuestGuard({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  if (status === 'restoring') return null;

  if (status === 'authenticated' && user) {
    return user.role === 'ADMIN' ? (
      <Redirect href="/(admin)/dashboard" />
    ) : (
      <Redirect href="/(faculty)/dashboard" />
    );
  }

  return <>{children}</>;
}
