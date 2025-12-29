-- Add email tracking columns to notifications table
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "email_sent" boolean NOT NULL DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "email_sent_at" timestamp with time zone;
