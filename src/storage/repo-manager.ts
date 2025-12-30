/**
 * Storage-Aware Repository Manager
 * 
 * Manages bare repositories with configurable storage backends.
 * Repositories can use local disk, S3, R2, or other backends
 * based on their configuration in the database.
 */

import * as path from 'path';
import * as fs from 'fs';
import { exists, mkdirp } from '../utils/fs';
import { getDb, isConnected } from '../db';
import { repositories } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import {
  StorageBackend,
  StorageBackendType,
} from './types';
import { getStorageBackendByName, invalidateBackendCache } from './factory';
import { StorageObjectStore, createStorageObjectStore } from './object-store-adapter';
import { ObjectStore } from '../core/object-store';
import { Refs } from '../core/refs';
import { Tree, Commit, Blob } from '../core/object';

// ===========================================================================
// Types
// ===========================================================================

export interface RepoInfo {
  owner: string;
  name: string;
  path: string;
  bare: boolean;
  storageBackend?: StorageBackendType;
}

export class StorageError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'StorageError';
  }
}

// ===========================================================================
// Storage-Aware Bare Repository
// ===========================================================================

/**
 * A bare repository that can use remote storage backends
 */
export class StorageAwareBareRepository {
  readonly gitDir: string;
  readonly owner: string;
  readonly name: string;
  
  private _objectStore: StorageObjectStore | null = null;
  private _localObjectStore: ObjectStore;
  private _refs: Refs;
  private _backend: StorageBackend | null = null;
  private _backendType: StorageBackendType;

  constructor(
    repoPath: string,
    owner: string,
    name: string,
    backendType: StorageBackendType = 'local'
  ) {
    this.gitDir = repoPath;
    this.owner = owner;
    this.name = name;
    this._backendType = backendType;
    
    // Always have local refs (refs are always stored locally)
    this._refs = new Refs(repoPath);
    
    // Create local object store for fallback/hybrid operations
    this._localObjectStore = new ObjectStore(repoPath);
  }

  /**
   * Initialize the storage backend
   */
  async initStorage(backend?: StorageBackend): Promise<void> {
    if (backend) {
      this._backend = backend;
    } else if (this._backendType !== 'local') {
      // Get backend from factory
      try {
        this._backend = await getStorageBackendByName(this.owner, this.name);
      } catch (error) {
        console.warn(`[StorageAwareBareRepository] Failed to get storage backend, using local: ${(error as Error).message}`);
        this._backend = null;
      }
    }
    
    if (this._backend) {
      this._objectStore = createStorageObjectStore(this._backend, this.gitDir);
    }
  }

  /**
   * Get the object store (async - may need to initialize)
   */
  async getObjectStore(): Promise<StorageObjectStore | ObjectStore> {
    if (this._objectStore) {
      return this._objectStore;
    }
    
    // If we haven't initialized storage yet, try now
    if (this._backendType !== 'local' && !this._backend) {
      await this.initStorage();
    }
    
    return this._objectStore || this._localObjectStore;
  }

  /**
   * Get the local object store (synchronous, always available)
   */
  get objects(): ObjectStore {
    return this._localObjectStore;
  }

  /**
   * Get refs manager
   */
  get refs(): Refs {
    return this._refs;
  }

  /**
   * Get storage backend type
   */
  get storageBackend(): StorageBackendType {
    return this._backendType;
  }

  /**
   * Check if this is a valid bare repository
   */
  isValid(): boolean {
    return exists(path.join(this.gitDir, 'objects')) || this._backend !== null;
  }

  /**
   * Read an object (async, uses configured backend)
   */
  async readObjectAsync(hash: string): Promise<{ type: string; content: Buffer }> {
    const store = await this.getObjectStore();
    
    if (store instanceof StorageObjectStore) {
      return store.readAsync(hash);
    }
    
    // Local store - use readRawObject
    return store.readRawObject(hash);
  }

  /**
   * Write an object (async, uses configured backend)
   */
  async writeObjectAsync(type: 'blob' | 'tree' | 'commit' | 'tag', content: Buffer): Promise<string> {
    const store = await this.getObjectStore();
    
    if (store instanceof StorageObjectStore) {
      return store.writeAsync(type, content);
    }
    
    // Local store - use writeRawObject
    return store.writeRawObject(type, content);
  }

  /**
   * Check if an object exists (async)
   */
  async hasObjectAsync(hash: string): Promise<boolean> {
    const store = await this.getObjectStore();
    
    if (store instanceof StorageObjectStore) {
      return store.existsAsync(hash);
    }
    
    // Local store
    return store.hasObject(hash);
  }

  /**
   * Read a blob
   */
  async readBlob(hash: string): Promise<Blob> {
    const store = await this.getObjectStore();
    
    if (store instanceof StorageObjectStore) {
      return store.readBlob(hash);
    }
    
    return store.readBlob(hash);
  }

  /**
   * Read a tree
   */
  async readTree(hash: string): Promise<Tree> {
    const store = await this.getObjectStore();
    
    if (store instanceof StorageObjectStore) {
      return store.readTree(hash);
    }
    
    return store.readTree(hash);
  }

  /**
   * Read a commit
   */
  async readCommit(hash: string): Promise<Commit> {
    const store = await this.getObjectStore();
    
    if (store instanceof StorageObjectStore) {
      return store.readCommit(hash);
    }
    
    return store.readCommit(hash);
  }

  /**
   * Get file content at a specific ref
   */
  async getFileAtRef(ref: string, filePath: string): Promise<Buffer | null> {
    const hash = this.refs.resolve(ref);
    if (!hash) return null;

    const commit = await this.readCommit(hash);
    const blobHash = await this.findBlobInTreeByPath(commit.treeHash, filePath.split('/'));

    if (!blobHash) return null;

    const blob = await this.readBlob(blobHash);
    return blob.content;
  }

  /**
   * Find a blob in a tree by path
   */
  private async findBlobInTreeByPath(treeHash: string, pathParts: string[]): Promise<string | null> {
    const tree = await this.readTree(treeHash);

    for (const entry of tree.entries) {
      if (entry.name === pathParts[0]) {
        if (pathParts.length === 1) {
          return entry.mode === '40000' ? null : entry.hash;
        }
        if (entry.mode === '40000') {
          return this.findBlobInTreeByPath(entry.hash, pathParts.slice(1));
        }
      }
    }

    return null;
  }

  /**
   * List all branches
   */
  listBranches(): string[] {
    return this.refs.listBranches();
  }

  /**
   * List all tags
   */
  listTags(): string[] {
    return this.refs.listTags();
  }

  /**
   * Get HEAD hash
   */
  getHeadHash(): string | null {
    const head = this.refs.getHead();
    if (head.isSymbolic) {
      return this.refs.resolve(head.target);
    }
    return head.target;
  }

  /**
   * Create or update a branch
   */
  updateBranch(name: string, hash: string): void {
    if (this.refs.branchExists(name)) {
      this.refs.updateBranch(name, hash);
    } else {
      this.refs.createBranch(name, hash);
    }
  }

  /**
   * Delete a branch
   */
  deleteBranch(name: string): void {
    if (this.refs.branchExists(name)) {
      this.refs.deleteBranch(name);
    }
  }

  /**
   * Close the storage backend
   */
  async close(): Promise<void> {
    if (this._objectStore) {
      await this._objectStore.close();
    }
    invalidateBackendCache(`${this.owner}/${this.name}`);
  }
}

// ===========================================================================
// Storage-Aware Repository Manager
// ===========================================================================

/**
 * Repository manager that supports configurable storage backends
 */
export class StorageAwareRepoManager {
  private repoCache: Map<string, StorageAwareBareRepository> = new Map();

  constructor(private baseDir: string) {
    // Ensure base directory exists
    mkdirp(this.baseDir);
  }

  /**
   * Get the full path for a repository
   */
  private getRepoPath(owner: string, name: string): string {
    let repoName = name;
    if (repoName.endsWith('.wit')) {
      repoName = repoName.slice(0, -4) + '.git';
    } else if (!repoName.endsWith('.git')) {
      repoName = `${repoName}.git`;
    }
    return path.join(this.baseDir, owner, repoName);
  }

  /**
   * Get or create a repository
   */
  async getRepo(
    owner: string,
    name: string,
    autoCreate: boolean = true
  ): Promise<StorageAwareBareRepository | null> {
    const repoPath = this.getRepoPath(owner, name);
    const cacheKey = `${owner}/${name}`;

    // Check cache first
    if (this.repoCache.has(cacheKey)) {
      return this.repoCache.get(cacheKey)!;
    }

    // Try to get storage config from database
    let backendType: StorageBackendType = 'local';
    let backend: StorageBackend | undefined;
    
    if (await isConnected()) {
      try {
        const db = getDb();
        const [dbRepo] = await db
          .select({
            storageBackend: repositories.storageBackend,
            storageConfig: repositories.storageConfig,
          })
          .from(repositories)
          .where(and(
            eq(repositories.ownerId, owner),
            eq(repositories.name, name.replace(/\.(wit|git)$/, ''))
          ))
          .limit(1);

        if (dbRepo) {
          backendType = dbRepo.storageBackend;
          
          if (backendType !== 'local') {
            backend = await getStorageBackendByName(owner, name);
          }
        }
      } catch (error) {
        console.warn(`[StorageAwareRepoManager] Failed to get repo config: ${(error as Error).message}`);
      }
    }

    // Check if repo exists locally
    const localExists = exists(repoPath) && exists(path.join(repoPath, 'objects'));

    // For remote backends, we might not have local objects dir
    if (localExists || backend) {
      const repo = new StorageAwareBareRepository(repoPath, owner, name, backendType);
      await repo.initStorage(backend);
      
      if (repo.isValid()) {
        this.repoCache.set(cacheKey, repo);
        return repo;
      }
    }

    // Auto-create if enabled
    if (autoCreate) {
      const repo = await this.initBareRepo(owner, name);
      this.repoCache.set(cacheKey, repo);
      return repo;
    }

    return null;
  }

  /**
   * Get repository synchronously (for backward compatibility)
   * Only works reliably for local storage
   */
  getRepoSync(owner: string, name: string, autoCreate: boolean = true): StorageAwareBareRepository | null {
    const repoPath = this.getRepoPath(owner, name);
    const cacheKey = `${owner}/${name}`;

    // Check cache first
    if (this.repoCache.has(cacheKey)) {
      return this.repoCache.get(cacheKey)!;
    }

    // Check if repo exists
    if (exists(repoPath) && exists(path.join(repoPath, 'objects'))) {
      const repo = new StorageAwareBareRepository(repoPath, owner, name, 'local');
      this.repoCache.set(cacheKey, repo);
      return repo;
    }

    // Auto-create if enabled (sync version only creates local)
    if (autoCreate) {
      const repo = this.initBareRepoSync(owner, name);
      this.repoCache.set(cacheKey, repo);
      return repo;
    }

    return null;
  }

  /**
   * Initialize a new bare repository
   */
  async initBareRepo(owner: string, name: string): Promise<StorageAwareBareRepository> {
    return this.initBareRepoSync(owner, name);
  }

  /**
   * Initialize a new bare repository (sync)
   */
  initBareRepoSync(owner: string, name: string): StorageAwareBareRepository {
    const repoPath = this.getRepoPath(owner, name);

    if (exists(repoPath)) {
      throw new StorageError(`Repository already exists: ${owner}/${name}`, 'REPO_EXISTS');
    }

    // Create owner directory
    const ownerDir = path.join(this.baseDir, owner);
    mkdirp(ownerDir);

    // Create repository directory structure (bare repo)
    mkdirp(repoPath);
    mkdirp(path.join(repoPath, 'objects'));
    mkdirp(path.join(repoPath, 'refs', 'heads'));
    mkdirp(path.join(repoPath, 'refs', 'tags'));
    mkdirp(path.join(repoPath, 'info'));

    // Write HEAD pointing to main branch
    fs.writeFileSync(path.join(repoPath, 'HEAD'), 'ref: refs/heads/main\n');

    // Write config for bare repository
    const config = `[core]
    repositoryformatversion = 0
    filemode = true
    bare = true
[wit]
    hashAlgorithm = sha1
`;
    fs.writeFileSync(path.join(repoPath, 'config'), config);

    // Write description
    fs.writeFileSync(
      path.join(repoPath, 'description'),
      `${owner}/${name} repository\n`
    );

    console.log(`[StorageAwareRepoManager] Initialized bare repository: ${owner}/${name}`);

    return new StorageAwareBareRepository(repoPath, owner, name, 'local');
  }

  /**
   * Check if a repository exists
   */
  async exists(owner: string, name: string): Promise<boolean> {
    const repoPath = this.getRepoPath(owner, name);
    
    // Check local
    if (exists(repoPath) && exists(path.join(repoPath, 'objects'))) {
      return true;
    }
    
    // Check database for remote storage config
    if (await isConnected()) {
      try {
        const db = getDb();
        const [dbRepo] = await db
          .select({ id: repositories.id })
          .from(repositories)
          .where(and(
            eq(repositories.ownerId, owner),
            eq(repositories.name, name.replace(/\.(wit|git)$/, ''))
          ))
          .limit(1);

        return !!dbRepo;
      } catch {
        return false;
      }
    }
    
    return false;
  }

  /**
   * List all repositories
   */
  listRepos(): RepoInfo[] {
    const repos: RepoInfo[] = [];

    if (!exists(this.baseDir)) {
      return repos;
    }

    // List owner directories
    const owners = fs.readdirSync(this.baseDir).filter(f => {
      const fullPath = path.join(this.baseDir, f);
      return fs.statSync(fullPath).isDirectory();
    });

    for (const owner of owners) {
      const ownerDir = path.join(this.baseDir, owner);
      const repoNames = fs.readdirSync(ownerDir).filter(f => {
        const fullPath = path.join(ownerDir, f);
        return fs.statSync(fullPath).isDirectory() && f.endsWith('.git');
      });

      for (const repoName of repoNames) {
        const repoPath = path.join(ownerDir, repoName);
        if (exists(path.join(repoPath, 'objects'))) {
          repos.push({
            owner,
            name: repoName.replace(/\.git$/, ''),
            path: repoPath,
            bare: true,
          });
        }
      }
    }

    return repos;
  }

  /**
   * Delete a repository
   */
  async deleteRepo(owner: string, name: string): Promise<void> {
    const repoPath = this.getRepoPath(owner, name);
    const cacheKey = `${owner}/${name}`;

    // Close and remove from cache
    const cached = this.repoCache.get(cacheKey);
    if (cached) {
      await cached.close();
      this.repoCache.delete(cacheKey);
    }

    // Delete local files
    if (exists(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }

    console.log(`[StorageAwareRepoManager] Deleted repository: ${owner}/${name}`);
  }

  /**
   * Clear the repository cache
   */
  async clearCache(): Promise<void> {
    for (const repo of this.repoCache.values()) {
      await repo.close();
    }
    this.repoCache.clear();
  }
}
