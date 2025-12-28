CREATE TABLE "triage_agent_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"prompt" text,
	"auto_assign_labels" boolean DEFAULT true NOT NULL,
	"auto_assign_users" boolean DEFAULT false NOT NULL,
	"auto_set_priority" boolean DEFAULT true NOT NULL,
	"add_triage_comment" boolean DEFAULT true NOT NULL,
	"updated_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "triage_agent_config_repo_id_unique" UNIQUE("repo_id")
);
--> statement-breakpoint
CREATE TABLE "triage_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"assigned_labels" text,
	"assigned_user_id" text,
	"assigned_priority" text,
	"reasoning" text,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_members" DROP CONSTRAINT "org_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "merge_queue_config" ADD COLUMN "auto_merge_mode" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "merge_queue_config" ADD COLUMN "merge_window_start" integer;--> statement-breakpoint
ALTER TABLE "merge_queue_config" ADD COLUMN "merge_window_end" integer;--> statement-breakpoint
ALTER TABLE "merge_queue_config" ADD COLUMN "merge_window_days" text;--> statement-breakpoint
ALTER TABLE "triage_agent_config" ADD CONSTRAINT "triage_agent_config_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_agent_runs" ADD CONSTRAINT "triage_agent_runs_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_agent_runs" ADD CONSTRAINT "triage_agent_runs_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;