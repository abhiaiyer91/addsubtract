/**
 * Usage Enforcement Middleware
 * 
 * Tracks and enforces AI feature usage limits based on subscription tier.
 * Integrates with the subscription model to check limits before allowing
 * AI operations.
 */

import { Context, MiddlewareHandler } from 'hono';
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
  current: number;
  limit: number;
  tier: SubscriptionTier;
  feature: AIFeature;
  remaining: number;
}

export interface UsageContext {
  usage: UsageCheckResult;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create middleware that checks usage limits for a specific AI feature
 * 
 * @param feature - The AI feature to check (commit, review, search, agent)
 * @param options - Configuration options
 */
export function checkUsage(
  feature: AIFeature,
  options: {
    /** Whether to track usage even if just checking (default: false) */
    trackOnCheck?: boolean;
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
      // No user, allow but don't track (might be public endpoint)
      return next();
    }

    // Check usage limit
    const result = await usageModel.checkLimit(userId, feature);
    const remaining = result.limit === Infinity 
      ? Infinity 
      : Math.max(0, result.limit - result.current);

    const usageResult: UsageCheckResult = {
      ...result,
      feature,
      remaining,
    };

    // Store in context for route handlers
    c.set('usage', usageResult);

    // If limit exceeded, return error
    if (!result.allowed) {
      const errorMessage = options.errorMessage || getDefaultErrorMessage(feature, result);
      
      return c.json({
        error: 'Usage limit exceeded',
        code: 'USAGE_LIMIT_EXCEEDED',
        message: errorMessage,
        usage: {
          feature,
          current: result.current,
          limit: result.limit,
          tier: result.tier,
        },
        upgrade: {
          url: '/settings/billing',
          message: 'Upgrade to Pro for unlimited access',
        },
      }, 429);
    }

    // Track usage if configured
    if (options.trackOnCheck) {
      await usageModel.trackUsage(userId, feature);
    }

    return next();
  };
}

/**
 * Middleware that tracks usage after a successful operation
 * Use this after the route handler completes successfully
 */
export function trackUsage(feature: AIFeature): MiddlewareHandler {
  return async (c, next) => {
    // Execute the route handler first
    await next();

    // Only track if response is successful (2xx)
    const status = c.res.status;
    if (status >= 200 && status < 300) {
      const userId = c.get('userId') as string | undefined;
      if (userId) {
        await usageModel.trackUsage(userId, feature);
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
    // Check limit first
    const userId = c.get('userId') as string | undefined;
    
    if (userId) {
      const result = await usageModel.checkLimit(userId, feature);
      
      if (!result.allowed) {
        const errorMessage = options.errorMessage || getDefaultErrorMessage(feature, result);
        
        return c.json({
          error: 'Usage limit exceeded',
          code: 'USAGE_LIMIT_EXCEEDED',
          message: errorMessage,
          usage: {
            feature,
            current: result.current,
            limit: result.limit,
            tier: result.tier,
          },
          upgrade: {
            url: '/settings/billing',
            message: 'Upgrade to Pro for unlimited access',
          },
        }, 429);
      }

      // Store usage info in context
      c.set('usage', {
        ...result,
        feature,
        remaining: result.limit === Infinity ? Infinity : result.limit - result.current,
      });
    }

    // Execute handler
    await next();

    // Track usage on success
    const status = c.res.status;
    if (status >= 200 && status < 300 && userId) {
      await usageModel.trackUsage(userId, feature);
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultErrorMessage(
  feature: AIFeature,
  result: { current: number; limit: number; tier: SubscriptionTier }
): string {
  const featureNames: Record<AIFeature, string> = {
    commit: 'AI commit messages',
    review: 'AI code reviews',
    search: 'semantic searches',
    agent: 'AI agent messages',
    explain: 'AI explanations',
  };

  return `You've used all ${result.limit} ${featureNames[feature]} for this month. ` +
    `Upgrade to Pro for unlimited access.`;
}

/**
 * Get usage headers to include in response
 */
export function getUsageHeaders(result: UsageCheckResult): Record<string, string> {
  return {
    'X-Usage-Feature': result.feature,
    'X-Usage-Current': String(result.current),
    'X-Usage-Limit': result.limit === Infinity ? 'unlimited' : String(result.limit),
    'X-Usage-Remaining': result.remaining === Infinity ? 'unlimited' : String(result.remaining),
    'X-Subscription-Tier': result.tier,
  };
}

// ============================================================================
// tRPC Integration
// ============================================================================

/**
 * Check usage limit for tRPC procedures
 * Returns the check result and throws if limit exceeded
 */
export async function checkUsageForProcedure(
  userId: string,
  feature: AIFeature
): Promise<UsageCheckResult> {
  const result = await usageModel.checkLimit(userId, feature);
  const remaining = result.limit === Infinity 
    ? Infinity 
    : Math.max(0, result.limit - result.current);

  const usageResult: UsageCheckResult = {
    ...result,
    feature,
    remaining,
  };

  if (!result.allowed) {
    const error = new Error(getDefaultErrorMessage(feature, result));
    (error as Error & { code: string; usage: UsageCheckResult }).code = 'USAGE_LIMIT_EXCEEDED';
    (error as Error & { code: string; usage: UsageCheckResult }).usage = usageResult;
    throw error;
  }

  return usageResult;
}

/**
 * Track usage after successful tRPC procedure
 */
export async function trackUsageForProcedure(
  userId: string,
  feature: AIFeature
): Promise<void> {
  await usageModel.trackUsage(userId, feature);
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
// Exports
// ============================================================================

export {
  type AIFeature,
  type SubscriptionTier,
  TIER_LIMITS,
};
