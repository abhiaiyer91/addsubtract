/**
 * Storage Object Store Adapter
 * 
 * Adapts our pluggable StorageBackend interface to work alongside the
 * existing ObjectStore. For local storage, we delegate to the original
 * ObjectStore. For remote storage, we use the async StorageBackend.
 */

import { ObjectType } from '../core/types';
import { ObjectStore } from '../core/object-store';
import { GitObject, Blob, Tree, Commit, Tag } from '../core/object';
import {
  StorageBackend,
  GitObjectType,
} from './types';

/**
 * Convert core ObjectType to storage GitObjectType
 */
function toGitObjectType(type: ObjectType): GitObjectType {
  return type as GitObjectType;
}

/**
 * Convert storage GitObjectType to core ObjectType
 */
function toObjectType(type: GitObjectType): ObjectType {
  return type as ObjectType;
}

/**
 * Storage-backed ObjectStore Adapter
 * 
 * Wraps a StorageBackend to provide async object operations.
 * Falls back to local ObjectStore for sync operations.
 */
export class StorageObjectStore {
  private localStore: ObjectStore;

  constructor(
    private backend: StorageBackend,
    private gitDir: string
  ) {
    // Always create a local store for fallback operations
    this.localStore = new ObjectStore(gitDir);
  }

  /**
   * Get the storage backend
   */
  getBackend(): StorageBackend {
    return this.backend;
  }

  /**
   * Check if using remote storage
   */
  isRemote(): boolean {
    return this.backend.type !== 'local';
  }

  // ===========================================================================
  // Sync Operations (delegate to local store)
  // ===========================================================================

  /**
   * Check if an object exists (sync)
   */
  hasObject(hash: string): boolean {
    return this.localStore.hasObject(hash);
  }

  /**
   * Read raw object (sync)
   */
  readRawObject(hash: string): { type: ObjectType; content: Buffer } {
    return this.localStore.readRawObject(hash);
  }

  /**
   * Read blob (sync)
   */
  readBlob(hash: string): Blob {
    return this.localStore.readBlob(hash);
  }

  /**
   * Read tree (sync)
   */
  readTree(hash: string): Tree {
    return this.localStore.readTree(hash);
  }

  /**
   * Read commit (sync)
   */
  readCommit(hash: string): Commit {
    return this.localStore.readCommit(hash);
  }

  /**
   * Read tag (sync)
   */
  readTag(hash: string): Tag {
    return this.localStore.readTag(hash);
  }

  /**
   * Read any object (sync)
   */
  readObject(hash: string): GitObject {
    return this.localStore.readObject(hash);
  }

  /**
   * Write raw object (sync)
   */
  writeRawObject(type: ObjectType, data: Buffer, expectedHash?: string): string {
    return this.localStore.writeRawObject(type, data, expectedHash);
  }

  /**
   * Write object (sync)
   */
  writeObject(obj: GitObject): string {
    return this.localStore.writeObject(obj);
  }

  /**
   * Write blob (sync)
   */
  writeBlob(content: Buffer): string {
    return this.localStore.writeBlob(content);
  }

  // ===========================================================================
  // Async Operations (use storage backend)
  // ===========================================================================

  /**
   * Check if an object exists (async)
   */
  async existsAsync(hash: string): Promise<boolean> {
    return this.backend.hasObject(hash);
  }

  /**
   * Read raw object (async)
   */
  async readAsync(hash: string): Promise<{ type: ObjectType; content: Buffer }> {
    const stored = await this.backend.readObject(hash);
    return {
      type: toObjectType(stored.type),
      content: stored.content,
    };
  }

  /**
   * Write object (async)
   */
  async writeAsync(type: ObjectType, content: Buffer): Promise<string> {
    return this.backend.writeObject({
      type: toGitObjectType(type),
      content,
    });
  }

  /**
   * Sync local objects to remote storage
   * Use this after a push to sync objects to cloud storage
   */
  async syncToRemote(hashes: string[]): Promise<{ synced: number; errors: string[] }> {
    if (!this.isRemote()) {
      return { synced: 0, errors: [] };
    }

    let synced = 0;
    const errors: string[] = [];

    for (const hash of hashes) {
      try {
        // Check if already in remote
        if (await this.backend.hasObject(hash)) {
          continue;
        }

        // Read from local
        const { type, content } = this.localStore.readRawObject(hash);

        // Write to remote
        await this.backend.writeObject({
          type: toGitObjectType(type),
          content,
        });

        synced++;
      } catch (error) {
        errors.push(`${hash}: ${(error as Error).message}`);
      }
    }

    return { synced, errors };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    objectCount: number;
    totalSizeBytes: number;
  }> {
    return this.backend.getStats();
  }

  /**
   * Close the storage backend
   */
  async close(): Promise<void> {
    return this.backend.close();
  }
}

// ===========================================================================
// Factory
// ===========================================================================

export function createStorageObjectStore(
  backend: StorageBackend,
  gitDir: string
): StorageObjectStore {
  return new StorageObjectStore(backend, gitDir);
}
