-- Admin Portal Migration
-- Adds admin roles, audit logging, and system metrics tables

-- Add admin fields to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspended" boolean DEFAULT false NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspended_reason" text;

-- Admin Audit Logs table
CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "admin_id" text NOT NULL REFERENCES "user"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "description" text NOT NULL,
  "metadata" jsonb,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "admin_audit_logs_admin_id_idx" ON "admin_audit_logs"("admin_id");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_target_type_idx" ON "admin_audit_logs"("target_type");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_target_id_idx" ON "admin_audit_logs"("target_id");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- System Settings table
CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "description" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "updated_by" text REFERENCES "user"("id") ON DELETE SET NULL
);

-- Feature Flags table
CREATE TABLE IF NOT EXISTS "feature_flags" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "description" text,
  "enabled" boolean DEFAULT false NOT NULL,
  "rollout_percentage" integer DEFAULT 0,
  "allowed_users" jsonb DEFAULT '[]',
  "blocked_users" jsonb DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "feature_flags_name_idx" ON "feature_flags"("name");

-- System Metrics Snapshots table
CREATE TABLE IF NOT EXISTS "system_metrics_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "timestamp" timestamp DEFAULT now() NOT NULL,
  "total_users" integer DEFAULT 0 NOT NULL,
  "active_users" integer DEFAULT 0 NOT NULL,
  "total_repos" integer DEFAULT 0 NOT NULL,
  "public_repos" integer DEFAULT 0 NOT NULL,
  "private_repos" integer DEFAULT 0 NOT NULL,
  "total_orgs" integer DEFAULT 0 NOT NULL,
  "total_prs" integer DEFAULT 0 NOT NULL,
  "total_issues" integer DEFAULT 0 NOT NULL,
  "total_commits" integer DEFAULT 0 NOT NULL,
  "total_workflow_runs" integer DEFAULT 0 NOT NULL,
  "successful_workflow_runs" integer DEFAULT 0 NOT NULL,
  "failed_workflow_runs" integer DEFAULT 0 NOT NULL,
  "total_agent_sessions" integer DEFAULT 0 NOT NULL,
  "total_agent_tokens" integer DEFAULT 0 NOT NULL,
  "total_storage_used" text
);

CREATE INDEX IF NOT EXISTS "system_metrics_snapshots_timestamp_idx" ON "system_metrics_snapshots"("timestamp");

-- Login Attempts table (for security monitoring)
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "success" boolean NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "failure_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "login_attempts_email_idx" ON "login_attempts"("email");
CREATE INDEX IF NOT EXISTS "login_attempts_user_id_idx" ON "login_attempts"("user_id");
CREATE INDEX IF NOT EXISTS "login_attempts_ip_address_idx" ON "login_attempts"("ip_address");
CREATE INDEX IF NOT EXISTS "login_attempts_created_at_idx" ON "login_attempts"("created_at");
