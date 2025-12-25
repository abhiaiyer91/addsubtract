/**
 * Pull Command
 * Fetch from remote and integrate changes
 * 
 * Usage:
 *   tsgit pull                      # Fetch + merge from upstream
 *   tsgit pull --rebase             # Fetch + rebase
 *   tsgit pull <remote> <branch>    # Pull specific branch
 *   tsgit pull --ff-only            # Only fast-forward
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { RemoteManager } from '../core/remote';
import { MergeManager } from '../core/merge';
import { TsgitError, ErrorCode } from '../core/errors';
import { fetch, FetchResult } from './fetch';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Pull options
 */
export interface PullOptions {
  rebase?: boolean;
  ffOnly?: boolean;
  noFf?: boolean;
  squash?: boolean;
  commit?: boolean;
  stat?: boolean;
  verbose?: boolean;
  autostash?: boolean;
}

/**
 * Pull result
 */
export interface PullResult {
  fetchResult: FetchResult | null;
  mergeResult: {
    status: 'fast-forward' | 'merge' | 'conflict' | 'up-to-date' | 'rebase';
    commits: number;
    files: number;
    insertions: number;
    deletions: number;
  };
}

/**
 * Check if HEAD can fast-forward to target
 */
function canFastForward(repo: Repository, headHash: string, targetHash: string): boolean {
  // Walk from target back to see if we reach head
  let current: string | null = targetHash;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    if (current === headHash) {
      return true;
    }
    
    visited.add(current);
    
    try {
      const commit = repo.objects.readCommit(current);
      current = commit.parentHashes.length > 0 ? commit.parentHashes[0] : null;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Count commits between two refs
 */
function countCommitsBetween(repo: Repository, fromHash: string, toHash: string): number {
  let count = 0;
  let current: string | null = toHash;

  while (current && current !== fromHash) {
    count++;
    try {
      const commit = repo.objects.readCommit(current);
      current = commit.parentHashes.length > 0 ? commit.parentHashes[0] : null;
    } catch {
      break;
    }
  }

  return count;
}

/**
 * Pull changes from remote
 */
export function pull(
  remoteName?: string,
  branchName?: string,
  options: PullOptions = {}
): PullResult {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);

  // Get current branch
  const currentBranch = repo.refs.getCurrentBranch();
  if (!currentBranch) {
    throw new TsgitError(
      'You are not currently on a branch',
      ErrorCode.DETACHED_HEAD,
      [
        'tsgit checkout <branch>    # Switch to a branch first',
        'tsgit switch <branch>      # Or use switch command',
      ]
    );
  }

  // Determine remote and branch to pull from
  let remote = remoteName;
  let branch = branchName;

  if (!remote || !branch) {
    // Try to get upstream tracking info
    const tracking = remoteManager.getUpstream(currentBranch);
    
    if (tracking) {
      remote = remote || tracking.remote;
      branch = branch || tracking.branch;
    } else {
      remote = remote || 'origin';
      branch = branch || currentBranch;
    }
  }

  // Check if remote exists
  const remoteConfig = remoteManager.get(remote);
  if (!remoteConfig) {
    throw new TsgitError(
      `No such remote: '${remote}'`,
      ErrorCode.REF_NOT_FOUND,
      [
        'tsgit remote add origin <url>    # Add origin remote',
        'tsgit remote -v                  # List configured remotes',
      ]
    );
  }

  // Check for uncommitted changes
  const status = repo.status();
  const hasChanges = status.staged.length > 0 || 
                     status.modified.length > 0 || 
                     status.deleted.length > 0;

  if (hasChanges && !options.autostash) {
    throw new TsgitError(
      'Cannot pull with uncommitted changes',
      ErrorCode.UNCOMMITTED_CHANGES,
      [
        'tsgit stash             # Stash your changes first',
        'tsgit commit -m "WIP"   # Or commit them',
        'tsgit pull --autostash  # Or auto-stash during pull',
      ]
    );
  }

  // Fetch from remote
  console.log(colors.dim(`Fetching from ${remote}...`));
  const fetchResults = fetch(remote, `refs/heads/${branch}`, { 
    verbose: options.verbose 
  });
  const fetchResult = fetchResults.length > 0 ? fetchResults[0] : null;

  // Get the remote tracking branch hash
  const remoteRef = `refs/remotes/${remote}/${branch}`;
  const remoteHash = remoteManager.getTrackingBranchHash(remote, branch);
  
  if (!remoteHash) {
    throw new TsgitError(
      `Couldn't find remote ref ${remoteRef}`,
      ErrorCode.REF_NOT_FOUND,
      [
        `tsgit fetch ${remote}    # Fetch from remote first`,
        'tsgit branch -r          # List remote branches',
      ]
    );
  }

  // Get current HEAD hash
  const headHash = repo.refs.resolve('HEAD');
  if (!headHash) {
    throw new TsgitError(
      'No commits in current branch',
      ErrorCode.NO_COMMITS_YET,
      ['Make an initial commit first']
    );
  }

  // Check if already up to date
  if (headHash === remoteHash) {
    console.log(colors.dim('Already up to date.'));
    return {
      fetchResult,
      mergeResult: {
        status: 'up-to-date',
        commits: 0,
        files: 0,
        insertions: 0,
        deletions: 0,
      },
    };
  }

  // Determine merge strategy
  const isFastForward = canFastForward(repo, headHash, remoteHash);

  if (options.ffOnly && !isFastForward) {
    throw new TsgitError(
      'Not possible to fast-forward, aborting',
      ErrorCode.OPERATION_FAILED,
      [
        'tsgit pull               # Allow merge commits',
        'tsgit pull --rebase      # Or rebase instead',
      ]
    );
  }

  let result: PullResult;

  if (options.rebase) {
    // Rebase mode
    console.log(colors.dim('Rebasing...'));
    result = performRebase(repo, headHash, remoteHash, currentBranch, options);
  } else if (isFastForward) {
    // Fast-forward
    console.log(colors.dim('Fast-forwarding...'));
    result = performFastForward(repo, headHash, remoteHash, currentBranch);
  } else if (!options.noFf) {
    // Merge
    console.log(colors.dim('Merging...'));
    result = performMerge(repo, remoteHash, remote, branch, options);
  } else {
    throw new TsgitError(
      'Not possible to fast-forward',
      ErrorCode.OPERATION_FAILED,
      ['tsgit pull --no-ff is not valid when fast-forward is not possible']
    );
  }

  result.fetchResult = fetchResult;
  return result;
}

/**
 * Perform fast-forward merge
 */
function performFastForward(
  repo: Repository,
  headHash: string,
  targetHash: string,
  currentBranch: string
): PullResult {
  const commits = countCommitsBetween(repo, headHash, targetHash);

  // Update branch to point to target
  repo.refs.updateBranch(currentBranch, targetHash);

  // Checkout the new tree
  repo.checkout(currentBranch);

  return {
    fetchResult: null,
    mergeResult: {
      status: 'fast-forward',
      commits,
      files: 0,  // Would need to calculate
      insertions: 0,
      deletions: 0,
    },
  };
}

/**
 * Perform merge
 */
function performMerge(
  repo: Repository,
  remoteHash: string,
  remoteName: string,
  branchName: string,
  options: PullOptions
): PullResult {
  const mergeManager = repo.mergeManager;
  
  // Perform merge using the ref
  const mergeRef = `${remoteName}/${branchName}`;
  
  try {
    const mergeResult = mergeManager.merge(remoteHash);
    
    return {
      fetchResult: null,
      mergeResult: {
        status: mergeResult.conflicts.length > 0 ? 'conflict' : 'merge',
        commits: 1,
        files: mergeResult.conflicts.length || 0,
        insertions: 0,
        deletions: 0,
      },
    };
  } catch (error) {
    if (error instanceof TsgitError && error.code === ErrorCode.MERGE_CONFLICT) {
      return {
        fetchResult: null,
        mergeResult: {
          status: 'conflict',
          commits: 0,
          files: 0,
          insertions: 0,
          deletions: 0,
        },
      };
    }
    throw error;
  }
}

/**
 * Perform rebase (simplified)
 */
function performRebase(
  repo: Repository,
  headHash: string,
  targetHash: string,
  currentBranch: string,
  options: PullOptions
): PullResult {
  // A full rebase implementation would:
  // 1. Find the merge base
  // 2. Collect commits from HEAD back to merge base
  // 3. Reset to target
  // 4. Replay each commit on top

  // For now, we'll do a simplified version that just fast-forwards if possible
  const isFastForward = canFastForward(repo, headHash, targetHash);
  
  if (isFastForward) {
    return performFastForward(repo, headHash, targetHash, currentBranch);
  }

  // Otherwise, explain what would happen
  console.log(colors.yellow('!') + ' Rebase requires replaying commits');
  console.log(colors.dim('  This is a complex operation that would:'));
  console.log(colors.dim('  1. Find the merge base'));
  console.log(colors.dim('  2. Collect your commits'));
  console.log(colors.dim('  3. Reset to remote branch'));
  console.log(colors.dim('  4. Replay each commit'));
  console.log();
  console.log(colors.cyan('ℹ') + ' Use regular merge for now: tsgit pull');

  return {
    fetchResult: null,
    mergeResult: {
      status: 'rebase',
      commits: 0,
      files: 0,
      insertions: 0,
      deletions: 0,
    },
  };
}

/**
 * CLI handler for pull command
 */
export function handlePull(args: string[]): void {
  const options: PullOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--rebase' || arg === '-r') {
      options.rebase = true;
    } else if (arg === '--ff-only') {
      options.ffOnly = true;
    } else if (arg === '--no-ff') {
      options.noFf = true;
    } else if (arg === '--squash') {
      options.squash = true;
    } else if (arg === '--commit') {
      options.commit = true;
    } else if (arg === '--stat') {
      options.stat = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--autostash') {
      options.autostash = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const remoteName = positional[0];
  const branchName = positional[1];

  try {
    const result = pull(remoteName, branchName, options);

    // Display result
    switch (result.mergeResult.status) {
      case 'up-to-date':
        // Already displayed
        break;

      case 'fast-forward':
        console.log(colors.green('✓') + ' Fast-forward');
        if (result.mergeResult.commits > 0) {
          console.log(colors.dim(`  ${result.mergeResult.commits} commit(s) pulled`));
        }
        break;

      case 'merge':
        console.log(colors.green('✓') + ' Merge complete');
        break;

      case 'conflict':
        console.log(colors.yellow('!') + ' Merge conflicts detected');
        console.log(colors.dim('  Fix conflicts and run:'));
        console.log(colors.dim('    tsgit add <resolved files>'));
        console.log(colors.dim('    tsgit commit'));
        break;

      case 'rebase':
        // Message already displayed
        break;
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
