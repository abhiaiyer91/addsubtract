import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { collaboratorModel, repoModel } from '../../../db/models';

/**
 * Check if user has required permission on a repository
 */
async function assertRepoPermission(
  userId: string,
  repoId: string,
  requiredPermission: 'read' | 'write' | 'admin'
): Promise<void> {
  const repo = await repoModel.findById(repoId);
  if (!repo) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }

  if (repo.ownerId === userId) {
    return;
  }

  const hasPermission = await collaboratorModel.hasPermission(
    repoId,
    userId,
    requiredPermission
  );

  if (!hasPermission) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `${requiredPermission} permission required`,
    });
  }
}

export const collaboratorsRouter = router({
  /**
   * List collaborators for a repository
   */
  list: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'read');
      return collaboratorModel.listByRepo(input.repoId);
    }),

  /**
   * Add a collaborator
   */
  add: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        userId: z.string(),
        permission: z.enum(['read', 'write', 'admin']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      const existing = await collaboratorModel.find(input.repoId, input.userId);
      if (existing) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User is already a collaborator',
        });
      }

      return collaboratorModel.add({
        repoId: input.repoId,
        userId: input.userId,
        permission: input.permission,
      });
    }),

  /**
   * Update collaborator permission
   */
  updatePermission: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        userId: z.string(),
        permission: z.enum(['read', 'write', 'admin']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      const collab = await collaboratorModel.updatePermission(
        input.repoId,
        input.userId,
        input.permission
      );

      if (!collab) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collaborator not found',
        });
      }

      return collab;
    }),

  /**
   * Remove a collaborator
   */
  remove: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      const removed = await collaboratorModel.remove(input.repoId, input.userId);
      if (!removed) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collaborator not found',
        });
      }

      return { success: true };
    }),

  /**
   * Check user permission on a repository
   */
  checkPermission: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        permission: z.enum(['read', 'write', 'admin']),
      })
    )
    .query(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        return { hasPermission: false };
      }

      if (repo.ownerId === ctx.user.id) {
        return { hasPermission: true };
      }

      const hasPermission = await collaboratorModel.hasPermission(
        input.repoId,
        ctx.user.id,
        input.permission
      );

      return { hasPermission };
    }),
});
