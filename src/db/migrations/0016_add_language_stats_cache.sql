-- Add cached language statistics to repositories table
-- This avoids expensive per-request calculation of language stats

ALTER TABLE "repositories" ADD COLUMN "language_stats" jsonb;
ALTER TABLE "repositories" ADD COLUMN "language_stats_updated_at" timestamp with time zone;

-- Create index for faster queries on repos with/without language stats
CREATE INDEX IF NOT EXISTS "idx_repositories_language_stats_updated_at" ON "repositories" ("language_stats_updated_at");
