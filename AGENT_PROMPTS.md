# wit Platform - Agent Prompts

Self-contained prompts for coding agents to implement features from the roadmap. Each prompt includes all necessary context, file locations, and acceptance criteria.

---

## Table of Contents

- [Quick Wins (< 4 hours)](#quick-wins)
- [Stream 9: Platform Critical Features (P0)](#stream-9-platform-critical-features)
- [Stream 10: Platform Parity Features (P1)](#stream-10-platform-parity-features)
- [Stream 11: Diff Enhancements (P2)](#stream-11-diff-enhancements)
- [Stream 12: Enterprise & Scale (P2)](#stream-12-enterprise--scale)

---

## What's Already Implemented

Before working on new features, note that these are **already complete**:

### AI Tools (15 tools in `src/ai/tools/`)
- `create-commit.ts` - AI commit messages
- `generate-pr-description.ts` - AI PR descriptions
- `review-pr.ts` - AI code review
- `semantic-search.ts` - Natural language code search
- `resolve-conflict.ts` - Conflict resolution
- `get-branches.ts`, `get-diff.ts`, `get-log.ts`, `get-status.ts`
- `get-merge-conflicts.ts`, `stage-files.ts`, `switch-branch.ts`
- `search.ts`, `undo.ts`

### Test Coverage (29 test files in `src/__tests__/`)
- `repository.test.ts` - Core Repository class
- `merge.test.ts` - Merge functionality
- `semantic-search.test.ts` - Embeddings, chunking, vector store
- `hooks.test.ts`, `packed-refs.test.ts`, `rebase.test.ts`
- And 23 more test files

### Core Features
- Branch state manager (`src/core/branch-state.ts`)
- Git hooks system (`src/core/hooks.ts`)
- Large file support (`src/core/large-file.ts`)
- Git primitives: filesystem & knowledge (`src/primitives/`)
- Semantic search with embeddings (`src/search/`)

### CI/CD Pipeline (`.github/workflows/ci.yml`)
- Lint (`npm run lint`)
- Type check (`npm run typecheck`)
- Build
- Tests with coverage
- PostgreSQL service for integration tests

---

## Quick Wins

### QW-1: Implement Fork Creation Logic

**Effort:** 4 hours
**Priority:** P1

**Prompt:**

```
Implement fork creation logic for repositories.

CONTEXT:

- Database schema for repositories exists in `src/db/schema.ts`
- Repositories have a `forkedFromId` field already
- Repository model at `src/db/models/repos.ts`
- Need to copy repository and set fork relationship

TASK:

1. Add fork method to `src/db/models/repos.ts`:

```typescript
export async function forkRepository(
  sourceRepoId: string,
  targetUserId: string,
  options?: { name?: string; description?: string }
): Promise<Repository> {
  // Get source repo
  const source = await findById(sourceRepoId);
  if (!source) throw new Error('Repository not found');

  // Create fork in database
  const fork = await db.insert(repositories).values({
    name: options?.name ?? source.name,
    description: options?.description ?? source.description,
    ownerId: targetUserId,
    forkedFromId: sourceRepoId,
    visibility: source.visibility,
    defaultBranch: source.defaultBranch,
  }).returning();

  // Copy git objects
  await copyGitObjects(source.diskPath, fork[0].diskPath);

  return fork[0];
}

async function copyGitObjects(sourcePath: string, targetPath: string): Promise<void> {
  // Initialize empty repo at target
  // Copy objects from source
  // Copy refs from source
  // Set up remote pointing to source
}
```

2. Add tRPC endpoint in `src/api/trpc/routers/repos.ts`:

```typescript
fork: protectedProcedure
  .input(z.object({
    repoId: z.string().uuid(),
    name: z.string().optional(),
    description: z.string().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    // Check if user can fork (repo is public or user has access)
    // Check if user doesn't already have a fork
    // Create fork
    return repoModel.forkRepository(input.repoId, ctx.user.id, {
      name: input.name,
      description: input.description,
    });
  }),
```

3. Add CLI command option in `src/commands/clone.ts`:

```typescript
// Add --fork flag to clone command
// wit clone --fork owner/repo
```

ACCEPTANCE CRITERIA:

- [ ] Fork creates new repository linked to source
- [ ] Git objects are copied correctly
- [ ] All branches and tags are copied
- [ ] Fork shows in user's repository list
- [ ] Source shows fork count
- [ ] Cannot fork same repo twice
- [ ] Works for public repos and repos user has access to
```

---

### QW-2: Add Release Schema and CRUD

**Effort:** 4 hours
**Priority:** P2

**Prompt:**

```
Implement releases feature (tag-based releases with assets).

CONTEXT:

- Tags already implemented in git operations
- Need database schema to track releases with metadata
- Similar to GitHub releases

TASK:

1. Add schema to `src/db/schema.ts`:

```typescript
export const releases = pgTable('releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  tagName: text('tag_name').notNull(),
  name: text('name').notNull(),
  body: text('body'), // Markdown release notes
  isDraft: boolean('is_draft').notNull().default(false),
  isPrerelease: boolean('is_prerelease').notNull().default(false),
  authorId: uuid('author_id').notNull().references(() => users.id),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const releaseAssets = pgTable('release_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id').notNull().references(() => releases.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  downloadUrl: text('download_url').notNull(),
  downloadCount: integer('download_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

2. Create model `src/db/models/releases.ts`:

```typescript
export async function create(data: CreateRelease): Promise<Release>;
export async function findById(id: string): Promise<Release | null>;
export async function findByRepoId(repoId: string): Promise<Release[]>;
export async function findByTag(repoId: string, tagName: string): Promise<Release | null>;
export async function update(id: string, data: UpdateRelease): Promise<Release>;
export async function deleteRelease(id: string): Promise<void>;
export async function publish(id: string): Promise<Release>;
export async function addAsset(releaseId: string, asset: CreateAsset): Promise<ReleaseAsset>;
export async function deleteAsset(assetId: string): Promise<void>;
```

3. Create tRPC router `src/api/trpc/routers/releases.ts`:

```typescript
export const releasesRouter = router({
  list: publicProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input }) => {
      return releaseModel.findByRepoId(input.repoId);
    }),

  create: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      tagName: z.string(),
      name: z.string(),
      body: z.string().optional(),
      isDraft: z.boolean().default(false),
      isPrerelease: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify tag exists
      // Create release
    }),

  publish: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return releaseModel.publish(input.id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return releaseModel.deleteRelease(input.id);
    }),
});
```

4. Add router to main router in `src/api/trpc/routers/index.ts`

ACCEPTANCE CRITERIA:

- [ ] Releases linked to git tags
- [ ] Support draft and pre-release states
- [ ] Markdown release notes
- [ ] Asset upload support
- [ ] Download counting
- [ ] List releases by repo
- [ ] Get latest release
```

---

## Stream 9: Platform Critical Features

### S9-1: CI/CD Engine - Workflow Parser

**Effort:** 8-10 hours
**Priority:** P0

**Prompt:**

```
Implement workflow YAML parser for CI/CD engine.

CONTEXT:

- Building GitHub Actions alternative
- Workflows will be in `.wit/workflows/*.yml`
- Need to support jobs, steps, env vars, secrets, conditions

TASK:

1. Create `src/ci/index.ts` - CI engine entry point
2. Create `src/ci/types.ts` with workflow types:

```typescript
interface Workflow {
  name: string;
  on: WorkflowTrigger;
  env?: Record<string, string>;
  jobs: Record<string, Job>;
}

interface WorkflowTrigger {
  push?: { branches?: string[]; tags?: string[]; paths?: string[] };
  pull_request?: { branches?: string[]; types?: string[] };
  workflow_dispatch?: { inputs?: Record<string, InputDef> };
  schedule?: { cron: string }[];
}

interface Job {
  name?: string;
  'runs-on': string;
  needs?: string[];
  if?: string;
  env?: Record<string, string>;
  steps: Step[];
  services?: Record<string, Service>;
  container?: Container;
  outputs?: Record<string, string>;
}

interface Step {
  name?: string;
  id?: string;
  uses?: string;  // Action reference
  run?: string;   // Shell command
  with?: Record<string, string>;
  env?: Record<string, string>;
  if?: string;
  'working-directory'?: string;
  shell?: string;
  'continue-on-error'?: boolean;
  'timeout-minutes'?: number;
}
```

3. Create `src/ci/parser.ts`:

```typescript
import YAML from 'yaml';

export function parseWorkflow(content: string): Workflow {
  const raw = YAML.parse(content);
  return validateWorkflow(raw);
}

export function validateWorkflow(raw: unknown): Workflow {
  // Validate required fields
  // Validate job dependencies (no cycles)
  // Validate step references
  // Return typed Workflow or throw errors
}

export function loadWorkflows(repoPath: string): Workflow[] {
  const workflowDir = path.join(repoPath, '.wit', 'workflows');
  // Read all .yml/.yaml files
  // Parse and validate each
  // Return array of workflows
}
```

4. Create validation for:
   - Required fields (name, on, jobs)
   - Job dependency cycles
   - Valid trigger events
   - Expression syntax (${{ ... }})

5. Add tests in `src/ci/__tests__/parser.test.ts`

ACCEPTANCE CRITERIA:

- [ ] Parses valid YAML workflows
- [ ] Returns typed Workflow object
- [ ] Validates required fields
- [ ] Detects circular job dependencies
- [ ] Handles all trigger types
- [ ] Clear error messages for invalid workflows
- [ ] Tests cover valid and invalid cases
```

---

### S9-2: CI/CD Engine - Job Scheduler

**Effort:** 10-12 hours
**Priority:** P0
**Dependencies:** S9-1

**Prompt:**

```
Implement job scheduler and queue for CI/CD engine.

CONTEXT:

- Workflows parsed by parser.ts (from S9-1)
- Need to schedule jobs respecting dependencies
- Need to track job status and output

TASK:

1. Add DB schema for workflow runs in `src/db/schema.ts`:

```typescript
export const workflowRunStateEnum = pgEnum('workflow_run_state', [
  'queued', 'in_progress', 'completed', 'failed', 'cancelled'
]);

export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull().references(() => repositories.id),
  workflowPath: text('workflow_path').notNull(),
  commitSha: text('commit_sha').notNull(),
  event: text('event').notNull(),  // 'push', 'pull_request', etc.
  eventPayload: text('event_payload'),  // JSON
  state: workflowRunStateEnum('state').notNull().default('queued'),
  conclusion: text('conclusion'),  // 'success', 'failure', 'cancelled'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});

export const jobRuns = pgTable('job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowRunId: uuid('workflow_run_id').notNull().references(() => workflowRuns.id),
  jobName: text('job_name').notNull(),
  state: workflowRunStateEnum('state').notNull().default('queued'),
  conclusion: text('conclusion'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  logs: text('logs'),
  outputs: text('outputs'),  // JSON
});
```

2. Create `src/ci/scheduler.ts`:

```typescript
export class JobScheduler {
  private queue: JobRun[] = [];
  private running: Map<string, JobRun> = new Map();
  private maxConcurrent: number = 4;

  async enqueue(workflowRun: WorkflowRun): Promise<void> {
    // Create JobRun entries for each job in workflow
    // Respect 'needs' dependencies
    // Add to queue
  }

  async processQueue(): Promise<void> {
    // Find jobs ready to run (dependencies met)
    // Respect maxConcurrent limit
    // Execute jobs
  }

  async executeJob(jobRun: JobRun): Promise<void> {
    // Will call runner.ts (next prompt)
    // Update state as it progresses
    // Store logs and outputs
  }

  canJobRun(job: Job, completedJobs: Set<string>): boolean {
    // Check if all 'needs' are in completedJobs
  }

  async cancelRun(workflowRunId: string): Promise<void> {
    // Cancel queued jobs
    // Signal running jobs to stop
  }
}
```

3. Create `src/ci/events.ts` for triggering workflows:

```typescript
export async function handlePush(repoId: string, payload: PushPayload): Promise<void> {
  // Find matching workflows (on.push triggers)
  // Queue workflow runs
}

export async function handlePullRequest(repoId: string, payload: PRPayload): Promise<void> {
  // Find matching workflows
  // Queue workflow runs
}

export function matchesTrigger(workflow: Workflow, event: string, payload: any): boolean {
  // Check if workflow should run for this event
  // Match branches, paths, types
}
```

ACCEPTANCE CRITERIA:

- [ ] Jobs queue in correct order
- [ ] Dependencies respected
- [ ] Concurrent execution with limit
- [ ] Job status tracked in DB
- [ ] Logs stored per job
- [ ] Cancel support
- [ ] Push/PR events trigger workflows
```

---

### S9-3: CI/CD Engine - Job Runner

**Effort:** 12-16 hours
**Priority:** P0
**Dependencies:** S9-2

**Prompt:**

```
Implement job runner with Docker container execution.

CONTEXT:

- Jobs scheduled by scheduler.ts
- Need to run steps in isolated containers
- Support for 'uses' actions and 'run' commands

TASK:

1. Create `src/ci/runner.ts`:

```typescript
export class JobRunner {
  async run(job: Job, context: RunContext): Promise<JobResult> {
    // Prepare container
    // Run each step
    // Collect outputs
    // Cleanup
  }

  private async runStep(step: Step, container: Container): Promise<StepResult> {
    if (step.run) {
      return this.runCommand(step.run, container, step);
    } else if (step.uses) {
      return this.runAction(step.uses, container, step);
    }
  }

  private async runCommand(cmd: string, container: Container, step: Step): Promise<StepResult> {
    // Execute shell command in container
    // Capture stdout/stderr
    // Return exit code
  }

  private async runAction(uses: string, container: Container, step: Step): Promise<StepResult> {
    // Parse action reference (owner/repo@version or ./local)
    // Download/cache action
    // Execute action
  }
}
```

2. Create `src/ci/docker.ts`:

```typescript
import Docker from 'dockerode';

export class ContainerManager {
  private docker: Docker;

  async createContainer(image: string, options: ContainerOptions): Promise<Container> {
    // Pull image if needed
    // Create container with mounts, env, network
  }

  async exec(container: Container, command: string[]): Promise<ExecResult> {
    // Execute command in container
    // Stream logs
    // Return exit code
  }

  async cleanup(container: Container): Promise<void> {
    // Stop container
    // Remove container
    // Cleanup volumes
  }
}
```

3. Create `src/ci/artifacts.ts`:

```typescript
export class ArtifactStore {
  async upload(runId: string, name: string, paths: string[]): Promise<void> {
    // Compress files
    // Store in S3 or local storage
    // Record in database
  }

  async download(runId: string, name: string, dest: string): Promise<void> {
    // Download artifact
    // Extract to destination
  }

  async list(runId: string): Promise<Artifact[]> {
    // List all artifacts for run
  }
}
```

4. Implement context and expression evaluation:

```typescript
interface RunContext {
  github: {  // (we'll call it 'wit' but keep compatible structure)
    event: string;
    sha: string;
    ref: string;
    repository: string;
    actor: string;
  };
  env: Record<string, string>;
  secrets: Record<string, string>;
  needs: Record<string, JobOutput>;
  steps: Record<string, StepOutput>;
}

function evaluateExpression(expr: string, context: RunContext): string {
  // Parse ${{ ... }} expressions
  // Support: env.*, secrets.*, needs.*.outputs.*, steps.*.outputs.*
  // Support: contains(), startsWith(), format(), etc.
}
```

ACCEPTANCE CRITERIA:

- [ ] Steps run in Docker containers
- [ ] Commands execute with correct shell
- [ ] Actions downloaded and executed
- [ ] Environment variables set correctly
- [ ] Secrets masked in logs
- [ ] Artifacts uploaded/downloadable
- [ ] Expression evaluation works
- [ ] Cleanup on success/failure
```

---

### S9-4: Branch Protection Rules

**Effort:** 8-10 hours
**Priority:** P0

**Prompt:**

```
Implement branch protection rules system.

CONTEXT:

- Need to protect important branches (main, release/*)
- Block direct pushes, require reviews, require CI
- Server-side enforcement on push

TASK:

1. Add schema in `src/db/schema.ts`:

```typescript
export const branchProtectionRules = pgTable('branch_protection_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(),  // 'main', 'release/*', etc.

  // Checks
  requirePullRequest: boolean('require_pull_request').notNull().default(false),
  requiredApprovals: integer('required_approvals').notNull().default(0),
  dismissStaleReviews: boolean('dismiss_stale_reviews').notNull().default(false),
  requireCodeOwnerReview: boolean('require_code_owner_review').notNull().default(false),

  // Status checks
  requireStatusChecks: boolean('require_status_checks').notNull().default(false),
  requiredStatusChecks: text('required_status_checks'),  // JSON array
  requireBranchUpToDate: boolean('require_branch_up_to_date').notNull().default(false),

  // Push restrictions
  allowForcePush: boolean('allow_force_push').notNull().default(false),
  allowDeletions: boolean('allow_deletions').notNull().default(false),
  restrictPushAccess: boolean('restrict_push_access').notNull().default(false),
  allowedPushers: text('allowed_pushers'),  // JSON array of user/team IDs

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

2. Create `src/core/branch-protection.ts`:

```typescript
export class BranchProtectionEngine {
  async getRulesForBranch(repoId: string, branchName: string): Promise<BranchProtectionRule[]> {
    // Find all rules matching branch
    // Support glob patterns
  }

  async canPush(repoId: string, branchName: string, userId: string): Promise<ProtectionResult> {
    const rules = await this.getRulesForBranch(repoId, branchName);
    // Check if push is allowed
    // Return { allowed, violations[] }
  }

  async canMerge(prId: string): Promise<ProtectionResult> {
    // Get PR and target branch rules
    // Check required approvals
    // Check required status checks
    // Check branch up-to-date
    // Return { allowed, violations[] }
  }

  async canForcePush(repoId: string, branchName: string, userId: string): Promise<boolean> {
    // Check if force push allowed
  }

  async canDeleteBranch(repoId: string, branchName: string, userId: string): Promise<boolean> {
    // Check if deletion allowed
  }
}
```

3. Create model and API endpoints:
   - `src/db/models/branch-rules.ts`
   - `src/api/trpc/routers/branches.ts`

4. Integrate with git-receive-pack in `src/server/`:
   - Check protection rules before accepting push
   - Return detailed error on violation

5. Integrate with PR merge:
   - Check canMerge() before allowing merge
   - Show required checks in UI

ACCEPTANCE CRITERIA:

- [ ] Protection rules stored in DB
- [ ] Pattern matching works (main, release/*, **/protected)
- [ ] Push blocked on protected branches
- [ ] Required reviews enforced
- [ ] Required status checks enforced
- [ ] Force push blocked by default
- [ ] Branch deletion blocked
- [ ] Clear error messages on violations
```

---

### S9-5: Notifications System

**Effort:** 10-12 hours
**Priority:** P0

**Prompt:**

```
Implement notifications system for platform events.

CONTEXT:

- Users need to be notified of relevant events
- Support in-app and email notifications
- Real-time via WebSocket

TASK:

1. Add schema in `src/db/schema.ts`:

```typescript
export const notificationTypeEnum = pgEnum('notification_type', [
  'pr_opened', 'pr_merged', 'pr_closed', 'pr_review_requested', 'pr_reviewed', 'pr_comment',
  'issue_opened', 'issue_closed', 'issue_assigned', 'issue_comment',
  'mention', 'ci_failed', 'ci_passed'
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  url: text('url'),  // Link to relevant page
  repoId: uuid('repo_id').references(() => repositories.id),
  actorId: uuid('actor_id').references(() => users.id),  // Who triggered
  isRead: boolean('is_read').notNull().default(false),
  emailSent: boolean('email_sent').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  inApp: boolean('in_app').notNull().default(true),
  email: boolean('email').notNull().default(true),
});
```

2. Create `src/notifications/index.ts`:

```typescript
export class NotificationService {
  async notify(userId: string, notification: CreateNotification): Promise<void> {
    // Check user preferences
    // Create in-app notification
    // Send email if enabled
    // Push via WebSocket
  }

  async notifyMany(userIds: string[], notification: CreateNotification): Promise<void> {
    // Batch notify multiple users
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    // Mark single notification as read
  }

  async markAllRead(userId: string): Promise<void> {
    // Mark all as read
  }
}
```

3. Create `src/notifications/events.ts`:

```typescript
// Event handlers that create notifications
export async function onPROpened(pr: PullRequest): Promise<void> {
  // Notify repo watchers
  // Notify requested reviewers
}

export async function onPRComment(comment: PRComment): Promise<void> {
  // Notify PR author
  // Notify mentioned users
  // Notify thread participants
}

export async function onMention(userId: string, context: MentionContext): Promise<void> {
  // Notify mentioned user
}

export function extractMentions(text: string): string[] {
  // Parse @username mentions from text
}
```

4. Create `src/notifications/email.ts` and `src/notifications/websocket.ts`

5. Create tRPC router `src/api/trpc/routers/notifications.ts`:
   - list: Get user notifications (paginated)
   - markRead: Mark notification as read
   - markAllRead: Mark all as read
   - preferences: Get/set notification preferences
   - unreadCount: Get count of unread

ACCEPTANCE CRITERIA:

- [ ] Notifications created for all event types
- [ ] In-app notifications visible to users
- [ ] Email notifications sent (when enabled)
- [ ] WebSocket push for real-time
- [ ] User preferences respected
- [ ] @mentions detected and notified
- [ ] Unread count accurate
- [ ] Mark read works
```

---

### S9-6: PR Merge Execution

**Effort:** 6-8 hours
**Priority:** P0

**Prompt:**

```
Implement actual git merge execution when merging PRs.

CONTEXT:

- Current PR merge only updates database state
- Need to perform actual git merge on server
- Support merge, squash, and rebase strategies
- Located in `src/api/trpc/routers/pulls.ts` and `src/server/storage/repos.ts`

TASK:

1. Create `src/server/storage/merge.ts`:

```typescript
import { Repository } from '../../core/repository';

export interface MergeResult {
  success: boolean;
  mergeSha?: string;
  error?: string;
  conflicts?: string[];
}

export type MergeStrategy = 'merge' | 'squash' | 'rebase';

export async function mergePullRequest(
  repoPath: string,
  sourceBranch: string,
  targetBranch: string,
  strategy: MergeStrategy,
  options: {
    authorName: string;
    authorEmail: string;
    message?: string;
  }
): Promise<MergeResult> {
  const repo = new Repository(repoPath);

  // Checkout target branch
  repo.checkout(targetBranch);

  switch (strategy) {
    case 'merge':
      return performMerge(repo, sourceBranch, options);
    case 'squash':
      return performSquash(repo, sourceBranch, options);
    case 'rebase':
      return performRebase(repo, sourceBranch, options);
  }
}
```

2. Update `src/api/trpc/routers/pulls.ts`:

```typescript
merge: protectedProcedure
  .input(z.object({
    prId: z.string().uuid(),
    strategy: z.enum(['merge', 'squash', 'rebase']).default('merge'),
    message: z.string().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    const pr = await prModel.findById(input.prId);
    // ... permission checks ...

    // Check protection rules
    const protection = new BranchProtectionEngine();
    const canMerge = await protection.canMerge(input.prId);
    if (!canMerge.allowed) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Cannot merge: ${canMerge.violations.join(', ')}`,
      });
    }

    // Perform actual merge
    const repo = await repoModel.findById(pr.repoId);
    const result = await mergePullRequest(
      repo.diskPath,
      pr.sourceBranch,
      pr.targetBranch,
      input.strategy,
      {
        authorName: ctx.user.name,
        authorEmail: ctx.user.email,
        message: input.message,
      }
    );

    if (!result.success) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: result.error || 'Merge failed',
      });
    }

    // Update PR in database
    return prModel.merge(input.prId, ctx.user.id, result.mergeSha!);
  }),
```

3. Add conflict detection:

```typescript
checkMergeability: protectedProcedure
  .input(z.object({ prId: z.string().uuid() }))
  .query(async ({ input }) => {
    // Check if PR can be merged without conflicts
    // Return { mergeable: boolean, conflicts?: string[] }
  }),
```

ACCEPTANCE CRITERIA:

- [ ] Merge commit created in repo
- [ ] Squash merge works (single commit)
- [ ] Rebase merge works
- [ ] Conflicts detected before merge
- [ ] Protection rules enforced
- [ ] Branch updated after merge
- [ ] Source branch optionally deleted after merge
```

---

## Stream 10: Platform Parity Features

### S10-1: Full-Text Code Search (Meilisearch)

**Effort:** 12-16 hours
**Priority:** P1

**Prompt:**

```
Implement full-text code search using Meilisearch.

CONTEXT:

- Semantic search already exists in `src/search/` (embedding-based)
- Need traditional full-text search for exact matches, regex
- Use Meilisearch for performance

NOTE: This is DIFFERENT from the existing semantic search. Semantic search
uses embeddings for natural language queries. This is for traditional
text search with regex, exact match, etc.

TASK:

1. Add Meilisearch to docker-compose.yml:

```yaml
services:
  meilisearch:
    image: getmeili/meilisearch:latest
    ports:
      - "7700:7700"
    environment:
      - MEILI_MASTER_KEY=${MEILI_MASTER_KEY}
    volumes:
      - meili_data:/meili_data
```

2. Create `src/search/fulltext/index.ts`:

```typescript
import { MeiliSearch } from 'meilisearch';

export interface FullTextSearchResult {
  repoId: string;
  repoName: string;
  path: string;
  line: number;
  content: string;
  highlights: { start: number; end: number }[];
}

export interface SearchOptions {
  query: string;
  repos?: string[];  // Limit to specific repos
  path?: string;     // Filter by path pattern
  language?: string; // Filter by language
  limit?: number;
  offset?: number;
}
```

3. Create `src/search/fulltext/indexer.ts`:

```typescript
export class FullTextIndexer {
  async indexRepository(repoId: string): Promise<void> {
    // Get all files from repo
    // Extract content from text files
    // Index with repo, path, content, language
  }

  async indexCommit(repoId: string, commitSha: string): Promise<void> {
    // Index only changed files
    // Remove deleted files from index
  }

  async removeRepository(repoId: string): Promise<void> {
    // Remove all indexed content for repo
  }
}
```

4. Create `src/search/fulltext/service.ts`:

```typescript
export class FullTextSearchService {
  async search(userId: string, options: SearchOptions): Promise<FullTextSearchResult[]> {
    // Check repo access permissions
    // Search indexed content
    // Highlight matches
    // Return results
  }
}
```

5. Add tRPC endpoint in `src/api/trpc/routers/search.ts`:

```typescript
export const searchRouter = router({
  fulltext: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      repos: z.array(z.string().uuid()).optional(),
      path: z.string().optional(),
      language: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      // Filter to repos user can access
      // Perform search
      // Return results with context
    }),
});
```

6. Hook into git-receive-pack to index on push

ACCEPTANCE CRITERIA:

- [ ] Full-text code search works
- [ ] Results include file path and line number
- [ ] Search respects repository permissions
- [ ] Regex search supported
- [ ] Filter by language/path
- [ ] Reasonable performance (< 2s for typical queries)
- [ ] Index updated on push
```

---

### S10-2: OAuth Providers (GitHub/GitLab)

**Effort:** 8-10 hours
**Priority:** P1

**Prompt:**

```
Implement OAuth login with GitHub and GitLab.

CONTEXT:

- OAuth accounts schema exists in `src/db/schema.ts`
- Auth router at `src/api/trpc/routers/auth.ts`
- Need to link OAuth to user accounts
- Support login and account linking

TASK:

1. Create `src/core/oauth/index.ts`:

```typescript
export interface OAuthProvider {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}

export const providers: Record<string, OAuthProvider> = {
  github: {
    name: 'GitHub',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
  },
  gitlab: {
    name: 'GitLab',
    authorizationUrl: 'https://gitlab.com/oauth/authorize',
    tokenUrl: 'https://gitlab.com/oauth/token',
    userInfoUrl: 'https://gitlab.com/api/v4/user',
    scopes: ['read_user'],
  },
};
```

2. Create `src/core/oauth/github.ts` and `src/core/oauth/gitlab.ts`

3. Update `src/api/trpc/routers/auth.ts`:

```typescript
// Get OAuth authorization URL
oauthUrl: publicProcedure
  .input(z.object({
    provider: z.enum(['github', 'gitlab']),
    redirectUri: z.string().url(),
  }))
  .query(async ({ input }) => {
    const state = generateSecureState();
    return getAuthorizationUrl(input.provider, state, input.redirectUri);
  }),

// Handle OAuth callback
oauthCallback: publicProcedure
  .input(z.object({
    provider: z.enum(['github', 'gitlab']),
    code: z.string(),
    state: z.string(),
  }))
  .mutation(async ({ input }) => {
    // Validate state
    // Exchange code for tokens
    // Get user info
    // Find or create user
    // Link OAuth account
    // Create session
    return { user, session };
  }),

// Link OAuth to existing account
linkOAuth: protectedProcedure
  .input(z.object({
    provider: z.enum(['github', 'gitlab']),
    code: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    // Exchange code
    // Link to current user
  }),
```

ACCEPTANCE CRITERIA:

- [ ] GitHub OAuth login works
- [ ] GitLab OAuth login works
- [ ] New users created from OAuth
- [ ] Existing users can link OAuth
- [ ] Account merging when same email
- [ ] OAuth unlinking (if password exists)
- [ ] Tokens stored securely
```

---

## Stream 11: Diff Enhancements

### S11-1: Implement Rename Detection in Diff

**Effort:** 6-8 hours
**Priority:** P2

**Prompt:**

```
Implement rename detection in the diff algorithm.

CONTEXT:

- Current diff shows deleted file + new file instead of rename
- Diff module at `src/core/diff.ts`
- FileDiff interface has oldPath/newPath fields (already supports renames)
- Git uses content similarity for rename detection

TASK:

1. Add rename detection to `src/core/diff.ts`:

```typescript
interface RenameCandidate {
  oldPath: string;
  newPath: string;
  similarity: number;  // 0-100%
}

function detectRenames(
  deletedFiles: FileDiff[],
  addedFiles: FileDiff[],
  threshold: number = 50  // 50% similarity threshold
): RenameCandidate[] {
  // Compare each deleted file with each added file
  // Calculate similarity based on:
  // - Content similarity (most important)
  // - Filename similarity (secondary)
  // Return pairs above threshold
}

function calculateSimilarity(oldContent: string, newContent: string): number {
  // Use LCS length / max(oldLen, newLen) * 100
  // Or compare line-by-line matches
}
```

2. Integrate into diff pipeline:
   - When computing diff for commit/status
   - Check deleted + added files for renames
   - Convert matched pairs to rename FileDiff

3. Update FileDiff to support renames:

```typescript
interface FileDiff {
  oldPath: string;
  newPath: string;
  isRename: boolean;      // Add this
  similarity?: number;    // Add this (for renames)
  // ... existing fields
}
```

4. Update formatters:
   - Show "renamed: old -> new (X% similar)"
   - Only show actual content changes in hunks

5. Update commands that use diff:
   - `wit diff` - show renames
   - `wit status` - show "renamed: old -> new"

ACCEPTANCE CRITERIA:

- [ ] Renames detected at 50%+ similarity
- [ ] Renamed files show as rename, not delete+add
- [ ] Similarity percentage displayed
- [ ] Works in `wit status` and `wit diff`
- [ ] Configurable threshold
- [ ] Performance acceptable (no N*M full comparisons for large repos)
```

---

## Stream 12: Enterprise & Scale

### S12-1: SSH Protocol Support

**Effort:** 16-20 hours
**Priority:** P2

**Prompt:**

```
Add SSH protocol support for git operations.

CONTEXT:

- Currently only HTTPS supported
- Many users prefer SSH for key-based auth
- Need SSH server that speaks git protocol

TASK:

1. Create `src/server/ssh/index.ts`:

```typescript
import ssh2 from 'ssh2';

export class SSHServer {
  private server: ssh2.Server;

  constructor(options: { hostKeys: Buffer[], port: number }) {
    this.server = new ssh2.Server({
      hostKeys: options.hostKeys,
    }, this.onConnection.bind(this));
  }

  private onConnection(client: ssh2.Connection): void {
    client.on('authentication', this.handleAuth.bind(this, client));
    client.on('ready', () => {
      client.on('session', this.handleSession.bind(this, client));
    });
  }
}
```

2. Create `src/server/ssh/git-commands.ts` for handling git operations

3. Add SSH key management:
   - Schema for `ssh_keys` table
   - tRPC router for key CRUD

4. Update server entrypoint to start SSH server

ACCEPTANCE CRITERIA:

- [ ] SSH server listens on port 22 (or configurable)
- [ ] Public key authentication works
- [ ] git clone via SSH works
- [ ] git push via SSH works
- [ ] SSH keys manageable via API
- [ ] Key fingerprints displayed
- [ ] Last used tracking
```

---

### S12-2: Rate Limiting

**Effort:** 4-6 hours
**Priority:** P2

**Prompt:**

```
Implement rate limiting for API protection.

CONTEXT:

- Server uses Hono HTTP framework
- Need to protect against abuse
- Different limits for different endpoints

TASK:

1. Create `src/server/middleware/rate-limit.ts`:

```typescript
import { Context, MiddlewareHandler } from 'hono';
import Redis from 'ioredis';

interface RateLimitConfig {
  windowMs: number;    // Time window
  max: number;         // Max requests in window
  keyGenerator?: (c: Context) => string;
  handler?: (c: Context) => Response;
}

export function rateLimit(config: RateLimitConfig): MiddlewareHandler {
  return async (c, next) => {
    const key = config.keyGenerator?.(c) ?? c.req.header('x-forwarded-for') ?? 'unknown';
    const rateKey = `ratelimit:${key}`;

    const current = await redis.incr(rateKey);
    if (current === 1) {
      await redis.pexpire(rateKey, config.windowMs);
    }

    c.header('X-RateLimit-Limit', String(config.max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, config.max - current)));

    if (current > config.max) {
      const retryAfter = await redis.pttl(rateKey);
      c.header('Retry-After', String(Math.ceil(retryAfter / 1000)));

      return config.handler?.(c) ?? c.json({ error: 'Too many requests' }, 429);
    }

    await next();
  };
}
```

2. Create rate limit presets for different endpoint types

3. Add Redis to docker-compose.yml

ACCEPTANCE CRITERIA:

- [ ] Rate limits enforced per endpoint type
- [ ] Proper HTTP headers returned
- [ ] 429 response when exceeded
- [ ] Retry-After header set
- [ ] Different limits for different users
- [ ] Bypass for trusted sources
```

---

## Usage Guidelines

### For Coding Agents

1. **Read the entire prompt** before starting
2. **Check dependencies** - some prompts depend on others
3. **Follow existing patterns** - look at referenced files
4. **Write tests** - all features need test coverage
5. **Update related files** - exports, routers, etc.

### Priority Order

1. Complete **Stream 9** (Platform Critical) first
2. **Stream 10** features can be parallelized after S9
3. **Streams 11-12** are polish/enterprise features

### Dependencies

```
S9-1 (Workflow Parser) -> none
S9-2 (Job Scheduler) -> S9-1
S9-3 (Job Runner) -> S9-2
S9-4 (Branch Protection) -> none
S9-5 (Notifications) -> none
S9-6 (PR Merge) -> S9-4

S10-1 (Full-text Search) -> none
S10-2 (OAuth) -> none

S11-1 (Rename Detection) -> none

S12-1 (SSH) -> none
S12-2 (Rate Limiting) -> none

QW-1 (Forks) -> none
QW-2 (Releases) -> none
```
