import * as path from 'path';
import * as fs from 'fs';
import { exists, readFileText, writeFile, readDir, isDirectory, mkdirp } from '../utils/fs';
import { TsgitError, ErrorCode, findSimilar } from './errors';

/**
 * Represents a reference stored in packed-refs file
 */
export interface PackedRef {
  sha: string;
  name: string;
  peeled?: string; // For annotated tags (stored with ^{} prefix)
}

/**
 * Reference manager handles branches, tags, and HEAD
 */
export class Refs {
  private refsDir: string;
  private headsDir: string;
  private tagsDir: string;
  private headPath: string;
  private packedRefsPath: string;
  private packedRefsCache: Map<string, PackedRef> | null = null;

  constructor(private gitDir: string) {
    this.refsDir = path.join(gitDir, 'refs');
    this.headsDir = path.join(this.refsDir, 'heads');
    this.tagsDir = path.join(this.refsDir, 'tags');
    this.headPath = path.join(gitDir, 'HEAD');
    this.packedRefsPath = path.join(gitDir, 'packed-refs');
  }

  /**
   * Initialize refs directories
   */
  init(): void {
    mkdirp(this.headsDir);
    mkdirp(this.tagsDir);
  }

  /**
   * Read and parse the packed-refs file
   * Returns a map of ref names to PackedRef objects
   */
  readPackedRefs(): Map<string, PackedRef> {
    if (this.packedRefsCache !== null) {
      return this.packedRefsCache;
    }

    const refs = new Map<string, PackedRef>();

    if (!exists(this.packedRefsPath)) {
      this.packedRefsCache = refs;
      return refs;
    }

    const content = readFileText(this.packedRefsPath);
    let lastRef: PackedRef | null = null;

    for (const line of content.split('\n')) {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) {
        continue;
      }

      if (line.startsWith('^')) {
        // Peeled ref for previous annotated tag
        if (lastRef) {
          lastRef.peeled = line.slice(1).trim();
        }
      } else {
        const parts = line.split(' ');
        if (parts.length >= 2) {
          const sha = parts[0];
          const name = parts[1];
          lastRef = { sha, name };
          refs.set(name, lastRef);
        }
      }
    }

    this.packedRefsCache = refs;
    return refs;
  }

  /**
   * Invalidate the packed refs cache
   * Call this after modifying packed-refs file
   */
  invalidatePackedRefsCache(): void {
    this.packedRefsCache = null;
  }

  /**
   * Get a packed ref by name
   */
  getPackedRef(name: string): PackedRef | undefined {
    return this.readPackedRefs().get(name);
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
   * Loose refs take priority over packed refs
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

    // Check full ref path (loose refs first)
    const fullRefPath = path.join(this.gitDir, ref);
    if (exists(fullRefPath)) {
      return readFileText(fullRefPath).trim();
    }

    // Check refs/heads/ (loose)
    const branchPath = path.join(this.headsDir, ref);
    if (exists(branchPath)) {
      return readFileText(branchPath).trim();
    }

    // Check refs/tags/ (loose)
    const tagPath = path.join(this.tagsDir, ref);
    if (exists(tagPath)) {
      return readFileText(tagPath).trim();
    }

    // Check packed-refs (loose refs take priority, so check last)
    const packedRef = this.getPackedRef(ref);
    if (packedRef) {
      return packedRef.sha;
    }

    // Also check with refs/heads/ and refs/tags/ prefixes in packed-refs
    const packedBranch = this.getPackedRef(`refs/heads/${ref}`);
    if (packedBranch) {
      return packedBranch.sha;
    }

    const packedTag = this.getPackedRef(`refs/tags/${ref}`);
    if (packedTag) {
      return packedTag.sha;
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
    // Validate branch name
    const validation = this.validateBranchName(name);
    if (!validation.valid) {
      throw new TsgitError(
        `Branch name '${name}' is invalid: ${validation.reason}`,
        ErrorCode.INVALID_ARGUMENT,
        [
          `Try: wit branch ${this.suggestValidBranchName(name)}`,
          'wit branch --help    # See naming rules',
        ],
        { branch: name }
      );
    }

    const branchPath = path.join(this.headsDir, name);
    if (exists(branchPath) || this.getPackedRef(`refs/heads/${name}`)) {
      throw new TsgitError(
        `Branch '${name}' already exists`,
        ErrorCode.BRANCH_EXISTS,
        [
          `wit checkout ${name}    # Switch to existing branch`,
          `wit branch -d ${name}   # Delete it first if you want to recreate`,
        ],
        { branch: name }
      );
    }
    writeFile(branchPath, hash + '\n');
  }

  /**
   * Validate a branch name according to Git rules
   */
  private validateBranchName(name: string): { valid: boolean; reason?: string } {
    if (!name || name.trim() === '') {
      return { valid: false, reason: 'branch name cannot be empty' };
    }
    if (name.startsWith('-')) {
      return { valid: false, reason: 'branch name cannot start with a hyphen' };
    }
    if (name.startsWith('.') || name.endsWith('.')) {
      return { valid: false, reason: 'branch name cannot start or end with a dot' };
    }
    if (name.includes('..')) {
      return { valid: false, reason: 'branch name cannot contain consecutive dots (..)' };
    }
    if (name.includes(' ')) {
      return { valid: false, reason: 'branch name cannot contain spaces' };
    }
    if (name.includes('~') || name.includes('^') || name.includes(':') || name.includes('?') || name.includes('*') || name.includes('[')) {
      return { valid: false, reason: 'branch name cannot contain ~ ^ : ? * [' };
    }
    if (name.includes('\\')) {
      return { valid: false, reason: 'branch name cannot contain backslashes' };
    }
    if (name.endsWith('.lock')) {
      return { valid: false, reason: 'branch name cannot end with .lock' };
    }
    if (name.includes('@{')) {
      return { valid: false, reason: 'branch name cannot contain @{' };
    }
    if (name === '@') {
      return { valid: false, reason: 'branch name cannot be just @' };
    }
    return { valid: true };
  }

  /**
   * Suggest a valid branch name from an invalid one
   */
  private suggestValidBranchName(name: string): string {
    return name
      .replace(/\s+/g, '-')           // Replace spaces with hyphens
      .replace(/[~^:?*\[\]\\]/g, '')  // Remove invalid chars
      .replace(/\.{2,}/g, '.')        // Replace multiple dots with single
      .replace(/^[-.]|[-.]$/g, '')    // Remove leading/trailing hyphen or dot
      .replace(/\.lock$/i, '')        // Remove .lock suffix
      .replace(/@\{/g, '')            // Remove @{
      || 'new-branch';
  }

  /**
   * Delete a branch
   */
  deleteBranch(name: string): void {
    const branchPath = path.join(this.headsDir, name);
    const looseExists = exists(branchPath);
    const packedRef = this.getPackedRef(`refs/heads/${name}`);

    if (!looseExists && !packedRef) {
      const existingBranches = this.listBranches();
      const similar = findSimilar(name, existingBranches);
      const suggestions: string[] = [];

      if (similar.length > 0) {
        suggestions.push(`Did you mean: ${similar.join(', ')}?`);
      }
      suggestions.push('wit branch    # List all branches');

      throw new TsgitError(
        `Branch '${name}' not found`,
        ErrorCode.BRANCH_NOT_FOUND,
        suggestions,
        { branch: name, similarBranches: similar }
      );
    }

    const current = this.getCurrentBranch();
    if (current === name) {
      throw new TsgitError(
        `Cannot delete branch '${name}' - you are currently on it`,
        ErrorCode.CANNOT_DELETE_CURRENT_BRANCH,
        [
          'wit checkout main       # Switch to main branch first',
          'wit checkout <branch>   # Switch to another branch first',
        ],
        { branch: name, currentBranch: current }
      );
    }

    // Delete loose ref if it exists
    if (looseExists) {
      require('fs').unlinkSync(branchPath);
    }

    // Remove from packed-refs if it exists there
    if (packedRef) {
      this.removeFromPackedRefs(`refs/heads/${name}`);
    }
  }

  /**
   * List all branches (from both loose refs and packed-refs)
   */
  listBranches(): string[] {
    const branches = new Set<string>();

    // Get loose branches
    if (exists(this.headsDir)) {
      for (const branch of this.listRefsRecursive(this.headsDir, '')) {
        branches.add(branch);
      }
    }

    // Get packed branches
    const packedRefs = this.readPackedRefs();
    for (const [refName] of packedRefs) {
      if (refName.startsWith('refs/heads/')) {
        const branchName = refName.slice('refs/heads/'.length);
        // Only add if not already in loose refs (loose take priority but we're just listing)
        branches.add(branchName);
      }
    }

    return Array.from(branches).sort();
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
    if (exists(tagPath) || this.getPackedRef(`refs/tags/${name}`)) {
      throw new TsgitError(
        `Tag '${name}' already exists`,
        ErrorCode.TAG_EXISTS,
        [
          `wit show ${name}       # View existing tag`,
          `wit tag -d ${name}     # Delete it first to recreate`,
        ],
        { tag: name }
      );
    }
    writeFile(tagPath, hash + '\n');
  }

  /**
   * Delete a tag
   */
  deleteTag(name: string): void {
    const tagPath = path.join(this.tagsDir, name);
    const looseExists = exists(tagPath);
    const packedRef = this.getPackedRef(`refs/tags/${name}`);

    if (!looseExists && !packedRef) {
      const existingTags = this.listTags();
      const similar = findSimilar(name, existingTags);
      const suggestions: string[] = [];

      if (similar.length > 0) {
        suggestions.push(`Did you mean: ${similar.join(', ')}?`);
      }
      suggestions.push('wit tag    # List all tags');

      throw new TsgitError(
        `Tag '${name}' not found`,
        ErrorCode.TAG_NOT_FOUND,
        suggestions,
        { tag: name, similarTags: similar }
      );
    }

    // Delete loose ref if it exists
    if (looseExists) {
      require('fs').unlinkSync(tagPath);
    }

    // Remove from packed-refs if it exists there
    if (packedRef) {
      this.removeFromPackedRefs(`refs/tags/${name}`);
    }
  }

  /**
   * List all tags (from both loose refs and packed-refs)
   */
  listTags(): string[] {
    const tags = new Set<string>();

    // Get loose tags
    if (exists(this.tagsDir)) {
      for (const tag of this.listRefsRecursive(this.tagsDir, '')) {
        tags.add(tag);
      }
    }

    // Get packed tags
    const packedRefs = this.readPackedRefs();
    for (const [refName] of packedRefs) {
      if (refName.startsWith('refs/tags/')) {
        const tagName = refName.slice('refs/tags/'.length);
        tags.add(tagName);
      }
    }

    return Array.from(tags).sort();
  }

  /**
   * Check if a branch exists (loose or packed)
   */
  branchExists(name: string): boolean {
    // Check loose ref first
    if (exists(path.join(this.headsDir, name))) {
      return true;
    }
    // Check packed-refs
    return this.readPackedRefs().has(`refs/heads/${name}`);
  }

  /**
   * Check if a tag exists (loose or packed)
   */
  tagExists(name: string): boolean {
    // Check loose ref first
    if (exists(path.join(this.tagsDir, name))) {
      return true;
    }
    // Check packed-refs
    return this.readPackedRefs().has(`refs/tags/${name}`);
  }

  /**
   * Get the peeled value for an annotated tag
   * Returns the commit hash that the tag ultimately points to
   */
  getPeeledRef(refName: string): string | null {
    const packedRef = this.getPackedRef(refName);
    if (packedRef?.peeled) {
      return packedRef.peeled;
    }
    return null;
  }

  /**
   * Get all refs with a specific prefix (e.g., 'refs/heads/', 'refs/tags/')
   * Returns map of ref name to sha
   */
  getAllRefs(prefix?: string): Map<string, string> {
    const refs = new Map<string, string>();

    // Get packed refs first (will be overwritten by loose refs)
    const packedRefs = this.readPackedRefs();
    for (const [name, ref] of packedRefs) {
      if (!prefix || name.startsWith(prefix)) {
        refs.set(name, ref.sha);
      }
    }

    // Get loose refs (these override packed refs)
    const collectLooseRefs = (dir: string, refPrefix: string): void => {
      if (!exists(dir)) return;

      for (const entry of readDir(dir)) {
        const fullPath = path.join(dir, entry);
        const refName = `${refPrefix}/${entry}`;

        if (isDirectory(fullPath)) {
          collectLooseRefs(fullPath, refName);
        } else {
          if (!prefix || refName.startsWith(prefix)) {
            refs.set(refName, readFileText(fullPath).trim());
          }
        }
      }
    };

    collectLooseRefs(this.refsDir, 'refs');

    return refs;
  }

  /**
   * Pack all loose refs into the packed-refs file
   * This consolidates many small files into a single file for better performance
   */
  packRefs(options: { all?: boolean; prune?: boolean } = {}): PackRefsResult {
    const result: PackRefsResult = {
      packed: 0,
      pruned: 0,
      errors: [],
    };

    // Read existing packed refs
    const existingPacked = this.readPackedRefs();

    // Collect all loose refs
    const looseRefs = new Map<string, string>();
    const looseRefPaths: string[] = [];

    const collectLooseRefs = (dir: string, refPrefix: string): void => {
      if (!exists(dir)) return;

      for (const entry of readDir(dir)) {
        const fullPath = path.join(dir, entry);
        const refName = `${refPrefix}/${entry}`;

        if (isDirectory(fullPath)) {
          collectLooseRefs(fullPath, refName);
        } else {
          try {
            const sha = readFileText(fullPath).trim();
            // Only pack refs that look like valid SHAs
            if (/^[0-9a-f]{40}$/.test(sha) || /^[0-9a-f]{64}$/.test(sha)) {
              looseRefs.set(refName, sha);
              looseRefPaths.push(fullPath);
            }
          } catch (err) {
            result.errors.push(`Failed to read ${refName}: ${err}`);
          }
        }
      }
    };

    // By default only pack refs/heads and refs/tags
    // With --all, also pack refs/remotes
    collectLooseRefs(this.headsDir, 'refs/heads');
    collectLooseRefs(this.tagsDir, 'refs/tags');

    if (options.all) {
      const remotesDir = path.join(this.refsDir, 'remotes');
      if (exists(remotesDir)) {
        collectLooseRefs(remotesDir, 'refs/remotes');
      }
    }

    // Merge with existing packed refs (loose refs take priority)
    const allRefs = new Map<string, PackedRef>();
    
    // Start with existing packed refs
    for (const [name, ref] of existingPacked) {
      allRefs.set(name, ref);
    }

    // Add/update with loose refs
    for (const [name, sha] of looseRefs) {
      allRefs.set(name, { sha, name });
      result.packed++;
    }

    // Write packed-refs file
    const lines: string[] = ['# pack-refs with: peeled fully-peeled sorted'];
    
    // Sort refs for consistent output
    const sortedRefs = Array.from(allRefs.entries()).sort((a, b) => 
      a[0].localeCompare(b[0])
    );

    for (const [, ref] of sortedRefs) {
      lines.push(`${ref.sha} ${ref.name}`);
      // Add peeled line for tags with peeled values
      if (ref.peeled) {
        lines.push(`^${ref.peeled}`);
      }
    }

    writeFile(this.packedRefsPath, lines.join('\n') + '\n');
    this.invalidatePackedRefsCache();

    // Prune loose refs if requested
    if (options.prune) {
      for (const refPath of looseRefPaths) {
        try {
          fs.unlinkSync(refPath);
          result.pruned++;
          
          // Try to remove empty parent directories
          this.removeEmptyDirs(path.dirname(refPath));
        } catch (err) {
          result.errors.push(`Failed to prune ${refPath}: ${err}`);
        }
      }
    }

    return result;
  }

  /**
   * Remove empty directories up to the refs directory
   */
  private removeEmptyDirs(dir: string): void {
    // Don't remove the base refs directories
    if (dir === this.refsDir || dir === this.headsDir || dir === this.tagsDir) {
      return;
    }

    try {
      const entries = readDir(dir);
      if (entries.length === 0) {
        fs.rmdirSync(dir);
        // Recurse to parent
        this.removeEmptyDirs(path.dirname(dir));
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Update the packed-refs file to remove a specific ref
   */
  removeFromPackedRefs(refName: string): boolean {
    const packedRefs = this.readPackedRefs();
    
    if (!packedRefs.has(refName)) {
      return false;
    }

    packedRefs.delete(refName);

    // Rewrite packed-refs file
    const lines: string[] = ['# pack-refs with: peeled fully-peeled sorted'];
    
    const sortedRefs = Array.from(packedRefs.entries()).sort((a, b) => 
      a[0].localeCompare(b[0])
    );

    for (const [, ref] of sortedRefs) {
      lines.push(`${ref.sha} ${ref.name}`);
      if (ref.peeled) {
        lines.push(`^${ref.peeled}`);
      }
    }

    if (sortedRefs.length > 0) {
      writeFile(this.packedRefsPath, lines.join('\n') + '\n');
    } else {
      // Remove the file if no refs remain
      if (exists(this.packedRefsPath)) {
        fs.unlinkSync(this.packedRefsPath);
      }
    }

    this.invalidatePackedRefsCache();
    return true;
  }
}

/**
 * Result of packing refs
 */
export interface PackRefsResult {
  packed: number;   // Number of refs packed
  pruned: number;   // Number of loose refs removed
  errors: string[]; // Any errors encountered
}
