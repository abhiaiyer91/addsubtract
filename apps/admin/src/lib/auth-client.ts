/**
 * Better Auth React Client for Admin Portal
 * 
 * Client-side auth integration using better-auth/react
 */

import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';

// Create the auth client
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  plugins: [
    usernameClient(),
  ],
  fetchOptions: {
    credentials: 'include',
  },
});

// Export commonly used functions
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;

// Type exports for the user
export type Session = typeof authClient.$Infer.Session;
export type User = Session['user'];
