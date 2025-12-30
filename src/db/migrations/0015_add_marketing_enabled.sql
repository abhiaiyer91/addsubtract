-- Create marketing_agent_config table
CREATE TABLE IF NOT EXISTS "marketing_agent_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "repo_id" uuid NOT NULL UNIQUE REFERENCES "repositories"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "prompt" text,
  "generate_on_pr_merge" boolean NOT NULL DEFAULT true,
  "generate_on_release" boolean NOT NULL DEFAULT true,
  "updated_by_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
