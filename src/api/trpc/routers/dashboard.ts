/**
 * Dashboard Router
 *
 * Provides comprehensive dashboard data for users including:
 * - Inbox summary (PRs, Issues)
 * - Contribution stats and calendar
 * - Repository list
 * - Activity feed
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  userStatsModel,
  inboxModel,
  issueInboxModel,
  activityModel,
} from '../../../db/models';

export const dashboardRouter = router({
  /**
   * Get complete dashboard data in a single call
   * This is optimized for initial dashboard load
   */
  getData: protectedProcedure
    .input(
      z
        .object({
          includeCalendar: z.boolean().default(false),
          repoLimit: z.number().min(1).max(50).default(10),
          activityLimit: z.number().min(1).max(50).default(15),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const { includeCalendar = false, repoLimit = 10, activityLimit = 15 } =
        input ?? {};

      // Fetch all dashboard data in parallel
      const [summary, repos, activity, prInbox, issueInbox] = await Promise.all(
        [
          userStatsModel.getDashboardSummary(ctx.user.id),
          userStatsModel.getUserRepositories(ctx.user.id, repoLimit),
          userStatsModel.getActivityFeed(ctx.user.id, activityLimit),
          inboxModel.getSummary(ctx.user.id),
          issueInboxModel.getSummary(ctx.user.id),
        ]
      );

      // Optionally include contribution calendar (more expensive query)
      let contributionStats = null;
      if (includeCalendar) {
        contributionStats = await userStatsModel.getContributionStats(
          ctx.user.id
        );
      }

      return {
        summary: {
          ...summary,
          // Merge PR and Issue inbox counts
          inbox: {
            prsAwaitingReview: prInbox.awaitingReview,
            myOpenPrs: prInbox.myPrsOpen,
            prsParticipated: prInbox.participated,
            issuesAssigned: issueInbox.assignedToMe,
            issuesCreated: issueInbox.createdByMe,
            issuesParticipated: issueInbox.participated,
          },
        },
        repos,
        activity,
        contributionStats,
      };
    }),

  /**
   * Get dashboard summary with inbox counts
   */
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const [dashboardSummary, prInbox, issueInbox] = await Promise.all([
      userStatsModel.getDashboardSummary(ctx.user.id),
      inboxModel.getSummary(ctx.user.id),
      issueInboxModel.getSummary(ctx.user.id),
    ]);

    return {
      ...dashboardSummary,
      inbox: {
        prsAwaitingReview: prInbox.awaitingReview,
        myOpenPrs: prInbox.myPrsOpen,
        prsParticipated: prInbox.participated,
        issuesAssigned: issueInbox.assignedToMe,
        issuesCreated: issueInbox.createdByMe,
        issuesParticipated: issueInbox.participated,
      },
    };
  }),

  /**
   * Get user contribution statistics
   */
  getContributionStats: protectedProcedure
    .input(
      z
        .object({
          year: z.number().min(2000).max(2100).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      return userStatsModel.getContributionStats(ctx.user.id, input?.year);
    }),

  /**
   * Get user's repositories for dashboard
   */
  getRepositories: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(20),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const { limit = 20 } = input ?? {};
      return userStatsModel.getUserRepositories(ctx.user.id, limit);
    }),

  /**
   * Get user's activity feed
   */
  getActivityFeed: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(30),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const { limit = 30 } = input ?? {};
      return userStatsModel.getActivityFeed(ctx.user.id, limit);
    }),

  /**
   * Get PRs awaiting review (inbox section)
   */
  getPrsAwaitingReview: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(10),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const { limit = 10, offset = 0 } = input ?? {};
      return inboxModel.getAwaitingReview(ctx.user.id, { limit, offset });
    }),

  /**
   * Get user's open PRs (inbox section)
   */
  getMyOpenPrs: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(10),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const { limit = 10, offset = 0 } = input ?? {};
      return inboxModel.getMyPrsAwaitingReview(ctx.user.id, { limit, offset });
    }),

  /**
   * Get issues assigned to user
   */
  getAssignedIssues: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(10),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const { limit = 10, offset = 0 } = input ?? {};
      return issueInboxModel.getAssignedToMe(ctx.user.id, { limit, offset });
    }),

  /**
   * Get global feed (activities from watched repos)
   */
  getFeed: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(30),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const { limit = 30, offset = 0 } = input ?? {};
      return activityModel.getFeed(ctx.user.id, limit, offset);
    }),
});
