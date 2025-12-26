/**
 * tRPC Context
 * Provides context for all tRPC procedures including user authentication
 */

import { db, User } from '../../db';

export interface Context {
  user: User | null;
  userId: string | null;
}

export interface AuthenticatedContext extends Context {
  user: User;
  userId: string;
}

/**
 * Create context from request headers
 * In production, this would validate JWT tokens, sessions, etc.
 */
export function createContext(opts?: { userId?: string }): Context {
  if (!opts?.userId) {
    return { user: null, userId: null };
  }

  const user = db.getUser(opts.userId);
  return {
    user: user || null,
    userId: user?.id || null,
  };
}

/**
 * Check if context has authenticated user
 */
export function isAuthenticated(ctx: Context): ctx is AuthenticatedContext {
  return ctx.user !== null && ctx.userId !== null;
}
