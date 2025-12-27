import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { activityModel } from '../../../db/models';

export const activityRouter = router({
  /**
   * Get activity feed for a repository
   */
  forRepo: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return activityModel.listByRepo(input.repoId, input.limit, input.offset);
    }),

  /**
   * Get activity feed for a user
   */
  forUser: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return activityModel.listByUser(input.userId, input.limit, input.offset);
    }),

  /**
   * Get personalized feed for current user (activities from watched repos)
   */
  feed: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      return activityModel.getFeed(ctx.user.id, input.limit, input.offset);
    }),

  /**
   * Get public feed (all public repo activities)
   */
  publicFeed: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return activityModel.getPublicFeed(input.limit, input.offset);
    }),

  /**
   * Get a single activity by ID
   */
  get: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const activity = await activityModel.findById(input.id);
      return activity ?? null;
    }),
});
