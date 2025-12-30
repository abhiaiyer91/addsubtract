-- Performance Indexes Migration
-- Adds indexes to improve query performance across the application

-- REPOSITORIES
CREATE INDEX IF NOT EXISTS "idx_repositories_owner" ON "repositories" ("owner_id", "owner_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repositories_owner_name" ON "repositories" ("owner_id", "name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repositories_is_private" ON "repositories" ("is_private");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repositories_forked_from" ON "repositories" ("forked_from_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repositories_updated_at" ON "repositories" ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repositories_pushed_at" ON "repositories" ("pushed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_repositories_stars_count" ON "repositories" ("stars_count");--> statement-breakpoint

-- ISSUES
CREATE INDEX IF NOT EXISTS "idx_issues_repo_id" ON "issues" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_repo_state" ON "issues" ("repo_id", "state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_repo_number" ON "issues" ("repo_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_repo_status" ON "issues" ("repo_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_repo_stage" ON "issues" ("repo_id", "stage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_author" ON "issues" ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_assignee" ON "issues" ("assignee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_project" ON "issues" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_cycle" ON "issues" ("cycle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_parent" ON "issues" ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_milestone" ON "issues" ("milestone_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issues_repo_created_at" ON "issues" ("repo_id", "created_at");--> statement-breakpoint

-- PULL REQUESTS
CREATE INDEX IF NOT EXISTS "idx_pull_requests_repo_id" ON "pull_requests" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_repo_state" ON "pull_requests" ("repo_id", "state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_repo_number" ON "pull_requests" ("repo_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_author" ON "pull_requests" ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_milestone" ON "pull_requests" ("milestone_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_stack" ON "pull_requests" ("stack_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_repo_created_at" ON "pull_requests" ("repo_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_head_sha" ON "pull_requests" ("head_sha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_repo_target_branch" ON "pull_requests" ("repo_id", "target_branch");--> statement-breakpoint

-- NOTIFICATIONS
CREATE INDEX IF NOT EXISTS "idx_notifications_user_id" ON "notifications" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_user_read" ON "notifications" ("user_id", "read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_user_created_at" ON "notifications" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_email_sent" ON "notifications" ("email_sent");--> statement-breakpoint

-- WORKFLOW RUNS
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_repo_id" ON "workflow_runs" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_repo_created_at" ON "workflow_runs" ("repo_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_repo_commit_sha" ON "workflow_runs" ("repo_id", "commit_sha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_state" ON "workflow_runs" ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_repo_state" ON "workflow_runs" ("repo_id", "state");--> statement-breakpoint

-- JOB RUNS
CREATE INDEX IF NOT EXISTS "idx_job_runs_workflow_run_id" ON "job_runs" ("workflow_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_runs_workflow_run_state" ON "job_runs" ("workflow_run_id", "state");--> statement-breakpoint

-- STEP RUNS
CREATE INDEX IF NOT EXISTS "idx_step_runs_job_run_id" ON "step_runs" ("job_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_step_runs_job_run_step_number" ON "step_runs" ("job_run_id", "step_number");--> statement-breakpoint

-- PR REVIEWS
CREATE INDEX IF NOT EXISTS "idx_pr_reviews_pr_id" ON "pr_reviews" ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_reviews_pr_created_at" ON "pr_reviews" ("pr_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_reviews_pr_user" ON "pr_reviews" ("pr_id", "user_id");--> statement-breakpoint

-- PR COMMENTS
CREATE INDEX IF NOT EXISTS "idx_pr_comments_pr_id" ON "pr_comments" ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_comments_pr_created_at" ON "pr_comments" ("pr_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_comments_pr_path" ON "pr_comments" ("pr_id", "path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_comments_review_id" ON "pr_comments" ("review_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_comments_reply_to_id" ON "pr_comments" ("reply_to_id");--> statement-breakpoint

-- PR REVIEWERS
CREATE INDEX IF NOT EXISTS "idx_pr_reviewers_pr_id" ON "pr_reviewers" ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_reviewers_user_state" ON "pr_reviewers" ("user_id", "state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_reviewers_user_pending" ON "pr_reviewers" ("user_id");--> statement-breakpoint

-- ISSUE COMMENTS
CREATE INDEX IF NOT EXISTS "idx_issue_comments_issue_id" ON "issue_comments" ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issue_comments_issue_created_at" ON "issue_comments" ("issue_id", "created_at");--> statement-breakpoint

-- ACTIVITIES
CREATE INDEX IF NOT EXISTS "idx_activities_actor_id" ON "activities" ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activities_actor_created_at" ON "activities" ("actor_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activities_repo_id" ON "activities" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activities_repo_created_at" ON "activities" ("repo_id", "created_at");--> statement-breakpoint

-- ISSUE ACTIVITIES
CREATE INDEX IF NOT EXISTS "idx_issue_activities_issue_id" ON "issue_activities" ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issue_activities_issue_created_at" ON "issue_activities" ("issue_id", "created_at");--> statement-breakpoint

-- STARS
CREATE INDEX IF NOT EXISTS "idx_stars_user_id" ON "stars" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stars_user_created_at" ON "stars" ("user_id", "created_at");--> statement-breakpoint

-- WATCHES
CREATE INDEX IF NOT EXISTS "idx_watches_user_id" ON "watches" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_watches_user_created_at" ON "watches" ("user_id", "created_at");--> statement-breakpoint

-- LABELS
CREATE INDEX IF NOT EXISTS "idx_labels_repo_id" ON "labels" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_labels_repo_name" ON "labels" ("repo_id", "name");--> statement-breakpoint

-- COLLABORATORS
CREATE INDEX IF NOT EXISTS "idx_collaborators_user_id" ON "collaborators" ("user_id");--> statement-breakpoint

-- MERGE QUEUE ENTRIES
CREATE INDEX IF NOT EXISTS "idx_merge_queue_entries_pr_id" ON "merge_queue_entries" ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merge_queue_entries_repo_target_branch_position" ON "merge_queue_entries" ("repo_id", "target_branch", "position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merge_queue_entries_repo_state" ON "merge_queue_entries" ("repo_id", "state");--> statement-breakpoint

-- AGENT SESSIONS
CREATE INDEX IF NOT EXISTS "idx_agent_sessions_user_id" ON "agent_sessions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_sessions_user_created_at" ON "agent_sessions" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_sessions_repo_id" ON "agent_sessions" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_sessions_status" ON "agent_sessions" ("status");
