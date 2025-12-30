/**
 * Marketing Content Router
 * 
 * Handles API endpoints for managing AI-generated marketing content
 * from merged PRs and releases.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { marketingContentModel, repoModel, marketingAgentConfigModel, repoAiKeyModel } from '../../../db/models';
import { triggerMarketingContent } from '../../../events';

export const marketingRouter = router({
  /**
   * List marketing content for a repository
   */
  list: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        status: z.enum(['pending', 'approved', 'posted', 'rejected']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const content = await marketingContentModel.listByRepo(input.repoId, {
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });

      return content;
    }),

  /**
   * Get a single content item by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const content = await marketingContentModel.findById(input.id);
      if (!content) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Content not found',
        });
      }
      return content;
    }),

  /**
   * Update content status (approve, reject, mark as posted)
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['pending', 'approved', 'posted', 'rejected']),
        postedUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const content = await marketingContentModel.updateStatus(
        input.id,
        input.status,
        input.postedUrl
      );

      if (!content) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Content not found',
        });
      }

      return content;
    }),

  /**
   * Edit the tweet/thread content
   */
  updateContent: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        tweet: z.string().max(280).optional(),
        thread: z.array(z.string().max(280)).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const content = await marketingContentModel.updateContent(id, data);

      if (!content) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Content not found',
        });
      }

      return content;
    }),

  /**
   * Delete content
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const deleted = await marketingContentModel.delete(input.id);
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Content not found',
        });
      }
      return { success: true };
    }),

  /**
   * Get pending content count for a repo
   */
  pendingCount: protectedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input }) => {
      const count = await marketingContentModel.getPendingCount(input.repoId);
      return { count };
    }),

  /**
   * Manually regenerate content for a PR or release
   */
  regenerate: protectedProcedure
    .input(
      z.object({
        type: z.enum(['pr_merged', 'release_published']),
        sourceId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await triggerMarketingContent(input.type, input.sourceId);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to generate content',
        });
      }

      return result;
    }),

  /**
   * Get marketing agent configuration for a repository
   */
  getConfig: protectedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check if user has access
      const isOwner = repo.ownerId === ctx.user.id;
      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the repository owner can view agent settings',
        });
      }

      const config = await marketingAgentConfigModel.findByRepoId(input.repoId);
      const aiAvailability = await repoAiKeyModel.checkAvailability(input.repoId);

      return {
        config: config ? {
          id: config.id,
          enabled: config.enabled,
          prompt: config.prompt,
          generateOnPrMerge: config.generateOnPrMerge,
          generateOnRelease: config.generateOnRelease,
          updatedAt: config.updatedAt,
        } : null,
        aiAvailable: aiAvailability.available,
      };
    }),

  /**
   * Enable or disable the marketing agent
   */
  setEnabled: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        enabled: z.boolean(),
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

      // Only owner can manage
      if (repo.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the repository owner can manage the marketing agent',
        });
      }

      // Check AI availability before enabling
      if (input.enabled) {
        const aiAvailability = await repoAiKeyModel.checkAvailability(input.repoId);
        if (!aiAvailability.available) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'AI API keys must be configured before enabling the marketing agent',
          });
        }
      }

      const config = await marketingAgentConfigModel.setEnabled(
        input.repoId,
        input.enabled,
        ctx.user.id
      );

      return { enabled: config.enabled };
    }),

  /**
   * Update marketing agent configuration
   */
  updateConfig: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        prompt: z.string().nullable().optional(),
        generateOnPrMerge: z.boolean().optional(),
        generateOnRelease: z.boolean().optional(),
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

      // Only owner can manage
      if (repo.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the repository owner can manage the marketing agent',
        });
      }

      const { repoId, ...data } = input;
      const updateData: Record<string, unknown> = { updatedById: ctx.user.id };
      
      if (data.prompt !== undefined) updateData.prompt = data.prompt;
      if (data.generateOnPrMerge !== undefined) updateData.generateOnPrMerge = data.generateOnPrMerge;
      if (data.generateOnRelease !== undefined) updateData.generateOnRelease = data.generateOnRelease;

      const config = await marketingAgentConfigModel.upsert(repoId, updateData as any);

      return {
        id: config.id,
        enabled: config.enabled,
        prompt: config.prompt,
        generateOnPrMerge: config.generateOnPrMerge,
        generateOnRelease: config.generateOnRelease,
        updatedAt: config.updatedAt,
      };
    }),
});

export type MarketingRouter = typeof marketingRouter;
