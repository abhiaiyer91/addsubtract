/**
 * Cherry-pick Command
 * Apply changes from specific commits to the current branch
 * 
 * Usage:
 *   wit cherry-pick <commit>           Apply a single commit
 *   wit cherry-pick <c1> <c2>          Apply multiple commits
 *   wit cherry-pick --continue         Continue after conflict resolution
 *   wit cherry-pick --abort            Abort the operation
 *   wit cherry-pick --skip             Skip current commit
 *   wit cherry-pick -n <commit>        Apply without committing
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { Commit } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';
import { Author } from '../core/types';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';
import { colors } from '../utils/colors';

/**
 * Cherry-pick state saved during multi-commit or conflict resolution
 */
export interface CherryPickState {
  inProgress: boolean;
  commits: string[];           // All commits to cherry-pick
  currentIndex: number;        // Index of current commit being applied
  currentCommit: string;       // Hash of current commit
  originalBranch: string | null;
  originalHead: string;
  noCommit: boolean;           // -n flag
  startedAt: number;
}

/**
 * Cherry-pick options
 */
export interface CherryPickOptions {
  noCommit?: boolean;          // -n: Apply changes but don't commit
  keepRedundant?: boolean;     // Keep redundant (empty) commits
  signoff?: boolean;           // Add signed-off-by line
}

/**
 * Cherry-pick result
 */
export interface CherryPickResult {
  success: boolean;
  commits: string[];           // Applied commit hashes
  conflicts?: string[];        // Files with conflicts
  message?: string;
}

/**
 * Cherry-pick manager handles the cherry-pick operation state
 */
export class CherryPickManager {
  private statePath: string;

  constructor(
    private repo: Repository,
    private gitDir: string
  ) {
    this.statePath = path.join(gitDir, 'CHERRY_PICK_STATE.json');
  }

  /**
   * Check if a cherry-pick is in progress
   */
  isInProgress(): boolean {
    return exists(this.statePath);
  }

  /**
   * Get current cherry-pick state
   */
  getState(): CherryPickState | null {
    if (!this.isInProgress()) {
      return null;
    }

    try {
      const content = readFile(this.statePath).toString('utf8');
      return JSON.parse(content) as CherryPickState;
    } catch {
      return null;
    }
  }

  /**
   * Save cherry-pick state
   */
  private saveState(state: CherryPickState): void {
    writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Clear cherry-pick state
   */
  private clearState(): void {
    if (exists(this.statePath)) {
      require('fs').unlinkSync(this.statePath);
    }
  }

  /**
   * Cherry-pick one or more commits
   */
  cherryPick(commitRefs: string[], options: CherryPickOptions = {}): CherryPickResult {
    if (this.isInProgress()) {
      throw new TsgitError(
        'A cherry-pick is already in progress',
        ErrorCode.OPERATION_FAILED,
        [
          'wit cherry-pick --continue    # Continue after resolving conflicts',
          'wit cherry-pick --abort       # Abort the cherry-pick',
        ]
      );
    }

    // Resolve all commits first
    const commits: string[] = [];
    for (const ref of commitRefs) {
      const hash = this.repo.refs.resolve(ref);
      if (!hash) {
        throw new TsgitError(
          `bad revision '${ref}'`,
          ErrorCode.REF_NOT_FOUND,
          ['wit log    # View existing commits']
        );
      }
      commits.push(hash);
    }

    if (commits.length === 0) {
      throw new TsgitError(
        'No commits specified',
        ErrorCode.INVALID_ARGUMENT,
        ['wit cherry-pick <commit>    # Specify a commit to cherry-pick']
      );
    }

    // Check for uncommitted changes
    const status = this.repo.status();
    if (status.modified.length > 0 || status.staged.length > 0) {
      throw new TsgitError(
        'You have uncommitted changes',
        ErrorCode.UNCOMMITTED_CHANGES,
        [
          'wit stash              # Stash your changes',
          'wit commit -m "WIP"    # Commit your changes first',
        ]
      );
    }

    // Save initial state for potential abort
    const state: CherryPickState = {
      inProgress: true,
      commits,
      currentIndex: 0,
      currentCommit: commits[0],
      originalBranch: this.repo.refs.getCurrentBranch(),
      originalHead: this.repo.refs.resolve('HEAD') || '',
      noCommit: options.noCommit || false,
      startedAt: Date.now(),
    };

    // Apply commits one by one
    const result: CherryPickResult = {
      success: true,
      commits: [],
    };

    for (let i = 0; i < commits.length; i++) {
      state.currentIndex = i;
      state.currentCommit = commits[i];
      
      const applyResult = this.applyCommit(commits[i], options);
      
      if (applyResult.conflicts && applyResult.conflicts.length > 0) {
        // Save state for later continue
        this.saveState(state);
        return {
          success: false,
          commits: result.commits,
          conflicts: applyResult.conflicts,
          message: `Cherry-pick stopped due to conflicts in ${applyResult.conflicts.length} file(s)`,
        };
      }

      if (applyResult.newCommit) {
        result.commits.push(applyResult.newCommit);
      }
    }

    return result;
  }

  /**
   * Apply a single commit
   */
  private applyCommit(
    commitHash: string,
    options: CherryPickOptions
  ): { newCommit?: string; conflicts?: string[] } {
    const commit = this.repo.objects.readCommit(commitHash);
    
    // Get the parent commit (for diff calculation)
    const parentHash = commit.parentHashes[0];
    if (!parentHash) {
      // For root commits, we apply all files
      return this.applyRootCommit(commit, commitHash, options);
    }

    // Get the trees
    const parentTree = this.getFileTree(parentHash);
    const commitTree = this.getFileTree(commitHash);
    const headTree = this.getHeadTree();

    // Calculate the changes in the commit
    const changes = this.calculateDiff(parentTree, commitTree);

    // Apply changes to the working directory
    const conflicts: string[] = [];
    
    for (const [filePath, change] of changes) {
      const headBlob = headTree.get(filePath);
      
      if (change.type === 'add') {
        // File added - check for existing file
        if (headBlob && headBlob !== change.newHash) {
          conflicts.push(filePath);
          this.writeConflictMarkers(filePath, change, headBlob);
        } else {
          this.applyFileChange(filePath, change);
        }
      } else if (change.type === 'delete') {
        // File deleted
        if (!headBlob || headBlob === change.oldHash) {
          this.applyFileChange(filePath, change);
        } else {
          // File modified in HEAD but deleted in commit
          conflicts.push(filePath);
        }
      } else if (change.type === 'modify') {
        // File modified - check for merge conflicts
        if (!headBlob) {
          // File doesn't exist in HEAD, just add it
          this.applyFileChange(filePath, change);
        } else if (headBlob === change.oldHash) {
          // File unchanged in HEAD since parent, safe to apply
          this.applyFileChange(filePath, change);
        } else if (headBlob === change.newHash) {
          // Already has the changes, skip
          continue;
        } else {
          // Both modified - try to merge
          const merged = this.tryMerge(filePath, change, headBlob);
          if (!merged) {
            conflicts.push(filePath);
            this.writeConflictMarkers(filePath, change, headBlob);
          }
        }
      }
    }

    if (conflicts.length > 0) {
      return { conflicts };
    }

    // Create the new commit (unless -n flag)
    if (!options.noCommit) {
      const newHash = this.createCommit(commit, options);
      return { newCommit: newHash };
    }

    return {};
  }

  /**
   * Apply a root commit (one with no parents)
   */
  private applyRootCommit(
    commit: Commit,
    commitHash: string,
    options: CherryPickOptions
  ): { newCommit?: string; conflicts?: string[] } {
    const commitTree = this.getFileTree(commitHash);
    const headTree = this.getHeadTree();
    const conflicts: string[] = [];

    for (const [filePath, blobHash] of commitTree) {
      const headBlob = headTree.get(filePath);
      if (headBlob && headBlob !== blobHash) {
        conflicts.push(filePath);
      } else {
        // Apply the file
        const blob = this.repo.objects.readBlob(blobHash);
        const fullPath = path.join(this.repo.workDir, filePath);
        mkdirp(path.dirname(fullPath));
        writeFile(fullPath, blob.content);
        this.repo.add(filePath);
      }
    }

    if (conflicts.length > 0) {
      return { conflicts };
    }

    if (!options.noCommit) {
      const newHash = this.createCommit(commit, options);
      return { newCommit: newHash };
    }

    return {};
  }

  /**
   * Calculate diff between two trees
   */
  private calculateDiff(
    oldTree: Map<string, string>,
    newTree: Map<string, string>
  ): Map<string, { type: 'add' | 'modify' | 'delete'; oldHash?: string; newHash?: string }> {
    const changes = new Map<string, { type: 'add' | 'modify' | 'delete'; oldHash?: string; newHash?: string }>();

    // Find added and modified files
    for (const [filePath, newHash] of newTree) {
      const oldHash = oldTree.get(filePath);
      if (!oldHash) {
        changes.set(filePath, { type: 'add', newHash });
      } else if (oldHash !== newHash) {
        changes.set(filePath, { type: 'modify', oldHash, newHash });
      }
    }

    // Find deleted files
    for (const [filePath, oldHash] of oldTree) {
      if (!newTree.has(filePath)) {
        changes.set(filePath, { type: 'delete', oldHash });
      }
    }

    return changes;
  }

  /**
   * Apply a file change to the working directory
   */
  private applyFileChange(
    filePath: string,
    change: { type: 'add' | 'modify' | 'delete'; oldHash?: string; newHash?: string }
  ): void {
    const fullPath = path.join(this.repo.workDir, filePath);

    if (change.type === 'delete') {
      if (exists(fullPath)) {
        require('fs').unlinkSync(fullPath);
      }
      this.repo.index.remove(filePath);
    } else {
      const blob = this.repo.objects.readBlob(change.newHash!);
      mkdirp(path.dirname(fullPath));
      writeFile(fullPath, blob.content);
      this.repo.add(filePath);
    }
    
    this.repo.index.save();
  }

  /**
   * Try to merge changes automatically
   */
  private tryMerge(
    filePath: string,
    change: { oldHash?: string; newHash?: string },
    headHash: string
  ): boolean {
    // Get file contents
    const baseContent = change.oldHash 
      ? this.repo.objects.readBlob(change.oldHash).toString()
      : '';
    const changeContent = this.repo.objects.readBlob(change.newHash!).toString();
    const headContent = this.repo.objects.readBlob(headHash).toString();

    // If head hasn't changed from base, we can use change directly
    if (headContent === baseContent) {
      const fullPath = path.join(this.repo.workDir, filePath);
      mkdirp(path.dirname(fullPath));
      writeFile(fullPath, changeContent);
      this.repo.add(filePath);
      this.repo.index.save();
      return true;
    }

    // If change is same as head, no conflict
    if (changeContent === headContent) {
      return true;
    }

    // Try simple merge - for now, just detect conflicts
    // A full implementation would use a proper 3-way merge algorithm
    return false;
  }

  /**
   * Write conflict markers to a file
   */
  private writeConflictMarkers(
    filePath: string,
    change: { oldHash?: string; newHash?: string },
    headHash: string
  ): void {
    const headContent = this.repo.objects.readBlob(headHash).toString();
    const changeContent = change.newHash 
      ? this.repo.objects.readBlob(change.newHash).toString()
      : '';

    const conflictContent = `<<<<<<< HEAD
${headContent}
=======
${changeContent}
>>>>>>> cherry-pick
`;

    const fullPath = path.join(this.repo.workDir, filePath);
    mkdirp(path.dirname(fullPath));
    writeFile(fullPath, conflictContent);
  }

  /**
   * Create a new commit with the cherry-picked changes
   */
  private createCommit(originalCommit: Commit, options: CherryPickOptions): string {
    // Build message with reference to original commit
    let message = originalCommit.message;
    if (options.signoff) {
      const author = this.getDefaultAuthor();
      message += `\n\nSigned-off-by: ${author.name} <${author.email}>`;
    }

    // Create the commit
    const hash = this.repo.commit(message);

    // Record in journal
    const beforeState = {
      head: this.repo.refs.resolve('HEAD') || '',
      branch: this.repo.refs.getCurrentBranch(),
      indexHash: '',
    };

    const afterState = {
      head: hash,
      branch: this.repo.refs.getCurrentBranch(),
      indexHash: '',
    };

    this.repo.journal.record(
      'cherry-pick',
      [originalCommit.hash().slice(0, 8)],
      `Cherry-picked ${originalCommit.hash().slice(0, 8)}`,
      beforeState,
      afterState,
      { commitHash: hash }
    );

    return hash;
  }

  /**
   * Continue cherry-pick after conflict resolution
   */
  continue(): CherryPickResult {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No cherry-pick in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    // For simplicity, assume staged changes mean conflicts are resolved

    // Create commit for current
    const commit = this.repo.objects.readCommit(state.currentCommit);
    const newHash = this.repo.commit(commit.message);

    const result: CherryPickResult = {
      success: true,
      commits: [newHash],
    };

    // Continue with remaining commits
    for (let i = state.currentIndex + 1; i < state.commits.length; i++) {
      state.currentIndex = i;
      state.currentCommit = state.commits[i];
      this.saveState(state);

      const applyResult = this.applyCommit(state.commits[i], { noCommit: state.noCommit });
      
      if (applyResult.conflicts && applyResult.conflicts.length > 0) {
        return {
          success: false,
          commits: result.commits,
          conflicts: applyResult.conflicts,
          message: `Cherry-pick stopped due to conflicts in ${applyResult.conflicts.length} file(s)`,
        };
      }

      if (applyResult.newCommit) {
        result.commits.push(applyResult.newCommit);
      }
    }

    // All done, clear state
    this.clearState();
    return result;
  }

  /**
   * Abort cherry-pick operation
   */
  abort(): void {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No cherry-pick in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Reset to original state
    if (state.originalBranch) {
      this.repo.refs.setHeadSymbolic(`refs/heads/${state.originalBranch}`);
    } else {
      this.repo.refs.setHeadDetached(state.originalHead);
    }

    // Checkout original state
    this.repo.checkout(state.originalHead);

    this.clearState();
  }

  /**
   * Skip current commit
   */
  skip(): CherryPickResult {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No cherry-pick in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Reset working directory
    const headHash = this.repo.refs.resolve('HEAD');
    if (headHash) {
      this.repo.checkout(headHash);
    }

    const result: CherryPickResult = {
      success: true,
      commits: [],
    };

    // Continue with remaining commits
    for (let i = state.currentIndex + 1; i < state.commits.length; i++) {
      state.currentIndex = i;
      state.currentCommit = state.commits[i];
      this.saveState(state);

      const applyResult = this.applyCommit(state.commits[i], { noCommit: state.noCommit });
      
      if (applyResult.conflicts && applyResult.conflicts.length > 0) {
        return {
          success: false,
          commits: result.commits,
          conflicts: applyResult.conflicts,
        };
      }

      if (applyResult.newCommit) {
        result.commits.push(applyResult.newCommit);
      }
    }

    this.clearState();
    return result;
  }

  /**
   * Get file tree from a commit
   */
  private getFileTree(commitHash: string): Map<string, string> {
    const result = new Map<string, string>();
    const commit = this.repo.objects.readCommit(commitHash);
    this.flattenTree(commit.treeHash, '', result);
    return result;
  }

  /**
   * Get file tree from HEAD
   */
  private getHeadTree(): Map<string, string> {
    const result = new Map<string, string>();
    const headHash = this.repo.refs.resolve('HEAD');

    if (!headHash) {
      return result;
    }

    const commit = this.repo.objects.readCommit(headHash);
    this.flattenTree(commit.treeHash, '', result);
    return result;
  }

  /**
   * Flatten a tree into a map of path -> blob hash
   */
  private flattenTree(treeHash: string, prefix: string, result: Map<string, string>): void {
    const tree = this.repo.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      const fullPath = prefix ? prefix + '/' + entry.name : entry.name;

      if (entry.mode === '40000') {
        this.flattenTree(entry.hash, fullPath, result);
      } else {
        result.set(fullPath, entry.hash);
      }
    }
  }

  /**
   * Get default author info
   */
  private getDefaultAuthor(): Author {
    const name = process.env.WIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME || 'Anonymous';
    const email = process.env.WIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL || 'anonymous@example.com';

    return {
      name,
      email,
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

/**
 * CLI handler for cherry-pick command
 */
export function handleCherryPick(args: string[]): void {
  const repo = Repository.find();
  const manager = new CherryPickManager(repo, repo.gitDir);
  
  const options: CherryPickOptions = {};
  const commits: string[] = [];
  let action: 'pick' | 'continue' | 'abort' | 'skip' = 'pick';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--continue') {
      action = 'continue';
    } else if (arg === '--abort') {
      action = 'abort';
    } else if (arg === '--skip') {
      action = 'skip';
    } else if (arg === '-n' || arg === '--no-commit') {
      options.noCommit = true;
    } else if (arg === '--signoff' || arg === '-s') {
      options.signoff = true;
    } else if (arg === '--keep-redundant-commits') {
      options.keepRedundant = true;
    } else if (!arg.startsWith('-')) {
      commits.push(arg);
    }
  }

  try {
    switch (action) {
      case 'continue': {
        const result = manager.continue();
        if (result.success) {
          console.log(colors.green('✓') + ` Cherry-pick completed: ${result.commits.length} commit(s) applied`);
          for (const hash of result.commits) {
            console.log(`  ${colors.yellow(hash.slice(0, 8))}`);
          }
        } else {
          console.error(colors.red('error: ') + result.message);
          if (result.conflicts) {
            console.error('\nConflicts in:');
            for (const file of result.conflicts) {
              console.error(`  ${colors.red(file)}`);
            }
          }
          console.error('\nResolve conflicts and run:');
          console.error('  wit cherry-pick --continue');
          process.exit(1);
        }
        break;
      }

      case 'abort':
        manager.abort();
        console.log(colors.green('✓') + ' Cherry-pick aborted');
        break;

      case 'skip': {
        const result = manager.skip();
        console.log(colors.yellow('⚠') + ' Skipped commit');
        if (result.success) {
          console.log(colors.green('✓') + ` Cherry-pick completed: ${result.commits.length} commit(s) applied`);
        } else if (result.conflicts) {
          console.error(colors.red('error: ') + 'Conflicts in next commit');
          for (const file of result.conflicts) {
            console.error(`  ${colors.red(file)}`);
          }
          process.exit(1);
        }
        break;
      }

      case 'pick':
      default: {
        if (commits.length === 0) {
          console.error('error: No commit specified');
          console.error('\nUsage: wit cherry-pick [options] <commit>...');
          console.error('\nOptions:');
          console.error('  --continue        Continue after conflict resolution');
          console.error('  --abort           Abort the operation');
          console.error('  --skip            Skip current commit');
          console.error('  -n, --no-commit   Apply changes without committing');
          console.error('  -s, --signoff     Add signed-off-by line');
          process.exit(1);
        }

        const result = manager.cherryPick(commits, options);
        if (result.success) {
          console.log(colors.green('✓') + ` Cherry-pick completed: ${result.commits.length} commit(s) applied`);
          for (const hash of result.commits) {
            console.log(`  ${colors.yellow(hash.slice(0, 8))}`);
          }
        } else {
          console.error(colors.red('error: ') + result.message);
          if (result.conflicts) {
            console.error('\nConflicts in:');
            for (const file of result.conflicts) {
              console.error(`  ${colors.red(file)}`);
            }
          }
          console.error('\nResolve conflicts and run:');
          console.error('  wit cherry-pick --continue');
          console.error('\nOr abort with:');
          console.error('  wit cherry-pick --abort');
          process.exit(1);
        }
        break;
      }
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
