import type { Context as HonoContext } from 'hono';
import { getDb, type Database } from '../../db';
import { sessionModel } from '../../db/models';
import type { User } from '../../db/schema';

/**
 * Context available in every tRPC procedure
 */
export interface Context extends Record<string, unknown> {
  /** Database instance */
  db: Database;
  /** Authenticated user or null */
  user: User | null;
  /** Raw request object */
  req: Request;
}

/**
 * Extract session ID from request headers or cookies
 */
function getSessionId(req: Request): string | undefined {
  // Try Authorization header first (Bearer token)
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Try Cookie header
  const cookieHeader = req.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce(
      (acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>
    );
    return cookies['session'];
  }

  return undefined;
}

/**
 * Create context from Hono request context
 * This is called for each incoming tRPC request
 */
export async function createContext(c: HonoContext): Promise<Context> {
  const db = getDb();
  const req = c.req.raw;

  // Get session from request
  const sessionId = getSessionId(req);

  let user: User | null = null;

  if (sessionId) {
    try {
      const session = await sessionModel.findWithUser(sessionId);
      if (session && session.session.expiresAt > new Date()) {
        user = session.user;
      }
    } catch {
      // Session lookup failed, user remains null
    }
  }

  return { db, user, req };
}

/**
 * Create context for testing or CLI usage (without Hono)
 */
export function createTestContext(options: {
  user?: User | null;
  req?: Request;
} = {}): Context {
  const db = getDb();
  return {
    db,
    user: options.user ?? null,
    req: options.req ?? new Request('http://localhost'),
  };
}
