-- Sandbox Settings Migration
-- Adds tables for sandbox configuration, API keys, and session tracking

-- Create sandbox provider enum
DO $$ BEGIN
  CREATE TYPE "sandbox_provider" AS ENUM('e2b', 'daytona', 'docker');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create sandbox network mode enum
DO $$ BEGIN
  CREATE TYPE "sandbox_network_mode" AS ENUM('none', 'restricted', 'full');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Repository sandbox configuration table
CREATE TABLE IF NOT EXISTS "repo_sandbox_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_id" uuid NOT NULL UNIQUE,
  "enabled" boolean DEFAULT false NOT NULL,
  "provider" "sandbox_provider" DEFAULT 'e2b' NOT NULL,
  "network_mode" "sandbox_network_mode" DEFAULT 'none' NOT NULL,
  "default_language" text DEFAULT 'typescript' NOT NULL,
  "memory_mb" integer DEFAULT 2048 NOT NULL,
  "cpu_cores" integer DEFAULT 1 NOT NULL,
  "timeout_minutes" integer DEFAULT 60 NOT NULL,
  "e2b_template_id" text,
  "daytona_snapshot" text,
  "daytona_auto_stop" integer DEFAULT 15 NOT NULL,
  "docker_image" text DEFAULT 'wit-sandbox:latest' NOT NULL,
  "updated_by_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "repo_sandbox_config_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "repositories"("id") ON DELETE cascade ON UPDATE no action
);

-- Sandbox provider API keys table
CREATE TABLE IF NOT EXISTS "repo_sandbox_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_id" uuid NOT NULL,
  "provider" "sandbox_provider" NOT NULL,
  "encrypted_key" text NOT NULL,
  "key_hint" text NOT NULL,
  "created_by_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "repo_sandbox_keys_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "repositories"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "repo_sandbox_keys_repo_id_provider_unique" UNIQUE ("repo_id", "provider")
);

-- Sandbox sessions table
CREATE TABLE IF NOT EXISTS "sandbox_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "provider" "sandbox_provider" NOT NULL,
  "provider_id" text NOT NULL,
  "branch" text,
  "state" text DEFAULT 'running' NOT NULL,
  "metadata" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  "exit_code" integer,
  CONSTRAINT "sandbox_sessions_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "repositories"("id") ON DELETE cascade ON UPDATE no action
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "sandbox_sessions_repo_id_idx" ON "sandbox_sessions" ("repo_id");
CREATE INDEX IF NOT EXISTS "sandbox_sessions_user_id_idx" ON "sandbox_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sandbox_sessions_state_idx" ON "sandbox_sessions" ("state");
CREATE INDEX IF NOT EXISTS "sandbox_sessions_started_at_idx" ON "sandbox_sessions" ("started_at" DESC);
