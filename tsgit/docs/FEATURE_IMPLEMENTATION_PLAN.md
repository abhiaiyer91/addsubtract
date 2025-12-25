# tsgit Feature Implementation Plan

This document outlines all missing features needed to achieve feature parity with Git, organized into workstreams that can be tackled independently.

## Overview

| Workstream               | Priority | Complexity | Status              |
| ------------------------ | -------- | ---------- | ------------------- |
| 1. Local Commands        | High     | Medium     | **Mostly Complete** |
| 2. Remote Infrastructure | Critical | High       | Not Started         |
| 3. Remote Commands       | Critical | High       | Not Started         |
| 4. History Rewriting     | High     | High       | Not Started         |
| 5. Plumbing Commands     | Medium   | Low        | Not Started         |
| 6. Advanced Features     | Low      | Medium     | Not Started         |

---

## Workstream 1: Local Commands ✅ Mostly Complete

**Status:** Core local commands are implemented. Only a few remain.

### ✅ Completed Commands

| Command | Status  | Notes                                                          |
| ------- | ------- | -------------------------------------------------------------- |
| `stash` | ✅ Done | Full implementation: save, list, show, apply, pop, drop, clear |
| `tag`   | ✅ Done | Lightweight + annotated tags, list, delete, verify             |
| `reset` | ✅ Done | soft/mixed/hard modes, revision parsing (HEAD~N, HEAD^)        |

### 1.1 Bisect Command

**File:** `src/commands/bisect.ts`

Binary search to find the commit that introduced a bug.

```typescript
tsgit bisect start              // Start bisect session
tsgit bisect good [<rev>]       // Mark commit as good
tsgit bisect bad [<rev>]        // Mark commit as bad
tsgit bisect reset              // End bisect session
tsgit bisect skip               // Skip current commit
tsgit bisect log                // Show bisect log
```

**Implementation Notes:**

- Store state in `.tsgit/BISECT_STATE.json`
- Use binary search on commit history
- Auto-checkout commits during bisect

### 1.2 Clean Command

**File:** `src/commands/clean.ts`

Remove untracked files from working directory.

```typescript
tsgit clean -n                  // Dry run (show what would be deleted)
tsgit clean -f                  // Force delete untracked files
tsgit clean -fd                 // Delete untracked files and directories
tsgit clean -fx                 // Also delete ignored files
```

### 1.3 Show Command

**File:** `src/commands/show.ts`

Show various types of objects.

```typescript
tsgit show <commit>             // Show commit details + diff
tsgit show <commit>:<file>      // Show file at commit
tsgit show <tag>                // Show tag info
```

---

## Workstream 2: Remote Infrastructure

**Estimated Effort:** 3-4 days  
**Dependencies:** None

Core infrastructure needed for all remote operations.

### 2.1 Remote Configuration

**File:** `src/core/remote.ts`

```typescript
export interface Remote {
  name: string;
  url: string;
  fetch: string; // Refspec for fetching
  push?: string; // Refspec for pushing
}

export class RemoteManager {
  constructor(gitDir: string);

  // CRUD operations
  add(name: string, url: string): void;
  remove(name: string): void;
  rename(oldName: string, newName: string): void;
  setUrl(name: string, url: string): void;

  // Queries
  get(name: string): Remote | null;
  list(): Remote[];
  getDefault(): Remote | null;
}
```

**Storage:** `.tsgit/config` (INI format, Git-compatible)

```ini
[remote "origin"]
    url = https://github.com/user/repo.git
    fetch = +refs/heads/*:refs/remotes/origin/*
```

### 2.2 Git Protocol Implementation

**File:** `src/core/protocol/`

```
src/core/protocol/
├── index.ts           # Export all protocols
├── types.ts           # Common types
├── smart-http.ts      # Smart HTTP protocol
├── pack.ts            # Pack file format
├── packfile-parser.ts # Parse incoming packs
├── packfile-writer.ts # Create outgoing packs
└── refs-discovery.ts  # Ref advertisement parsing
```

#### Smart HTTP Protocol (`smart-http.ts`)

```typescript
export class SmartHttpClient {
  constructor(baseUrl: string);

  // Discovery
  async discoverRefs(
    service: "upload-pack" | "receive-pack"
  ): Promise<RefAdvertisement>;

  // Fetching (upload-pack)
  async fetchPack(wants: string[], haves: string[]): Promise<Buffer>;

  // Pushing (receive-pack)
  async pushPack(refs: RefUpdate[], pack: Buffer): Promise<PushResult>;
}
```

**HTTP Endpoints:**

- `GET /info/refs?service=git-upload-pack` - Ref discovery for fetch
- `POST /git-upload-pack` - Fetch pack negotiation
- `GET /info/refs?service=git-receive-pack` - Ref discovery for push
- `POST /git-receive-pack` - Push pack data

### 2.3 Authentication

**File:** `src/core/auth.ts`

```typescript
export class CredentialManager {
  // Try to get credentials from various sources
  async getCredentials(url: string): Promise<Credentials | null>;

  // Sources (in order):
  // 1. Environment: TSGIT_TOKEN, GIT_TOKEN, GITHUB_TOKEN
  // 2. Git credential helper (if available)
  // 3. .netrc file
  // 4. Interactive prompt (if TTY)
}
```

---

## Workstream 3: Remote Commands

**Estimated Effort:** 4-5 days  
**Dependencies:** Workstream 2 (Remote Infrastructure)

### 3.1 Remote Command

**File:** `src/commands/remote.ts`

```typescript
tsgit remote                    // List remotes
tsgit remote -v                 // List with URLs
tsgit remote add <name> <url>   // Add remote
tsgit remote remove <name>      // Remove remote
tsgit remote rename <old> <new> // Rename remote
tsgit remote get-url <name>     // Show URL
tsgit remote set-url <name> <url> // Change URL
```

### 3.2 Clone Command

**File:** `src/commands/clone.ts`

```typescript
tsgit clone <url> [<dir>]       // Clone repository
tsgit clone --depth <n> <url>   // Shallow clone
tsgit clone --branch <b> <url>  // Clone specific branch
tsgit clone --bare <url>        // Bare clone
```

**Implementation Steps:**

1. Parse URL and determine protocol
2. Create target directory
3. Initialize repository (`tsgit init`)
4. Add remote (`tsgit remote add origin <url>`)
5. Fetch refs and objects
6. Checkout default branch

### 3.3 Fetch Command

**File:** `src/commands/fetch.ts`

```typescript
tsgit fetch                     // Fetch from origin
tsgit fetch <remote>            // Fetch from specific remote
tsgit fetch --all               // Fetch from all remotes
tsgit fetch --prune             // Delete stale remote refs
tsgit fetch <remote> <refspec>  // Fetch specific ref
```

### 3.4 Pull Command

**File:** `src/commands/pull.ts`

```typescript
tsgit pull                      // Fetch + merge
tsgit pull --rebase             // Fetch + rebase
tsgit pull <remote> <branch>    // Pull specific branch
tsgit pull --ff-only            // Only fast-forward
```

### 3.5 Push Command

**File:** `src/commands/push.ts`

```typescript
tsgit push                      // Push current branch to origin
tsgit push <remote>             // Push to specific remote
tsgit push <remote> <branch>    // Push specific branch
tsgit push -u <remote> <branch> // Push and set upstream
tsgit push --force              // Force push
tsgit push --force-with-lease   // Safe force push
tsgit push --tags               // Push all tags
tsgit push --delete <branch>    // Delete remote branch
```

---

## Workstream 4: History Rewriting

**Estimated Effort:** 3-4 days  
**Dependencies:** None

### 4.1 Cherry-Pick Command

**File:** `src/commands/cherry-pick.ts`

```typescript
tsgit cherry-pick <commit>      // Apply commit
tsgit cherry-pick <c1> <c2>     // Apply multiple commits
tsgit cherry-pick --continue    // Continue after conflict
tsgit cherry-pick --abort       // Abort operation
tsgit cherry-pick --skip        // Skip current commit
tsgit cherry-pick -n <commit>   // Apply without committing
```

### 4.2 Rebase Command

**File:** `src/commands/rebase.ts`

```typescript
tsgit rebase <branch>           // Rebase onto branch
tsgit rebase --onto <new> <old> // Rebase onto specific base
tsgit rebase --continue         // Continue after conflict
tsgit rebase --abort            // Abort rebase
tsgit rebase --skip             // Skip current commit
```

**State File:** `.tsgit/REBASE_STATE.json`

### 4.3 Revert Command

**File:** `src/commands/revert.ts`

```typescript
tsgit revert <commit>           // Create commit that undoes changes
tsgit revert <c1> <c2>          // Revert multiple commits
tsgit revert --no-commit <c>    // Revert without committing
tsgit revert --continue         // Continue after conflict
tsgit revert --abort            // Abort operation
```

---

## Workstream 5: Plumbing Commands

**Estimated Effort:** 2 days  
**Dependencies:** None

Low-level commands for scripting and advanced usage.

### 5.1 Rev-Parse

**File:** `src/commands/rev-parse.ts`

```typescript
tsgit rev-parse HEAD            // Output: commit hash
tsgit rev-parse HEAD~3          // 3 commits back
tsgit rev-parse --short HEAD    // Short hash
tsgit rev-parse --verify <ref>  // Verify ref exists
tsgit rev-parse --git-dir       // Output: .tsgit
tsgit rev-parse --show-toplevel // Output: repo root
```

### 5.2 Update-Ref

**File:** `src/commands/update-ref.ts`

```typescript
tsgit update-ref <ref> <hash>        // Update ref
tsgit update-ref -d <ref>            // Delete ref
tsgit update-ref --stdin             // Batch update
```

### 5.3 Symbolic-Ref

**File:** `src/commands/symbolic-ref.ts`

```typescript
tsgit symbolic-ref HEAD              // Output: refs/heads/main
tsgit symbolic-ref HEAD refs/heads/x // Set HEAD to branch
tsgit symbolic-ref --short HEAD      // Output: main
```

### 5.4 For-Each-Ref

**File:** `src/commands/for-each-ref.ts`

```typescript
tsgit for-each-ref                           // List all refs
tsgit for-each-ref refs/heads                // List branches
tsgit for-each-ref refs/tags                 // List tags
tsgit for-each-ref --format='%(refname)'     // Custom format
```

### 5.5 Show-Ref

**File:** `src/commands/show-ref.ts`

```typescript
tsgit show-ref                    // List all refs with hashes
tsgit show-ref --heads            // Only branches
tsgit show-ref --tags             // Only tags
tsgit show-ref <ref>              // Check if ref exists
```

### 5.6 Verify Objects

**File:** `src/commands/fsck.ts`

```typescript
tsgit fsck                        // Verify object database
tsgit fsck --full                 // Full verification
```

---

## Workstream 6: Advanced Features

**Estimated Effort:** 4-5 days  
**Dependencies:** Workstreams 2, 3

### 6.1 Hooks System

**File:** `src/core/hooks.ts`

**Hook Types:**

- `pre-commit` - Before commit is created
- `post-commit` - After commit is created
- `pre-push` - Before push
- `post-merge` - After merge
- `pre-rebase` - Before rebase
- `commit-msg` - Validate/modify commit message

**Directory:** `.tsgit/hooks/`

### 6.2 Submodules

**File:** `src/core/submodule.ts`

```typescript
tsgit submodule add <url> <path>   // Add submodule
tsgit submodule init               // Initialize submodules
tsgit submodule update             // Update submodules
tsgit submodule status             // Show status
tsgit submodule foreach <cmd>      // Run command in each
```

### 6.3 Worktrees

**File:** `src/core/worktree.ts`

```typescript
tsgit worktree add <path> <branch>  // Add worktree
tsgit worktree list                 // List worktrees
tsgit worktree remove <path>        // Remove worktree
tsgit worktree prune                // Prune stale entries
```

### 6.4 Reflog

**File:** `src/commands/reflog.ts`

Traditional reflog alongside the existing journal.

```typescript
tsgit reflog                    // Show HEAD reflog
tsgit reflog <ref>              // Show reflog for ref
tsgit reflog expire             // Prune old entries
```

### 6.5 Garbage Collection

**File:** `src/commands/gc.ts`

```typescript
tsgit gc                        // Run garbage collection
tsgit gc --aggressive           // More aggressive optimization
tsgit gc --prune=now            // Prune immediately
```

**Tasks:**

- Remove unreachable objects
- Pack loose objects into packfiles
- Remove stale refs

---

## Testing ✅ Complete

All commands now have comprehensive tests:

| Command | Test File                     | Status  |
| ------- | ----------------------------- | ------- |
| stash   | `src/__tests__/stash.test.ts` | ✅ Done |
| tag     | `src/__tests__/tag.test.ts`   | ✅ Done |
| reset   | `src/__tests__/reset.test.ts` | ✅ Done |

---

## Priority Order

Recommended implementation order for maximum impact:

1. **Phase 1 - Remaining Local** (1-2 days)

   - [ ] Bisect
   - [ ] Clean
   - [ ] Show

2. **Phase 2 - Remote Infrastructure** (3-4 days)

   - [ ] Remote configuration
   - [ ] Smart HTTP protocol
   - [ ] Pack file parsing/writing
   - [ ] Authentication

3. **Phase 3 - Remote Commands** (4-5 days)

   - [ ] Remote command
   - [ ] Clone
   - [ ] Fetch
   - [ ] Pull
   - [ ] Push

4. **Phase 4 - History Rewriting** (3-4 days)

   - [ ] Cherry-pick
   - [ ] Rebase
   - [ ] Revert

5. **Phase 5 - Polish** (2-3 days)
   - [ ] Plumbing commands
   - [ ] Hooks
   - [ ] Tests for completed features

---

## Getting Started

1. Pick a workstream or individual task
2. Create a feature branch: `git checkout -b feature/<command-name>`
3. Implement the command following existing patterns
4. Add tests
5. Update CLI and exports
6. Submit PR

**Code Style:**

- Follow existing patterns in `src/commands/`
- Use `TsgitError` for user-facing errors
- Include helpful suggestions in error messages
- Add colors for terminal output
- Document public functions with JSDoc

**Reference Implementations:**

- Simple command: `src/commands/wip.ts`
- Complex command: `src/commands/merge.ts`
- With state: `src/commands/stash.ts`
- Plumbing: `src/commands/reset.ts`
