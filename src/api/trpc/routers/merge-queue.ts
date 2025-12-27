/**
 * Merge Queue API Router
 * 
 * Provides endpoints for managing the merge queue:
 * - Add/remove PRs from queue
 * - Configure merge queue settings
 * - View queue status
 * - Manually trigger processing
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  mergeQueueConfigModel,
  mergeQueueEntryModel,
  mergeQueueBatchModel,
  mergeQueueHistoryModel,
  mergeQueueStats,
} from '../../../db/models/merge-queue';
import { prModel, repoModel, collaboratorModel } from '../../../db/models';
import { createMergeQueueManager } from '../../../core/merge-queue';
import { eventBus } from '../../../events';

// ============ SCHEMAS ============

const mergeQueueStrategySchema = z.enum(['sequential', 'optimistic', 'adaptive']);

const configInputSchema = z.object({
  repoId: z.string().uuid(),
  targetBranch: z.string().min(1),
  enabled: z.boolean().optional(),
  strategy: mergeQueueStrategySchema.optional(),
  maxBatchSize: z.number().int().min(1).max(20).optional(),
  minWaitSeconds: z.number().int().min(0).max(3600).optional(),
  requiredChecks: z.array(z.string()).optional(),
  requireAllChecks: z.boolean().optional(),
  autoRebase: z.boolean().optional(),
  deleteBranchAfterMerge: z.boolean().optional(),
});

// ============ ROUTER ============

export const mergeQueueRouter = router({
  /**
   * Get merge queue configuration for a branch
   */
  getConfig: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      targetBranch: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const config = await mergeQueueConfigModel.get(input.repoId, input.targetBranch);
      if (!config) {
        // Return default config
        return {
          enabled: false,
          strategy: 'adaptive' as const,
          maxBatchSize: 5,
          minWaitSeconds: 60,
          requiredChecks: [],
          requireAllChecks: false,
          autoRebase: true,
          deleteBranchAfterMerge: true,
        };
      }
      return {
        ...config,
        requiredChecks: config.requiredChecks ? JSON.parse(config.requiredChecks) : [],
      };
    }),

  /**
   * Update merge queue configuration
   */
  updateConfig: protectedProcedure
    .input(configInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Check user has admin access to the repo
      const hasAccess = await collaboratorModel.hasPermission(
        input.repoId,
        ctx.user.id,
        'admin'
      );
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin access required to configure merge queue',
        });
      }

      const config = await mergeQueueConfigModel.upsert({
        repoId: input.repoId,
        targetBranch: input.targetBranch,
        enabled: input.enabled ?? true,
        strategy: input.strategy ?? 'adaptive',
        maxBatchSize: input.maxBatchSize ?? 5,
        minWaitSeconds: input.minWaitSeconds ?? 60,
        requiredChecks: input.requiredChecks ? JSON.stringify(input.requiredChecks) : null,
        requireAllChecks: input.requireAllChecks ?? false,
        autoRebase: input.autoRebase ?? true,
        deleteBranchAfterMerge: input.deleteBranchAfterMerge ?? true,
      });

      return config;
    }),

  /**
   * List all configs for a repository
   */
  listConfigs: publicProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input }) => {
      const configs = await mergeQueueConfigModel.listByRepo(input.repoId);
      return configs.map(c => ({
        ...c,
        requiredChecks: c.requiredChecks ? JSON.parse(c.requiredChecks) : [],
      }));
    }),

  /**
   * Add a PR to the merge queue
   */
  addToQueue: protectedProcedure
    .input(z.object({
      prId: z.string().uuid(),
      priority: z.number().int().min(0).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get PR
      const pr = await prModel.findById(input.prId);
      if (!pr) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pull request not found' });
      }

      // Check PR is open
      if (pr.state !== 'open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only open PRs can be added to the merge queue',
        });
      }

      // Check user has write access
      const hasAccess = await collaboratorModel.hasPermission(
        pr.repoId,
        ctx.user.id,
        'write'
      );
      if (!hasAccess && pr.authorId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to add this PR to the merge queue',
        });
      }

      // Check merge queue is enabled
      const config = await mergeQueueConfigModel.get(pr.repoId, pr.targetBranch);
      if (!config?.enabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Merge queue is not enabled for this branch',
        });
      }

      // Check if already in queue
      if (await mergeQueueEntryModel.isInQueue(pr.id)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'PR is already in the merge queue',
        });
      }

      // Get repo for disk path
      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Repository not found' });
      }

      // Analyze the PR for conflict detection
      const manager = createMergeQueueManager(repo.diskPath, pr.targetBranch);
      const analysis = await manager.analyzePR(pr.headSha, pr.baseSha);
      
      // Add to queue
      const entry = await mergeQueueEntryModel.add({
        prId: pr.id,
        repoId: pr.repoId,
        targetBranch: pr.targetBranch,
        state: 'pending',
        priority: input.priority ?? 0,
        addedById: ctx.user.id,
        headSha: pr.headSha,
        baseSha: pr.baseSha,
        touchedFiles: JSON.stringify(analysis.files.map(f => f.path)),
      });

      // Emit event
      eventBus.emit({
        id: crypto.randomUUID(),
        type: 'merge_queue.added' as any,
        timestamp: new Date(),
        actorId: ctx.user.id,
        payload: {
          prId: pr.id,
          prNumber: pr.number,
          repoId: pr.repoId,
          position: entry.position,
        },
      });

      return {
        entryId: entry.id,
        position: entry.position,
        message: `PR #${pr.number} added to merge queue at position ${entry.position + 1}`,
      };
    }),

  /**
   * Remove a PR from the merge queue
   */
  removeFromQueue: protectedProcedure
    .input(z.object({ prId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await mergeQueueEntryModel.findByPrId(input.prId);
      if (!entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'PR is not in the merge queue',
        });
      }

      // Check user has permission
      const pr = await prModel.findById(input.prId);
      if (!pr) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pull request not found' });
      }

      const hasAccess = await collaboratorModel.hasPermission(
        pr.repoId,
        ctx.user.id,
        'write'
      );
      if (!hasAccess && pr.authorId !== ctx.user.id && entry.addedById !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to remove this PR from the queue',
        });
      }

      await mergeQueueEntryModel.remove(input.prId, ctx.user.id);

      return { success: true, message: `PR #${pr.number} removed from merge queue` };
    }),

  /**
   * Get queue status for a PR
   */
  getQueuePosition: publicProcedure
    .input(z.object({ prId: z.string().uuid() }))
    .query(async ({ input }) => {
      const position = await mergeQueueEntryModel.getPosition(input.prId);
      if (!position) {
        return { inQueue: false as const };
      }
      return {
        inQueue: true as const,
        ...position,
      };
    }),

  /**
   * List entries in the merge queue for a branch
   */
  listQueue: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      targetBranch: z.string().min(1),
      includeCompleted: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ input }) => {
      const entries = await mergeQueueEntryModel.listByBranch(
        input.repoId,
        input.targetBranch,
        {
          includeCompleted: input.includeCompleted,
          limit: input.limit,
        }
      );

      return entries.map(entry => ({
        id: entry.id,
        position: entry.position,
        state: entry.state,
        priority: entry.priority,
        createdAt: entry.createdAt,
        startedAt: entry.startedAt,
        completedAt: entry.completedAt,
        errorMessage: entry.errorMessage,
        retryCount: entry.retryCount,
        pr: {
          id: entry.pr.id,
          number: entry.pr.number,
          title: entry.pr.title,
          sourceBranch: entry.pr.sourceBranch,
          authorId: entry.pr.authorId,
        },
      }));
    }),

  /**
   * Get queue statistics
   */
  getStats: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      targetBranch: z.string().min(1),
    }))
    .query(async ({ input }) => {
      return mergeQueueStats.getStats(input.repoId, input.targetBranch);
    }),

  /**
   * Get merge queue history for a PR
   */
  getHistory: publicProcedure
    .input(z.object({ prId: z.string().uuid() }))
    .query(async ({ input }) => {
      return mergeQueueHistoryModel.getByPr(input.prId);
    }),

  /**
   * Get recent history for a repository
   */
  getRecentHistory: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ input }) => {
      return mergeQueueHistoryModel.getRecentByRepo(input.repoId, input.limit);
    }),

  /**
   * Retry a failed merge queue entry
   */
  retry: protectedProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await mergeQueueEntryModel.findById(input.entryId);
      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      if (entry.state !== 'failed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only failed entries can be retried',
        });
      }

      // Check permission
      const hasAccess = await collaboratorModel.hasPermission(
        entry.repoId,
        ctx.user.id,
        'write'
      );
      if (!hasAccess) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Write access required' });
      }

      const retryCount = await mergeQueueEntryModel.incrementRetry(input.entryId);

      return {
        success: true,
        retryCount,
        message: `Entry queued for retry (attempt ${retryCount})`,
      };
    }),

  /**
   * Update priority of a queue entry
   */
  updatePriority: protectedProcedure
    .input(z.object({
      entryId: z.string().uuid(),
      priority: z.number().int().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const entry = await mergeQueueEntryModel.findById(input.entryId);
      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      // Check permission (admin only for priority changes)
      const hasAccess = await collaboratorModel.hasPermission(
        entry.repoId,
        ctx.user.id,
        'admin'
      );
      if (!hasAccess) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      // Update via direct query since we don't have a dedicated method
      const { getDb } = await import('../../../db');
      const { mergeQueueEntries } = await import('../../../db/schema');
      const { eq } = await import('drizzle-orm');
      
      const db = getDb();
      await db
        .update(mergeQueueEntries)
        .set({ priority: input.priority, updatedAt: new Date() })
        .where(eq(mergeQueueEntries.id, input.entryId));

      // Log history
      await mergeQueueHistoryModel.log({
        prId: entry.prId,
        repoId: entry.repoId,
        action: 'priority_changed',
        actorId: ctx.user.id,
        metadata: JSON.stringify({ oldPriority: entry.priority, newPriority: input.priority }),
      });

      return { success: true };
    }),

  /**
   * Get active batch for a branch
   */
  getActiveBatch: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      targetBranch: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const batch = await mergeQueueBatchModel.getActiveBatch(
        input.repoId,
        input.targetBranch
      );
      if (!batch) return null;

      return {
        ...batch,
        prOrder: JSON.parse(batch.prOrder),
        commitGraph: batch.commitGraph ? JSON.parse(batch.commitGraph) : null,
      };
    }),

  /**
   * List recent batches
   */
  listBatches: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      targetBranch: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
    }))
    .query(async ({ input }) => {
      const batches = await mergeQueueBatchModel.listRecent(
        input.repoId,
        input.targetBranch,
        input.limit
      );

      return batches.map(batch => ({
        ...batch,
        prOrder: JSON.parse(batch.prOrder),
        commitGraph: batch.commitGraph ? JSON.parse(batch.commitGraph) : null,
      }));
    }),

  /**
   * Manually trigger queue processing (admin only)
   */
  triggerProcessing: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      targetBranch: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check admin access
      const hasAccess = await collaboratorModel.hasPermission(
        input.repoId,
        ctx.user.id,
        'admin'
      );
      if (!hasAccess) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      // Emit event to trigger processing
      eventBus.emit({
        id: crypto.randomUUID(),
        type: 'merge_queue.process' as any,
        timestamp: new Date(),
        actorId: ctx.user.id,
        payload: {
          repoId: input.repoId,
          targetBranch: input.targetBranch,
        },
      });

      return { success: true, message: 'Queue processing triggered' };
    }),
});
