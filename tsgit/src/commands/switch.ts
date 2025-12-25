/**
 * Switch command - dedicated branch switching
 * Unlike git checkout, this command ONLY switches branches
 * For file restoration, use the 'restore' command
 */

import { Repository } from '../core/repository';
import { BranchStateManager } from '../core/branch-state';
import { Journal, StateSnapshot } from '../core/journal';
import { TsgitError, Errors } from '../core/errors';

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

  // Handle uncommitted changes
  if (hasChanges && !options.force && !options.autoStash) {
    throw Errors.uncommittedChanges([
      ...status.modified,
      ...status.staged,
      ...status.deleted,
    ]);
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
