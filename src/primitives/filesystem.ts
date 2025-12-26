/**
 * Git-backed Virtual Filesystem
 * 
 * Provides file operations with built-in versioning, branching, and rollback.
 * Every change is tracked automatically through Git semantics.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { reset, parseRevision } from '../commands/reset';
import { diff as computeDiff, createHunks, formatUnifiedDiff, FileDiff } from '../core/diff';
import { exists, mkdirp, walkDir, loadIgnorePatterns } from '../utils/fs';
import type { FileEntry, FileStatus, FileStat, CommitInfo, MergeResult } from './types';

// Re-export types
export type { FileEntry, FileStatus, FileStat, CommitInfo, MergeResult } from './types';

/**
 * Git-backed virtual filesystem
 * 
 * Provides file operations with automatic versioning:
 * - All changes are tracked by Git
 * - Branch, merge, and rollback support
 * - Path traversal protection
 * 
 * @example
 * ```typescript
 * const fs = new Filesystem('./agent-workspace');
 * 
 * // File operations
 * await fs.write('src/index.ts', 'console.log("hello")');
 * const content = await fs.read('src/index.ts');
 * 
 * // Version control
 * await fs.commit('Added index file');
 * await fs.branch('feature');
 * await fs.checkout('feature');
 * ```
 */
export class Filesystem {
  private repo: Repository;
  readonly workDir: string;

  /**
   * Create a new Filesystem instance
   * @param dir - The directory to use as the workspace (will be created if it doesn't exist)
   */
  constructor(dir: string) {
    this.workDir = path.resolve(dir);

    // Initialize or open repository
    const gitDir = path.join(this.workDir, '.wit');
    if (!fs.existsSync(gitDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
      this.repo = Repository.init(this.workDir);
    } else {
      this.repo = new Repository(this.workDir);
    }
  }

  // === File Operations ===

  /**
   * Read file contents as a string
   * @param filePath - Path to the file (relative to workspace)
   * @returns The file contents, or null if the file doesn't exist
   */
  async read(filePath: string): Promise<string | null> {
    const fullPath = this.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * Read file as buffer (for binary files)
   * @param filePath - Path to the file (relative to workspace)
   * @returns The file contents as a Buffer, or null if the file doesn't exist
   */
  async readBuffer(filePath: string): Promise<Buffer | null> {
    const fullPath = this.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fs.readFileSync(fullPath);
  }

  /**
   * Write content to a file (creates parent directories automatically)
   * @param filePath - Path to the file (relative to workspace)
   * @param content - Content to write (string or Buffer)
   */
  async write(filePath: string, content: string | Buffer): Promise<void> {
    const fullPath = this.resolve(filePath);
    const dir = path.dirname(fullPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  /**
   * Append content to a file (creates file and parent directories if needed)
   * @param filePath - Path to the file (relative to workspace)
   * @param content - Content to append
   */
  async append(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolve(filePath);
    const dir = path.dirname(fullPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(fullPath, content);
  }

  /**
   * Delete a file
   * @param filePath - Path to the file (relative to workspace)
   * @returns true if the file was deleted, false if it didn't exist
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
   * Check if a file or directory exists
   * @param filePath - Path to check (relative to workspace)
   * @returns true if the path exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolve(filePath);
    return fs.existsSync(fullPath);
  }

  // === Directory Operations ===

  /**
   * List directory contents (non-recursive)
   * @param dirPath - Path to the directory (relative to workspace)
   * @returns Array of file entries, or empty array if directory doesn't exist
   */
  async list(dirPath: string = '.'): Promise<FileEntry[]> {
    const fullPath = this.resolve(dirPath);
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name).replace(/\\/g, '/'),
        type: e.isDirectory() ? 'dir' as const : 'file' as const,
      }));
  }

  /**
   * List all files and directories recursively
   * @param dirPath - Path to the directory (relative to workspace)
   * @returns Array of all file entries in the directory tree
   */
  async listRecursive(dirPath: string = '.'): Promise<FileEntry[]> {
    const results: FileEntry[] = [];

    const walk = async (dir: string) => {
      const entries = await this.list(dir);
      for (const entry of entries) {
        results.push(entry);
        if (entry.type === 'dir') {
          await walk(entry.path);
        }
      }
    };

    await walk(dirPath);
    return results;
  }

  /**
   * Create a directory (creates parent directories automatically)
   * @param dirPath - Path to the directory (relative to workspace)
   */
  async mkdir(dirPath: string): Promise<void> {
    const fullPath = this.resolve(dirPath);
    fs.mkdirSync(fullPath, { recursive: true });
  }

  /**
   * Remove a directory and all its contents
   * @param dirPath - Path to the directory (relative to workspace)
   * @returns true if the directory was removed, false if it didn't exist
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
   * Commit all changes in the workspace
   * @param message - Commit message
   * @returns The commit hash
   */
  async commit(message: string): Promise<string> {
    // Stage all changes
    this.repo.addAll();

    // Check if there's anything to commit
    if (this.repo.index.size === 0) {
      throw new Error('Nothing to commit');
    }

    // Commit
    return this.repo.commit(message);
  }

  /**
   * Rollback the last commit (soft reset - keeps files, undoes commit)
   */
  async rollback(): Promise<void> {
    const head = this.repo.refs.resolve('HEAD');
    if (!head) return;

    try {
      const commit = this.repo.objects.readCommit(head);
      if (commit.parentHashes[0]) {
        reset(this.repo, commit.parentHashes[0], { mode: 'soft' });
      }
    } catch {
      // No commits or invalid commit
    }
  }

  /**
   * Hard reset to a specific commit (restores working directory)
   * @param commitHash - The commit hash to reset to
   */
  async reset(commitHash: string): Promise<void> {
    reset(this.repo, commitHash, { mode: 'hard' });
  }

  /**
   * Get all uncommitted changes
   * @returns Array of file statuses
   */
  async status(): Promise<FileStatus[]> {
    const repoStatus = this.repo.status();
    const results: FileStatus[] = [];

    // Add staged files
    for (const file of repoStatus.staged) {
      // Parse "(deleted)" suffix if present
      const isDeleted = file.endsWith(' (deleted)');
      const cleanPath = isDeleted ? file.replace(' (deleted)', '') : file;
      results.push({
        path: cleanPath,
        status: isDeleted ? 'deleted' : 'added',
      });
    }

    // Add modified files
    for (const file of repoStatus.modified) {
      if (!results.find(r => r.path === file)) {
        results.push({ path: file, status: 'modified' });
      }
    }

    // Add deleted files
    for (const file of repoStatus.deleted) {
      if (!results.find(r => r.path === file)) {
        results.push({ path: file, status: 'deleted' });
      }
    }

    // Add untracked files
    for (const file of repoStatus.untracked) {
      results.push({ path: file, status: 'untracked' });
    }

    return results;
  }

  /**
   * Get unified diff of all uncommitted changes
   * @returns Unified diff string
   */
  async diff(): Promise<string> {
    const repoStatus = this.repo.status();
    const diffs: string[] = [];

    // Process modified files
    for (const file of repoStatus.modified) {
      const fileDiff = this.getDiffForFile(file);
      if (fileDiff) {
        diffs.push(formatUnifiedDiff(fileDiff));
      }
    }

    // Process staged files (new or modified)
    for (const file of repoStatus.staged) {
      const cleanPath = file.replace(' (deleted)', '');
      if (!repoStatus.modified.includes(cleanPath)) {
        const fileDiff = this.getDiffForFile(cleanPath, file.includes('(deleted)'));
        if (fileDiff) {
          diffs.push(formatUnifiedDiff(fileDiff));
        }
      }
    }

    // Process untracked files (show as new)
    for (const file of repoStatus.untracked) {
      const content = await this.read(file);
      if (content !== null) {
        const fileDiff: FileDiff = {
          oldPath: file,
          newPath: file,
          hunks: createHunks(computeDiff('', content)),
          isBinary: false,
          isNew: true,
          isDeleted: false,
        };
        diffs.push(formatUnifiedDiff(fileDiff));
      }
    }

    return diffs.join('\n\n');
  }

  /**
   * Get commit history
   * @param limit - Maximum number of commits to return (default: 10)
   * @returns Array of commit information
   */
  async log(limit: number = 10): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];
    let current = this.repo.refs.resolve('HEAD');

    while (current && commits.length < limit) {
      try {
        const commit = this.repo.objects.readCommit(current);
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

  // === Branching ===

  /**
   * Create a new branch at the current commit
   * @param name - Branch name
   */
  async branch(name: string): Promise<void> {
    const head = this.repo.refs.resolve('HEAD');
    if (head) {
      this.repo.refs.createBranch(name, head);
    } else {
      throw new Error('Cannot create branch: no commits yet');
    }
  }

  /**
   * Switch to a different branch
   * @param name - Branch name to switch to
   */
  async checkout(name: string): Promise<void> {
    this.repo.checkout(name);
  }

  /**
   * Get the current branch name
   * @returns Branch name, or null if in detached HEAD state
   */
  async currentBranch(): Promise<string | null> {
    return this.repo.refs.getCurrentBranch();
  }

  /**
   * List all branches
   * @returns Array of branch names
   */
  async branches(): Promise<string[]> {
    return this.repo.refs.listBranches();
  }

  /**
   * Merge a branch into the current branch
   * @param branchName - Branch to merge
   * @returns Merge result with success status and any conflicts
   */
  async merge(branchName: string): Promise<MergeResult> {
    try {
      const result = this.repo.mergeManager.merge(branchName);
      return {
        success: result.success,
        conflicts: result.conflicts.map(c => c.path),
      };
    } catch (error: any) {
      if (error.conflicts) {
        return { success: false, conflicts: error.conflicts };
      }
      throw error;
    }
  }

  /**
   * Delete a branch
   * @param name - Branch name to delete
   */
  async deleteBranch(name: string): Promise<void> {
    this.repo.refs.deleteBranch(name);
  }

  // === Utilities ===

  /**
   * Copy a file
   * @param src - Source file path
   * @param dest - Destination file path
   */
  async copy(src: string, dest: string): Promise<void> {
    const content = await this.readBuffer(src);
    if (content !== null) {
      await this.write(dest, content);
    } else {
      throw new Error(`Source file not found: ${src}`);
    }
  }

  /**
   * Move/rename a file
   * @param src - Source file path
   * @param dest - Destination file path
   */
  async move(src: string, dest: string): Promise<void> {
    const srcPath = this.resolve(src);
    const destPath = this.resolve(dest);

    if (!fs.existsSync(srcPath)) {
      throw new Error(`Source file not found: ${src}`);
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.renameSync(srcPath, destPath);
  }

  /**
   * Get file or directory statistics
   * @param filePath - Path to the file or directory
   * @returns File statistics, or null if path doesn't exist
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
      type: stats.isDirectory() ? 'dir' : 'file',
    };
  }

  /**
   * Find files matching a glob pattern
   * @param pattern - Glob pattern (e.g., '**\/*.ts')
   * @returns Array of matching file paths
   */
  async glob(pattern: string): Promise<string[]> {
    // Simple glob implementation using walkDir and pattern matching
    const ignorePatterns = loadIgnorePatterns(this.workDir);
    ignorePatterns.push('**/node_modules/**', '**/.wit/**');
    
    const allFiles = walkDir(this.workDir, ignorePatterns);
    const matches: string[] = [];

    // Convert glob pattern to regex
    const regexPattern = this.globToRegex(pattern);

    for (const file of allFiles) {
      const relativePath = path.relative(this.workDir, file).replace(/\\/g, '/');
      if (regexPattern.test(relativePath)) {
        matches.push(relativePath);
      }
    }

    return matches.sort();
  }

  // === Private Helpers ===

  /**
   * Resolve a relative path to an absolute path within the workspace
   * Prevents path traversal attacks
   */
  private resolve(filePath: string): string {
    // Normalize the path to handle . and ..
    const normalized = path.normalize(filePath);
    const resolved = path.resolve(this.workDir, normalized);
    
    // Ensure the resolved path is within the workspace
    if (!resolved.startsWith(this.workDir + path.sep) && resolved !== this.workDir) {
      throw new Error('Path traversal not allowed');
    }
    return resolved;
  }

  /**
   * Get diff for a single file
   */
  private getDiffForFile(filePath: string, isDeleted: boolean = false): FileDiff | null {
    try {
      const headHash = this.repo.refs.resolve('HEAD');
      if (!headHash) return null;

      const oldContent = this.repo.getFileAtRef('HEAD', filePath);
      const oldText = oldContent ? oldContent.toString('utf-8') : '';

      let newText = '';
      if (!isDeleted) {
        const fullPath = this.resolve(filePath);
        if (fs.existsSync(fullPath)) {
          newText = fs.readFileSync(fullPath, 'utf-8');
        }
      }

      if (oldText === newText) return null;

      const diffLines = computeDiff(oldText, newText);
      const hunks = createHunks(diffLines);

      return {
        oldPath: filePath,
        newPath: filePath,
        hunks,
        isBinary: false,
        isNew: !oldContent,
        isDeleted: isDeleted,
      };
    } catch {
      return null;
    }
  }

  /**
   * Convert a glob pattern to a regular expression
   */
  private globToRegex(pattern: string): RegExp {
    // Escape special regex characters except * and ?
    let regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // Convert ** to match any path
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      // Convert * to match any characters except /
      .replace(/\*/g, '[^/]*')
      // Convert ? to match single character
      .replace(/\?/g, '.')
      // Restore globstar
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');

    return new RegExp('^' + regex + '$');
  }
}
