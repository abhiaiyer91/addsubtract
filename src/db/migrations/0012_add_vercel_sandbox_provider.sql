-- Add 'vercel' to sandbox_provider enum and Vercel-specific columns
-- Vercel Sandbox provides ephemeral compute environments for AI agents

-- Add 'vercel' value to sandbox_provider enum
ALTER TYPE "sandbox_provider" ADD VALUE IF NOT EXISTS 'vercel';

-- Add Vercel-specific columns to repo_sandbox_config
ALTER TABLE "repo_sandbox_config" ADD COLUMN IF NOT EXISTS "vercel_project_id" text;
ALTER TABLE "repo_sandbox_config" ADD COLUMN IF NOT EXISTS "vercel_runtime" text DEFAULT 'node22';
