# Stream 7: Filesystem Primitive

## Mission

Build a **Git-backed virtual filesystem** that provides file operations with built-in versioning, branching, and rollback. This gives agents a workspace where every change is tracked.

## Context

We have:

- **wit core** (`src/core/`) - Full Git implementation with repository, index, refs, etc.

We need a simple `Filesystem` class that wraps file operations with Git semantics.

## API Design

```typescript
import { Filesystem } from "@wit/primitives";

const fs = new Filesystem("./agent-workspace");

// === File Operations ===

// Read file
const content = await fs.read("src/index.ts");

// Write file (creates directories automatically)
await fs.write("src/utils/helper.ts", "export function helper() {}");

// Append to file
await fs.append("log.txt", "New log entry\n");

// Delete file
await fs.delete("old-file.ts");

// Check existence
const exists = await fs.exists("src/index.ts");

// === Directory Operations ===

// List directory
const entries = await fs.list("src/");
// => [{ name: "index.ts", type: "file" }, { name: "utils", type: "dir" }]

// List recursively
const allFiles = await fs.listRecursive("src/");

// Create directory
await fs.mkdir("src/components");

// Delete directory
await fs.rmdir("src/old");

// === Git Operations ===

// Commit all changes
const hash = await fs.commit("Added helper function");

// Rollback last commit
await fs.rollback();

// Reset to specific commit
await fs.reset(commitHash);

// Get uncommitted changes
const changes = await fs.status();
// => [{ path: "src/index.ts", status: "modified" }, ...]

// Get diff of uncommitted changes
const diff = await fs.diff();

// Get commit history
const history = await fs.log(10);

// === Branching ===

// Create branch
await fs.branch("experiment");

// Switch branch
await fs.checkout("experiment");

// Get current branch
const branch = await fs.currentBranch();

// List branches
const branches = await fs.branches();

// Merge branch
await fs.merge("experiment");

// Delete branch
await fs.deleteBranch("experiment");

// === Utilities ===

// Copy file
await fs.copy("src/a.ts", "src/b.ts");

// Move/rename file
await fs.move("old.ts", "new.ts");

// Get file info
const info = await fs.stat("src/index.ts");
// => { size: 1234, modified: Date, type: "file" }

// Search files by glob
const tsFiles = await fs.glob("**/*.ts");
```

## Key Deliverable

```
src/primitives/
├── index.ts           # Export Filesystem
├── filesystem.ts      # Main implementation
└── types.ts           # Shared types
```

## Implementation

```typescript
// src/primitives/filesystem.ts
import { Repository } from "../core/repository";
import * as path from "path";
import * as fs from "fs";
import { glob } from "glob";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

export interface FileStatus {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
}

export interface FileStat {
  size: number;
  modified: Date;
  created: Date;
  type: "file" | "dir";
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: Date;
}

export class Filesystem {
  private repo: Repository;
  readonly workDir: string;

  constructor(dir: string) {
    this.workDir = path.resolve(dir);

    // Initialize or open repository
    const gitDir = path.join(this.workDir, ".wit");
    if (!fs.existsSync(gitDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
      this.repo = Repository.init(this.workDir);
    } else {
      this.repo = new Repository(this.workDir);
    }
  }

  // === File Operations ===

  /**
   * Read file contents
   */
  async read(filePath: string): Promise<string | null> {
    const fullPath = this.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fs.readFileSync(fullPath, "utf-8");
  }

  /**
   * Read file as buffer (for binary files)
   */
  async readBuffer(filePath: string): Promise<Buffer | null> {
    const fullPath = this.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fs.readFileSync(fullPath);
  }

  /**
   * Write file (creates parent directories)
   */
  async write(filePath: string, content: string | Buffer): Promise<void> {
    const fullPath = this.resolve(filePath);
    const dir = path.dirname(fullPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  /**
   * Append to file
   */
  async append(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolve(filePath);
    const dir = path.dirname(fullPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(fullPath, content);
  }

  /**
   * Delete file
   */
  async delete(filePath: string): Promise<boolean> {
    const fullPath = this.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      return false;
    }
    fs.unlinkSync(fullPath);
    return true;
  }

  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolve(filePath);
    return fs.existsSync(fullPath);
  }

  // === Directory Operations ===

  /**
   * List directory contents
   */
  async list(dirPath: string = "."): Promise<FileEntry[]> {
    const fullPath = this.resolve(dirPath);
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        type: e.isDirectory() ? ("dir" as const) : ("file" as const),
      }));
  }

  /**
   * List all files recursively
   */
  async listRecursive(dirPath: string = "."): Promise<FileEntry[]> {
    const results: FileEntry[] = [];

    const walk = async (dir: string) => {
      const entries = await this.list(dir);
      for (const entry of entries) {
        results.push(entry);
        if (entry.type === "dir") {
          await walk(entry.path);
        }
      }
    };

    await walk(dirPath);
    return results;
  }

  /**
   * Create directory
   */
  async mkdir(dirPath: string): Promise<void> {
    const fullPath = this.resolve(dirPath);
    fs.mkdirSync(fullPath, { recursive: true });
  }

  /**
   * Remove directory
   */
  async rmdir(dirPath: string): Promise<boolean> {
    const fullPath = this.resolve(dirPath);
    if (!fs.existsSync(fullPath)) {
      return false;
    }
    fs.rmSync(fullPath, { recursive: true, force: true });
    return true;
  }

  // === Git Operations ===

  /**
   * Commit all changes
   */
  async commit(message: string): Promise<string> {
    // Stage all changes
    this.repo.index.addAll();

    // Commit
    return this.repo.commit(message);
  }

  /**
   * Rollback last commit (keeps files, undoes commit)
   */
  async rollback(): Promise<void> {
    const head = this.repo.refs.resolve("HEAD");
    if (!head) return;

    const commit = this.repo.objects.readCommit(head);
    if (commit.parentHashes[0]) {
      this.repo.reset(commit.parentHashes[0], "soft");
    }
  }

  /**
   * Hard reset to a specific commit
   */
  async reset(commitHash: string): Promise<void> {
    this.repo.reset(commitHash, "hard");
  }

  /**
   * Get uncommitted changes
   */
  async status(): Promise<FileStatus[]> {
    const status = this.repo.status();
    const results: FileStatus[] = [];

    for (const [file, state] of Object.entries(status.staged)) {
      results.push({ path: file, status: state as any });
    }
    for (const [file, state] of Object.entries(status.unstaged)) {
      if (!results.find((r) => r.path === file)) {
        results.push({ path: file, status: state as any });
      }
    }
    for (const file of status.untracked) {
      results.push({ path: file, status: "untracked" });
    }

    return results;
  }

  /**
   * Get diff of uncommitted changes
   */
  async diff(): Promise<string> {
    return this.repo.diff();
  }

  /**
   * Get commit history
   */
  async log(limit = 10): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];
    let current = this.repo.refs.resolve("HEAD");

    while (current && commits.length < limit) {
      const commit = this.repo.objects.readCommit(current);
      commits.push({
        hash: current,
        message: commit.message,
        author: commit.author,
        date: new Date(commit.timestamp * 1000),
      });
      current = commit.parentHashes[0] || null;
    }

    return commits;
  }

  // === Branching ===

  /**
   * Create a new branch
   */
  async branch(name: string): Promise<void> {
    const head = this.repo.refs.resolve("HEAD");
    if (head) {
      this.repo.refs.createBranch(name, head);
    }
  }

  /**
   * Switch to a branch
   */
  async checkout(name: string): Promise<void> {
    this.repo.checkout(name);
  }

  /**
   * Get current branch name
   */
  async currentBranch(): Promise<string | null> {
    return this.repo.refs.getCurrentBranch();
  }

  /**
   * List all branches
   */
  async branches(): Promise<string[]> {
    return this.repo.refs.listBranches();
  }

  /**
   * Merge a branch into current
   */
  async merge(branchName: string): Promise<{ success: boolean; conflicts?: string[] }> {
    try {
      this.repo.merge(branchName);
      return { success: true };
    } catch (error: any) {
      if (error.conflicts) {
        return { success: false, conflicts: error.conflicts };
      }
      throw error;
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(name: string): Promise<void> {
    this.repo.refs.deleteBranch(name);
  }

  // === Utilities ===

  /**
   * Copy a file
   */
  async copy(src: string, dest: string): Promise<void> {
    const content = await this.read(src);
    if (content !== null) {
      await this.write(dest, content);
    }
  }

  /**
   * Move/rename a file
   */
  async move(src: string, dest: string): Promise<void> {
    const srcPath = this.resolve(src);
    const destPath = this.resolve(dest);

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.renameSync(srcPath, destPath);
  }

  /**
   * Get file stats
   */
  async stat(filePath: string): Promise<FileStat | null> {
    const fullPath = this.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const stats = fs.statSync(fullPath);
    return {
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
      type: stats.isDirectory() ? "dir" : "file",
    };
  }

  /**
   * Find files matching a glob pattern
   */
  async glob(pattern: string): Promise<string[]> {
    const matches = await glob(pattern, {
      cwd: this.workDir,
      ignore: ["**/node_modules/**", "**/.wit/**"],
    });
    return matches;
  }

  // === Private Helpers ===

  private resolve(filePath: string): string {
    // Prevent path traversal
    const resolved = path.resolve(this.workDir, filePath);
    if (!resolved.startsWith(this.workDir)) {
      throw new Error("Path traversal not allowed");
    }
    return resolved;
  }
}
```

## Export

```typescript
// src/primitives/index.ts
export { Knowledge } from "./knowledge";
export {
  Filesystem,
  type FileEntry,
  type FileStatus,
  type FileStat,
  type CommitInfo,
} from "./filesystem";
```

## Tests

```typescript
// src/primitives/__tests__/filesystem.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Filesystem } from "../filesystem";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("Filesystem", () => {
  let tempDir: string;
  let filesystem: Filesystem;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-test-"));
    filesystem = new Filesystem(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("File Operations", () => {
    it("should write and read files", async () => {
      await filesystem.write("test.txt", "hello world");
      const content = await filesystem.read("test.txt");
      expect(content).toBe("hello world");
    });

    it("should create parent directories", async () => {
      await filesystem.write("a/b/c/deep.txt", "deep content");
      const content = await filesystem.read("a/b/c/deep.txt");
      expect(content).toBe("deep content");
    });

    it("should return null for missing files", async () => {
      const content = await filesystem.read("nonexistent.txt");
      expect(content).toBeNull();
    });

    it("should append to files", async () => {
      await filesystem.write("log.txt", "line1\n");
      await filesystem.append("log.txt", "line2\n");
      const content = await filesystem.read("log.txt");
      expect(content).toBe("line1\nline2\n");
    });

    it("should delete files", async () => {
      await filesystem.write("test.txt", "content");
      expect(await filesystem.exists("test.txt")).toBe(true);

      await filesystem.delete("test.txt");
      expect(await filesystem.exists("test.txt")).toBe(false);
    });

    it("should check file existence", async () => {
      expect(await filesystem.exists("test.txt")).toBe(false);
      await filesystem.write("test.txt", "content");
      expect(await filesystem.exists("test.txt")).toBe(true);
    });
  });

  describe("Directory Operations", () => {
    it("should list directory contents", async () => {
      await filesystem.write("a.txt", "a");
      await filesystem.write("b.txt", "b");
      await filesystem.mkdir("subdir");

      const entries = await filesystem.list(".");
      const names = entries.map((e) => e.name).sort();
      expect(names).toContain("a.txt");
      expect(names).toContain("b.txt");
      expect(names).toContain("subdir");
    });

    it("should list files recursively", async () => {
      await filesystem.write("a.txt", "a");
      await filesystem.write("sub/b.txt", "b");
      await filesystem.write("sub/deep/c.txt", "c");

      const entries = await filesystem.listRecursive(".");
      const paths = entries.map((e) => e.path);
      expect(paths).toContain("a.txt");
      expect(paths).toContain("sub/b.txt");
      expect(paths).toContain("sub/deep/c.txt");
    });

    it("should create and remove directories", async () => {
      await filesystem.mkdir("newdir");
      expect(await filesystem.exists("newdir")).toBe(true);

      await filesystem.rmdir("newdir");
      expect(await filesystem.exists("newdir")).toBe(false);
    });
  });

  describe("Git Operations", () => {
    it("should commit changes", async () => {
      await filesystem.write("file.txt", "content");
      const hash = await filesystem.commit("Initial commit");
      expect(hash).toMatch(/^[a-f0-9]{40}$/);
    });

    it("should show commit history", async () => {
      await filesystem.write("file.txt", "v1");
      await filesystem.commit("First commit");

      await filesystem.write("file.txt", "v2");
      await filesystem.commit("Second commit");

      const log = await filesystem.log(10);
      expect(log.length).toBeGreaterThanOrEqual(2);
      expect(log[0].message).toBe("Second commit");
      expect(log[1].message).toBe("First commit");
    });

    it("should rollback last commit", async () => {
      await filesystem.write("file.txt", "v1");
      await filesystem.commit("First");

      await filesystem.write("file.txt", "v2");
      await filesystem.commit("Second");

      await filesystem.rollback();

      const log = await filesystem.log(10);
      expect(log[0].message).toBe("First");
    });

    it("should reset to specific commit", async () => {
      await filesystem.write("file.txt", "v1");
      const hash1 = await filesystem.commit("First");

      await filesystem.write("file.txt", "v2");
      await filesystem.commit("Second");

      await filesystem.reset(hash1);

      const content = await filesystem.read("file.txt");
      expect(content).toBe("v1");
    });
  });

  describe("Branching", () => {
    it("should create and list branches", async () => {
      await filesystem.write("file.txt", "content");
      await filesystem.commit("Initial");

      await filesystem.branch("feature");

      const branches = await filesystem.branches();
      expect(branches).toContain("main");
      expect(branches).toContain("feature");
    });

    it("should switch branches", async () => {
      await filesystem.write("file.txt", "main content");
      await filesystem.commit("Main commit");

      await filesystem.branch("feature");
      await filesystem.checkout("feature");

      await filesystem.write("file.txt", "feature content");
      await filesystem.commit("Feature commit");

      await filesystem.checkout("main");
      const content = await filesystem.read("file.txt");
      expect(content).toBe("main content");
    });

    it("should get current branch", async () => {
      const branch = await filesystem.currentBranch();
      expect(branch).toBe("main");
    });
  });

  describe("Utilities", () => {
    it("should copy files", async () => {
      await filesystem.write("src.txt", "content");
      await filesystem.copy("src.txt", "dest.txt");

      const content = await filesystem.read("dest.txt");
      expect(content).toBe("content");
    });

    it("should move files", async () => {
      await filesystem.write("old.txt", "content");
      await filesystem.move("old.txt", "new.txt");

      expect(await filesystem.exists("old.txt")).toBe(false);
      expect(await filesystem.read("new.txt")).toBe("content");
    });

    it("should get file stats", async () => {
      await filesystem.write("file.txt", "hello");
      const stat = await filesystem.stat("file.txt");

      expect(stat).not.toBeNull();
      expect(stat!.size).toBe(5);
      expect(stat!.type).toBe("file");
    });

    it("should prevent path traversal", async () => {
      await expect(filesystem.read("../../../etc/passwd")).rejects.toThrow(
        "Path traversal not allowed"
      );
    });
  });
});
```

## Success Criteria

- [ ] `read/write/append/delete` work correctly
- [ ] `list/listRecursive/mkdir/rmdir` work correctly
- [ ] `commit` stages all changes and commits
- [ ] `rollback` undoes last commit
- [ ] `reset` restores to specific commit
- [ ] `status` shows uncommitted changes
- [ ] `log` shows commit history
- [ ] `branch/checkout/merge` work correctly
- [ ] `copy/move/stat` utilities work
- [ ] Path traversal is prevented
- [ ] All operations are backed by git
- [ ] Tests pass

## Dependencies

- wit core (`src/core/repository.ts`, `src/core/index.ts`, `src/core/refs.ts`)
- glob package for file matching

