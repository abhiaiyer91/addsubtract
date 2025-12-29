-- Issue Stages table for custom workflow stages per repository
-- Allows users to define their own stages beyond the default Linear-style ones
CREATE TABLE "issue_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT '○' NOT NULL,
	"color" text DEFAULT '6b7280' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_closed_state" boolean DEFAULT false NOT NULL,
	"is_triage_state" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_stages_repo_id_key_unique" UNIQUE("repo_id","key")
);
--> statement-breakpoint
ALTER TABLE "issue_stages" ADD CONSTRAINT "issue_stages_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Create default stages for existing repositories
INSERT INTO "issue_stages" ("repo_id", "key", "name", "icon", "color", "position", "is_closed_state", "is_triage_state", "is_default", "is_system")
SELECT 
  r.id,
  stage.key,
  stage.name,
  stage.icon,
  stage.color,
  stage.position,
  stage.is_closed_state,
  stage.is_triage_state,
  stage.is_default,
  true
FROM repositories r
CROSS JOIN (
  VALUES 
    ('triage', 'Triage', '◇', '9ca3af', 0, false, true, false),
    ('backlog', 'Backlog', '○', '6b7280', 1, false, false, true),
    ('todo', 'Todo', '◔', 'f59e0b', 2, false, false, false),
    ('in_progress', 'In Progress', '◑', '3b82f6', 3, false, false, false),
    ('in_review', 'In Review', '◕', '8b5cf6', 4, false, false, false),
    ('done', 'Done', '●', '22c55e', 5, true, false, false),
    ('canceled', 'Canceled', '⊘', 'ef4444', 6, true, false, false)
) AS stage(key, name, icon, color, position, is_closed_state, is_triage_state, is_default);
