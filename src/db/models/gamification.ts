/**
 * Gamification Model
 *
 * Provides XP, leveling, achievements, and leaderboards for developers.
 * Makes development addictive through progression mechanics.
 */

import { eq, and, desc, sql, gte, count, inArray } from 'drizzle-orm';
import { getDb } from '../index';
import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  boolean,
  unique,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { user } from '../auth-schema';

// ============ ENUMS ============

export const achievementCategoryEnum = pgEnum('achievement_category', [
  'commits',      // Related to commits/pushes
  'pull_requests', // PR related
  'reviews',      // Code reviews
  'issues',       // Issue tracking
  'collaboration', // Working with others
  'streaks',      // Consistency achievements
  'milestones',   // Major milestones
  'special',      // Special/rare achievements
]);

export const achievementRarityEnum = pgEnum('achievement_rarity', [
  'common',       // Easy to get
  'uncommon',     // Takes some effort
  'rare',         // Significant achievement
  'epic',         // Hard to achieve
  'legendary',    // Very rare, major accomplishment
]);

// ============ TABLES ============

/**
 * Achievement definitions - all available achievements
 */
export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Unique identifier for the achievement (e.g., 'first_commit') */
  key: text('key').notNull().unique(),
  
  /** Display name */
  name: text('name').notNull(),
  
  /** Description of how to unlock */
  description: text('description').notNull(),
  
  /** Category of achievement */
  category: achievementCategoryEnum('category').notNull(),
  
  /** Rarity level */
  rarity: achievementRarityEnum('rarity').notNull(),
  
  /** XP awarded when unlocked */
  xpReward: integer('xp_reward').notNull().default(100),
  
  /** Icon (emoji or icon identifier) */
  icon: text('icon').notNull(),
  
  /** Whether this achievement is hidden until unlocked */
  isSecret: boolean('is_secret').notNull().default(false),
  
  /** Order for display (lower = first) */
  displayOrder: integer('display_order').notNull().default(0),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * User achievements - tracks which users have unlocked which achievements
 */
export const userAchievements = pgTable('user_achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  
  achievementId: uuid('achievement_id')
    .notNull()
    .references(() => achievements.id, { onDelete: 'cascade' }),
  
  /** When the achievement was unlocked */
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }).defaultNow().notNull(),
  
  /** Context about how it was unlocked (e.g., which PR, repo, etc.) */
  context: text('context'),
}, (table) => ({
  uniqueUserAchievement: unique().on(table.userId, table.achievementId),
  userIdIdx: index('idx_user_achievements_user_id').on(table.userId),
  unlockedAtIdx: index('idx_user_achievements_unlocked_at').on(table.unlockedAt),
}));

/**
 * User gamification stats - XP, level, and overall progress
 */
export const userGamification = pgTable('user_gamification', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
    .unique(),
  
  /** Total XP earned */
  totalXp: integer('total_xp').notNull().default(0),
  
  /** Current level */
  level: integer('level').notNull().default(1),
  
  /** XP progress toward next level */
  xpToNextLevel: integer('xp_to_next_level').notNull().default(100),
  
  /** Current streak (consecutive days with activity) */
  currentStreak: integer('current_streak').notNull().default(0),
  
  /** Longest streak ever achieved */
  longestStreak: integer('longest_streak').notNull().default(0),
  
  /** Last activity date (for streak calculation) */
  lastActivityDate: timestamp('last_activity_date', { withTimezone: true }),
  
  // Lifetime stats for achievements
  totalCommits: integer('total_commits').notNull().default(0),
  totalPrsOpened: integer('total_prs_opened').notNull().default(0),
  totalPrsMerged: integer('total_prs_merged').notNull().default(0),
  totalReviews: integer('total_reviews').notNull().default(0),
  totalIssuesOpened: integer('total_issues_opened').notNull().default(0),
  totalIssuesClosed: integer('total_issues_closed').notNull().default(0),
  totalComments: integer('total_comments').notNull().default(0),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  levelIdx: index('idx_user_gamification_level').on(table.level),
  totalXpIdx: index('idx_user_gamification_total_xp').on(table.totalXp),
}));

/**
 * XP events - log of all XP earned
 */
export const xpEvents = pgTable('xp_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  
  /** Type of activity that earned XP */
  activityType: text('activity_type').notNull(),
  
  /** Amount of XP earned */
  xpAmount: integer('xp_amount').notNull(),
  
  /** Description of what earned the XP */
  description: text('description'),
  
  /** Related entity (repo ID, PR ID, etc.) */
  relatedId: text('related_id'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_xp_events_user_id').on(table.userId),
  createdAtIdx: index('idx_xp_events_created_at').on(table.createdAt),
}));

// ============ TYPE EXPORTS ============

export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;

export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;

export type UserGamification = typeof userGamification.$inferSelect;
export type NewUserGamification = typeof userGamification.$inferInsert;

export type XpEvent = typeof xpEvents.$inferSelect;
export type NewXpEvent = typeof xpEvents.$inferInsert;

export type AchievementCategory = (typeof achievementCategoryEnum.enumValues)[number];
export type AchievementRarity = (typeof achievementRarityEnum.enumValues)[number];

// ============ CONSTANTS ============

/**
 * XP required for each level (levels 1-100)
 * Uses a curve that gets progressively harder
 */
export function getXpForLevel(level: number): number {
  // Level 1 = 0, Level 2 = 100, Level 3 = 250, etc.
  // Formula: 50 * level^1.5
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level, 1.5));
}

/**
 * Calculate level from total XP
 */
export function getLevelFromXp(totalXp: number): number {
  let level = 1;
  while (getXpForLevel(level + 1) <= totalXp) {
    level++;
  }
  return level;
}

/**
 * XP rewards for different activities
 */
export const XP_REWARDS = {
  // Commits
  commit: 10,
  commitWithGoodMessage: 15, // Commit with detailed message
  
  // Pull Requests
  prOpened: 25,
  prMerged: 50,
  prApproved: 30,
  prWithReview: 40, // PR that received reviews
  
  // Reviews
  reviewApproved: 20,
  reviewChangesRequested: 15,
  reviewComment: 10,
  thoroughReview: 35, // Review with detailed comments
  
  // Issues
  issueOpened: 15,
  issueClosed: 20,
  issueWithLabels: 5, // Bonus for well-organized issues
  
  // Comments
  comment: 5,
  helpfulComment: 15, // Comment that got reactions
  
  // Collaboration
  firstContribution: 100, // First contribution to a repo
  mentored: 50, // Helped someone (they referenced you)
  
  // Streaks
  dailyActivity: 5, // Bonus for being active each day
  weeklyStreak: 25, // 7-day streak bonus
  monthlyStreak: 100, // 30-day streak bonus
  
  // Special
  firstRepo: 50,
  firstStar: 25,
  firstFork: 25,
  releasePublished: 75,
} as const;

/**
 * Level titles/ranks
 */
export const LEVEL_TITLES: Record<number, string> = {
  1: 'Novice Developer',
  5: 'Junior Developer',
  10: 'Developer',
  15: 'Experienced Developer',
  20: 'Senior Developer',
  25: 'Lead Developer',
  30: 'Principal Developer',
  40: 'Staff Engineer',
  50: 'Senior Staff Engineer',
  60: 'Principal Engineer',
  75: 'Distinguished Engineer',
  90: 'Fellow',
  100: 'Legendary Coder',
};

export function getLevelTitle(level: number): string {
  const levels = Object.keys(LEVEL_TITLES).map(Number).sort((a, b) => b - a);
  for (const lvl of levels) {
    if (level >= lvl) {
      return LEVEL_TITLES[lvl];
    }
  }
  return LEVEL_TITLES[1];
}

// ============ MODEL ============

export const gamificationModel = {
  /**
   * Get or create gamification record for a user
   */
  async getOrCreateUserGamification(userId: string): Promise<UserGamification> {
    const db = getDb();
    
    const [existing] = await db
      .select()
      .from(userGamification)
      .where(eq(userGamification.userId, userId));
    
    if (existing) return existing;
    
    const [created] = await db
      .insert(userGamification)
      .values({ userId })
      .returning();
    
    return created;
  },

  /**
   * Award XP to a user
   */
  async awardXp(
    userId: string,
    amount: number,
    activityType: string,
    description?: string,
    relatedId?: string
  ): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
    const db = getDb();
    
    // Get current gamification record
    const gamification = await this.getOrCreateUserGamification(userId);
    const oldLevel = gamification.level;
    
    // Calculate new totals
    const newTotalXp = gamification.totalXp + amount;
    const newLevel = getLevelFromXp(newTotalXp);
    const xpForNextLevel = getXpForLevel(newLevel + 1);
    const xpToNextLevel = xpForNextLevel - newTotalXp;
    
    // Update user gamification
    await db
      .update(userGamification)
      .set({
        totalXp: newTotalXp,
        level: newLevel,
        xpToNextLevel,
        updatedAt: new Date(),
      })
      .where(eq(userGamification.userId, userId));
    
    // Log XP event
    await db.insert(xpEvents).values({
      userId,
      activityType,
      xpAmount: amount,
      description,
      relatedId,
    });
    
    const leveledUp = newLevel > oldLevel;
    
    // Send level up notification if user leveled up
    if (leveledUp) {
      // Import dynamically to avoid circular dependencies
      const { notificationHelpers } = await import('./notification');
      await notificationHelpers.levelUp(userId, newLevel, getLevelTitle(newLevel));
    }
    
    return {
      newXp: newTotalXp,
      newLevel,
      leveledUp,
    };
  },

  /**
   * Update user stats and check for streak
   */
  async recordActivity(
    userId: string,
    type: 'commit' | 'pr_opened' | 'pr_merged' | 'review' | 'issue_opened' | 'issue_closed' | 'comment'
  ): Promise<{ streakUpdated: boolean; newStreak: number }> {
    const db = getDb();
    const gamification = await this.getOrCreateUserGamification(userId);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastActivity = gamification.lastActivityDate;
    let newStreak = gamification.currentStreak;
    let streakUpdated = false;
    
    if (lastActivity) {
      const lastDate = new Date(lastActivity);
      lastDate.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
      
      if (diffDays === 1) {
        // Continue streak
        newStreak++;
        streakUpdated = true;
      } else if (diffDays > 1) {
        // Streak broken
        newStreak = 1;
        streakUpdated = true;
      }
      // If diffDays === 0, same day, don't update streak
    } else {
      // First activity ever
      newStreak = 1;
      streakUpdated = true;
    }
    
    // Build update object based on activity type
    const updates: Partial<UserGamification> = {
      lastActivityDate: new Date(),
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, gamification.longestStreak),
      updatedAt: new Date(),
    };
    
    // Increment the appropriate counter
    switch (type) {
      case 'commit':
        updates.totalCommits = gamification.totalCommits + 1;
        break;
      case 'pr_opened':
        updates.totalPrsOpened = gamification.totalPrsOpened + 1;
        break;
      case 'pr_merged':
        updates.totalPrsMerged = gamification.totalPrsMerged + 1;
        break;
      case 'review':
        updates.totalReviews = gamification.totalReviews + 1;
        break;
      case 'issue_opened':
        updates.totalIssuesOpened = gamification.totalIssuesOpened + 1;
        break;
      case 'issue_closed':
        updates.totalIssuesClosed = gamification.totalIssuesClosed + 1;
        break;
      case 'comment':
        updates.totalComments = gamification.totalComments + 1;
        break;
    }
    
    await db
      .update(userGamification)
      .set(updates)
      .where(eq(userGamification.userId, userId));
    
    return { streakUpdated, newStreak };
  },

  /**
   * Get user's gamification profile
   */
  async getUserProfile(userId: string): Promise<{
    gamification: UserGamification;
    title: string;
    xpProgress: number;
    achievements: (UserAchievement & { achievement: Achievement })[];
    recentXp: XpEvent[];
  }> {
    const db = getDb();
    
    const gamification = await this.getOrCreateUserGamification(userId);
    const title = getLevelTitle(gamification.level);
    
    // Calculate progress to next level
    const currentLevelXp = getXpForLevel(gamification.level);
    const nextLevelXp = getXpForLevel(gamification.level + 1);
    const xpProgress = ((gamification.totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
    
    // Get user's achievements
    const userAchievementsList = await db
      .select({
        userAchievement: userAchievements,
        achievement: achievements,
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(eq(userAchievements.userId, userId))
      .orderBy(desc(userAchievements.unlockedAt));
    
    // Get recent XP events
    const recentXp = await db
      .select()
      .from(xpEvents)
      .where(eq(xpEvents.userId, userId))
      .orderBy(desc(xpEvents.createdAt))
      .limit(10);
    
    return {
      gamification,
      title,
      xpProgress: Math.min(100, Math.max(0, xpProgress)),
      achievements: userAchievementsList.map((r) => ({
        ...r.userAchievement,
        achievement: r.achievement,
      })),
      recentXp,
    };
  },

  /**
   * Check if user has achievement
   */
  async hasAchievement(userId: string, achievementKey: string): Promise<boolean> {
    const db = getDb();
    
    const [result] = await db
      .select({ count: count() })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(achievements.key, achievementKey)
        )
      );
    
    return (result?.count || 0) > 0;
  },

  /**
   * Unlock an achievement for a user
   */
  async unlockAchievement(
    userId: string,
    achievementKey: string,
    context?: string
  ): Promise<{ unlocked: boolean; achievement?: Achievement; xpAwarded?: number }> {
    const db = getDb();
    
    // Check if already has achievement
    if (await this.hasAchievement(userId, achievementKey)) {
      return { unlocked: false };
    }
    
    // Get achievement
    const [achievement] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.key, achievementKey));
    
    if (!achievement) {
      console.error(`Achievement not found: ${achievementKey}`);
      return { unlocked: false };
    }
    
    // Unlock achievement
    await db.insert(userAchievements).values({
      userId,
      achievementId: achievement.id,
      context,
    });
    
    // Award XP for the achievement
    await this.awardXp(
      userId,
      achievement.xpReward,
      'achievement_unlocked',
      `Unlocked: ${achievement.name}`,
      achievement.id
    );
    
    // Send notification
    try {
      const { notificationHelpers } = await import('./notification');
      await notificationHelpers.achievementUnlocked(
        userId,
        achievement.name,
        achievement.icon,
        achievement.xpReward
      );
    } catch (e) {
      console.error('Failed to send achievement notification:', e);
    }
    
    return {
      unlocked: true,
      achievement,
      xpAwarded: achievement.xpReward,
    };
  },

  /**
   * Get all achievements with unlock status for user
   */
  async getAllAchievementsForUser(userId: string): Promise<{
    achievement: Achievement;
    unlocked: boolean;
    unlockedAt?: Date;
  }[]> {
    const db = getDb();
    
    // Get all achievements
    const allAchievements = await db
      .select()
      .from(achievements)
      .orderBy(achievements.displayOrder);
    
    // Get user's unlocked achievements
    const unlocked = await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId));
    
    const unlockedMap = new Map(
      unlocked.map((u) => [u.achievementId, u.unlockedAt])
    );
    
    return allAchievements.map((a) => ({
      achievement: a,
      unlocked: unlockedMap.has(a.id),
      unlockedAt: unlockedMap.get(a.id),
    }));
  },

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    limit = 50,
    timeframe?: 'all' | 'month' | 'week'
  ): Promise<{
    rank: number;
    userId: string;
    username: string | null;
    name: string;
    avatarUrl: string | null;
    level: number;
    totalXp: number;
    title: string;
  }[]> {
    const db = getDb();
    
    let query;
    
    if (timeframe === 'week' || timeframe === 'month') {
      // For time-based leaderboards, sum XP from xpEvents
      const days = timeframe === 'week' ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      query = await db
        .select({
          userId: xpEvents.userId,
          username: user.username,
          name: user.name,
          avatarUrl: user.avatarUrl,
          level: userGamification.level,
          totalXp: sql<number>`SUM(${xpEvents.xpAmount})`.as('total_xp'),
        })
        .from(xpEvents)
        .innerJoin(user, eq(xpEvents.userId, user.id))
        .innerJoin(userGamification, eq(xpEvents.userId, userGamification.userId))
        .where(gte(xpEvents.createdAt, cutoff))
        .groupBy(xpEvents.userId, user.username, user.name, user.avatarUrl, userGamification.level)
        .orderBy(desc(sql`total_xp`))
        .limit(limit);
    } else {
      // All-time leaderboard
      query = await db
        .select({
          userId: userGamification.userId,
          username: user.username,
          name: user.name,
          avatarUrl: user.avatarUrl,
          level: userGamification.level,
          totalXp: userGamification.totalXp,
        })
        .from(userGamification)
        .innerJoin(user, eq(userGamification.userId, user.id))
        .orderBy(desc(userGamification.totalXp))
        .limit(limit);
    }
    
    return query.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      username: row.username,
      name: row.name,
      avatarUrl: row.avatarUrl,
      level: row.level,
      totalXp: Number(row.totalXp),
      title: getLevelTitle(row.level),
    }));
  },

  /**
   * Get user's rank on leaderboard
   */
  async getUserRank(userId: string): Promise<number> {
    const db = getDb();
    
    const gamification = await this.getOrCreateUserGamification(userId);
    
    const [result] = await db
      .select({ count: count() })
      .from(userGamification)
      .where(sql`${userGamification.totalXp} > ${gamification.totalXp}`);
    
    return (result?.count || 0) + 1;
  },

  /**
   * Get XP history for user (for charts)
   */
  async getXpHistory(
    userId: string,
    days = 30
  ): Promise<{ date: string; xp: number }[]> {
    const db = getDb();
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const result = await db
      .select({
        date: sql<string>`DATE(${xpEvents.createdAt})`,
        xp: sql<number>`SUM(${xpEvents.xpAmount})`,
      })
      .from(xpEvents)
      .where(
        and(
          eq(xpEvents.userId, userId),
          gte(xpEvents.createdAt, cutoff)
        )
      )
      .groupBy(sql`DATE(${xpEvents.createdAt})`)
      .orderBy(sql`DATE(${xpEvents.createdAt})`);
    
    return result.map((r) => ({
      date: r.date,
      xp: Number(r.xp),
    }));
  },
};
