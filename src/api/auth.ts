import type { AuthService } from '@/services/contracts';
import type { AuthSession, User } from '@/types';

import { request } from './client';

/**
 * Authentication calls for the live backend.
 */
export const authApi: AuthService = {
  login: (payload) =>
    request<AuthSession>('auth/login', { method: 'POST', body: payload }),

  logout: () => request<void>('auth/logout', { method: 'POST' }),

  getCurrentUser: () => request<User>('auth/me'),

  requestPasswordReset: (payload) =>
    request<void>('auth/forgot-password', { method: 'POST', body: payload }),

  refresh: (refreshToken) =>
    request<AuthSession>('auth/refresh', { method: 'POST', body: { refreshToken }, retried: true }),
};
