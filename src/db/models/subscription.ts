/**
 * Subscription and Usage Models
 * 
 * Handles user subscription tiers and AI feature usage tracking
 * for monetization.
 */

import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { getDb } from '../index';
import { user } from '../auth-schema';

// ============================================================================
// Types
// ============================================================================

export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'inactive';
export type AIFeature = 'commit' | 'review' | 'search' | 'agent' | 'explain';

export interface TierLimits {
  privateRepos: number;
  collaboratorsPerRepo: number;
  aiCommits: number;
  aiReviews: number;
  aiSearches: number;
  aiAgentMessages: number;
}

// ============================================================================
// Tier Configuration
// ============================================================================

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    privateRepos: 3,
    collaboratorsPerRepo: 1,
    aiCommits: 50,
    aiReviews: 10,
    aiSearches: 100,
    aiAgentMessages: 20,
  },
  pro: {
    privateRepos: Infinity,
    collaboratorsPerRepo: 5,
    aiCommits: Infinity,
    aiReviews: Infinity,
    aiSearches: Infinity,
    aiAgentMessages: Infinity,
  },
  team: {
    privateRepos: Infinity,
    collaboratorsPerRepo: Infinity,
    aiCommits: Infinity,
    aiReviews: Infinity,
    aiSearches: Infinity,
    aiAgentMessages: Infinity,
  },
  enterprise: {
    privateRepos: Infinity,
    collaboratorsPerRepo: Infinity,
    aiCommits: Infinity,
    aiReviews: Infinity,
    aiSearches: Infinity,
    aiAgentMessages: Infinity,
  },
};

export const TIER_PRICING = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 15, annual: 150 }, // 2 months free on annual
  team: { monthly: 25, annual: 250 }, // per user
  enterprise: { monthly: null, annual: null }, // custom pricing
};

// ============================================================================
// AI Usage Table Schema
// ============================================================================

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    feature: text('feature').$type<AIFeature>().notNull(),
    count: integer('count').default(0).notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('ai_usage_user_period_idx').on(table.userId, table.periodStart),
    index('ai_usage_user_feature_idx').on(table.userId, table.feature),
  ]
);

export type AIUsage = typeof aiUsage.$inferSelect;
export type NewAIUsage = typeof aiUsage.$inferInsert;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the start of the current billing period (month)
 */
export function getPeriodStart(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Get the end of the current billing period (month)
 */
export function getPeriodEnd(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

// ============================================================================
// Subscription Model
// ============================================================================

export const subscriptionModel = {
  /**
   * Get a user's subscription tier
   * Note: This reads from the user table's tier column
   */
  async getUserTier(userId: string): Promise<SubscriptionTier> {
    const db = getDb();
    const [result] = await db
      .select({ tier: sql<string>`COALESCE(${user}.tier, 'free')` })
      .from(user)
      .where(eq(user.id, userId));
    
    return (result?.tier as SubscriptionTier) || 'free';
  },

  /**
   * Update a user's subscription tier
   */
  async updateUserTier(
    userId: string, 
    tier: SubscriptionTier,
    stripeData?: {
      customerId?: string;
      subscriptionId?: string;
      currentPeriodEnd?: Date;
    }
  ): Promise<void> {
    const db = getDb();
    
    const updateData: Record<string, unknown> = {
      tier,
      updatedAt: new Date(),
    };
    
    if (stripeData?.customerId) {
      updateData.stripeCustomerId = stripeData.customerId;
    }
    if (stripeData?.subscriptionId) {
      updateData.stripeSubscriptionId = stripeData.subscriptionId;
    }
    if (stripeData?.currentPeriodEnd) {
      updateData.subscriptionPeriodEnd = stripeData.currentPeriodEnd;
    }

    await db
      .update(user)
      .set(updateData)
      .where(eq(user.id, userId));
  },

  /**
   * Get tier limits for a user
   */
  async getUserLimits(userId: string): Promise<TierLimits> {
    const tier = await this.getUserTier(userId);
    return TIER_LIMITS[tier];
  },

  /**
   * Check if a user can create more private repos
   */
  async canCreatePrivateRepo(userId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
    const db = getDb();
    const tier = await this.getUserTier(userId);
    const limits = TIER_LIMITS[tier];
    
    // Count current private repos
    const { repositories } = await import('../schema');
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(repositories)
      .where(and(
        eq(repositories.ownerId, userId),
        eq(repositories.isPrivate, true)
      ));
    
    const current = Number(result?.count ?? 0);
    const limit = limits.privateRepos;
    
    return {
      allowed: current < limit,
      current,
      limit,
    };
  },
};

// ============================================================================
// Usage Tracking Model
// ============================================================================

export const usageModel = {
  /**
   * Track usage of an AI feature
   */
  async trackUsage(userId: string, feature: AIFeature): Promise<void> {
    const db = getDb();
    const periodStart = getPeriodStart();
    const periodEnd = getPeriodEnd();
    const id = `${userId}:${feature}:${periodStart.toISOString().slice(0, 7)}`;

    // Upsert: increment if exists, create if not
    await db
      .insert(aiUsage)
      .values({
        id,
        userId,
        feature,
        count: 1,
        periodStart,
        periodEnd,
      })
      .onConflictDoUpdate({
        target: aiUsage.id,
        set: {
          count: sql`${aiUsage.count} + 1`,
          updatedAt: new Date(),
        },
      });
  },

  /**
   * Get current usage for a feature in the current period
   */
  async getCurrentUsage(userId: string, feature: AIFeature): Promise<number> {
    const db = getDb();
    const periodStart = getPeriodStart();
    
    const [result] = await db
      .select({ count: aiUsage.count })
      .from(aiUsage)
      .where(and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.feature, feature),
        gte(aiUsage.periodStart, periodStart)
      ));
    
    return result?.count ?? 0;
  },

  /**
   * Get all usage for a user in the current period
   */
  async getAllCurrentUsage(userId: string): Promise<Record<AIFeature, number>> {
    const db = getDb();
    const periodStart = getPeriodStart();
    
    const results = await db
      .select({ feature: aiUsage.feature, count: aiUsage.count })
      .from(aiUsage)
      .where(and(
        eq(aiUsage.userId, userId),
        gte(aiUsage.periodStart, periodStart)
      ));
    
    const usage: Record<AIFeature, number> = {
      commit: 0,
      review: 0,
      search: 0,
      agent: 0,
      explain: 0,
    };
    
    for (const row of results) {
      usage[row.feature] = row.count;
    }
    
    return usage;
  },

  /**
   * Check if a user can use an AI feature (within limits)
   */
  async checkLimit(
    userId: string, 
    feature: AIFeature
  ): Promise<{ allowed: boolean; current: number; limit: number; tier: SubscriptionTier }> {
    const tier = await subscriptionModel.getUserTier(userId);
    const limits = TIER_LIMITS[tier];
    const current = await this.getCurrentUsage(userId, feature);
    
    // Map feature to limit key
    const limitKey = {
      commit: 'aiCommits',
      review: 'aiReviews',
      search: 'aiSearches',
      agent: 'aiAgentMessages',
      explain: 'aiAgentMessages',
    }[feature] as keyof TierLimits;
    
    const limit = limits[limitKey] as number;
    
    return {
      allowed: limit === Infinity || current < limit,
      current,
      limit,
      tier,
    };
  },

  /**
   * Get usage history for a user (last N months)
   */
  async getUsageHistory(userId: string, months: number = 6): Promise<Array<{
    period: string;
    usage: Record<AIFeature, number>;
  }>> {
    const db = getDb();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    
    const results = await db
      .select()
      .from(aiUsage)
      .where(and(
        eq(aiUsage.userId, userId),
        gte(aiUsage.periodStart, getPeriodStart(startDate))
      ))
      .orderBy(aiUsage.periodStart);
    
    // Group by period
    const history: Map<string, Record<AIFeature, number>> = new Map();
    
    for (const row of results) {
      const period = row.periodStart.toISOString().slice(0, 7); // YYYY-MM
      if (!history.has(period)) {
        history.set(period, { commit: 0, review: 0, search: 0, agent: 0, explain: 0 });
      }
      history.get(period)![row.feature] = row.count;
    }
    
    return Array.from(history.entries()).map(([period, usage]) => ({ period, usage }));
  },

  /**
   * Reset usage for a user (for testing or special cases)
   */
  async resetUsage(userId: string): Promise<void> {
    const db = getDb();
    await db.delete(aiUsage).where(eq(aiUsage.userId, userId));
  },
};

// ============================================================================
// Usage Enforcement Helpers
// ============================================================================

/**
 * Format a usage limit check result for CLI display
 */
export function formatUsageLimitMessage(
  feature: AIFeature,
  result: { allowed: boolean; current: number; limit: number; tier: SubscriptionTier }
): string {
  if (result.allowed) {
    if (result.limit === Infinity) {
      return `✓ Unlimited ${feature}s (${result.tier} tier)`;
    }
    const remaining = result.limit - result.current;
    return `✓ ${remaining} ${feature}s remaining this month (${result.current}/${result.limit})`;
  }
  
  const featureNames = {
    commit: 'AI commit messages',
    review: 'AI code reviews',
    search: 'semantic searches',
    agent: 'AI agent messages',
    explain: 'AI explanations',
  };
  
  return `
⚠️  You've reached your monthly limit for ${featureNames[feature]}.

  Used: ${result.current}/${result.limit} this month
  Current tier: ${result.tier}

  Upgrade to Pro for unlimited AI features:
  → wit billing upgrade
  → https://wit.sh/pricing
`.trim();
}

/**
 * Check usage and throw if limit exceeded
 */
export async function enforceUsageLimit(
  userId: string,
  feature: AIFeature
): Promise<void> {
  const result = await usageModel.checkLimit(userId, feature);
  
  if (!result.allowed) {
    const error = new Error(formatUsageLimitMessage(feature, result));
    (error as Error & { code: string }).code = 'USAGE_LIMIT_EXCEEDED';
    throw error;
  }
  
  // Track the usage
  await usageModel.trackUsage(userId, feature);
}

// ============================================================================
// Billing Display Helpers
// ============================================================================

export function formatTierDisplay(tier: SubscriptionTier): string {
  const displays = {
    free: '🆓 Free',
    pro: '⭐ Pro',
    team: '👥 Team',
    enterprise: '🏢 Enterprise',
  };
  return displays[tier];
}

export function formatUsageBar(current: number, limit: number, width: number = 20): string {
  if (limit === Infinity) return '━'.repeat(width) + ' ∞';
  
  const percentage = Math.min(current / limit, 1);
  const filled = Math.round(percentage * width);
  const empty = width - filled;
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const color = percentage > 0.9 ? '🔴' : percentage > 0.7 ? '🟡' : '🟢';
  
  return `${color} ${bar} ${current}/${limit}`;
}
