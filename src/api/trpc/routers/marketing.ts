/**
 * Marketing Content Router
 * 
 * Handles API endpoints for managing AI-generated marketing content
 * from merged PRs and releases.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { marketingContentModel, repoModel } from '../../../db/models';
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
});

export type MarketingRouter = typeof marketingRouter;
