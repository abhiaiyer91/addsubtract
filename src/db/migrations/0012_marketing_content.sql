-- Marketing Content Migration
-- Adds tables for storing AI-generated social media content from PRs and releases

-- Create marketing content status enum
DO $$ BEGIN
  CREATE TYPE "marketing_content_status" AS ENUM('pending', 'approved', 'posted', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create marketing content source enum
DO $$ BEGIN
  CREATE TYPE "marketing_content_source" AS ENUM('pr_merged', 'release_published');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Marketing content table
CREATE TABLE IF NOT EXISTS "marketing_content" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_id" uuid NOT NULL,
  "source_type" "marketing_content_source" NOT NULL,
  "source_id" text NOT NULL,
  "source_ref" text NOT NULL,
  "tweet" text NOT NULL,
  "thread" jsonb,
  "status" "marketing_content_status" DEFAULT 'pending' NOT NULL,
  "posted_at" timestamp with time zone,
  "posted_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketing_content_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "repositories"("id") ON DELETE cascade ON UPDATE no action
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "marketing_content_repo_id_idx" ON "marketing_content" ("repo_id");
CREATE INDEX IF NOT EXISTS "marketing_content_status_idx" ON "marketing_content" ("status");
CREATE INDEX IF NOT EXISTS "marketing_content_source_idx" ON "marketing_content" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "marketing_content_created_at_idx" ON "marketing_content" ("created_at" DESC);
