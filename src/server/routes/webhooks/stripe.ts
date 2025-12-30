/**
 * Stripe Webhook Handler
 * 
 * Handles Stripe webhook events for subscription management.
 * This keeps user subscription status in sync with Stripe.
 */

import { Hono } from 'hono';
import Stripe from 'stripe';
import {
  verifyWebhookEvent,
  getTierFromSubscription,
  getUserIdFromSubscription,
  mapStripeStatus,
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

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    // Log the event for auditing
    await logWebhookEvent(event);

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
 * User completed payment checkout
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const tier = session.metadata?.tier as 'pro' | 'team' | undefined;
  const subscriptionId = session.subscription as string | undefined;
  const customerId = session.customer as string | undefined;

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
  
  // Map Stripe status to our status
  const status = mapStripeStatus(subscription.status);
  const periodEnd = new Date(subscription.current_period_end * 1000);

  // Update user record
  await db
    .update(user)
    .set({
      tier: tier || 'free',
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      subscriptionStatus: status,
      subscriptionPeriodEnd: periodEnd,
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
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | undefined;
  
  if (!subscriptionId) return;

  console.log(`[Stripe] Payment succeeded for subscription ${subscriptionId}`);

  // Find user by subscription ID and ensure status is active
  const db = getDb();
  await db
    .update(user)
    .set({
      subscriptionStatus: 'active',
      updatedAt: new Date(),
    })
    .where(eq(user.stripeSubscriptionId, subscriptionId));
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | undefined;
  
  if (!subscriptionId) return;

  console.log(`[Stripe] Payment failed for subscription ${subscriptionId}`);

  // Mark subscription as past_due
  const db = getDb();
  await db
    .update(user)
    .set({
      subscriptionStatus: 'past_due',
      updatedAt: new Date(),
    })
    .where(eq(user.stripeSubscriptionId, subscriptionId));

  // TODO: Send email notification about failed payment
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Log webhook event for auditing
 */
async function logWebhookEvent(event: Stripe.Event) {
  try {
    const db = getDb();
    
    // Import the subscription_events table if it exists
    // For now, just log to console
    console.log(`[Stripe Webhook] Logged event: ${event.id} (${event.type})`);
    
    // In production, you'd insert into subscription_events table:
    // await db.insert(subscriptionEvents).values({
    //   id: crypto.randomUUID(),
    //   stripeEventId: event.id,
    //   eventType: event.type,
    //   data: event.data.object,
    //   processedAt: new Date(),
    // });
  } catch (error) {
    console.error('[Stripe Webhook] Failed to log event:', error);
  }
}

// ============================================================================
// Export
// ============================================================================

export default stripeWebhookRouter;
