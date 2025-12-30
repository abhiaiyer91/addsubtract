/**
 * Public API Middleware
 *
 * Authentication, rate limiting, and response formatting middleware
 * for the public REST API.
 */

import { Context, Next } from 'hono';
import { userModel } from '../../../db/models';
import { isConnected, getDb } from '../../../db';
import { session as sessionTable, user as userTable } from '../../../db/auth-schema';
import { eq, and, gt } from 'drizzle-orm';
import type { User } from '../../../db/models/user';
import type { OAuthAppScope } from '../../../db/schema';

/**
 * OAuth context for requests authenticated via OAuth tokens
 */
interface OAuthContext {
  appId: string;
  tokenId: string;
  scopes: OAuthAppScope[];
}

/**
 * Rate limit tracking (in-memory for now, should use Redis in production)
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Extended context with API-specific variables
 */
declare module 'hono' {
  interface ContextVariableMap {
    user?: User;
    oauth?: OAuthContext;
    rateLimitRemaining?: number;
    rateLimitReset?: number;
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
 * Public API authentication middleware
 *
 * Supports:
 * - Bearer tokens (session tokens and OAuth access tokens)
 * - Personal access tokens
 *
 * Sets c.get('user') if authenticated
 * Sets c.get('oauth') if authenticated via OAuth
 */
export async function publicApiAuth(c: Context, next: Next): Promise<Response | void> {
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
        const { oauthAccessTokenModel, parseScopes } = await import('../../../db/models/oauth-app');

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
      } else if (token.startsWith('wit_')) {
        // Personal access token (wit_xxxx format)
        const { tokenModel } = await import('../../../db/models/tokens');

        const pat = await tokenModel.verify(token);

        if (pat) {
          // Update last used timestamp
          await tokenModel.updateLastUsed(pat.id);

          // Get user info
          const db = getDb();
          const [userRecord] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.id, pat.userId))
            .limit(1);

          if (userRecord) {
            c.set('user', userRecord);
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
      console.error('[public-api] Token lookup failed:', error);
    }
  }

  await next();
}

/**
 * Rate limiting middleware
 *
 * Limits:
 * - Authenticated users: 5000 requests per hour
 * - Unauthenticated: 60 requests per hour
 */
export async function rateLimiter(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user');
  const identifier = user?.id || c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'anonymous';

  const limit = user ? 5000 : 60;
  const windowMs = 60 * 60 * 1000; // 1 hour
  const now = Date.now();

  // Get or create rate limit entry
  let entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitStore.set(identifier, entry);
  }

  entry.count++;

  const remaining = Math.max(0, limit - entry.count);
  const reset = Math.floor(entry.resetAt / 1000);

  // Set rate limit info for response headers
  c.set('rateLimitRemaining', remaining);
  c.set('rateLimitReset', reset);

  // Check if rate limited
  if (entry.count > limit) {
    return c.json(
      {
        message: 'API rate limit exceeded',
        documentation_url: 'https://docs.wit.dev/api/rate-limiting',
      },
      429,
      {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(reset),
        'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
      }
    );
  }

  await next();
}

/**
 * API response headers middleware
 *
 * Adds standard API response headers
 */
export async function apiResponseHeaders(c: Context, next: Next): Promise<Response | void> {
  await next();

  // Add rate limit headers
  const remaining = c.get('rateLimitRemaining');
  const reset = c.get('rateLimitReset');
  const user = c.get('user');
  const limit = user ? 5000 : 60;

  if (remaining !== undefined) {
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(reset));
  }

  // Add API version header
  c.header('X-API-Version', 'v1');

  // CORS headers for API
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  c.header('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Link');
}

/**
 * Require authentication middleware
 *
 * Returns 401 if not authenticated
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user');

  if (!user) {
    return c.json(
      {
        message: 'Requires authentication',
        documentation_url: 'https://docs.wit.dev/api/authentication',
      },
      401
    );
  }

  await next();
}

/**
 * Require specific OAuth scopes
 */
export function requireScopes(...requiredScopes: OAuthAppScope[]) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const oauth = c.get('oauth');

    // If not OAuth auth, allow (session auth has full access)
    if (!oauth) {
      return next();
    }

    // Check if all required scopes are present
    const hasAllScopes = requiredScopes.every((scope) => oauth.scopes.includes(scope));

    if (!hasAllScopes) {
      return c.json(
        {
          message: 'Insufficient scope',
          required_scopes: requiredScopes,
          documentation_url: 'https://docs.wit.dev/api/scopes',
        },
        403
      );
    }

    await next();
  };
}

/**
 * Helper to format pagination links in Link header
 */
export function formatLinkHeader(
  baseUrl: string,
  page: number,
  perPage: number,
  totalCount: number
): string {
  const links: string[] = [];
  const totalPages = Math.ceil(totalCount / perPage);

  if (page < totalPages) {
    links.push(`<${baseUrl}?page=${page + 1}&per_page=${perPage}>; rel="next"`);
    links.push(`<${baseUrl}?page=${totalPages}&per_page=${perPage}>; rel="last"`);
  }

  if (page > 1) {
    links.push(`<${baseUrl}?page=${page - 1}&per_page=${perPage}>; rel="prev"`);
    links.push(`<${baseUrl}?page=1&per_page=${perPage}>; rel="first"`);
  }

  return links.join(', ');
}

/**
 * Parse pagination parameters from request
 */
export function parsePagination(c: Context): { page: number; perPage: number; offset: number } {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(c.req.query('per_page') || '30', 10)));
  const offset = (page - 1) * perPage;

  return { page, perPage, offset };
}
