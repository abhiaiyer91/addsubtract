/**
 * Rebase Command
 * Reapply commits on top of another base branch
 * 
 * Usage:
 *   wit rebase <branch>           Rebase onto branch
 *   wit rebase --onto <new> <old> Rebase onto specific base
 *   wit rebase --continue         Continue after conflict resolution
 *   wit rebase --abort            Abort the rebase
 *   wit rebase --skip             Skip current commit
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { Commit, Tree, Blob } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';
import { Author, TreeEntry } from '../core/types';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

/**
 * Rebase state saved during operation
 */
export interface RebaseState {
  inProgress: boolean;
  type: 'rebase' | 'rebase-onto';
  // Source info
  originalBranch: string | null;
  originalHead: string;
  // Target info
  ontoBranch: string;
  ontoCommit: string;
  // For --onto
  upstreamBranch?: string;
  upstreamCommit?: string;
  // Commits to rebase
  commits: string[];
  currentIndex: number;
  currentCommit: string;
  // Applied commits (new hashes)
  applied: string[];
  startedAt: number;
}

/**
 * Rebase options
 */
export interface RebaseOptions {
  onto?: string;           // --onto flag
  upstream?: string;       // For --onto: the upstream limit
  interactive?: boolean;   // -i flag (not implemented yet)
  autostash?: boolean;     // Automatically stash changes
  noVerify?: boolean;      // Skip pre-commit hooks
}

/**
 * Rebase result
 */
export interface RebaseResult {
  success: boolean;
  commits: string[];       // New commit hashes
  conflicts?: string[];    // Files with conflicts
  message?: string;
}

/**
 * Rebase manager handles the rebase operation state
 */
export class RebaseManager {
  private statePath: string;

  constructor(
    private repo: Repository,
    private gitDir: string
  ) {
    this.statePath = path.join(gitDir, 'REBASE_STATE.json');
  }

  /**
   * Check if a rebase is in progress
   */
  isInProgress(): boolean {
    return exists(this.statePath);
  }

  /**
   * Get current rebase state
   */
  getState(): RebaseState | null {
    if (!this.isInProgress()) {
      return null;
    }

    try {
      const content = readFile(this.statePath).toString('utf8');
      return JSON.parse(content) as RebaseState;
    } catch {
      return null;
    }
  }

  /**
   * Save rebase state
   */
  private saveState(state: RebaseState): void {
    writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Clear rebase state
   */
  private clearState(): void {
    if (exists(this.statePath)) {
      require('fs').unlinkSync(this.statePath);
    }
  }

  /**
   * Start a rebase operation
   */
  rebase(targetRef: string, options: RebaseOptions = {}): RebaseResult {
    if (this.isInProgress()) {
      throw new TsgitError(
        'A rebase is already in progress',
        ErrorCode.OPERATION_FAILED,
        [
          'wit rebase --continue    # Continue after resolving conflicts',
          'wit rebase --abort        # Abort the rebase',
        ]
      );
    }

    // Check for uncommitted changes
    const status = this.repo.status();
    if (status.modified.length > 0 || status.staged.length > 0) {
      if (options.autostash) {
        // Auto-stash would go here
        throw new TsgitError(
          'Autostash not yet implemented. Please commit or stash your changes.',
          ErrorCode.UNCOMMITTED_CHANGES
        );
      }
      throw new TsgitError(
        'You have uncommitted changes',
        ErrorCode.UNCOMMITTED_CHANGES,
        [
          'wit stash              # Stash your changes',
          'wit commit -m "WIP"    # Commit your changes first',
        ]
      );
    }

    // Resolve target (onto) commit
    const ontoHash = this.repo.refs.resolve(options.onto || targetRef);
    if (!ontoHash) {
      throw new TsgitError(
        `bad revision '${options.onto || targetRef}'`,
        ErrorCode.REF_NOT_FOUND
      );
    }

    // Get current branch
    const currentBranch = this.repo.refs.getCurrentBranch();
    const headHash = this.repo.refs.resolve('HEAD');
    if (!headHash) {
      throw new TsgitError(
        'No commits on current branch',
        ErrorCode.NO_COMMITS_YET
      );
    }

    // Find the merge base (fork point)
    const upstreamHash = options.upstream 
      ? this.repo.refs.resolve(options.upstream) 
      : this.repo.refs.resolve(targetRef);
    
    if (!upstreamHash) {
      throw new TsgitError(
        `bad revision '${options.upstream || targetRef}'`,
        ErrorCode.REF_NOT_FOUND
      );
    }

    const mergeBase = this.findMergeBase(headHash, upstreamHash);

    // Get commits to rebase (from merge base to HEAD)
    const commitsToRebase = this.getCommitsToRebase(mergeBase, headHash);

    if (commitsToRebase.length === 0) {
      // Nothing to rebase
      if (mergeBase === headHash) {
        // Just fast-forward
        if (currentBranch) {
          this.repo.refs.updateBranch(currentBranch, ontoHash);
        } else {
          this.repo.refs.setHeadDetached(ontoHash);
        }
        this.repo.checkout(ontoHash);
        return {
          success: true,
          commits: [],
          message: 'Fast-forwarded to target',
        };
      }
      return {
        success: true,
        commits: [],
        message: 'Already up to date',
      };
    }

    // Save initial state
    const state: RebaseState = {
      inProgress: true,
      type: options.onto ? 'rebase-onto' : 'rebase',
      originalBranch: currentBranch,
      originalHead: headHash,
      ontoBranch: options.onto || targetRef,
      ontoCommit: ontoHash,
      upstreamBranch: options.upstream,
      upstreamCommit: upstreamHash,
      commits: commitsToRebase,
      currentIndex: 0,
      currentCommit: commitsToRebase[0],
      applied: [],
      startedAt: Date.now(),
    };

    // Move HEAD to onto commit
    this.repo.refs.setHeadDetached(ontoHash);
    this.repo.checkout(ontoHash);

    // Apply commits one by one
    return this.applyCommits(state);
  }

  /**
   * Apply commits during rebase
   */
  private applyCommits(state: RebaseState): RebaseResult {
    const result: RebaseResult = {
      success: true,
      commits: [],
    };

    for (let i = state.currentIndex; i < state.commits.length; i++) {
      state.currentIndex = i;
      state.currentCommit = state.commits[i];
      this.saveState(state);

      const applyResult = this.applyCommit(state.commits[i]);
      
      if (applyResult.conflicts && applyResult.conflicts.length > 0) {
        return {
          success: false,
          commits: result.commits,
          conflicts: applyResult.conflicts,
          message: `Rebase stopped due to conflicts in ${applyResult.conflicts.length} file(s)`,
        };
      }

      if (applyResult.newCommit) {
        result.commits.push(applyResult.newCommit);
        state.applied.push(applyResult.newCommit);
        this.saveState(state);
      }
    }

    // All commits applied, finalize
    this.finalizeRebase(state);
    this.clearState();

    return result;
  }

  /**
   * Apply a single commit during rebase
   */
  private applyCommit(commitHash: string): { newCommit?: string; conflicts?: string[] } {
    const commit = this.repo.objects.readCommit(commitHash);
    const parentHash = commit.parentHashes[0];

    if (!parentHash) {
      // Root commit - just copy all files
      return this.applyRootCommit(commit, commitHash);
    }

    // Get the trees
    const parentTree = this.getFileTree(parentHash);
    const commitTree = this.getFileTree(commitHash);
    const headTree = this.getHeadTree();

    // Calculate the changes in the commit
    const changes = this.calculateDiff(parentTree, commitTree);

    // Apply changes
    const conflicts: string[] = [];
    
    for (const [filePath, change] of changes) {
      const headBlob = headTree.get(filePath);
      
      if (change.type === 'add') {
        if (headBlob && headBlob !== change.newHash) {
          conflicts.push(filePath);
          this.writeConflictMarkers(filePath, change, headBlob);
        } else {
          this.applyFileChange(filePath, change);
        }
      } else if (change.type === 'delete') {
        if (!headBlob || headBlob === change.oldHash) {
          this.applyFileChange(filePath, change);
        } else {
          conflicts.push(filePath);
        }
      } else if (change.type === 'modify') {
        if (!headBlob) {
          this.applyFileChange(filePath, change);
        } else if (headBlob === change.oldHash) {
          this.applyFileChange(filePath, change);
        } else if (headBlob === change.newHash) {
          continue;
        } else {
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

    // Create new commit
    const newHash = this.createCommit(commit);
    return { newCommit: newHash };
  }

  /**
   * Apply a root commit
   */
  private applyRootCommit(commit: Commit, commitHash: string): { newCommit?: string; conflicts?: string[] } {
    const commitTree = this.getFileTree(commitHash);
    const headTree = this.getHeadTree();
    const conflicts: string[] = [];

    for (const [filePath, blobHash] of commitTree) {
      const headBlob = headTree.get(filePath);
      if (headBlob && headBlob !== blobHash) {
        conflicts.push(filePath);
      } else {
        const blob = this.repo.objects.readBlob(blobHash);
        const fullPath = path.join(this.repo.workDir, filePath);
        mkdirp(path.dirname(fullPath));
        writeFile(fullPath, blob.content);
        this.repo.add(filePath);
      }
    }

    this.repo.index.save();

    if (conflicts.length > 0) {
      return { conflicts };
    }

    const newHash = this.createCommit(commit);
    return { newCommit: newHash };
  }

  /**
   * Finalize rebase: update branch to point to new HEAD
   */
  private finalizeRebase(state: RebaseState): void {
    const newHead = this.repo.refs.resolve('HEAD');
    if (!newHead) return;

    // Update original branch to point to rebased commits
    if (state.originalBranch) {
      this.repo.refs.updateBranch(state.originalBranch, newHead);
      this.repo.refs.setHeadSymbolic(`refs/heads/${state.originalBranch}`);
    }

    // Record in journal
    this.repo.journal.record(
      'rebase',
      [state.ontoBranch],
      `Rebased ${state.originalBranch || 'HEAD'} onto ${state.ontoBranch}`,
      {
        head: state.originalHead,
        branch: state.originalBranch,
        indexHash: '',
      },
      {
        head: newHead,
        branch: state.originalBranch,
        indexHash: '',
      },
      { commitHash: newHead }
    );
  }

  /**
   * Continue rebase after conflict resolution
   */
  continue(): RebaseResult {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No rebase in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Create commit for resolved conflicts
    const commit = this.repo.objects.readCommit(state.currentCommit);
    const newHash = this.repo.commit(commit.message);

    state.applied.push(newHash);
    state.currentIndex++;

    // Continue with remaining commits
    return this.applyCommits(state);
  }

  /**
   * Abort rebase operation
   */
  abort(): void {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No rebase in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Reset to original state
    if (state.originalBranch) {
      this.repo.refs.updateBranch(state.originalBranch, state.originalHead);
      this.repo.refs.setHeadSymbolic(`refs/heads/${state.originalBranch}`);
    } else {
      this.repo.refs.setHeadDetached(state.originalHead);
    }

    this.repo.checkout(state.originalHead);
    this.clearState();
  }

  /**
   * Skip current commit
   */
  skip(): RebaseResult {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No rebase in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Reset working directory
    const headHash = this.repo.refs.resolve('HEAD');
    if (headHash) {
      this.repo.checkout(headHash);
    }

    // Move to next commit
    state.currentIndex++;

    if (state.currentIndex >= state.commits.length) {
      // All done
      this.finalizeRebase(state);
      this.clearState();
      return {
        success: true,
        commits: state.applied,
      };
    }

    return this.applyCommits(state);
  }

  /**
   * Find merge base between two commits
   */
  private findMergeBase(hash1: string, hash2: string): string | undefined {
    const ancestors1 = this.getAncestors(hash1);
    const ancestors2 = this.getAncestors(hash2);

    for (const ancestor of ancestors1) {
      if (ancestors2.has(ancestor)) {
        return ancestor;
      }
    }

    return undefined;
  }

  /**
   * Get all ancestors of a commit
   */
  private getAncestors(hash: string): Set<string> {
    const ancestors = new Set<string>();
    const queue = [hash];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (ancestors.has(current)) continue;
      ancestors.add(current);

      try {
        const commit = this.repo.objects.readCommit(current);
        queue.push(...commit.parentHashes);
      } catch {
        // Commit not found, skip
      }
    }

    return ancestors;
  }

  /**
   * Get commits to rebase (from merge base to HEAD, exclusive of merge base)
   */
  private getCommitsToRebase(mergeBase: string | undefined, headHash: string): string[] {
    const commits: string[] = [];
    let current = headHash;

    while (current && current !== mergeBase) {
      commits.unshift(current);  // Prepend to get oldest first
      
      try {
        const commit = this.repo.objects.readCommit(current);
        if (commit.parentHashes.length === 0) {
          break;
        }
        current = commit.parentHashes[0];
      } catch {
        break;
      }
    }

    return commits;
  }

  /**
   * Calculate diff between two trees
   */
  private calculateDiff(
    oldTree: Map<string, string>,
    newTree: Map<string, string>
  ): Map<string, { type: 'add' | 'modify' | 'delete'; oldHash?: string; newHash?: string }> {
    const changes = new Map<string, { type: 'add' | 'modify' | 'delete'; oldHash?: string; newHash?: string }>();

    for (const [filePath, newHash] of newTree) {
      const oldHash = oldTree.get(filePath);
      if (!oldHash) {
        changes.set(filePath, { type: 'add', newHash });
      } else if (oldHash !== newHash) {
        changes.set(filePath, { type: 'modify', oldHash, newHash });
      }
    }

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
    const baseContent = change.oldHash 
      ? this.repo.objects.readBlob(change.oldHash).toString()
      : '';
    const changeContent = this.repo.objects.readBlob(change.newHash!).toString();
    const headContent = this.repo.objects.readBlob(headHash).toString();

    if (headContent === baseContent) {
      const fullPath = path.join(this.repo.workDir, filePath);
      mkdirp(path.dirname(fullPath));
      writeFile(fullPath, changeContent);
      this.repo.add(filePath);
      this.repo.index.save();
      return true;
    }

    if (changeContent === headContent) {
      return true;
    }

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
>>>>>>> rebase
`;

    const fullPath = path.join(this.repo.workDir, filePath);
    mkdirp(path.dirname(fullPath));
    writeFile(fullPath, conflictContent);
  }

  /**
   * Create a new commit preserving author info
   */
  private createCommit(originalCommit: Commit): string {
    const hash = this.repo.commit(originalCommit.message);
    return hash;
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
}

/**
 * CLI handler for rebase command
 */
export function handleRebase(args: string[]): void {
  const repo = Repository.find();
  const manager = new RebaseManager(repo, repo.gitDir);
  
  const options: RebaseOptions = {};
  let targetBranch: string | undefined;
  let action: 'rebase' | 'continue' | 'abort' | 'skip' = 'rebase';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--continue') {
      action = 'continue';
    } else if (arg === '--abort') {
      action = 'abort';
    } else if (arg === '--skip') {
      action = 'skip';
    } else if (arg === '--onto') {
      options.onto = args[++i];
    } else if (arg === '-i' || arg === '--interactive') {
      options.interactive = true;
      console.error(colors.yellow('warning: ') + 'Interactive rebase not yet supported');
    } else if (arg === '--autostash') {
      options.autostash = true;
    } else if (arg === '--no-verify') {
      options.noVerify = true;
    } else if (!arg.startsWith('-')) {
      if (options.onto && !options.upstream) {
        options.upstream = arg;
      } else {
        targetBranch = arg;
      }
    }
  }

  try {
    switch (action) {
      case 'continue': {
        const result = manager.continue();
        if (result.success) {
          console.log(colors.green('✓') + ` Rebase completed: ${result.commits.length} commit(s) applied`);
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
          console.error('  wit rebase --continue');
          process.exit(1);
        }
        break;
      }

      case 'abort':
        manager.abort();
        console.log(colors.green('✓') + ' Rebase aborted');
        break;

      case 'skip': {
        const result = manager.skip();
        console.log(colors.yellow('⚠') + ' Skipped commit');
        if (result.success) {
          console.log(colors.green('✓') + ` Rebase completed: ${result.commits.length} commit(s) applied`);
        } else if (result.conflicts) {
          console.error(colors.red('error: ') + 'Conflicts in next commit');
          for (const file of result.conflicts) {
            console.error(`  ${colors.red(file)}`);
          }
          process.exit(1);
        }
        break;
      }

      case 'rebase':
      default: {
        if (!targetBranch) {
          console.error('error: No branch specified');
          console.error('\nUsage: wit rebase [options] <branch>');
          console.error('\nOptions:');
          console.error('  --continue        Continue after conflict resolution');
          console.error('  --abort           Abort the rebase');
          console.error('  --skip            Skip current commit');
          console.error('  --onto <branch>   Rebase onto specific branch');
          console.error('  --autostash       Automatically stash and unstash');
          console.error('\nExamples:');
          console.error('  wit rebase main                    # Rebase onto main');
          console.error('  wit rebase --onto main feature     # Rebase onto main from feature');
          process.exit(1);
        }

        const result = manager.rebase(targetBranch, options);
        if (result.success) {
          if (result.message) {
            console.log(colors.green('✓') + ` ${result.message}`);
          } else {
            console.log(colors.green('✓') + ` Rebase completed: ${result.commits.length} commit(s) applied`);
          }
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
          console.error('  wit rebase --continue');
          console.error('\nOr abort with:');
          console.error('  wit rebase --abort');
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
