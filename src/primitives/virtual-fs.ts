/**
 * Virtual Filesystem
 * 
 * An in-memory filesystem that can be committed directly to a wit repository
 * without requiring a physical working directory. This enables:
 * 
 * 1. IDE/web-based code editing without disk access
 * 2. AI agents generating code in-memory
 * 3. Direct commits to server-side bare repositories
 * 4. Preview changes before committing
 * 
 * The VirtualFS stores files in memory and can be:
 * - Populated from a commit (checkout)
 * - Modified through file operations
 * - Committed to produce a new tree/commit object
 */

import * as path from 'path';
import { ObjectStore } from '../core/object-store';
import { Tree, Commit, Blob } from '../core/object';
import { Refs } from '../core/refs';
import { Author, TreeEntry } from '../core/types';
import type { FileEntry, FileStatus, FileStat, CommitInfo } from './types';

export interface VirtualFile {
  content: Buffer;
  mode: string; // '100644' for regular, '100755' for executable
}

export interface VirtualDirectory {
  entries: Map<string, VirtualFile | VirtualDirectory>;
}

/**
 * Check if an entry is a file
 */
function isFile(entry: VirtualFile | VirtualDirectory): entry is VirtualFile {
  return 'content' in entry;
}

/**
 * In-memory virtual filesystem
 * 
 * Files are stored in a tree structure in memory. Changes can be committed
 * directly to an ObjectStore without touching the disk.
 * 
 * @example
 * ```typescript
 * // Create from existing repo
 * const vfs = new VirtualFS(objectStore, refs);
 * await vfs.checkout('main');
 * 
 * // Or start fresh
 * const vfs = new VirtualFS(objectStore, refs);
 * 
 * // Make changes
 * vfs.write('src/index.ts', 'console.log("hello")');
 * vfs.write('package.json', '{"name": "my-app"}');
 * 
 * // Commit changes
 * const hash = vfs.commit('Initial commit');
 * ```
 */
export class VirtualFS {
  private root: VirtualDirectory;
  private baseTreeHash: string | null = null;
  private baseCommitHash: string | null = null;

  constructor(
    private objects: ObjectStore,
    private refs: Refs
  ) {
    this.root = { entries: new Map() };
  }

  // === File Operations ===

  /**
   * Read file contents as a string
   * @param filePath - Path to the file
   * @returns The file contents, or null if the file doesn't exist
   */
  read(filePath: string): string | null {
    const entry = this.getEntry(filePath);
    if (!entry || !isFile(entry)) {
      return null;
    }
    return entry.content.toString('utf-8');
  }

  /**
   * Read file as buffer (for binary files)
   * @param filePath - Path to the file
   * @returns The file contents as a Buffer, or null if the file doesn't exist
   */
  readBuffer(filePath: string): Buffer | null {
    const entry = this.getEntry(filePath);
    if (!entry || !isFile(entry)) {
      return null;
    }
    return entry.content;
  }

  /**
   * Write content to a file (creates parent directories automatically)
   * @param filePath - Path to the file
   * @param content - Content to write (string or Buffer)
   * @param mode - File mode (default: '100644' for regular file)
   */
  write(filePath: string, content: string | Buffer, mode: string = '100644'): void {
    const normalizedPath = this.normalizePath(filePath);
    const parts = normalizedPath.split('/').filter(p => p.length > 0);
    
    if (parts.length === 0) {
      throw new Error('Invalid file path');
    }

    // Create parent directories
    let current: VirtualDirectory = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      let child = current.entries.get(part);
      
      if (!child) {
        child = { entries: new Map() };
        current.entries.set(part, child);
      } else if (isFile(child)) {
        throw new Error(`Cannot create directory: ${parts.slice(0, i + 1).join('/')} is a file`);
      }
      
      current = child as VirtualDirectory;
    }

    // Create the file
    const fileName = parts[parts.length - 1];
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    current.entries.set(fileName, { content: contentBuffer, mode });
  }

  /**
   * Append content to a file
   * @param filePath - Path to the file
   * @param content - Content to append
   */
  append(filePath: string, content: string): void {
    const existing = this.read(filePath) || '';
    this.write(filePath, existing + content);
  }

  /**
   * Delete a file
   * @param filePath - Path to the file
   * @returns true if the file was deleted, false if it didn't exist
   */
  delete(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    const parts = normalizedPath.split('/').filter(p => p.length > 0);
    
    if (parts.length === 0) {
      return false;
    }

    // Navigate to parent directory
    let current: VirtualDirectory = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      const child = current.entries.get(parts[i]);
      if (!child || isFile(child)) {
        return false;
      }
      current = child;
    }

    const fileName = parts[parts.length - 1];
    return current.entries.delete(fileName);
  }

  /**
   * Check if a file or directory exists
   * @param filePath - Path to check
   * @returns true if the path exists
   */
  exists(filePath: string): boolean {
    return this.getEntry(filePath) !== null;
  }

  /**
   * Check if path is a file
   */
  isFile(filePath: string): boolean {
    const entry = this.getEntry(filePath);
    return entry !== null && isFile(entry);
  }

  /**
   * Check if path is a directory
   */
  isDirectory(filePath: string): boolean {
    const entry = this.getEntry(filePath);
    return entry !== null && !isFile(entry);
  }

  // === Directory Operations ===

  /**
   * List directory contents (non-recursive)
   * @param dirPath - Path to the directory
   * @returns Array of file entries, or empty array if directory doesn't exist
   */
  list(dirPath: string = '.'): FileEntry[] {
    const dir = this.getDirectory(dirPath);
    if (!dir) {
      return [];
    }

    const entries: FileEntry[] = [];
    for (const [name, entry] of dir.entries) {
      entries.push({
        name,
        path: dirPath === '.' ? name : `${dirPath}/${name}`,
        type: isFile(entry) ? 'file' : 'dir',
      });
    }

    return entries.sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * List all files recursively
   * @param dirPath - Path to the directory
   * @returns Array of all file paths in the directory tree
   */
  listRecursive(dirPath: string = '.'): FileEntry[] {
    const results: FileEntry[] = [];

    const walk = (dir: string) => {
      const entries = this.list(dir);
      for (const entry of entries) {
        results.push(entry);
        if (entry.type === 'dir') {
          walk(entry.path);
        }
      }
    };

    walk(dirPath);
    return results;
  }

  /**
   * Get all file paths (flat list)
   */
  getAllFilePaths(): string[] {
    return this.listRecursive()
      .filter(e => e.type === 'file')
      .map(e => e.path);
  }

  /**
   * Create a directory
   * @param dirPath - Path to the directory
   */
  mkdir(dirPath: string): void {
    const normalizedPath = this.normalizePath(dirPath);
    const parts = normalizedPath.split('/').filter(p => p.length > 0);

    let current: VirtualDirectory = this.root;
    for (const part of parts) {
      let child = current.entries.get(part);
      
      if (!child) {
        child = { entries: new Map() };
        current.entries.set(part, child);
      } else if (isFile(child)) {
        throw new Error(`Cannot create directory: ${part} is a file`);
      }
      
      current = child as VirtualDirectory;
    }
  }

  /**
   * Remove a directory and all its contents
   * @param dirPath - Path to the directory
   * @returns true if the directory was removed, false if it didn't exist
   */
  rmdir(dirPath: string): boolean {
    return this.delete(dirPath);
  }

  // === Git Operations ===

  /**
   * Checkout a commit to populate the virtual filesystem
   * @param ref - Branch name, tag, or commit hash
   */
  checkout(ref: string): void {
    const hash = this.refs.resolve(ref);
    if (!hash) {
      throw new Error(`Unknown ref: ${ref}`);
    }

    const commit = this.objects.readCommit(hash);
    this.baseCommitHash = hash;
    this.baseTreeHash = commit.treeHash;

    // Clear current state
    this.root = { entries: new Map() };

    // Load tree recursively
    this.loadTree(commit.treeHash, '');
  }

  /**
   * Load a tree object into the virtual filesystem
   */
  private loadTree(treeHash: string, prefix: string): void {
    const tree = this.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.mode === '40000') {
        // Directory - recurse
        this.mkdir(fullPath);
        this.loadTree(entry.hash, fullPath);
      } else {
        // File - read blob
        const blob = this.objects.readBlob(entry.hash);
        this.write(fullPath, blob.content, entry.mode);
      }
    }
  }

  /**
   * Commit all changes in the virtual filesystem
   * @param message - Commit message
   * @param author - Author info (optional)
   * @returns The commit hash
   */
  commit(message: string, author?: Author): string {
    // Build tree from current state
    const treeHash = this.buildTree(this.root, '');

    // Get author info
    const authorInfo = author || this.getDefaultAuthor();

    // Get parent commit(s)
    const parentHashes: string[] = [];
    if (this.baseCommitHash) {
      parentHashes.push(this.baseCommitHash);
    } else {
      // Check if there's a HEAD
      const headHash = this.refs.resolve('HEAD');
      if (headHash) {
        parentHashes.push(headHash);
      }
    }

    // Create commit object
    const commitObj = new Commit(
      treeHash,
      parentHashes,
      authorInfo,
      authorInfo,
      message
    );

    const commitHash = this.objects.writeObject(commitObj);

    // Update refs
    const head = this.refs.getHead();
    if (head.isSymbolic) {
      const branchName = head.target.replace('refs/heads/', '');
      this.refs.updateBranch(branchName, commitHash);
    } else {
      this.refs.setHeadDetached(commitHash);
    }

    // Update base state
    this.baseCommitHash = commitHash;
    this.baseTreeHash = treeHash;

    return commitHash;
  }

  /**
   * Build a tree object from a virtual directory
   */
  private buildTree(dir: VirtualDirectory, prefix: string): string {
    const entries: TreeEntry[] = [];

    // Sort entries for consistent hashing
    const sortedNames = Array.from(dir.entries.keys()).sort();

    for (const name of sortedNames) {
      const entry = dir.entries.get(name)!;

      if (isFile(entry)) {
        // Write blob and add to tree
        const blobHash = this.objects.writeBlob(entry.content);
        entries.push({
          mode: entry.mode,
          name,
          hash: blobHash,
        });
      } else {
        // Recursively build subtree
        const childPath = prefix ? `${prefix}/${name}` : name;
        const subtreeHash = this.buildTree(entry, childPath);
        entries.push({
          mode: '40000',
          name,
          hash: subtreeHash,
        });
      }
    }

    const tree = new Tree(entries);
    return this.objects.writeObject(tree);
  }

  /**
   * Get status of all changes compared to base commit
   * @returns Array of file statuses
   */
  status(): FileStatus[] {
    const results: FileStatus[] = [];
    const currentFiles = new Set(this.getAllFilePaths());
    const baseFiles = new Set<string>();

    // Get files from base tree
    if (this.baseTreeHash) {
      this.collectFilesFromTree(this.baseTreeHash, '', baseFiles);
    }

    // Check for added and modified files
    for (const filePath of currentFiles) {
      if (!baseFiles.has(filePath)) {
        results.push({ path: filePath, status: 'added' });
      } else {
        // Check if modified
        if (this.isFileModified(filePath)) {
          results.push({ path: filePath, status: 'modified' });
        }
      }
    }

    // Check for deleted files
    for (const filePath of baseFiles) {
      if (!currentFiles.has(filePath)) {
        results.push({ path: filePath, status: 'deleted' });
      }
    }

    return results;
  }

  /**
   * Collect all file paths from a tree
   */
  private collectFilesFromTree(treeHash: string, prefix: string, files: Set<string>): void {
    const tree = this.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.mode === '40000') {
        this.collectFilesFromTree(entry.hash, fullPath, files);
      } else {
        files.add(fullPath);
      }
    }
  }

  /**
   * Check if a file has been modified from base
   */
  private isFileModified(filePath: string): boolean {
    if (!this.baseTreeHash) return false;

    const currentContent = this.readBuffer(filePath);
    if (!currentContent) return true;

    const baseBlobHash = this.findBlobInTree(this.baseTreeHash, filePath.split('/'));
    if (!baseBlobHash) return true;

    const baseBlob = this.objects.readBlob(baseBlobHash);
    return !currentContent.equals(baseBlob.content);
  }

  /**
   * Find a blob hash in a tree by path
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

  /**
   * Get commit history
   * @param limit - Maximum number of commits to return
   * @returns Array of commit information
   */
  log(limit: number = 10): CommitInfo[] {
    const commits: CommitInfo[] = [];
    let current = this.refs.resolve('HEAD');

    while (current && commits.length < limit) {
      try {
        const commit = this.objects.readCommit(current);
        commits.push({
          hash: current,
          message: commit.message.trim(),
          author: `${commit.author.name} <${commit.author.email}>`,
          date: new Date(commit.author.timestamp * 1000),
        });
        current = commit.parentHashes[0] || null;
      } catch {
        break;
      }
    }

    return commits;
  }

  // === Utilities ===

  /**
   * Copy a file
   * @param src - Source file path
   * @param dest - Destination file path
   */
  copy(src: string, dest: string): void {
    const content = this.readBuffer(src);
    if (content === null) {
      throw new Error(`Source file not found: ${src}`);
    }
    
    const entry = this.getEntry(src);
    const mode = entry && isFile(entry) ? entry.mode : '100644';
    this.write(dest, content, mode);
  }

  /**
   * Move/rename a file
   * @param src - Source file path
   * @param dest - Destination file path
   */
  move(src: string, dest: string): void {
    this.copy(src, dest);
    this.delete(src);
  }

  /**
   * Get file statistics
   * @param filePath - Path to the file
   * @returns File statistics, or null if path doesn't exist
   */
  stat(filePath: string): FileStat | null {
    const entry = this.getEntry(filePath);
    if (!entry) {
      return null;
    }

    if (isFile(entry)) {
      return {
        size: entry.content.length,
        modified: new Date(),
        created: new Date(),
        type: 'file',
      };
    } else {
      return {
        size: 0,
        modified: new Date(),
        created: new Date(),
        type: 'dir',
      };
    }
  }

  /**
   * Clear all files from the virtual filesystem
   */
  clear(): void {
    this.root = { entries: new Map() };
    this.baseTreeHash = null;
    this.baseCommitHash = null;
  }

  /**
   * Export the entire filesystem as a map of path -> content
   */
  export(): Map<string, Buffer> {
    const result = new Map<string, Buffer>();
    
    const walk = (dir: VirtualDirectory, prefix: string) => {
      for (const [name, entry] of dir.entries) {
        const fullPath = prefix ? `${prefix}/${name}` : name;
        if (isFile(entry)) {
          result.set(fullPath, entry.content);
        } else {
          walk(entry, fullPath);
        }
      }
    };

    walk(this.root, '');
    return result;
  }

  /**
   * Import files from a map of path -> content
   */
  import(files: Map<string, string | Buffer>): void {
    for (const [filePath, content] of files) {
      this.write(filePath, content);
    }
  }

  // === Private Helpers ===

  /**
   * Normalize a file path
   */
  private normalizePath(filePath: string): string {
    // Handle . and ..
    const normalized = path.normalize(filePath).replace(/\\/g, '/');
    
    // Remove leading ./
    if (normalized.startsWith('./')) {
      return normalized.slice(2);
    }
    
    // Prevent path traversal
    if (normalized.startsWith('../') || normalized === '..') {
      throw new Error('Path traversal not allowed');
    }
    
    // Remove leading /
    if (normalized.startsWith('/')) {
      return normalized.slice(1);
    }
    
    return normalized;
  }

  /**
   * Get an entry (file or directory) at a path
   */
  private getEntry(filePath: string): VirtualFile | VirtualDirectory | null {
    if (filePath === '.' || filePath === '' || filePath === '/') {
      return this.root;
    }

    const normalizedPath = this.normalizePath(filePath);
    const parts = normalizedPath.split('/').filter(p => p.length > 0);

    let current: VirtualFile | VirtualDirectory = this.root;
    for (const part of parts) {
      if (isFile(current)) {
        return null;
      }
      const child = current.entries.get(part);
      if (!child) {
        return null;
      }
      current = child;
    }

    return current;
  }

  /**
   * Get a directory at a path
   */
  private getDirectory(dirPath: string): VirtualDirectory | null {
    const entry = this.getEntry(dirPath);
    if (!entry || isFile(entry)) {
      return null;
    }
    return entry;
  }

  /**
   * Get default author info
   */
  private getDefaultAuthor(): Author {
    return {
      name: process.env.WIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME || 'Anonymous',
      email: process.env.WIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL || 'anonymous@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezone: this.getTimezone(),
    };
  }

  /**
   * Get current timezone offset string
   */
  private getTimezone(): string {
    const offset = new Date().getTimezoneOffset();
    const sign = offset <= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
    const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
    return `${sign}${hours}${minutes}`;
  }
}
