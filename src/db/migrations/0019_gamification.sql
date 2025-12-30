-- Gamification System Migration
-- Adds XP, levels, achievements, and leaderboards

-- ============ ADD NEW NOTIFICATION TYPES ============

-- Add new notification types for gamification
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'achievement_unlocked';
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'level_up';

-- ============ ENUMS ============

DO $$ BEGIN
  CREATE TYPE "public"."achievement_category" AS ENUM('commits', 'pull_requests', 'reviews', 'issues', 'collaboration', 'streaks', 'milestones', 'special');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."achievement_rarity" AS ENUM('common', 'uncommon', 'rare', 'epic', 'legendary');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============ TABLES ============

-- Achievement definitions
CREATE TABLE IF NOT EXISTS "achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "category" "achievement_category" NOT NULL,
  "rarity" "achievement_rarity" NOT NULL,
  "xp_reward" integer DEFAULT 100 NOT NULL,
  "icon" text NOT NULL,
  "is_secret" boolean DEFAULT false NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- User achievements (unlocked achievements per user)
CREATE TABLE IF NOT EXISTS "user_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "achievement_id" uuid NOT NULL,
  "unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "context" text,
  CONSTRAINT "user_achievements_user_achievement_unique" UNIQUE("user_id", "achievement_id")
);

-- User gamification stats (XP, level, streaks)
CREATE TABLE IF NOT EXISTS "user_gamification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL UNIQUE,
  "total_xp" integer DEFAULT 0 NOT NULL,
  "level" integer DEFAULT 1 NOT NULL,
  "xp_to_next_level" integer DEFAULT 100 NOT NULL,
  "current_streak" integer DEFAULT 0 NOT NULL,
  "longest_streak" integer DEFAULT 0 NOT NULL,
  "last_activity_date" timestamp with time zone,
  "total_commits" integer DEFAULT 0 NOT NULL,
  "total_prs_opened" integer DEFAULT 0 NOT NULL,
  "total_prs_merged" integer DEFAULT 0 NOT NULL,
  "total_reviews" integer DEFAULT 0 NOT NULL,
  "total_issues_opened" integer DEFAULT 0 NOT NULL,
  "total_issues_closed" integer DEFAULT 0 NOT NULL,
  "total_comments" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- XP events log
CREATE TABLE IF NOT EXISTS "xp_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "activity_type" text NOT NULL,
  "xp_amount" integer NOT NULL,
  "description" text,
  "related_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ============ FOREIGN KEYS ============

DO $$ BEGIN
  ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_gamification" ADD CONSTRAINT "user_gamification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============ INDEXES ============

CREATE INDEX IF NOT EXISTS "idx_user_achievements_user_id" ON "user_achievements" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_achievements_unlocked_at" ON "user_achievements" USING btree ("unlocked_at");
CREATE INDEX IF NOT EXISTS "idx_user_gamification_level" ON "user_gamification" USING btree ("level");
CREATE INDEX IF NOT EXISTS "idx_user_gamification_total_xp" ON "user_gamification" USING btree ("total_xp");
CREATE INDEX IF NOT EXISTS "idx_xp_events_user_id" ON "xp_events" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_xp_events_created_at" ON "xp_events" USING btree ("created_at");

-- ============ SEED DEFAULT ACHIEVEMENTS ============

INSERT INTO "achievements" ("key", "name", "description", "category", "rarity", "xp_reward", "icon", "is_secret", "display_order") VALUES
  -- Commits
  ('first_commit', 'First Steps', 'Make your first commit', 'commits', 'common', 50, '🚀', false, 1),
  ('commits_10', 'Getting Started', 'Make 10 commits', 'commits', 'common', 100, '📝', false, 2),
  ('commits_100', 'Committed Developer', 'Make 100 commits', 'commits', 'uncommon', 250, '💪', false, 3),
  ('commits_500', 'Code Machine', 'Make 500 commits', 'commits', 'rare', 500, '🤖', false, 4),
  ('commits_1000', 'Thousand Lines', 'Make 1,000 commits', 'commits', 'epic', 1000, '🏆', false, 5),
  ('commits_5000', 'Code Legend', 'Make 5,000 commits', 'commits', 'legendary', 2500, '👑', false, 6),
  
  -- Pull Requests
  ('first_pr', 'Pull Request Pioneer', 'Open your first pull request', 'pull_requests', 'common', 75, '🔀', false, 10),
  ('first_pr_merged', 'Merger', 'Get your first pull request merged', 'pull_requests', 'common', 100, '✅', false, 11),
  ('prs_merged_10', 'Serial Merger', 'Get 10 pull requests merged', 'pull_requests', 'uncommon', 300, '🔄', false, 12),
  ('prs_merged_50', 'Merge Master', 'Get 50 pull requests merged', 'pull_requests', 'rare', 750, '🎯', false, 13),
  ('prs_merged_100', 'PR Pro', 'Get 100 pull requests merged', 'pull_requests', 'epic', 1500, '⭐', false, 14),
  ('prs_merged_500', 'Merge Legend', 'Get 500 pull requests merged', 'pull_requests', 'legendary', 3000, '🌟', false, 15),
  
  -- Reviews
  ('first_review', 'Code Reviewer', 'Submit your first code review', 'reviews', 'common', 50, '👀', false, 20),
  ('reviews_10', 'Helpful Reviewer', 'Submit 10 code reviews', 'reviews', 'uncommon', 200, '🔍', false, 21),
  ('reviews_50', 'Review Champion', 'Submit 50 code reviews', 'reviews', 'rare', 500, '🏅', false, 22),
  ('reviews_100', 'Quality Guardian', 'Submit 100 code reviews', 'reviews', 'epic', 1000, '🛡️', false, 23),
  ('reviews_500', 'Grand Reviewer', 'Submit 500 code reviews', 'reviews', 'legendary', 2500, '📜', false, 24),
  
  -- Issues
  ('first_issue', 'Bug Hunter', 'Open your first issue', 'issues', 'common', 50, '🐛', false, 30),
  ('issues_10', 'Issue Tracker', 'Open 10 issues', 'issues', 'uncommon', 150, '📋', false, 31),
  ('issues_closed_10', 'Problem Solver', 'Close 10 issues', 'issues', 'uncommon', 200, '🔧', false, 32),
  ('issues_closed_50', 'Bug Exterminator', 'Close 50 issues', 'issues', 'rare', 500, '🎯', false, 33),
  ('issues_closed_100', 'Issue Master', 'Close 100 issues', 'issues', 'epic', 1000, '💎', false, 34),
  
  -- Collaboration
  ('first_comment', 'Conversationalist', 'Leave your first comment', 'collaboration', 'common', 25, '💬', false, 40),
  ('comments_100', 'Active Discusser', 'Leave 100 comments', 'collaboration', 'uncommon', 300, '🗣️', false, 41),
  ('first_repo', 'Repository Creator', 'Create your first repository', 'collaboration', 'common', 75, '📁', false, 42),
  ('repos_10', 'Prolific Creator', 'Create 10 repositories', 'collaboration', 'rare', 500, '🏗️', false, 43),
  ('first_star_received', 'Rising Star', 'Receive your first star on a repository', 'collaboration', 'uncommon', 100, '⭐', false, 44),
  ('stars_received_100', 'Star Collector', 'Receive 100 stars across all repositories', 'collaboration', 'epic', 1500, '🌟', false, 45),
  ('first_fork', 'Forker', 'Fork a repository for the first time', 'collaboration', 'common', 50, '🍴', false, 46),
  
  -- Streaks
  ('streak_7', 'Week Warrior', 'Maintain a 7-day activity streak', 'streaks', 'uncommon', 200, '🔥', false, 50),
  ('streak_30', 'Monthly Master', 'Maintain a 30-day activity streak', 'streaks', 'rare', 500, '🌋', false, 51),
  ('streak_90', 'Quarterly Champion', 'Maintain a 90-day activity streak', 'streaks', 'epic', 1500, '💥', false, 52),
  ('streak_365', 'Year of Code', 'Maintain a 365-day activity streak', 'streaks', 'legendary', 5000, '🎆', false, 53),
  
  -- Milestones
  ('level_10', 'Rising Developer', 'Reach level 10', 'milestones', 'uncommon', 250, '📈', false, 60),
  ('level_25', 'Experienced Coder', 'Reach level 25', 'milestones', 'rare', 750, '🚀', false, 61),
  ('level_50', 'Master Developer', 'Reach level 50', 'milestones', 'epic', 2000, '🎖️', false, 62),
  ('level_100', 'Legendary Status', 'Reach level 100', 'milestones', 'legendary', 10000, '👑', false, 63),
  ('first_release', 'Releaser', 'Publish your first release', 'milestones', 'uncommon', 200, '📦', false, 64),
  
  -- Special/Secret
  ('night_owl', 'Night Owl', 'Make a commit between midnight and 4 AM', 'special', 'uncommon', 100, '🦉', true, 70),
  ('early_bird', 'Early Bird', 'Make a commit between 5 AM and 7 AM', 'special', 'uncommon', 100, '🐦', true, 71),
  ('weekend_warrior', 'Weekend Warrior', 'Make commits on both Saturday and Sunday in the same weekend', 'special', 'uncommon', 75, '⚔️', true, 72),
  ('new_year_commit', 'New Year Coder', 'Make a commit on January 1st', 'special', 'rare', 250, '🎉', true, 73),
  ('halloween_commit', 'Spooky Coder', 'Make a commit on Halloween (October 31st)', 'special', 'rare', 150, '🎃', true, 74),
  ('speedrun', 'Speedrunner', 'Open and merge a PR within 10 minutes', 'special', 'rare', 200, '⚡', true, 75),
  ('perfectionist', 'Perfectionist', 'Get a PR approved with no requested changes', 'special', 'uncommon', 100, '✨', false, 76),
  ('ai_native', 'AI Native', 'Use wit ai commit for 10 commits', 'special', 'uncommon', 150, '🤖', false, 77),
  ('polyglot', 'Polyglot', 'Commit code in 5 different programming languages', 'special', 'rare', 300, '🌐', false, 78),
  ('community_contributor', 'Community Contributor', 'Get a PR merged in a repository you don''t own', 'special', 'uncommon', 200, '🤝', false, 79)
ON CONFLICT ("key") DO NOTHING;
