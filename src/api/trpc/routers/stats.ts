/**
 * Stats tRPC Router
 *
 * Provides comprehensive repository statistics through the API.
 * Powers the web dashboard with detailed analytics.
 */

import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { repoStatsModel, repoModel, collaboratorModel } from '../../../db/models';
import type { StatsPeriod } from '../../../db/models/repo-stats';
import { TRPCError } from '@trpc/server';

/**
 * Helper to check if user has access to repository
 */
async function checkRepoAccess(repoId: string, userId: string, ownerId: string, isPrivate: boolean): Promise<boolean> {
  // Owner always has access
  if (ownerId === userId) return true;

  // Public repos are accessible to all
  if (!isPrivate) return true;

  // Check if user is a collaborator
  return collaboratorModel.hasPermission(repoId, userId, 'read');
}

// Period schema
const periodSchema = z
  .union([
    z.enum(['7d', '30d', '90d', '1y', 'all']),
    z.object({
      start: z.date(),
      end: z.date(),
    }),
  ])
  .default('30d');

export const statsRouter = router({
  /**
   * Get comprehensive repository statistics
   */
  getRepoStats: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        period: periodSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      // Find repository
      const repository = await repoModel.findByOwnerAndName(
        input.owner,
        input.repo
      );

      if (!repository) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access
      const hasAccess = await checkRepoAccess(repository.id, ctx.user.id, repository.ownerId, repository.isPrivate);
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      const stats = await repoStatsModel.getStats(
        repository.id,
        input.period as StatsPeriod
      );

      if (!stats) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not generate statistics',
        });
      }

      return stats;
    }),

  /**
   * Get commit frequency data for charts
   */
  getCommitFrequency: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        period: periodSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      const repository = await repoModel.findByOwnerAndName(
        input.owner,
        input.repo
      );

      if (!repository) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const hasAccess = await checkRepoAccess(repository.id, ctx.user.id, repository.ownerId, repository.isPrivate);
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      const { start, end } = parsePeriod(input.period as StatsPeriod);
      return repoStatsModel.getCommitFrequency(repository.id, start, end);
    }),

  /**
   * Get contributor statistics
   */
  getContributors: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        period: periodSchema,
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const repository = await repoModel.findByOwnerAndName(
        input.owner,
        input.repo
      );

      if (!repository) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const hasAccess = await checkRepoAccess(repository.id, ctx.user.id, repository.ownerId, repository.isPrivate);
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      const { start, end } = parsePeriod(input.period as StatsPeriod);
      const contributors = await repoStatsModel.getContributorStats(
        repository.id,
        start,
        end
      );

      return contributors.slice(0, input.limit);
    }),

  /**
   * Get PR metrics
   */
  getPRMetrics: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        period: periodSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      const repository = await repoModel.findByOwnerAndName(
        input.owner,
        input.repo
      );

      if (!repository) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const hasAccess = await checkRepoAccess(repository.id, ctx.user.id, repository.ownerId, repository.isPrivate);
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      const { start, end } = parsePeriod(input.period as StatsPeriod);
      return repoStatsModel.getPRMetrics(repository.id, start, end);
    }),

  /**
   * Get issue metrics
   */
  getIssueMetrics: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        period: periodSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      const repository = await repoModel.findByOwnerAndName(
        input.owner,
        input.repo
      );

      if (!repository) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const hasAccess = await checkRepoAccess(repository.id, ctx.user.id, repository.ownerId, repository.isPrivate);
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      const { start, end } = parsePeriod(input.period as StatsPeriod);
      return repoStatsModel.getIssueMetrics(repository.id, start, end);
    }),

  /**
   * Get hourly activity heatmap data
   */
  getActivityHeatmap: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        period: periodSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      const repository = await repoModel.findByOwnerAndName(
        input.owner,
        input.repo
      );

      if (!repository) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const hasAccess = await checkRepoAccess(repository.id, ctx.user.id, repository.ownerId, repository.isPrivate);
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      const { start, end } = parsePeriod(input.period as StatsPeriod);
      return repoStatsModel.getHourlyActivity(repository.id, start, end);
    }),

  /**
   * Get CI/CD statistics
   */
  getCIStats: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        period: periodSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      const repository = await repoModel.findByOwnerAndName(
        input.owner,
        input.repo
      );

      if (!repository) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const hasAccess = await checkRepoAccess(repository.id, ctx.user.id, repository.ownerId, repository.isPrivate);
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      const { start, end } = parsePeriod(input.period as StatsPeriod);
      return repoStatsModel.getCIStats(repository.id, start, end);
    }),

  /**
   * Get repository health indicators
   */
  getHealthScore: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const repository = await repoModel.findByOwnerAndName(
        input.owner,
        input.repo
      );

      if (!repository) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const hasAccess = await checkRepoAccess(repository.id, ctx.user.id, repository.ownerId, repository.isPrivate);
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      // Get 30-day stats for health calculation
      const stats = await repoStatsModel.getStats(repository.id, '30d');

      if (!stats) {
        return {
          score: 0,
          prResponseTime: 'poor' as const,
          issueResolution: 'poor' as const,
          releaseFrequency: 'dormant' as const,
          communityEngagement: 'low' as const,
        };
      }

      return stats.health;
    }),

  /**
   * Get statistics for multiple repositories at once
   */
  getMultiRepoStats: protectedProcedure
    .input(
      z.object({
        repoIds: z.array(z.string()).max(10),
        period: periodSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify access to all repos
      const accessChecks = await Promise.all(
        input.repoIds.map(async (repoId) => {
          const repo = await repoModel.findById(repoId);
          if (!repo) return false;
          return checkRepoAccess(repoId, ctx.user.id, repo.ownerId, repo.isPrivate);
        })
      );

      const accessibleRepoIds = input.repoIds.filter(
        (_, index) => accessChecks[index]
      );

      const results = await repoStatsModel.getMultiRepoStats(
        accessibleRepoIds,
        input.period as StatsPeriod
      );

      // Convert Map to object for JSON serialization
      const statsObject: Record<string, unknown> = {};
      for (const [repoId, stats] of results) {
        statsObject[repoId] = stats;
      }

      return statsObject;
    }),

  /**
   * Get public repository statistics (no auth required)
   */
  getPublicRepoStats: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        period: periodSchema,
      })
    )
    .query(async ({ input }) => {
      const repository = await repoModel.findByOwnerAndName(
        input.owner,
        input.repo
      );

      if (!repository) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      if (repository.isPrivate) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This repository is private',
        });
      }

      const stats = await repoStatsModel.getStats(
        repository.id,
        input.period as StatsPeriod
      );

      if (!stats) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not generate statistics',
        });
      }

      return stats;
    }),
});

/**
 * Helper to parse period to date range
 */
function parsePeriod(period: StatsPeriod): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (typeof period === 'object' && 'start' in period) {
    return period;
  }

  const start = new Date(now);
  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'all':
      start.setFullYear(2000);
      break;
  }
  start.setHours(0, 0, 0, 0);

  return { start, end };
}
