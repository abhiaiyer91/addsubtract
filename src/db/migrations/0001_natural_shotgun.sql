CREATE TYPE "public"."agent_message_role" AS ENUM('user', 'assistant', 'tool', 'system');--> statement-breakpoint
CREATE TYPE "public"."agent_mode" AS ENUM('questions', 'pm', 'code');--> statement-breakpoint
CREATE TYPE "public"."agent_session_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."journal_page_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."merge_queue_state" AS ENUM('pending', 'preparing', 'testing', 'ready', 'merging', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."merge_queue_strategy" AS ENUM('sequential', 'optimistic', 'adaptive');--> statement-breakpoint
CREATE TABLE "agent_file_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"message_id" uuid,
	"file_path" text NOT NULL,
	"change_type" text NOT NULL,
	"original_content" text,
	"proposed_content" text,
	"approved" boolean,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "agent_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"repo_id" uuid,
	"branch" text,
	"title" text,
	"status" "agent_session_status" DEFAULT 'active' NOT NULL,
	"mode" "agent_mode" DEFAULT 'questions' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"block_id" text,
	"reply_to_id" uuid,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_page_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"author_id" text NOT NULL,
	"version" integer NOT NULL,
	"change_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text,
	"icon" text,
	"cover_image" text,
	"parent_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "journal_page_status" DEFAULT 'draft' NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "journal_pages_repo_id_slug_unique" UNIQUE("repo_id","slug")
);
--> statement-breakpoint
CREATE TABLE "merge_queue_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"target_branch" text NOT NULL,
	"state" "merge_queue_state" DEFAULT 'preparing' NOT NULL,
	"base_sha" text NOT NULL,
	"merge_sha" text,
	"pr_order" text NOT NULL,
	"commit_graph" text,
	"workflow_run_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "merge_queue_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"target_branch" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"strategy" "merge_queue_strategy" DEFAULT 'adaptive' NOT NULL,
	"max_batch_size" integer DEFAULT 5 NOT NULL,
	"min_wait_seconds" integer DEFAULT 60 NOT NULL,
	"required_checks" text,
	"require_all_checks" boolean DEFAULT false NOT NULL,
	"auto_rebase" boolean DEFAULT true NOT NULL,
	"delete_branch_after_merge" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merge_queue_config_repo_id_target_branch_unique" UNIQUE("repo_id","target_branch")
);
--> statement-breakpoint
CREATE TABLE "merge_queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pr_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"target_branch" text NOT NULL,
	"position" integer NOT NULL,
	"state" "merge_queue_state" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"added_by_id" text NOT NULL,
	"head_sha" text NOT NULL,
	"base_sha" text NOT NULL,
	"speculative_merge_sha" text,
	"batch_id" uuid,
	"touched_files" text,
	"conflict_score" integer,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "merge_queue_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pr_id" uuid,
	"repo_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"previous_state" text,
	"new_state" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_ai_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_hint" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_ai_keys_repo_id_provider_unique" UNIQUE("repo_id","provider")
);
--> statement-breakpoint
ALTER TABLE "pr_comments" ADD COLUMN "start_line" integer;--> statement-breakpoint
ALTER TABLE "pr_comments" ADD COLUMN "end_line" integer;--> statement-breakpoint
ALTER TABLE "pr_comments" ADD COLUMN "is_resolved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_comments" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pr_comments" ADD COLUMN "resolved_by_id" text;--> statement-breakpoint
ALTER TABLE "pr_comments" ADD COLUMN "suggestion" text;--> statement-breakpoint
ALTER TABLE "pr_comments" ADD COLUMN "suggestion_applied" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_comments" ADD COLUMN "suggestion_commit_sha" text;--> statement-breakpoint
ALTER TABLE "agent_file_changes" ADD CONSTRAINT "agent_file_changes_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_file_changes" ADD CONSTRAINT "agent_file_changes_message_id_agent_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_comments" ADD CONSTRAINT "journal_comments_page_id_journal_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."journal_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_comments" ADD CONSTRAINT "journal_comments_reply_to_id_journal_comments_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."journal_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_page_history" ADD CONSTRAINT "journal_page_history_page_id_journal_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."journal_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_pages" ADD CONSTRAINT "journal_pages_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue_batches" ADD CONSTRAINT "merge_queue_batches_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue_batches" ADD CONSTRAINT "merge_queue_batches_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue_config" ADD CONSTRAINT "merge_queue_config_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue_entries" ADD CONSTRAINT "merge_queue_entries_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue_entries" ADD CONSTRAINT "merge_queue_entries_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue_history" ADD CONSTRAINT "merge_queue_history_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_queue_history" ADD CONSTRAINT "merge_queue_history_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_ai_keys" ADD CONSTRAINT "repo_ai_keys_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;