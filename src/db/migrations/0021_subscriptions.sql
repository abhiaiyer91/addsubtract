-- Subscription and Monetization Schema
-- This migration adds subscription tiers and AI usage tracking

-- Add subscription fields to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "tier" TEXT DEFAULT 'free' NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "subscription_status" TEXT DEFAULT 'inactive';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "subscription_period_end" TIMESTAMP;

-- Create AI usage tracking table
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "feature" TEXT NOT NULL,
  "count" INTEGER DEFAULT 0 NOT NULL,
  "period_start" TIMESTAMP NOT NULL,
  "period_end" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient usage queries
CREATE INDEX IF NOT EXISTS "ai_usage_user_period_idx" ON "ai_usage"("user_id", "period_start");
CREATE INDEX IF NOT EXISTS "ai_usage_user_feature_idx" ON "ai_usage"("user_id", "feature");
CREATE INDEX IF NOT EXISTS "user_tier_idx" ON "user"("tier");
CREATE INDEX IF NOT EXISTS "user_stripe_customer_idx" ON "user"("stripe_customer_id");

-- Create subscription_events table for webhook logging
CREATE TABLE IF NOT EXISTS "subscription_events" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "stripe_event_id" TEXT UNIQUE,
  "event_type" TEXT NOT NULL,
  "data" JSONB,
  "processed_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "subscription_events_user_idx" ON "subscription_events"("user_id");
CREATE INDEX IF NOT EXISTS "subscription_events_type_idx" ON "subscription_events"("event_type");
