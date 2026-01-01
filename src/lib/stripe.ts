/**
 * Stripe Integration (Optional)
 * 
 * Direct Stripe access for advanced use cases.
 * For most billing needs, use Autumn (src/lib/autumn.ts) instead.
 */

import Stripe from 'stripe';

// ============================================================================
// Configuration
// ============================================================================

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ============================================================================
// Stripe Client
// ============================================================================

let stripeClient: Stripe | null = null;

/**
 * Get the Stripe client instance
 * Returns null if Stripe is not configured
 */
export function getStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) {
    return null;
  }
  
  if (!stripeClient) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY);
  }
  
  return stripeClient;
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!STRIPE_SECRET_KEY;
}

// ============================================================================
// Webhook Handling
// ============================================================================

/**
 * Verify and parse a Stripe webhook event
 */
export function verifyWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event | null {
  const stripe = getStripe();
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return null;
  
  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return null;
  }
}

/**
 * Extract subscription tier from Stripe metadata
 */
export function getTierFromSubscription(
  subscription: Stripe.Subscription
): 'pro' | 'team' | null {
  const tier = subscription.metadata?.tier;
  if (tier === 'pro' || tier === 'team') {
    return tier;
  }
  return null;
}

/**
 * Extract user ID from Stripe metadata
 */
export function getUserIdFromSubscription(
  subscription: Stripe.Subscription
): string | null {
  return subscription.metadata?.userId || null;
}

// ============================================================================
// Helper Types
// ============================================================================

export type SubscriptionStatus = 
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'unpaid'
  | 'paused';

export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  return status as SubscriptionStatus;
}
