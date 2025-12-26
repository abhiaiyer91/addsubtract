import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc';
import { repoModel, collaboratorModel, orgMemberModel } from '../../../db/models';

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
 * Middleware to check if user has permission on a repository
 * Requires repoId in input
 */
export const withRepoPermission = (requiredPermission: 'read' | 'write' | 'admin') =>
  middleware(async ({ ctx, next, getRawInput }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const rawInput = await getRawInput();
    const input = rawInput as { repoId?: string };
    if (!input.repoId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'repoId is required' });
    }

    const repo = await repoModel.findById(input.repoId);
    if (!repo) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Repository not found' });
    }

    // Owner always has full access
    if (repo.ownerId === ctx.user.id) {
      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
          repo,
        },
      });
    }

    // Check collaborator permission
    const hasPermission = await collaboratorModel.hasPermission(
      input.repoId,
      ctx.user.id,
      requiredPermission
    );

    if (!hasPermission) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        repo,
      },
    });
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
 * Middleware to check if user has a role in an organization
 */
export const withOrgRole = (requiredRole: 'member' | 'admin' | 'owner') =>
  middleware(async ({ ctx, next, getRawInput }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const rawInput = await getRawInput();
    const input = rawInput as { orgId?: string };
    if (!input.orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'orgId is required' });
    }

    const hasRole = await orgMemberModel.hasRole(input.orgId, ctx.user.id, requiredRole);
    if (!hasRole) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });

/**
 * Middleware to check if user is an org admin
 */
export const isOrgAdmin = withOrgRole('admin');

/**
 * Middleware to check if user is an org owner
 */
export const isOrgOwner = withOrgRole('owner');
