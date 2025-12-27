/**
 * Personal Access Tokens Model
 *
 * Database operations for user personal access tokens.
 * Used for API/CLI authentication without passwords.
 */

import * as crypto from 'crypto';
import { eq, and, gt, or, isNull } from 'drizzle-orm';
import { getDb } from '../index';
import { personalAccessTokens, type PersonalAccessToken } from '../schema';

/**
 * Available token scopes
 */
export const TOKEN_SCOPES = [
  'repo:read', // Clone, pull repositories
  'repo:write', // Push to repositories
  'repo:admin', // Manage settings, collaborators, delete repos
  'user:read', // Read profile information
  'user:write', // Update profile
] as const;

export type TokenScope = (typeof TOKEN_SCOPES)[number];

/**
 * Token with the raw value (only available at creation time)
 */
export interface TokenWithValue extends PersonalAccessToken {
  rawToken: string;
}

/**
 * Generate a new token
 * Format: wit_ + 40 random hex chars
 */
function generateToken(): string {
  const randomPart = crypto.randomBytes(20).toString('hex');
  return `wit_${randomPart}`;
}

/**
 * Hash a token using SHA256
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Extract prefix from token (first 8 chars after wit_)
 */
function getTokenPrefix(token: string): string {
  return token.substring(0, 8); // "wit_xxxx"
}

/**
 * Parse and validate scopes
 */
export function parseScopes(scopes: string[] | string): TokenScope[] {
  const scopeArray = typeof scopes === 'string' ? JSON.parse(scopes) : scopes;

  const valid = scopeArray.filter((s: string): s is TokenScope =>
    TOKEN_SCOPES.includes(s as TokenScope)
  );

  if (valid.length === 0) {
    throw new Error('At least one valid scope is required');
  }

  return valid;
}

/**
 * Check if token has required scope
 */
export function hasScope(tokenScopes: string[], requiredScope: TokenScope): boolean {
  const scopes = parseScopes(tokenScopes);
  return scopes.includes(requiredScope);
}

export const tokenModel = {
  /**
   * Find a token by ID
   */
  async findById(id: string): Promise<PersonalAccessToken | undefined> {
    const db = getDb();
    const [token] = await db
      .select()
      .from(personalAccessTokens)
      .where(eq(personalAccessTokens.id, id));
    return token;
  },

  /**
   * Find all tokens for a user
   */
  async findByUserId(userId: string): Promise<PersonalAccessToken[]> {
    const db = getDb();
    return db
      .select()
      .from(personalAccessTokens)
      .where(eq(personalAccessTokens.userId, userId));
  },

  /**
   * Find a valid token by its hash
   * Checks expiration and returns token with user ID if valid
   */
  async findByHash(tokenHash: string): Promise<PersonalAccessToken | undefined> {
    const db = getDb();
    const now = new Date();

    const [token] = await db
      .select()
      .from(personalAccessTokens)
      .where(
        and(
          eq(personalAccessTokens.tokenHash, tokenHash),
          or(
            isNull(personalAccessTokens.expiresAt),
            gt(personalAccessTokens.expiresAt, now)
          )
        )
      );

    return token;
  },

  /**
   * Verify a raw token and return the token record if valid
   */
  async verify(rawToken: string): Promise<PersonalAccessToken | undefined> {
    const hash = hashToken(rawToken);
    return this.findByHash(hash);
  },

  /**
   * Create a new token
   * Returns the token WITH the raw value (only time it's available!)
   */
  async create(data: {
    userId: string;
    name: string;
    scopes: TokenScope[];
    expiresAt?: Date | null;
  }): Promise<TokenWithValue> {
    const db = getDb();

    // Generate the raw token
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const tokenPrefix = getTokenPrefix(rawToken);

    const [token] = await db
      .insert(personalAccessTokens)
      .values({
        userId: data.userId,
        name: data.name,
        tokenHash,
        tokenPrefix,
        scopes: JSON.stringify(data.scopes),
        expiresAt: data.expiresAt,
      })
      .returning();

    return {
      ...token,
      rawToken,
    };
  },

  /**
   * Update last used timestamp
   */
  async updateLastUsed(id: string): Promise<void> {
    const db = getDb();
    await db
      .update(personalAccessTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(personalAccessTokens.id, id));
  },

  /**
   * Delete a token
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(personalAccessTokens)
      .where(eq(personalAccessTokens.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Delete all tokens for a user
   */
  async deleteAllForUser(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(personalAccessTokens)
      .where(eq(personalAccessTokens.userId, userId))
      .returning();
    return result.length;
  },

  /**
   * Check if a user owns a specific token
   */
  async isOwnedByUser(tokenId: string, userId: string): Promise<boolean> {
    const token = await this.findById(tokenId);
    return token?.userId === userId;
  },

  /**
   * Count tokens for a user
   */
  async countByUserId(userId: string): Promise<number> {
    const tokens = await this.findByUserId(userId);
    return tokens.length;
  },

  /**
   * Get scopes for a token
   */
  getScopes(token: PersonalAccessToken): TokenScope[] {
    return parseScopes(token.scopes);
  },

  /**
   * Check if token has a specific scope
   */
  hasScope(token: PersonalAccessToken, scope: TokenScope): boolean {
    const scopes = this.getScopes(token);
    return scopes.includes(scope);
  },

  /**
   * Format token for display (hide most of it)
   * Shows: prefix + "..." + last 4 chars
   */
  formatForDisplay(token: PersonalAccessToken): string {
    // tokenPrefix is like "wit_xxxx", we want to show "wit_xxxx...yyyy"
    // But we don't have the full token, so just show prefix
    return `${token.tokenPrefix}...`;
  },
};
