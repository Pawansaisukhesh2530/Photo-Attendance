import type { AuthService } from '@/services/contracts';
import type { AuthSession, User } from '@/types';

import { request } from './client';

/**
 * Real HTTP implementation. Inactive while USE_MOCK_API is true.
 * Endpoint paths here are the contract proposal for the backend developer.
 */
export const authApi: AuthService = {
  login: (payload) =>
    request<AuthSession>('auth/login', { method: 'POST', body: payload }),

  logout: () => request<void>('auth/logout', { method: 'POST' }),

  getCurrentUser: () => request<User>('auth/me'),

  requestPasswordReset: (payload) =>
    request<void>('auth/forgot-password', { method: 'POST', body: payload }),

  refresh: (refreshToken) =>
    request<AuthSession>('auth/refresh', { method: 'POST', body: { refreshToken } }),
};
