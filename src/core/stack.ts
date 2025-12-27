/**
 * Stack Manager - Stacked Diffs Support
 * 
 * Stacked diffs allow you to break down large features into smaller,
 * dependent branches that build on top of each other.
 * 
 * Example stack:
 *   main
 *     └── feature/part-1  (base change)
 *           └── feature/part-2  (builds on part-1)
 *                 └── feature/part-3  (builds on part-2)
 * 
 * Commands:
 *   stack create <name>     Start a new stack from current branch
 *   stack push [name]       Create a new branch on top of the stack
 *   stack list              Show all stacks
 *   stack show              Show current stack
 *   stack sync              Rebase entire stack when base changes
 *   stack submit            Push all branches for review
 *   stack pop               Remove top branch from stack
 *   stack reorder           Change order of branches in stack
 */

import * as path from 'path';
import { exists, readFile, writeFile, mkdirp, readDir } from '../utils/fs';
import { Repository } from './repository';
import { TsgitError, ErrorCode } from './errors';
import { RebaseManager } from '../commands/rebase';

/**
 * Metadata for a single stack
 */
export interface StackMetadata {
  /** Unique name for the stack */
  name: string;
  /** The base branch (e.g., 'main') */
  baseBranch: string;
  /** The commit hash of the base when stack was created */
  baseCommit: string;
  /** Ordered list of branches in the stack (from bottom to top) */
  branches: string[];
  /** When the stack was created */
  createdAt: number;
  /** Last time the stack was modified */
  updatedAt: number;
  /** Description of the stack */
  description?: string;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  /** Branches that were successfully rebased */
  synced: string[];
  /** Branches that had conflicts */
  conflicts: { branch: string; files: string[] }[];
  /** Error message if sync failed */
  message?: string;
}

/**
 * Result of a submit operation
 */
export interface SubmitResult {
  success: boolean;
  /** Branches that were pushed */
  pushed: string[];
  /** Branches that failed to push */
  failed: { branch: string; error: string }[];
}

/**
 * Stack visualization node
 */
export interface StackNode {
  branch: string;
  commit: string;
  message: string;
  isCurrent: boolean;
  status: 'synced' | 'behind' | 'ahead' | 'diverged';
  behindBy?: number;
  aheadBy?: number;
}

/**
 * Stack Manager handles stacked diff operations
 */
export class StackManager {
  private stackDir: string;
  private metaFile: string;

  constructor(
    private repo: Repository,
    private gitDir: string
  ) {
    this.stackDir = path.join(gitDir, 'stacks');
    this.metaFile = path.join(this.stackDir, 'stacks.json');
  }

  /**
   * Initialize the stack directory
   */
  init(): void {
    mkdirp(this.stackDir);
    if (!exists(this.metaFile)) {
      writeFile(this.metaFile, JSON.stringify({ stacks: [] }, null, 2));
    }
  }

  /**
   * Get all stack names
   */
  listStacks(): string[] {
    this.init();
    const meta = this.loadMeta();
    return meta.stacks;
  }

  /**
   * Get metadata for a specific stack
   */
  getStack(name: string): StackMetadata | null {
    const stackPath = path.join(this.stackDir, `${name}.json`);
    if (!exists(stackPath)) {
      return null;
    }

    try {
      const content = readFile(stackPath).toString('utf8');
      return JSON.parse(content) as StackMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Find which stack a branch belongs to
   */
  findStackForBranch(branchName: string): StackMetadata | null {
    const stacks = this.listStacks();
    for (const stackName of stacks) {
      const stack = this.getStack(stackName);
      if (stack && stack.branches.includes(branchName)) {
        return stack;
      }
    }
    return null;
  }

  /**
   * Get the current stack (based on current branch)
   */
  getCurrentStack(): StackMetadata | null {
    const currentBranch = this.repo.refs.getCurrentBranch();
    if (!currentBranch) {
      return null;
    }
    return this.findStackForBranch(currentBranch);
  }

  /**
   * Create a new stack starting from the current branch
   */
  create(name: string, description?: string): StackMetadata {
    this.init();

    // Check if stack already exists
    if (this.getStack(name)) {
      throw new TsgitError(
        `Stack '${name}' already exists`,
        ErrorCode.OPERATION_FAILED,
        ['wit stack list    # View existing stacks']
      );
    }

    // Get current branch as base
    const currentBranch = this.repo.refs.getCurrentBranch();
    if (!currentBranch) {
      throw new TsgitError(
        'Cannot create stack: HEAD is detached',
        ErrorCode.DETACHED_HEAD,
        ['wit switch <branch>    # Switch to a branch first']
      );
    }

    const headHash = this.repo.refs.resolve('HEAD');
    if (!headHash) {
      throw new TsgitError(
        'Cannot create stack: no commits yet',
        ErrorCode.NO_COMMITS_YET
      );
    }

    const stack: StackMetadata = {
      name,
      baseBranch: currentBranch,
      baseCommit: headHash,
      branches: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      description,
    };

    this.saveStack(stack);
    this.addStackToMeta(name);

    return stack;
  }

  /**
   * Push a new branch onto the stack
   */
  push(branchName?: string): { stack: StackMetadata; branch: string } {
    const currentBranch = this.repo.refs.getCurrentBranch();
    if (!currentBranch) {
      throw new TsgitError(
        'Cannot push to stack: HEAD is detached',
        ErrorCode.DETACHED_HEAD
      );
    }

    // Find the stack for current branch
    let stack = this.findStackForBranch(currentBranch);
    
    // If not in a stack, check if current branch is a base branch
    if (!stack) {
      const stacks = this.listStacks();
      for (const stackName of stacks) {
        const s = this.getStack(stackName);
        if (s && s.baseBranch === currentBranch) {
          stack = s;
          break;
        }
      }
    }

    if (!stack) {
      throw new TsgitError(
        `Branch '${currentBranch}' is not part of any stack`,
        ErrorCode.OPERATION_FAILED,
        [
          'wit stack create <name>    # Create a new stack first',
          'wit stack list             # View existing stacks',
        ]
      );
    }

    // Generate branch name if not provided
    const newBranchName = branchName || this.generateBranchName(stack);

    // Check if branch already exists
    if (this.repo.refs.branchExists(newBranchName)) {
      throw new TsgitError(
        `Branch '${newBranchName}' already exists`,
        ErrorCode.BRANCH_EXISTS,
        [`wit switch ${newBranchName}    # Switch to existing branch`]
      );
    }

    // Get current HEAD
    const headHash = this.repo.refs.resolve('HEAD');
    if (!headHash) {
      throw new TsgitError(
        'Cannot push to stack: no commits yet',
        ErrorCode.NO_COMMITS_YET
      );
    }

    // Create the new branch
    this.repo.refs.createBranch(newBranchName, headHash);
    this.repo.refs.setHeadSymbolic(`refs/heads/${newBranchName}`);

    // Add to stack
    stack.branches.push(newBranchName);
    stack.updatedAt = Date.now();
    this.saveStack(stack);

    return { stack, branch: newBranchName };
  }

  /**
   * Pop the top branch from the stack (does not delete the branch)
   */
  pop(): { stack: StackMetadata; branch: string } {
    const stack = this.getCurrentStack();
    if (!stack) {
      throw new TsgitError(
        'Not currently on a stacked branch',
        ErrorCode.OPERATION_FAILED,
        ['wit stack list    # View existing stacks']
      );
    }

    if (stack.branches.length === 0) {
      throw new TsgitError(
        'Stack is empty, nothing to pop',
        ErrorCode.OPERATION_FAILED
      );
    }

    const poppedBranch = stack.branches.pop()!;
    stack.updatedAt = Date.now();
    this.saveStack(stack);

    // Switch to the parent branch
    const parentBranch = stack.branches.length > 0 
      ? stack.branches[stack.branches.length - 1] 
      : stack.baseBranch;
    
    this.repo.checkout(parentBranch);

    return { stack, branch: poppedBranch };
  }

  /**
   * Sync the entire stack by rebasing each branch onto its parent
   */
  sync(): SyncResult {
    const stack = this.getCurrentStack();
    if (!stack) {
      throw new TsgitError(
        'Not currently on a stacked branch',
        ErrorCode.OPERATION_FAILED,
        ['wit stack list    # View existing stacks']
      );
    }

    const result: SyncResult = {
      success: true,
      synced: [],
      conflicts: [],
    };

    // Save current branch to return to later
    const originalBranch = this.repo.refs.getCurrentBranch();

    // Update base commit to latest
    const newBaseCommit = this.repo.refs.resolve(stack.baseBranch);
    if (!newBaseCommit) {
      throw new TsgitError(
        `Base branch '${stack.baseBranch}' not found`,
        ErrorCode.BRANCH_NOT_FOUND,
        []
      );
    }

    // If base hasn't changed and no branches need syncing, we're done
    if (newBaseCommit === stack.baseCommit && stack.branches.length === 0) {
      return result;
    }

    const rebaseManager = new RebaseManager(this.repo, this.gitDir);

    // Rebase each branch in order
    let parentBranch = stack.baseBranch;
    for (const branch of stack.branches) {
      // Switch to the branch
      this.repo.checkout(branch);

      // Check if rebase is needed
      const branchCommit = this.repo.refs.resolve(branch);
      const parentCommit = this.repo.refs.resolve(parentBranch);
      
      if (!branchCommit || !parentCommit) {
        result.conflicts.push({ branch, files: [] });
        result.success = false;
        continue;
      }

      // Check if branch is already up to date with parent
      const mergeBase = this.findMergeBase(branchCommit, parentCommit);
      if (mergeBase === parentCommit) {
        result.synced.push(branch);
        parentBranch = branch;
        continue;
      }

      try {
        const rebaseResult = rebaseManager.rebase(parentBranch);
        
        if (rebaseResult.success) {
          result.synced.push(branch);
        } else {
          result.conflicts.push({
            branch,
            files: rebaseResult.conflicts || [],
          });
          result.success = false;
          result.message = `Sync stopped at branch '${branch}' due to conflicts`;
          break;
        }
      } catch (error) {
        result.conflicts.push({
          branch,
          files: [],
        });
        result.success = false;
        result.message = error instanceof Error ? error.message : 'Unknown error';
        break;
      }

      parentBranch = branch;
    }

    // Update stack metadata
    if (result.success) {
      stack.baseCommit = newBaseCommit;
      stack.updatedAt = Date.now();
      this.saveStack(stack);
    }

    // Return to original branch if possible
    if (originalBranch && result.success) {
      this.repo.checkout(originalBranch);
    }

    return result;
  }

  /**
   * Submit (push) all branches in the stack
   */
  submit(remote: string = 'origin', force: boolean = false): SubmitResult {
    const stack = this.getCurrentStack();
    if (!stack) {
      throw new TsgitError(
        'Not currently on a stacked branch',
        ErrorCode.OPERATION_FAILED,
        ['wit stack list    # View existing stacks']
      );
    }

    const result: SubmitResult = {
      success: true,
      pushed: [],
      failed: [],
    };

    // Push each branch
    for (const branch of stack.branches) {
      try {
        // Note: This would need to integrate with the remote push functionality
        // For now, we'll just validate that the branches exist
        if (!this.repo.refs.branchExists(branch)) {
          result.failed.push({ branch, error: 'Branch not found' });
          result.success = false;
          continue;
        }
        result.pushed.push(branch);
      } catch (error) {
        result.failed.push({
          branch,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        result.success = false;
      }
    }

    return result;
  }

  /**
   * Get a visual representation of the stack
   */
  visualize(stackName?: string): StackNode[] {
    const stack = stackName ? this.getStack(stackName) : this.getCurrentStack();
    if (!stack) {
      return [];
    }

    const currentBranch = this.repo.refs.getCurrentBranch();
    const nodes: StackNode[] = [];

    // Add base branch
    const baseCommit = this.repo.refs.resolve(stack.baseBranch);
    if (baseCommit) {
      const commit = this.repo.objects.readCommit(baseCommit);
      nodes.push({
        branch: stack.baseBranch + ' (base)',
        commit: baseCommit.slice(0, 8),
        message: commit.message.split('\n')[0],
        isCurrent: currentBranch === stack.baseBranch,
        status: 'synced',
      });
    }

    // Add stack branches
    let parentCommit = baseCommit;
    for (const branch of stack.branches) {
      const branchCommit = this.repo.refs.resolve(branch);
      if (!branchCommit) continue;

      const commit = this.repo.objects.readCommit(branchCommit);
      const status = this.getBranchStatus(branchCommit, parentCommit);

      nodes.push({
        branch,
        commit: branchCommit.slice(0, 8),
        message: commit.message.split('\n')[0],
        isCurrent: currentBranch === branch,
        status: status.status,
        behindBy: status.behind,
        aheadBy: status.ahead,
      });

      parentCommit = branchCommit;
    }

    return nodes;
  }

  /**
   * Reorder branches in the stack
   */
  reorder(newOrder: string[]): StackMetadata {
    const stack = this.getCurrentStack();
    if (!stack) {
      throw new TsgitError(
        'Not currently on a stacked branch',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Validate that all branches are in the new order
    const currentSet = new Set(stack.branches);
    const newSet = new Set(newOrder);

    if (currentSet.size !== newSet.size) {
      throw new TsgitError(
        'New order must contain exactly the same branches',
        ErrorCode.INVALID_ARGUMENT
      );
    }

    for (const branch of stack.branches) {
      if (!newSet.has(branch)) {
        throw new TsgitError(
          `Branch '${branch}' is missing from new order`,
          ErrorCode.INVALID_ARGUMENT
        );
      }
    }

    stack.branches = newOrder;
    stack.updatedAt = Date.now();
    this.saveStack(stack);

    return stack;
  }

  /**
   * Delete a stack (does not delete branches)
   */
  delete(name: string): void {
    const stack = this.getStack(name);
    if (!stack) {
      throw new TsgitError(
        `Stack '${name}' not found`,
        ErrorCode.OPERATION_FAILED,
        ['wit stack list    # View existing stacks']
      );
    }

    // Remove stack file
    const stackPath = path.join(this.stackDir, `${name}.json`);
    if (exists(stackPath)) {
      require('fs').unlinkSync(stackPath);
    }

    // Remove from meta
    this.removeStackFromMeta(name);
  }

  /**
   * Navigate to a specific branch in the stack
   */
  goto(branchOrIndex: string | number): string {
    const stack = this.getCurrentStack();
    if (!stack) {
      throw new TsgitError(
        'Not currently on a stacked branch',
        ErrorCode.OPERATION_FAILED
      );
    }

    let targetBranch: string;

    if (typeof branchOrIndex === 'number') {
      if (branchOrIndex < 0 || branchOrIndex >= stack.branches.length) {
        throw new TsgitError(
          `Invalid index: ${branchOrIndex}. Stack has ${stack.branches.length} branches`,
          ErrorCode.INVALID_ARGUMENT
        );
      }
      targetBranch = stack.branches[branchOrIndex];
    } else {
      if (!stack.branches.includes(branchOrIndex)) {
        throw new TsgitError(
          `Branch '${branchOrIndex}' is not in the current stack`,
          ErrorCode.BRANCH_NOT_FOUND
        );
      }
      targetBranch = branchOrIndex;
    }

    this.repo.checkout(targetBranch);
    return targetBranch;
  }

  /**
   * Move up one level in the stack (to child branch)
   */
  up(): string {
    const currentBranch = this.repo.refs.getCurrentBranch();
    const stack = this.getCurrentStack();

    if (!stack || !currentBranch) {
      throw new TsgitError(
        'Not currently on a stacked branch',
        ErrorCode.OPERATION_FAILED
      );
    }

    let nextBranch: string | null = null;

    // If on base, go to first stack branch
    if (currentBranch === stack.baseBranch) {
      if (stack.branches.length > 0) {
        nextBranch = stack.branches[0];
      }
    } else {
      const currentIndex = stack.branches.indexOf(currentBranch);
      if (currentIndex >= 0 && currentIndex < stack.branches.length - 1) {
        nextBranch = stack.branches[currentIndex + 1];
      }
    }

    if (!nextBranch) {
      throw new TsgitError(
        'Already at the top of the stack',
        ErrorCode.OPERATION_FAILED
      );
    }

    this.repo.checkout(nextBranch);
    return nextBranch;
  }

  /**
   * Move down one level in the stack (to parent branch)
   */
  down(): string {
    const currentBranch = this.repo.refs.getCurrentBranch();
    const stack = this.getCurrentStack();

    if (!stack || !currentBranch) {
      throw new TsgitError(
        'Not currently on a stacked branch',
        ErrorCode.OPERATION_FAILED
      );
    }

    if (currentBranch === stack.baseBranch) {
      throw new TsgitError(
        'Already at the base of the stack',
        ErrorCode.OPERATION_FAILED
      );
    }

    const currentIndex = stack.branches.indexOf(currentBranch);
    let prevBranch: string;

    if (currentIndex === 0) {
      prevBranch = stack.baseBranch;
    } else if (currentIndex > 0) {
      prevBranch = stack.branches[currentIndex - 1];
    } else {
      throw new TsgitError(
        'Branch not found in stack',
        ErrorCode.OPERATION_FAILED
      );
    }

    this.repo.checkout(prevBranch);
    return prevBranch;
  }

  // ============ Private Helper Methods ============

  private loadMeta(): { stacks: string[] } {
    if (!exists(this.metaFile)) {
      return { stacks: [] };
    }
    try {
      const content = readFile(this.metaFile).toString('utf8');
      return JSON.parse(content);
    } catch {
      return { stacks: [] };
    }
  }

  private saveMeta(meta: { stacks: string[] }): void {
    writeFile(this.metaFile, JSON.stringify(meta, null, 2));
  }

  private addStackToMeta(name: string): void {
    const meta = this.loadMeta();
    if (!meta.stacks.includes(name)) {
      meta.stacks.push(name);
      this.saveMeta(meta);
    }
  }

  private removeStackFromMeta(name: string): void {
    const meta = this.loadMeta();
    meta.stacks = meta.stacks.filter(s => s !== name);
    this.saveMeta(meta);
  }

  private saveStack(stack: StackMetadata): void {
    const stackPath = path.join(this.stackDir, `${stack.name}.json`);
    writeFile(stackPath, JSON.stringify(stack, null, 2));
  }

  private generateBranchName(stack: StackMetadata): string {
    const index = stack.branches.length + 1;
    return `${stack.name}/part-${index}`;
  }

  private findMergeBase(hash1: string | null, hash2: string | null): string | null {
    if (!hash1 || !hash2) return null;

    const ancestors1 = this.getAncestors(hash1);
    const ancestors2Set = new Set(this.getAncestorsArray(hash2));

    for (const ancestor of ancestors1) {
      if (ancestors2Set.has(ancestor)) {
        return ancestor;
      }
    }

    return null;
  }

  private getAncestors(hash: string): string[] {
    const ancestors: string[] = [];
    const queue = [hash];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      ancestors.push(current);

      try {
        const commit = this.repo.objects.readCommit(current);
        queue.push(...commit.parentHashes);
      } catch {
        // Commit not found, skip
      }
    }

    return ancestors;
  }

  private getAncestorsArray(hash: string): string[] {
    return this.getAncestors(hash);
  }

  private getBranchStatus(
    branchCommit: string | null,
    parentCommit: string | null
  ): { status: 'synced' | 'behind' | 'ahead' | 'diverged'; behind: number; ahead: number } {
    if (!branchCommit || !parentCommit) {
      return { status: 'diverged', behind: 0, ahead: 0 };
    }

    const mergeBase = this.findMergeBase(branchCommit, parentCommit);
    
    if (!mergeBase) {
      return { status: 'diverged', behind: 0, ahead: 0 };
    }

    const behind = this.countCommits(mergeBase, parentCommit);
    const ahead = this.countCommits(mergeBase, branchCommit);

    if (behind === 0 && ahead === 0) {
      return { status: 'synced', behind: 0, ahead: 0 };
    } else if (behind > 0 && ahead === 0) {
      return { status: 'behind', behind, ahead: 0 };
    } else if (behind === 0 && ahead > 0) {
      return { status: 'ahead', behind: 0, ahead };
    } else {
      return { status: 'diverged', behind, ahead };
    }
  }

  private countCommits(from: string, to: string): number {
    if (from === to) return 0;

    let count = 0;
    let current = to;

    while (current && current !== from && count < 1000) {
      try {
        const commit = this.repo.objects.readCommit(current);
        count++;
        if (commit.parentHashes.length === 0) break;
        current = commit.parentHashes[0];
      } catch {
        break;
      }
    }

    return current === from ? count : 0;
  }
}
