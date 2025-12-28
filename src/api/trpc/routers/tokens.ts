/**
 * Personal Access Tokens tRPC Router
 *
 * Provides API endpoints for token management.
 * Users can create, list, and revoke their personal access tokens
 * for API/CLI authentication.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { tokenModel, TOKEN_SCOPES, type TokenScope } from '../../../db/models/tokens';

/**
 * Maximum number of tokens per user
 */
const MAX_TOKENS_PER_USER = 50;

/**
 * Zod schema for token scopes
 */
const scopeSchema = z.enum(TOKEN_SCOPES);

export const tokensRouter = router({
  /**
   * List all tokens for the authenticated user
   * Note: Token hashes are never returned
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const tokens = await tokenModel.findByUserId(ctx.user.id);

    return tokens.map((token) => ({
      id: token.id,
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      scopes: tokenModel.getScopes(token),
      lastUsedAt: token.lastUsedAt,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
    }));
  }),

  /**
   * Get a specific token by ID
   */
  get: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid token ID'),
      })
    )
    .query(async ({ input, ctx }) => {
      const token = await tokenModel.findById(input.id);

      if (!token) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Token not found',
        });
      }

      // Verify ownership
      if (token.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this token',
        });
      }

      return {
        id: token.id,
        name: token.name,
        tokenPrefix: token.tokenPrefix,
        scopes: tokenModel.getScopes(token),
        lastUsedAt: token.lastUsedAt,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
      };
    }),

  /**
   * Create a new personal access token
   * IMPORTANT: The raw token is only returned ONCE at creation time!
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z
          .string()
          .min(1, 'Name is required')
          .max(100, 'Name must be 100 characters or less'),
        scopes: z
          .array(scopeSchema)
          .min(1, 'At least one scope is required'),
        expiresInDays: z
          .number()
          .int()
          .positive()
          .max(365, 'Expiration cannot exceed 365 days')
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check token limit
      const tokenCount = await tokenModel.countByUserId(ctx.user.id);
      if (tokenCount >= MAX_TOKENS_PER_USER) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Maximum of ${MAX_TOKENS_PER_USER} tokens allowed per user`,
        });
      }

      // Calculate expiration date if specified
      let expiresAt: Date | null = null;
      if (input.expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
      }

      // Create the token
      const tokenWithValue = await tokenModel.create({
        userId: ctx.user.id,
        name: input.name,
        scopes: input.scopes as TokenScope[],
        expiresAt,
      });

      // Return the raw token - THIS IS THE ONLY TIME IT'S AVAILABLE
      return {
        id: tokenWithValue.id,
        name: tokenWithValue.name,
        token: tokenWithValue.rawToken, // The actual token value
        tokenPrefix: tokenWithValue.tokenPrefix,
        scopes: tokenModel.getScopes(tokenWithValue),
        expiresAt: tokenWithValue.expiresAt,
        createdAt: tokenWithValue.createdAt,
        warning:
          'Make sure to copy your token now. You will not be able to see it again!',
      };
    }),

  /**
   * Delete/revoke a token
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid token ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const isOwner = await tokenModel.isOwnedByUser(input.id, ctx.user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Token not found',
        });
      }

      const deleted = await tokenModel.delete(input.id);
      return { success: deleted };
    }),

  /**
   * Verify a token (internal use, but exposed for testing)
   * Returns token info if valid, null if invalid
   */
  verify: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1, 'Token is required'),
      })
    )
    .query(async ({ input }) => {
      const token = await tokenModel.verify(input.token);

      if (!token) {
        return { valid: false, userId: null, scopes: null };
      }

      // Check if expired
      if (token.expiresAt && token.expiresAt < new Date()) {
        return { valid: false, userId: null, scopes: null, reason: 'expired' };
      }

      return {
        valid: true,
        userId: token.userId,
        scopes: tokenModel.getScopes(token),
        tokenId: token.id,
      };
    }),

  /**
   * List available scopes
   */
  scopes: protectedProcedure.query(() => {
    return TOKEN_SCOPES.map((scope) => ({
      name: scope,
      description: getScopeDescription(scope),
    }));
  }),
});

/**
 * Get human-readable description for a scope
 */
function getScopeDescription(scope: TokenScope): string {
  const descriptions: Record<TokenScope, string> = {
    'repo:read': 'Clone and pull repositories',
    'repo:write': 'Push to repositories',
    'repo:admin': 'Manage repository settings, collaborators, and deletion',
    'user:read': 'Read your profile information',
    'user:write': 'Update your profile',
    'packages:read': 'Download packages (including private packages)',
    'packages:write': 'Publish and manage packages',
  };
  return descriptions[scope];
}
