import * as path from 'path';
import { exists, readFileText, writeFile, readDir, isDirectory, mkdirp } from '../utils/fs';

/**
 * Reference manager handles branches, tags, and HEAD
 */
export class Refs {
  private refsDir: string;
  private headsDir: string;
  private tagsDir: string;
  private headPath: string;

  constructor(private gitDir: string) {
    this.refsDir = path.join(gitDir, 'refs');
    this.headsDir = path.join(this.refsDir, 'heads');
    this.tagsDir = path.join(this.refsDir, 'tags');
    this.headPath = path.join(gitDir, 'HEAD');
  }

  /**
   * Initialize refs directories
   */
  init(): void {
    mkdirp(this.headsDir);
    mkdirp(this.tagsDir);
  }

  /**
   * Get HEAD reference
   * Returns the commit hash or the symbolic ref
   */
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

  /**
   * Set HEAD to a symbolic reference (branch)
   */
  setHeadSymbolic(ref: string): void {
    writeFile(this.headPath, `ref: ${ref}\n`);
  }

  /**
   * Set HEAD to a specific commit (detached HEAD)
   */
  setHeadDetached(hash: string): void {
    writeFile(this.headPath, hash + '\n');
  }

  /**
   * Get the current branch name
   * Returns null if HEAD is detached
   */
  getCurrentBranch(): string | null {
    const head = this.getHead();
    if (!head.isSymbolic) {
      return null;
    }

    if (head.target.startsWith('refs/heads/')) {
      return head.target.slice(11);
    }

    return head.target;
  }

  /**
   * Resolve a ref to a commit hash
   */
  resolve(ref: string): string | null {
    // Check if it's already a hash (40 hex chars for SHA-1, 64 for SHA-256)
    if (/^[0-9a-f]{40}$/.test(ref) || /^[0-9a-f]{64}$/.test(ref)) {
      return ref;
    }

    // Check if it's HEAD
    if (ref === 'HEAD') {
      const head = this.getHead();
      if (head.isSymbolic) {
        return this.resolve(head.target);
      }
      return head.target;
    }

    // Check full ref path
    const fullRefPath = path.join(this.gitDir, ref);
    if (exists(fullRefPath)) {
      return readFileText(fullRefPath).trim();
    }

    // Check refs/heads/
    const branchPath = path.join(this.headsDir, ref);
    if (exists(branchPath)) {
      return readFileText(branchPath).trim();
    }

    // Check refs/tags/
    const tagPath = path.join(this.tagsDir, ref);
    if (exists(tagPath)) {
      return readFileText(tagPath).trim();
    }

    return null;
  }

  /**
   * Update a branch reference
   */
  updateBranch(name: string, hash: string): void {
    const branchPath = path.join(this.headsDir, name);
    writeFile(branchPath, hash + '\n');
  }

  /**
   * Create a new branch
   */
  createBranch(name: string, hash: string): void {
    const branchPath = path.join(this.headsDir, name);
    if (exists(branchPath)) {
      throw new Error(`Branch '${name}' already exists`);
    }
    writeFile(branchPath, hash + '\n');
  }

  /**
   * Delete a branch
   */
  deleteBranch(name: string): void {
    const branchPath = path.join(this.headsDir, name);
    if (!exists(branchPath)) {
      throw new Error(`Branch '${name}' not found`);
    }
    
    const current = this.getCurrentBranch();
    if (current === name) {
      throw new Error(`Cannot delete the current branch '${name}'`);
    }

    require('fs').unlinkSync(branchPath);
  }

  /**
   * List all branches
   */
  listBranches(): string[] {
    if (!exists(this.headsDir)) {
      return [];
    }

    return this.listRefsRecursive(this.headsDir, '');
  }

  /**
   * Recursively list refs in a directory
   */
  private listRefsRecursive(dir: string, prefix: string): string[] {
    const results: string[] = [];
    const entries = readDir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const refName = prefix ? prefix + '/' + entry : entry;

      if (isDirectory(fullPath)) {
        results.push(...this.listRefsRecursive(fullPath, refName));
      } else {
        results.push(refName);
      }
    }

    return results;
  }

  /**
   * Create a tag
   */
  createTag(name: string, hash: string): void {
    const tagPath = path.join(this.tagsDir, name);
    if (exists(tagPath)) {
      throw new Error(`Tag '${name}' already exists`);
    }
    writeFile(tagPath, hash + '\n');
  }

  /**
   * Delete a tag
   */
  deleteTag(name: string): void {
    const tagPath = path.join(this.tagsDir, name);
    if (!exists(tagPath)) {
      throw new Error(`Tag '${name}' not found`);
    }
    require('fs').unlinkSync(tagPath);
  }

  /**
   * List all tags
   */
  listTags(): string[] {
    if (!exists(this.tagsDir)) {
      return [];
    }

    return this.listRefsRecursive(this.tagsDir, '');
  }

  /**
   * Check if a branch exists
   */
  branchExists(name: string): boolean {
    return exists(path.join(this.headsDir, name));
  }

  /**
   * Check if a tag exists
   */
  tagExists(name: string): boolean {
    return exists(path.join(this.tagsDir, name));
  }
}
