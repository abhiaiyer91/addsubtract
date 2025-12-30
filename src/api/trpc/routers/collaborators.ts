import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { collaboratorModel, repoModel } from '../../../db/models';
import { getGlobalEmailService } from '../../../core/email';
import { getDb } from '../../../db';
import { user } from '../../../db/auth-schema';
import { eq } from 'drizzle-orm';

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

      const collab = await collaboratorModel.add({
        repoId: input.repoId,
        userId: input.userId,
        permission: input.permission,
      });

      // Send email notification to the new collaborator
      const emailService = getGlobalEmailService();
      if (emailService.isConfigured()) {
        try {
          const db = getDb();
          const [collaboratorUser] = await db.select().from(user).where(eq(user.id, input.userId)).limit(1);
          const [inviterUser] = await db.select().from(user).where(eq(user.id, ctx.user.id)).limit(1);
          const repo = await repoModel.findById(input.repoId);
          
          if (collaboratorUser && repo) {
            const roleText = input.permission === 'admin' ? 'Administrator' : 
                           input.permission === 'write' ? 'Contributor' : 'Viewer';
            
            await emailService.sendNotificationEmail({
              email: collaboratorUser.email,
              name: collaboratorUser.name || undefined,
              notifications: [{
                type: 'collaborator_added',
                title: `You've been added as a collaborator`,
                body: `You now have ${roleText} access to ${repo.name}`,
                url: `/${repo.ownerId}/${repo.name}`,
                actorName: inviterUser?.name || inviterUser?.username || undefined,
              }],
            });
          }
        } catch (error) {
          console.error('[Collaborators] Failed to send collaborator invitation email:', error);
        }
      }

      return collab;
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

      // Get old permission for notification
      const oldCollab = await collaboratorModel.find(input.repoId, input.userId);

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

      // Send role change email notification
      const emailService = getGlobalEmailService();
      if (emailService.isConfigured() && oldCollab && oldCollab.permission !== input.permission) {
        try {
          const db = getDb();
          const [collaboratorUser] = await db.select().from(user).where(eq(user.id, input.userId)).limit(1);
          const [changedByUser] = await db.select().from(user).where(eq(user.id, ctx.user.id)).limit(1);
          const repo = await repoModel.findById(input.repoId);
          
          if (collaboratorUser && repo) {
            const oldRole = oldCollab.permission === 'admin' ? 'Administrator' : 
                           oldCollab.permission === 'write' ? 'Contributor' : 'Viewer';
            const newRole = input.permission === 'admin' ? 'Administrator' : 
                           input.permission === 'write' ? 'Contributor' : 'Viewer';
            
            await emailService.sendNotificationEmail({
              email: collaboratorUser.email,
              name: collaboratorUser.name || undefined,
              notifications: [{
                type: 'role_changed',
                title: `Your role has been updated`,
                body: `Your role in ${repo.name} changed from ${oldRole} to ${newRole}`,
                url: `/${repo.ownerId}/${repo.name}`,
                actorName: changedByUser?.name || changedByUser?.username || undefined,
              }],
            });
          }
        } catch (error) {
          console.error('[Collaborators] Failed to send role change email:', error);
        }
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

      // Get user info before removal for notification
      const db = getDb();
      const [collaboratorUser] = await db.select().from(user).where(eq(user.id, input.userId)).limit(1);
      const [removedByUser] = await db.select().from(user).where(eq(user.id, ctx.user.id)).limit(1);
      const repo = await repoModel.findById(input.repoId);

      const removed = await collaboratorModel.remove(input.repoId, input.userId);
      if (!removed) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collaborator not found',
        });
      }

      // Send removal email notification
      const emailService = getGlobalEmailService();
      if (emailService.isConfigured() && collaboratorUser && repo) {
        try {
          await emailService.sendNotificationEmail({
            email: collaboratorUser.email,
            name: collaboratorUser.name || undefined,
            notifications: [{
              type: 'collaborator_removed',
              title: `You've been removed from a repository`,
              body: `Your access to ${repo.name} has been revoked`,
              actorName: removedByUser?.name || removedByUser?.username || undefined,
            }],
          });
        } catch (error) {
          console.error('[Collaborators] Failed to send removal email:', error);
        }
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
