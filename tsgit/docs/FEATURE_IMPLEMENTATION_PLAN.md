# wit Feature Implementation Plan

This document outlines all features implemented in wit, organized into workstreams.

## Overview

| Workstream               | Priority | Complexity | Status          |
| ------------------------ | -------- | ---------- | --------------- |
| 1. Local Commands        | High     | Medium     | ✅ **Complete** |
| 2. Remote Infrastructure | Critical | High       | ✅ **Complete** |
| 3. Remote Commands       | Critical | High       | ✅ **Complete** |
| 4. History Rewriting     | High     | High       | ✅ **Complete** |
| 5. Plumbing Commands     | Medium   | Low        | ✅ **Complete** |
| 6. Advanced Features     | Low      | Medium     | ✅ **Complete** |

---

## Workstream 1: Local Commands ✅ Complete

**Status:** All core local commands are implemented.

### ✅ Completed Commands

| Command  | Status  | Notes                                                          |
| -------- | ------- | -------------------------------------------------------------- |
| `stash`  | ✅ Done | Full implementation: save, list, show, apply, pop, drop, clear |
| `tag`    | ✅ Done | Lightweight + annotated tags, list, delete, verify             |
| `reset`  | ✅ Done | soft/mixed/hard modes, revision parsing (HEAD~N, HEAD^)        |
| `bisect` | ✅ Done | Binary search for bugs with start/good/bad/reset               |
| `clean`  | ✅ Done | Remove untracked files with -n/-f/-d/-x options                |
| `show`   | ✅ Done | Show commits, files at commits, and tags                       |

---

## Workstream 2: Remote Infrastructure ✅ Complete

**Status:** All core remote infrastructure is implemented.

### 2.1 Remote Configuration ✅

**File:** `src/core/remote.ts`

```typescript
import { RemoteManager } from "wit/core/remote";

const remotes = new RemoteManager(gitDir);

// CRUD operations
remotes.add("origin", "https://github.com/user/repo.git");
remotes.remove("origin");
remotes.rename("origin", "upstream");
remotes.setUrl("origin", "https://github.com/user/new-repo.git");

// Queries
const origin = remotes.get("origin");
const allRemotes = remotes.list();
const defaultRemote = remotes.getDefault();

// Remote tracking refs
remotes.updateRemoteRef("origin", "main", commitHash);
const refs = remotes.listRemoteRefs("origin");

// Refspec utilities
const { force, src, dst } = RemoteManager.parseRefspec(
  "+refs/heads/*:refs/remotes/origin/*"
);
const localRef = RemoteManager.applyRefspec(refspec, "refs/heads/main");
```

**Storage:** `.wit/config` (INI format, Git-compatible)

### 2.2 Git Protocol Implementation ✅

**File:** `src/core/protocol/`

```
src/core/protocol/
├── index.ts           # Export all protocols ✅
├── types.ts           # Common types ✅
├── smart-http.ts      # Smart HTTP protocol client ✅
├── pack.ts            # Pack file format utilities ✅
├── packfile-parser.ts # Parse incoming packs ✅
├── packfile-writer.ts # Create outgoing packs ✅
└── refs-discovery.ts  # Ref advertisement parsing ✅
```

### 2.3 Authentication ✅

**File:** `src/core/auth.ts`

**Environment Variables Supported:**

- `WIT_TOKEN` - Universal token
- `GITHUB_TOKEN` / `GH_TOKEN` - GitHub
- `GITLAB_TOKEN` / `GL_TOKEN` - GitLab
- `GIT_TOKEN` - Generic
- `GIT_USERNAME` + `GIT_PASSWORD` - Basic auth

---

## Workstream 3: Remote Commands ✅ Complete

**Status:** All remote commands are implemented.

### 3.1 Remote Command ✅

**File:** `src/commands/remote.ts`

```typescript
wit remote                    // List remotes
wit remote -v                 // List with URLs
wit remote add <name> <url>   // Add remote
wit remote remove <name>      // Remove remote
wit remote rename <old> <new> // Rename remote
wit remote get-url <name>     // Show URL
wit remote set-url <name> <url> // Change URL
```

### 3.2 Clone Command ✅

**File:** `src/commands/clone.ts`

```typescript
wit clone <url> [<dir>]       // Clone repository
wit clone --depth <n> <url>   // Shallow clone
wit clone --branch <b> <url>  // Clone specific branch
wit clone --bare <url>        // Bare clone
```

### 3.3 Fetch Command ✅

**File:** `src/commands/fetch.ts`

```typescript
wit fetch                     // Fetch from origin
wit fetch <remote>            // Fetch from specific remote
wit fetch --all               // Fetch from all remotes
wit fetch --prune             // Delete stale remote refs
wit fetch <remote> <refspec>  // Fetch specific ref
```

### 3.4 Pull Command ✅

**File:** `src/commands/pull.ts`

```typescript
wit pull                      // Fetch + merge
wit pull --rebase             // Fetch + rebase
wit pull <remote> <branch>    // Pull specific branch
wit pull --ff-only            // Only fast-forward
```

### 3.5 Push Command ✅

**File:** `src/commands/push.ts`

```typescript
wit push                      // Push current branch to origin
wit push <remote>             // Push to specific remote
wit push <remote> <branch>    // Push specific branch
wit push -u <remote> <branch> // Push and set upstream
wit push --force              // Force push
wit push --force-with-lease   // Safe force push
wit push --tags               // Push all tags
wit push --delete <branch>    // Delete remote branch
```

---

## Workstream 4: History Rewriting ✅ Complete

**Status:** All history rewriting commands are implemented.

### 4.1 Cherry-Pick Command ✅

**File:** `src/commands/cherry-pick.ts`

```typescript
wit cherry-pick <commit>      // Apply commit
wit cherry-pick <c1> <c2>     // Apply multiple commits
wit cherry-pick --continue    // Continue after conflict
wit cherry-pick --abort       // Abort operation
wit cherry-pick --skip        // Skip current commit
wit cherry-pick -n <commit>   // Apply without committing
```

### 4.2 Rebase Command ✅

**File:** `src/commands/rebase.ts`

```typescript
wit rebase <branch>           // Rebase onto branch
wit rebase --onto <new> <old> // Rebase onto specific base
wit rebase --continue         // Continue after conflict
wit rebase --abort            // Abort rebase
wit rebase --skip             // Skip current commit
```

**State File:** `.wit/REBASE_STATE.json`

### 4.3 Revert Command ✅

**File:** `src/commands/revert.ts`

```typescript
wit revert <commit>           // Create commit that undoes changes
wit revert <c1> <c2>          // Revert multiple commits
wit revert --no-commit <c>    // Revert without committing
wit revert --continue         // Continue after conflict
wit revert --abort            // Abort operation
```

---

## Workstream 5: Plumbing Commands ✅ Complete

**Status:** All plumbing commands are implemented.

### 5.1 Rev-Parse ✅

**File:** `src/commands/rev-parse.ts`

```typescript
wit rev-parse HEAD            // Output: commit hash
wit rev-parse HEAD~3          // 3 commits back
wit rev-parse --short HEAD    // Short hash
wit rev-parse --verify <ref>  // Verify ref exists
wit rev-parse --git-dir       // Output: .wit
wit rev-parse --show-toplevel // Output: repo root
```

### 5.2 Update-Ref ✅

**File:** `src/commands/update-ref.ts`

```typescript
wit update-ref <ref> <hash>        // Update ref
wit update-ref -d <ref>            // Delete ref
wit update-ref --stdin             // Batch update
```

### 5.3 Symbolic-Ref ✅

**File:** `src/commands/symbolic-ref.ts`

```typescript
wit symbolic-ref HEAD              // Output: refs/heads/main
wit symbolic-ref HEAD refs/heads/x // Set HEAD to branch
wit symbolic-ref --short HEAD      // Output: main
```

### 5.4 For-Each-Ref ✅

**File:** `src/commands/for-each-ref.ts`

```typescript
wit for-each-ref                           // List all refs
wit for-each-ref refs/heads                // List branches
wit for-each-ref refs/tags                 // List tags
wit for-each-ref --format='%(refname)'     // Custom format
```

### 5.5 Show-Ref ✅

**File:** `src/commands/show-ref.ts`

```typescript
wit show-ref                    // List all refs with hashes
wit show-ref --heads            // Only branches
wit show-ref --tags             // Only tags
wit show-ref <ref>              // Check if ref exists
```

### 5.6 Verify Objects ✅

**File:** `src/commands/fsck.ts`

```typescript
wit fsck                        // Verify object database
wit fsck --full                 // Full verification
```

---

## Workstream 6: Advanced Features ✅ Complete

**Status:** All advanced features are implemented.

### 6.1 Hooks System ✅

**File:** `src/core/hooks.ts`

**Hook Types:**

- `pre-commit` - Before commit is created
- `post-commit` - After commit is created
- `pre-push` - Before push
- `post-merge` - After merge
- `pre-rebase` - Before rebase
- `commit-msg` - Validate/modify commit message

**Directory:** `.wit/hooks/`

### 6.2 Submodules ✅

**File:** `src/core/submodule.ts`

```typescript
wit submodule add <url> <path>   // Add submodule
wit submodule init               // Initialize submodules
wit submodule update             // Update submodules
wit submodule status             // Show status
wit submodule foreach <cmd>      // Run command in each
```

### 6.3 Worktrees ✅

**File:** `src/core/worktree.ts`

```typescript
wit worktree add <path> <branch>  // Add worktree
wit worktree list                 // List worktrees
wit worktree remove <path>        // Remove worktree
wit worktree prune                // Prune stale entries
```

### 6.4 Reflog ✅

**File:** `src/commands/reflog.ts`

```typescript
wit reflog                    // Show HEAD reflog
wit reflog <ref>              // Show reflog for ref
wit reflog expire             // Prune old entries
```

### 6.5 Garbage Collection ✅

**File:** `src/commands/gc.ts`

```typescript
wit gc                        // Run garbage collection
wit gc --aggressive           // More aggressive optimization
wit gc --prune=now            // Prune immediately
```

---

## Testing Status

### ✅ Commands with Dedicated Tests

| Command     | Test File                           | Tests |
| ----------- | ----------------------------------- | ----- |
| amend       | `src/__tests__/amend.test.ts`       | 8     |
| blame       | `src/__tests__/blame.test.ts`       | 9     |
| bisect      | `src/__tests__/bisect.test.ts`      | ~10   |
| cherry-pick | `src/__tests__/cherry-pick.test.ts` | ~15   |
| clean       | `src/__tests__/clean.test.ts`       | ~10   |
| cleanup     | `src/__tests__/cleanup.test.ts`     | 9     |
| fixup       | `src/__tests__/fixup.test.ts`       | 9     |
| plumbing    | `src/__tests__/plumbing.test.ts`    | ~30   |
| rebase      | `src/__tests__/rebase.test.ts`      | ~15   |
| remote      | `src/__tests__/remote.test.ts`      | 26    |
| reset       | `src/__tests__/reset.test.ts`       | ~10   |
| revert      | `src/__tests__/revert.test.ts`      | ~12   |
| show        | `src/__tests__/show.test.ts`        | ~10   |
| snapshot    | `src/__tests__/snapshot.test.ts`    | 17    |
| stash       | `src/__tests__/stash.test.ts`       | ~12   |
| stats       | `src/__tests__/stats.test.ts`       | 15    |
| tag         | `src/__tests__/tag.test.ts`         | ~10   |
| uncommit    | `src/__tests__/uncommit.test.ts`    | 8     |
| wip         | `src/__tests__/wip.test.ts`         | 8     |

**Note:** `plumbing.test.ts` covers rev-parse, update-ref, symbolic-ref, for-each-ref, show-ref, and fsck.

### ✅ Recently Added Tests

| Command   | Test File                         | Tests |
| --------- | --------------------------------- | ----- |
| reflog    | `src/__tests__/reflog.test.ts`    | ~15   |
| gc        | `src/__tests__/gc.test.ts`        | ~12   |
| hooks     | `src/__tests__/hooks.test.ts`     | ~20   |
| submodule | `src/__tests__/submodule.test.ts` | ~15   |
| worktree  | `src/__tests__/worktree.test.ts`  | ~10   |

### ⚠️ Commands Needing Tests (Network-dependent)

| Command | File                    | Priority | Notes                           |
| ------- | ----------------------- | -------- | ------------------------------- |
| clone   | `src/commands/clone.ts` | Low      | Requires network for full tests |
| fetch   | `src/commands/fetch.ts` | Low      | Requires network for full tests |
| pull    | `src/commands/pull.ts`  | Low      | Requires network for full tests |
| push    | `src/commands/push.ts`  | Low      | Requires network for full tests |

**Current Test Count:** 397 tests passing

---

## Summary

🎉 **Feature parity with Git achieved!**

All major workstreams are complete:

- ✅ Local commands (stash, tag, reset, bisect, clean, show)
- ✅ Remote infrastructure (RemoteManager, protocols, authentication)
- ✅ Remote commands (remote, clone, fetch, pull, push)
- ✅ History rewriting (cherry-pick, rebase, revert)
- ✅ Plumbing commands (rev-parse, update-ref, symbolic-ref, etc.)
- ✅ Advanced features (hooks, submodules, worktrees, reflog, gc)

---

## Code Style

When contributing:

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
- Remote: `src/commands/push.ts`
