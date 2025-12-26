import { Context, Next } from 'hono';
import { sessionModel, userModel } from '../../db/models';
import { isConnected } from '../../db';
import type { User } from '../../db/schema';

/**
 * Extended context with user information
 */
declare module 'hono' {
  interface ContextVariableMap {
    user?: User;
  }
}

/**
 * Authentication middleware that checks for Bearer token in Authorization header
 * Sets c.get('user') if a valid session is found
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Skip auth if database is not connected
  if (!(await isConnected())) {
    return next();
  }

  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    
    try {
      const session = await sessionModel.findWithUser(token);

      if (session && session.session.expiresAt > new Date()) {
        c.set('user', session.user);
      }
    } catch (error) {
      // Log error but don't fail the request
      console.error('[auth] Session lookup failed:', error);
    }
  }

  await next();
}

/**
 * Extract Basic Auth credentials
 */
export function parseBasicAuth(
  authHeader: string | undefined
): { username: string; password: string } | null {
  if (!authHeader?.startsWith('Basic ')) {
    return null;
  }

  try {
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');

    if (username && password) {
      return { username, password };
    }
  } catch {
    // Invalid base64 or format
  }

  return null;
}

/**
 * Basic authentication middleware for Git operations
 * Git clients typically use Basic Auth with username:token
 */
export async function gitAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Skip auth if database is not connected
  if (!(await isConnected())) {
    return next();
  }

  const authHeader = c.req.header('Authorization');

  // Try Basic Auth (used by Git clients)
  const basicAuth = parseBasicAuth(authHeader);
  if (basicAuth) {
    try {
      // Try to find user by username - they may use a token as password
      const user = await userModel.findByUsername(basicAuth.username);
      if (user) {
        // For now, we just set the user if username matches
        // In production, you'd verify the password/token
        c.set('user', user);
      }
    } catch (error) {
      console.error('[git-auth] User lookup failed:', error);
    }
  }

  // Also support Bearer tokens
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    
    try {
      const session = await sessionModel.findWithUser(token);

      if (session && session.session.expiresAt > new Date()) {
        c.set('user', session.user);
      }
    } catch (error) {
      console.error('[git-auth] Session lookup failed:', error);
    }
  }

  await next();
}

/**
 * Require authentication middleware - returns 401 if not authenticated
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  await next();
}
