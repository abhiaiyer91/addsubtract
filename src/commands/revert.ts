/**
 * Revert Command
 * Create commits that undo the changes from previous commits
 * 
 * Usage:
 *   wit revert <commit>           Revert a single commit
 *   wit revert <c1> <c2>          Revert multiple commits
 *   wit revert --no-commit <c>    Revert without committing
 *   wit revert --continue         Continue after conflict resolution
 *   wit revert --abort            Abort the operation
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { Commit } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';
import { Author } from '../core/types';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';
import { colors } from '../utils/colors';

/**
 * Revert state saved during multi-commit or conflict resolution
 */
export interface RevertState {
  inProgress: boolean;
  commits: string[];           // All commits to revert
  currentIndex: number;        // Index of current commit being reverted
  currentCommit: string;       // Hash of current commit
  originalBranch: string | null;
  originalHead: string;
  noCommit: boolean;           // --no-commit flag
  applied: string[];           // Successfully created revert commits
  startedAt: number;
}

/**
 * Revert options
 */
export interface RevertOptions {
  noCommit?: boolean;          // -n, --no-commit: Apply changes but don't commit
  signoff?: boolean;           // Add signed-off-by line
  mainline?: number;           // -m: For merge commits, specify parent
  noEdit?: boolean;            // Don't edit commit message
}

/**
 * Revert result
 */
export interface RevertResult {
  success: boolean;
  commits: string[];           // Created revert commit hashes
  conflicts?: string[];        // Files with conflicts
  message?: string;
}

/**
 * Revert manager handles the revert operation state
 */
export class RevertManager {
  private statePath: string;

  constructor(
    private repo: Repository,
    private gitDir: string
  ) {
    this.statePath = path.join(gitDir, 'REVERT_STATE.json');
  }

  /**
   * Check if a revert is in progress
   */
  isInProgress(): boolean {
    return exists(this.statePath);
  }

  /**
   * Get current revert state
   */
  getState(): RevertState | null {
    if (!this.isInProgress()) {
      return null;
    }

    try {
      const content = readFile(this.statePath).toString('utf8');
      return JSON.parse(content) as RevertState;
    } catch {
      return null;
    }
  }

  /**
   * Save revert state
   */
  private saveState(state: RevertState): void {
    writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Clear revert state
   */
  private clearState(): void {
    if (exists(this.statePath)) {
      require('fs').unlinkSync(this.statePath);
    }
  }

  /**
   * Revert one or more commits
   */
  revert(commitRefs: string[], options: RevertOptions = {}): RevertResult {
    if (this.isInProgress()) {
      throw new TsgitError(
        'A revert is already in progress',
        ErrorCode.OPERATION_FAILED,
        [
          'wit revert --continue    # Continue after resolving conflicts',
          'wit revert --abort        # Abort the revert',
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
        ['wit revert <commit>    # Specify a commit to revert']
      );
    }

    // Check for uncommitted changes (unless --no-commit)
    if (!options.noCommit) {
      const status = this.repo.status();
      if (status.modified.length > 0 || status.staged.length > 0) {
        throw new TsgitError(
          'You have uncommitted changes',
          ErrorCode.UNCOMMITTED_CHANGES,
          [
            'wit stash              # Stash your changes',
            'wit commit -m "WIP"    # Commit your changes first',
            'wit revert -n <commit> # Revert without committing',
          ]
        );
      }
    }

    // Save initial state for potential abort
    const state: RevertState = {
      inProgress: true,
      commits,
      currentIndex: 0,
      currentCommit: commits[0],
      originalBranch: this.repo.refs.getCurrentBranch(),
      originalHead: this.repo.refs.resolve('HEAD') || '',
      noCommit: options.noCommit || false,
      applied: [],
      startedAt: Date.now(),
    };

    // Revert commits one by one (in order - each creates its own revert commit)
    const result: RevertResult = {
      success: true,
      commits: [],
    };

    for (let i = 0; i < commits.length; i++) {
      state.currentIndex = i;
      state.currentCommit = commits[i];
      
      const revertResult = this.revertCommit(commits[i], options);
      
      if (revertResult.conflicts && revertResult.conflicts.length > 0) {
        // Save state for later continue
        this.saveState(state);
        return {
          success: false,
          commits: result.commits,
          conflicts: revertResult.conflicts,
          message: `Revert stopped due to conflicts in ${revertResult.conflicts.length} file(s)`,
        };
      }

      if (revertResult.newCommit) {
        result.commits.push(revertResult.newCommit);
        state.applied.push(revertResult.newCommit);
      }
    }

    return result;
  }

  /**
   * Revert a single commit
   */
  private revertCommit(
    commitHash: string,
    options: RevertOptions
  ): { newCommit?: string; conflicts?: string[] } {
    const commit = this.repo.objects.readCommit(commitHash);
    
    // Get the parent commit (we're reversing the diff from parent -> commit)
    let parentHash = commit.parentHashes[0];

    // Handle merge commits
    if (commit.parentHashes.length > 1) {
      if (options.mainline === undefined) {
        throw new TsgitError(
          `Commit ${commitHash.slice(0, 8)} is a merge commit. Use -m to specify the parent.`,
          ErrorCode.INVALID_ARGUMENT,
          [
            'wit revert -m 1 <commit>    # Use first parent',
            'wit revert -m 2 <commit>    # Use second parent',
          ]
        );
      }
      
      const parentIndex = options.mainline - 1;
      if (parentIndex < 0 || parentIndex >= commit.parentHashes.length) {
        throw new TsgitError(
          `Invalid mainline ${options.mainline}. Commit has ${commit.parentHashes.length} parents.`,
          ErrorCode.INVALID_ARGUMENT
        );
      }
      parentHash = commit.parentHashes[parentIndex];
    }

    if (!parentHash) {
      throw new TsgitError(
        `Cannot revert initial commit ${commitHash.slice(0, 8)}`,
        ErrorCode.OPERATION_FAILED,
        ['Initial commits have no parent to revert to']
      );
    }

    // Get the trees
    const parentTree = this.getFileTree(parentHash);
    const commitTree = this.getFileTree(commitHash);
    const headTree = this.getHeadTree();

    // Calculate the changes in the commit (we'll reverse these)
    const changes = this.calculateDiff(parentTree, commitTree);

    // Apply reversed changes
    const conflicts: string[] = [];
    
    for (const [filePath, change] of changes) {
      const headBlob = headTree.get(filePath);
      
      // Reverse the change
      if (change.type === 'add') {
        // Original added file, we need to delete it
        if (headBlob === change.newHash) {
          // File is in same state as commit, safe to delete
          this.applyFileChange(filePath, { type: 'delete', oldHash: change.newHash });
        } else if (headBlob) {
          // File was modified after the commit, conflict
          conflicts.push(filePath);
          this.writeConflictMarkers(filePath, change.newHash, headBlob, 'delete');
        }
        // If file doesn't exist, already reverted or deleted
      } else if (change.type === 'delete') {
        // Original deleted file, we need to restore it
        if (!headBlob) {
          // File still doesn't exist, safe to restore
          this.applyFileChange(filePath, { type: 'add', newHash: change.oldHash });
        } else if (headBlob === change.oldHash) {
          // File was already restored
          continue;
        } else {
          // File exists with different content, conflict
          conflicts.push(filePath);
          this.writeConflictMarkers(filePath, change.oldHash!, headBlob, 'restore');
        }
      } else if (change.type === 'modify') {
        // Original modified file, we need to restore to old state
        if (headBlob === change.newHash) {
          // File is in same state as commit, safe to revert
          this.applyFileChange(filePath, { type: 'modify', newHash: change.oldHash });
        } else if (headBlob === change.oldHash) {
          // Already reverted
          continue;
        } else if (!headBlob) {
          // File was deleted after commit
          // Try to restore original
          this.applyFileChange(filePath, { type: 'add', newHash: change.oldHash });
        } else {
          // File was modified differently, try to merge/conflict
          const merged = this.tryReverseMerge(filePath, change, headBlob);
          if (!merged) {
            conflicts.push(filePath);
            this.writeConflictMarkers(filePath, change.oldHash!, headBlob, 'revert');
          }
        }
      }
    }

    if (conflicts.length > 0) {
      return { conflicts };
    }

    // Create the revert commit (unless --no-commit)
    if (!options.noCommit) {
      const newHash = this.createRevertCommit(commit, commitHash, options);
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
   * Try to reverse-merge changes
   */
  private tryReverseMerge(
    filePath: string,
    change: { oldHash?: string; newHash?: string },
    headHash: string
  ): boolean {
    // Get file contents
    const targetContent = change.oldHash 
      ? this.repo.objects.readBlob(change.oldHash).toString()
      : '';
    const commitContent = this.repo.objects.readBlob(change.newHash!).toString();
    const headContent = this.repo.objects.readBlob(headHash).toString();

    // If head has the commit changes, we can simply apply the target
    if (headContent === commitContent) {
      const fullPath = path.join(this.repo.workDir, filePath);
      mkdirp(path.dirname(fullPath));
      writeFile(fullPath, targetContent);
      this.repo.add(filePath);
      this.repo.index.save();
      return true;
    }

    // If head already has target content, nothing to do
    if (headContent === targetContent) {
      return true;
    }

    // Cannot auto-merge
    return false;
  }

  /**
   * Write conflict markers for revert
   */
  private writeConflictMarkers(
    filePath: string,
    targetHash: string | undefined,
    headHash: string,
    operation: 'delete' | 'restore' | 'revert'
  ): void {
    const headContent = this.repo.objects.readBlob(headHash).toString();
    const targetContent = targetHash 
      ? this.repo.objects.readBlob(targetHash).toString()
      : '';

    let conflictContent: string;
    if (operation === 'delete') {
      conflictContent = `<<<<<<< HEAD
${headContent}
=======
(file should be deleted by revert)
>>>>>>> revert
`;
    } else if (operation === 'restore') {
      conflictContent = `<<<<<<< HEAD
${headContent}
=======
${targetContent}
>>>>>>> revert (restore deleted file)
`;
    } else {
      conflictContent = `<<<<<<< HEAD
${headContent}
=======
${targetContent}
>>>>>>> revert
`;
    }

    const fullPath = path.join(this.repo.workDir, filePath);
    mkdirp(path.dirname(fullPath));
    writeFile(fullPath, conflictContent);
  }

  /**
   * Create a revert commit
   */
  private createRevertCommit(
    originalCommit: Commit,
    originalHash: string,
    options: RevertOptions
  ): string {
    // Build revert commit message
    const originalMessage = originalCommit.message.split('\n')[0];
    let message = `Revert "${originalMessage}"

This reverts commit ${originalHash}.`;

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
      'revert',
      [originalHash.slice(0, 8)],
      `Reverted ${originalHash.slice(0, 8)}`,
      beforeState,
      afterState,
      { commitHash: hash }
    );

    return hash;
  }

  /**
   * Continue revert after conflict resolution
   */
  continue(): RevertResult {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No revert in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Create commit for current revert
    const commit = this.repo.objects.readCommit(state.currentCommit);
    const originalMessage = commit.message.split('\n')[0];
    const message = `Revert "${originalMessage}"

This reverts commit ${state.currentCommit}.`;
    
    const newHash = this.repo.commit(message);

    const result: RevertResult = {
      success: true,
      commits: [...state.applied, newHash],
    };

    // Continue with remaining commits
    for (let i = state.currentIndex + 1; i < state.commits.length; i++) {
      state.currentIndex = i;
      state.currentCommit = state.commits[i];
      this.saveState(state);

      const revertResult = this.revertCommit(state.commits[i], { noCommit: state.noCommit });
      
      if (revertResult.conflicts && revertResult.conflicts.length > 0) {
        return {
          success: false,
          commits: result.commits,
          conflicts: revertResult.conflicts,
          message: `Revert stopped due to conflicts in ${revertResult.conflicts.length} file(s)`,
        };
      }

      if (revertResult.newCommit) {
        result.commits.push(revertResult.newCommit);
      }
    }

    // All done, clear state
    this.clearState();
    return result;
  }

  /**
   * Abort revert operation
   */
  abort(): void {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No revert in progress',
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
  skip(): RevertResult {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No revert in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Reset working directory
    const headHash = this.repo.refs.resolve('HEAD');
    if (headHash) {
      this.repo.checkout(headHash);
    }

    const result: RevertResult = {
      success: true,
      commits: [...state.applied],
    };

    // Continue with remaining commits
    for (let i = state.currentIndex + 1; i < state.commits.length; i++) {
      state.currentIndex = i;
      state.currentCommit = state.commits[i];
      this.saveState(state);

      const revertResult = this.revertCommit(state.commits[i], { noCommit: state.noCommit });
      
      if (revertResult.conflicts && revertResult.conflicts.length > 0) {
        return {
          success: false,
          commits: result.commits,
          conflicts: revertResult.conflicts,
        };
      }

      if (revertResult.newCommit) {
        result.commits.push(revertResult.newCommit);
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
 * CLI handler for revert command
 */
export function handleRevert(args: string[]): void {
  const repo = Repository.find();
  const manager = new RevertManager(repo, repo.gitDir);
  
  const options: RevertOptions = {};
  const commits: string[] = [];
  let action: 'revert' | 'continue' | 'abort' | 'skip' = 'revert';

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
    } else if (arg === '--no-edit') {
      options.noEdit = true;
    } else if (arg === '-m' || arg === '--mainline') {
      options.mainline = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      commits.push(arg);
    }
  }

  try {
    switch (action) {
      case 'continue': {
        const result = manager.continue();
        if (result.success) {
          console.log(colors.green('✓') + ` Revert completed: ${result.commits.length} commit(s) reverted`);
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
          console.error('  wit revert --continue');
          process.exit(1);
        }
        break;
      }

      case 'abort':
        manager.abort();
        console.log(colors.green('✓') + ' Revert aborted');
        break;

      case 'skip': {
        const result = manager.skip();
        console.log(colors.yellow('⚠') + ' Skipped commit');
        if (result.success) {
          console.log(colors.green('✓') + ` Revert completed: ${result.commits.length} commit(s) reverted`);
        } else if (result.conflicts) {
          console.error(colors.red('error: ') + 'Conflicts in next commit');
          for (const file of result.conflicts) {
            console.error(`  ${colors.red(file)}`);
          }
          process.exit(1);
        }
        break;
      }

      case 'revert':
      default: {
        if (commits.length === 0) {
          console.error('error: No commit specified');
          console.error('\nUsage: wit revert [options] <commit>...');
          console.error('\nOptions:');
          console.error('  --continue           Continue after conflict resolution');
          console.error('  --abort              Abort the operation');
          console.error('  --skip               Skip current commit');
          console.error('  -n, --no-commit      Revert without committing');
          console.error('  -m, --mainline <n>   Parent number for merge commits');
          console.error('  -s, --signoff        Add signed-off-by line');
          console.error('\nExamples:');
          console.error('  wit revert abc123              # Revert commit abc123');
          console.error('  wit revert -n abc123           # Revert without committing');
          console.error('  wit revert -m 1 <merge>        # Revert merge using first parent');
          process.exit(1);
        }

        const result = manager.revert(commits, options);
        if (result.success) {
          if (options.noCommit) {
            console.log(colors.green('✓') + ' Changes applied to working directory');
            console.log(colors.dim('  Use `wit commit` to commit the reverted changes'));
          } else {
            console.log(colors.green('✓') + ` Revert completed: ${result.commits.length} commit(s) created`);
            for (const hash of result.commits) {
              console.log(`  ${colors.yellow(hash.slice(0, 8))}`);
            }
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
          console.error('  wit revert --continue');
          console.error('\nOr abort with:');
          console.error('  wit revert --abort');
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
