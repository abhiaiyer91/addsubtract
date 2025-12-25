/**
 * Switch command - dedicated branch switching
 * Unlike git checkout, this command ONLY switches branches
 * For file restoration, use the 'restore' command
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { BranchStateManager } from '../core/branch-state';
import { Journal, StateSnapshot } from '../core/journal';
import { TsgitError, Errors } from '../core/errors';
import { readFile, exists } from '../utils/fs';

/**
 * Options for switch command
 */
export interface SwitchOptions {
  create?: boolean;           // Create the branch if it doesn't exist
  force?: boolean;            // Discard local changes
  detach?: boolean;           // Detach HEAD at the commit
  autoStash?: boolean;        // Automatically stash and restore changes
}

/**
 * Result of switch operation
 */
export interface SwitchResult {
  success: boolean;
  previousBranch: string | null;
  currentBranch: string | null;
  stashedChanges: boolean;
  restoredChanges: boolean;
  message: string;
}

/**
 * Check which files would conflict when switching branches
 * 
 * A file conflicts if:
 * - It exists on the target branch with different content than in our working tree
 * - It doesn't exist on the target branch but would need to be removed (deleted from index)
 * 
 * A file does NOT conflict if:
 * - It doesn't exist on the target branch (new files can be carried over)
 * - It exists identically on both branches
 */
function getConflictingFiles(
  repo: Repository,
  targetBranch: string,
  changedFiles: string[]
): string[] {
  const conflicts: string[] = [];
  
  // Get the target branch's tree
  const targetHash = repo.refs.resolve(targetBranch);
  if (!targetHash) {
    return []; // Branch doesn't exist yet, will be caught elsewhere
  }

  // Build map of target branch files
  const targetTree = new Map<string, string>();
  try {
    const commit = repo.objects.readCommit(targetHash);
    flattenTree(repo, commit.treeHash, '', targetTree);
  } catch {
    return []; // No commits on target branch
  }

  // Check each changed file
  for (const file of changedFiles) {
    // Skip files marked as deleted in status display
    const cleanPath = file.replace(' (deleted)', '');
    
    // Get file's hash on target branch
    const targetBlobHash = targetTree.get(cleanPath);
    
    if (!targetBlobHash) {
      // File doesn't exist on target branch - no conflict
      // (new file can be safely carried over)
      continue;
    }

    // File exists on target branch - check if it differs from working tree
    const fullPath = path.join(repo.workDir, cleanPath);
    
    if (!exists(fullPath)) {
      // File was deleted but exists on target - this is a conflict
      conflicts.push(cleanPath);
      continue;
    }

    // Compare working tree content with target branch content
    const workingContent = readFile(fullPath);
    const targetBlob = repo.objects.readBlob(targetBlobHash);
    
    if (!workingContent.equals(targetBlob.content)) {
      // Content differs - this would be overwritten
      conflicts.push(cleanPath);
    }
    // If content is the same, no conflict
  }

  return conflicts;
}

/**
 * Flatten a tree into a map of path -> blob hash
 */
function flattenTree(repo: Repository, treeHash: string, prefix: string, result: Map<string, string>): void {
  const tree = repo.objects.readTree(treeHash);

  for (const entry of tree.entries) {
    const fullPath = prefix ? prefix + '/' + entry.name : entry.name;

    if (entry.mode === '40000') {
      flattenTree(repo, entry.hash, fullPath, result);
    } else {
      result.set(fullPath, entry.hash);
    }
  }
}

/**
 * Switch to a different branch
 * 
 * @example
 * // Switch to existing branch
 * tsgit switch feature
 * 
 * // Create and switch to new branch
 * tsgit switch -c new-feature
 * 
 * // Switch with auto-stash
 * tsgit switch --auto-stash main
 */
export function switchBranch(
  repo: Repository,
  branchName: string,
  options: SwitchOptions = {}
): SwitchResult {
  const previousBranch = repo.refs.getCurrentBranch();
  const journal = new Journal(repo.gitDir);
  const branchState = new BranchStateManager(repo.gitDir, repo.workDir);

  // Capture state before operation
  const beforeState: StateSnapshot = {
    head: repo.refs.getHead().target,
    branch: previousBranch,
    indexHash: '', // Would be computed from index
  };

  // Check for uncommitted changes
  const status = repo.status();
  const hasChanges = status.modified.length > 0 || 
                     status.staged.length > 0 || 
                     status.deleted.length > 0;

  // Handle uncommitted changes - but only if they would be overwritten
  if (hasChanges && !options.force && !options.autoStash) {
    // Check if the target branch would overwrite any of our changes
    const conflictingFiles = getConflictingFiles(
      repo,
      branchName,
      [...status.modified, ...status.staged.filter(f => !f.endsWith(' (deleted)')), ...status.deleted]
    );

    if (conflictingFiles.length > 0) {
      throw Errors.uncommittedChanges(conflictingFiles);
    }
    // If no conflicts, allow the switch with changes carried over
  }

  let stashedChanges = false;
  let restoredChanges = false;

  // Auto-stash if enabled
  if (hasChanges && options.autoStash && previousBranch) {
    branchState.saveState(previousBranch, status.staged, 'Auto-stash on switch');
    stashedChanges = true;
  }

  // Create branch if requested
  if (options.create) {
    const currentHash = repo.refs.resolve('HEAD');
    if (!currentHash) {
      throw Errors.noCommitsYet();
    }

    if (repo.refs.branchExists(branchName)) {
      throw Errors.branchExists(branchName);
    }

    repo.refs.createBranch(branchName, currentHash);
  }

  // Check if branch exists
  if (!repo.refs.branchExists(branchName)) {
    const existingBranches = repo.refs.listBranches();
    throw Errors.branchNotFound(branchName, existingBranches);
  }

  // Perform the switch
  if (options.detach) {
    const hash = repo.refs.resolve(branchName);
    if (hash) {
      repo.checkout(hash);
    }
  } else {
    repo.checkout(branchName);
  }

  // Restore stashed changes for target branch
  if (options.autoStash && branchState.hasState(branchName)) {
    branchState.restoreState(branchName);
    branchState.clearState(branchName);
    restoredChanges = true;
  }

  // Capture state after operation
  const afterState: StateSnapshot = {
    head: repo.refs.getHead().target,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };

  // Record in journal
  journal.record(
    'switch',
    [branchName],
    `Switched from ${previousBranch || 'detached HEAD'} to ${branchName}`,
    beforeState,
    afterState
  );

  const currentBranch = repo.refs.getCurrentBranch();
  let message = `Switched to branch '${branchName}'`;
  
  if (options.create) {
    message = `Switched to a new branch '${branchName}'`;
  }
  if (stashedChanges) {
    message += '\nYour changes were automatically stashed.';
  }
  if (restoredChanges) {
    message += '\nPreviously stashed changes were restored.';
  }

  return {
    success: true,
    previousBranch,
    currentBranch,
    stashedChanges,
    restoredChanges,
    message,
  };
}

/**
 * CLI handler for switch command
 */
export function handleSwitch(args: string[]): void {
  const repo = Repository.find();
  const options: SwitchOptions = {};
  let branchName: string | undefined;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-c' || arg === '--create') {
      options.create = true;
    } else if (arg === '-f' || arg === '--force') {
      options.force = true;
    } else if (arg === '-d' || arg === '--detach') {
      options.detach = true;
    } else if (arg === '--auto-stash') {
      options.autoStash = true;
    } else if (!arg.startsWith('-')) {
      branchName = arg;
    }
  }

  if (!branchName) {
    console.error('Error: Branch name required');
    console.error('\nUsage: tsgit switch [options] <branch>');
    console.error('\nOptions:');
    console.error('  -c, --create     Create the branch if it doesn\'t exist');
    console.error('  -f, --force      Discard local changes');
    console.error('  -d, --detach     Detach HEAD at the commit');
    console.error('  --auto-stash     Automatically stash and restore changes');
    process.exit(1);
  }

  try {
    const result = switchBranch(repo, branchName, options);
    console.log(result.message);
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else {
      throw error;
    }
    process.exit(1);
  }
}
