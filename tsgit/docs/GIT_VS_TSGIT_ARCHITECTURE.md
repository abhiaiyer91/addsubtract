# Git vs tsgit: An Architectural Deep Dive

This document explains how the original Git version control system works internally and how tsgit—a modern TypeScript implementation—solves the same problems, often with improvements.

## Table of Contents

1. [Overview](#overview)
2. [Content-Addressable Storage](#content-addressable-storage)
3. [Object Types](#object-types)
4. [The Index (Staging Area)](#the-index-staging-area)
5. [References and Branches](#references-and-branches)
6. [Commit History](#commit-history)
7. [Diff Algorithm](#diff-algorithm)
8. [Merge and Conflict Resolution](#merge-and-conflict-resolution)
9. [Large File Handling](#large-file-handling)
10. [Undo and History](#undo-and-history)
11. [Branch State Management](#branch-state-management)
12. [Monorepo Support](#monorepo-support)
13. [Error Handling](#error-handling)
14. [Summary: Key Differences](#summary-key-differences)

---

## Overview

### How Git Works (High Level)

Git is a distributed version control system built around a few core concepts:

1. **Content-addressable storage**: Files are stored by the hash of their content
2. **Immutable objects**: Once stored, objects never change
3. **Directed Acyclic Graph (DAG)**: Commits form a linked history
4. **References**: Named pointers to commits (branches, tags, HEAD)

Git stores everything in the `.git/` directory:

```
.git/
├── HEAD              # Current branch reference
├── config            # Repository configuration
├── index             # Binary staging area
├── objects/          # Content-addressable storage
│   ├── ab/          # Objects by 2-char prefix
│   └── pack/        # Packfiles for compression
├── refs/
│   ├── heads/       # Branch references
│   └── tags/        # Tag references
└── hooks/           # Git hooks
```

### How tsgit Works (High Level)

tsgit mirrors Git's conceptual model while making practical improvements:

```
.tsgit/
├── HEAD              # Current branch reference
├── config            # Repository configuration (INI + JSON)
├── index             # JSON staging area (human-readable)
├── objects/          # Content-addressable storage (SHA-256)
│   └── ab/          # Objects by 2-char prefix
├── refs/
│   ├── heads/       # Branch references
│   └── tags/        # Tag references
├── journal.json      # Operation history for undo
├── branch-states/    # Auto-stashed work per branch
├── chunks/           # Large file chunks
├── manifests/        # Large file manifests
└── scopes/           # Saved scope configurations
```

---

## Content-Addressable Storage

### Git's Approach

Git uses SHA-1 to compute a 40-character hex hash of each object. The object is stored at a path derived from its hash:

```
Hash: 2fd4e1c67a2d28fced849ee1bb76e7391b93eb12
Path: .git/objects/2f/d4e1c67a2d28fced849ee1bb76e7391b93eb12
```

Objects are stored in a specific format:
```
{type} {size}\0{content}
```

This is then compressed with zlib before writing to disk.

**Security Issue**: SHA-1 has been cryptographically broken since 2017 (the "SHAttered" attack). While Git has partial mitigations, repositories remain vulnerable to collision attacks.

### tsgit's Approach

tsgit defaults to **SHA-256** (64-character hex), providing significantly stronger security:

```typescript
// src/utils/hash.ts
export type HashAlgorithm = 'sha1' | 'sha256';
let currentAlgorithm: HashAlgorithm = 'sha256';  // Default

export function computeHash(data: Buffer | string): string {
  return crypto.createHash(currentAlgorithm).update(data).digest('hex');
}

export function hashObject(type: string, content: Buffer): string {
  const header = Buffer.from(`${type} ${content.length}\0`);
  const store = Buffer.concat([header, content]);
  return computeHash(store);
}
```

tsgit uses the same object format as Git (`{type} {size}\0{content}`) and the same zlib compression, ensuring conceptual compatibility while upgrading security:

```typescript
// src/utils/compression.ts
export function compress(data: Buffer): Buffer {
  return zlib.deflateSync(data);
}

export function decompress(data: Buffer): Buffer {
  return zlib.inflateSync(data);
}
```

---

## Object Types

### Git's Four Object Types

Git has exactly four object types:

| Type | Purpose |
|------|---------|
| **blob** | Stores file content (no filename, just data) |
| **tree** | Stores directory structure (list of entries) |
| **commit** | Points to a tree + metadata (author, message, parents) |
| **tag** | Named reference to another object with metadata |

#### Blob Format
Raw file content—no metadata like filename or permissions.

#### Tree Format (Binary)
```
{mode} {filename}\0{20-byte-hash}{mode} {filename}\0{20-byte-hash}...
```

#### Commit Format
```
tree {tree-hash}
parent {parent-hash}
author {name} <{email}> {timestamp} {timezone}
committer {name} <{email}> {timestamp} {timezone}

{commit message}
```

### tsgit's Object Implementation

tsgit implements all four object types with a clean TypeScript class hierarchy:

```typescript
// src/core/object.ts
export abstract class GitObject {
  abstract readonly type: ObjectType;
  abstract serialize(): Buffer;

  hash(): string {
    return hashObject(this.type, this.serialize());
  }
}

export class Blob extends GitObject {
  readonly type: ObjectType = 'blob';
  constructor(public readonly content: Buffer) { super(); }
  
  serialize(): Buffer { return this.content; }
  static deserialize(data: Buffer): Blob { return new Blob(data); }
}

export class Tree extends GitObject {
  readonly type: ObjectType = 'tree';
  constructor(public readonly entries: TreeEntry[]) { super(); }
  
  serialize(): Buffer {
    // Sort entries, then format: "{mode} {name}\0{hash-bytes}"
    const sorted = [...this.entries].sort((a, b) => {
      const aName = a.mode === '40000' ? a.name + '/' : a.name;
      const bName = b.mode === '40000' ? b.name + '/' : b.name;
      return aName.localeCompare(bName);
    });
    
    const parts: Buffer[] = [];
    for (const entry of sorted) {
      const modeAndName = Buffer.from(`${entry.mode} ${entry.name}\0`);
      const hashBytes = Buffer.from(entry.hash, 'hex');
      parts.push(modeAndName, hashBytes);
    }
    return Buffer.concat(parts);
  }
}

export class Commit extends GitObject {
  readonly type: ObjectType = 'commit';
  
  constructor(
    public readonly treeHash: string,
    public readonly parentHashes: string[],
    public readonly author: Author,
    public readonly committer: Author,
    public readonly message: string
  ) { super(); }
  
  serialize(): Buffer {
    const lines: string[] = [];
    lines.push(`tree ${this.treeHash}`);
    for (const parent of this.parentHashes) {
      lines.push(`parent ${parent}`);
    }
    lines.push(`author ${formatAuthor(this.author)}`);
    lines.push(`committer ${formatAuthor(this.committer)}`);
    lines.push('');
    lines.push(this.message);
    return Buffer.from(lines.join('\n'));
  }
}
```

The format is **identical to Git's**, making it conceptually compatible and easy to understand.

---

## The Index (Staging Area)

### Git's Approach

Git uses a **binary index file** at `.git/index`. The format includes:

1. 12-byte header: signature, version, entry count
2. Index entries (variable length) containing:
   - ctime, mtime (8 bytes each)
   - dev, ino, mode, uid, gid, size
   - SHA-1 hash (20 bytes)
   - flags + path name
3. Extensions (tree cache, resolve-undo, etc.)
4. 20-byte checksum

This binary format is efficient but:
- Hard to debug or inspect manually
- Requires specialized tools to read
- Easy to corrupt

### tsgit's Approach

tsgit uses a **JSON format** that's human-readable and easier to debug:

```typescript
// src/core/index.ts
export class Index {
  private entries: Map<string, IndexEntry> = new Map();
  private indexPath: string;

  save(): void {
    const entries = Array.from(this.entries.values()).sort((a, b) => 
      a.path.localeCompare(b.path)
    );
    
    const json = {
      version: 2,
      entries,
    };

    writeFile(this.indexPath, JSON.stringify(json, null, 2));
  }

  add(filePath: string, hash: string, workDir: string): void {
    const fullPath = path.join(workDir, filePath);
    const stats = stat(fullPath);

    const entry: IndexEntry = {
      mode: stats.mode & 0o100 ? '100755' : '100644',
      hash,
      stage: 0,
      path: filePath,
      ctime: Math.floor(stats.ctimeMs),
      mtime: Math.floor(stats.mtimeMs),
      dev: stats.dev,
      ino: stats.ino,
      uid: stats.uid,
      gid: stats.gid,
      size: stats.size,
    };

    this.entries.set(filePath, entry);
  }
}
```

Example `.tsgit/index`:
```json
{
  "version": 2,
  "entries": [
    {
      "mode": "100644",
      "hash": "abc123...",
      "stage": 0,
      "path": "src/main.ts",
      "ctime": 1703500000000,
      "mtime": 1703500000000,
      "size": 1234
    }
  ]
}
```

**Benefits**:
- Human-readable—you can debug with any text editor
- No specialized tools needed to inspect
- Same metadata as Git (ctime, mtime, etc.) for change detection

---

## References and Branches

### Git's Approach

Git stores references as simple text files:

- `.git/HEAD` contains either:
  - Symbolic ref: `ref: refs/heads/main`
  - Direct hash: `abc123...`
- `.git/refs/heads/{branch}` contains the commit hash
- `.git/refs/tags/{tag}` contains the tag target

Git resolves refs by:
1. If it's a 40-hex-char string → it's a hash
2. If HEAD starts with `ref:` → follow the chain
3. Otherwise check `refs/heads/`, `refs/tags/`, etc.

### tsgit's Approach

tsgit uses the exact same approach:

```typescript
// src/core/refs.ts
export class Refs {
  getHead(): { isSymbolic: boolean; target: string } {
    if (!exists(this.headPath)) {
      return { isSymbolic: true, target: 'refs/heads/main' };
    }

    const content = readFileText(this.headPath).trim();
    if (content.startsWith('ref: ')) {
      return { isSymbolic: true, target: content.slice(5) };
    }
    return { isSymbolic: false, target: content };
  }

  resolve(ref: string): string | null {
    // Check if it's already a hash
    if (/^[0-9a-f]{40}$/.test(ref)) {
      return ref;
    }

    if (ref === 'HEAD') {
      const head = this.getHead();
      if (head.isSymbolic) {
        return this.resolve(head.target);
      }
      return head.target;
    }

    // Check refs/heads/, refs/tags/, etc.
    // ...
  }
}
```

The key addition: tsgit validates hash length against the configured algorithm (40 chars for SHA-1, 64 for SHA-256).

---

## Commit History

### Git's Approach

Commits form a **Directed Acyclic Graph (DAG)**:
- Each commit points to parent commit(s)
- Merge commits have multiple parents
- The initial commit has no parent

Git traverses history by:
1. Start at HEAD (or specified ref)
2. Load commit object
3. Follow parent hashes recursively

### tsgit's Approach

Same conceptual model with a clean traversal API:

```typescript
// src/core/repository.ts
log(ref: string = 'HEAD', limit: number = 10): Commit[] {
  const commits: Commit[] = [];
  let currentHash = this.refs.resolve(ref);

  while (currentHash && commits.length < limit) {
    const commit = this.objects.readCommit(currentHash);
    commits.push(commit);

    if (commit.parentHashes.length > 0) {
      currentHash = commit.parentHashes[0];
    } else {
      break;
    }
  }

  return commits;
}
```

The graph visualization feature adds ASCII art output:

```
● a1b2c3d4 (main) Latest commit - Alice, today
● e5f6g7h8 Add feature - Bob, yesterday  
● i9j0k1l2 Initial commit - Alice, last week
```

---

## Diff Algorithm

### Git's Approach

Git uses the **Myers diff algorithm** to compute the shortest edit script (SES) between two files. It produces a unified diff format:

```diff
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 unchanged line
-removed line
+added line
+another added line
 context line
```

Key concepts:
- **Hunks**: Grouped changes with context
- **Context lines**: Unchanged lines around changes (default: 3)
- The algorithm minimizes edits (insertions + deletions)

### tsgit's Approach

tsgit implements a **Longest Common Subsequence (LCS)** based diff, which produces equivalent results:

```typescript
// src/core/diff.ts
export function diff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Compute LCS using dynamic programming
  const lcs = computeLCS(oldLines, newLines);
  return buildDiffFromLCS(oldLines, newLines, lcs);
}

function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}
```

Output is structured as hunks with context:

```typescript
export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}
```

**Enhancement**: tsgit includes colored terminal output and binary file detection:

```typescript
export function isBinary(content: Buffer): boolean {
  const checkLength = Math.min(content.length, 8000);
  for (let i = 0; i < checkLength; i++) {
    if (content[i] === 0) {
      return true;  // Null byte = binary
    }
  }
  return false;
}
```

---

## Merge and Conflict Resolution

### Git's Approach

Git performs **three-way merge**:
1. Find the **merge base** (common ancestor)
2. Compare both branches against the base
3. Auto-merge where possible
4. Mark conflicts with inline markers:

```
<<<<<<< HEAD
our changes
=======
their changes
>>>>>>> feature-branch
```

**Problems with Git's approach**:
- Inline markers are hard to parse programmatically
- Conflict resolution requires manual text editing
- Easy to accidentally leave markers in code

### tsgit's Approach

tsgit uses the same three-way merge algorithm but provides **structured conflict data**:

```typescript
// src/core/merge.ts
export interface ConflictRegion {
  startLine: number;
  endLine: number;
  ours: string[];
  theirs: string[];
  base?: string[];
  context: {
    before: string[];
    after: string[];
  };
}

export interface FileConflict {
  path: string;
  regions: ConflictRegion[];
  oursContent: string;
  theirsContent: string;
  baseContent?: string;
}
```

Instead of inline markers, tsgit saves **conflict files**:

```
.tsgit/conflicts/
├── file.txt.ours        # Our version
├── file.txt.theirs      # Their version
├── file.txt.base        # Common ancestor
└── file.txt.conflict.json  # Structured conflict data
```

**Merge state persistence**:

```typescript
export interface MergeState {
  inProgress: boolean;
  sourceBranch: string;
  targetBranch: string;
  sourceCommit: string;
  targetCommit: string;
  baseCommit?: string;
  conflicts: FileConflict[];
  resolved: string[];
  startedAt: number;
}
```

This enables:
- Better tooling (UI can show side-by-side comparison)
- Programmatic conflict resolution
- Clear status: which files are resolved vs. pending

---

## Large File Handling

### Git's Approach

Git was designed for text files and small binaries. For large files:
- Every version stores the complete file (no delta for large binaries)
- Repository bloats quickly
- Clone times increase significantly

**Git LFS** (Large File Storage) is a separate extension that:
- Stores large files on a separate server
- Replaces files with pointer files in the repo
- Requires additional setup and configuration

### tsgit's Approach

tsgit has **built-in large file chunking**:

```typescript
// src/core/large-file.ts
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;  // 1MB chunks
export const CHUNK_THRESHOLD = 2 * 1024 * 1024; // Chunk files > 2MB

export interface ChunkedFile {
  type: 'chunked';
  originalSize: number;
  chunkSize: number;
  chunks: ChunkInfo[];
  hash: string;  // Hash of original for verification
}

export class LargeFileHandler {
  storeFile(content: Buffer): string {
    const originalHash = computeHash(content);
    const chunks: ChunkInfo[] = [];

    let offset = 0;
    let index = 0;

    while (offset < content.length) {
      const end = Math.min(offset + this.chunkSize, content.length);
      const chunk = content.slice(offset, end);
      const chunkHash = this.storeChunk(chunk);

      chunks.push({
        index,
        hash: chunkHash,
        size: chunk.length,
        offset,
      });

      offset = end;
      index++;
    }

    const manifest: ChunkedFile = {
      type: 'chunked',
      originalSize: content.length,
      chunkSize: this.chunkSize,
      chunks,
      hash: originalHash,
    };

    return this.storeManifest(manifest);
  }
}
```

**Benefits**:
- **Deduplication**: Identical chunks across files are stored once
- **No external service**: Works offline, no LFS server needed
- **Automatic**: Files over 2MB are chunked automatically
- **Integrity verification**: Original hash stored for validation

---

## Undo and History

### Git's Approach

Git provides `reflog` to see recent reference updates:

```bash
$ git reflog
abc1234 HEAD@{0}: commit: Latest change
def5678 HEAD@{1}: checkout: moving from main to feature
```

**Problems**:
- Reflog syntax is confusing (`HEAD@{1}` etc.)
- Limited to reference changes, not all operations
- Requires understanding Git internals to use effectively
- `git reset --hard` can still lose work

### tsgit's Approach

tsgit maintains an **operation journal** that records every action:

```typescript
// src/core/journal.ts
export interface JournalEntry {
  id: string;
  timestamp: number;
  operation: string;      // 'commit', 'add', 'checkout', etc.
  args: string[];
  description: string;
  beforeState: StateSnapshot;
  afterState: StateSnapshot;
  affectedFiles?: string[];
  commitHash?: string;
}

export interface StateSnapshot {
  head: string;
  branch: string | null;
  indexHash: string;
}
```

Simple undo command:

```bash
$ tsgit undo           # Undo last operation
$ tsgit undo --steps 3 # Undo last 3 operations
$ tsgit history        # Show operation history
```

**Example journal entry**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1703500000000,
  "operation": "commit",
  "args": ["-m", "Add feature"],
  "description": "Committed 3 files",
  "beforeState": {
    "head": "refs/heads/main",
    "branch": "main",
    "indexHash": "abc123..."
  },
  "afterState": {
    "head": "refs/heads/main",
    "branch": "main",
    "indexHash": "def456..."
  },
  "commitHash": "789xyz...",
  "affectedFiles": ["src/main.ts", "src/util.ts"]
}
```

---

## Branch State Management

### Git's Approach

When switching branches with uncommitted changes, Git either:
1. **Fails** with "Your local changes would be overwritten"
2. **Carries changes** to the new branch (if no conflict)

To preserve work, users must manually:
```bash
$ git stash
$ git checkout other-branch
# ... do work ...
$ git checkout original-branch
$ git stash pop
```

**Problems**:
- Easy to forget stashed work
- Stash is a global stack, not per-branch
- `git stash list` can accumulate many entries

### tsgit's Approach

tsgit has **automatic per-branch state management**:

```typescript
// src/core/branch-state.ts
export interface BranchState {
  branch: string;
  savedAt: number;
  files: FileState[];
  stagedPaths: string[];
  message?: string;
}

export class BranchStateManager {
  onBranchSwitch(
    fromBranch: string | null,
    toBranch: string,
    stagedPaths: string[],
    hasChanges: boolean
  ): { savedFrom: boolean; restoredTo: boolean } {
    let savedFrom = false;
    let restoredTo = false;

    // Auto-save if switching away with changes
    if (this.config.autoSave && fromBranch && hasChanges) {
      this.saveState(fromBranch, stagedPaths);
      savedFrom = true;
    }

    // Auto-restore if target branch has saved state
    if (this.config.autoRestore && this.hasState(toBranch)) {
      this.restoreState(toBranch);
      restoredTo = true;
    }

    return { savedFrom, restoredTo };
  }
}
```

**Workflow**:
```bash
$ tsgit switch main       # Auto-saves work from current branch
# ... fix bug on main ...
$ tsgit commit -m "Fix bug"
$ tsgit switch feature    # Auto-restores work from feature branch
```

States are stored per-branch in `.tsgit/branch-states/`:
- `feature.json` - compressed state for feature branch
- `feature.history.json` - history of saved states

---

## Monorepo Support

### Git's Approach

Git has **sparse checkout** (introduced around Git 2.25):

```bash
$ git sparse-checkout init
$ git sparse-checkout set packages/frontend/
```

**Problems**:
- Complex to set up correctly
- Requires specific Git version
- Not widely understood or used

### tsgit's Approach

tsgit has first-class **scope support**:

```typescript
// src/core/scope.ts
export interface RepositoryScope {
  name?: string;
  paths: string[];           // Included paths
  excludePaths: string[];    // Excluded paths
  depth?: number;            // History depth limit
  includeRoot: boolean;      // Include root files
}

export const SCOPE_PRESETS: ScopePreset[] = [
  {
    name: 'frontend',
    description: 'Frontend packages only',
    scope: {
      paths: ['packages/frontend/', 'apps/web/', 'src/client/'],
      excludePaths: ['**/node_modules/', '**/dist/'],
    },
  },
  {
    name: 'backend',
    description: 'Backend packages only',
    scope: {
      paths: ['packages/backend/', 'apps/api/', 'src/server/'],
    },
  },
  // ...
];
```

**Usage**:
```bash
$ tsgit scope use frontend  # Limit to frontend/
$ tsgit status              # Shows only frontend files
$ tsgit add .               # Adds only frontend files
$ tsgit scope clear         # Back to full repo
```

**Integration with other commands**:

```typescript
export class ScopedRepository {
  status(): { staged; modified; untracked; deleted } {
    const fullStatus = this.repo.status();
    
    return {
      staged: this.scopeManager.filterPaths(fullStatus.staged),
      modified: this.scopeManager.filterPaths(fullStatus.modified),
      untracked: this.scopeManager.filterPaths(fullStatus.untracked),
      deleted: this.scopeManager.filterPaths(fullStatus.deleted),
    };
  }
}
```

---

## Error Handling

### Git's Approach

Git error messages are often cryptic:

```
error: pathspec 'featur' did not match any file(s) known to git
fatal: Your current branch 'main' does not have any commits yet
error: failed to push some refs to 'origin'
hint: Updates were rejected because the remote contains work that you do
hint: not have locally.
```

### tsgit's Approach

tsgit provides **structured errors with actionable suggestions**:

```typescript
// src/core/errors.ts
export class TsgitError extends Error {
  public readonly code: ErrorCode;
  public readonly suggestions: string[];
  public readonly context: ErrorContext;

  format(colors: boolean = true): string {
    let output = `error: ${this.message}\n`;

    if (this.suggestions.length > 0) {
      output += `\nhint: Did you mean one of these?\n`;
      for (const suggestion of this.suggestions) {
        output += `  ${suggestion}\n`;
      }
    }
    return output;
  }
}

// Factory for common errors
export const Errors = {
  branchNotFound(name: string, existingBranches: string[]): TsgitError {
    const similar = findSimilar(name, existingBranches);  // Levenshtein distance
    const suggestions: string[] = [];

    if (similar.length > 0) {
      suggestions.push(...similar.map(b => `tsgit checkout ${b}`));
    }
    suggestions.push(`tsgit branch create ${name}    # Create new branch`);

    return new TsgitError(
      `Branch '${name}' not found`,
      ErrorCode.BRANCH_NOT_FOUND,
      suggestions,
      { branch: name, similarBranches: similar }
    );
  },
};
```

**Example output**:
```
error: Branch 'featur' not found

hint: Did you mean one of these?
  tsgit checkout feature
  tsgit checkout features
  tsgit branch create featur    # Create new branch
```

The `findSimilar` function uses **Levenshtein distance** to find typo corrections:

```typescript
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  // ... dynamic programming implementation
  return matrix[b.length][a.length];
}
```

---

## Summary: Key Differences

| Aspect | Git | tsgit |
|--------|-----|-------|
| **Hash Algorithm** | SHA-1 (broken) | SHA-256 (default) |
| **Index Format** | Binary | JSON (human-readable) |
| **Large Files** | Git LFS (external) | Built-in chunking |
| **Undo** | Reflog (complex) | Simple `undo` command |
| **Branch Switching** | Manual stash | Auto-stash per branch |
| **Merge Conflicts** | Inline markers | Structured JSON |
| **Monorepo** | Sparse checkout (complex) | First-class scopes |
| **Error Messages** | Cryptic | Helpful with suggestions |
| **Visual UI** | External tools | Built-in TUI + Web UI |
| **Command Clarity** | `checkout` does 5 things | Dedicated `switch`/`restore` |

### Conceptual Equivalence

Despite the improvements, tsgit maintains conceptual compatibility with Git:

- Same object types (blob, tree, commit, tag)
- Same object format (`{type} {size}\0{content}`)
- Same compression (zlib)
- Same reference structure (`refs/heads/`, `refs/tags/`)
- Same tree sorting algorithm
- Same commit format

This means users familiar with Git internals can understand tsgit immediately, while benefiting from modern improvements.

### What's Intentionally Different

1. **SHA-256 by default**: Security over backwards compatibility
2. **JSON index**: Debuggability over raw performance
3. **Operation journal**: User-friendliness over minimal storage
4. **Branch state**: Convenience over explicit control
5. **Structured conflicts**: Toolability over plain text

### What's Not Yet Implemented

- Remote operations (push, pull, fetch, clone)
- Rebase
- Cherry-pick
- Hooks system
- Submodules
- Packfiles for storage optimization

---

## Appendix: Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                           CLI (cli.ts)                          │
├─────────────────────────────────────────────────────────────────┤
│                    Commands (commands/*.ts)                      │
│  init │ add │ commit │ status │ log │ diff │ branch │ merge... │
├─────────────────────────────────────────────────────────────────┤
│                    Repository (repository.ts)                    │
│    Main entry point for all operations                          │
├────────────┬────────────┬────────────┬──────────────────────────┤
│ ObjectStore│   Index    │    Refs    │   New Features           │
│ (objects)  │ (staging)  │ (branches) │                          │
├────────────┼────────────┼────────────┼──────────────────────────┤
│            │            │            │ Journal (undo/history)   │
│  Blob      │  Add/      │  HEAD      │ BranchState (auto-stash) │
│  Tree      │  Remove    │  Branches  │ MergeManager (conflicts) │
│  Commit    │  Status    │  Tags      │ ScopeManager (monorepo)  │
│  Tag       │            │            │ LargeFileHandler (chunks)│
├────────────┴────────────┴────────────┴──────────────────────────┤
│                     Utilities (utils/*.ts)                       │
│  hash (SHA-256) │ compression (zlib) │ fs (file operations)    │
├─────────────────────────────────────────────────────────────────┤
│                     Visual UI (ui/*.ts)                          │
│  TUI (terminal) │ Web UI (browser) │ Graph (ASCII art)         │
└─────────────────────────────────────────────────────────────────┘
```

This architecture provides a clean separation of concerns while maintaining the elegance of Git's original design.
