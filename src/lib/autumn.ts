/**
 * Autumn Billing Integration
 * 
 * Autumn handles subscription management, usage-based billing, and entitlements.
 * Much simpler than raw Stripe integration.
 * 
 * @see https://docs.getautumn.com
 */

import { Autumn } from 'autumn-js';

// ============================================================================
// Configuration
// ============================================================================

const AUTUMN_SECRET_KEY = process.env.AUTUMN_SECRET_KEY;

// Feature IDs configured in Autumn dashboard
export const AUTUMN_FEATURES = {
  // AI features with usage limits
  aiCommits: 'ai-commits',
  aiReviews: 'ai-reviews',
  aiSearches: 'ai-searches',
  aiAgentMessages: 'ai-agent-messages',
  
  // Boolean features (entitlements)
  privateRepos: 'private-repos',
  unlimitedCollaborators: 'unlimited-collaborators',
  prioritySupport: 'priority-support',
  sso: 'sso',
  auditLogs: 'audit-logs',
};

// Product IDs configured in Autumn dashboard
export const AUTUMN_PRODUCTS = {
  free: 'free',
  pro: 'pro',
  team: 'team',
  enterprise: 'enterprise',
};

// ============================================================================
// Autumn Client Initialization
// ============================================================================

let initialized = false;

/**
 * Initialize the Autumn client with secret key
 * Must be called before using any Autumn methods
 */
function ensureInitialized(): boolean {
  if (!AUTUMN_SECRET_KEY) {
    return false;
  }
  
  if (!initialized) {
    // Initialize Autumn with secret key
    // The Autumn class uses static methods after initialization
    new Autumn({
      secretKey: AUTUMN_SECRET_KEY,
    });
    initialized = true;
  }
  
  return true;
}

/**
 * Check if Autumn is configured
 */
export function isAutumnConfigured(): boolean {
  return !!AUTUMN_SECRET_KEY;
}

// ============================================================================
// Customer Management
// ============================================================================

/**
 * Create or get a customer in Autumn
 */
export async function getOrCreateCustomer(
  customerId: string,
  email: string,
  name?: string
): Promise<boolean> {
  if (!ensureInitialized()) return false;
  
  try {
    const result = await Autumn.customers.create({
      id: customerId,
      email,
      name,
    });
    
    return !result.error;
  } catch (error: unknown) {
    // Customer might already exist, which is fine
    console.error('[Autumn] Failed to create customer:', error);
    return true; // Assume exists
  }
}

// ============================================================================
// Feature Checks (Entitlements)
// ============================================================================

export interface FeatureCheckResult {
  allowed: boolean;
  remaining?: number;
  limit?: number;
  unlimited?: boolean;
}

/**
 * Check if a customer can use a feature
 * This is the main function for usage-based billing
 */
export async function checkFeature(
  customerId: string,
  featureId: string
): Promise<FeatureCheckResult> {
  if (!ensureInitialized()) {
    // Autumn not configured, allow everything (development mode)
    return { allowed: true, unlimited: true };
  }
  
  try {
    const result = await Autumn.check({
      customer_id: customerId,
      feature_id: featureId,
    });
    
    if (result.error) {
      console.error(`[Autumn] Feature check error for ${featureId}:`, result.error);
      return { allowed: true, unlimited: false };
    }
    
    return {
      allowed: result.data.allowed,
      remaining: result.data.balance ?? undefined,
      limit: result.data.usage_limit ?? undefined,
      unlimited: result.data.unlimited ?? false,
    };
  } catch (error) {
    console.error(`[Autumn] Feature check failed for ${featureId}:`, error);
    // On error, allow to avoid blocking users
    return { allowed: true, unlimited: false };
  }
}

/**
 * Record usage of a feature
 * Call this after a successful operation
 */
export async function recordUsage(
  customerId: string,
  featureId: string,
  quantity: number = 1
): Promise<boolean> {
  if (!ensureInitialized()) {
    // Autumn not configured, skip tracking
    return true;
  }
  
  try {
    const result = await Autumn.track({
      customer_id: customerId,
      feature_id: featureId,
      value: quantity,
    });
    
    return !result.error;
  } catch (error) {
    console.error(`[Autumn] Usage tracking failed for ${featureId}:`, error);
    return false;
  }
}

// ============================================================================
// Checkout & Billing
// ============================================================================

/**
 * Create a checkout session for a product
 */
export async function createCheckout(
  customerId: string,
  productId: string,
  successUrl: string,
  _cancelUrl?: string
): Promise<{ url: string } | null> {
  if (!ensureInitialized()) {
    return null;
  }
  
  try {
    const result = await Autumn.attach({
      customer_id: customerId,
      product_id: productId,
      success_url: successUrl,
    });
    
    if (result.error || !result.data) {
      console.error('[Autumn] Checkout creation failed:', result.error);
      return null;
    }
    
    return { url: result.data.checkout_url || successUrl };
  } catch (error) {
    console.error('[Autumn] Checkout creation failed:', error);
    return null;
  }
}

/**
 * Get the billing portal URL for a customer
 */
export async function getBillingPortal(
  customerId: string
): Promise<{ url: string } | null> {
  if (!ensureInitialized()) {
    return null;
  }
  
  try {
    const result = await Autumn.customers.billingPortal(customerId, {});
    
    if (result.error || !result.data) {
      console.error('[Autumn] Portal creation failed:', result.error);
      return null;
    }
    
    return { url: result.data.url };
  } catch (error) {
    console.error('[Autumn] Portal creation failed:', error);
    return null;
  }
}

// ============================================================================
// Subscription Info
// ============================================================================

/**
 * Get customer's current subscription/product
 */
export async function getCustomerProduct(
  customerId: string
): Promise<string | null> {
  if (!ensureInitialized()) {
    return 'free';
  }
  
  try {
    const result = await Autumn.customers.get(customerId);
    
    if (result.error || !result.data) {
      return 'free';
    }
    
    // Return the first active product ID or 'free'
    const products = result.data.products || [];
    return products.length > 0 ? products[0].id : 'free';
  } catch {
    return 'free';
  }
}

// ============================================================================
// Convenience Functions for wit Features
// ============================================================================

/**
 * Check if user can create an AI commit message
 */
export async function canUseAICommit(userId: string): Promise<FeatureCheckResult> {
  return checkFeature(userId, AUTUMN_FEATURES.aiCommits);
}

/**
 * Check if user can use AI code review
 */
export async function canUseAIReview(userId: string): Promise<FeatureCheckResult> {
  return checkFeature(userId, AUTUMN_FEATURES.aiReviews);
}

/**
 * Check if user can use semantic search
 */
export async function canUseSearch(userId: string): Promise<FeatureCheckResult> {
  return checkFeature(userId, AUTUMN_FEATURES.aiSearches);
}

/**
 * Check if user can use AI agent
 */
export async function canUseAgent(userId: string): Promise<FeatureCheckResult> {
  return checkFeature(userId, AUTUMN_FEATURES.aiAgentMessages);
}

/**
 * Record AI commit usage
 */
export async function trackAICommit(userId: string): Promise<boolean> {
  return recordUsage(userId, AUTUMN_FEATURES.aiCommits);
}

/**
 * Record AI review usage
 */
export async function trackAIReview(userId: string): Promise<boolean> {
  return recordUsage(userId, AUTUMN_FEATURES.aiReviews);
}

/**
 * Record search usage
 */
export async function trackSearch(userId: string): Promise<boolean> {
  return recordUsage(userId, AUTUMN_FEATURES.aiSearches);
}

/**
 * Record agent message usage
 */
export async function trackAgentMessage(userId: string): Promise<boolean> {
  return recordUsage(userId, AUTUMN_FEATURES.aiAgentMessages);
}

// ============================================================================
// Middleware Helper
// ============================================================================

/**
 * Check and track usage in one call
 * Returns result for checking, and automatically tracks on success
 */
export async function checkAndTrack(
  userId: string,
  featureId: string
): Promise<FeatureCheckResult & { track: () => Promise<boolean> }> {
  const result = await checkFeature(userId, featureId);
  
  return {
    ...result,
    // Call this after successful operation
    track: () => recordUsage(userId, featureId),
  };
}
