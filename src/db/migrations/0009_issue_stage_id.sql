-- Add stage_id column to issues table for custom stage support
ALTER TABLE "issues" ADD COLUMN "stage_id" uuid;
--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_stage_id_issue_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."issue_stages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Create index for efficient lookups
CREATE INDEX "issues_stage_id_idx" ON "issues" ("stage_id");
--> statement-breakpoint
-- Update existing issues to link to their corresponding stages based on status
UPDATE "issues" i
SET "stage_id" = s.id
FROM "issue_stages" s
WHERE i.repo_id = s.repo_id 
  AND i.status::text = s.key;
