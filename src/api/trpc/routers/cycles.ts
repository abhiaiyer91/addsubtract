import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  cycleModel,
  repoModel,
  collaboratorModel,
} from '../../../db/models';

export const cyclesRouter = router({
  /**
   * List cycles for a repository
   */
  list: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        filter: z.enum(['past', 'current', 'upcoming', 'all']).default('all'),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return cycleModel.listByRepo(input.repoId, {
        filter: input.filter,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get a cycle by ID
   */
  get: publicProcedure
    .input(
      z.object({
        cycleId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const cycle = await cycleModel.findById(input.cycleId);

      if (!cycle) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Cycle not found',
        });
      }

      return cycle;
    }),

  /**
   * Get a cycle by number
   */
  getByNumber: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        number: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      const cycle = await cycleModel.findByNumber(input.repoId, input.number);

      if (!cycle) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Cycle not found',
        });
      }

      return cycle;
    }),

  /**
   * Get the current active cycle
   */
  getCurrent: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return cycleModel.getCurrent(input.repoId);
    }),

  /**
   * Get the next upcoming cycle
   */
  getUpcoming: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return cycleModel.getUpcoming(input.repoId);
    }),

  /**
   * Create a new cycle
   */
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string().min(1, 'Name is required').max(100),
        description: z.string().max(1000).optional(),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
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
          message: 'You do not have permission to create cycles',
        });
      }

      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);

      // Validate dates
      if (startDate >= endDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'End date must be after start date',
        });
      }

      return cycleModel.create({
        repoId: input.repoId,
        name: input.name,
        description: input.description,
        startDate,
        endDate,
      });
    }),

  /**
   * Update a cycle
   */
  update: protectedProcedure
    .input(
      z.object({
        cycleId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(1000).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cycle = await cycleModel.findById(input.cycleId);

      if (!cycle) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Cycle not found',
        });
      }

      const repo = await repoModel.findById(cycle.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(cycle.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this cycle',
        });
      }

      const updates: any = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.startDate !== undefined) updates.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) updates.endDate = new Date(input.endDate);

      // Validate dates if both are being updated
      const newStartDate = updates.startDate || cycle.startDate;
      const newEndDate = updates.endDate || cycle.endDate;
      if (newStartDate >= newEndDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'End date must be after start date',
        });
      }

      return cycleModel.update(input.cycleId, updates);
    }),

  /**
   * Delete a cycle
   */
  delete: protectedProcedure
    .input(
      z.object({
        cycleId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cycle = await cycleModel.findById(input.cycleId);

      if (!cycle) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Cycle not found',
        });
      }

      const repo = await repoModel.findById(cycle.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(cycle.repoId, ctx.user.id, 'admin');

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this cycle',
        });
      }

      return cycleModel.delete(input.cycleId);
    }),

  /**
   * Get cycle progress
   */
  getProgress: publicProcedure
    .input(
      z.object({
        cycleId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return cycleModel.getProgress(input.cycleId);
    }),

  /**
   * Get issues in a cycle
   */
  getIssues: publicProcedure
    .input(
      z.object({
        cycleId: z.string().uuid(),
        state: z.enum(['open', 'closed']).optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      return cycleModel.getIssues(input.cycleId, {
        state: input.state,
        limit: input.limit,
      });
    }),

  /**
   * Add an issue to a cycle
   */
  addIssue: protectedProcedure
    .input(
      z.object({
        cycleId: z.string().uuid(),
        issueId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cycle = await cycleModel.findById(input.cycleId);

      if (!cycle) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Cycle not found',
        });
      }

      const repo = await repoModel.findById(cycle.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(cycle.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this cycle',
        });
      }

      await cycleModel.addIssue(input.cycleId, input.issueId);
      return { success: true };
    }),

  /**
   * Remove an issue from a cycle
   */
  removeIssue: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Import issueModel to check the issue
      const { issueModel } = await import('../../../db/models');
      const issue = await issueModel.findById(input.issueId);

      if (!issue) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Issue not found',
        });
      }

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      await cycleModel.removeIssue(input.issueId);
      return { success: true };
    }),

  /**
   * Get unfinished issues from a cycle
   */
  getUnfinishedIssues: publicProcedure
    .input(
      z.object({
        cycleId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return cycleModel.getUnfinishedIssues(input.cycleId);
    }),

  /**
   * Move unfinished issues to the next cycle
   */
  moveUnfinishedToNextCycle: protectedProcedure
    .input(
      z.object({
        cycleId: z.string().uuid(),
        nextCycleId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cycle = await cycleModel.findById(input.cycleId);

      if (!cycle) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Cycle not found',
        });
      }

      const nextCycle = await cycleModel.findById(input.nextCycleId);
      if (!nextCycle) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Next cycle not found',
        });
      }

      // Ensure both cycles are in the same repo
      if (cycle.repoId !== nextCycle.repoId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Both cycles must be in the same repository',
        });
      }

      const repo = await repoModel.findById(cycle.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(cycle.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update cycles',
        });
      }

      const movedCount = await cycleModel.moveUnfinishedToNextCycle(
        input.cycleId,
        input.nextCycleId
      );

      return { movedCount };
    }),

  /**
   * Get velocity (average completed estimates) over recent cycles
   */
  getVelocity: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        cycleCount: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ input }) => {
      return cycleModel.getVelocity(input.repoId, input.cycleCount);
    }),
});
