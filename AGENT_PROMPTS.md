# wit Platform - Agent Task Prompts

Use these prompts to spin up parallel Claude sessions for wit development.

---

## How to Use

1. Copy the relevant prompt below
2. Start a new Claude session (Claude Code CLI or claude.ai)
3. Paste the prompt
4. Let the agent build context from the referenced files
5. Collect the output and merge

---

## Prompt Template Structure

```
## Task: [Name]

### Context Sources (read these first)
- [File paths and URLs for the agent to read]

### Your Scope
- Files you OWN (create/modify freely)
- Files you READ ONLY

### Task Description
[What to build]

### Patterns to Follow
[Reference files that show the pattern]

### Deliverables
[What to output when done]

### Boundaries
[What NOT to do]
```

---

## PROMPT A: Personal Access Tokens

```
## Task: Implement Personal Access Tokens for wit

You're adding PAT (Personal Access Token) support to wit, an open-source GitHub alternative.

### Context Sources (read these first)

Read these files to understand the project and patterns:

1. `ROADMAP.md` - Project vision and current status
2. `src/db/schema.ts` - Database schema patterns (add your table after `sshKeys` around line 95)
3. `src/db/models/ssh-keys.ts` - Model pattern to follow
4. `src/db/models/index.ts` - How models are exported
5. `src/api/trpc/routers/ssh-keys.ts` - Router pattern to follow
6. `src/api/trpc/routers/index.ts` - How routers are registered
7. `src/commands/stash.ts` - CLI subcommand pattern
8. `src/commands/index.ts` - How commands are exported
9. `src/cli.ts` - How commands are registered

Tech stack:
- TypeScript, Node.js
- PostgreSQL + Drizzle ORM
- tRPC for API
- Commander.js for CLI

Database connection:
- PostgreSQL on localhost:5432
- User/pass: wit/wit, Database: wit
- Push schema: `DATABASE_URL="postgresql://wit:wit@localhost:5432/wit" npx drizzle-kit push --force`
- Run tests: `DATABASE_URL="postgresql://wit:wit@localhost:5432/wit" npm test`

### Your Scope

**CREATE these files:**
- `src/db/models/tokens.ts` - Token database model
- `src/api/trpc/routers/tokens.ts` - Token API router
- `src/commands/token.ts` - CLI command

**MODIFY these files (specific additions only):**
- `src/db/schema.ts` - Add `personalAccessTokens` table AFTER sshKeys (~line 95)
- `src/db/models/index.ts` - Add export for tokenModel
- `src/api/trpc/routers/index.ts` - Add tokensRouter import and registration
- `src/commands/index.ts` - Add token command export
- `src/cli.ts` - Add token command handler in switch statement

### Task Description

Implement Personal Access Tokens for API/CLI authentication.

**Schema (`personalAccessTokens` table):**
```typescript
export const personalAccessTokens = pgTable('personal_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),  // User-provided name like "CI Token"
  tokenHash: text('token_hash').notNull(),  // SHA256 hash (never store raw!)
  tokenPrefix: text('token_prefix').notNull(),  // First 8 chars: "wit_abc1" for identification
  scopes: text('scopes').notNull(),  // JSON array: ["repo:read", "repo:write"]
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),  // null = never expires
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**Token format:** `wit_` + 40 random hex chars (e.g., `wit_a1b2c3d4e5f6...`)

**Available scopes:**
- `repo:read` - Clone, pull repositories
- `repo:write` - Push to repositories
- `repo:admin` - Manage settings, collaborators, delete repos
- `user:read` - Read profile information
- `user:write` - Update profile

**Router endpoints (in tokens.ts):**
- `list` - Get user's tokens (show prefix + last 4 chars, hide full hash)
- `create` - Generate new token (return raw token ONCE, then only hash is stored)
- `delete` - Revoke a token by ID
- `verify` - Internal: check if token hash is valid, return user + scopes

**CLI command (`wit token`):**
```bash
wit token create <name> [--expires <days>] [--scopes <scope1,scope2>]
wit token list
wit token revoke <id>
wit token scopes  # List available scopes
```

### Patterns to Follow

**For the model** - Look at `src/db/models/ssh-keys.ts`:
- How to structure find/create/delete methods
- How to use `getDb()` and drizzle queries

**For the router** - Look at `src/api/trpc/routers/ssh-keys.ts`:
- Input validation with zod schemas
- Using `protectedProcedure` for auth
- Error handling with TRPCError
- Ownership checks

**For the CLI** - Look at `src/commands/stash.ts`:
- Subcommand structure with Commander
- Colored console output
- Error handling patterns

### Deliverables

When complete, provide:

1. **File list** - All files created/modified with approximate line counts
2. **Schema addition** - The exact code block added to schema.ts (for merge coordination)
3. **Example outputs** - Show CLI output for each subcommand
4. **Test commands** - Commands to verify the feature works
5. **Any issues** - Problems encountered or things that need follow-up

### Boundaries

**DO NOT modify:**
- Any files not listed in "Your Scope"
- Existing tests
- Web UI code
- Core git operations

**DO NOT implement:**
- Token refresh/rotation (future feature)
- OAuth integration
- Rate limiting per token (use existing rate limiter)

Run `npm test` at the end to ensure existing tests still pass.
```

---

## PROMPT B: Branch Protection Server API

```
## Task: Implement Branch Protection Server API for wit

You're adding server-side branch protection enforcement to wit, an open-source GitHub alternative.

### Context Sources (read these first)

Read these files to understand the project and patterns:

1. `ROADMAP.md` - Project vision and current status
2. `src/db/schema.ts` - Database schema (add your table after `teamMembers` around line 140)
3. `src/db/models/organization.ts` - Model pattern with related entities
4. `src/db/models/index.ts` - How models are exported
5. `src/api/trpc/routers/webhooks.ts` - Router with permission checks pattern
6. `src/api/trpc/routers/index.ts` - How routers are registered
7. `src/core/branch-protection.ts` - Existing client-side protection (if exists)
8. `src/server/routes/git.ts` - Git HTTP endpoints (receive-pack)

Tech stack & database: Same as Prompt A (PostgreSQL localhost:5432, wit/wit)

### Your Scope

**CREATE these files:**
- `src/db/models/branch-protection.ts` - Protection rules model
- `src/api/trpc/routers/branch-protection.ts` - Protection API router

**MODIFY these files:**
- `src/db/schema.ts` - Add `branchProtectionRules` table AFTER teamMembers (~line 140)
- `src/db/models/index.ts` - Add export
- `src/api/trpc/routers/index.ts` - Add router

### Task Description

Implement server-side branch protection rules.

**Schema (`branchProtectionRules` table):**
```typescript
export const branchProtectionRules = pgTable('branch_protection_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(),  // e.g., "main", "release/*"
  requirePullRequest: boolean('require_pull_request').notNull().default(true),
  requiredReviewers: integer('required_reviewers').notNull().default(1),
  requireStatusChecks: boolean('require_status_checks').notNull().default(false),
  requiredStatusChecks: text('required_status_checks'),  // JSON array of check names
  allowForcePush: boolean('allow_force_push').notNull().default(false),
  allowDeletion: boolean('allow_deletion').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**Model methods:**
- `findByRepoId(repoId)` - Get all rules for a repository
- `findMatchingRule(repoId, branchName)` - Find rule that matches branch (glob pattern)
- `create(data)` - Create protection rule
- `update(id, data)` - Update rule
- `delete(id)` - Delete rule

**Router endpoints:**
- `list` - Get protection rules for a repo (requires write permission)
- `get` - Get specific rule by ID
- `create` - Add protection rule (requires admin)
- `update` - Modify rule (requires admin)
- `delete` - Remove rule (requires admin)
- `check` - Check if branch is protected: `{ protected: boolean, rule?: Rule }`

**Glob pattern matching:**
- `main` matches only `main`
- `release/*` matches `release/1.0`, `release/2.0`
- `feature/**` matches `feature/foo`, `feature/foo/bar`

Use `minimatch` or implement simple glob matching.

### Patterns to Follow

**For permissions** - Look at `src/api/trpc/routers/webhooks.ts`:
- The `assertRepoPermission` helper function
- How to check admin vs write permissions

**For model** - Look at `src/db/models/organization.ts`:
- Pattern for models with multiple related methods

### Deliverables

1. **File list** with line counts
2. **Schema addition** - Exact code block for schema.ts
3. **API examples** - Request/response for each endpoint
4. **Integration notes** - How this hooks into receive-pack (even if not implemented yet)

### Boundaries

**DO NOT modify:**
- CLI commands
- Web UI
- The actual receive-pack enforcement (that's a separate task)
- SSH handling

**DO NOT implement:**
- Required reviewers enforcement (just store the setting)
- Status check enforcement (just store the setting)
- Allowed pushers list (keep it simple for now)

Focus on: CRUD API for protection rules + branch matching logic.
```

---

## PROMPT C: Web UI - Repository Browser

```
## Task: Build Repository File Browser for wit Web UI

You're building the GitHub-style repository code browser for wit's React web UI.

### Context Sources (read these first)

Read these files to understand the web app:

1. `apps/web/package.json` - Dependencies (React, TailwindCSS, tRPC client)
2. `apps/web/src/App.tsx` - Router setup and layout
3. `apps/web/src/pages/` - Existing page patterns
4. `apps/web/src/components/` - Existing component patterns
5. `apps/web/src/lib/trpc.ts` - tRPC client setup (if exists)
6. `src/api/trpc/routers/repos.ts` - Available repository API endpoints

Tech stack:
- React 18 with TypeScript
- TailwindCSS for styling
- React Router v6
- tRPC client for API calls

### Your Scope

**CREATE these files:**
- `apps/web/src/pages/Repository.tsx` - Repository layout page
- `apps/web/src/pages/RepositoryCode.tsx` - File browser view
- `apps/web/src/pages/RepositoryBlob.tsx` - Single file view
- `apps/web/src/components/repo/FileTree.tsx` - Directory listing
- `apps/web/src/components/repo/FileViewer.tsx` - File content with syntax highlighting
- `apps/web/src/components/repo/BranchSelector.tsx` - Branch dropdown
- `apps/web/src/components/repo/Breadcrumb.tsx` - Path navigation
- `apps/web/src/hooks/useRepository.ts` - Repository data hook

**MODIFY:**
- `apps/web/src/App.tsx` - Add routes for repository pages

### Task Description

Build a code browser similar to GitHub's.

**Routes:**
- `/:owner/:repo` - Repository home (redirects to code)
- `/:owner/:repo/tree/:branch` - Root of branch
- `/:owner/:repo/tree/:branch/*` - Directory view
- `/:owner/:repo/blob/:branch/*` - File view

**Repository Header (shared across pages):**
- Owner / Repo name (with links)
- Description
- Stars, forks, watchers counts
- Tabs: Code | Issues | Pull Requests | Settings

**File Browser (`/tree/...`):**
- Branch selector dropdown (top left)
- Breadcrumb path: `repo / src / components / Button.tsx`
- File listing table:
  - Icon (folder or file type)
  - Name (linked)
  - Last commit message (truncated)
  - Last modified time
- Click folder → navigate deeper
- Click file → go to blob view

**File Viewer (`/blob/...`):**
- Breadcrumb navigation
- File info: name, size, lines
- Syntax highlighted code (use Prism or highlight.js)
- Line numbers (clickable for linking)
- "Raw" button

**API endpoints you'll need (check if they exist):**
- `repos.get` - Repository metadata
- `repos.getTree` or similar - Directory listing
- `repos.getBlob` or similar - File content
- `repos.getBranches` - Branch list

If endpoints don't exist, note them in deliverables.

### Patterns to Follow

**For pages** - Look at existing pages in `apps/web/src/pages/`:
- How they use tRPC queries
- Loading and error states
- Layout structure

**For styling** - Use TailwindCSS classes:
- Match existing component styles
- Use `bg-gray-900`, `text-gray-100` for dark theme (check existing)

**For syntax highlighting:**
```bash
npm install prismjs @types/prismjs
# or
npm install highlight.js
```

### Deliverables

1. **File list** - All components created
2. **Routes added** - Exact routes added to App.tsx
3. **Component tree** - How components nest together
4. **Missing APIs** - Any backend endpoints that don't exist
5. **Screenshots/descriptions** - What each view looks like

### Boundaries

**DO NOT modify:**
- Backend/API code
- CLI code
- Other pages (Issues, PRs, Settings)

**DO NOT implement:**
- File editing
- Commit history view
- Blame view
- These are separate features

Focus on: Clean, functional file browser.
```

---

## PROMPT D: CLI Error Message Audit

```
## Task: Audit and Improve wit CLI Error Messages

You're improving error messages across all wit CLI commands.

### Context Sources (read these first)

Read these to understand the error handling:

1. `src/cli.ts` - Main entry, global error handling
2. `src/core/errors.ts` - Error class definitions
3. `src/commands/*.ts` - All CLI commands (skim all, focus on error handling)
4. Pick 3-4 commands and trace their error paths

### Your Scope

**MODIFY:**
- `src/core/errors.ts` - Add/improve error classes as needed
- `src/cli.ts` - Improve global error handler
- `src/commands/*.ts` - Improve error handling (as needed)

**You own error handling across the entire CLI.**

### Task Description

Make every error message helpful. Users should know:
1. WHAT went wrong
2. WHY it happened (context)
3. HOW to fix it

**Error format standard:**
```
Error: [Short, clear description]

  [Detailed context - what we tried to do]
  [Why it failed]

  To fix this:
    [Specific command or action]
    [Alternative if applicable]
```

**Example transformations:**

BAD:
```
Error: ENOENT: no such file or directory
```

GOOD:
```
Error: Not a wit repository

  Could not find .git directory in /Users/you/project
  or any parent directory.

  To create a new repository:
    wit init

  To clone an existing repository:
    wit clone <url>
```

BAD:
```
Error: Reference not found
```

GOOD:
```
Error: Branch 'feature/foo' not found

  Available branches:
    - main
    - feature/bar
    - develop

  To create this branch:
    wit checkout -b feature/foo
```

**Priority commands to audit:**
1. `wit init` - Repository creation errors
2. `wit clone` - Network, auth, path errors
3. `wit checkout` - Branch/file not found
4. `wit commit` - Nothing to commit, merge conflicts
5. `wit push` - Auth, remote, rejection errors
6. `wit pull` - Conflicts, diverged branches

### Patterns to Follow

**Error class structure** (`src/core/errors.ts`):
```typescript
export class BranchNotFoundError extends WitError {
  constructor(branch: string, availableBranches?: string[]) {
    const suggestions = availableBranches?.length
      ? `\n\n  Available branches:\n${availableBranches.map(b => `    - ${b}`).join('\n')}`
      : '';
    
    super(
      `Branch '${branch}' not found${suggestions}\n\n  To create this branch:\n    wit checkout -b ${branch}`
    );
    this.name = 'BranchNotFoundError';
  }
}
```

**Using errors in commands:**
```typescript
const branch = await repo.getBranch(name);
if (!branch) {
  const available = await repo.listBranches();
  throw new BranchNotFoundError(name, available.map(b => b.name));
}
```

### Deliverables

1. **Commands audited** - List of all commands you reviewed
2. **Errors improved** - Before/after for the 5 worst offenders
3. **New error classes** - Any added to errors.ts
4. **Pattern guide** - Short guide for future error handling

### Boundaries

**DO NOT modify:**
- Core logic (only error handling)
- Test assertions (unless they check error messages)
- Backend API
- Web UI

**DO NOT:**
- Add emoji to error messages
- Make errors overly verbose
- Change exit codes

Focus on: Clarity and actionability.
```

---

## Coordination Notes

### Avoiding Merge Conflicts

**Schema changes are coordinated by line number:**
| Prompt | Table | Location |
|--------|-------|----------|
| A (Tokens) | `personalAccessTokens` | After `sshKeys` (~line 95) |
| B (Branch Protection) | `branchProtectionRules` | After `teamMembers` (~line 140) |

**Index files:** Each agent notes their additions. Merge manually in order.

### After Parallel Work

```bash
# 1. Review each agent's output

# 2. Apply changes in order (A, B, C, D)
#    - Schema changes go in specified locations
#    - Index exports get combined

# 3. Push schema
DATABASE_URL="postgresql://wit:wit@localhost:5432/wit" npx drizzle-kit push --force

# 4. Run tests
DATABASE_URL="postgresql://wit:wit@localhost:5432/wit" npm test

# 5. Commit
git add -A
git commit -m "feat: add personal access tokens, branch protection API, repo browser, and improved errors"
```

### Quick Reference

| Prompt | Feature | Scope | New Files | Modifies |
|--------|---------|-------|-----------|----------|
| A | Personal Access Tokens | Backend + CLI | 3 | 5 |
| B | Branch Protection API | Backend only | 2 | 3 |
| C | Repo Browser | Frontend only | 8 | 1 |
| D | Error Messages | CLI only | 0 | ~10 |

**Parallelizable:** A + B + C + D (all independent domains)

---

*Last updated: December 26, 2024*
