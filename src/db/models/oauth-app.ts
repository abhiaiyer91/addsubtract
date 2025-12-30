/**
 * OAuth Apps Model
 *
 * Database operations for Wit OAuth Apps (third-party integrations).
 * Allows developers to register apps that can access the Wit API on behalf of users.
 */

import * as crypto from 'crypto';
import { eq, and, or, sql, desc, ilike } from 'drizzle-orm';
import { getDb } from '../index';
import {
  oauthApps,
  oauthAuthorizations,
  oauthAuthorizationCodes,
  oauthAccessTokens,
  oauthRefreshTokens,
  type OAuthApp,
  type OAuthAppScope,
  type OAuthAuthorization,
  type OAuthAccessToken,
  oauthAppScopeEnum,
} from '../schema';

/**
 * Available OAuth scopes
 */
export const OAUTH_SCOPES = oauthAppScopeEnum.enumValues;

/**
 * Scope descriptions for UI
 */
export const OAUTH_SCOPE_DESCRIPTIONS: Record<OAuthAppScope, string> = {
  'user:read': 'Read your user profile information',
  'user:email': 'Read your email address',
  'repo:read': 'Read repositories you have access to',
  'repo:write': 'Push to repositories you have access to',
  'repo:admin': 'Administer repositories (settings, collaborators)',
  'org:read': 'Read organization membership',
  'org:write': 'Manage organization membership',
  'workflow:read': 'Read workflow runs and logs',
  'workflow:write': 'Trigger and manage workflows',
  'issue:read': 'Read issues',
  'issue:write': 'Create and edit issues',
  'pull:read': 'Read pull requests',
  'pull:write': 'Create and edit pull requests',
  'webhook:read': 'Read webhook configurations',
  'webhook:write': 'Manage webhooks',
};

/**
 * Generate a client ID
 * Format: wit_app_ + 20 random hex chars
 */
function generateClientId(): string {
  const randomPart = crypto.randomBytes(10).toString('hex');
  return `wit_app_${randomPart}`;
}

/**
 * Generate a client secret
 * Format: witsec_ + 40 random hex chars
 */
function generateClientSecret(): string {
  const randomPart = crypto.randomBytes(20).toString('hex');
  return `witsec_${randomPart}`;
}

/**
 * Hash a secret using SHA256
 */
function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Get prefix from secret (first 8 chars)
 */
function getSecretPrefix(secret: string): string {
  return secret.substring(0, 12); // "witsec_xxxxx"
}

/**
 * Generate an OAuth access token
 * Format: wit_oauth_ + 40 random hex chars
 */
export function generateAccessToken(): string {
  const randomPart = crypto.randomBytes(20).toString('hex');
  return `wit_oauth_${randomPart}`;
}

/**
 * Generate an OAuth refresh token
 * Format: wit_refresh_ + 40 random hex chars
 */
export function generateRefreshToken(): string {
  const randomPart = crypto.randomBytes(20).toString('hex');
  return `wit_refresh_${randomPart}`;
}

/**
 * Generate an authorization code
 * Format: 32 random hex chars
 */
export function generateAuthorizationCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash a token
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Get token prefix
 */
export function getTokenPrefix(token: string): string {
  return token.substring(0, 14); // e.g., "wit_oauth_xxxx"
}

/**
 * Parse scopes from JSON string or array
 */
export function parseScopes(scopes: string | string[]): OAuthAppScope[] {
  const scopeArray = typeof scopes === 'string' ? JSON.parse(scopes) : scopes;
  return scopeArray.filter((s: string): s is OAuthAppScope =>
    OAUTH_SCOPES.includes(s as OAuthAppScope)
  );
}

/**
 * Validate scopes
 */
export function validateScopes(scopes: string[]): OAuthAppScope[] {
  const valid = scopes.filter((s): s is OAuthAppScope =>
    OAUTH_SCOPES.includes(s as OAuthAppScope)
  );
  return valid;
}

/**
 * OAuth App with client secret (only at creation time)
 */
export interface OAuthAppWithSecret extends OAuthApp {
  clientSecret: string;
}

export const oauthAppModel = {
  /**
   * Find an app by ID
   */
  async findById(id: string): Promise<OAuthApp | undefined> {
    const db = getDb();
    const [app] = await db
      .select()
      .from(oauthApps)
      .where(eq(oauthApps.id, id));
    return app;
  },

  /**
   * Find an app by client ID
   */
  async findByClientId(clientId: string): Promise<OAuthApp | undefined> {
    const db = getDb();
    const [app] = await db
      .select()
      .from(oauthApps)
      .where(eq(oauthApps.clientId, clientId));
    return app;
  },

  /**
   * Verify client credentials
   */
  async verifyCredentials(
    clientId: string,
    clientSecret: string
  ): Promise<OAuthApp | undefined> {
    const app = await this.findByClientId(clientId);
    if (!app) return undefined;

    const secretHash = hashSecret(clientSecret);
    if (app.clientSecretHash !== secretHash) return undefined;

    return app;
  },

  /**
   * List apps owned by a user
   */
  async findByOwnerId(ownerId: string): Promise<OAuthApp[]> {
    const db = getDb();
    return db
      .select()
      .from(oauthApps)
      .where(eq(oauthApps.ownerId, ownerId))
      .orderBy(desc(oauthApps.createdAt));
  },

  /**
   * Search published apps
   */
  async searchPublished(query: string, limit = 20): Promise<OAuthApp[]> {
    const db = getDb();
    return db
      .select()
      .from(oauthApps)
      .where(
        and(
          eq(oauthApps.isPublished, true),
          or(
            ilike(oauthApps.name, `%${query}%`),
            ilike(oauthApps.description, `%${query}%`)
          )
        )
      )
      .limit(limit)
      .orderBy(desc(oauthApps.installationsCount));
  },

  /**
   * List all published apps
   */
  async listPublished(limit = 50, offset = 0): Promise<OAuthApp[]> {
    const db = getDb();
    return db
      .select()
      .from(oauthApps)
      .where(eq(oauthApps.isPublished, true))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(oauthApps.installationsCount));
  },

  /**
   * Create a new OAuth app
   * Returns the app WITH the client secret (only available at creation!)
   */
  async create(data: {
    ownerId: string;
    ownerType?: 'user' | 'organization';
    name: string;
    description?: string;
    websiteUrl?: string;
    callbackUrl: string;
    additionalCallbackUrls?: string[];
    logoUrl?: string;
    privacyPolicyUrl?: string;
    termsOfServiceUrl?: string;
  }): Promise<OAuthAppWithSecret> {
    const db = getDb();

    const clientId = generateClientId();
    const clientSecret = generateClientSecret();
    const clientSecretHash = hashSecret(clientSecret);
    const clientSecretPrefix = getSecretPrefix(clientSecret);

    const [app] = await db
      .insert(oauthApps)
      .values({
        ownerId: data.ownerId,
        ownerType: data.ownerType || 'user',
        name: data.name,
        description: data.description,
        websiteUrl: data.websiteUrl,
        callbackUrl: data.callbackUrl,
        additionalCallbackUrls: data.additionalCallbackUrls
          ? JSON.stringify(data.additionalCallbackUrls)
          : null,
        clientId,
        clientSecretHash,
        clientSecretPrefix,
        logoUrl: data.logoUrl,
        privacyPolicyUrl: data.privacyPolicyUrl,
        termsOfServiceUrl: data.termsOfServiceUrl,
      })
      .returning();

    return {
      ...app,
      clientSecret,
    };
  },

  /**
   * Update an OAuth app
   */
  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      websiteUrl?: string;
      callbackUrl?: string;
      additionalCallbackUrls?: string[];
      logoUrl?: string;
      privacyPolicyUrl?: string;
      termsOfServiceUrl?: string;
      isPublished?: boolean;
    }
  ): Promise<OAuthApp | undefined> {
    const db = getDb();

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.websiteUrl !== undefined) updateData.websiteUrl = data.websiteUrl;
    if (data.callbackUrl !== undefined) updateData.callbackUrl = data.callbackUrl;
    if (data.additionalCallbackUrls !== undefined) {
      updateData.additionalCallbackUrls = JSON.stringify(data.additionalCallbackUrls);
    }
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
    if (data.privacyPolicyUrl !== undefined) updateData.privacyPolicyUrl = data.privacyPolicyUrl;
    if (data.termsOfServiceUrl !== undefined) updateData.termsOfServiceUrl = data.termsOfServiceUrl;
    if (data.isPublished !== undefined) updateData.isPublished = data.isPublished;

    const [app] = await db
      .update(oauthApps)
      .set(updateData)
      .where(eq(oauthApps.id, id))
      .returning();

    return app;
  },

  /**
   * Regenerate client secret
   * Returns the new secret (only available at this time!)
   */
  async regenerateSecret(id: string): Promise<string | undefined> {
    const db = getDb();

    const clientSecret = generateClientSecret();
    const clientSecretHash = hashSecret(clientSecret);
    const clientSecretPrefix = getSecretPrefix(clientSecret);

    const [app] = await db
      .update(oauthApps)
      .set({
        clientSecretHash,
        clientSecretPrefix,
        updatedAt: new Date(),
      })
      .where(eq(oauthApps.id, id))
      .returning();

    if (!app) return undefined;
    return clientSecret;
  },

  /**
   * Delete an OAuth app
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(oauthApps)
      .where(eq(oauthApps.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Increment installations count
   */
  async incrementInstallations(id: string): Promise<void> {
    const db = getDb();
    await db
      .update(oauthApps)
      .set({
        installationsCount: sql`${oauthApps.installationsCount} + 1`,
      })
      .where(eq(oauthApps.id, id));
  },

  /**
   * Decrement installations count
   */
  async decrementInstallations(id: string): Promise<void> {
    const db = getDb();
    await db
      .update(oauthApps)
      .set({
        installationsCount: sql`GREATEST(${oauthApps.installationsCount} - 1, 0)`,
      })
      .where(eq(oauthApps.id, id));
  },

  /**
   * Check if user owns the app
   */
  async isOwnedBy(id: string, ownerId: string): Promise<boolean> {
    const app = await this.findById(id);
    return app?.ownerId === ownerId;
  },

  /**
   * Get all callback URLs for an app
   */
  getCallbackUrls(app: OAuthApp): string[] {
    const urls = [app.callbackUrl];
    if (app.additionalCallbackUrls) {
      try {
        const additional = JSON.parse(app.additionalCallbackUrls);
        if (Array.isArray(additional)) {
          urls.push(...additional);
        }
      } catch {
        // Ignore parse errors
      }
    }
    return urls;
  },

  /**
   * Validate a redirect URI against app's allowed URLs
   */
  isValidRedirectUri(app: OAuthApp, redirectUri: string): boolean {
    const allowedUrls = this.getCallbackUrls(app);
    return allowedUrls.some((url) => {
      // Exact match or match with trailing slash
      return redirectUri === url || redirectUri === `${url}/`;
    });
  },
};

/**
 * OAuth Authorization Model
 */
export const oauthAuthorizationModel = {
  /**
   * Find an authorization by ID
   */
  async findById(id: string): Promise<OAuthAuthorization | undefined> {
    const db = getDb();
    const [auth] = await db
      .select()
      .from(oauthAuthorizations)
      .where(eq(oauthAuthorizations.id, id));
    return auth;
  },

  /**
   * Find authorization by app and user
   */
  async findByAppAndUser(
    appId: string,
    userId: string
  ): Promise<OAuthAuthorization | undefined> {
    const db = getDb();
    const [auth] = await db
      .select()
      .from(oauthAuthorizations)
      .where(
        and(
          eq(oauthAuthorizations.appId, appId),
          eq(oauthAuthorizations.userId, userId)
        )
      );
    return auth;
  },

  /**
   * List authorizations for a user
   */
  async findByUserId(userId: string): Promise<OAuthAuthorization[]> {
    const db = getDb();
    return db
      .select()
      .from(oauthAuthorizations)
      .where(eq(oauthAuthorizations.userId, userId))
      .orderBy(desc(oauthAuthorizations.createdAt));
  },

  /**
   * List authorizations for an app
   */
  async findByAppId(appId: string): Promise<OAuthAuthorization[]> {
    const db = getDb();
    return db
      .select()
      .from(oauthAuthorizations)
      .where(eq(oauthAuthorizations.appId, appId))
      .orderBy(desc(oauthAuthorizations.createdAt));
  },

  /**
   * Create or update an authorization
   */
  async upsert(data: {
    appId: string;
    userId: string;
    scopes: OAuthAppScope[];
  }): Promise<OAuthAuthorization> {
    const db = getDb();

    // Check if authorization exists
    const existing = await this.findByAppAndUser(data.appId, data.userId);

    if (existing) {
      // Update existing authorization
      const [auth] = await db
        .update(oauthAuthorizations)
        .set({
          scopes: JSON.stringify(data.scopes),
          updatedAt: new Date(),
        })
        .where(eq(oauthAuthorizations.id, existing.id))
        .returning();
      return auth;
    }

    // Create new authorization
    const [auth] = await db
      .insert(oauthAuthorizations)
      .values({
        appId: data.appId,
        userId: data.userId,
        scopes: JSON.stringify(data.scopes),
      })
      .returning();

    // Increment app installations count
    await oauthAppModel.incrementInstallations(data.appId);

    return auth;
  },

  /**
   * Revoke an authorization
   */
  async revoke(id: string): Promise<boolean> {
    const db = getDb();

    // Get the authorization first to get appId
    const auth = await this.findById(id);
    if (!auth) return false;

    const result = await db
      .delete(oauthAuthorizations)
      .where(eq(oauthAuthorizations.id, id))
      .returning();

    if (result.length > 0) {
      // Decrement app installations count
      await oauthAppModel.decrementInstallations(auth.appId);
      return true;
    }

    return false;
  },

  /**
   * Revoke by app and user
   */
  async revokeByAppAndUser(appId: string, userId: string): Promise<boolean> {
    const auth = await this.findByAppAndUser(appId, userId);
    if (!auth) return false;
    return this.revoke(auth.id);
  },

  /**
   * Get scopes for an authorization
   */
  getScopes(auth: OAuthAuthorization): OAuthAppScope[] {
    return parseScopes(auth.scopes);
  },
};

/**
 * OAuth Authorization Code Model
 */
export const oauthAuthCodeModel = {
  /**
   * Create an authorization code
   */
  async create(data: {
    appId: string;
    userId: string;
    scopes: OAuthAppScope[];
    redirectUri: string;
    codeChallenge?: string;
    codeChallengeMethod?: 'plain' | 'S256';
    state?: string;
    expiresInMinutes?: number;
  }): Promise<string> {
    const db = getDb();

    const code = generateAuthorizationCode();
    const codeHash = hashToken(code);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (data.expiresInMinutes || 10));

    await db.insert(oauthAuthorizationCodes).values({
      codeHash,
      appId: data.appId,
      userId: data.userId,
      scopes: JSON.stringify(data.scopes),
      redirectUri: data.redirectUri,
      codeChallenge: data.codeChallenge,
      codeChallengeMethod: data.codeChallengeMethod,
      state: data.state,
      expiresAt,
    });

    return code;
  },

  /**
   * Exchange an authorization code for tokens
   */
  async exchange(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<{
    appId: string;
    userId: string;
    scopes: OAuthAppScope[];
  } | null> {
    const db = getDb();

    const codeHash = hashToken(code);

    const [authCode] = await db
      .select()
      .from(oauthAuthorizationCodes)
      .where(
        and(
          eq(oauthAuthorizationCodes.codeHash, codeHash),
          eq(oauthAuthorizationCodes.used, false)
        )
      );

    if (!authCode) return null;

    // Check expiration
    if (authCode.expiresAt < new Date()) {
      return null;
    }

    // Verify redirect URI matches
    if (authCode.redirectUri !== redirectUri) {
      return null;
    }

    // Verify app matches
    const app = await oauthAppModel.findByClientId(clientId);
    if (!app || app.id !== authCode.appId) {
      return null;
    }

    // Verify PKCE if code challenge was provided
    if (authCode.codeChallenge) {
      if (!codeVerifier) return null;

      let expectedChallenge: string;
      if (authCode.codeChallengeMethod === 'S256') {
        expectedChallenge = crypto
          .createHash('sha256')
          .update(codeVerifier)
          .digest('base64url');
      } else {
        expectedChallenge = codeVerifier;
      }

      if (expectedChallenge !== authCode.codeChallenge) {
        return null;
      }
    }

    // Mark code as used
    await db
      .update(oauthAuthorizationCodes)
      .set({ used: true })
      .where(eq(oauthAuthorizationCodes.id, authCode.id));

    return {
      appId: authCode.appId,
      userId: authCode.userId,
      scopes: parseScopes(authCode.scopes),
    };
  },

  /**
   * Clean up expired codes
   */
  async cleanupExpired(): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(oauthAuthorizationCodes)
      .where(
        or(
          sql`${oauthAuthorizationCodes.expiresAt} < NOW()`,
          eq(oauthAuthorizationCodes.used, true)
        )
      )
      .returning();
    return result.length;
  },
};

/**
 * OAuth Access Token Model
 */
export const oauthAccessTokenModel = {
  /**
   * Find by ID
   */
  async findById(id: string): Promise<OAuthAccessToken | undefined> {
    const db = getDb();
    const [token] = await db
      .select()
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.id, id));
    return token;
  },

  /**
   * Find by token hash
   */
  async findByHash(tokenHash: string): Promise<OAuthAccessToken | undefined> {
    const db = getDb();
    const [token] = await db
      .select()
      .from(oauthAccessTokens)
      .where(
        and(
          eq(oauthAccessTokens.tokenHash, tokenHash),
          eq(oauthAccessTokens.revoked, false)
        )
      );
    return token;
  },

  /**
   * Verify an access token
   */
  async verify(rawToken: string): Promise<OAuthAccessToken | undefined> {
    const tokenHash = hashToken(rawToken);
    const token = await this.findByHash(tokenHash);

    if (!token) return undefined;

    // Check expiration
    if (token.expiresAt && token.expiresAt < new Date()) {
      return undefined;
    }

    return token;
  },

  /**
   * Create an access token
   */
  async create(data: {
    appId: string;
    userId: string;
    authorizationId?: string;
    scopes: OAuthAppScope[];
    expiresInHours?: number;
  }): Promise<{
    accessToken: string;
    tokenId: string;
    expiresAt: Date | null;
  }> {
    const db = getDb();

    const accessToken = generateAccessToken();
    const tokenHash = hashToken(accessToken);
    const tokenPrefix = getTokenPrefix(accessToken);

    let expiresAt: Date | null = null;
    if (data.expiresInHours) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + data.expiresInHours);
    }

    const [token] = await db
      .insert(oauthAccessTokens)
      .values({
        tokenHash,
        tokenPrefix,
        appId: data.appId,
        userId: data.userId,
        authorizationId: data.authorizationId,
        scopes: JSON.stringify(data.scopes),
        expiresAt,
      })
      .returning();

    return {
      accessToken,
      tokenId: token.id,
      expiresAt,
    };
  },

  /**
   * Update last used timestamp
   */
  async updateLastUsed(id: string): Promise<void> {
    const db = getDb();
    await db
      .update(oauthAccessTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(oauthAccessTokens.id, id));
  },

  /**
   * Revoke a token
   */
  async revoke(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .update(oauthAccessTokens)
      .set({
        revoked: true,
        revokedAt: new Date(),
      })
      .where(eq(oauthAccessTokens.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Revoke all tokens for an app/user combination
   */
  async revokeAllForUser(appId: string, userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .update(oauthAccessTokens)
      .set({
        revoked: true,
        revokedAt: new Date(),
      })
      .where(
        and(
          eq(oauthAccessTokens.appId, appId),
          eq(oauthAccessTokens.userId, userId),
          eq(oauthAccessTokens.revoked, false)
        )
      )
      .returning();
    return result.length;
  },

  /**
   * List tokens for a user (for managing authorized apps)
   */
  async findByUserId(userId: string): Promise<OAuthAccessToken[]> {
    const db = getDb();
    return db
      .select()
      .from(oauthAccessTokens)
      .where(
        and(
          eq(oauthAccessTokens.userId, userId),
          eq(oauthAccessTokens.revoked, false)
        )
      )
      .orderBy(desc(oauthAccessTokens.createdAt));
  },

  /**
   * Get scopes for a token
   */
  getScopes(token: OAuthAccessToken): OAuthAppScope[] {
    return parseScopes(token.scopes);
  },

  /**
   * Check if token has a specific scope
   */
  hasScope(token: OAuthAccessToken, scope: OAuthAppScope): boolean {
    const scopes = this.getScopes(token);
    return scopes.includes(scope);
  },
};

/**
 * OAuth Refresh Token Model
 */
export const oauthRefreshTokenModel = {
  /**
   * Create a refresh token
   */
  async create(accessTokenId: string, expiresInDays = 30): Promise<string> {
    const db = getDb();

    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await db.insert(oauthRefreshTokens).values({
      tokenHash,
      accessTokenId,
      expiresAt,
    });

    return refreshToken;
  },

  /**
   * Exchange a refresh token for a new access token
   */
  async exchange(refreshToken: string): Promise<{
    accessTokenId: string;
  } | null> {
    const db = getDb();

    const tokenHash = hashToken(refreshToken);

    const [token] = await db
      .select()
      .from(oauthRefreshTokens)
      .where(
        and(
          eq(oauthRefreshTokens.tokenHash, tokenHash),
          eq(oauthRefreshTokens.used, false)
        )
      );

    if (!token) return null;

    // Check expiration
    if (token.expiresAt && token.expiresAt < new Date()) {
      return null;
    }

    // Mark as used
    await db
      .update(oauthRefreshTokens)
      .set({
        used: true,
        usedAt: new Date(),
      })
      .where(eq(oauthRefreshTokens.id, token.id));

    return {
      accessTokenId: token.accessTokenId,
    };
  },
};
