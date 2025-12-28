import type { Context as HonoContext } from 'hono';
import { getDb, type Database } from '../../db';
import { createAuth } from '../../lib/auth';
import type { OAuthAppScope } from '../../db/schema';

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
 * OAuth context - present when request is authenticated via OAuth token
 */
export interface OAuthContext {
  /** OAuth app ID */
  appId: string;
  /** OAuth token ID */
  tokenId: string;
  /** Scopes granted to the token */
  scopes: OAuthAppScope[];
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
  /** OAuth context if authenticated via OAuth token */
  oauth?: OAuthContext;
}

/**
 * Create context from Hono request context
 * This is called for each incoming tRPC request
 */
export async function createContext(c: HonoContext): Promise<Context> {
  const db = getDb();
  const req = c.req.raw;

  let user: AuthUser | null = null;
  let oauth: OAuthContext | undefined = undefined;

  try {
    // Check for Bearer token first (for API/test usage)
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      
      // Check if it's an OAuth token (starts with wit_oauth_)
      if (token.startsWith('wit_oauth_')) {
        // Look up OAuth access token
        const { oauthAccessTokenModel, parseScopes } = await import('../../db/models/oauth-app');
        const { user: userTable } = await import('../../db/auth-schema');
        const { eq } = await import('drizzle-orm');
        
        const oauthToken = await oauthAccessTokenModel.verify(token);
        
        if (oauthToken) {
          // Update last used timestamp
          await oauthAccessTokenModel.updateLastUsed(oauthToken.id);
          
          // Get user info
          const [userRecord] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.id, oauthToken.userId))
            .limit(1);
          
          if (userRecord) {
            user = {
              id: userRecord.id,
              email: userRecord.email,
              name: userRecord.name,
              username: userRecord.username,
              image: userRecord.image,
            };
            
            oauth = {
              appId: oauthToken.appId,
              tokenId: oauthToken.id,
              scopes: parseScopes(oauthToken.scopes),
            };
          }
        }
      } else {
        // Try as session token
        console.log('[context] Looking up Bearer token:', token.slice(0, 20) + '...');
        
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

        console.log('[context] Session found:', !!sessionRecord);

        if (sessionRecord && sessionRecord.session.expiresAt > new Date()) {
          user = {
            id: sessionRecord.user.id,
            email: sessionRecord.user.email,
            name: sessionRecord.user.name,
            username: sessionRecord.user.username,
            image: sessionRecord.user.image,
          };
        }
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

  return { db, user, req, oauth };
}

/**
 * Create context for testing or CLI usage (without Hono)
 */
export function createTestContext(options: {
  user?: AuthUser | null;
  req?: Request;
  oauth?: OAuthContext;
} = {}): Context {
  const db = getDb();
  return {
    db,
    user: options.user ?? null,
    req: options.req ?? new Request('http://localhost'),
    oauth: options.oauth,
  };
}
