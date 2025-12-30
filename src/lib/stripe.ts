/**
 * Stripe Integration
 * 
 * Handles payment processing, subscriptions, and billing portal.
 */

import Stripe from 'stripe';

// ============================================================================
// Configuration
// ============================================================================

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Price IDs from Stripe Dashboard
export const STRIPE_PRICES = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly',
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL || 'price_pro_annual',
  },
  team: {
    monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY || 'price_team_monthly',
    annual: process.env.STRIPE_PRICE_TEAM_ANNUAL || 'price_team_annual',
  },
};

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
    stripeClient = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-05-28.basil',
      typescript: true,
    });
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
// Customer Management
// ============================================================================

/**
 * Create or retrieve a Stripe customer for a user
 */
export async function getOrCreateCustomer(
  userId: string,
  email: string,
  name?: string
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  
  // Check if customer already exists
  const existing = await stripe.customers.list({
    email,
    limit: 1,
  });
  
  if (existing.data.length > 0) {
    return existing.data[0].id;
  }
  
  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      userId,
    },
  });
  
  return customer.id;
}

/**
 * Get customer by Stripe customer ID
 */
export async function getCustomer(customerId: string): Promise<Stripe.Customer | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return customer as Stripe.Customer;
  } catch {
    return null;
  }
}

// ============================================================================
// Checkout Sessions
// ============================================================================

export interface CreateCheckoutOptions {
  userId: string;
  email: string;
  tier: 'pro' | 'team';
  interval: 'monthly' | 'annual';
  successUrl: string;
  cancelUrl: string;
  quantity?: number; // For team tier (number of seats)
}

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession(
  options: CreateCheckoutOptions
): Promise<{ url: string | null; sessionId: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  
  const { userId, email, tier, interval, successUrl, cancelUrl, quantity = 1 } = options;
  
  // Get or create customer
  const customerId = await getOrCreateCustomer(userId, email);
  if (!customerId) return null;
  
  const priceId = STRIPE_PRICES[tier][interval];
  
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: tier === 'team' ? quantity : 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      tier,
      interval,
    },
    subscription_data: {
      metadata: {
        userId,
        tier,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    tax_id_collection: {
      enabled: true,
    },
  });
  
  return {
    url: session.url,
    sessionId: session.id,
  };
}

// ============================================================================
// Billing Portal
// ============================================================================

/**
 * Create a billing portal session for managing subscription
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  
  return session.url;
}

// ============================================================================
// Subscription Management
// ============================================================================

/**
 * Get subscription details
 */
export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

/**
 * Cancel a subscription at period end
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Resume a canceled subscription
 */
export async function resumeSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

/**
 * Update subscription quantity (for team tier)
 */
export async function updateSubscriptionQuantity(
  subscriptionId: string,
  quantity: number
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = subscription.items.data[0]?.id;
  
  if (!itemId) return null;
  
  return stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: itemId,
        quantity,
      },
    ],
    proration_behavior: 'create_prorations',
  });
}

// ============================================================================
// Webhook Handling
// ============================================================================

export interface WebhookEvent {
  type: string;
  data: {
    object: Stripe.Subscription | Stripe.Invoice | Stripe.Checkout.Session;
  };
}

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
// Usage-Based Billing (Optional Feature)
// ============================================================================

/**
 * Report usage for metered billing (if enabled)
 * This would be used for pay-per-use AI credits
 */
export async function reportUsage(
  subscriptionItemId: string,
  quantity: number,
  timestamp?: number
): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return false;
  
  try {
    await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity,
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      action: 'increment',
    });
    return true;
  } catch {
    return false;
  }
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
