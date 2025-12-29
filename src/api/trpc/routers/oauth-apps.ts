/**
 * OAuth Apps tRPC Router
 *
 * Provides API endpoints for managing Wit Apps (OAuth applications).
 * Users can create, update, delete, and manage their OAuth apps.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import {
  oauthAppModel,
  oauthAuthorizationModel,
  oauthAccessTokenModel,
  parseScopes,
  OAUTH_SCOPES,
  OAUTH_SCOPE_DESCRIPTIONS,
} from '../../../db/models/oauth-app';

/**
 * Maximum number of OAuth apps per user
 */
const MAX_APPS_PER_USER = 25;

/**
 * Zod schema for OAuth scopes
 */
const _scopeSchema = z.enum(OAUTH_SCOPES);

/**
 * Zod schema for URL validation
 */
const urlSchema = z.string().url('Must be a valid URL');

export const oauthAppsRouter = router({
  /**
   * List all OAuth apps owned by the authenticated user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const apps = await oauthAppModel.findByOwnerId(ctx.user.id);

    return apps.map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      clientId: app.clientId,
      clientSecretPrefix: app.clientSecretPrefix,
      callbackUrl: app.callbackUrl,
      additionalCallbackUrls: app.additionalCallbackUrls
        ? JSON.parse(app.additionalCallbackUrls)
        : [],
      logoUrl: app.logoUrl,
      websiteUrl: app.websiteUrl,
      privacyPolicyUrl: app.privacyPolicyUrl,
      termsOfServiceUrl: app.termsOfServiceUrl,
      isPublished: app.isPublished,
      isVerified: app.isVerified,
      installationsCount: app.installationsCount,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    }));
  }),

  /**
   * Get a specific OAuth app by ID
   */
  get: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid app ID'),
      })
    )
    .query(async ({ input, ctx }) => {
      const app = await oauthAppModel.findById(input.id);

      if (!app) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'OAuth app not found',
        });
      }

      // Only owner can see full details
      if (app.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this app',
        });
      }

      return {
        id: app.id,
        name: app.name,
        description: app.description,
        clientId: app.clientId,
        clientSecretPrefix: app.clientSecretPrefix,
        callbackUrl: app.callbackUrl,
        additionalCallbackUrls: app.additionalCallbackUrls
          ? JSON.parse(app.additionalCallbackUrls)
          : [],
        logoUrl: app.logoUrl,
        websiteUrl: app.websiteUrl,
        privacyPolicyUrl: app.privacyPolicyUrl,
        termsOfServiceUrl: app.termsOfServiceUrl,
        isPublished: app.isPublished,
        isVerified: app.isVerified,
        installationsCount: app.installationsCount,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      };
    }),

  /**
   * Get public info about an app (for marketplace/discovery)
   */
  getPublic: publicProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid app ID'),
      })
    )
    .query(async ({ input }) => {
      const app = await oauthAppModel.findById(input.id);

      if (!app) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'OAuth app not found',
        });
      }

      // Only return public info for published apps
      if (!app.isPublished) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'OAuth app not found',
        });
      }

      return {
        id: app.id,
        name: app.name,
        description: app.description,
        logoUrl: app.logoUrl,
        websiteUrl: app.websiteUrl,
        privacyPolicyUrl: app.privacyPolicyUrl,
        termsOfServiceUrl: app.termsOfServiceUrl,
        isVerified: app.isVerified,
        installationsCount: app.installationsCount,
        createdAt: app.createdAt,
      };
    }),

  /**
   * Create a new OAuth app
   * Returns the app WITH the client secret (only available at creation!)
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z
          .string()
          .min(1, 'Name is required')
          .max(100, 'Name must be 100 characters or less'),
        description: z
          .string()
          .max(500, 'Description must be 500 characters or less')
          .optional(),
        websiteUrl: urlSchema.optional(),
        callbackUrl: urlSchema,
        additionalCallbackUrls: z.array(urlSchema).max(10).optional(),
        logoUrl: urlSchema.optional(),
        privacyPolicyUrl: urlSchema.optional(),
        termsOfServiceUrl: urlSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check app limit
      const existingApps = await oauthAppModel.findByOwnerId(ctx.user.id);
      if (existingApps.length >= MAX_APPS_PER_USER) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Maximum of ${MAX_APPS_PER_USER} OAuth apps allowed per user`,
        });
      }

      const appWithSecret = await oauthAppModel.create({
        ownerId: ctx.user.id,
        ownerType: 'user',
        name: input.name,
        description: input.description,
        websiteUrl: input.websiteUrl,
        callbackUrl: input.callbackUrl,
        additionalCallbackUrls: input.additionalCallbackUrls,
        logoUrl: input.logoUrl,
        privacyPolicyUrl: input.privacyPolicyUrl,
        termsOfServiceUrl: input.termsOfServiceUrl,
      });

      return {
        id: appWithSecret.id,
        name: appWithSecret.name,
        description: appWithSecret.description,
        clientId: appWithSecret.clientId,
        clientSecret: appWithSecret.clientSecret, // Only time this is returned!
        callbackUrl: appWithSecret.callbackUrl,
        createdAt: appWithSecret.createdAt,
        warning:
          'Make sure to copy your client secret now. You will not be able to see it again!',
      };
    }),

  /**
   * Update an OAuth app
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid app ID'),
        name: z
          .string()
          .min(1, 'Name is required')
          .max(100, 'Name must be 100 characters or less')
          .optional(),
        description: z
          .string()
          .max(500, 'Description must be 500 characters or less')
          .optional(),
        websiteUrl: urlSchema.nullable().optional(),
        callbackUrl: urlSchema.optional(),
        additionalCallbackUrls: z.array(urlSchema).max(10).optional(),
        logoUrl: urlSchema.nullable().optional(),
        privacyPolicyUrl: urlSchema.nullable().optional(),
        termsOfServiceUrl: urlSchema.nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const isOwner = await oauthAppModel.isOwnedBy(input.id, ctx.user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'OAuth app not found',
        });
      }

      const app = await oauthAppModel.update(input.id, {
        name: input.name,
        description: input.description,
        websiteUrl: input.websiteUrl ?? undefined,
        callbackUrl: input.callbackUrl,
        additionalCallbackUrls: input.additionalCallbackUrls,
        logoUrl: input.logoUrl ?? undefined,
        privacyPolicyUrl: input.privacyPolicyUrl ?? undefined,
        termsOfServiceUrl: input.termsOfServiceUrl ?? undefined,
      });

      if (!app) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update OAuth app',
        });
      }

      return {
        id: app.id,
        name: app.name,
        description: app.description,
        callbackUrl: app.callbackUrl,
        additionalCallbackUrls: app.additionalCallbackUrls
          ? JSON.parse(app.additionalCallbackUrls)
          : [],
        logoUrl: app.logoUrl,
        websiteUrl: app.websiteUrl,
        privacyPolicyUrl: app.privacyPolicyUrl,
        termsOfServiceUrl: app.termsOfServiceUrl,
        updatedAt: app.updatedAt,
      };
    }),

  /**
   * Publish an app (make it public)
   */
  publish: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid app ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const isOwner = await oauthAppModel.isOwnedBy(input.id, ctx.user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'OAuth app not found',
        });
      }

      const app = await oauthAppModel.update(input.id, { isPublished: true });

      return { success: true, isPublished: app?.isPublished };
    }),

  /**
   * Unpublish an app (make it private)
   */
  unpublish: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid app ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const isOwner = await oauthAppModel.isOwnedBy(input.id, ctx.user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'OAuth app not found',
        });
      }

      const app = await oauthAppModel.update(input.id, { isPublished: false });

      return { success: true, isPublished: app?.isPublished };
    }),

  /**
   * Regenerate client secret
   * Returns the new secret (only available at this time!)
   */
  regenerateSecret: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid app ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const isOwner = await oauthAppModel.isOwnedBy(input.id, ctx.user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'OAuth app not found',
        });
      }

      const clientSecret = await oauthAppModel.regenerateSecret(input.id);

      if (!clientSecret) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to regenerate client secret',
        });
      }

      return {
        clientSecret,
        warning:
          'Make sure to copy your new client secret now. You will not be able to see it again! All existing tokens using the old secret will continue to work.',
      };
    }),

  /**
   * Delete an OAuth app
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid app ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const isOwner = await oauthAppModel.isOwnedBy(input.id, ctx.user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'OAuth app not found',
        });
      }

      const deleted = await oauthAppModel.delete(input.id);

      return { success: deleted };
    }),

  /**
   * List authorizations/installations for an app
   * Only the app owner can see this
   */
  listInstallations: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid app ID'),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const isOwner = await oauthAppModel.isOwnedBy(input.id, ctx.user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'OAuth app not found',
        });
      }

      const authorizations = await oauthAuthorizationModel.findByAppId(input.id);

      return {
        total: authorizations.length,
        installations: authorizations.slice(input.offset, input.offset + input.limit).map((auth) => ({
          id: auth.id,
          userId: auth.userId,
          scopes: parseScopes(auth.scopes),
          createdAt: auth.createdAt,
          updatedAt: auth.updatedAt,
        })),
      };
    }),

  /**
   * Search published apps (for marketplace)
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const apps = await oauthAppModel.searchPublished(input.query, input.limit);

      return apps.map((app) => ({
        id: app.id,
        name: app.name,
        description: app.description,
        logoUrl: app.logoUrl,
        websiteUrl: app.websiteUrl,
        isVerified: app.isVerified,
        installationsCount: app.installationsCount,
      }));
    }),

  /**
   * List popular published apps (for marketplace)
   */
  listPopular: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const apps = await oauthAppModel.listPublished(input.limit, input.offset);

      return apps.map((app) => ({
        id: app.id,
        name: app.name,
        description: app.description,
        logoUrl: app.logoUrl,
        websiteUrl: app.websiteUrl,
        isVerified: app.isVerified,
        installationsCount: app.installationsCount,
      }));
    }),

  /**
   * List available OAuth scopes
   */
  scopes: publicProcedure.query(() => {
    return OAUTH_SCOPES.map((scope) => ({
      name: scope,
      description: OAUTH_SCOPE_DESCRIPTIONS[scope],
    }));
  }),

  // ============ User Authorization Management ============

  /**
   * List apps the current user has authorized
   */
  authorizations: protectedProcedure.query(async ({ ctx }) => {
    const authorizations = await oauthAuthorizationModel.findByUserId(ctx.user.id);

    const result = await Promise.all(
      authorizations.map(async (auth) => {
        const app = await oauthAppModel.findById(auth.appId);
        return {
          id: auth.id,
          app: app
            ? {
                id: app.id,
                name: app.name,
                description: app.description,
                logoUrl: app.logoUrl,
                websiteUrl: app.websiteUrl,
                isVerified: app.isVerified,
              }
            : null,
          scopes: parseScopes(auth.scopes),
          createdAt: auth.createdAt,
          updatedAt: auth.updatedAt,
        };
      })
    );

    return result.filter((r) => r.app !== null);
  }),

  /**
   * Revoke an authorization (disconnect an app)
   */
  revokeAuthorization: protectedProcedure
    .input(
      z.object({
        authorizationId: z.string().uuid('Invalid authorization ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const authorization = await oauthAuthorizationModel.findById(input.authorizationId);

      if (!authorization) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Authorization not found',
        });
      }

      if (authorization.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot revoke this authorization',
        });
      }

      // Revoke all tokens for this authorization
      await oauthAccessTokenModel.revokeAllForUser(authorization.appId, ctx.user.id);

      // Revoke the authorization
      const revoked = await oauthAuthorizationModel.revoke(input.authorizationId);

      return { success: revoked };
    }),
});
