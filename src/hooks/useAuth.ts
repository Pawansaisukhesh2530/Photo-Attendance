import { useMutation } from '@tanstack/react-query';

import { authService } from '@/services';
import { useAuthStore } from '@/store/authStore';
import type { ForgotPasswordRequest } from '@/types';

/**
 * Auth hooks.
 *
 * Sign-in itself lives in the Zustand store rather than a React Query mutation,
 * because its result is long-lived global state (tokens, current user) rather than
 * cached server data. Password reset is a fire-and-forget request with no state to
 * keep, so it is a plain mutation.
 */

export function useAuth() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const error = useAuthStore((state) => state.error);
  const fieldErrors = useAuthStore((state) => state.fieldErrors);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const clearError = useAuthStore((state) => state.clearError);

  return {
    status,
    user,
    error,
    fieldErrors,
    isSubmitting,
    isAuthenticated: status === 'authenticated',
    login,
    logout,
    clearError,
  };
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (request: ForgotPasswordRequest) => authService.requestPasswordReset(request),
  });
}
