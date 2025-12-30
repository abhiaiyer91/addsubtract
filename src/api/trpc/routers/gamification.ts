/**
 * Gamification Router
 * 
 * tRPC router for XP, levels, achievements, and leaderboards.
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  gamificationModel,
  ACHIEVEMENT_DEFINITIONS,
  getLevelTitle,
  getXpForLevel,
} from '../../../db/models';

export const gamificationRouter = router({
  /**
   * Get current user's gamification profile
   */
  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    
    const gamification = await gamificationModel.getOrCreateUserGamification(userId);
    const title = getLevelTitle(gamification.level);
    
    // Calculate progress to next level
    const currentLevelXp = getXpForLevel(gamification.level);
    const nextLevelXp = getXpForLevel(gamification.level + 1);
    const xpProgress = ((gamification.totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
    
    const rank = await gamificationModel.getUserRank(userId);
    
    return {
      ...gamification,
      title,
      xpProgress: Math.min(100, Math.max(0, xpProgress)),
      xpForNextLevel: nextLevelXp,
      rank,
    };
  }),

  /**
   * Get a user's gamification profile by username
   */
  getProfile: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      
      // Get user by username
      const { userModel } = await import('../../../db/models');
      const user = await userModel.findByUsername(input.username);
      
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      
      const gamification = await gamificationModel.getOrCreateUserGamification(user.id);
      const title = getLevelTitle(gamification.level);
      
      // Calculate progress to next level
      const currentLevelXp = getXpForLevel(gamification.level);
      const nextLevelXp = getXpForLevel(gamification.level + 1);
      const xpProgress = ((gamification.totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
      
      const rank = await gamificationModel.getUserRank(user.id);
      
      return {
        userId: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
        level: gamification.level,
        totalXp: gamification.totalXp,
        title,
        xpProgress: Math.min(100, Math.max(0, xpProgress)),
        xpForNextLevel: nextLevelXp,
        currentStreak: gamification.currentStreak,
        longestStreak: gamification.longestStreak,
        rank,
        stats: {
          commits: gamification.totalCommits,
          prsOpened: gamification.totalPrsOpened,
          prsMerged: gamification.totalPrsMerged,
          reviews: gamification.totalReviews,
          issuesOpened: gamification.totalIssuesOpened,
          issuesClosed: gamification.totalIssuesClosed,
          comments: gamification.totalComments,
        },
      };
    }),

  /**
   * Get current user's achievements
   */
  myAchievements: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    return gamificationModel.getAllAchievementsForUser(userId);
  }),

  /**
   * Get a user's achievements by username
   */
  getAchievements: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const { userModel } = await import('../../../db/models');
      const user = await userModel.findByUsername(input.username);
      
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      
      return gamificationModel.getAllAchievementsForUser(user.id);
    }),

  /**
   * Get all achievement definitions
   */
  achievementDefinitions: publicProcedure.query(async () => {
    return ACHIEVEMENT_DEFINITIONS;
  }),

  /**
   * Get leaderboard
   */
  leaderboard: publicProcedure
    .input(z.object({
      timeframe: z.enum(['all', 'month', 'week']).optional().default('all'),
      limit: z.number().min(1).max(100).optional().default(50),
    }))
    .query(async ({ input }) => {
      return gamificationModel.getLeaderboard(input.limit, input.timeframe);
    }),

  /**
   * Get current user's XP history
   */
  myXpHistory: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(365).optional().default(30),
    }))
    .query(async ({ ctx, input }) => {
      return gamificationModel.getXpHistory(ctx.user.id, input.days);
    }),

  /**
   * Get current user's recent XP events
   */
  myRecentXp: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const profile = await gamificationModel.getUserProfile(ctx.user.id);
      return profile.recentXp.slice(0, input.limit);
    }),

  /**
   * Get achievement categories with counts
   */
  achievementCategories: protectedProcedure.query(async ({ ctx }) => {
    const achievements = await gamificationModel.getAllAchievementsForUser(ctx.user.id);
    
    const categories: Record<string, { total: number; unlocked: number }> = {};
    
    for (const a of achievements) {
      const cat = a.achievement.category;
      if (!categories[cat]) {
        categories[cat] = { total: 0, unlocked: 0 };
      }
      categories[cat].total++;
      if (a.unlocked) {
        categories[cat].unlocked++;
      }
    }
    
    return categories;
  }),
});
