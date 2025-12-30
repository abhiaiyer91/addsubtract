-- Sentinel Code Scanning Migration
-- Adds tables for proactive code scanning and vulnerability detection

-- ============ ENUMS ============

DO $$ BEGIN
  CREATE TYPE "public"."sentinel_scan_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."sentinel_finding_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."sentinel_finding_category" AS ENUM('security', 'performance', 'maintainability', 'reliability', 'accessibility', 'best_practice', 'code_style', 'documentation', 'dependency', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============ TABLES ============

-- Sentinel configuration per repository
CREATE TABLE IF NOT EXISTS "sentinel_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_id" uuid NOT NULL UNIQUE,
  "enabled" boolean DEFAULT false NOT NULL,
  "use_coderabbit" boolean DEFAULT true NOT NULL,
  "use_security_analysis" boolean DEFAULT true NOT NULL,
  "use_code_quality_analysis" boolean DEFAULT true NOT NULL,
  "use_dependency_check" boolean DEFAULT true NOT NULL,
  "auto_create_issues" boolean DEFAULT false NOT NULL,
  "auto_create_issue_severity" text DEFAULT 'high' NOT NULL,
  "branch_patterns" jsonb DEFAULT '["main"]' NOT NULL,
  "exclude_patterns" jsonb DEFAULT '[]' NOT NULL,
  "scan_schedule" text,
  "custom_prompt" text,
  "updated_by_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Sentinel scan records
CREATE TABLE IF NOT EXISTS "sentinel_scans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_id" uuid NOT NULL,
  "status" "sentinel_scan_status" DEFAULT 'pending' NOT NULL,
  "branch" text NOT NULL,
  "commit_sha" text NOT NULL,
  "triggered_by_id" text,
  "is_scheduled" boolean DEFAULT false NOT NULL,
  "files_scanned" integer DEFAULT 0,
  "critical_count" integer DEFAULT 0,
  "high_count" integer DEFAULT 0,
  "medium_count" integer DEFAULT 0,
  "low_count" integer DEFAULT 0,
  "info_count" integer DEFAULT 0,
  "health_score" integer,
  "summary" text,
  "raw_output" jsonb,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Sentinel findings
CREATE TABLE IF NOT EXISTS "sentinel_findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scan_id" uuid NOT NULL,
  "repo_id" uuid NOT NULL,
  "severity" "sentinel_finding_severity" NOT NULL,
  "category" "sentinel_finding_category" NOT NULL,
  "analyzer" text NOT NULL,
  "rule_id" text,
  "file_path" text NOT NULL,
  "line" integer,
  "end_line" integer,
  "column" integer,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "suggestion" text,
  "code_snippet" text,
  "suggested_fix" text,
  "is_dismissed" boolean DEFAULT false NOT NULL,
  "dismissed_reason" text,
  "dismissed_by_id" text,
  "dismissed_at" timestamp with time zone,
  "linked_issue_id" uuid,
  "fingerprint" text NOT NULL,
  "first_seen_commit" text,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ============ FOREIGN KEYS ============

DO $$ BEGIN
  ALTER TABLE "sentinel_config" ADD CONSTRAINT "sentinel_config_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "sentinel_config" ADD CONSTRAINT "sentinel_config_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "sentinel_scans" ADD CONSTRAINT "sentinel_scans_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "sentinel_scans" ADD CONSTRAINT "sentinel_scans_triggered_by_id_user_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "sentinel_findings" ADD CONSTRAINT "sentinel_findings_scan_id_sentinel_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."sentinel_scans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "sentinel_findings" ADD CONSTRAINT "sentinel_findings_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "sentinel_findings" ADD CONSTRAINT "sentinel_findings_dismissed_by_id_user_id_fk" FOREIGN KEY ("dismissed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "sentinel_findings" ADD CONSTRAINT "sentinel_findings_linked_issue_id_issues_id_fk" FOREIGN KEY ("linked_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============ INDEXES ============

CREATE INDEX IF NOT EXISTS "idx_sentinel_config_repo_id" ON "sentinel_config" USING btree ("repo_id");
CREATE INDEX IF NOT EXISTS "idx_sentinel_scans_repo_id" ON "sentinel_scans" USING btree ("repo_id");
CREATE INDEX IF NOT EXISTS "idx_sentinel_scans_status" ON "sentinel_scans" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_sentinel_scans_created_at" ON "sentinel_scans" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_sentinel_findings_scan_id" ON "sentinel_findings" USING btree ("scan_id");
CREATE INDEX IF NOT EXISTS "idx_sentinel_findings_repo_id" ON "sentinel_findings" USING btree ("repo_id");
CREATE INDEX IF NOT EXISTS "idx_sentinel_findings_severity" ON "sentinel_findings" USING btree ("severity");
CREATE INDEX IF NOT EXISTS "idx_sentinel_findings_category" ON "sentinel_findings" USING btree ("category");
CREATE INDEX IF NOT EXISTS "idx_sentinel_findings_fingerprint" ON "sentinel_findings" USING btree ("fingerprint");
CREATE INDEX IF NOT EXISTS "idx_sentinel_findings_file_path" ON "sentinel_findings" USING btree ("file_path");
