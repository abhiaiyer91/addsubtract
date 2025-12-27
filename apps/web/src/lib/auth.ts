/**
 * Auth utilities for the web app
 * 
 * This module provides compatibility with the old auth API while using better-auth
 */

import { authClient, useSession as useBetterAuthSession } from './auth-client';

export interface User {
  id: string;
  username: string | null;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

/**
 * Check if the user is authenticated
 * This is a synchronous check based on session cookie presence
 */
export function isAuthenticated(): boolean {
  // Better-auth uses cookies, so we can't synchronously check
  // This is a best-effort check - the actual auth state comes from useSession
  return typeof document !== 'undefined' && document.cookie.includes('better-auth');
}

/**
 * Get the current user (synchronous - for backward compat)
 * Prefer using useSession() hook instead
 */
export function getUser(): User | null {
  // This can't work synchronously with better-auth
  // Components should use useSession() instead
  return null;
}

/**
 * Get auth token (for backward compat)
 * better-auth uses cookies, not bearer tokens
 */
export function getAuthToken(): string | null {
  return null;
}

/**
 * Login function (for backward compat)
 * Use signIn from auth-client instead
 */
export function login(_user: User, _token: string): void {
  console.warn('login() is deprecated. Use signIn from auth-client instead.');
}

/**
 * Logout function
 */
export async function logout(): Promise<void> {
  await authClient.signOut();
  window.location.href = '/';
}

// Re-export the session hook
export { useBetterAuthSession as useSession };
