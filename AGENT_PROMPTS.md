# wit Platform - Agent Prompts

Self-contained prompts for coding agents to implement features from the roadmap. Each prompt includes all necessary context, file locations, and acceptance criteria.

---

## Table of Contents

- [Quick Wins (< 2 hours)](#quick-wins)
- [Stream 6: Foundation Hardening (P0)](#stream-6-foundation-hardening)
- [Stream 7: Platform Critical Features (P0)](#stream-7-platform-critical-features)
- [Stream 8: Platform Parity Features (P1)](#stream-8-platform-parity-features)
- [Stream 9: AI Differentiation (P1)](#stream-9-ai-differentiation)
- [Stream 10: Polish & Scale (P2)](#stream-10-polish--scale)

---

### QW-2: Add TypeScript Type Checking to CI

**Effort:** 15 minutes

**Prompt:**

```
Add TypeScript type checking step to the CI workflow.

CONTEXT:
- Project uses TypeScript with tsconfig.json at root
- CI workflow is at `.github/workflows/ci.yml`
- Build step uses `npm run build` but we want explicit type checking

TASK:
1. Add a "typecheck" script to package.json: "typecheck": "tsc --noEmit"

2. Add a type-check step to `.github/workflows/ci.yml` AFTER lint, BEFORE build:
   - name: Type Check
     run: npm run typecheck

ACCEPTANCE CRITERIA:
- [ ] `npm run typecheck` passes locally
- [ ] CI runs type check before build
- [ ] Type errors fail the CI
```

---

### QW-3: Add Coverage Reporting to CI

**Effort:** 1 hour

**Prompt:**

````
Add test coverage reporting with thresholds to CI.

CONTEXT:
- Project uses Vitest for testing
- Vitest config is at `vitest.config.ts`
- Current coverage is ~65%, target is 80%

TASK:
1. Update vitest.config.ts to enable coverage:
   ```typescript
   coverage: {
     provider: 'v8',
     reporter: ['text', 'json', 'html'],
     exclude: ['node_modules/', 'dist/', 'src/__tests__/**'],
     thresholds: {
       lines: 60,
       branches: 60,
       functions: 60,
       statements: 60,
     },
   }
````

2. Add @vitest/coverage-v8 as a dev dependency

3. Add "test:coverage" script to package.json: "test:coverage": "vitest run --coverage"

4. Update CI to run coverage tests and upload report:
   ```yaml
   - name: Run tests with coverage
     run: npm run test:coverage

   - name: Upload coverage report
     uses: actions/upload-artifact@v4
     with:
       name: coverage-report
       path: coverage/
   ```

ACCEPTANCE CRITERIA:

- [ ] Coverage report generates locally with `npm run test:coverage`
- [ ] Thresholds set to 60% (current baseline)
- [ ] CI uploads coverage artifact
- [ ] Add TODO comment to increase thresholds to 80%

```

---

### QW-4: Add Webhook Management API

**Effort:** 2 hours

**Prompt:**
```

Add tRPC endpoints for webhook management.

CONTEXT:

- Webhook model already exists in `src/db/schema.ts` (webhooks table)
- tRPC routers are in `src/api/trpc/routers/`
- Pattern: see `src/api/trpc/routers/repos.ts` for CRUD examples
- Webhooks have: id, repoId, url, secret, events (JSON), isActive

TASK:

1. Create `src/db/models/webhooks.ts` with:

   - findById(id): Get webhook by ID
   - listByRepo(repoId): List all webhooks for a repo
   - create({ repoId, url, secret?, events }): Create webhook
   - update(id, { url?, secret?, events?, isActive? }): Update webhook
   - delete(id): Delete webhook

2. Export from `src/db/models/index.ts`

3. Create `src/api/trpc/routers/webhooks.ts` with:

   - list: List webhooks for a repo (requires write permission)
   - get: Get a webhook by ID (requires write permission)
   - create: Create webhook (requires admin permission)
   - update: Update webhook (requires admin permission)
   - delete: Delete webhook (requires admin permission)
   - test: Trigger a test event to the webhook URL

4. Add webhooksRouter to the main router in `src/api/trpc/routers/index.ts`

ACCEPTANCE CRITERIA:

- [ ] All CRUD operations work
- [ ] Permission checks follow repo collaborator pattern
- [ ] Test endpoint sends a ping event to webhook URL
- [ ] Events are validated as valid JSON array of strings

```

---

### QW-5: Implement Fork Creation Logic

**Effort:** 4 hours

**Prompt:**
```

Implement fork creation logic for repositories.

CONTEXT:

- Repository schema has `isFork` and `forkedFromId` fields (src/db/schema.ts)
- Repos router is at `src/api/trpc/routers/repos.ts`
- Server-side repo storage is in `src/server/storage/repos.ts`
- Bare git repos are stored on disk at `diskPath`

TASK:

1. Add to `src/db/models/repos.ts`:

   - fork(repoId, userId, name?): Create a fork
     - Copy repo metadata
     - Set isFork=true, forkedFromId=originalRepoId
     - Increment forksCount on parent
     - Return new fork

2. Add to `src/server/storage/repos.ts`:

   - forkRepository(sourceRepoId, targetPath): Copy git repo on disk
     - Use git clone --bare to create fork
     - Set up origin remote pointing to parent

3. Add tRPC endpoint in `src/api/trpc/routers/repos.ts`:
   - fork: Fork a repository
     - Input: repoId, name (optional, defaults to original)
     - Validate user can read source repo
     - Validate no existing repo with same name
     - Create fork in DB and on disk
     - Log activity

ACCEPTANCE CRITERIA:

- [ ] Forking creates new repo owned by current user
- [ ] Fork has all branches and commits from parent
- [ ] forksCount incremented on parent
- [ ] Fork shows "forked from owner/repo" relationship
- [ ] User cannot fork if they already have repo with same name

```

---

### QW-6: Add Milestone Schema and CRUD

**Effort:** 4 hours

**Prompt:**
```

Add milestones feature for project tracking.

CONTEXT:

- Database uses Drizzle ORM with PostgreSQL
- Schema is in `src/db/schema.ts`
- Models follow pattern in `src/db/models/`
- tRPC routers in `src/api/trpc/routers/`

TASK:

1. Add to `src/db/schema.ts`:

   ```typescript
   export const milestoneStateEnum = pgEnum("milestone_state", [
     "open",
     "closed",
   ]);

   export const milestones = pgTable("milestones", {
     id: uuid("id").primaryKey().defaultRandom(),
     repoId: uuid("repo_id")
       .notNull()
       .references(() => repositories.id, { onDelete: "cascade" }),
     title: text("title").notNull(),
     description: text("description"),
     dueDate: timestamp("due_date", { withTimezone: true }),
     state: milestoneStateEnum("state").notNull().default("open"),
     createdAt: timestamp("created_at", { withTimezone: true })
       .defaultNow()
       .notNull(),
     updatedAt: timestamp("updated_at", { withTimezone: true })
       .defaultNow()
       .notNull(),
     closedAt: timestamp("closed_at", { withTimezone: true }),
   });
   ```

2. Add milestoneId field to issues and pullRequests tables

3. Create `src/db/models/milestones.ts` with full CRUD

4. Create `src/api/trpc/routers/milestones.ts` with:

   - list: List milestones for repo
   - get: Get by ID
   - create: Create (requires write permission)
   - update: Update (requires write permission)
   - close: Close milestone
   - delete: Delete (requires admin)
   - issues: List issues in milestone
   - pullRequests: List PRs in milestone

5. Export and add to main router

ACCEPTANCE CRITERIA:

- [ ] Milestones can be created/updated/closed
- [ ] Issues and PRs can be assigned to milestones
- [ ] Milestone shows progress (open/closed issues count)
- [ ] Due dates are optional but trackable

```

---

## Stream 6: Foundation Hardening

### S6-1: Fix TUI Diff View

**Effort:** 4-6 hours
**Priority:** P0

**Prompt:**
```

Fix the TUI diff view which currently shows a placeholder instead of actual diffs.

CONTEXT:

- TUI is implemented in `src/ui/tui.ts` using the blessed library
- Diff viewer component is in `src/ui/diff-viewer.ts`
- Core diff algorithm is in `src/core/diff.ts`
- The diff view is accessed via 'd' key or diff menu option
- Currently shows placeholder text instead of real file diffs

FILE LOCATIONS:

- src/ui/tui.ts - Main TUI class, look for showDiff/viewDiff methods
- src/ui/diff-viewer.ts - DiffViewer class with formatUnified, formatSplit methods
- src/core/diff.ts - diff(), createHunks(), FileDiff interfaces

TASK:

1. Find the diff view code in tui.ts (around line 400-500 area)

2. Replace placeholder implementation with real diff display:

   - Get staged and unstaged changes from repository
   - Use the diff() function from core/diff.ts
   - Create hunks using createHunks()
   - Format for display using DiffViewer.formatUnified()

3. Implement interactive features:

   - Navigate between files with j/k or arrow keys
   - Expand/collapse hunks with Enter
   - Stage individual hunks with 's' key (if viewing unstaged)
   - Use colors: green for additions, red for deletions

4. Handle edge cases:
   - No changes to display
   - Binary files
   - New files (all additions)
   - Deleted files (all deletions)
   - Very long lines (truncate or scroll)

IMPLEMENTATION HINT:

```typescript
private async showDiff(): Promise<void> {
  const status = this.repo.status();
  const files = [...status.staged, ...status.unstaged];

  if (files.length === 0) {
    this.showMessage('No changes to show');
    return;
  }

  // For each file, compute diff
  const diffs = files.map(file => {
    const oldContent = this.repo.objects.readBlob(file.oldHash);
    const newContent = fs.readFileSync(file.path, 'utf-8');
    return {
      path: file.path,
      hunks: createHunks(diff(oldContent, newContent)),
    };
  });

  // Display in blessed list/box
  // ...
}
```

ACCEPTANCE CRITERIA:

- [ ] Diff view shows actual file differences
- [ ] Additions highlighted in green, deletions in red
- [ ] Line numbers displayed
- [ ] Navigate between files
- [ ] Hunks properly grouped
- [ ] Handle binary files gracefully
- [ ] 'q' or Escape closes diff view

```

---

### S6-2: Add Tests for Repository Class

**Effort:** 6-8 hours
**Priority:** P0

**Prompt:**
```

Add comprehensive tests for src/core/repository.ts - the main orchestration class.

CONTEXT:

- Repository class is the main entry point for all git operations
- Located at `src/core/repository.ts`
- Test utils are in `src/__tests__/test-utils.ts`
- Tests use Vitest (describe, it, expect, beforeEach, afterEach)
- See `src/__tests__/rebase.test.ts` for test patterns

TEST UTILITIES AVAILABLE:

- createRepoWithCommit(): Creates temp repo with initial commit
- cleanupTempDir(dir): Removes temp directory
- createTestFile(dir, name, content): Creates a test file
- readTestFile(dir, name): Reads test file content
- fileExists(dir, name): Check if file exists
- suppressConsole(): Suppress console output
- restoreCwd(): Restore original working directory

TASK:
Create `src/__tests__/repository.test.ts` with tests for:

1. Initialization:

   - init(): Create new repository
   - open(): Open existing repository
   - Error on invalid path

2. Staging:

   - add(path): Stage single file
   - add(paths[]): Stage multiple files
   - addAll(): Stage all changes
   - Reset staged files

3. Commits:

   - commit(message): Create commit
   - Commit with author info
   - Commit fails with nothing staged
   - Amend last commit

4. Branching:

   - createBranch(name): Create branch
   - listBranches(): List all branches
   - deleteBranch(name): Delete branch
   - getCurrentBranch(): Get current

5. Checkout:

   - checkout(branch): Switch branch
   - checkout(commit): Detached HEAD
   - checkout -b: Create and switch

6. Status:

   - status(): Get current status
   - Staged, unstaged, untracked files

7. Log:

   - log(): Get commit history
   - log with limit
   - log for specific path

8. Refs:
   - HEAD resolution
   - Branch refs
   - Tag refs

ACCEPTANCE CRITERIA:

- [ ] All major Repository methods tested
- [ ] Tests are isolated (create/cleanup temp dirs)
- [ ] Tests cover happy path and error cases
- [ ] Tests pass with `npm test`
- [ ] At least 20 test cases

```

---

### S6-3: Add Tests for Merge Module

**Effort:** 6-8 hours
**Priority:** P0

**Prompt:**
```

Add comprehensive tests for src/core/merge.ts - critical path for merging branches.

CONTEXT:

- Merge module at `src/core/merge.ts`
- Handles three-way merge, conflict detection, and resolution
- Used by merge command, PR merges, and rebase
- Test patterns in `src/__tests/rebase.test.ts`

TASK:
Create `src/__tests__/merge.test.ts` with tests for:

1. Fast-forward merge:

   - Branch ahead can fast-forward
   - Updates HEAD correctly
   - Working directory updated

2. Three-way merge:

   - Merge divergent branches
   - Creates merge commit with two parents
   - Correct commit message

3. Conflict detection:

   - Same line changed in both branches
   - File added in both branches differently
   - File deleted in one, modified in other
   - Conflict markers in file

4. Conflict resolution:

   - Mark file as resolved
   - Continue merge after resolution
   - Abort merge and restore state

5. Merge strategies:

   - Default (recursive)
   - Ours (keep our changes)
   - Theirs (keep their changes)

6. Edge cases:

   - Merge with self (no-op)
   - Merge already merged branch
   - Merge with dirty working directory
   - Binary file conflicts

7. Merge commit:
   - Has correct parents
   - Message includes branch name
   - Author info preserved

TEST PATTERN:

```typescript
describe("merge", () => {
  it("should fast-forward when possible", () => {
    const { dir, repo } = createRepoWithCommit();
    testDir = dir;

    // Create branch and commit
    repo.createBranch("feature");
    repo.checkout("feature");
    createTestFile(dir, "feature.txt", "content");
    repo.add(path.join(dir, "feature.txt"));
    repo.commit("Feature commit");

    // Checkout main and merge
    repo.checkout("main");
    const result = repo.merge("feature");

    expect(result.type).toBe("fast-forward");
    expect(fileExists(dir, "feature.txt")).toBe(true);
  });
});
```

ACCEPTANCE CRITERIA:

- [ ] Fast-forward merges tested
- [ ] Three-way merges tested
- [ ] All conflict types covered
- [ ] Conflict resolution flow tested
- [ ] Merge strategies tested
- [ ] At least 15 test cases
- [ ] All tests pass

```

---

### S6-4: Implement Rename Detection in Diff

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
  similarity: number; // 0-100%
}

function detectRenames(
  deletedFiles: FileDiff[],
  addedFiles: FileDiff[],
  threshold: number = 50 // 50% similarity threshold
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
  isRename: boolean; // Add this
  similarity?: number; // Add this (for renames)
  // ... existing fields
}
```

4. Update formatters:

   - Show "renamed: old → new (X% similar)"
   - Only show actual content changes in hunks

5. Update commands that use diff:
   - `wit diff` - show renames
   - `wit status` - show "renamed: old -> new"
   - TUI diff view - display renames

ACCEPTANCE CRITERIA:

- [ ] Renames detected at 50%+ similarity
- [ ] Renamed files show as rename, not delete+add
- [ ] Similarity percentage displayed
- [ ] Works in `wit status` and `wit diff`
- [ ] Configurable threshold
- [ ] Performance acceptable (no N\*M full comparisons for large repos)

```

---

### S6-5: Add Packed Refs Support

**Effort:** 8-10 hours
**Priority:** P2

**Prompt:**
```

Add packed refs support for better performance with many refs.

CONTEXT:

- Currently all refs are "loose" (one file per ref in .git/refs/)
- Git uses packed-refs file for better performance
- Refs module at `src/core/refs.ts`
- Format: "SHA ref-name\n" per line, with optional ^{} for peeled tags

TASK:

1. Add packed-refs parsing to `src/core/refs.ts`:

```typescript
interface PackedRef {
  sha: string;
  name: string;
  peeled?: string; // For annotated tags
}

function readPackedRefs(gitDir: string): Map<string, PackedRef> {
  const packedPath = path.join(gitDir, "packed-refs");
  if (!fs.existsSync(packedPath)) return new Map();

  const content = fs.readFileSync(packedPath, "utf-8");
  const refs = new Map<string, PackedRef>();

  let lastRef: PackedRef | null = null;
  for (const line of content.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;

    if (line.startsWith("^")) {
      // Peeled ref for previous annotated tag
      if (lastRef) lastRef.peeled = line.slice(1);
    } else {
      const [sha, name] = line.split(" ");
      lastRef = { sha, name };
      refs.set(name, lastRef);
    }
  }

  return refs;
}
```

2. Update ref resolution to check packed-refs:

   - First check loose refs (.git/refs/...)
   - Then check packed-refs
   - Loose refs take priority

3. Add pack-refs command:

```typescript
// Pack all loose refs into packed-refs file
function packRefs(
  gitDir: string,
  options?: { all?: boolean; prune?: boolean }
): void {
  // Read all loose refs
  // Write to packed-refs
  // If prune, delete loose refs that are now packed
}
```

4. Add to gc command:

   - Run pack-refs as part of garbage collection

5. Handle ref updates:
   - When updating a ref, if it exists in packed-refs:
     - Create loose ref (overrides packed)
     - Optionally update packed-refs (on pack-refs)

ACCEPTANCE CRITERIA:

- [ ] Packed refs are read correctly
- [ ] Loose refs override packed refs
- [ ] pack-refs command creates packed-refs file
- [ ] Peeled tags handled correctly
- [ ] gc includes pack-refs
- [ ] Tests for packed refs

```

---

## Stream 7: Platform Critical Features

### S7-1: CI/CD Engine - Workflow Parser

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
  "runs-on": string;
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
  uses?: string; // Action reference
  run?: string; // Shell command
  with?: Record<string, string>;
  env?: Record<string, string>;
  if?: string;
  "working-directory"?: string;
  shell?: string;
  "continue-on-error"?: boolean;
  "timeout-minutes"?: number;
}
```

3. Create `src/ci/parser.ts`:

```typescript
import YAML from "yaml";

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
  const workflowDir = path.join(repoPath, ".wit", "workflows");
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

### S7-2: CI/CD Engine - Job Scheduler

**Effort:** 10-12 hours
**Priority:** P0

**Prompt:**
```

Implement job scheduler and queue for CI/CD engine.

CONTEXT:

- Workflows parsed by parser.ts (from S7-1)
- Need to schedule jobs respecting dependencies
- Need to track job status and output

TASK:

1. Add DB schema for workflow runs in `src/db/schema.ts`:

```typescript
export const workflowRunStateEnum = pgEnum("workflow_run_state", [
  "queued",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
]);

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repositories.id),
  workflowPath: text("workflow_path").notNull(),
  commitSha: text("commit_sha").notNull(),
  event: text("event").notNull(), // 'push', 'pull_request', etc.
  eventPayload: text("event_payload"), // JSON
  state: workflowRunStateEnum("state").notNull().default("queued"),
  conclusion: text("conclusion"), // 'success', 'failure', 'cancelled'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowRunId: uuid("workflow_run_id")
    .notNull()
    .references(() => workflowRuns.id),
  jobName: text("job_name").notNull(),
  state: workflowRunStateEnum("state").notNull().default("queued"),
  conclusion: text("conclusion"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  logs: text("logs"),
  outputs: text("outputs"), // JSON
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
export async function handlePush(
  repoId: string,
  payload: PushPayload
): Promise<void> {
  // Find matching workflows (on.push triggers)
  // Queue workflow runs
}

export async function handlePullRequest(
  repoId: string,
  payload: PRPayload
): Promise<void> {
  // Find matching workflows
  // Queue workflow runs
}

export function matchesTrigger(
  workflow: Workflow,
  event: string,
  payload: any
): boolean {
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

### S7-3: CI/CD Engine - Job Runner

**Effort:** 12-16 hours
**Priority:** P0

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

  private async runCommand(
    cmd: string,
    container: Container,
    step: Step
  ): Promise<StepResult> {
    // Execute shell command in container
    // Capture stdout/stderr
    // Return exit code
  }

  private async runAction(
    uses: string,
    container: Container,
    step: Step
  ): Promise<StepResult> {
    // Parse action reference (owner/repo@version or ./local)
    // Download/cache action
    // Execute action
  }
}
```

2. Create `src/ci/docker.ts`:

```typescript
import Docker from "dockerode";

export class ContainerManager {
  private docker: Docker;

  async createContainer(
    image: string,
    options: ContainerOptions
  ): Promise<Container> {
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
  github: {
    // (we'll call it 'wit' but keep compatible structure)
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

### S7-4: Branch Protection Rules

**Effort:** 8-10 hours
**Priority:** P0

**Prompt:**
```

Implement branch protection rules system.

CONTEXT:

- Need to protect important branches (main, release/\*)
- Block direct pushes, require reviews, require CI
- Server-side enforcement on push

TASK:

1. Add schema in `src/db/schema.ts`:

```typescript
export const branchProtectionRules = pgTable("branch_protection_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  pattern: text("pattern").notNull(), // 'main', 'release/*', etc.

  // Checks
  requirePullRequest: boolean("require_pull_request").notNull().default(false),
  requiredApprovals: integer("required_approvals").notNull().default(0),
  dismissStaleReviews: boolean("dismiss_stale_reviews")
    .notNull()
    .default(false),
  requireCodeOwnerReview: boolean("require_code_owner_review")
    .notNull()
    .default(false),

  // Status checks
  requireStatusChecks: boolean("require_status_checks")
    .notNull()
    .default(false),
  requiredStatusChecks: text("required_status_checks"), // JSON array
  requireBranchUpToDate: boolean("require_branch_up_to_date")
    .notNull()
    .default(false),

  // Push restrictions
  allowForcePush: boolean("allow_force_push").notNull().default(false),
  allowDeletions: boolean("allow_deletions").notNull().default(false),
  restrictPushAccess: boolean("restrict_push_access").notNull().default(false),
  allowedPushers: text("allowed_pushers"), // JSON array of user/team IDs

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

2. Create `src/core/branch-protection.ts`:

```typescript
export class BranchProtectionEngine {
  async getRulesForBranch(
    repoId: string,
    branchName: string
  ): Promise<BranchProtectionRule[]> {
    // Find all rules matching branch
    // Support glob patterns
  }

  async canPush(
    repoId: string,
    branchName: string,
    userId: string
  ): Promise<ProtectionResult> {
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

  async canForcePush(
    repoId: string,
    branchName: string,
    userId: string
  ): Promise<boolean> {
    // Check if force push allowed
  }

  async canDeleteBranch(
    repoId: string,
    branchName: string,
    userId: string
  ): Promise<boolean> {
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
- [ ] Pattern matching works (main, release/\*, \*\*/protected)
- [ ] Push blocked on protected branches
- [ ] Required reviews enforced
- [ ] Required status checks enforced
- [ ] Force push blocked by default
- [ ] Branch deletion blocked
- [ ] Clear error messages on violations

```

---

### S7-5: Notifications System

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
export const notificationTypeEnum = pgEnum("notification_type", [
  "pr_opened",
  "pr_merged",
  "pr_closed",
  "pr_review_requested",
  "pr_reviewed",
  "pr_comment",
  "issue_opened",
  "issue_closed",
  "issue_assigned",
  "issue_comment",
  "mention",
  "ci_failed",
  "ci_passed",
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  url: text("url"), // Link to relevant page
  repoId: uuid("repo_id").references(() => repositories.id),
  actorId: uuid("actor_id").references(() => users.id), // Who triggered
  isRead: boolean("is_read").notNull().default(false),
  emailSent: boolean("email_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  inApp: boolean("in_app").notNull().default(true),
  email: boolean("email").notNull().default(true),
});
```

2. Create `src/notifications/index.ts`:

```typescript
export class NotificationService {
  async notify(
    userId: string,
    notification: CreateNotification
  ): Promise<void> {
    // Check user preferences
    // Create in-app notification
    // Send email if enabled
    // Push via WebSocket
  }

  async notifyMany(
    userIds: string[],
    notification: CreateNotification
  ): Promise<void> {
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

export async function onMention(
  userId: string,
  context: MentionContext
): Promise<void> {
  // Notify mentioned user
}

export function extractMentions(text: string): string[] {
  // Parse @username mentions from text
}
```

4. Create `src/notifications/email.ts`:

```typescript
import nodemailer from "nodemailer";

export async function sendEmail(
  to: string,
  notification: Notification
): Promise<void> {
  // Send email based on notification type
  // Use templates for each type
}
```

5. Create `src/notifications/websocket.ts`:

```typescript
export class NotificationWebSocket {
  private connections: Map<string, WebSocket[]> = new Map();

  addConnection(userId: string, ws: WebSocket): void {
    // Track user connections
  }

  removeConnection(userId: string, ws: WebSocket): void {
    // Remove connection
  }

  push(userId: string, notification: Notification): void {
    // Send to all user's connections
  }
}
```

6. Create tRPC router `src/api/trpc/routers/notifications.ts`:
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

### S7-6: PR Merge Execution

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

1. Add merge strategy type:

```typescript
export type MergeStrategy = "merge" | "squash" | "rebase";
```

2. Create `src/server/storage/merge.ts`:

```typescript
import { Repository } from "../../core/repository";

export interface MergeResult {
  success: boolean;
  mergeSha?: string;
  error?: string;
  conflicts?: string[];
}

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
    case "merge":
      return performMerge(repo, sourceBranch, options);
    case "squash":
      return performSquash(repo, sourceBranch, options);
    case "rebase":
      return performRebase(repo, sourceBranch, options);
  }
}

async function performMerge(
  repo: Repository,
  source: string,
  options
): Promise<MergeResult> {
  // Standard merge commit
  const result = repo.merge(source);
  if (result.conflicts.length > 0) {
    return { success: false, conflicts: result.conflicts };
  }
  return { success: true, mergeSha: result.mergeCommit };
}

async function performSquash(
  repo: Repository,
  source: string,
  options
): Promise<MergeResult> {
  // Squash all commits into one
  // Create single commit with combined message
}

async function performRebase(
  repo: Repository,
  source: string,
  options
): Promise<MergeResult> {
  // Rebase source onto target
  // Fast-forward target to rebased head
}
```

3. Update `src/api/trpc/routers/pulls.ts`:

```typescript
merge: protectedProcedure
  .input(z.object({
    prId: z.string().uuid(),
    strategy: z.enum(['merge', 'squash', 'rebase']).default('merge'),
    message: z.string().optional(), // Custom commit message
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

4. Add conflict detection:

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

## Stream 8: Platform Parity Features

### S8-1: Code Search

**Effort:** 12-16 hours
**Priority:** P1

**Prompt:**
```

Implement code search across repositories.

CONTEXT:

- Need to search code content, not just filenames
- Should support regex and exact match
- Consider using Meilisearch or similar for performance
- Index on push, search via API

TASK:

1. Choose search backend (recommend Meilisearch for simplicity):

```typescript
// src/search/index.ts
export interface SearchResult {
  repoId: string;
  repoName: string;
  path: string;
  line: number;
  content: string;
  highlights: { start: number; end: number }[];
}

export interface SearchOptions {
  query: string;
  repos?: string[]; // Limit to specific repos
  path?: string; // Filter by path pattern
  language?: string; // Filter by language
  limit?: number;
  offset?: number;
}
```

2. Create `src/search/indexer.ts`:

```typescript
export class CodeIndexer {
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

3. Create `src/search/service.ts`:

```typescript
export class SearchService {
  async search(
    userId: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // Check repo access permissions
    // Search indexed content
    // Highlight matches
    // Return results
  }

  async searchInRepo(repoId: string, query: string): Promise<SearchResult[]> {
    // Search within single repo
  }
}
```

4. Create tRPC router `src/api/trpc/routers/search.ts`:

```typescript
export const searchRouter = router({
  code: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        repos: z.array(z.string().uuid()).optional(),
        path: z.string().optional(),
        language: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      // Filter to repos user can access
      // Perform search
      // Return results with context
    }),

  repos: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      // Search repository names/descriptions
    }),
});
```

5. Hook into git-receive-pack to index on push

6. Add Docker Compose service for Meilisearch:

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

### S8-2: OAuth Providers

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
    name: "GitHub",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: ["read:user", "user:email"],
  },
  gitlab: {
    name: "GitLab",
    authorizationUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    userInfoUrl: "https://gitlab.com/api/v4/user",
    scopes: ["read_user"],
  },
};
```

2. Create `src/core/oauth/github.ts`:

```typescript
export async function getGitHubAuthUrl(
  state: string,
  redirectUri: string
): string {
  // Build authorization URL with scopes
}

export async function exchangeGitHubCode(code: string): Promise<OAuthTokens> {
  // Exchange code for access token
}

export async function getGitHubUser(accessToken: string): Promise<OAuthUser> {
  // Fetch user info from GitHub
  // Return { id, username, email, name, avatarUrl }
}

export async function getGitHubEmails(accessToken: string): Promise<string[]> {
  // Fetch user emails (for primary email)
}
```

3. Create `src/core/oauth/gitlab.ts` (similar structure)

4. Update `src/api/trpc/routers/auth.ts`:

```typescript
// Get OAuth authorization URL
oauthUrl: publicProcedure
  .input(z.object({
    provider: z.enum(['github', 'gitlab']),
    redirectUri: z.string().url(),
  }))
  .query(async ({ input }) => {
    const state = generateSecureState();
    // Store state in session/cache
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

// Unlink OAuth from account
unlinkOAuth: protectedProcedure
  .input(z.object({
    provider: z.enum(['github', 'gitlab']),
  }))
  .mutation(async ({ input, ctx }) => {
    // Ensure user has password or other auth
    // Remove OAuth link
  }),
```

5. Update `src/db/models/oauth.ts` with model operations

ACCEPTANCE CRITERIA:

- [ ] GitHub OAuth login works
- [ ] GitLab OAuth login works
- [ ] New users created from OAuth
- [ ] Existing users can link OAuth
- [ ] Account merging when same email
- [ ] OAuth unlinking (if password exists)
- [ ] Tokens stored securely
- [ ] Refresh token handling

```

---

## Stream 9: AI Differentiation

### S9-1: AI PR Descriptions

**Effort:** 6-8 hours
**Priority:** P1

**Prompt:**
```

Implement AI-generated PR descriptions.

CONTEXT:

- AI integration at `src/ai/`
- Uses Mastra with OpenAI/Anthropic
- PR types in `src/db/schema.ts`
- Want to auto-generate descriptions when PR is created

TASK:

1. Create `src/ai/tools/generate-pr-description.ts`:

```typescript
import { createTool } from "@mastra/core";
import { z } from "zod";

export const generatePRDescriptionTool = createTool({
  id: "generate-pr-description",
  description: "Generate a PR description from diff and commit messages",
  inputSchema: z.object({
    diff: z.string(),
    commits: z.array(
      z.object({
        message: z.string(),
        sha: z.string(),
      })
    ),
    title: z.string().optional(),
  }),
  outputSchema: z.object({
    title: z.string(),
    description: z.string(),
    labels: z.array(z.string()),
  }),
  execute: async ({ diff, commits, title }) => {
    // Use AI to generate description
    // Analyze diff for type of changes
    // Extract key changes from commits
    // Suggest title if not provided
    // Suggest labels (bug, feature, docs, etc.)
  },
});
```

2. Create prompt template:

```typescript
const PR_DESCRIPTION_PROMPT = `
You are analyzing a pull request to generate a helpful description.

## Commit Messages:
{commits}

## Code Changes (Diff):
{diff}

Based on these changes, generate:
1. A clear, concise title (if not provided)
2. A description following this template:
   ## Summary
   Brief overview of what this PR does
   
   ## Changes
   - Bullet points of key changes
   
   ## Testing
   How to test these changes
   
   ## Related Issues
   Any related issues (extracted from commit messages)

3. Suggested labels (choose from: bug, feature, enhancement, docs, refactor, test, chore)

Respond in JSON format:
{
  "title": "...",
  "description": "...",
  "labels": ["..."]
}
`;
```

3. Update PR creation flow in `src/api/trpc/routers/pulls.ts`:

```typescript
create: protectedProcedure
  .input(z.object({
    // ... existing fields
    generateDescription: z.boolean().default(false),
  }))
  .mutation(async ({ input, ctx }) => {
    let body = input.body;
    let suggestedLabels: string[] = [];

    if (input.generateDescription) {
      // Get diff between base and head
      // Get commit messages
      const generated = await generatePRDescription({
        diff,
        commits,
        title: input.title,
      });
      body = generated.description;
      suggestedLabels = generated.labels;
    }

    // Create PR with generated description
    // Auto-add suggested labels
  }),
```

4. Add CLI command `wit pr create --ai`:

```typescript
// In src/commands/pr.ts
if (options.ai) {
  console.log('Generating PR description with AI...');
  const description = await generatePRDescription({...});
  // Show preview, allow editing
}
```

ACCEPTANCE CRITERIA:

- [ ] AI generates title from changes
- [ ] Description follows template
- [ ] Key changes extracted from diff
- [ ] Labels suggested based on changes
- [ ] Works in web UI and CLI
- [ ] User can edit before submitting
- [ ] Handles large diffs gracefully

```

---

### S9-2: AI Code Review Bot

**Effort:** 10-12 hours
**Priority:** P1

**Prompt:**
```

Implement AI-powered automatic code review on PR creation.

CONTEXT:

- AI tools in `src/ai/tools/`
- Existing review-code.ts as starting point
- PR comments in `src/api/trpc/routers/pulls.ts`
- Want bot to review PRs and add inline comments

TASK:

1. Create `src/ai/tools/review-pr.ts`:

```typescript
export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "suggestion" | "warning" | "error";
  category: "bug" | "security" | "performance" | "style" | "maintainability";
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
  approved: boolean;
  score: number; // 1-10
}

export async function reviewPullRequest(
  diff: FileDiff[],
  context: {
    repoDescription?: string;
    styleguide?: string;
    previousReviews?: string[];
  }
): Promise<ReviewResult> {
  // Analyze each file
  // Check for common issues:
  //   - Potential bugs
  //   - Security vulnerabilities
  //   - Performance issues
  //   - Code style
  //   - Maintainability
  // Generate summary
  // Provide overall score
}
```

2. Create review prompt:

```typescript
const CODE_REVIEW_PROMPT = `
You are an expert code reviewer. Review this pull request diff and provide constructive feedback.

Focus on:
1. Bugs and logic errors
2. Security vulnerabilities (injection, auth issues, data leaks)
3. Performance problems (N+1 queries, memory leaks, inefficient algorithms)
4. Code quality (readability, maintainability, DRY violations)
5. Best practices for the language/framework

For each issue found, provide:
- File path and line number
- Severity (suggestion/warning/error)
- Category (bug/security/performance/style/maintainability)
- Clear explanation and suggested fix

Be constructive and specific. Avoid vague feedback.
`;
```

3. Create bot user and integration:

```typescript
// src/ai/bot.ts
export class AIReviewBot {
  private botUserId: string; // Create a system user for the bot

  async reviewPR(prId: string): Promise<void> {
    const pr = await prModel.findById(prId);
    const diff = await getDiff(pr.baseSha, pr.headSha);

    const result = await reviewPullRequest(diff, {
      repoDescription: repo.description,
    });

    // Add inline comments
    for (const comment of result.comments) {
      await prCommentModel.create({
        prId,
        userId: this.botUserId,
        body: this.formatComment(comment),
        path: comment.path,
        line: comment.line,
        commitSha: pr.headSha,
      });
    }

    // Add review summary
    await prReviewModel.create({
      prId,
      userId: this.botUserId,
      state: result.approved ? "approved" : "commented",
      body: result.summary,
      commitSha: pr.headSha,
    });
  }

  private formatComment(comment: ReviewComment): string {
    const icons = { suggestion: "💡", warning: "⚠️", error: "🚨" };
    return `${icons[comment.severity]} **${comment.category}**: ${
      comment.body
    }`;
  }
}
```

4. Trigger on PR creation:

```typescript
// In pulls router create mutation
const pr = await prModel.create({...});

// Queue AI review (async)
if (repo.aiReviewEnabled) {
  await queueAIReview(pr.id);
}
```

5. Add repo setting for AI review

ACCEPTANCE CRITERIA:

- [ ] Bot reviews PRs automatically when enabled
- [ ] Inline comments on specific lines
- [ ] Summary review with overall feedback
- [ ] Configurable per-repository
- [ ] Handles large PRs (chunk if needed)
- [ ] Clear severity indicators
- [ ] Actionable suggestions
- [ ] Review on new commits (update)

```

---

### S9-3: AI Semantic Code Search

**Effort:** 12-16 hours
**Priority:** P1

**Prompt:**
```

Implement natural language code search using AI embeddings.

CONTEXT:

- Regular code search in S8-1
- Want to also support "find the function that handles user authentication"
- Use embeddings for semantic matching

TASK:

1. Choose embedding model (OpenAI text-embedding-3-small or similar)

2. Create `src/search/embeddings.ts`:

```typescript
import OpenAI from "openai";

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = new OpenAI();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function generateCodeEmbeddings(
  code: string,
  context: {
    path: string;
    language: string;
    repoDescription?: string;
  }
): Promise<number[]> {
  // Include file path and language for context
  const text = `
    File: ${context.path}
    Language: ${context.language}
    ${context.repoDescription ? `Repository: ${context.repoDescription}` : ""}
    
    Code:
    ${code}
  `;
  return generateEmbedding(text);
}
```

3. Update indexer for embeddings:

```typescript
// Add to src/search/indexer.ts
export class SemanticIndexer {
  async indexFile(
    repoId: string,
    path: string,
    content: string
  ): Promise<void> {
    // Split into logical chunks (functions, classes)
    const chunks = this.chunkCode(content, path);

    for (const chunk of chunks) {
      const embedding = await generateCodeEmbeddings(chunk.content, {
        path,
        language: detectLanguage(path),
      });

      await this.storeEmbedding({
        repoId,
        path,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        embedding,
      });
    }
  }

  chunkCode(content: string, path: string): CodeChunk[] {
    // Use tree-sitter or regex to find:
    // - Functions
    // - Classes
    // - Methods
    // - Large blocks of code
    // Return chunks with line numbers
  }
}
```

4. Create semantic search:

```typescript
// src/search/semantic.ts
export async function semanticSearch(
  query: string,
  options: {
    repoId?: string;
    limit?: number;
  }
): Promise<SemanticSearchResult[]> {
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);

  // Find similar embeddings using cosine similarity
  // Could use pgvector for PostgreSQL or dedicated vector DB
  const results = await vectorSearch(queryEmbedding, {
    repoId: options.repoId,
    limit: options.limit || 10,
  });

  return results.map((r) => ({
    repoId: r.repoId,
    path: r.path,
    startLine: r.startLine,
    endLine: r.endLine,
    content: r.content,
    score: r.similarity,
  }));
}
```

5. Add vector storage:
   - Option A: Use pgvector extension for PostgreSQL
   - Option B: Use Pinecone/Weaviate

```sql
-- For pgvector
CREATE EXTENSION vector;

CREATE TABLE code_embeddings (
  id UUID PRIMARY KEY,
  repo_id UUID REFERENCES repositories(id),
  path TEXT NOT NULL,
  start_line INT,
  end_line INT,
  content TEXT,
  embedding vector(1536)
);

CREATE INDEX ON code_embeddings USING ivfflat (embedding vector_cosine_ops);
```

6. Add API endpoint:

```typescript
semanticSearch: protectedProcedure
  .input(z.object({
    query: z.string(),
    repoId: z.string().uuid().optional(),
    limit: z.number().max(50).default(10),
  }))
  .query(async ({ input, ctx }) => {
    return semanticSearch(input.query, input);
  }),
```

ACCEPTANCE CRITERIA:

- [ ] Natural language queries work
- [ ] "find authentication logic" returns relevant code
- [ ] Results ranked by relevance
- [ ] Code chunked intelligently
- [ ] Performance acceptable (< 3s)
- [ ] Index updated on push
- [ ] Respects repo permissions

```

---

## Stream 10: Polish & Scale

### S10-1: SSH Protocol Support

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
import ssh2 from "ssh2";

export class SSHServer {
  private server: ssh2.Server;

  constructor(options: { hostKeys: Buffer[]; port: number }) {
    this.server = new ssh2.Server(
      {
        hostKeys: options.hostKeys,
      },
      this.onConnection.bind(this)
    );
  }

  private onConnection(client: ssh2.Connection): void {
    client.on("authentication", this.handleAuth.bind(this, client));
    client.on("ready", () => {
      client.on("session", this.handleSession.bind(this, client));
    });
  }

  private async handleAuth(
    client: ssh2.Connection,
    ctx: ssh2.AuthContext
  ): Promise<void> {
    if (ctx.method === "publickey") {
      // Verify public key against stored keys
      const user = await this.verifyPublicKey(ctx.key);
      if (user) {
        ctx.accept();
        client.user = user;
      } else {
        ctx.reject();
      }
    }
  }

  private handleSession(
    client: ssh2.Connection,
    accept: () => ssh2.Session
  ): void {
    const session = accept();
    session.on("exec", (accept, reject, info) => {
      const stream = accept();
      this.handleGitCommand(stream, info.command, client.user);
    });
  }
}
```

2. Create `src/server/ssh/git-commands.ts`:

```typescript
export async function handleGitCommand(
  stream: ssh2.Channel,
  command: string,
  user: User
): Promise<void> {
  // Parse command: git-upload-pack '/owner/repo.git'
  const match = command.match(/^git-(upload|receive)-pack '(.+)'$/);
  if (!match) {
    stream.stderr.write("Invalid command\n");
    stream.exit(1);
    return;
  }

  const [, operation, repoPath] = match;

  // Check permissions
  const repo = await findRepoByPath(repoPath);
  if (!repo || !canAccess(repo, user, operation)) {
    stream.stderr.write("Permission denied\n");
    stream.exit(1);
    return;
  }

  // Execute git command
  if (operation === "upload") {
    await handleUploadPack(stream, repo.diskPath);
  } else {
    await handleReceivePack(stream, repo.diskPath, user);
  }
}
```

3. Add SSH key management:

```typescript
// src/db/schema.ts
export const sshKeys = pgTable("ssh_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  publicKey: text("public_key").notNull(),
  fingerprint: text("fingerprint").notNull().unique(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

4. Add API for SSH keys:

```typescript
// src/api/trpc/routers/sshkeys.ts
export const sshKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return sshKeyModel.listByUser(ctx.user.id);
  }),

  add: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        publicKey: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Parse and validate key
      // Generate fingerprint
      // Store key
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Delete key
    }),
});
```

5. Update server entrypoint to start SSH server

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

### S10-2: Rate Limiting

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
import { Context, MiddlewareHandler } from "hono";
import Redis from "ioredis";

interface RateLimitConfig {
  windowMs: number; // Time window
  max: number; // Max requests in window
  keyGenerator?: (c: Context) => string;
  handler?: (c: Context) => Response;
}

const redis = new Redis(process.env.REDIS_URL);

export function rateLimit(config: RateLimitConfig): MiddlewareHandler {
  return async (c, next) => {
    const key =
      config.keyGenerator?.(c) ?? c.req.header("x-forwarded-for") ?? "unknown";
    const rateKey = `ratelimit:${key}`;

    const current = await redis.incr(rateKey);
    if (current === 1) {
      await redis.pexpire(rateKey, config.windowMs);
    }

    c.header("X-RateLimit-Limit", String(config.max));
    c.header(
      "X-RateLimit-Remaining",
      String(Math.max(0, config.max - current))
    );

    if (current > config.max) {
      const retryAfter = await redis.pttl(rateKey);
      c.header("Retry-After", String(Math.ceil(retryAfter / 1000)));

      return config.handler?.(c) ?? c.json({ error: "Too many requests" }, 429);
    }

    await next();
  };
}
```

2. Create rate limit presets:

```typescript
export const rateLimits = {
  // General API: 1000 requests per minute
  api: rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
  }),

  // Auth endpoints: 10 per minute
  auth: rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (c) => `auth:${c.req.header("x-forwarded-for")}`,
  }),

  // Git operations: 100 per minute
  git: rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    keyGenerator: (c) => `git:${c.get("userId")}`,
  }),

  // AI features: 20 per minute (expensive)
  ai: rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (c) => `ai:${c.get("userId")}`,
  }),

  // Search: 60 per minute
  search: rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (c) => `search:${c.get("userId")}`,
  }),
};
```

3. Apply to routes:

```typescript
// In server/index.ts
app.use("/api/*", rateLimits.api);
app.use("/api/auth/*", rateLimits.auth);
app.use("/*.git/*", rateLimits.git);
app.use("/api/ai/*", rateLimits.ai);
app.use("/api/search/*", rateLimits.search);
```

4. Add rate limit bypass for trusted IPs/keys

5. Add Redis to docker-compose.yml

ACCEPTANCE CRITERIA:

- [ ] Rate limits enforced per endpoint type
- [ ] Proper HTTP headers returned
- [ ] 429 response when exceeded
- [ ] Retry-After header set
- [ ] Different limits for different users (free vs paid)
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

1. Start with **Quick Wins** to build momentum
2. Complete **Stream 6** before platform features
3. **Stream 7** items block many other features
4. **Streams 8-9** can be parallelized
5. **Stream 10** is ongoing polish

### Dependencies

```

QW-1 (ESLint) → none
QW-2 (TypeCheck) → none
QW-3 (Coverage) → none
QW-4 (Webhooks) → none
QW-5 (Forks) → none
QW-6 (Milestones) → none

S6-1 (TUI Diff) → none
S6-2 (Repo Tests) → none
S6-3 (Merge Tests) → none
S6-4 (Rename Detection) → none
S6-5 (Packed Refs) → none

S7-1 (Workflow Parser) → none
S7-2 (Job Scheduler) → S7-1
S7-3 (Job Runner) → S7-2
S7-4 (Branch Protection) → none
S7-5 (Notifications) → none
S7-6 (PR Merge) → S7-4

S8-1 (Code Search) → none
S8-2 (OAuth) → none

S9-1 (AI PR Descriptions) → none
S9-2 (AI Review Bot) → S9-1
S9-3 (Semantic Search) → S8-1

S10-1 (SSH) → none
S10-2 (Rate Limiting) → none

```

```
