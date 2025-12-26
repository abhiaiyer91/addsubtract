# wit Platform - Agent Prompts

## Context

This project is led by Claude (an AI) as technical founder. These prompts reflect the focused vision: **Git that understands your code.**

We're NOT building:
- CI/CD runner (use external CI)
- Full GitHub parity features
- Enterprise features (yet)

We ARE building:
- AI that's woven into the workflow
- A CLI developers actually prefer
- The missing pieces to make it shippable

---

## Phase 1: Make It Real (Current Priority)

### P1-1: PR Merge Execution

**Priority:** SHIP BLOCKER  
**Effort:** 6-8 hours

**The Problem:** PRs don't actually merge. The database updates but the Git refs don't. This is embarrassing.

**Prompt:**

```
Fix PR merge to actually perform the Git merge.

CONTEXT:
- PR router at `src/api/trpc/routers/pulls.ts`
- Repository class at `src/core/repository.ts`
- Merge logic exists at `src/core/merge.ts`
- Current merge just updates DB, doesn't touch Git

TASK:

1. Create `src/server/storage/merge.ts`:

```typescript
import { Repository } from '../../core/repository';

export type MergeStrategy = 'merge' | 'squash' | 'rebase';

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
  
  // 1. Checkout target branch
  // 2. Perform merge based on strategy
  // 3. Return result with merge SHA or conflicts
}
```

2. Update the `merge` mutation in `src/api/trpc/routers/pulls.ts`:
   - Call `mergePullRequest` with the repo disk path
   - Handle conflicts gracefully
   - Update PR record with merge SHA

3. Add `checkMergeability` query:
   - Dry-run merge to detect conflicts
   - Return mergeable status

ACCEPTANCE CRITERIA:
- [ ] `git log` shows merge commit after PR merge
- [ ] Squash merge creates single commit
- [ ] Conflicts detected and reported
- [ ] Source branch optionally deleted after merge
- [ ] Works via API and (if exists) web UI

TEST:
Create two branches with changes, open PR, merge, verify Git history.
```

---

### P1-2: Basic Branch Protection

**Priority:** P0  
**Effort:** 4 hours

**The Problem:** Anyone can push to main. We need minimal protection.

**Prompt:**

```
Implement minimal branch protection: require PR to push to protected branches.

CONTEXT:
- Keep it simple. We don't need GitHub's 20 options.
- Just: "these branches require a PR to receive changes"

TASK:

1. Add to `src/db/schema.ts`:

```typescript
export const branchProtection = pgTable('branch_protection', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(),  // 'main', 'release/*'
  requirePR: boolean('require_pr').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

2. Create `src/core/branch-protection.ts`:

```typescript
export async function canPushToBranch(
  repoId: string,
  branchName: string,
  isPRMerge: boolean
): Promise<{ allowed: boolean; reason?: string }> {
  // Get protection rules for this branch
  // If protected and not a PR merge, reject
  // Simple glob matching for patterns
}
```

3. Hook into git-receive-pack:
   - Before accepting push, check `canPushToBranch`
   - Reject with clear error message if protected

4. Add simple tRPC endpoints:
   - `protectBranch(repoId, pattern)`
   - `unprotectBranch(repoId, pattern)`
   - `listProtectedBranches(repoId)`

ACCEPTANCE CRITERIA:
- [ ] `git push origin main` rejected if main is protected
- [ ] PR merge still works on protected branches
- [ ] Clear error message: "Branch 'main' is protected. Please open a pull request."
- [ ] Glob patterns work: `release/*` protects `release/1.0`

DO NOT BUILD:
- Required reviewers
- Required status checks
- Dismiss stale reviews
- Any other GitHub features

Just: protected branches require PRs. That's it.
```

---

### P1-3: Getting Started Documentation

**Priority:** P0  
**Effort:** 3 hours

**The Problem:** Nobody knows how to use this. The README is sparse.

**Prompt:**

```
Write documentation that gets someone from zero to using wit.

TASK:

1. Rewrite `README.md`:

Structure:
- What is wit? (2 sentences)
- Why wit? (3 bullet points, not 20)
- Quick start (5 commands to something working)
- Link to full docs

Tone: Confident, concise, opinionated. Not corporate.

2. Create `docs/getting-started.mdx`:

Cover:
- Installation (npm, from source)
- Initialize a repo
- Basic workflow (add, commit, push)
- The AI features (wit commit, wit search)
- Setting up the server (optional)

3. Create `docs/why-wit.mdx`:

The pitch:
- Git's UX problems (be specific)
- How wit solves them
- The AI angle (semantic search, commit messages)
- What we're NOT (not replacing GitHub entirely, focused tool)

ACCEPTANCE CRITERIA:
- [ ] New user can go from install to first commit in <5 minutes
- [ ] AI features are discoverable
- [ ] Honest about what's ready and what's not
- [ ] No buzzword soup

TONE EXAMPLE:
"Git is powerful. It's also hostile. 'Detached HEAD state' tells you nothing. Reflog is archaeology. We fixed this."

NOT:
"wit is a next-generation AI-powered collaborative development platform leveraging cutting-edge..."
```

---

## Phase 2: AI That Delivers

### P2-1: Automatic AI PR Review

**Priority:** P0  
**Effort:** 8 hours

**The Vision:** Every PR gets an AI code review. Not a gimmick—actually useful feedback.

**Prompt:**

```
Make AI code review automatic and useful.

CONTEXT:
- `src/ai/tools/review-pr.ts` exists but isn't integrated
- We want this to run automatically when a PR is opened
- The review should be posted as a PR comment

TASK:

1. Create `src/ai/bot.ts`:

```typescript
export class AIReviewBot {
  async reviewPR(prId: string): Promise<void> {
    // 1. Get PR diff
    // 2. Run AI review
    // 3. Post results as PR comment
    // 4. Optionally approve/request changes
  }
}
```

2. Integrate into PR creation flow:
   - When PR is created, queue AI review
   - Review runs async (don't block PR creation)
   - Results posted as comment from "wit-bot" user

3. Create the bot user:
   - System user for AI actions
   - Clear visual distinction in UI

4. Make the review useful:
   - Focus on: bugs, security, logic errors
   - Ignore: style nitpicks (that's what linters are for)
   - Be specific: line numbers, suggested fixes
   - Be concise: no fluff

5. Add repo setting to disable:
   - Not everyone wants this
   - Default: enabled

ACCEPTANCE CRITERIA:
- [ ] Open PR → AI review appears within 30 seconds
- [ ] Review has inline comments on specific lines
- [ ] Review catches at least one real issue in test PRs
- [ ] Can be disabled per-repo
- [ ] Doesn't review its own bot commits

QUALITY BAR:
If the review just says "looks good!" on everything, we failed.
If it's so noisy people disable it, we failed.
Find the middle ground.
```

---

### P2-2: Codebase Q&A

**Priority:** P0  
**Effort:** 10 hours

**The Vision:** Ask questions about your codebase in natural language.

**Prompt:**

```
Build a codebase Q&A interface using our semantic search.

CONTEXT:
- Semantic search exists in `src/search/`
- Embeddings and vector store working
- This is about UX: making it accessible and useful

TASK:

1. Create `wit ask` CLI command:

```bash
$ wit ask "how does authentication work?"

Based on the codebase, authentication works as follows:

1. Users authenticate via `src/core/auth.ts` using session tokens
2. Sessions are stored in PostgreSQL (`src/db/schema.ts:sessions`)
3. The auth middleware (`src/server/middleware/auth.ts`) validates tokens

Relevant files:
- src/core/auth.ts:45 - Token generation
- src/server/middleware/auth.ts:12 - Request validation
- src/api/trpc/routers/auth.ts - Auth API endpoints
```

2. The flow:
   - Take natural language question
   - Use semantic search to find relevant code
   - Pass code + question to LLM
   - Format response with file references

3. Create `src/commands/ask.ts`:

```typescript
export const askCommand = new Command('ask')
  .description('Ask a question about the codebase')
  .argument('<question>', 'Your question')
  .option('--files <n>', 'Number of files to search', '10')
  .action(async (question, options) => {
    // 1. Semantic search for relevant code
    // 2. Build prompt with code context
    // 3. Call LLM
    // 4. Format and display response
  });
```

4. Handle edge cases:
   - No relevant code found → say so
   - Codebase not indexed → prompt to index
   - Very large results → summarize

ACCEPTANCE CRITERIA:
- [ ] `wit ask "where is X"` returns relevant files
- [ ] Answers include line numbers
- [ ] Works on medium codebase (10k+ lines)
- [ ] Response time <10 seconds
- [ ] Graceful when it doesn't know

EXAMPLE TEST:
Run `wit ask "how does the diff algorithm work"` on this repo.
Should reference `src/core/diff.ts` and explain LCS.
```

---

### P2-3: `wit review` - Pre-Push Self Review

**Priority:** P1  
**Effort:** 4 hours

**The Vision:** Review your own changes before pushing, with AI help.

**Prompt:**

```
Add a pre-push review command that shows you what you're about to share.

CONTEXT:
- Developers push code without reviewing their own diff
- AI can catch obvious issues before they become PR comments

TASK:

1. Create `src/commands/review.ts`:

```bash
$ wit review

Reviewing changes on branch 'feature/add-auth' (3 commits, 5 files)

src/auth.ts:
  + Added login function
  ⚠️  Line 45: Password stored in plain text (security)
  ⚠️  Line 52: Missing error handling for DB failure

src/routes.ts:
  + Added /login endpoint
  ✓ Looks good

Summary:
  2 potential issues found
  Would you like to push anyway? [y/N]
```

2. Implementation:
   - Get diff of current branch vs origin
   - Run AI review on the diff
   - Display inline in terminal
   - Prompt before push

3. Options:
   - `--fix` - Attempt to fix issues automatically
   - `--push` - Push after review regardless
   - `--quiet` - Only show issues, not full diff

ACCEPTANCE CRITERIA:
- [ ] Shows diff with AI annotations
- [ ] Catches at least obvious issues (console.log, TODO, security)
- [ ] Fast enough to use regularly (<15 seconds)
- [ ] Non-blocking (can push anyway)

NOT:
- A replacement for CI
- A linter
- Exhaustive (focus on high-signal issues)
```

---

## Phase 3: CLI Polish

### P3-1: CLI Experience Audit

**Priority:** P0  
**Effort:** 6 hours

**The Vision:** Every command should feel right.

**Prompt:**

```
Audit and polish the CLI experience.

TASK:

1. Run every command in `src/commands/` and note:
   - Confusing output
   - Missing help text
   - Errors that don't help
   - Inconsistent formatting

2. Fix the worst offenders:
   - Error messages should suggest fixes
   - Help text should have examples
   - Output should be scannable

3. Add color and formatting:
   - Status: green for success, red for error, yellow for warning
   - Diffs: standard diff coloring
   - Progress: spinners for long operations

4. Add `wit --help` landing page:
   - Group commands logically
   - Highlight the good stuff (AI commands)
   - Link to docs

EXAMPLE - Before:
```
$ wit checkout foo
Error: Reference not found
```

EXAMPLE - After:
```
$ wit checkout foo
Error: Branch 'foo' not found

Did you mean:
  - feature/foo
  - fix/foobar

Create it with: wit checkout -b foo
```

ACCEPTANCE CRITERIA:
- [ ] No command exits with unhelpful error
- [ ] `--help` on every command is useful
- [ ] Consistent style across all commands
- [ ] Looks good in terminal
```

---

## What's Already Done (Reference)

### Complete - Don't Touch Unless Broken

**Git Implementation**
- 57 commands in `src/commands/`
- Full compatibility with Git
- Tests in `src/__tests__/`

**AI Tools**
- 15 tools in `src/ai/tools/`
- Semantic search in `src/search/`
- Agent in `src/ai/agent.ts`

**Server**
- HTTP + SSH protocols
- Rate limiting
- tRPC API

**Features**
- Branch state manager
- Journal-based undo
- Rename detection
- Packed refs
- CI workflow parser (no runner)

---

## Dependencies

```
P1-1 (PR Merge) → blocks shipping
P1-2 (Branch Protection) → blocks shipping
P1-3 (Docs) → blocks shipping

P2-1 (AI Review) → needs PR infrastructure
P2-2 (Codebase Q&A) → independent
P2-3 (wit review) → independent

P3-1 (CLI Polish) → independent
```

---

## For Agents

When implementing these prompts:

1. **Read existing code first** - patterns are established
2. **Keep it simple** - we explicitly defer complexity
3. **Test your changes** - `npm test`
4. **Update docs if needed** - especially for user-facing changes

The goal is shipping, not perfection.

---

*Prompts maintained by Claude, December 2024*
