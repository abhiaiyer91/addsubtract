import type { Context as HonoContext } from 'hono';
import { getDb, type Database } from '../../db';
import { createAuth } from '../../lib/auth';

/**
 * User type from better-auth session
 * Includes username from the username plugin
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  username?: string | null;
  image?: string | null;
}

/**
 * Extended session user type that includes username plugin fields
 */
interface SessionUser {
  id: string;
  email: string;
  name: string;
  username?: string | null;
  image?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  emailVerified?: boolean;
}

/**
 * Context available in every tRPC procedure
 */
export interface Context extends Record<string, unknown> {
  /** Database instance */
  db: Database;
  /** Authenticated user or null */
  user: AuthUser | null;
  /** Raw request object */
  req: Request;
}

/**
 * Create context from Hono request context
 * This is called for each incoming tRPC request
 */
export async function createContext(c: HonoContext): Promise<Context> {
  const db = getDb();
  const req = c.req.raw;

  let user: AuthUser | null = null;

  try {
    // Check for Bearer token first (for API/test usage)
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      
      // Look up session directly in database by token
      const { session: sessionTable } = await import('../../db/auth-schema');
      const { eq } = await import('drizzle-orm');
      const { user: userTable } = await import('../../db/auth-schema');
      
      const [sessionRecord] = await db
        .select({
          session: sessionTable,
          user: userTable,
        })
        .from(sessionTable)
        .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
        .where(eq(sessionTable.token, token))
        .limit(1);

      if (sessionRecord && sessionRecord.session.expiresAt > new Date()) {
        user = {
          id: sessionRecord.user.id,
          email: sessionRecord.user.email,
          name: sessionRecord.user.name,
          username: sessionRecord.user.username,
          image: sessionRecord.user.image,
        };
      }
    } else {
      // Use better-auth to validate session from cookies
      const auth = createAuth();
      const session = await auth.api.getSession({
        headers: req.headers,
      });

      if (session?.user) {
        const sessionUser = session.user as SessionUser;
        user = {
          id: sessionUser.id,
          email: sessionUser.email,
          name: sessionUser.name,
          username: sessionUser.username,
          image: sessionUser.image,
        };
      }
    }
  } catch {
    // Session lookup failed, user remains null
  }

  return { db, user, req };
}

/**
 * Create context for testing or CLI usage (without Hono)
 */
export function createTestContext(options: {
  user?: AuthUser | null;
  req?: Request;
} = {}): Context {
  const db = getDb();
  return {
    db,
    user: options.user ?? null,
    req: options.req ?? new Request('http://localhost'),
  };
}
