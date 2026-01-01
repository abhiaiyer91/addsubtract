/**
 * Billing Router
 * 
 * Handles subscription management, usage tracking, and billing operations.
 * Uses Autumn for simplified billing infrastructure.
 * 
 * @see https://docs.getautumn.com
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  isAutumnConfigured,
  checkFeature,
  createCheckout,
  getBillingPortal,
  getCustomerProduct,
  getOrCreateCustomer,
  AUTUMN_FEATURES,
  AUTUMN_PRODUCTS,
} from '../../../lib/autumn';
import {
  subscriptionModel,
  usageModel,
  TIER_LIMITS,
  TIER_PRICING,
  formatTierDisplay,
  formatUsageBar,
  type SubscriptionTier,
} from '../../../db/models';

// ============================================================================
// Billing Router
// ============================================================================

export const billingRouter = router({
  /**
   * Get current subscription status
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    
    // Try Autumn first, fall back to local tier
    let tier: SubscriptionTier = 'free';
    let autumnProduct: string | null = null;
    
    if (isAutumnConfigured()) {
      autumnProduct = await getCustomerProduct(userId);
      tier = (autumnProduct as SubscriptionTier) || 'free';
    } else {
      tier = await subscriptionModel.getUserTier(userId);
    }
    
    const limits = TIER_LIMITS[tier];
    
    return {
      tier,
      tierDisplay: formatTierDisplay(tier),
      limits,
      pricing: TIER_PRICING[tier],
      autumnConfigured: isAutumnConfigured(),
      autumnProduct,
    };
  }),

  /**
   * Get current usage for all AI features
   */
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    
    // Check usage via Autumn if configured
    if (isAutumnConfigured()) {
      const [commits, reviews, searches, agent] = await Promise.all([
        checkFeature(userId, AUTUMN_FEATURES.aiCommits),
        checkFeature(userId, AUTUMN_FEATURES.aiReviews),
        checkFeature(userId, AUTUMN_FEATURES.aiSearches),
        checkFeature(userId, AUTUMN_FEATURES.aiAgentMessages),
      ]);
      
      return {
        tier: await getCustomerProduct(userId) || 'free',
        tierDisplay: formatTierDisplay('free'),
        features: [
          {
            feature: 'commit',
            label: 'AI Commit Messages',
            current: commits.limit ? (commits.limit - (commits.remaining || 0)) : 0,
            limit: commits.unlimited ? Infinity : (commits.limit || 50),
            remaining: commits.remaining || 0,
            unlimited: commits.unlimited,
          },
          {
            feature: 'review',
            label: 'AI Code Reviews',
            current: reviews.limit ? (reviews.limit - (reviews.remaining || 0)) : 0,
            limit: reviews.unlimited ? Infinity : (reviews.limit || 10),
            remaining: reviews.remaining || 0,
            unlimited: reviews.unlimited,
          },
          {
            feature: 'search',
            label: 'Semantic Searches',
            current: searches.limit ? (searches.limit - (searches.remaining || 0)) : 0,
            limit: searches.unlimited ? Infinity : (searches.limit || 100),
            remaining: searches.remaining || 0,
            unlimited: searches.unlimited,
          },
          {
            feature: 'agent',
            label: 'AI Agent Messages',
            current: agent.limit ? (agent.limit - (agent.remaining || 0)) : 0,
            limit: agent.unlimited ? Infinity : (agent.limit || 20),
            remaining: agent.remaining || 0,
            unlimited: agent.unlimited,
          },
        ],
        periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
      };
    }
    
    // Fall back to local tracking
    const tier = await subscriptionModel.getUserTier(userId);
    const limits = TIER_LIMITS[tier];
    const usage = await usageModel.getAllCurrentUsage(userId);
    
    return {
      tier,
      tierDisplay: formatTierDisplay(tier),
      features: [
        {
          feature: 'commit',
          label: 'AI Commit Messages',
          current: usage.commit,
          limit: limits.aiCommits,
          remaining: limits.aiCommits === Infinity ? Infinity : limits.aiCommits - usage.commit,
          unlimited: limits.aiCommits === Infinity,
          bar: formatUsageBar(usage.commit, limits.aiCommits),
        },
        {
          feature: 'review',
          label: 'AI Code Reviews',
          current: usage.review,
          limit: limits.aiReviews,
          remaining: limits.aiReviews === Infinity ? Infinity : limits.aiReviews - usage.review,
          unlimited: limits.aiReviews === Infinity,
          bar: formatUsageBar(usage.review, limits.aiReviews),
        },
        {
          feature: 'search',
          label: 'Semantic Searches',
          current: usage.search,
          limit: limits.aiSearches,
          remaining: limits.aiSearches === Infinity ? Infinity : limits.aiSearches - usage.search,
          unlimited: limits.aiSearches === Infinity,
          bar: formatUsageBar(usage.search, limits.aiSearches),
        },
        {
          feature: 'agent',
          label: 'AI Agent Messages',
          current: usage.agent,
          limit: limits.aiAgentMessages,
          remaining: limits.aiAgentMessages === Infinity ? Infinity : limits.aiAgentMessages - usage.agent,
          unlimited: limits.aiAgentMessages === Infinity,
          bar: formatUsageBar(usage.agent, limits.aiAgentMessages),
        },
      ],
      periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
    };
  }),

  /**
   * Check if a specific feature is available (within limits)
   */
  checkFeature: protectedProcedure
    .input(z.object({ 
      feature: z.enum(['commit', 'review', 'search', 'agent', 'explain']) 
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      // Map feature to Autumn feature ID
      const featureMap: Record<string, string> = {
        commit: AUTUMN_FEATURES.aiCommits,
        review: AUTUMN_FEATURES.aiReviews,
        search: AUTUMN_FEATURES.aiSearches,
        agent: AUTUMN_FEATURES.aiAgentMessages,
        explain: AUTUMN_FEATURES.aiAgentMessages,
      };
      
      if (isAutumnConfigured()) {
        const result = await checkFeature(userId, featureMap[input.feature]);
        return {
          allowed: result.allowed,
          remaining: result.remaining,
          limit: result.limit,
          unlimited: result.unlimited,
        };
      }
      
      // Fall back to local check
      return usageModel.checkLimit(userId, input.feature);
    }),

  /**
   * Get available plans for upgrade
   */
  getPlans: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    let currentTier: SubscriptionTier = 'free';
    
    if (isAutumnConfigured()) {
      const product = await getCustomerProduct(userId);
      currentTier = (product as SubscriptionTier) || 'free';
    } else {
      currentTier = await subscriptionModel.getUserTier(userId);
    }
    
    const plans = [
      {
        id: AUTUMN_PRODUCTS.free,
        tier: 'free' as SubscriptionTier,
        name: 'Free',
        description: 'For individuals and open source projects',
        monthlyPrice: 0,
        annualPrice: 0,
        features: [
          '3 private repositories',
          '50 AI commits/month',
          '10 AI reviews/month',
          '100 semantic searches/month',
          'Community support',
        ],
        current: currentTier === 'free',
        recommended: false,
      },
      {
        id: AUTUMN_PRODUCTS.pro,
        tier: 'pro' as SubscriptionTier,
        name: 'Pro',
        description: 'For professional developers',
        monthlyPrice: 15,
        annualPrice: 150,
        features: [
          'Unlimited private repositories',
          'Unlimited AI commits',
          'Unlimited AI reviews',
          'Unlimited semantic search',
          '5 collaborators per repo',
          'Priority email support',
        ],
        current: currentTier === 'pro',
        recommended: currentTier === 'free',
      },
      {
        id: AUTUMN_PRODUCTS.team,
        tier: 'team' as SubscriptionTier,
        name: 'Team',
        description: 'For teams and organizations',
        monthlyPrice: 25,
        annualPrice: 250,
        perUser: true,
        features: [
          'Everything in Pro',
          'Unlimited collaborators',
          'Team management',
          'Priority chat support',
          '99.9% SLA',
        ],
        current: currentTier === 'team',
        recommended: false,
      },
      {
        id: AUTUMN_PRODUCTS.enterprise,
        tier: 'enterprise' as SubscriptionTier,
        name: 'Enterprise',
        description: 'For large organizations with custom needs',
        monthlyPrice: null,
        annualPrice: null,
        features: [
          'Everything in Team',
          'Self-hosted option',
          'SSO/SAML',
          'Audit logs',
          'Dedicated support',
          'Custom SLA',
        ],
        current: currentTier === 'enterprise',
        recommended: false,
        contactSales: true,
      },
    ];
    
    return plans;
  }),

  /**
   * Create a checkout session for upgrading via Autumn
   */
  createCheckout: protectedProcedure
    .input(z.object({
      productId: z.enum(['pro', 'team']),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const userEmail = ctx.user.email;
      
      if (!isAutumnConfigured()) {
        // Return manual payment info when Autumn not configured
        return {
          url: null,
          manualPayment: true,
          message: `To upgrade to ${input.productId}, please contact us at billing@wit.sh`,
        };
      }
      
      // Ensure customer exists in Autumn
      await getOrCreateCustomer(userId, userEmail, ctx.user.name || undefined);
      
      const baseUrl = process.env.APP_URL || 'http://localhost:3000';
      
      const result = await createCheckout(
        userId,
        input.productId,
        `${baseUrl}/settings/billing?success=true`,
        `${baseUrl}/settings/billing?canceled=true`
      );
      
      if (!result) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create checkout session',
        });
      }
      
      return {
        url: result.url,
        manualPayment: false,
      };
    }),

  /**
   * Get billing portal URL for managing subscription
   */
  getPortalUrl: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    
    if (!isAutumnConfigured()) {
      return {
        url: null,
        message: 'Billing portal not available. Contact billing@wit.sh for subscription changes.',
      };
    }
    
    const result = await getBillingPortal(userId);
    
    if (!result) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create portal session',
      });
    }
    
    return { url: result.url };
  }),

  /**
   * Sync customer with Autumn (call on login/signup)
   */
  syncCustomer: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const userEmail = ctx.user.email;
    const userName = ctx.user.name;
    
    if (!isAutumnConfigured()) {
      return { synced: false, reason: 'Autumn not configured' };
    }
    
    const success = await getOrCreateCustomer(userId, userEmail, userName || undefined);
    
    return { synced: success };
  }),

  /**
   * Get billing status summary for dashboard
   */
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    
    let tier: SubscriptionTier = 'free';
    let aiCommitsRemaining: number | null = null;
    let aiReviewsRemaining: number | null = null;
    
    if (isAutumnConfigured()) {
      const product = await getCustomerProduct(userId);
      tier = (product as SubscriptionTier) || 'free';
      
      const [commits, reviews] = await Promise.all([
        checkFeature(userId, AUTUMN_FEATURES.aiCommits),
        checkFeature(userId, AUTUMN_FEATURES.aiReviews),
      ]);
      
      aiCommitsRemaining = commits.unlimited ? null : (commits.remaining ?? 0);
      aiReviewsRemaining = reviews.unlimited ? null : (reviews.remaining ?? 0);
    } else {
      tier = await subscriptionModel.getUserTier(userId);
      const usage = await usageModel.getAllCurrentUsage(userId);
      const limits = TIER_LIMITS[tier];
      
      aiCommitsRemaining = limits.aiCommits === Infinity ? null : limits.aiCommits - usage.commit;
      aiReviewsRemaining = limits.aiReviews === Infinity ? null : limits.aiReviews - usage.review;
    }
    
    return {
      tier,
      tierDisplay: formatTierDisplay(tier),
      aiCommitsRemaining,
      aiReviewsRemaining,
      needsUpgrade: tier === 'free' && (
        (aiCommitsRemaining !== null && aiCommitsRemaining < 10) ||
        (aiReviewsRemaining !== null && aiReviewsRemaining < 3)
      ),
    };
  }),
});

export type BillingRouter = typeof billingRouter;
