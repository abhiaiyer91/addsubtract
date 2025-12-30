import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uuid,
  primaryKey,
  unique,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// Import better-auth user table for foreign key references
import { user as authUser } from './auth-schema';

// ============ ENUMS ============

export const ownerTypeEnum = pgEnum('owner_type', ['user', 'organization']);
export const prStateEnum = pgEnum('pr_state', ['open', 'closed', 'merged']);
export const issueStateEnum = pgEnum('issue_state', ['open', 'closed']);
export const issueStatusEnum = pgEnum('issue_status', [
  'triage',
  'backlog',
  'todo', 
  'in_progress',
  'in_review',
  'done',
  'canceled',
]);

// Issue priority levels (Linear-style)
export const issuePriorityEnum = pgEnum('issue_priority', [
  'none',
  'low',
  'medium',
  'high',
  'urgent',
]);

// Issue relation types for dependencies
export const issueRelationTypeEnum = pgEnum('issue_relation_type', [
  'blocks',
  'blocked_by',
  'relates_to',
  'duplicates',
  'duplicated_by',
]);

// Project status (Linear-style)
export const projectStatusEnum = pgEnum('project_status', [
  'backlog',
  'planned',
  'in_progress',
  'paused',
  'completed',
  'canceled',
]);

// Project health for updates
export const projectHealthEnum = pgEnum('project_health', [
  'on_track',
  'at_risk',
  'off_track',
]);
export const milestoneStateEnum = pgEnum('milestone_state', ['open', 'closed']);
export const reviewStateEnum = pgEnum('review_state', [
  'pending',
  'approved',
  'changes_requested',
  'commented',
]);
export const permissionEnum = pgEnum('permission', ['read', 'write', 'admin']);
export const orgRoleEnum = pgEnum('org_role', ['member', 'admin', 'owner']);

/**
 * Workflow run state enum
 * Tracks the lifecycle state of workflow, job, and step runs
 */
export const workflowRunStateEnum = pgEnum('workflow_run_state', [
  'queued',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);

/**
 * Merge queue entry state enum
 * Tracks the lifecycle of PRs in the merge queue
 */
export const mergeQueueStateEnum = pgEnum('merge_queue_state', [
  'pending',      // Waiting in queue
  'preparing',    // Building merge commit / running pre-merge checks
  'testing',      // Running CI on the speculative merge
  'ready',        // All checks passed, ready to merge
  'merging',      // Actively merging
  'completed',    // Successfully merged
  'failed',       // Failed to merge (conflicts or CI failure)
  'cancelled',    // Removed from queue
]);

/**
 * Merge queue strategy enum
 * How commits should be reassembled when merging
 */
export const mergeQueueStrategyEnum = pgEnum('merge_queue_strategy', [
  'sequential',   // Merge PRs one at a time in order
  'optimistic',   // Speculatively merge batches, rollback on failure
  'adaptive',     // AI-driven: analyze conflicts and determine best order
]);

// ============ USERS ============
// Note: The primary user table is now in auth-schema.ts (better-auth)
// The legacy 'users' table below is kept for backward compatibility but should not be used for new code
// All new user references should use the 'user' table from auth-schema.ts

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  location: text('location'),
  website: text('website'),
  passwordHash: text('password_hash'), // null for OAuth-only users
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Legacy auth tables - kept for migration compatibility but not used
// Better-auth tables (session, account, verification) are in auth-schema.ts
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'github', 'google', etc.
    providerAccountId: text('provider_account_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => ({
    uniqueProvider: unique().on(table.provider, table.providerAccountId),
  })
);

// ============ SSH KEYS ============

export const sshKeys = pgTable('ssh_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  publicKey: text('public_key').notNull(),
  fingerprint: text('fingerprint').notNull().unique(),
  keyType: text('key_type').notNull(), // ssh-rsa, ssh-ed25519, ecdsa-sha2-nistp256, etc.
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ PERSONAL ACCESS TOKENS ============

export const personalAccessTokens = pgTable('personal_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // User-provided name like "CI Token"
  tokenHash: text('token_hash').notNull(), // SHA256 hash (never store raw!)
  tokenPrefix: text('token_prefix').notNull(), // First 8 chars: "wit_abc1" for identification
  scopes: text('scopes').notNull(), // JSON array: ["repo:read", "repo:write"]
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // null = never expires
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ ORGANIZATIONS ============

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(), // URL slug
  displayName: text('display_name').notNull(),
  description: text('description'),
  avatarUrl: text('avatar_url'),
  website: text('website'),
  location: text('location'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orgMembers = pgTable(
  'org_members',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull(),
    role: orgRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
  })
);

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId] }),
  })
);

// ============ BRANCH PROTECTION RULES ============

export const branchProtectionRules = pgTable('branch_protection_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(), // e.g., "main", "release/*"
  requirePullRequest: boolean('require_pull_request').notNull().default(true),
  requiredReviewers: integer('required_reviewers').notNull().default(1),
  requireStatusChecks: boolean('require_status_checks').notNull().default(false),
  requiredStatusChecks: text('required_status_checks'), // JSON array of check names
  allowForcePush: boolean('allow_force_push').notNull().default(false),
  allowDeletion: boolean('allow_deletion').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ REPOSITORIES ============

export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Owner can be user or org (references better-auth user.id)
  ownerId: text('owner_id').notNull(),
  ownerType: ownerTypeEnum('owner_type').notNull(),

  name: text('name').notNull(),
  description: text('description'),

  isPrivate: boolean('is_private').notNull().default(false),
  isFork: boolean('is_fork').notNull().default(false),
  forkedFromId: uuid('forked_from_id').references((): any => repositories.id),

  defaultBranch: text('default_branch').notNull().default('main'),

  // Cached stats
  starsCount: integer('stars_count').notNull().default(0),
  forksCount: integer('forks_count').notNull().default(0),
  watchersCount: integer('watchers_count').notNull().default(0),
  openIssuesCount: integer('open_issues_count').notNull().default(0),
  openPrsCount: integer('open_prs_count').notNull().default(0),

  // Cached language stats (JSON array of {language, percentage, color, bytes})
  // Updated on push to avoid expensive per-request calculation
  languageStats: jsonb('language_stats'),
  languageStatsUpdatedAt: timestamp('language_stats_updated_at', { withTimezone: true }),

  // Filesystem path to bare repo
  diskPath: text('disk_path').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  pushedAt: timestamp('pushed_at', { withTimezone: true }),
}, (table) => ({
  // Index for listing repos by owner (most common query)
  ownerIdx: index('idx_repositories_owner').on(table.ownerId, table.ownerType),
  // Index for owner + name lookup (repo page URL resolution)
  ownerNameIdx: index('idx_repositories_owner_name').on(table.ownerId, table.name),
  // Index for listing public repos
  isPrivateIdx: index('idx_repositories_is_private').on(table.isPrivate),
  // Index for listing forks of a repo
  forkedFromIdx: index('idx_repositories_forked_from').on(table.forkedFromId),
  // Index for sorting by activity
  updatedAtIdx: index('idx_repositories_updated_at').on(table.updatedAt),
  pushedAtIdx: index('idx_repositories_pushed_at').on(table.pushedAt),
  // Index for trending/popular repos
  starsCountIdx: index('idx_repositories_stars_count').on(table.starsCount),
}));

export const collaborators = pgTable(
  'collaborators',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(), // References better-auth user.id
    permission: permissionEnum('permission').notNull().default('read'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repoId, table.userId] }),
    // Index for listing repos a user collaborates on
    userIdIdx: index('idx_collaborators_user_id').on(table.userId),
  })
);

export const stars = pgTable(
  'stars',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(), // References better-auth user.id
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repoId, table.userId] }),
    // Index for listing user's starred repos
    userIdIdx: index('idx_stars_user_id').on(table.userId),
    // Composite index for user + created at (sorted starred repos)
    userCreatedAtIdx: index('idx_stars_user_created_at').on(table.userId, table.createdAt),
  })
);

export const watches = pgTable(
  'watches',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(), // References better-auth user.id
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repoId, table.userId] }),
    // Index for listing user's watched repos
    userIdIdx: index('idx_watches_user_id').on(table.userId),
    // Composite index for user + created at (sorted watched repos)
    userCreatedAtIdx: index('idx_watches_user_created_at').on(table.userId, table.createdAt),
  })
);

// ============ MILESTONES ============

export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  state: milestoneStateEnum('state').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

// ============ STACKS (Stacked Diffs) ============

/**
 * Stacks table - Groups of dependent branches/PRs
 * A stack represents a series of changes that build on each other
 */
export const stacks = pgTable('stacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(), // e.g., "auth-feature"
  description: text('description'),
  
  // The base branch this stack builds on (e.g., "main")
  baseBranch: text('base_branch').notNull(),
  
  // Author of the stack
  authorId: text('author_id').notNull(), // References better-auth user.id
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Stack names must be unique within a repository
  uniqueNamePerRepo: unique().on(table.repoId, table.name),
}));

/**
 * Stack branches table - Ordered branches within a stack
 * Each branch can optionally be linked to a PR
 */
export const stackBranches = pgTable('stack_branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  stackId: uuid('stack_id')
    .notNull()
    .references(() => stacks.id, { onDelete: 'cascade' }),
  
  // Branch name
  branchName: text('branch_name').notNull(),
  
  // Position in the stack (0 = closest to base, higher = further up)
  position: integer('position').notNull(),
  
  // Optional link to the PR for this branch
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Each branch can only appear once per stack
  uniqueBranchPerStack: unique().on(table.stackId, table.branchName),
}));

// ============ PULL REQUESTS ============

export const pullRequests = pgTable('pull_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),

  number: integer('number').notNull(), // PR #1, #2, etc. per repo

  title: text('title').notNull(),
  body: text('body'),

  state: prStateEnum('state').notNull().default('open'),

  // Branches
  sourceBranch: text('source_branch').notNull(),
  targetBranch: text('target_branch').notNull(),

  // For cross-repo PRs (forks)
  sourceRepoId: uuid('source_repo_id').references(() => repositories.id),

  // Commits
  headSha: text('head_sha').notNull(),
  baseSha: text('base_sha').notNull(),
  mergeSha: text('merge_sha'), // Set when merged

  authorId: text('author_id').notNull(), // References better-auth user.id

  // Milestone reference
  milestoneId: uuid('milestone_id').references(() => milestones.id, {
    onDelete: 'set null',
  }),
  
  // Stack reference - which stack this PR belongs to (if any)
  stackId: uuid('stack_id').references(() => stacks.id, { onDelete: 'set null' }),

  isDraft: boolean('is_draft').notNull().default(false),
  isMergeable: boolean('is_mergeable'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  mergedAt: timestamp('merged_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  mergedById: text('merged_by_id'), // References better-auth user.id
}, (table) => ({
  // Index for listing PRs by repo (most common query)
  repoIdIdx: index('idx_pull_requests_repo_id').on(table.repoId),
  // Composite index for repo + state (PR list filtering)
  repoStateIdx: index('idx_pull_requests_repo_state').on(table.repoId, table.state),
  // Composite index for repo + number (PR page URL resolution)
  repoNumberIdx: index('idx_pull_requests_repo_number').on(table.repoId, table.number),
  // Index for author's PRs (inbox queries)
  authorIdx: index('idx_pull_requests_author').on(table.authorId),
  // Index for milestone PRs
  milestoneIdx: index('idx_pull_requests_milestone').on(table.milestoneId),
  // Index for stack PRs
  stackIdx: index('idx_pull_requests_stack').on(table.stackId),
  // Composite index for sorting by creation date within a repo
  repoCreatedAtIdx: index('idx_pull_requests_repo_created_at').on(table.repoId, table.createdAt),
  // Index for finding PRs by head SHA (CI status checks)
  headShaIdx: index('idx_pull_requests_head_sha').on(table.headSha),
  // Index for finding PRs by target branch (merge queue)
  repoTargetBranchIdx: index('idx_pull_requests_repo_target_branch').on(table.repoId, table.targetBranch),
}));

export const prReviews = pgTable('pr_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // References better-auth user.id

  state: reviewStateEnum('state').notNull(),
  body: text('body'),
  commitSha: text('commit_sha').notNull(), // SHA reviewed at

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for listing reviews by PR
  prIdIdx: index('idx_pr_reviews_pr_id').on(table.prId),
  // Composite index for PR + created at (sorted reviews)
  prCreatedAtIdx: index('idx_pr_reviews_pr_created_at').on(table.prId, table.createdAt),
  // Composite index for PR + user (get user's latest review on a PR)
  prUserIdx: index('idx_pr_reviews_pr_user').on(table.prId, table.userId),
}));

export const prComments = pgTable('pr_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  reviewId: uuid('review_id').references(() => prReviews.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // References better-auth user.id

  // For inline comments
  path: text('path'), // File path
  line: integer('line'), // Line number
  side: text('side'), // 'LEFT' or 'RIGHT' for diff
  commitSha: text('commit_sha'),
  
  // For multi-line comments
  startLine: integer('start_line'), // Starting line for range selection
  endLine: integer('end_line'), // Ending line for range selection (same as line for single-line)

  body: text('body').notNull(),

  // For replies
  replyToId: uuid('reply_to_id').references((): any => prComments.id),
  
  // Thread resolution
  isResolved: boolean('is_resolved').notNull().default(false),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedById: text('resolved_by_id'), // References better-auth user.id

  // Code suggestions
  suggestion: text('suggestion'), // The suggested code change
  suggestionApplied: boolean('suggestion_applied').notNull().default(false),
  suggestionCommitSha: text('suggestion_commit_sha'), // Commit SHA where suggestion was applied

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for listing comments by PR
  prIdIdx: index('idx_pr_comments_pr_id').on(table.prId),
  // Composite index for PR + created at (sorted comments)
  prCreatedAtIdx: index('idx_pr_comments_pr_created_at').on(table.prId, table.createdAt),
  // Composite index for PR + path (inline comments for a file)
  prPathIdx: index('idx_pr_comments_pr_path').on(table.prId, table.path),
  // Index for review comments
  reviewIdIdx: index('idx_pr_comments_review_id').on(table.reviewId),
  // Index for reply threads
  replyToIdIdx: index('idx_pr_comments_reply_to_id').on(table.replyToId),
}));

// ============ PR REVIEWERS (for inbox) ============

export const reviewRequestStateEnum = pgEnum('review_request_state', [
  'pending',     // Review requested but not yet provided
  'completed',   // User has submitted a review
  'dismissed',   // Review request was dismissed/removed
]);

/**
 * PR Reviewers table - tracks who has been requested to review each PR
 * This is essential for the inbox feature to show "PRs awaiting my review"
 */
export const prReviewers = pgTable(
  'pr_reviewers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(), // The requested reviewer
    requestedById: text('requested_by_id').notNull(), // Who requested the review
    state: reviewRequestStateEnum('state').notNull().default('pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    // Each user can only be requested once per PR
    uniqueReviewer: unique().on(table.prId, table.userId),
    // Index for listing reviewers by PR
    prIdIdx: index('idx_pr_reviewers_pr_id').on(table.prId),
    // Composite index for user + state (inbox - PRs awaiting my review)
    userStateIdx: index('idx_pr_reviewers_user_state').on(table.userId, table.state),
    // Index for finding pending review requests (critical for inbox)
    userPendingIdx: index('idx_pr_reviewers_user_pending').on(table.userId),
  })
);

// ============ ISSUE STAGES (Custom Workflow Stages) ============

/**
 * Issue stages table - custom workflow stages per repository
 * Allows users to define their own stages beyond the default Linear-style ones
 */
export const issueStages = pgTable('issue_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  /** Unique identifier for the stage (e.g., 'backlog', 'in_progress', 'custom_review') */
  key: text('key').notNull(),
  
  /** Display name for the stage */
  name: text('name').notNull(),
  
  /** Optional description of what this stage means */
  description: text('description'),
  
  /** Icon to display (emoji or icon identifier) */
  icon: text('icon').notNull().default('○'),
  
  /** Color for the stage (hex color without #) */
  color: text('color').notNull().default('6b7280'),
  
  /** Position/order of the stage in the workflow (0 = first) */
  position: integer('position').notNull().default(0),
  
  /** Whether moving to this stage should close the issue */
  isClosedState: boolean('is_closed_state').notNull().default(false),
  
  /** Whether this is a triage/initial state for new issues */
  isTriageState: boolean('is_triage_state').notNull().default(false),
  
  /** Whether this is the default stage for new issues */
  isDefault: boolean('is_default').notNull().default(false),
  
  /** Whether this stage can be deleted (system stages cannot) */
  isSystem: boolean('is_system').notNull().default(false),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Stage keys must be unique within a repository
  uniqueKeyPerRepo: unique().on(table.repoId, table.key),
}));

// ============ ISSUES ============

export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),

  number: integer('number').notNull(), // Issue #1, #2, etc.

  title: text('title').notNull(),
  body: text('body'),

  state: issueStateEnum('state').notNull().default('open'),
  
  // Workflow status for Kanban board (Linear-style)
  // This enum is kept for backward compatibility
  status: issueStatusEnum('status').notNull().default('backlog'),
  
  // Custom stage reference (for user-defined workflow stages)
  // When set, this takes precedence over the status enum
  stageId: uuid('stage_id').references(() => issueStages.id, { onDelete: 'set null' }),
  
  // Priority (Linear-style: none, low, medium, high, urgent)
  priority: issuePriorityEnum('priority').notNull().default('none'),
  
  // Due date for time-sensitive issues
  dueDate: timestamp('due_date', { withTimezone: true }),
  
  // Estimate in story points or hours
  estimate: integer('estimate'),

  authorId: text('author_id').notNull(), // References better-auth user.id
  assigneeId: text('assignee_id'), // References better-auth user.id
  
  // Parent issue for sub-issues hierarchy
  parentId: uuid('parent_id'),

  // Milestone reference
  milestoneId: uuid('milestone_id').references(() => milestones.id, {
    onDelete: 'set null',
  }),
  
  // Project reference (Linear-style projects)
  projectId: uuid('project_id'),
  
  // Cycle/Sprint reference
  cycleId: uuid('cycle_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedById: text('closed_by_id'), // References better-auth user.id
}, (table) => ({
  // Index for listing issues by repo (most common query)
  repoIdIdx: index('idx_issues_repo_id').on(table.repoId),
  // Composite index for repo + state (issue list filtering)
  repoStateIdx: index('idx_issues_repo_state').on(table.repoId, table.state),
  // Composite index for repo + number (issue page URL resolution)
  repoNumberIdx: index('idx_issues_repo_number').on(table.repoId, table.number),
  // Composite index for repo + status (Kanban board)
  repoStatusIdx: index('idx_issues_repo_status').on(table.repoId, table.status),
  // Composite index for repo + stage (custom workflow)
  repoStageIdx: index('idx_issues_repo_stage').on(table.repoId, table.stageId),
  // Index for author's issues (inbox queries)
  authorIdx: index('idx_issues_author').on(table.authorId),
  // Index for assignee's issues (inbox queries)
  assigneeIdx: index('idx_issues_assignee').on(table.assigneeId),
  // Index for project issues
  projectIdx: index('idx_issues_project').on(table.projectId),
  // Index for cycle/sprint issues
  cycleIdx: index('idx_issues_cycle').on(table.cycleId),
  // Index for sub-issues
  parentIdx: index('idx_issues_parent').on(table.parentId),
  // Index for milestone issues
  milestoneIdx: index('idx_issues_milestone').on(table.milestoneId),
  // Composite index for sorting by creation date within a repo
  repoCreatedAtIdx: index('idx_issues_repo_created_at').on(table.repoId, table.createdAt),
}));

export const issueComments = pgTable('issue_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: uuid('issue_id')
    .notNull()
    .references(() => issues.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // References better-auth user.id

  body: text('body').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for listing comments by issue
  issueIdIdx: index('idx_issue_comments_issue_id').on(table.issueId),
  // Composite index for issue + created at (sorted comments)
  issueCreatedAtIdx: index('idx_issue_comments_issue_created_at').on(table.issueId, table.createdAt),
}));

export const labels = pgTable('labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  color: text('color').notNull().default('888888'), // Hex color
  description: text('description'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for listing labels by repo
  repoIdIdx: index('idx_labels_repo_id').on(table.repoId),
  // Composite index for repo + name (label lookup by name)
  repoNameIdx: index('idx_labels_repo_name').on(table.repoId, table.name),
}));

export const issueLabels = pgTable(
  'issue_labels',
  {
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.issueId, table.labelId] }),
  })
);

// ============ ISSUE RELATIONS ============

/**
 * Issue relations table - tracks dependencies between issues
 * Supports: blocks, blocked_by, relates_to, duplicates, duplicated_by
 */
export const issueRelations = pgTable(
  'issue_relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    relatedIssueId: uuid('related_issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    type: issueRelationTypeEnum('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdById: text('created_by_id').notNull(),
  },
  (table) => ({
    uniqueRelation: unique().on(table.issueId, table.relatedIssueId, table.type),
  })
);

// ============ PROJECTS (Linear-style) ============

/**
 * Projects table - larger units of work containing multiple issues
 * Similar to Linear projects with status, lead, members, and timeline
 */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'), // emoji or icon identifier
  color: text('color').default('888888'),
  
  status: projectStatusEnum('status').notNull().default('backlog'),
  
  // Project lead
  leadId: text('lead_id'),
  
  // Timeline
  startDate: timestamp('start_date', { withTimezone: true }),
  targetDate: timestamp('target_date', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Project members - users participating in a project
 */
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').default('member'), // 'lead', 'member'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
  })
);

/**
 * Project updates/check-ins - status updates for projects
 */
export const projectUpdates = pgTable('project_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(),
  body: text('body').notNull(),
  health: projectHealthEnum('health'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ CYCLES/SPRINTS ============

/**
 * Cycles table - time-boxed iterations (sprints)
 * Similar to Linear cycles with start/end dates and velocity tracking
 */
export const cycles = pgTable('cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(), // "Sprint 1", "Cycle 23", etc.
  number: integer('number').notNull(), // Auto-incrementing per repo
  description: text('description'),
  
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ ISSUE TEMPLATES ============

/**
 * Issue templates - reusable templates for creating issues
 */
export const issueTemplates = pgTable('issue_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  description: text('description'),
  
  titleTemplate: text('title_template'),
  bodyTemplate: text('body_template'),
  
  // Default values (JSON for labels array)
  defaultLabels: text('default_labels'), // JSON array of label IDs
  defaultAssigneeId: text('default_assignee_id'),
  defaultPriority: text('default_priority'),
  defaultStatus: text('default_status'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ SAVED VIEWS ============

/**
 * Issue views - saved filter configurations
 */
export const issueViews = pgTable('issue_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  creatorId: text('creator_id').notNull(),
  
  name: text('name').notNull(),
  description: text('description'),
  
  // JSON filter configuration
  filters: text('filters').notNull(),
  // JSON: groupBy, sortBy, viewType (list/board/timeline)
  displayOptions: text('display_options'),
  
  isShared: boolean('is_shared').notNull().default(false),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ ISSUE ACTIVITY LOG ============

/**
 * Issue activities - audit log for all issue changes
 */
export const issueActivities = pgTable('issue_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: uuid('issue_id')
    .notNull()
    .references(() => issues.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull(),
  
  // Action type: 'created', 'updated', 'status_changed', 'assigned', 'labeled', etc.
  action: text('action').notNull(),
  
  // Which field changed (for updates)
  field: text('field'),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  
  // Additional context as JSON
  metadata: text('metadata'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for listing activities by issue
  issueIdIdx: index('idx_issue_activities_issue_id').on(table.issueId),
  // Composite index for issue + created at (sorted activity log)
  issueCreatedAtIdx: index('idx_issue_activities_issue_created_at').on(table.issueId, table.createdAt),
}));

export const prLabels = pgTable(
  'pr_labels',
  {
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.prId, table.labelId] }),
  })
);

// ============ RELEASES ============

/**
 * Releases table - tag-based releases with metadata
 * Similar to GitHub releases
 */
export const releases = pgTable('releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  tagName: text('tag_name').notNull(),
  name: text('name').notNull(),
  body: text('body'), // Markdown release notes
  isDraft: boolean('is_draft').notNull().default(false),
  isPrerelease: boolean('is_prerelease').notNull().default(false),
  authorId: text('author_id').notNull(), // References better-auth user.id
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Release assets table - files attached to releases
 */
export const releaseAssets = pgTable('release_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id')
    .notNull()
    .references(() => releases.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  downloadUrl: text('download_url').notNull(),
  downloadCount: integer('download_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ PACKAGES (NPM REGISTRY) ============

/**
 * Package visibility enum
 */
export const packageVisibilityEnum = pgEnum('package_visibility', ['public', 'private']);

/**
 * Packages table - npm package metadata
 * Each package is scoped to a repository - the repo is the source of truth
 */
export const packages = pgTable('packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),                    // Package name (can differ from repo name)
  scope: text('scope'),                            // Scope without @, e.g., "wit" (defaults to owner username)
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  description: text('description'),
  visibility: packageVisibilityEnum('visibility').notNull().default('public'),
  keywords: text('keywords'),                      // JSON array
  license: text('license'),
  homepage: text('homepage'),
  readme: text('readme'),                          // README content (updated on publish)
  downloadCount: integer('download_count').notNull().default(0),
  deprecated: text('deprecated'),                  // Deprecation message (null = not deprecated)
  publishOnRelease: boolean('publish_on_release').notNull().default(false), // Auto-publish on git release
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueName: unique().on(table.scope, table.name),
  uniqueRepo: unique().on(table.repoId), // One package per repo
}));

/**
 * Package versions table - each published version
 */
export const packageVersions = pgTable('package_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  packageId: uuid('package_id')
    .notNull()
    .references(() => packages.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),              // Semver: "1.2.3"
  tagName: text('tag_name'),                       // Git tag this version was published from
  tarballUrl: text('tarball_url').notNull(),       // URL/path to download .tgz
  tarballSha512: text('tarball_sha512').notNull(), // Integrity hash (sha512)
  tarballSize: integer('tarball_size').notNull(),  // Size in bytes
  manifest: text('manifest').notNull(),            // Full package.json as JSON string
  dependencies: text('dependencies'),              // JSON object
  devDependencies: text('dev_dependencies'),       // JSON object
  peerDependencies: text('peer_dependencies'),     // JSON object
  optionalDependencies: text('optional_dependencies'), // JSON object
  engines: text('engines'),                        // JSON object (node version, etc.)
  bin: text('bin'),                                // JSON object (binary entry points)
  publishedBy: text('published_by')
    .notNull()
    .references(() => authUser.id),
  deprecated: text('deprecated'),                  // Per-version deprecation message
  downloadCount: integer('download_count').notNull().default(0),
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueVersion: unique().on(table.packageId, table.version),
}));

/**
 * Package dist-tags - latest, beta, next, etc.
 */
export const packageDistTags = pgTable('package_dist_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  packageId: uuid('package_id')
    .notNull()
    .references(() => packages.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),                      // "latest", "beta", "next", etc.
  versionId: uuid('version_id')
    .notNull()
    .references(() => packageVersions.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueTag: unique().on(table.packageId, table.tag),
}));

/**
 * Package maintainers - users who can publish new versions
 */
export const packageMaintainers = pgTable('package_maintainers', {
  packageId: uuid('package_id')
    .notNull()
    .references(() => packages.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  addedBy: text('added_by').references(() => authUser.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.packageId, table.userId] }),
}));

// ============ ACTIVITY ============

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),

  actorId: text('actor_id').notNull(), // References better-auth user.id
  repoId: uuid('repo_id').references(() => repositories.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'push', 'pr_opened', 'issue_opened', 'fork', etc.
  payload: text('payload'), // JSON data

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for listing activities by actor (user activity feed)
  actorIdIdx: index('idx_activities_actor_id').on(table.actorId),
  // Composite index for actor + created at (sorted user activity)
  actorCreatedAtIdx: index('idx_activities_actor_created_at').on(table.actorId, table.createdAt),
  // Index for listing activities by repo
  repoIdIdx: index('idx_activities_repo_id').on(table.repoId),
  // Composite index for repo + created at (sorted repo activity)
  repoCreatedAtIdx: index('idx_activities_repo_created_at').on(table.repoId, table.createdAt),
}));

// ============ WEBHOOKS ============

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),

  url: text('url').notNull(),
  secret: text('secret'),
  events: text('events').notNull(), // JSON array of event types

  isActive: boolean('is_active').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ MERGE QUEUE ============

/**
 * Merge queue configuration per repository
 * Controls how the merge queue behaves for a given branch
 */
export const mergeQueueConfig = pgTable('merge_queue_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  /** Target branch this config applies to (e.g., "main") */
  targetBranch: text('target_branch').notNull(),
  
  /** Whether the merge queue is enabled */
  enabled: boolean('enabled').notNull().default(true),
  
  /** Merge strategy */
  strategy: mergeQueueStrategyEnum('strategy').notNull().default('adaptive'),
  
  /** Maximum batch size for optimistic merging */
  maxBatchSize: integer('max_batch_size').notNull().default(5),
  
  /** Minimum wait time before processing (to batch PRs together) */
  minWaitSeconds: integer('min_wait_seconds').notNull().default(60),
  
  /** Required CI checks to pass before merging */
  requiredChecks: text('required_checks'), // JSON array of check names
  
  /** Whether to require all checks to pass (vs just required ones) */
  requireAllChecks: boolean('require_all_checks').notNull().default(false),
  
  /** Whether to automatically rebase PRs before merging */
  autoRebase: boolean('auto_rebase').notNull().default(true),
  
  /** Whether to delete branches after merging */
  deleteBranchAfterMerge: boolean('delete_branch_after_merge').notNull().default(true),
  
  /** 
   * Auto-merge mode: how the queue processes entries
   * - 'auto': Automatically process queue when PRs are ready (default)
   * - 'manual': Wait for explicit trigger to process queue
   * - 'scheduled': Process at scheduled times (uses mergeWindowStart/End)
   */
  autoMergeMode: text('auto_merge_mode').notNull().default('auto'),
  
  /** Start of merge window (hour in UTC, 0-23) for scheduled mode */
  mergeWindowStart: integer('merge_window_start'),
  
  /** End of merge window (hour in UTC, 0-23) for scheduled mode */
  mergeWindowEnd: integer('merge_window_end'),
  
  /** Days of week to allow merging (0=Sun, 1=Mon, ..., 6=Sat) as JSON array */
  mergeWindowDays: text('merge_window_days'), // e.g., "[1,2,3,4,5]" for weekdays
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueBranchConfig: unique().on(table.repoId, table.targetBranch),
}));

/**
 * Merge queue entries
 * Tracks PRs waiting in the merge queue
 */
export const mergeQueueEntries = pgTable('merge_queue_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** The pull request in the queue */
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  
  /** Repository */
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  /** Target branch */
  targetBranch: text('target_branch').notNull(),
  
  /** Position in the queue (lower = higher priority) */
  position: integer('position').notNull(),
  
  /** Current state */
  state: mergeQueueStateEnum('state').notNull().default('pending'),
  
  /** Priority (higher = more important, can jump queue) */
  priority: integer('priority').notNull().default(0),
  
  /** User who added this to the queue */
  addedById: text('added_by_id').notNull(),
  
  /** The HEAD SHA when added to queue */
  headSha: text('head_sha').notNull(),
  
  /** The base SHA (target branch) when added */
  baseSha: text('base_sha').notNull(),
  
  /** Speculative merge commit SHA (for testing) */
  speculativeMergeSha: text('speculative_merge_sha'),
  
  /** Batch ID if part of an optimistic merge batch */
  batchId: uuid('batch_id'),
  
  /** Files this PR touches (JSON array, for conflict detection) */
  touchedFiles: text('touched_files'), // JSON array
  
  /** Estimated conflict score with other PRs (0-100) */
  conflictScore: integer('conflict_score'),
  
  /** Error message if failed */
  errorMessage: text('error_message'),
  
  /** Number of retry attempts */
  retryCount: integer('retry_count').notNull().default(0),
  
  /** When this entry was added to the queue */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  
  /** When this entry was last updated */
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  
  /** When processing started */
  startedAt: timestamp('started_at', { withTimezone: true }),
  
  /** When completed (merged or failed) */
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  // Index for looking up queue entry by PR
  prIdIdx: index('idx_merge_queue_entries_pr_id').on(table.prId),
  // Composite index for repo + target branch + position (queue ordering)
  repoTargetBranchPositionIdx: index('idx_merge_queue_entries_repo_target_branch_position').on(table.repoId, table.targetBranch, table.position),
  // Composite index for repo + state (filtering queue entries)
  repoStateIdx: index('idx_merge_queue_entries_repo_state').on(table.repoId, table.state),
}));

/**
 * Merge queue batches
 * Groups of PRs being merged together in optimistic/adaptive mode
 */
export const mergeQueueBatches = pgTable('merge_queue_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  targetBranch: text('target_branch').notNull(),
  
  /** State of the batch */
  state: mergeQueueStateEnum('state').notNull().default('preparing'),
  
  /** Base SHA the batch is built on */
  baseSha: text('base_sha').notNull(),
  
  /** Final merge commit SHA if successful */
  mergeSha: text('merge_sha'),
  
  /** Ordered list of PR IDs in this batch (JSON array) */
  prOrder: text('pr_order').notNull(), // JSON array of PR IDs
  
  /** Reassembled commit graph (JSON - maps original commits to new ones) */
  commitGraph: text('commit_graph'), // JSON
  
  /** Workflow run ID for CI checks */
  workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id),
  
  /** Error message if failed */
  errorMessage: text('error_message'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/**
 * Merge queue history
 * Audit log of merge queue operations
 */
export const mergeQueueHistory = pgTable('merge_queue_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  /** Action that occurred */
  action: text('action').notNull(), // 'added', 'removed', 'merged', 'failed', 'reordered', 'batched'
  
  /** User who performed the action */
  actorId: text('actor_id').notNull(),
  
  /** Previous state */
  previousState: text('previous_state'),
  
  /** New state */
  newState: text('new_state'),
  
  /** Additional metadata (JSON) */
  metadata: text('metadata'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ CI/CD WORKFLOW RUNS ============

/**
 * Workflow runs table
 * Tracks individual executions of CI/CD workflows
 */
export const workflowRuns = pgTable('workflow_runs', {
  /** Unique identifier for the workflow run */
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Repository this workflow belongs to */
  repoId: uuid('repo_id').notNull().references(() => repositories.id),
  
  /** Path to the workflow file (e.g., .wit/workflows/ci.yml) */
  workflowPath: text('workflow_path').notNull(),
  
  /** Name of the workflow */
  workflowName: text('workflow_name').notNull(),
  
  /** Commit SHA that triggered this workflow */
  commitSha: text('commit_sha').notNull(),
  
  /** Branch name (if applicable) */
  branch: text('branch'),
  
  /** Event that triggered the workflow (push, pull_request, etc.) */
  event: text('event').notNull(),
  
  /** JSON-serialized event payload */
  eventPayload: text('event_payload'),
  
  /** Current state of the workflow run */
  state: workflowRunStateEnum('state').notNull().default('queued'),
  
  /** Final conclusion (success, failure, cancelled) */
  conclusion: text('conclusion'),
  
  /** User who triggered the workflow (if manual) */
  triggeredById: text('triggered_by_id'), // References better-auth user.id
  
  /** When the workflow run was created/queued */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  
  /** When the workflow run started executing */
  startedAt: timestamp('started_at', { withTimezone: true }),
  
  /** When the workflow run completed */
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  // Index for listing workflow runs by repo
  repoIdIdx: index('idx_workflow_runs_repo_id').on(table.repoId),
  // Composite index for repo + created at (sorting runs)
  repoCreatedAtIdx: index('idx_workflow_runs_repo_created_at').on(table.repoId, table.createdAt),
  // Composite index for repo + commit SHA (CI status checks - critical for PR pages)
  repoCommitShaIdx: index('idx_workflow_runs_repo_commit_sha').on(table.repoId, table.commitSha),
  // Index for finding runs by state (processing queued runs)
  stateIdx: index('idx_workflow_runs_state').on(table.state),
  // Composite index for repo + state (filtering runs by status)
  repoStateIdx: index('idx_workflow_runs_repo_state').on(table.repoId, table.state),
}));

/**
 * Job runs table
 * Tracks individual job executions within a workflow run
 */
export const jobRuns = pgTable('job_runs', {
  /** Unique identifier for the job run */
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Parent workflow run */
  workflowRunId: uuid('workflow_run_id')
    .notNull()
    .references(() => workflowRuns.id, { onDelete: 'cascade' }),
  
  /** Name of the job */
  jobName: text('job_name').notNull(),
  
  /** Current state of the job */
  state: workflowRunStateEnum('state').notNull().default('queued'),
  
  /** Final conclusion (success, failure, cancelled) */
  conclusion: text('conclusion'),
  
  /** Runner that executed this job */
  runner: text('runner'),
  
  /** When the job started executing */
  startedAt: timestamp('started_at', { withTimezone: true }),
  
  /** When the job completed */
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  /** Job execution logs */
  logs: text('logs'),
  
  /** JSON-serialized job outputs */
  outputs: text('outputs'),
}, (table) => ({
  // Index for listing jobs by workflow run
  workflowRunIdIdx: index('idx_job_runs_workflow_run_id').on(table.workflowRunId),
  // Composite index for workflow run + state (filtering jobs)
  workflowRunStateIdx: index('idx_job_runs_workflow_run_state').on(table.workflowRunId, table.state),
}));

/**
 * Step runs table
 * Tracks individual step executions within a job run
 */
export const stepRuns = pgTable('step_runs', {
  /** Unique identifier for the step run */
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Parent job run */
  jobRunId: uuid('job_run_id')
    .notNull()
    .references(() => jobRuns.id, { onDelete: 'cascade' }),
  
  /** Name of the step (optional) */
  stepName: text('step_name'),
  
  /** Step number within the job (1-indexed) */
  stepNumber: integer('step_number').notNull(),
  
  /** Current state of the step */
  state: workflowRunStateEnum('state').notNull().default('queued'),
  
  /** Final conclusion (success, failure, cancelled) */
  conclusion: text('conclusion'),
  
  /** When the step started executing */
  startedAt: timestamp('started_at', { withTimezone: true }),
  
  /** When the step completed */
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  /** Step execution logs */
  logs: text('logs'),
}, (table) => ({
  // Index for listing steps by job run (ordered by step number)
  jobRunIdIdx: index('idx_step_runs_job_run_id').on(table.jobRunId),
  // Composite index for job run + step number (ordered step display)
  jobRunStepNumberIdx: index('idx_step_runs_job_run_step_number').on(table.jobRunId, table.stepNumber),
}));

// ============ NOTIFICATIONS ============

export const notificationTypeEnum = pgEnum('notification_type', [
  'pr_review_requested',
  'pr_reviewed',
  'pr_merged',
  'pr_comment',
  'issue_assigned',
  'issue_comment',
  'mention',
  'repo_push',
  'repo_starred',
  'repo_forked',
  'ci_failed',
  'ci_passed',
  'achievement_unlocked',
  'level_up',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Recipient of the notification
  userId: text('user_id').notNull(), // References better-auth user.id
  
  // Notification type
  type: notificationTypeEnum('type').notNull(),
  
  // Title and body
  title: text('title').notNull(),
  body: text('body'),
  
  // Related entities (optional)
  repoId: uuid('repo_id').references(() => repositories.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'cascade' }),
  issueId: uuid('issue_id').references(() => issues.id, { onDelete: 'cascade' }),
  
  // Actor who triggered the notification (optional)
  actorId: text('actor_id'), // References better-auth user.id
  
  // URL to navigate to when clicked
  url: text('url'),
  
  // Read status
  read: boolean('read').notNull().default(false),
  
  // Email sent status
  emailSent: boolean('email_sent').notNull().default(false),
  emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for user's notifications (inbox - most common query)
  userIdIdx: index('idx_notifications_user_id').on(table.userId),
  // Composite index for user + read status (unread count, filtering)
  userReadIdx: index('idx_notifications_user_read').on(table.userId, table.read),
  // Composite index for user + created at (sorting notifications)
  userCreatedAtIdx: index('idx_notifications_user_created_at').on(table.userId, table.createdAt),
  // Index for pending email notifications
  emailSentIdx: index('idx_notifications_email_sent').on(table.emailSent),
}));

// ============ EMAIL NOTIFICATION PREFERENCES ============

/**
 * Email notification preferences for users
 * Controls which types of notifications trigger email delivery
 */
export const emailNotificationPreferences = pgTable('email_notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // User these preferences belong to
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' })
    .unique(), // One preference row per user
  
  // Master switch for all email notifications
  emailEnabled: boolean('email_enabled').notNull().default(true),
  
  // Individual notification type preferences
  prReviewRequested: boolean('pr_review_requested').notNull().default(true),
  prReviewed: boolean('pr_reviewed').notNull().default(true),
  prMerged: boolean('pr_merged').notNull().default(true),
  prComment: boolean('pr_comment').notNull().default(true),
  issueAssigned: boolean('issue_assigned').notNull().default(true),
  issueComment: boolean('issue_comment').notNull().default(true),
  mention: boolean('mention').notNull().default(true),
  repoPush: boolean('repo_push').notNull().default(false), // Off by default - too noisy
  repoStarred: boolean('repo_starred').notNull().default(false), // Off by default
  repoForked: boolean('repo_forked').notNull().default(true),
  ciFailed: boolean('ci_failed').notNull().default(true),
  ciPassed: boolean('ci_passed').notNull().default(false), // Off by default
  
  // Digest preferences
  digestEnabled: boolean('digest_enabled').notNull().default(false),
  digestFrequency: text('digest_frequency').notNull().default('daily'), // 'daily', 'weekly'
  digestDay: integer('digest_day').notNull().default(1), // Day of week for weekly (0=Sun, 1=Mon, etc)
  digestHour: integer('digest_hour').notNull().default(9), // Hour of day (0-23) in UTC
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type EmailNotificationPreferences = typeof emailNotificationPreferences.$inferSelect;
export type NewEmailNotificationPreferences = typeof emailNotificationPreferences.$inferInsert;

// ============ AGENT SESSIONS ============

export const agentSessionStatusEnum = pgEnum('agent_session_status', [
  'active',
  'completed',
  'cancelled',
]);

export const agentModeEnum = pgEnum('agent_mode', [
  'questions',
  'pm',
  'code',
]);

/**
 * Agent sessions table
 * Tracks conversations between users and the wit coding agent
 */
export const agentSessions = pgTable('agent_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // User who created the session
  userId: text('user_id').notNull(), // References better-auth user.id
  
  // Repository context (optional - agent can work without a repo)
  repoId: uuid('repo_id').references(() => repositories.id, { onDelete: 'set null' }),
  
  // Branch the agent is working on
  branch: text('branch'),
  
  // Session title (auto-generated or user-provided)
  title: text('title'),
  
  // Current status
  status: agentSessionStatusEnum('status').notNull().default('active'),
  
  // Agent mode (questions, pm, code)
  mode: agentModeEnum('mode').notNull().default('questions'),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for listing sessions by user
  userIdIdx: index('idx_agent_sessions_user_id').on(table.userId),
  // Composite index for user + created at (sorted sessions)
  userCreatedAtIdx: index('idx_agent_sessions_user_created_at').on(table.userId, table.createdAt),
  // Index for listing sessions by repo
  repoIdIdx: index('idx_agent_sessions_repo_id').on(table.repoId),
  // Index for active sessions
  statusIdx: index('idx_agent_sessions_status').on(table.status),
}));

/**
 * Agent file changes table
 * Tracks proposed file changes before they're applied
 * 
 * Note: Conversation history/messages are stored in Mastra Memory.
 * See src/ai/services/conversation.ts for the conversation API.
 */
export const agentFileChanges = pgTable('agent_file_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Parent session
  sessionId: uuid('session_id')
    .notNull()
    .references(() => agentSessions.id, { onDelete: 'cascade' }),
  
  // File path relative to repo root
  filePath: text('file_path').notNull(),
  
  // Type of change
  changeType: text('change_type').notNull(), // 'create' | 'edit' | 'delete'
  
  // Original content (for undo)
  originalContent: text('original_content'),
  
  // Proposed new content
  proposedContent: text('proposed_content'),
  
  // Approval status
  approved: boolean('approved'),
  
  // When the change was applied
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ REPOSITORY AI KEYS ============

export const aiProviderEnum = pgEnum('ai_provider', [
  'openai',
  'anthropic',
  'coderabbit',
]);

/**
 * Repository AI Keys table
 * Stores encrypted API keys for AI providers per repository
 * Only repository owners can view/manage these keys
 */
export const repoAiKeys = pgTable('repo_ai_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Repository this key belongs to
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  // AI provider (openai, anthropic)
  provider: aiProviderEnum('provider').notNull(),
  
  // Encrypted API key (we store encrypted, never plain text)
  encryptedKey: text('encrypted_key').notNull(),
  
  // Last 4 characters of the key for display (e.g., "...xyz1")
  keyHint: text('key_hint').notNull(),
  
  // User who added this key
  createdById: text('created_by_id').notNull(),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Only one key per provider per repo
  uniqueProviderPerRepo: unique().on(table.repoId, table.provider),
}));

// ============ USER AI KEYS ============

/**
 * User AI Keys table
 * Stores encrypted API keys for AI providers per user
 * Users can set their own keys to use across all repositories
 */
export const userAiKeys = pgTable('user_ai_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // User this key belongs to
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  
  // AI provider (openai, anthropic)
  provider: aiProviderEnum('provider').notNull(),
  
  // Encrypted API key (we store encrypted, never plain text)
  encryptedKey: text('encrypted_key').notNull(),
  
  // Last 4 characters of the key for display (e.g., "...xyz1")
  keyHint: text('key_hint').notNull(),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Only one key per provider per user
  uniqueProviderPerUser: unique().on(table.userId, table.provider),
}));

// ============ TRIAGE AGENT CONFIGURATION ============

/**
 * Triage agent configuration per repository
 * Allows users to configure an AI agent that automatically triages new issues
 */
export const triageAgentConfig = pgTable('triage_agent_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' })
    .unique(), // One config per repo
  
  /** Whether the triage agent is enabled */
  enabled: boolean('enabled').notNull().default(false),
  
  /** Custom prompt/instructions for the triage agent */
  prompt: text('prompt'),
  
  /** Whether to auto-assign labels */
  autoAssignLabels: boolean('auto_assign_labels').notNull().default(true),
  
  /** Whether to auto-assign users */
  autoAssignUsers: boolean('auto_assign_users').notNull().default(false),
  
  /** Whether to auto-set priority */
  autoSetPriority: boolean('auto_set_priority').notNull().default(true),
  
  /** Whether to add a comment explaining the triage decision */
  addTriageComment: boolean('add_triage_comment').notNull().default(true),
  
  /** User who created/updated this config */
  updatedById: text('updated_by_id').notNull(),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Triage agent run history
 * Logs each time the triage agent runs on an issue
 */
export const triageAgentRuns = pgTable('triage_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  issueId: uuid('issue_id')
    .notNull()
    .references(() => issues.id, { onDelete: 'cascade' }),
  
  /** Whether the run was successful */
  success: boolean('success').notNull(),
  
  /** Error message if failed */
  errorMessage: text('error_message'),
  
  /** Labels that were assigned */
  assignedLabels: text('assigned_labels'), // JSON array of label names
  
  /** User that was assigned (if any) */
  assignedUserId: text('assigned_user_id'),
  
  /** Priority that was set */
  assignedPriority: text('assigned_priority'),
  
  /** The AI's reasoning/explanation */
  reasoning: text('reasoning'),
  
  /** Tokens used for this run */
  tokensUsed: integer('tokens_used'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ MARKETING CONTENT ============

/**
 * Marketing content status enum
 */
export const marketingContentStatusEnum = pgEnum('marketing_content_status', [
  'pending',    // Generated, awaiting review
  'approved',   // Approved for posting
  'posted',     // Posted to social media
  'rejected',   // Rejected/discarded
]);

/**
 * Marketing content source type enum
 */
export const marketingContentSourceEnum = pgEnum('marketing_content_source', [
  'pr_merged',
  'release_published',
]);

/**
 * Marketing content table
 * Stores AI-generated social media content from PRs and releases
 */
export const marketingContent = pgTable('marketing_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Repository this content is for
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  // Source of the content
  sourceType: marketingContentSourceEnum('source_type').notNull(),
  sourceId: text('source_id').notNull(), // PR ID or Release ID
  sourceRef: text('source_ref').notNull(), // PR number or release tag
  
  // Generated content
  tweet: text('tweet').notNull(), // Main tweet (280 chars)
  thread: jsonb('thread'), // Array of tweets for thread
  
  // Status
  status: marketingContentStatusEnum('status').notNull().default('pending'),
  
  // Posted info
  postedAt: timestamp('posted_at', { withTimezone: true }),
  postedUrl: text('posted_url'), // URL to the posted tweet
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Marketing agent configuration per repository
 * Allows users to configure the AI agent that generates social media content
 */
export const marketingAgentConfig = pgTable('marketing_agent_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' })
    .unique(), // One config per repo
  
  /** Whether the marketing agent is enabled */
  enabled: boolean('enabled').notNull().default(false),
  
  /** Custom prompt/instructions for content generation */
  prompt: text('prompt'),
  
  /** Whether to auto-generate on PR merge */
  generateOnPrMerge: boolean('generate_on_pr_merge').notNull().default(true),
  
  /** Whether to auto-generate on release publish */
  generateOnRelease: boolean('generate_on_release').notNull().default(true),
  
  /** User who created/updated this config */
  updatedById: text('updated_by_id').notNull(),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ JOURNAL (Notion-like documentation) ============

/**
 * Journal page status enum
 * Tracks whether a page is draft, published, or archived
 */
export const journalPageStatusEnum = pgEnum('journal_page_status', [
  'draft',
  'published',
  'archived',
]);

/**
 * Journal pages table - Notion-like documentation pages per repository
 * Supports hierarchical structure, rich content, icons, and covers
 */
export const journalPages = pgTable('journal_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  // Content
  title: text('title').notNull(),
  slug: text('slug').notNull(), // URL-friendly identifier
  content: text('content'), // Markdown or JSON (for block-based content)
  
  // Visual customization (Notion-style)
  icon: text('icon'), // Emoji or icon identifier
  coverImage: text('cover_image'), // URL to cover image
  
  // Hierarchy - for nested pages like Notion
  parentId: uuid('parent_id'),
  position: integer('position').notNull().default(0), // Order among siblings
  
  // Status
  status: journalPageStatusEnum('status').notNull().default('draft'),
  
  // Author
  authorId: text('author_id').notNull(), // References better-auth user.id
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, (table) => ({
  // Slugs must be unique within a repository
  uniqueSlugPerRepo: unique().on(table.repoId, table.slug),
}));

/**
 * Journal page comments - for collaborative editing
 */
export const journalComments = pgTable('journal_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id')
    .notNull()
    .references(() => journalPages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // References better-auth user.id
  
  body: text('body').notNull(),
  
  // For inline comments at specific positions
  blockId: text('block_id'), // ID of the block this comment is attached to
  
  // For replies
  replyToId: uuid('reply_to_id').references((): any => journalComments.id),
  
  // Resolution
  isResolved: boolean('is_resolved').notNull().default(false),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedById: text('resolved_by_id'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Journal page history - version history for pages
 */
export const journalPageHistory = pgTable('journal_page_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id')
    .notNull()
    .references(() => journalPages.id, { onDelete: 'cascade' }),
  
  // Snapshot of the page at this version
  title: text('title').notNull(),
  content: text('content'),
  
  // Who made this version
  authorId: text('author_id').notNull(),
  
  // Version number (auto-incremented per page)
  version: integer('version').notNull(),
  
  // Optional description of changes
  changeDescription: text('change_description'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});


// ============ OAUTH APPS (Wit Apps) ============

/**
 * OAuth Apps table - registered third-party applications
 * Similar to GitHub OAuth Apps for building integrations
 */
export const oauthApps = pgTable('oauth_apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Owner of the app (user or organization) */
  ownerId: text('owner_id').notNull(),
  ownerType: ownerTypeEnum('owner_type').notNull().default('user'),
  
  /** App display name */
  name: text('name').notNull(),
  
  /** Short description of the app */
  description: text('description'),
  
  /** App website URL */
  websiteUrl: text('website_url'),
  
  /** OAuth callback/redirect URI (required) */
  callbackUrl: text('callback_url').notNull(),
  
  /** Additional allowed callback URLs (JSON array) */
  additionalCallbackUrls: text('additional_callback_urls'),
  
  /** Client ID - public identifier */
  clientId: text('client_id').notNull().unique(),
  
  /** Client secret hash (never store raw!) */
  clientSecretHash: text('client_secret_hash').notNull(),
  
  /** First 8 chars of secret for identification */
  clientSecretPrefix: text('client_secret_prefix').notNull(),
  
  /** App logo URL */
  logoUrl: text('logo_url'),
  
  /** Privacy policy URL */
  privacyPolicyUrl: text('privacy_policy_url'),
  
  /** Terms of service URL */
  termsOfServiceUrl: text('terms_of_service_url'),
  
  /** Whether this app is published/public or still in development */
  isPublished: boolean('is_published').notNull().default(false),
  
  /** Whether this app is verified by Wit */
  isVerified: boolean('is_verified').notNull().default(false),
  
  /** Number of installations/authorizations */
  installationsCount: integer('installations_count').notNull().default(0),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * OAuth App scopes - available scopes for OAuth apps
 */
export const oauthAppScopeEnum = pgEnum('oauth_app_scope', [
  'user:read',           // Read user profile
  'user:email',          // Read user email
  'repo:read',           // Read repositories (public and private with access)
  'repo:write',          // Write to repositories
  'repo:admin',          // Admin access to repositories
  'org:read',            // Read organization membership
  'org:write',           // Manage organization membership
  'workflow:read',       // Read workflow runs
  'workflow:write',      // Trigger workflows
  'issue:read',          // Read issues
  'issue:write',         // Create/edit issues
  'pull:read',           // Read pull requests
  'pull:write',          // Create/edit pull requests
  'webhook:read',        // Read webhooks
  'webhook:write',       // Manage webhooks
]);

/**
 * OAuth Authorizations - tracks which users have authorized which apps
 * This is the "grant" - user approving an app's access
 */
export const oauthAuthorizations = pgTable('oauth_authorizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** The app being authorized */
  appId: uuid('app_id')
    .notNull()
    .references(() => oauthApps.id, { onDelete: 'cascade' }),
  
  /** The user who authorized the app */
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  
  /** Scopes the user approved */
  scopes: text('scopes').notNull(), // JSON array
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Each user can only have one authorization per app
  uniqueUserApp: unique().on(table.appId, table.userId),
}));

/**
 * OAuth Authorization Codes - temporary codes for OAuth flow
 * These are exchanged for access tokens
 */
export const oauthAuthorizationCodes = pgTable('oauth_authorization_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** The authorization code (hashed) */
  codeHash: text('code_hash').notNull().unique(),
  
  /** The app this code was issued for */
  appId: uuid('app_id')
    .notNull()
    .references(() => oauthApps.id, { onDelete: 'cascade' }),
  
  /** The user who authorized */
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  
  /** Scopes requested */
  scopes: text('scopes').notNull(), // JSON array
  
  /** Redirect URI used (must match on token exchange) */
  redirectUri: text('redirect_uri').notNull(),
  
  /** PKCE code challenge (for public clients) */
  codeChallenge: text('code_challenge'),
  codeChallengeMethod: text('code_challenge_method'), // 'plain' or 'S256'
  
  /** State parameter (for CSRF protection) */
  state: text('state'),
  
  /** When this code expires (short-lived, ~10 minutes) */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  
  /** Whether this code has been used */
  used: boolean('used').notNull().default(false),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * OAuth Access Tokens - tokens issued to apps for API access
 */
export const oauthAccessTokens = pgTable('oauth_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Token hash (never store raw!) */
  tokenHash: text('token_hash').notNull().unique(),
  
  /** Token prefix for identification */
  tokenPrefix: text('token_prefix').notNull(),
  
  /** The app this token was issued to */
  appId: uuid('app_id')
    .notNull()
    .references(() => oauthApps.id, { onDelete: 'cascade' }),
  
  /** The user who authorized */
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  
  /** The authorization this token was created from */
  authorizationId: uuid('authorization_id')
    .references(() => oauthAuthorizations.id, { onDelete: 'cascade' }),
  
  /** Scopes this token has access to */
  scopes: text('scopes').notNull(), // JSON array
  
  /** When this token expires (null = never) */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  
  /** Last time this token was used */
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  
  /** Whether this token has been revoked */
  revoked: boolean('revoked').notNull().default(false),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * OAuth Refresh Tokens - for getting new access tokens
 */
export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Token hash (never store raw!) */
  tokenHash: text('token_hash').notNull().unique(),
  
  /** The access token this refresh token is for */
  accessTokenId: uuid('access_token_id')
    .notNull()
    .references(() => oauthAccessTokens.id, { onDelete: 'cascade' }),
  
  /** When this token expires */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  
  /** Whether this token has been used (refresh tokens are single-use) */
  used: boolean('used').notNull().default(false),
  usedAt: timestamp('used_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * OAuth App Webhooks - webhooks specific to OAuth app events
 * Apps can receive events about their installations
 */
export const oauthAppWebhooks = pgTable('oauth_app_webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  appId: uuid('app_id')
    .notNull()
    .references(() => oauthApps.id, { onDelete: 'cascade' }),
  
  /** Webhook URL */
  url: text('url').notNull(),
  
  /** Webhook secret for signature verification */
  secret: text('secret'),
  
  /** Events to subscribe to (JSON array) */
  events: text('events').notNull(), // ['installation', 'installation.deleted', etc.]
  
  /** Whether this webhook is active */
  isActive: boolean('is_active').notNull().default(true),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ SANDBOX SETTINGS ============

/**
 * Sandbox provider enum
 * Supported sandbox providers for code execution
 */
export const sandboxProviderEnum = pgEnum('sandbox_provider', [
  'e2b',      // E2B Firecracker microVMs
  'daytona',  // Daytona cloud dev environments
  'docker',   // Self-hosted Docker containers
  'vercel',   // Vercel Sandbox ephemeral compute
]);

/**
 * Sandbox network mode enum
 * Controls network access from sandbox
 */
export const sandboxNetworkModeEnum = pgEnum('sandbox_network_mode', [
  'none',       // No network access (most secure)
  'restricted', // Only allowed hosts
  'full',       // Full internet access
]);

/**
 * Repository sandbox configuration
 * Stores sandbox settings per repository
 */
export const repoSandboxConfig = pgTable('repo_sandbox_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' })
    .unique(), // One config per repo

  /** Whether sandbox is enabled for this repo */
  enabled: boolean('enabled').notNull().default(false),

  /** Sandbox provider to use */
  provider: sandboxProviderEnum('provider').notNull().default('e2b'),

  /** Network access mode */
  networkMode: sandboxNetworkModeEnum('network_mode').notNull().default('none'),

  /** Default language runtime (for Daytona) */
  defaultLanguage: text('default_language').notNull().default('typescript'),

  // Resource limits
  /** Memory limit in MB */
  memoryMB: integer('memory_mb').notNull().default(2048),
  /** CPU cores */
  cpuCores: integer('cpu_cores').notNull().default(1),
  /** Session timeout in minutes */
  timeoutMinutes: integer('timeout_minutes').notNull().default(60),

  // E2B-specific settings
  /** E2B template ID */
  e2bTemplateId: text('e2b_template_id'),

  // Daytona-specific settings
  /** Daytona snapshot name/ID */
  daytonaSnapshot: text('daytona_snapshot'),
  /** Auto-stop interval in minutes (0 = never) */
  daytonaAutoStop: integer('daytona_auto_stop').notNull().default(15),

  // Docker-specific settings
  /** Docker image to use */
  dockerImage: text('docker_image').notNull().default('wit-sandbox:latest'),

  // Vercel-specific settings
  /** Vercel Project ID */
  vercelProjectId: text('vercel_project_id'),
  /** Vercel Team ID (required for personal access tokens) */
  vercelTeamId: text('vercel_team_id'),
  /** Vercel runtime */
  vercelRuntime: text('vercel_runtime').default('node22'),

  /** User who last updated this config */
  updatedById: text('updated_by_id').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Sandbox provider API keys
 * Stores encrypted API keys for sandbox providers per repository
 */
export const repoSandboxKeys = pgTable('repo_sandbox_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),

  /** Sandbox provider (e2b, daytona) */
  provider: sandboxProviderEnum('provider').notNull(),

  /** Encrypted API key */
  encryptedKey: text('encrypted_key').notNull(),

  /** Last characters of the key for display */
  keyHint: text('key_hint').notNull(),

  /** User who added this key */
  createdById: text('created_by_id').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Only one key per provider per repo
  uniqueProviderPerRepo: unique().on(table.repoId, table.provider),
}));

/**
 * Sandbox sessions
 * Tracks active and historical sandbox sessions
 */
export const sandboxSessions = pgTable('sandbox_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Repository this session is for */
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),

  /** User who created this session */
  userId: text('user_id').notNull(),

  /** Provider used for this session */
  provider: sandboxProviderEnum('provider').notNull(),

  /** Provider-specific session/sandbox ID */
  providerId: text('provider_id').notNull(),

  /** Branch being worked on (optional) */
  branch: text('branch'),

  /** Current state of the session */
  state: text('state').notNull().default('running'),

  /** Session metadata (JSON) */
  metadata: text('metadata'),

  /** When the session started */
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),

  /** When the session ended (null if still active) */
  endedAt: timestamp('ended_at', { withTimezone: true }),

  /** Exit code if session ended */
  exitCode: integer('exit_code'),
});

// ============ TYPE EXPORTS ============

export type RepoAiKey = typeof repoAiKeys.$inferSelect;
export type NewRepoAiKey = typeof repoAiKeys.$inferInsert;
export type AiProvider = (typeof aiProviderEnum.enumValues)[number];

export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;

export type AgentFileChange = typeof agentFileChanges.$inferSelect;
export type NewAgentFileChange = typeof agentFileChanges.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;

export type SSHKey = typeof sshKeys.$inferSelect;
export type NewSSHKey = typeof sshKeys.$inferInsert;

export type PersonalAccessToken = typeof personalAccessTokens.$inferSelect;
export type NewPersonalAccessToken = typeof personalAccessTokens.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type OrgMember = typeof orgMembers.$inferSelect;
export type NewOrgMember = typeof orgMembers.$inferInsert;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

export type BranchProtectionRule = typeof branchProtectionRules.$inferSelect;
export type NewBranchProtectionRule = typeof branchProtectionRules.$inferInsert;

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export type Collaborator = typeof collaborators.$inferSelect;
export type NewCollaborator = typeof collaborators.$inferInsert;

export type Star = typeof stars.$inferSelect;
export type NewStar = typeof stars.$inferInsert;

export type Watch = typeof watches.$inferSelect;
export type NewWatch = typeof watches.$inferInsert;

export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;

export type PullRequest = typeof pullRequests.$inferSelect;
export type NewPullRequest = typeof pullRequests.$inferInsert;

export type PrReview = typeof prReviews.$inferSelect;
export type NewPrReview = typeof prReviews.$inferInsert;

export type PrComment = typeof prComments.$inferSelect;
export type NewPrComment = typeof prComments.$inferInsert;

export type PrReviewer = typeof prReviewers.$inferSelect;
export type NewPrReviewer = typeof prReviewers.$inferInsert;
export type ReviewRequestState = (typeof reviewRequestStateEnum.enumValues)[number];

export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;

export type IssueComment = typeof issueComments.$inferSelect;
export type NewIssueComment = typeof issueComments.$inferInsert;

export type IssueStage = typeof issueStages.$inferSelect;
export type NewIssueStage = typeof issueStages.$inferInsert;

export type Label = typeof labels.$inferSelect;
export type NewLabel = typeof labels.$inferInsert;

export type IssueLabel = typeof issueLabels.$inferSelect;
export type NewIssueLabel = typeof issueLabels.$inferInsert;

export type PrLabel = typeof prLabels.$inferSelect;
export type NewPrLabel = typeof prLabels.$inferInsert;

export type Stack = typeof stacks.$inferSelect;
export type NewStack = typeof stacks.$inferInsert;

export type StackBranch = typeof stackBranches.$inferSelect;
export type NewStackBranch = typeof stackBranches.$inferInsert;

export type Release = typeof releases.$inferSelect;
export type NewRelease = typeof releases.$inferInsert;

export type ReleaseAsset = typeof releaseAssets.$inferSelect;
export type NewReleaseAsset = typeof releaseAssets.$inferInsert;

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;

export type MilestoneState = (typeof milestoneStateEnum.enumValues)[number];
export type IssueState = (typeof issueStateEnum.enumValues)[number];
export type IssueStatus = (typeof issueStatusEnum.enumValues)[number];
export type IssuePriority = (typeof issuePriorityEnum.enumValues)[number];
export type IssueRelationType = (typeof issueRelationTypeEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type ProjectHealth = (typeof projectHealthEnum.enumValues)[number];
export type PrState = (typeof prStateEnum.enumValues)[number];

// Issue Relations
export type IssueRelation = typeof issueRelations.$inferSelect;
export type NewIssueRelation = typeof issueRelations.$inferInsert;

// Projects
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;

export type ProjectUpdate = typeof projectUpdates.$inferSelect;
export type NewProjectUpdate = typeof projectUpdates.$inferInsert;

// Cycles
export type Cycle = typeof cycles.$inferSelect;
export type NewCycle = typeof cycles.$inferInsert;

// Issue Templates
export type IssueTemplate = typeof issueTemplates.$inferSelect;
export type NewIssueTemplate = typeof issueTemplates.$inferInsert;

// Issue Views
export type IssueView = typeof issueViews.$inferSelect;
export type NewIssueView = typeof issueViews.$inferInsert;

// Issue Activities
export type IssueActivity = typeof issueActivities.$inferSelect;
export type NewIssueActivity = typeof issueActivities.$inferInsert;

// Workflow run types
export type WorkflowRunState = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type WorkflowRunConclusion = 'success' | 'failure' | 'cancelled';

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;

export type JobRun = typeof jobRuns.$inferSelect;
export type NewJobRun = typeof jobRuns.$inferInsert;

export type StepRun = typeof stepRuns.$inferSelect;
export type NewStepRun = typeof stepRuns.$inferInsert;

// Merge queue types
export type MergeQueueState = (typeof mergeQueueStateEnum.enumValues)[number];
export type MergeQueueStrategy = (typeof mergeQueueStrategyEnum.enumValues)[number];

export type MergeQueueConfig = typeof mergeQueueConfig.$inferSelect;
export type NewMergeQueueConfig = typeof mergeQueueConfig.$inferInsert;

export type MergeQueueEntry = typeof mergeQueueEntries.$inferSelect;
export type NewMergeQueueEntry = typeof mergeQueueEntries.$inferInsert;

export type MergeQueueBatch = typeof mergeQueueBatches.$inferSelect;
export type NewMergeQueueBatch = typeof mergeQueueBatches.$inferInsert;

export type MergeQueueHistoryEntry = typeof mergeQueueHistory.$inferSelect;
export type NewMergeQueueHistoryEntry = typeof mergeQueueHistory.$inferInsert;

// Journal types
export type JournalPageStatus = (typeof journalPageStatusEnum.enumValues)[number];

export type JournalPage = typeof journalPages.$inferSelect;
export type NewJournalPage = typeof journalPages.$inferInsert;

export type JournalComment = typeof journalComments.$inferSelect;
export type NewJournalComment = typeof journalComments.$inferInsert;

export type JournalPageHistoryEntry = typeof journalPageHistory.$inferSelect;
export type NewJournalPageHistoryEntry = typeof journalPageHistory.$inferInsert;

// Triage Agent types
export type TriageAgentConfig = typeof triageAgentConfig.$inferSelect;
export type NewTriageAgentConfig = typeof triageAgentConfig.$inferInsert;

export type TriageAgentRun = typeof triageAgentRuns.$inferSelect;
export type NewTriageAgentRun = typeof triageAgentRuns.$inferInsert;

// Marketing Agent types
export type MarketingAgentConfig = typeof marketingAgentConfig.$inferSelect;
export type NewMarketingAgentConfig = typeof marketingAgentConfig.$inferInsert;

// Package registry types
export type PackageVisibility = (typeof packageVisibilityEnum.enumValues)[number];

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;

export type PackageVersion = typeof packageVersions.$inferSelect;
export type NewPackageVersion = typeof packageVersions.$inferInsert;

export type PackageDistTag = typeof packageDistTags.$inferSelect;
export type NewPackageDistTag = typeof packageDistTags.$inferInsert;

export type PackageMaintainer = typeof packageMaintainers.$inferSelect;
export type NewPackageMaintainer = typeof packageMaintainers.$inferInsert;

// OAuth App types
export type OAuthAppScope = (typeof oauthAppScopeEnum.enumValues)[number];

export type OAuthApp = typeof oauthApps.$inferSelect;
export type NewOAuthApp = typeof oauthApps.$inferInsert;

export type OAuthAuthorization = typeof oauthAuthorizations.$inferSelect;
export type NewOAuthAuthorization = typeof oauthAuthorizations.$inferInsert;

export type OAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type NewOAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferInsert;

export type OAuthAccessToken = typeof oauthAccessTokens.$inferSelect;
export type NewOAuthAccessToken = typeof oauthAccessTokens.$inferInsert;

export type OAuthRefreshToken = typeof oauthRefreshTokens.$inferSelect;
export type NewOAuthRefreshToken = typeof oauthRefreshTokens.$inferInsert;

export type OAuthAppWebhook = typeof oauthAppWebhooks.$inferSelect;
export type NewOAuthAppWebhook = typeof oauthAppWebhooks.$inferInsert;

// Marketing content types
export type MarketingContentStatus = (typeof marketingContentStatusEnum.enumValues)[number];
export type MarketingContentSource = (typeof marketingContentSourceEnum.enumValues)[number];
export type MarketingContent = typeof marketingContent.$inferSelect;
export type NewMarketingContent = typeof marketingContent.$inferInsert;

// ============ GAMIFICATION ============

export const achievementCategoryEnum = pgEnum('achievement_category', [
  'commits',
  'pull_requests',
  'reviews',
  'issues',
  'collaboration',
  'streaks',
  'milestones',
  'special',
]);

export const achievementRarityEnum = pgEnum('achievement_rarity', [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
]);

/**
 * Achievement definitions - all available achievements
 */
export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: achievementCategoryEnum('category').notNull(),
  rarity: achievementRarityEnum('rarity').notNull(),
  xpReward: integer('xp_reward').notNull().default(100),
  icon: text('icon').notNull(),
  isSecret: boolean('is_secret').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * User achievements - tracks which users have unlocked which achievements
 */
export const userAchievements = pgTable('user_achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  achievementId: uuid('achievement_id')
    .notNull()
    .references(() => achievements.id, { onDelete: 'cascade' }),
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }).defaultNow().notNull(),
  context: text('context'),
}, (table) => ({
  uniqueUserAchievement: unique().on(table.userId, table.achievementId),
  userIdIdx: index('idx_user_achievements_user_id').on(table.userId),
  unlockedAtIdx: index('idx_user_achievements_unlocked_at').on(table.unlockedAt),
}));

/**
 * User gamification stats - XP, level, and overall progress
 */
export const userGamification = pgTable('user_gamification', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' })
    .unique(),
  totalXp: integer('total_xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  xpToNextLevel: integer('xp_to_next_level').notNull().default(100),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastActivityDate: timestamp('last_activity_date', { withTimezone: true }),
  totalCommits: integer('total_commits').notNull().default(0),
  totalPrsOpened: integer('total_prs_opened').notNull().default(0),
  totalPrsMerged: integer('total_prs_merged').notNull().default(0),
  totalReviews: integer('total_reviews').notNull().default(0),
  totalIssuesOpened: integer('total_issues_opened').notNull().default(0),
  totalIssuesClosed: integer('total_issues_closed').notNull().default(0),
  totalComments: integer('total_comments').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  levelIdx: index('idx_user_gamification_level').on(table.level),
  totalXpIdx: index('idx_user_gamification_total_xp').on(table.totalXp),
}));

/**
 * XP events - log of all XP earned
 */
export const xpEvents = pgTable('xp_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  activityType: text('activity_type').notNull(),
  xpAmount: integer('xp_amount').notNull(),
  description: text('description'),
  relatedId: text('related_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_xp_events_user_id').on(table.userId),
  createdAtIdx: index('idx_xp_events_created_at').on(table.createdAt),
}));

// Gamification types
export type AchievementCategory = (typeof achievementCategoryEnum.enumValues)[number];
export type AchievementRarity = (typeof achievementRarityEnum.enumValues)[number];

export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;

export type UserAchievementRecord = typeof userAchievements.$inferSelect;
export type NewUserAchievementRecord = typeof userAchievements.$inferInsert;

export type UserGamificationRecord = typeof userGamification.$inferSelect;
export type NewUserGamificationRecord = typeof userGamification.$inferInsert;

export type XpEvent = typeof xpEvents.$inferSelect;
export type NewXpEvent = typeof xpEvents.$inferInsert;

// ============ MCP SERVERS (Model Context Protocol) ============

/**
 * MCP Server configurations enabled for a repository's agent.
 * Stores enabled MCP servers from Composio that the agent can use.
 */
export const repoMcpServers = pgTable('repo_mcp_servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Repository this MCP server is enabled for */
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  /** Composio MCP server slug/identifier */
  mcpSlug: text('mcp_slug').notNull(),
  
  /** Display name of the MCP server */
  name: text('name').notNull(),
  
  /** Description of what the MCP server does */
  description: text('description'),
  
  /** Icon URL for the MCP server */
  iconUrl: text('icon_url'),
  
  /** Category/type of the MCP (e.g., 'productivity', 'development', 'data') */
  category: text('category'),
  
  /** Whether this MCP is currently enabled */
  enabled: boolean('enabled').notNull().default(true),
  
  /** Configuration JSON for the MCP (API keys, settings, etc.) - encrypted */
  configEncrypted: text('config_encrypted'),
  
  /** User who enabled this MCP */
  enabledById: text('enabled_by_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  repoIdx: index('idx_repo_mcp_servers_repo_id').on(table.repoId),
  slugIdx: index('idx_repo_mcp_servers_slug').on(table.mcpSlug),
  uniqueRepoMcp: unique('unique_repo_mcp').on(table.repoId, table.mcpSlug),
}));

// MCP Server types
export type RepoMcpServer = typeof repoMcpServers.$inferSelect;
export type NewRepoMcpServer = typeof repoMcpServers.$inferInsert;

// ============ SENTINEL (Code Scanning) ============

/**
 * Sentinel scan status enum
 */
export const sentinelScanStatusEnum = pgEnum('sentinel_scan_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

/**
 * Sentinel finding severity enum
 */
export const sentinelFindingSeverityEnum = pgEnum('sentinel_finding_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

/**
 * Sentinel finding category enum
 */
export const sentinelFindingCategoryEnum = pgEnum('sentinel_finding_category', [
  'security',
  'performance',
  'maintainability',
  'reliability',
  'accessibility',
  'best_practice',
  'code_style',
  'documentation',
  'dependency',
  'other',
]);

/**
 * Sentinel configuration for a repository
 * Controls automated scanning behavior and thresholds
 */
export const sentinelConfig = pgTable('sentinel_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Repository this config belongs to */
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' })
    .unique(),
  
  /** Whether sentinel is enabled for this repo */
  enabled: boolean('enabled').notNull().default(false),
  
  /** Whether to run CodeRabbit analysis */
  useCodeRabbit: boolean('use_coderabbit').notNull().default(true),
  
  /** Whether to run built-in security analysis */
  useSecurityAnalysis: boolean('use_security_analysis').notNull().default(true),
  
  /** Whether to run code quality analysis */
  useCodeQualityAnalysis: boolean('use_code_quality_analysis').notNull().default(true),
  
  /** Whether to run dependency vulnerability checks */
  useDependencyCheck: boolean('use_dependency_check').notNull().default(true),
  
  /** Whether to auto-create issues for critical/high findings */
  autoCreateIssues: boolean('auto_create_issues').notNull().default(false),
  
  /** Minimum severity to create issues for: critical, high, medium, low */
  autoCreateIssueSeverity: text('auto_create_issue_severity').notNull().default('high'),
  
  /** Branches to scan (glob patterns, e.g., ["main", "develop", "release/*"]) */
  branchPatterns: jsonb('branch_patterns').$type<string[]>().notNull().default(['main']),
  
  /** File patterns to exclude from scanning */
  excludePatterns: jsonb('exclude_patterns').$type<string[]>().notNull().default([]),
  
  /** Schedule for automated scans (cron expression, null = manual only) */
  scanSchedule: text('scan_schedule'),
  
  /** Custom instructions for the AI analysis */
  customPrompt: text('custom_prompt'),
  
  /** User who last updated this config */
  updatedById: text('updated_by_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  repoIdx: index('idx_sentinel_config_repo_id').on(table.repoId),
}));

/**
 * Sentinel scan record - tracks each scan run
 */
export const sentinelScans = pgTable('sentinel_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Repository being scanned */
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  /** Current status of the scan */
  status: sentinelScanStatusEnum('status').notNull().default('pending'),
  
  /** Branch that was scanned */
  branch: text('branch').notNull(),
  
  /** Commit SHA that was scanned */
  commitSha: text('commit_sha').notNull(),
  
  /** User who triggered the scan (null for scheduled scans) */
  triggeredById: text('triggered_by_id')
    .references(() => authUser.id, { onDelete: 'set null' }),
  
  /** Whether this was a scheduled scan */
  isScheduled: boolean('is_scheduled').notNull().default(false),
  
  /** Number of files scanned */
  filesScanned: integer('files_scanned').default(0),
  
  /** Number of findings by severity */
  criticalCount: integer('critical_count').default(0),
  highCount: integer('high_count').default(0),
  mediumCount: integer('medium_count').default(0),
  lowCount: integer('low_count').default(0),
  infoCount: integer('info_count').default(0),
  
  /** Overall health score (0-100) */
  healthScore: integer('health_score'),
  
  /** Summary of findings */
  summary: text('summary'),
  
  /** AI-generated recommendations for improvement */
  recommendations: jsonb('recommendations').$type<string[]>(),
  
  /** Raw output from analyzers (for debugging) */
  rawOutput: jsonb('raw_output'),
  
  /** Error message if scan failed */
  errorMessage: text('error_message'),
  
  /** When the scan started */
  startedAt: timestamp('started_at', { withTimezone: true }),
  
  /** When the scan completed */
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  repoIdx: index('idx_sentinel_scans_repo_id').on(table.repoId),
  statusIdx: index('idx_sentinel_scans_status').on(table.status),
  createdAtIdx: index('idx_sentinel_scans_created_at').on(table.createdAt),
}));

/**
 * Sentinel findings - individual issues found during scans
 */
export const sentinelFindings = pgTable('sentinel_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Scan this finding belongs to */
  scanId: uuid('scan_id')
    .notNull()
    .references(() => sentinelScans.id, { onDelete: 'cascade' }),
  
  /** Repository for quick lookups */
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  /** Severity of the finding */
  severity: sentinelFindingSeverityEnum('severity').notNull(),
  
  /** Category of the finding */
  category: sentinelFindingCategoryEnum('category').notNull(),
  
  /** Which analyzer found this (e.g., 'coderabbit', 'security', 'dependency') */
  analyzer: text('analyzer').notNull(),
  
  /** Rule/check ID if applicable */
  ruleId: text('rule_id'),
  
  /** File path where the issue was found */
  filePath: text('file_path').notNull(),
  
  /** Line number (start) */
  line: integer('line'),
  
  /** End line number */
  endLine: integer('end_line'),
  
  /** Column number */
  column: integer('column'),
  
  /** Title/short description of the finding */
  title: text('title').notNull(),
  
  /** Detailed message about the finding */
  message: text('message').notNull(),
  
  /** Suggested fix or recommendation */
  suggestion: text('suggestion'),
  
  /** Code snippet showing the issue */
  codeSnippet: text('code_snippet'),
  
  /** Suggested replacement code */
  suggestedFix: text('suggested_fix'),
  
  /** Whether this finding has been acknowledged/dismissed */
  isDismissed: boolean('is_dismissed').notNull().default(false),
  
  /** Reason for dismissal */
  dismissedReason: text('dismissed_reason'),
  
  /** User who dismissed the finding */
  dismissedById: text('dismissed_by_id')
    .references(() => authUser.id, { onDelete: 'set null' }),
  
  /** When the finding was dismissed */
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  
  /** Issue created from this finding (if any) */
  linkedIssueId: uuid('linked_issue_id')
    .references(() => issues.id, { onDelete: 'set null' }),
  
  /** Fingerprint for deduplication across scans */
  fingerprint: text('fingerprint').notNull(),
  
  /** First seen in this commit */
  firstSeenCommit: text('first_seen_commit'),
  
  /** First seen timestamp */
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  scanIdx: index('idx_sentinel_findings_scan_id').on(table.scanId),
  repoIdx: index('idx_sentinel_findings_repo_id').on(table.repoId),
  severityIdx: index('idx_sentinel_findings_severity').on(table.severity),
  categoryIdx: index('idx_sentinel_findings_category').on(table.category),
  fingerprintIdx: index('idx_sentinel_findings_fingerprint').on(table.fingerprint),
  filePathIdx: index('idx_sentinel_findings_file_path').on(table.filePath),
}));

// Sentinel types
export type SentinelScanStatus = (typeof sentinelScanStatusEnum.enumValues)[number];
export type SentinelFindingSeverity = (typeof sentinelFindingSeverityEnum.enumValues)[number];
export type SentinelFindingCategory = (typeof sentinelFindingCategoryEnum.enumValues)[number];

export type SentinelConfig = typeof sentinelConfig.$inferSelect;
export type NewSentinelConfig = typeof sentinelConfig.$inferInsert;

export type SentinelScan = typeof sentinelScans.$inferSelect;
export type NewSentinelScan = typeof sentinelScans.$inferInsert;

export type SentinelFinding = typeof sentinelFindings.$inferSelect;
export type NewSentinelFinding = typeof sentinelFindings.$inferInsert;
