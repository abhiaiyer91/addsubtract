/**
 * Billing Router
 * 
 * Handles subscription management, usage tracking, and billing operations.
 * Integrates with Stripe for payment processing (when configured).
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  subscriptionModel,
  usageModel,
  TIER_LIMITS,
  TIER_PRICING,
  formatTierDisplay,
  formatUsageBar,
  type SubscriptionTier,
  type AIFeature,
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
    const tier = await subscriptionModel.getUserTier(userId);
    const limits = TIER_LIMITS[tier];
    
    return {
      tier,
      tierDisplay: formatTierDisplay(tier),
      limits,
      pricing: TIER_PRICING[tier],
      // Stripe data would be added here when integrated
      stripeCustomerId: null as string | null,
      stripeSubscriptionId: null as string | null,
      currentPeriodEnd: null as Date | null,
    };
  }),

  /**
   * Get current usage for all AI features
   */
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const tier = await subscriptionModel.getUserTier(userId);
    const limits = TIER_LIMITS[tier];
    const usage = await usageModel.getAllCurrentUsage(userId);
    
    const features: Array<{
      feature: AIFeature;
      label: string;
      current: number;
      limit: number;
      percentage: number;
      bar: string;
    }> = [
      {
        feature: 'commit',
        label: 'AI Commit Messages',
        current: usage.commit,
        limit: limits.aiCommits,
        percentage: limits.aiCommits === Infinity ? 0 : (usage.commit / limits.aiCommits) * 100,
        bar: formatUsageBar(usage.commit, limits.aiCommits),
      },
      {
        feature: 'review',
        label: 'AI Code Reviews',
        current: usage.review,
        limit: limits.aiReviews,
        percentage: limits.aiReviews === Infinity ? 0 : (usage.review / limits.aiReviews) * 100,
        bar: formatUsageBar(usage.review, limits.aiReviews),
      },
      {
        feature: 'search',
        label: 'Semantic Searches',
        current: usage.search,
        limit: limits.aiSearches,
        percentage: limits.aiSearches === Infinity ? 0 : (usage.search / limits.aiSearches) * 100,
        bar: formatUsageBar(usage.search, limits.aiSearches),
      },
      {
        feature: 'agent',
        label: 'AI Agent Messages',
        current: usage.agent,
        limit: limits.aiAgentMessages,
        percentage: limits.aiAgentMessages === Infinity ? 0 : (usage.agent / limits.aiAgentMessages) * 100,
        bar: formatUsageBar(usage.agent, limits.aiAgentMessages),
      },
    ];
    
    return {
      tier,
      tierDisplay: formatTierDisplay(tier),
      features,
      periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
    };
  }),

  /**
   * Get usage history for the past N months
   */
  getUsageHistory: protectedProcedure
    .input(z.object({ months: z.number().min(1).max(12).default(6) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      return usageModel.getUsageHistory(userId, input.months);
    }),

  /**
   * Check if a specific feature is available (within limits)
   */
  checkFeatureLimit: protectedProcedure
    .input(z.object({ feature: z.enum(['commit', 'review', 'search', 'agent', 'explain']) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      return usageModel.checkLimit(userId, input.feature);
    }),

  /**
   * Get available plans for upgrade
   */
  getPlans: protectedProcedure.query(async ({ ctx }) => {
    const currentTier = await subscriptionModel.getUserTier(ctx.user.id);
    
    const plans = [
      {
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
   * Create a checkout session for upgrading
   * Note: This is a placeholder until Stripe is integrated
   */
  createCheckoutSession: protectedProcedure
    .input(z.object({
      tier: z.enum(['pro', 'team']),
      interval: z.enum(['monthly', 'annual']).default('monthly'),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const currentTier = await subscriptionModel.getUserTier(userId);
      
      if (currentTier === input.tier) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `You are already on the ${input.tier} plan`,
        });
      }
      
      // TODO: Integrate Stripe Checkout
      // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      // const session = await stripe.checkout.sessions.create({
      //   customer_email: ctx.user.email,
      //   mode: 'subscription',
      //   line_items: [{ price: STRIPE_PRICE_IDS[input.tier][input.interval], quantity: 1 }],
      //   success_url: `${process.env.APP_URL}/settings/billing?success=true`,
      //   cancel_url: `${process.env.APP_URL}/settings/billing?canceled=true`,
      //   metadata: { userId },
      // });
      // return { url: session.url };
      
      // For now, return a manual payment link
      return {
        url: null,
        manualPayment: true,
        message: `To upgrade to ${input.tier}, please contact us at billing@wit.sh or use our payment link.`,
        paymentLink: `https://buy.stripe.com/placeholder?tier=${input.tier}&interval=${input.interval}`,
      };
    }),

  /**
   * Create a billing portal session for managing subscription
   * Note: This is a placeholder until Stripe is integrated
   */
  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const tier = await subscriptionModel.getUserTier(userId);
    
    if (tier === 'free') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'You need an active subscription to access the billing portal',
      });
    }
    
    // TODO: Integrate Stripe Billing Portal
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    // const session = await stripe.billingPortal.sessions.create({
    //   customer: user.stripeCustomerId,
    //   return_url: `${process.env.APP_URL}/settings/billing`,
    // });
    // return { url: session.url };
    
    return {
      url: null,
      message: 'Billing portal coming soon. Contact billing@wit.sh for subscription changes.',
    };
  }),

  /**
   * Manually upgrade a user (admin use or after manual payment verification)
   * In production, this would be triggered by Stripe webhooks
   */
  manualUpgrade: protectedProcedure
    .input(z.object({
      tier: z.enum(['pro', 'team', 'enterprise']),
      // In production, this would require admin auth or webhook signature
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      // For now, allow self-upgrade for testing
      // In production, this would be admin-only or webhook-triggered
      await subscriptionModel.updateUserTier(userId, input.tier);
      
      return {
        success: true,
        tier: input.tier,
        message: `Successfully upgraded to ${input.tier}`,
      };
    }),

  /**
   * Get billing-related stats for admin dashboard
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    // This would aggregate billing stats
    // For now, return placeholder data
    return {
      totalRevenue: 0,
      mrr: 0,
      subscribers: {
        free: 0,
        pro: 0,
        team: 0,
        enterprise: 0,
      },
      churnRate: 0,
    };
  }),
});

export type BillingRouter = typeof billingRouter;
