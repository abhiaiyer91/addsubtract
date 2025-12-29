import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc';
import { ACL, ACLError, type RepoPermission, type OrgRole, type OAuthScope } from '../../../core/acl';

/**
 * Middleware to check if user is authenticated
 * (Already defined in trpc.ts, but exported here for reference)
 */
export const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Convert ACLError to TRPCError
 */
function aclErrorToTRPC(error: ACLError): TRPCError {
  const codeMap: Record<string, 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST'> = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    BAD_REQUEST: 'BAD_REQUEST',
  };
  return new TRPCError({
    code: codeMap[error.code] || 'INTERNAL_SERVER_ERROR',
    message: error.message,
  });
}

/**
 * Extract OAuth scopes from context if available
 */
function getOAuthScopes(ctx: { oauth?: { scopes: OAuthScope[] } }): OAuthScope[] | undefined {
  return ctx.oauth?.scopes;
}

/**
 * Middleware to check if user has permission on a repository
 * Requires repoId in input
 * 
 * Uses the centralized ACL module for consistent security enforcement.
 * Supports OAuth scope checking when the request is made via OAuth token.
 */
export const withRepoPermission = (requiredPermission: RepoPermission) =>
  middleware(async ({ ctx, next, getRawInput }) => {
    const rawInput = await getRawInput();
    const input = rawInput as { repoId?: string };
    
    if (!input.repoId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'repoId is required' });
    }

    try {
      const { repo, effectivePermission } = await ACL.assertRepoAccess(
        input.repoId,
        requiredPermission,
        {
          userId: ctx.user?.id,
          oauthScopes: getOAuthScopes(ctx as any),
        }
      );

      return next({
        ctx: {
          ...ctx,
          user: ctx.user!,
          repo,
          effectivePermission,
        },
      });
    } catch (error) {
      if (error instanceof ACLError) {
        throw aclErrorToTRPC(error);
      }
      throw error;
    }
  });

/**
 * Middleware to check if user is an admin of a repository
 */
export const isRepoAdmin = withRepoPermission('admin');

/**
 * Middleware to check if user can write to a repository
 */
export const isRepoMember = withRepoPermission('write');

/**
 * Middleware to check if user can read a repository
 */
export const isRepoReader = withRepoPermission('read');

/**
 * Middleware to check if user has a role in an organization
 * 
 * Uses the centralized ACL module for consistent security enforcement.
 * Supports OAuth scope checking when the request is made via OAuth token.
 */
export const withOrgRole = (requiredRole: OrgRole) =>
  middleware(async ({ ctx, next, getRawInput }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const rawInput = await getRawInput();
    const input = rawInput as { orgId?: string };
    
    if (!input.orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'orgId is required' });
    }

    try {
      const { effectiveRole } = await ACL.assertOrgRole(
        input.orgId,
        requiredRole,
        {
          userId: ctx.user.id,
          oauthScopes: getOAuthScopes(ctx as any),
        }
      );

      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
          effectiveRole,
        },
      });
    } catch (error) {
      if (error instanceof ACLError) {
        throw aclErrorToTRPC(error);
      }
      throw error;
    }
  });

/**
 * Middleware to check if user is an org admin
 */
export const isOrgAdmin = withOrgRole('admin');

/**
 * Middleware to check if user is an org owner
 */
export const isOrgOwner = withOrgRole('owner');

/**
 * Middleware to check if user is an org member
 */
export const isOrgMember = withOrgRole('member');

/**
 * Middleware to require specific OAuth scopes
 * Use this for endpoints that need specific OAuth scope enforcement
 */
export const requireOAuthScope = (...requiredScopes: OAuthScope[]) =>
  middleware(async ({ ctx, next }) => {
    // If not using OAuth, skip this check (session auth has full access)
    const oauthScopes = getOAuthScopes(ctx as any);
    if (!oauthScopes) {
      return next();
    }

    // Check if user has at least one of the required scopes
    const hasScope = requiredScopes.some(scope => oauthScopes.includes(scope));
    if (!hasScope) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `This operation requires one of the following scopes: ${requiredScopes.join(', ')}`,
      });
    }

    return next();
  });
