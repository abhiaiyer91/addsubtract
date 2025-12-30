/**
 * Stripe Webhook Handler (Optional)
 * 
 * Handles direct Stripe webhook events if you're using Stripe directly.
 * Note: If using Autumn, Autumn handles webhooks automatically.
 */

import { Hono } from 'hono';
import type Stripe from 'stripe';
import {
  verifyWebhookEvent,
  getTierFromSubscription,
  getUserIdFromSubscription,
  isStripeConfigured,
} from '../../../lib/stripe';
import { subscriptionModel } from '../../../db/models';
import { getDb } from '../../../db';
import { user } from '../../../db/auth-schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// Webhook Router
// ============================================================================

export const stripeWebhookRouter = new Hono();

/**
 * Main webhook endpoint
 * POST /webhooks/stripe
 */
stripeWebhookRouter.post('/', async (c) => {
  if (!isStripeConfigured()) {
    return c.json({ error: 'Stripe not configured' }, 400);
  }

  // Get raw body for signature verification
  const payload = await c.req.text();
  const signature = c.req.header('stripe-signature');

  if (!signature) {
    return c.json({ error: 'Missing stripe-signature header' }, 400);
  }

  // Verify webhook signature
  const event = verifyWebhookEvent(payload, signature);
  if (!event) {
    return c.json({ error: 'Invalid webhook signature' }, 400);
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error handling event:', error);
    return c.json({ error: 'Webhook handler failed' }, 500);
  }
});

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle checkout.session.completed
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const tier = session.metadata?.tier as 'pro' | 'team' | undefined;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : undefined;
  const customerId = typeof session.customer === 'string' ? session.customer : undefined;

  if (!userId || !tier) {
    console.error('[Stripe] Checkout completed but missing metadata');
    return;
  }

  console.log(`[Stripe] Checkout completed for user ${userId}, tier: ${tier}`);

  // Update user subscription
  await subscriptionModel.updateUserTier(userId, tier, {
    customerId: customerId || undefined,
    subscriptionId: subscriptionId || undefined,
  });

  // Update subscription status to active
  const db = getDb();
  await db
    .update(user)
    .set({
      subscriptionStatus: 'active',
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

/**
 * Handle subscription created or updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = getUserIdFromSubscription(subscription);
  const tier = getTierFromSubscription(subscription);

  if (!userId) {
    console.error('[Stripe] Subscription updated but no userId in metadata');
    return;
  }

  console.log(`[Stripe] Subscription ${subscription.id} updated for user ${userId}`);

  const db = getDb();
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : undefined;

  // Update user record
  await db
    .update(user)
    .set({
      tier: tier || 'free',
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      subscriptionStatus: subscription.status === 'active' ? 'active' : 'inactive',
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

/**
 * Handle subscription deleted (canceled)
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = getUserIdFromSubscription(subscription);

  if (!userId) {
    console.error('[Stripe] Subscription deleted but no userId in metadata');
    return;
  }

  console.log(`[Stripe] Subscription ${subscription.id} deleted for user ${userId}`);

  const db = getDb();
  
  // Downgrade user to free tier
  await db
    .update(user)
    .set({
      tier: 'free',
      subscriptionStatus: 'canceled',
      stripeSubscriptionId: null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(event: Stripe.Event) {
  console.log(`[Stripe] Payment failed for event ${event.id}`);
  // TODO: Send email notification about failed payment
}

// ============================================================================
// Export
// ============================================================================

export default stripeWebhookRouter;
