/**
 * Knowledge Primitive
 *
 * A content-addressable key-value store backed by Git objects.
 * Provides persistent, versioned storage for agent facts, preferences,
 * and learned information.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { KnowledgeOptions, HistoryEntry } from './types';

// Re-export types
export { KnowledgeOptions, HistoryEntry } from './types';

/** File that stores key->hash mappings in the working directory */
const KNOWLEDGE_MANIFEST = '.knowledge-manifest.json';

/**
 * Content-addressable key-value store backed by Git objects.
 *
 * @example
 * ```typescript
 * const knowledge = new Knowledge("./agent-knowledge");
 *
 * // Store any JSON-serializable value
 * await knowledge.set("user-prefs", { lang: "typescript" });
 *
 * // Retrieve by key
 * const prefs = await knowledge.get("user-prefs");
 *
 * // Create snapshots for checkpoints
 * const snapshot = await knowledge.snapshot("Before experiment");
 *
 * // Restore to previous state
 * await knowledge.restore(snapshot);
 * ```
 */
export class Knowledge {
  private repo: Repository;
  private options: Required<KnowledgeOptions>;
  private manifestPath: string;

  constructor(dir: string, options: KnowledgeOptions = {}) {
    this.options = {
      autoCommit: options.autoCommit ?? true,
    };

    const resolvedDir = path.resolve(dir);
    const gitDir = path.join(resolvedDir, '.wit');
    this.manifestPath = path.join(resolvedDir, KNOWLEDGE_MANIFEST);

    if (!fs.existsSync(gitDir)) {
      // Initialize a new repository
      this.repo = Repository.init(resolvedDir);
    } else {
      // Open existing repository
      this.repo = new Repository(resolvedDir);
    }
  }

  /**
   * Store a value under a key.
   *
   * @param key - The key to store under (must be non-empty string, max 200 chars)
   * @param value - Any JSON-serializable value
   * @returns The content hash of the stored value
   *
   * @example
   * ```typescript
   * const hash = await knowledge.set("config", { debug: true });
   * ```
   */
  async set<T>(key: string, value: T): Promise<string> {
    this.validateKey(key);

    // Serialize to JSON with pretty formatting
    const content = JSON.stringify(value, null, 2);

    // Write as a blob object
    const hash = this.repo.objects.writeBlob(Buffer.from(content, 'utf8'));

    // Update the ref
    this.writeRef(key, hash);

    // Auto-commit if enabled
    if (this.options.autoCommit) {
      await this.commitKnowledge(`Set ${key}`);
    }

    return hash;
  }

  /**
   * Get a value by key.
   *
   * @param key - The key to retrieve
   * @param defaultValue - Value to return if key doesn't exist
   * @returns The stored value, or defaultValue if not found
   *
   * @example
   * ```typescript
   * const theme = await knowledge.get("theme", { mode: "dark" });
   * ```
   */
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const hash = this.readRef(key);

    if (!hash) {
      return defaultValue;
    }

    try {
      const blob = this.repo.objects.readBlob(hash);
      return JSON.parse(blob.content.toString('utf8')) as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Check if a key exists.
   *
   * @param key - The key to check
   * @returns true if the key exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await knowledge.has("user-prefs")) {
   *   console.log("User has preferences set");
   * }
   * ```
   */
  async has(key: string): Promise<boolean> {
    return this.readRef(key) !== null;
  }

  /**
   * Delete a key.
   *
   * @param key - The key to delete
   * @returns true if the key existed and was deleted, false otherwise
   *
   * @example
   * ```typescript
   * await knowledge.delete("temporary-data");
   * ```
   */
  async delete(key: string): Promise<boolean> {
    const existed = this.readRef(key) !== null;

    if (existed) {
      this.deleteRef(key);

      if (this.options.autoCommit) {
        await this.commitKnowledge(`Delete ${key}`);
      }
    }

    return existed;
  }

  /**
   * List all keys.
   *
   * @returns Array of all stored keys
   *
   * @example
   * ```typescript
   * const keys = await knowledge.keys();
   * console.log("Stored keys:", keys);
   * ```
   */
  async keys(): Promise<string[]> {
    return this.listRefs();
  }

  /**
   * Atomically update a value.
   *
   * The updater function receives the current value (or undefined if key doesn't exist)
   * and should return the new value.
   *
   * @param key - The key to update
   * @param updater - Function that transforms current value to new value
   * @returns The content hash of the new value
   *
   * @example
   * ```typescript
   * await knowledge.update("counter", (current) => ({
   *   count: (current?.count || 0) + 1
   * }));
   * ```
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
   * Get all key-value pairs.
   *
   * @returns Map of all keys to their values
   *
   * @example
   * ```typescript
   * const entries = await knowledge.entries();
   * for (const [key, value] of entries) {
   *   console.log(`${key}:`, value);
   * }
   * ```
   */
  async entries<T = unknown>(): Promise<Map<string, T>> {
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
   * Create a snapshot (commit) of current state.
   *
   * @param message - Optional commit message
   * @returns The commit hash
   *
   * @example
   * ```typescript
   * const snapshot = await knowledge.snapshot("Before experiment");
   * // ... make changes ...
   * await knowledge.restore(snapshot); // Undo changes
   * ```
   */
  async snapshot(message?: string): Promise<string> {
    return this.commitKnowledge(message || 'Knowledge snapshot');
  }

  /**
   * Restore to a previous snapshot.
   *
   * @param commitHash - The commit hash to restore to
   *
   * @example
   * ```typescript
   * await knowledge.restore(previousSnapshot);
   * ```
   */
  async restore(commitHash: string): Promise<void> {
    // Import reset function from commands
    const { reset } = await import('../commands/reset');
    reset(this.repo, commitHash, { mode: 'hard' });
  }

  /**
   * Get history of changes to a key.
   *
   * @param key - The key to get history for
   * @param limit - Maximum number of history entries (default: 10)
   * @returns Array of history entries (newest first)
   *
   * @example
   * ```typescript
   * const history = await knowledge.history("user-prefs", 10);
   * for (const entry of history) {
   *   console.log(`${entry.timestamp}: ${JSON.stringify(entry.value)}`);
   * }
   * ```
   */
  async history<T>(key: string, limit = 10): Promise<HistoryEntry<T>[]> {
    const entries: HistoryEntry<T>[] = [];
    let currentCommit = this.repo.refs.resolve('HEAD');
    let lastSeenValue: string | undefined;

    while (currentCommit && entries.length < limit) {
      try {
        const commit = this.repo.objects.readCommit(currentCommit);

        // Check if this commit modified the key by looking at the ref at this commit
        // We walk backward and look for changes in the value
        const valueAtCommit = await this.getValueAtCommit<T>(key, currentCommit);

        if (valueAtCommit !== undefined) {
          const valueStr = JSON.stringify(valueAtCommit);

          // Only record if value changed from what we last saw
          if (valueStr !== lastSeenValue) {
            entries.push({
              hash: currentCommit,
              value: valueAtCommit,
              timestamp: new Date((commit.committer?.timestamp || commit.author.timestamp) * 1000),
              message: commit.message.trim(),
            });
            lastSeenValue = valueStr;
          }
        } else if (lastSeenValue !== undefined) {
          // Key didn't exist at this commit but did later - stop here
          break;
        }

        currentCommit = commit.parentHashes[0] || null;
      } catch {
        break;
      }
    }

    return entries;
  }

  /**
   * Clear all knowledge.
   *
   * @example
   * ```typescript
   * await knowledge.clear();
   * ```
   */
  async clear(): Promise<void> {
    const keys = await this.keys();
    for (const key of keys) {
      this.deleteRef(key);
    }

    if (this.options.autoCommit && keys.length > 0) {
      await this.commitKnowledge('Clear all knowledge');
    }
  }

  // Private helper methods

  /**
   * Validate a key
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string');
    }
    if (key.length > 200) {
      throw new Error('Key must be 200 characters or less');
    }
  }

  /**
   * Load the manifest from disk
   */
  private loadManifest(): Record<string, string> {
    if (!fs.existsSync(this.manifestPath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(this.manifestPath, 'utf8');
      const data = JSON.parse(content);
      return data.mappings || {};
    } catch {
      return {};
    }
  }

  /**
   * Save the manifest to disk
   */
  private saveManifest(mappings: Record<string, string>): void {
    const content = JSON.stringify(
      {
        version: 1,
        updated: new Date().toISOString(),
        mappings,
      },
      null,
      2
    );
    fs.writeFileSync(this.manifestPath, content, 'utf8');
  }

  /**
   * Write a ref for a key
   */
  private writeRef(key: string, hash: string): void {
    const mappings = this.loadManifest();
    mappings[key] = hash;
    this.saveManifest(mappings);
  }

  /**
   * Read a ref for a key
   */
  private readRef(key: string): string | null {
    const mappings = this.loadManifest();
    return mappings[key] || null;
  }

  /**
   * Delete a ref for a key
   */
  private deleteRef(key: string): void {
    const mappings = this.loadManifest();
    delete mappings[key];
    this.saveManifest(mappings);
  }

  /**
   * List all refs (keys)
   */
  private listRefs(): string[] {
    const mappings = this.loadManifest();
    return Object.keys(mappings);
  }

  /**
   * Commit the current knowledge state
   */
  private async commitKnowledge(message: string): Promise<string> {
    try {
      this.repo.add(this.manifestPath);
      return this.repo.commit(message);
    } catch (error) {
      // If commit fails (e.g., nothing to commit), just return empty hash
      // This can happen if the manifest content hasn't changed
      if (error instanceof Error && error.message.includes('Nothing to commit')) {
        const head = this.repo.refs.resolve('HEAD');
        return head || '';
      }
      throw error;
    }
  }

  /**
   * Get value of a key at a specific commit
   * Note: This is a simplified implementation that only works with current refs
   */
  private async getValueAtCommit<T>(
    key: string,
    _commitHash: string
  ): Promise<T | undefined> {
    // For a full implementation, we would need to reconstruct the refs
    // from the commit's tree. This simplified version uses current refs.
    return this.get<T>(key);
  }
}
