/**
 * Storage Types
 * 
 * Defines the interface for storage backends.
 * This abstraction allows wit to store repositories on:
 * - Local disk (default for local development)
 * - Database (future: for hosted/cloud deployments)
 * - Object storage like S3 (future: for scalable deployments)
 */

import type { ObjectType } from '../types';

/**
 * Repository info returned by storage operations
 */
export interface StorageRepoInfo {
  /** Owner username */
  owner: string;
  /** Repository name (without .git suffix) */
  name: string;
  /** Full path or identifier for the repository */
  path: string;
  /** Whether this is a bare repository */
  bare: boolean;
  /** Default branch name */
  defaultBranch: string;
  /** When the repo was created */
  createdAt: Date;
}

/**
 * Options for creating a repository
 */
export interface CreateRepoOptions {
  /** Default branch name (default: 'main') */
  defaultBranch?: string;
  /** Description for the repository */
  description?: string;
  /** Whether to create as bare repository (default: true for server) */
  bare?: boolean;
}

/**
 * Git object data for storage
 */
export interface StorageObject {
  type: ObjectType;
  data: Buffer;
  hash: string;
}

/**
 * Reference data
 */
export interface StorageRef {
  name: string;
  hash: string;
  symbolic?: string; // For HEAD -> refs/heads/main
}

/**
 * Storage backend interface
 * 
 * Implementations must provide these methods to store git repositories.
 * The interface is designed to work with both filesystem-based and
 * database-based storage.
 */
export interface StorageBackend {
  /** Backend type identifier */
  readonly type: 'disk' | 'database' | 's3';

  // === Repository Operations ===

  /**
   * Create a new repository
   */
  createRepo(owner: string, name: string, options?: CreateRepoOptions): Promise<StorageRepoInfo>;

  /**
   * Check if a repository exists
   */
  repoExists(owner: string, name: string): Promise<boolean>;

  /**
   * Get repository info
   */
  getRepo(owner: string, name: string): Promise<StorageRepoInfo | null>;

  /**
   * List all repositories for an owner
   */
  listRepos(owner: string): Promise<StorageRepoInfo[]>;

  /**
   * Delete a repository
   */
  deleteRepo(owner: string, name: string): Promise<void>;

  /**
   * Fork a repository
   */
  forkRepo(
    sourceOwner: string,
    sourceName: string,
    targetOwner: string,
    targetName: string
  ): Promise<StorageRepoInfo>;

  // === Object Operations ===

  /**
   * Write a git object (blob, tree, commit, tag)
   */
  writeObject(owner: string, name: string, object: StorageObject): Promise<string>;

  /**
   * Read a git object by hash
   */
  readObject(owner: string, name: string, hash: string): Promise<StorageObject | null>;

  /**
   * Check if an object exists
   */
  hasObject(owner: string, name: string, hash: string): Promise<boolean>;

  /**
   * List all object hashes in a repository
   */
  listObjects(owner: string, name: string): Promise<string[]>;

  // === Reference Operations ===

  /**
   * Get a reference (branch, tag, HEAD)
   */
  getRef(owner: string, name: string, refName: string): Promise<StorageRef | null>;

  /**
   * Set/update a reference
   */
  setRef(owner: string, name: string, refName: string, hash: string): Promise<void>;

  /**
   * Set HEAD to symbolic reference
   */
  setSymbolicRef(owner: string, name: string, refName: string, target: string): Promise<void>;

  /**
   * Delete a reference
   */
  deleteRef(owner: string, name: string, refName: string): Promise<void>;

  /**
   * List all references
   */
  listRefs(owner: string, name: string): Promise<StorageRef[]>;

  /**
   * List branches
   */
  listBranches(owner: string, name: string): Promise<string[]>;

  /**
   * List tags
   */
  listTags(owner: string, name: string): Promise<string[]>;

  // === Utility ===

  /**
   * Get the path/identifier for direct access (if applicable)
   * For disk storage, returns the filesystem path.
   * For other backends, may return null or a URI.
   */
  getRepoPath(owner: string, name: string): string | null;

  /**
   * Health check - verify the backend is accessible
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  /** Storage backend type */
  type: 'disk' | 'database' | 's3';
  
  /** Disk storage options */
  disk?: {
    /** Base directory for repositories */
    projectsDir: string;
  };

  /** Database storage options (future) */
  database?: {
    /** Connection string */
    connectionString: string;
  };

  /** S3 storage options (future) */
  s3?: {
    /** S3 bucket name */
    bucket: string;
    /** AWS region */
    region: string;
    /** Optional endpoint for S3-compatible services */
    endpoint?: string;
  };
}
