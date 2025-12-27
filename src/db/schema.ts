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
} from 'drizzle-orm/pg-core';

// ============ ENUMS ============

export const ownerTypeEnum = pgEnum('owner_type', ['user', 'organization']);
export const prStateEnum = pgEnum('pr_state', ['open', 'closed', 'merged']);
export const issueStateEnum = pgEnum('issue_state', ['open', 'closed']);
export const issueStatusEnum = pgEnum('issue_status', [
  'backlog',
  'todo', 
  'in_progress',
  'in_review',
  'done',
  'canceled',
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

// ============ USERS ============

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
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
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
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
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
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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

  // Filesystem path to bare repo
  diskPath: text('disk_path').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  pushedAt: timestamp('pushed_at', { withTimezone: true }),
});

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
});

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
});

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

  body: text('body').notNull(),

  // For replies
  replyToId: uuid('reply_to_id').references((): any => prComments.id),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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
  })
);

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
  status: issueStatusEnum('status').notNull().default('backlog'),

  authorId: text('author_id').notNull(), // References better-auth user.id
  assigneeId: text('assignee_id'), // References better-auth user.id

  // Milestone reference
  milestoneId: uuid('milestone_id').references(() => milestones.id, {
    onDelete: 'set null',
  }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedById: text('closed_by_id'), // References better-auth user.id
});

export const issueComments = pgTable('issue_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: uuid('issue_id')
    .notNull()
    .references(() => issues.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // References better-auth user.id

  body: text('body').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const labels = pgTable('labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  color: text('color').notNull().default('888888'), // Hex color
  description: text('description'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

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

// ============ ACTIVITY ============

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),

  actorId: text('actor_id').notNull(), // References better-auth user.id
  repoId: uuid('repo_id').references(() => repositories.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'push', 'pr_opened', 'issue_opened', 'fork', etc.
  payload: text('payload'), // JSON data

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

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
});

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
});

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
});

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
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============ TYPE EXPORTS ============

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
export type PrState = (typeof prStateEnum.enumValues)[number];

// Workflow run types
export type WorkflowRunState = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type WorkflowRunConclusion = 'success' | 'failure' | 'cancelled';

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;

export type JobRun = typeof jobRuns.$inferSelect;
export type NewJobRun = typeof jobRuns.$inferInsert;

export type StepRun = typeof stepRuns.$inferSelect;
export type NewStepRun = typeof stepRuns.$inferInsert;
