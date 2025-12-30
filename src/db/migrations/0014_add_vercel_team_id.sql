-- Add vercel_team_id column to repo_sandbox_config
-- This is required when using a Vercel personal access token to authenticate

ALTER TABLE "repo_sandbox_config" ADD COLUMN IF NOT EXISTS "vercel_team_id" text;
