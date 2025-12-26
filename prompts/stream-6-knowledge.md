# Stream 6: Knowledge Primitive

## Mission

Build a **content-addressable key-value store** backed by Git objects. This provides persistent, versioned storage for agent facts, preferences, and learned information.

## Context

We have:

- **wit core** (`src/core/`) - Full Git implementation with object store, refs, etc.

We need a simple `Knowledge` class that any agent framework can use.

## API Design

```typescript
import { Knowledge } from "@wit/primitives";

const knowledge = new Knowledge("./agent-knowledge");

// Store any JSON-serializable value
const hash = await knowledge.set("user-prefs", {
  lang: "typescript",
  style: "functional",
});

// Retrieve by key
const prefs = await knowledge.get("user-prefs");
// => { lang: "typescript", style: "functional" }

// Check existence
const exists = await knowledge.has("user-prefs");
// => true

// List all keys
const keys = await knowledge.keys();
// => ["user-prefs", "project-context", ...]

// Delete a key
await knowledge.delete("user-prefs");

// Get with default
const theme = await knowledge.get("theme", { mode: "dark" });

// Atomic update
await knowledge.update("user-prefs", (current) => ({
  ...current,
  lastSeen: Date.now(),
}));

// Snapshot current state (returns commit hash)
const snapshot = await knowledge.snapshot("Checkpoint before experiment");

// Restore to a previous snapshot
await knowledge.restore(snapshot);

// Get history of a key
const history = await knowledge.history("user-prefs", 10);
// => [{ hash, value, timestamp }, ...]
```

## Key Deliverable

```
src/primitives/
├── index.ts           # Export Knowledge
├── knowledge.ts       # Main implementation
└── types.ts           # Shared types
```

## Implementation

```typescript
// src/primitives/knowledge.ts
import { Repository } from "../core/repository";
import * as path from "path";
import * as fs from "fs";

export interface KnowledgeOptions {
  /** Auto-commit after each write (default: true) */
  autoCommit?: boolean;
}

export interface HistoryEntry<T> {
  hash: string;
  value: T;
  timestamp: Date;
  message?: string;
}

export class Knowledge {
  private repo: Repository;
  private options: Required<KnowledgeOptions>;

  constructor(dir: string, options: KnowledgeOptions = {}) {
    this.options = {
      autoCommit: options.autoCommit ?? true,
    };

    // Initialize or open repository
    const gitDir = path.join(dir, ".wit");
    if (!fs.existsSync(gitDir)) {
      this.repo = Repository.init(dir);
    } else {
      this.repo = new Repository(dir);
    }
  }

  /**
   * Store a value under a key
   * @returns The content hash of the stored value
   */
  async set<T>(key: string, value: T): Promise<string> {
    this.validateKey(key);

    // Serialize to JSON
    const content = JSON.stringify(value, null, 2);

    // Write as a blob object
    const hash = this.repo.objects.writeBlob(content);

    // Update the ref
    const refPath = this.keyToRef(key);
    this.repo.refs.write(refPath, hash);

    // Auto-commit if enabled
    if (this.options.autoCommit) {
      await this.commit(`Set ${key}`);
    }

    return hash;
  }

  /**
   * Get a value by key
   * @returns The value, or defaultValue if not found
   */
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const refPath = this.keyToRef(key);
    const hash = this.repo.refs.read(refPath);

    if (!hash) {
      return defaultValue;
    }

    try {
      const content = this.repo.objects.readBlob(hash);
      return JSON.parse(content) as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Check if a key exists
   */
  async has(key: string): Promise<boolean> {
    const refPath = this.keyToRef(key);
    const hash = this.repo.refs.read(refPath);
    return hash !== null;
  }

  /**
   * Delete a key
   */
  async delete(key: string): Promise<boolean> {
    const refPath = this.keyToRef(key);
    const existed = this.repo.refs.read(refPath) !== null;

    if (existed) {
      this.repo.refs.delete(refPath);

      if (this.options.autoCommit) {
        await this.commit(`Delete ${key}`);
      }
    }

    return existed;
  }

  /**
   * List all keys
   */
  async keys(): Promise<string[]> {
    const prefix = "refs/knowledge/";
    const refs = this.repo.refs.list(prefix);
    return refs.map((ref) => ref.slice(prefix.length));
  }

  /**
   * Atomically update a value
   */
  async update<T>(
    key: string,
    updater: (current: T | undefined) => T
  ): Promise<string> {
    const current = await this.get<T>(key);
    const updated = updater(current);
    return this.set(key, updated);
  }

  /**
   * Get all key-value pairs
   */
  async entries<T = any>(): Promise<Map<string, T>> {
    const keys = await this.keys();
    const result = new Map<string, T>();

    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }

    return result;
  }

  /**
   * Create a snapshot (commit) of current state
   */
  async snapshot(message?: string): Promise<string> {
    return this.commit(message || "Knowledge snapshot");
  }

  /**
   * Restore to a previous snapshot
   */
  async restore(commitHash: string): Promise<void> {
    this.repo.reset(commitHash, "hard");
  }

  /**
   * Get history of changes to a key
   */
  async history<T>(key: string, limit = 10): Promise<HistoryEntry<T>[]> {
    const entries: HistoryEntry<T>[] = [];
    const refPath = this.keyToRef(key);

    // Walk commit history looking for changes to this key
    let current = this.repo.refs.resolve("HEAD");

    while (current && entries.length < limit) {
      const commit = this.repo.objects.readCommit(current);

      // Check if this key existed at this commit
      // (simplified - would need tree walking for full implementation)
      try {
        const value = await this.getAtCommit<T>(key, current);
        if (value !== undefined) {
          entries.push({
            hash: current,
            value,
            timestamp: new Date(commit.timestamp * 1000),
            message: commit.message,
          });
        }
      } catch {
        // Key didn't exist at this commit
      }

      current = commit.parentHashes[0] || null;
    }

    return entries;
  }

  /**
   * Clear all knowledge
   */
  async clear(): Promise<void> {
    const keys = await this.keys();
    for (const key of keys) {
      await this.delete(key);
    }
  }

  // Private helpers

  private keyToRef(key: string): string {
    // Sanitize key for use in ref path
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `refs/knowledge/${safe}`;
  }

  private validateKey(key: string): void {
    if (!key || typeof key !== "string") {
      throw new Error("Key must be a non-empty string");
    }
    if (key.length > 200) {
      throw new Error("Key must be 200 characters or less");
    }
  }

  private async commit(message: string): Promise<string> {
    // Write a simple commit tracking the knowledge state
    // This creates a commit even without staged files
    // by just updating HEAD
    return this.repo.commit(message);
  }

  private async getAtCommit<T>(
    key: string,
    commitHash: string
  ): Promise<T | undefined> {
    // Get value of key at a specific commit
    // Would need to reconstruct refs from tree
    // Simplified: just get current value
    return this.get<T>(key);
  }
}
```

## Export

```typescript
// src/primitives/index.ts
export {
  Knowledge,
  type KnowledgeOptions,
  type HistoryEntry,
} from "./knowledge";
```

## Tests

```typescript
// src/primitives/__tests__/knowledge.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Knowledge } from "../knowledge";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("Knowledge", () => {
  let tempDir: string;
  let knowledge: Knowledge;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-test-"));
    knowledge = new Knowledge(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should store and retrieve values", async () => {
    await knowledge.set("greeting", { message: "hello" });
    const value = await knowledge.get("greeting");
    expect(value).toEqual({ message: "hello" });
  });

  it("should return undefined for missing keys", async () => {
    const value = await knowledge.get("nonexistent");
    expect(value).toBeUndefined();
  });

  it("should return default value for missing keys", async () => {
    const value = await knowledge.get("missing", { default: true });
    expect(value).toEqual({ default: true });
  });

  it("should check key existence", async () => {
    expect(await knowledge.has("key")).toBe(false);
    await knowledge.set("key", "value");
    expect(await knowledge.has("key")).toBe(true);
  });

  it("should delete keys", async () => {
    await knowledge.set("key", "value");
    expect(await knowledge.has("key")).toBe(true);

    await knowledge.delete("key");
    expect(await knowledge.has("key")).toBe(false);
  });

  it("should list all keys", async () => {
    await knowledge.set("a", 1);
    await knowledge.set("b", 2);
    await knowledge.set("c", 3);

    const keys = await knowledge.keys();
    expect(keys.sort()).toEqual(["a", "b", "c"]);
  });

  it("should atomically update values", async () => {
    await knowledge.set("counter", { count: 0 });

    await knowledge.update("counter", (current: any) => ({
      count: (current?.count || 0) + 1,
    }));

    const value = await knowledge.get("counter");
    expect(value).toEqual({ count: 1 });
  });

  it("should create and restore snapshots", async () => {
    await knowledge.set("key", "value1");
    const snapshot = await knowledge.snapshot("Before change");

    await knowledge.set("key", "value2");
    expect(await knowledge.get("key")).toBe("value2");

    await knowledge.restore(snapshot);
    expect(await knowledge.get("key")).toBe("value1");
  });

  it("should handle complex nested objects", async () => {
    const complex = {
      name: "test",
      nested: { a: 1, b: [1, 2, 3] },
      date: "2025-12-25",
    };

    await knowledge.set("complex", complex);
    const retrieved = await knowledge.get("complex");
    expect(retrieved).toEqual(complex);
  });

  it("should get all entries", async () => {
    await knowledge.set("a", 1);
    await knowledge.set("b", 2);

    const entries = await knowledge.entries();
    expect(entries.get("a")).toBe(1);
    expect(entries.get("b")).toBe(2);
  });

  it("should clear all knowledge", async () => {
    await knowledge.set("a", 1);
    await knowledge.set("b", 2);

    await knowledge.clear();

    const keys = await knowledge.keys();
    expect(keys).toEqual([]);
  });
});
```

## Success Criteria

- [ ] `set(key, value)` stores JSON value as git blob
- [ ] `get(key)` retrieves value by key
- [ ] `has(key)` checks existence
- [ ] `delete(key)` removes key
- [ ] `keys()` lists all keys
- [ ] `update(key, fn)` atomically updates
- [ ] `snapshot()` creates a commit
- [ ] `restore(hash)` resets to snapshot
- [ ] `history(key)` shows value changes over time
- [ ] All operations are backed by git objects
- [ ] Tests pass

## Dependencies

- wit core (`src/core/repository.ts`, `src/core/object-store.ts`, `src/core/refs.ts`)
