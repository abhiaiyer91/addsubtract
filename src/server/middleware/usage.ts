/**
 * Usage Enforcement Middleware
 * 
 * Tracks and enforces AI feature usage limits using Autumn billing.
 * Falls back to local tracking when Autumn is not configured.
 */

import { Context, MiddlewareHandler } from 'hono';
import {
  isAutumnConfigured,
  checkFeature,
  recordUsage,
  AUTUMN_FEATURES,
  type FeatureCheckResult,
} from '../../lib/autumn';
import {
  usageModel,
  subscriptionModel,
  TIER_LIMITS,
  type AIFeature,
  type SubscriptionTier,
} from '../../db/models';

// ============================================================================
// Types
// ============================================================================

export interface UsageCheckResult {
  allowed: boolean;
  current?: number;
  limit?: number;
  remaining?: number;
  unlimited?: boolean;
  tier?: SubscriptionTier;
  feature: AIFeature;
}

// Map our feature names to Autumn feature IDs
const FEATURE_TO_AUTUMN: Record<AIFeature, string> = {
  commit: AUTUMN_FEATURES.aiCommits,
  review: AUTUMN_FEATURES.aiReviews,
  search: AUTUMN_FEATURES.aiSearches,
  agent: AUTUMN_FEATURES.aiAgentMessages,
  explain: AUTUMN_FEATURES.aiAgentMessages,
};

// ============================================================================
// Core Check Functions
// ============================================================================

/**
 * Check if a user can use a feature
 * Uses Autumn if configured, falls back to local tracking
 */
export async function checkUsageLimit(
  userId: string,
  feature: AIFeature
): Promise<UsageCheckResult> {
  if (isAutumnConfigured()) {
    // Use Autumn for checking
    const autumnFeatureId = FEATURE_TO_AUTUMN[feature];
    const result = await checkFeature(userId, autumnFeatureId);
    
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      limit: result.limit,
      unlimited: result.unlimited,
      feature,
    };
  }
  
  // Fall back to local tracking
  const result = await usageModel.checkLimit(userId, feature);
  const remaining = result.limit === Infinity 
    ? undefined 
    : Math.max(0, result.limit - result.current);
  
  return {
    allowed: result.allowed,
    current: result.current,
    limit: result.limit === Infinity ? undefined : result.limit,
    remaining,
    unlimited: result.limit === Infinity,
    tier: result.tier,
    feature,
  };
}

/**
 * Track usage after a successful operation
 * Uses Autumn if configured, falls back to local tracking
 */
export async function trackUsageAfterSuccess(
  userId: string,
  feature: AIFeature
): Promise<void> {
  if (isAutumnConfigured()) {
    const autumnFeatureId = FEATURE_TO_AUTUMN[feature];
    await recordUsage(userId, autumnFeatureId);
  } else {
    await usageModel.trackUsage(userId, feature);
  }
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create middleware that checks usage limits for a specific AI feature
 */
export function checkUsage(
  feature: AIFeature,
  options: {
    /** Custom error message */
    errorMessage?: string;
    /** Skip check for certain conditions */
    skip?: (c: Context) => boolean | Promise<boolean>;
  } = {}
): MiddlewareHandler {
  return async (c, next) => {
    // Check if we should skip
    if (options.skip) {
      const shouldSkip = await options.skip(c);
      if (shouldSkip) {
        return next();
      }
    }

    // Get user ID from context (set by auth middleware)
    const userId = c.get('userId') as string | undefined;
    
    if (!userId) {
      // No user, allow but don't track
      return next();
    }

    // Check usage limit
    const result = await checkUsageLimit(userId, feature);

    // Store in context for route handlers
    c.set('usage', result);

    // If limit exceeded, return error
    if (!result.allowed) {
      const errorMessage = options.errorMessage || getDefaultErrorMessage(feature, result);
      
      return c.json({
        error: 'Usage limit exceeded',
        code: 'USAGE_LIMIT_EXCEEDED',
        message: errorMessage,
        usage: result,
        upgrade: {
          url: '/settings/billing',
          cta: 'Upgrade to Pro',
        },
      }, 429);
    }

    return next();
  };
}

/**
 * Middleware that tracks usage after a successful operation
 */
export function trackUsage(feature: AIFeature): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Only track if response is successful (2xx)
    const status = c.res.status;
    if (status >= 200 && status < 300) {
      const userId = c.get('userId') as string | undefined;
      if (userId) {
        await trackUsageAfterSuccess(userId, feature);
      }
    }
  };
}

/**
 * Combined middleware: check before, track after
 */
export function enforceUsage(
  feature: AIFeature,
  options: Parameters<typeof checkUsage>[1] = {}
): MiddlewareHandler {
  return async (c, next) => {
    const userId = c.get('userId') as string | undefined;
    
    if (userId) {
      const result = await checkUsageLimit(userId, feature);
      
      if (!result.allowed) {
        const errorMessage = options.errorMessage || getDefaultErrorMessage(feature, result);
        
        return c.json({
          error: 'Usage limit exceeded',
          code: 'USAGE_LIMIT_EXCEEDED',
          message: errorMessage,
          usage: result,
          upgrade: {
            url: '/settings/billing',
            cta: 'Upgrade to Pro',
          },
        }, 429);
      }

      c.set('usage', result);
    }

    // Execute handler
    await next();

    // Track usage on success
    const status = c.res.status;
    if (status >= 200 && status < 300 && userId) {
      await trackUsageAfterSuccess(userId, feature);
    }
  };
}

// ============================================================================
// tRPC Integration
// ============================================================================

/**
 * Check usage limit for tRPC procedures
 * Throws if limit exceeded
 */
export async function checkUsageForProcedure(
  userId: string,
  feature: AIFeature
): Promise<UsageCheckResult> {
  const result = await checkUsageLimit(userId, feature);

  if (!result.allowed) {
    const error = new Error(getDefaultErrorMessage(feature, result));
    (error as Error & { code: string; usage: UsageCheckResult }).code = 'USAGE_LIMIT_EXCEEDED';
    (error as Error & { code: string; usage: UsageCheckResult }).usage = result;
    throw error;
  }

  return result;
}

/**
 * Track usage after successful tRPC procedure
 */
export async function trackUsageForProcedure(
  userId: string,
  feature: AIFeature
): Promise<void> {
  await trackUsageAfterSuccess(userId, feature);
}

/**
 * Wrapper for tRPC procedures that enforces usage limits
 */
export async function withUsageLimit<T>(
  userId: string,
  feature: AIFeature,
  fn: () => Promise<T>
): Promise<T> {
  // Check limit
  await checkUsageForProcedure(userId, feature);
  
  // Execute function
  const result = await fn();
  
  // Track usage on success
  await trackUsageForProcedure(userId, feature);
  
  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultErrorMessage(
  feature: AIFeature,
  result: UsageCheckResult
): string {
  const featureNames: Record<AIFeature, string> = {
    commit: 'AI commit messages',
    review: 'AI code reviews',
    search: 'semantic searches',
    agent: 'AI agent messages',
    explain: 'AI explanations',
  };

  const limitText = result.limit ? `${result.limit}` : 'your';
  
  return `You've used all ${limitText} ${featureNames[feature]} for this month. ` +
    `Upgrade to Pro for unlimited access.`;
}

/**
 * Get usage headers to include in response
 */
export function getUsageHeaders(result: UsageCheckResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Usage-Feature': result.feature,
  };
  
  if (result.current !== undefined) {
    headers['X-Usage-Current'] = String(result.current);
  }
  if (result.limit !== undefined) {
    headers['X-Usage-Limit'] = String(result.limit);
  }
  if (result.remaining !== undefined) {
    headers['X-Usage-Remaining'] = String(result.remaining);
  }
  if (result.unlimited) {
    headers['X-Usage-Unlimited'] = 'true';
  }
  if (result.tier) {
    headers['X-Subscription-Tier'] = result.tier;
  }
  
  return headers;
}

// ============================================================================
// Exports
// ============================================================================

export {
  type AIFeature,
  type SubscriptionTier,
  TIER_LIMITS,
};
