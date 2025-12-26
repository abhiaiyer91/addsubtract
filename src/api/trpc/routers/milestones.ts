import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  milestoneModel,
  repoModel,
  collaboratorModel,
} from '../../../db/models';

export const milestonesRouter = router({
  /**
   * List milestones for a repository
   */
  list: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        state: z.enum(['open', 'closed']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const milestones = await milestoneModel.listByRepoWithProgress(input.repoId, {
        state: input.state,
        limit: input.limit,
        offset: input.offset,
      });

      const counts = await milestoneModel.getCounts(input.repoId);

      return {
        milestones,
        counts,
      };
    }),

  /**
   * Get a milestone by ID
   */
  get: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const milestone = await milestoneModel.findByIdWithProgress(input.id);

      if (!milestone) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      return milestone;
    }),

  /**
   * Create a new milestone (requires write permission)
   */
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        title: z.string().min(1).max(255),
        description: z.string().max(65535).nullish(),
        dueDate: z.coerce.date().nullish(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);

      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to create milestones in this repository',
        });
      }

      const milestone = await milestoneModel.create({
        repoId: input.repoId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
      });

      return milestone;
    }),

  /**
   * Update a milestone (requires write permission)
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().max(65535).nullish(),
        dueDate: z.coerce.date().nullish(),
        state: z.enum(['open', 'closed']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await milestoneModel.findById(input.id);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      // Check write permission
      const repo = await repoModel.findById(existing.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(existing.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update milestones in this repository',
        });
      }

      const milestone = await milestoneModel.update(input.id, {
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        state: input.state,
      });

      if (!milestone) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      return milestone;
    }),

  /**
   * Close a milestone (requires write permission)
   */
  close: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await milestoneModel.findById(input.id);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      // Check write permission
      const repo = await repoModel.findById(existing.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(existing.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to close milestones in this repository',
        });
      }

      const milestone = await milestoneModel.close(input.id);

      if (!milestone) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      return milestone;
    }),

  /**
   * Reopen a milestone (requires write permission)
   */
  reopen: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await milestoneModel.findById(input.id);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      // Check write permission
      const repo = await repoModel.findById(existing.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(existing.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to reopen milestones in this repository',
        });
      }

      const milestone = await milestoneModel.reopen(input.id);

      if (!milestone) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      return milestone;
    }),

  /**
   * Delete a milestone (requires admin permission)
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await milestoneModel.findById(input.id);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      // Check admin permission
      const repo = await repoModel.findById(existing.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(existing.repoId, ctx.user.id, 'admin');

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete milestones in this repository',
        });
      }

      const deleted = await milestoneModel.delete(input.id);

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      return { success: true };
    }),

  /**
   * List issues in a milestone
   */
  issues: publicProcedure
    .input(
      z.object({
        milestoneId: z.string().uuid(),
        state: z.enum(['open', 'closed']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const milestone = await milestoneModel.findById(input.milestoneId);

      if (!milestone) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      const issues = await milestoneModel.getIssues(input.milestoneId, {
        state: input.state,
        limit: input.limit,
        offset: input.offset,
      });

      return {
        milestone,
        issues,
      };
    }),

  /**
   * List pull requests in a milestone
   */
  pullRequests: publicProcedure
    .input(
      z.object({
        milestoneId: z.string().uuid(),
        state: z.enum(['open', 'closed', 'merged']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const milestone = await milestoneModel.findById(input.milestoneId);

      if (!milestone) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Milestone not found',
        });
      }

      const pullRequests = await milestoneModel.getPullRequests(input.milestoneId, {
        state: input.state,
        limit: input.limit,
        offset: input.offset,
      });

      return {
        milestone,
        pullRequests,
      };
    }),

  /**
   * Assign an issue to a milestone (requires write permission)
   */
  assignIssue: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        milestoneId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // If assigning to a milestone, verify it exists and check permissions
      if (input.milestoneId) {
        const milestone = await milestoneModel.findById(input.milestoneId);

        if (!milestone) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Milestone not found',
          });
        }

        const repo = await repoModel.findById(milestone.repoId);
        const isOwner = repo?.ownerId === ctx.user.id;
        const canWrite = isOwner || (await collaboratorModel.hasPermission(milestone.repoId, ctx.user.id, 'write'));

        if (!canWrite) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to assign issues in this repository',
          });
        }
      }

      const success = await milestoneModel.assignIssue(input.issueId, input.milestoneId);

      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Issue not found',
        });
      }

      return { success: true };
    }),

  /**
   * Assign a pull request to a milestone (requires write permission)
   */
  assignPullRequest: protectedProcedure
    .input(
      z.object({
        pullRequestId: z.string().uuid(),
        milestoneId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // If assigning to a milestone, verify it exists and check permissions
      if (input.milestoneId) {
        const milestone = await milestoneModel.findById(input.milestoneId);

        if (!milestone) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Milestone not found',
          });
        }

        const repo = await repoModel.findById(milestone.repoId);
        const isOwner = repo?.ownerId === ctx.user.id;
        const canWrite = isOwner || (await collaboratorModel.hasPermission(milestone.repoId, ctx.user.id, 'write'));

        if (!canWrite) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to assign pull requests in this repository',
          });
        }
      }

      const success = await milestoneModel.assignPullRequest(input.pullRequestId, input.milestoneId);

      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      return { success: true };
    }),
});

export type MilestonesRouter = typeof milestonesRouter;
