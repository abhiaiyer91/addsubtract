import { Context, Next } from 'hono';
import { userModel } from '../../db/models';
import { isConnected, getDb } from '../../db';
import { session as sessionTable } from '../../db/auth-schema';
import { user as userTable } from '../../db/auth-schema';
import { eq, and, gt } from 'drizzle-orm';
import type { User } from '../../db/models/user';
import type { OAuthAppScope } from '../../db/schema';

/**
 * OAuth context for requests authenticated via OAuth tokens
 */
interface OAuthContext {
  appId: string;
  tokenId: string;
  scopes: OAuthAppScope[];
}

/**
 * Extended context with user information
 */
declare module 'hono' {
  interface ContextVariableMap {
    user?: User;
    oauth?: OAuthContext;
  }
}

/**
 * Find session with user from better-auth session table
 */
async function findSessionWithUser(token: string): Promise<{ session: any; user: User } | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(sessionTable)
    .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
    .where(
      and(
        eq(sessionTable.token, token),
        gt(sessionTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (result.length === 0) return undefined;

  return {
    session: result[0].session,
    user: result[0].user,
  };
}

/**
 * Authentication middleware that checks for Bearer token in Authorization header
 * Supports both session tokens and OAuth access tokens
 * Sets c.get('user') if a valid session/token is found
 * Sets c.get('oauth') if authenticated via OAuth token
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
      // Check if it's an OAuth token
      if (token.startsWith('wit_oauth_')) {
        const { oauthAccessTokenModel, parseScopes } = await import('../../db/models/oauth-app');
        
        const oauthToken = await oauthAccessTokenModel.verify(token);
        
        if (oauthToken) {
          // Update last used timestamp
          await oauthAccessTokenModel.updateLastUsed(oauthToken.id);
          
          // Get user info
          const db = getDb();
          const [userRecord] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.id, oauthToken.userId))
            .limit(1);
          
          if (userRecord) {
            c.set('user', userRecord);
            c.set('oauth', {
              appId: oauthToken.appId,
              tokenId: oauthToken.id,
              scopes: parseScopes(oauthToken.scopes),
            });
          }
        }
      } else {
        // Try as session token
        const result = await findSessionWithUser(token);

        if (result) {
          c.set('user', result.user);
        }
      }
    } catch (error) {
      // Log error but don't fail the request
      console.error('[auth] Token lookup failed:', error);
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
      const result = await findSessionWithUser(token);

      if (result) {
        c.set('user', result.user);
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
