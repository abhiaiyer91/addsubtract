/**
 * Virtual Repository
 * 
 * A repository that uses VirtualFS for in-memory file operations while
 * storing objects in a real ObjectStore. This enables:
 * 
 * 1. Web IDE editing without disk working directory
 * 2. AI agent code generation in-memory
 * 3. Direct commits to bare repositories on the server
 * 4. Session-based editing with persistence
 * 
 * The VirtualRepository wraps a bare repository and provides a virtual
 * working directory through VirtualFS.
 */

import * as path from 'path';
import { ObjectStore } from '../core/object-store';
import { Refs } from '../core/refs';
import { Author } from '../core/types';
import { VirtualFS } from './virtual-fs';
import { BareRepository } from '../server/storage/repos';
import { exists, mkdirp } from '../utils/fs';
import { getStorage, type StorageBackend } from '../core/storage';
import type { FileEntry, FileStatus, CommitInfo } from './types';

export interface VirtualRepositoryOptions {
  /** Owner username (for server-side repos) */
  owner?: string;
  /** Repository name */
  name?: string;
  /** Base directory for bare repos (server mode) */
  baseDir?: string;
  /** Existing bare repository to wrap */
  bareRepo?: BareRepository;
}

/**
 * Session for a virtual repository
 * 
 * Each editing session (user in IDE, agent generating code) gets its own
 * session with isolated VirtualFS state. Multiple sessions can exist for
 * the same repository.
 */
export interface VirtualSession {
  id: string;
  vfs: VirtualFS;
  branch: string;
  createdAt: Date;
  lastModified: Date;
}

/**
 * Virtual repository manager
 * 
 * Manages virtual repositories and editing sessions for the web IDE
 * and AI agents.
 */
export class VirtualRepositoryManager {
  private sessions: Map<string, VirtualSession> = new Map();

  /**
   * Create a session for editing a repository
   * 
   * @param repoPath - Path to the bare repository (or owner/name for server)
   * @param branch - Branch to checkout (default: main)
   * @param sessionId - Optional session ID (auto-generated if not provided)
   * @returns Session with VirtualFS ready for editing
   */
  createSession(
    repoPath: string,
    branch: string = 'main',
    sessionId?: string
  ): VirtualSession {
    const id = sessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create object store and refs for the bare repo
    const objects = new ObjectStore(repoPath);
    const refs = new Refs(repoPath);

    // Create VirtualFS
    const vfs = new VirtualFS(objects, refs);

    // Try to checkout the branch
    try {
      vfs.checkout(branch);
    } catch {
      // Branch doesn't exist or repo is empty - start fresh
    }

    const session: VirtualSession = {
      id,
      vfs,
      branch,
      createdAt: new Date(),
      lastModified: new Date(),
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): VirtualSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Close a session
   */
  closeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * List all active sessions
   */
  listSessions(): VirtualSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * List sessions for a specific repository
   */
  listSessionsForRepo(_repoPath: string): VirtualSession[] {
    // Note: This is a simplified implementation
    // In production, we'd track repoPath per session
    return this.listSessions();
  }
}

/**
 * Virtual Repository
 * 
 * Wraps a bare repository with VirtualFS for in-memory editing.
 * 
 * @example
 * ```typescript
 * // Create from existing bare repo
 * const vrepo = new VirtualRepository('/repos/user/myrepo.git');
 * await vrepo.checkout('main');
 * 
 * // Edit files
 * vrepo.write('src/index.ts', 'console.log("hello")');
 * 
 * // Commit changes
 * const hash = vrepo.commit('Add greeting');
 * 
 * // Clone works immediately - objects are in the bare repo
 * ```
 */
export class VirtualRepository {
  readonly repoPath: string;
  readonly objects: ObjectStore;
  readonly refs: Refs;
  readonly vfs: VirtualFS;

  private currentBranch: string = 'main';

  constructor(repoPath: string, _options: VirtualRepositoryOptions = {}) {
    this.repoPath = path.resolve(repoPath);

    // For bare repos, the repoPath IS the git directory
    this.objects = new ObjectStore(this.repoPath);
    this.refs = new Refs(this.repoPath);
    this.vfs = new VirtualFS(this.objects, this.refs);
  }

  /**
   * Initialize a new virtual repository
   * Creates the bare repository structure
   */
  static init(repoPath: string, options: { defaultBranch?: string } = {}): VirtualRepository {
    const resolvedPath = path.resolve(repoPath);
    const defaultBranch = options.defaultBranch || 'main';

    // Check if already exists
    if (exists(resolvedPath) && exists(path.join(resolvedPath, 'objects'))) {
      throw new Error(`Repository already exists: ${repoPath}`);
    }

    // Create directory structure
    mkdirp(resolvedPath);
    mkdirp(path.join(resolvedPath, 'objects'));
    mkdirp(path.join(resolvedPath, 'refs', 'heads'));
    mkdirp(path.join(resolvedPath, 'refs', 'tags'));
    mkdirp(path.join(resolvedPath, 'info'));

    // Write HEAD pointing to default branch
    const fs = require('fs');
    fs.writeFileSync(
      path.join(resolvedPath, 'HEAD'),
      `ref: refs/heads/${defaultBranch}\n`
    );

    // Write config for bare repository
    const config = `[core]
    repositoryformatversion = 0
    filemode = true
    bare = true
[wit]
    hashAlgorithm = sha1
`;
    fs.writeFileSync(path.join(resolvedPath, 'config'), config);

    // Write description
    fs.writeFileSync(
      path.join(resolvedPath, 'description'),
      'Virtual repository\n'
    );

    return new VirtualRepository(resolvedPath);
  }

  /**
   * Check if the repository is valid
   */
  isValid(): boolean {
    return exists(this.repoPath) && exists(path.join(this.repoPath, 'objects'));
  }

  // === File Operations (delegated to VirtualFS) ===

  read(filePath: string): string | null {
    return this.vfs.read(filePath);
  }

  readBuffer(filePath: string): Buffer | null {
    return this.vfs.readBuffer(filePath);
  }

  write(filePath: string, content: string | Buffer, mode?: string): void {
    this.vfs.write(filePath, content, mode);
  }

  append(filePath: string, content: string): void {
    this.vfs.append(filePath, content);
  }

  delete(filePath: string): boolean {
    return this.vfs.delete(filePath);
  }

  exists(filePath: string): boolean {
    return this.vfs.exists(filePath);
  }

  list(dirPath?: string): FileEntry[] {
    return this.vfs.list(dirPath);
  }

  listRecursive(dirPath?: string): FileEntry[] {
    return this.vfs.listRecursive(dirPath);
  }

  mkdir(dirPath: string): void {
    this.vfs.mkdir(dirPath);
  }

  rmdir(dirPath: string): boolean {
    return this.vfs.rmdir(dirPath);
  }

  copy(src: string, dest: string): void {
    this.vfs.copy(src, dest);
  }

  move(src: string, dest: string): void {
    this.vfs.move(src, dest);
  }

  // === Git Operations ===

  /**
   * Checkout a branch
   * @param branch - Branch name
   */
  checkout(branch: string): void {
    // Update HEAD to point to the branch
    this.refs.setHeadSymbolic(`refs/heads/${branch}`);
    
    // Load the branch content into VFS
    this.vfs.checkout(branch);
    this.currentBranch = branch;
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(): string {
    return this.currentBranch;
  }

  /**
   * Create a new branch at the current commit
   * @param name - Branch name
   */
  createBranch(name: string): void {
    const headHash = this.refs.resolve('HEAD');
    if (!headHash) {
      throw new Error('Cannot create branch: no commits yet');
    }
    this.refs.createBranch(name, headHash);
  }

  /**
   * List all branches
   */
  listBranches(): string[] {
    return this.refs.listBranches();
  }

  /**
   * Delete a branch
   */
  deleteBranch(name: string): void {
    if (name === this.currentBranch) {
      throw new Error('Cannot delete the current branch');
    }
    this.refs.deleteBranch(name);
  }

  /**
   * Commit all changes
   * @param message - Commit message
   * @param author - Author info (optional)
   * @returns The commit hash
   */
  commit(message: string, author?: Author): string {
    return this.vfs.commit(message, author);
  }

  /**
   * Get status of all changes
   */
  status(): FileStatus[] {
    return this.vfs.status();
  }

  /**
   * Get commit history
   * @param limit - Maximum number of commits to return
   */
  log(limit?: number): CommitInfo[] {
    return this.vfs.log(limit);
  }

  /**
   * Clear all uncommitted changes (reset to last commit)
   */
  reset(): void {
    const branch = this.currentBranch;
    this.vfs.clear();
    try {
      this.vfs.checkout(branch);
    } catch {
      // No commits yet
    }
  }

  // === Utilities ===

  /**
   * Get all file paths
   */
  getAllFilePaths(): string[] {
    return this.vfs.getAllFilePaths();
  }

  /**
   * Export all files as a map
   */
  export(): Map<string, Buffer> {
    return this.vfs.export();
  }

  /**
   * Import files from a map
   */
  import(files: Map<string, string | Buffer>): void {
    this.vfs.import(files);
  }

  /**
   * Check if there are uncommitted changes
   */
  hasChanges(): boolean {
    return this.status().length > 0;
  }

  /**
   * Get file content at a specific ref
   * @param ref - Branch, tag, or commit hash
   * @param filePath - Path to the file
   */
  getFileAtRef(ref: string, filePath: string): Buffer | null {
    const hash = this.refs.resolve(ref);
    if (!hash) return null;

    const commit = this.objects.readCommit(hash);
    const blobHash = this.findBlobInTree(commit.treeHash, filePath.split('/'));

    if (!blobHash) return null;

    const blob = this.objects.readBlob(blobHash);
    return blob.content;
  }

  /**
   * Find a blob in a tree by path
   */
  private findBlobInTree(treeHash: string, pathParts: string[]): string | null {
    const tree = this.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      if (entry.name === pathParts[0]) {
        if (pathParts.length === 1) {
          return entry.mode === '40000' ? null : entry.hash;
        }
        if (entry.mode === '40000') {
          return this.findBlobInTree(entry.hash, pathParts.slice(1));
        }
      }
    }

    return null;
  }
}

/**
 * Create a virtual repository for server-side use
 * Uses the configured storage backend.
 * 
 * @param owner - Owner username
 * @param name - Repository name
 * @param storage - Optional storage backend (uses global if not provided)
 */
export async function createVirtualRepository(
  owner: string,
  name: string,
  storage?: StorageBackend
): Promise<VirtualRepository> {
  const backend = storage || getStorage();
  
  // Check if repo exists
  const repoExists = await backend.repoExists(owner, name);
  
  if (!repoExists) {
    // Create the repository
    await backend.createRepo(owner, name);
  }

  // Get the repo path
  const repoPath = backend.getRepoPath(owner, name);
  if (!repoPath) {
    throw new Error(`Cannot get path for repository: ${owner}/${name}`);
  }

  return new VirtualRepository(repoPath);
}

/**
 * Create a virtual repository synchronously (for backwards compatibility)
 * 
 * @param owner - Owner username
 * @param name - Repository name
 * @param baseDir - Base directory for repositories
 * @deprecated Use createVirtualRepository() instead
 */
export function createVirtualRepositorySync(
  owner: string,
  name: string,
  baseDir: string = process.env.REPOS_DIR || './repos'
): VirtualRepository {
  const repoName = name.endsWith('.git') ? name : `${name}.git`;
  const repoPath = path.join(baseDir, owner, repoName);

  // Initialize if doesn't exist
  if (!exists(repoPath)) {
    mkdirp(path.join(baseDir, owner));
    return VirtualRepository.init(repoPath);
  }

  return new VirtualRepository(repoPath);
}

// Export singleton manager instance
export const virtualRepoManager = new VirtualRepositoryManager();
