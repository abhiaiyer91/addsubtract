/**
 * Push Command
 * Update remote refs along with associated objects
 * 
 * Usage:
 *   tsgit push                      # Push current branch to origin
 *   tsgit push <remote>             # Push to specific remote
 *   tsgit push <remote> <branch>    # Push specific branch
 *   tsgit push -u <remote> <branch> # Push and set upstream
 *   tsgit push --force              # Force push
 *   tsgit push --force-with-lease   # Safe force push
 *   tsgit push --tags               # Push all tags
 *   tsgit push --delete <branch>    # Delete remote branch
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { RemoteManager } from '../core/remote';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, mkdirp, readDir, isDirectory } from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Push options
 */
export interface PushOptions {
  setUpstream?: boolean;
  force?: boolean;
  forceWithLease?: boolean;
  tags?: boolean;
  delete?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  all?: boolean;
}

/**
 * Push result for a single ref
 */
export interface PushRefResult {
  ref: string;
  status: 'pushed' | 'rejected' | 'up-to-date' | 'deleted' | 'new';
  oldHash?: string;
  newHash?: string;
  message?: string;
}

/**
 * Push result
 */
export interface PushResult {
  remote: string;
  refs: PushRefResult[];
}

/**
 * Check if local can push to remote (fast-forward check)
 */
function canPushFastForward(repo: Repository, localHash: string, remoteHash: string): boolean {
  if (!remoteHash) return true;
  if (localHash === remoteHash) return true;

  // Check if remote hash is ancestor of local hash
  let current: string | null = localHash;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    if (current === remoteHash) {
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
 * Push to a local repository (file:// protocol)
 */
function pushToLocal(
  repo: Repository,
  remoteManager: RemoteManager,
  remoteName: string,
  remoteUrl: string,
  refs: { local: string; remote: string }[],
  options: PushOptions = {}
): PushResult {
  const result: PushResult = {
    remote: remoteName,
    refs: [],
  };

  // Get destination repository
  const destGitDir = path.join(remoteUrl, '.tsgit');
  
  if (!exists(destGitDir)) {
    throw new TsgitError(
      `Repository '${remoteUrl}' not found`,
      ErrorCode.NOT_A_REPOSITORY,
      ['Check that the remote URL is correct']
    );
  }

  const destRepo = new Repository(remoteUrl);

  for (const { local, remote } of refs) {
    const localHash = repo.refs.resolve(local);
    const remoteHash = destRepo.refs.resolve(remote);

    // Handle delete
    if (options.delete) {
      if (!remoteHash) {
        result.refs.push({
          ref: remote,
          status: 'rejected',
          message: 'Remote branch does not exist',
        });
        continue;
      }

      // Delete the remote branch
      try {
        destRepo.refs.deleteBranch(remote);
        remoteManager.deleteTrackingBranch(remoteName, remote);
        result.refs.push({
          ref: remote,
          status: 'deleted',
          oldHash: remoteHash,
        });
      } catch (error) {
        result.refs.push({
          ref: remote,
          status: 'rejected',
          message: error instanceof Error ? error.message : 'Failed to delete',
        });
      }
      continue;
    }

    if (!localHash) {
      result.refs.push({
        ref: local,
        status: 'rejected',
        message: 'Local branch not found',
      });
      continue;
    }

    // Check if up to date
    if (localHash === remoteHash) {
      result.refs.push({
        ref: remote,
        status: 'up-to-date',
        oldHash: remoteHash,
        newHash: localHash,
      });
      continue;
    }

    // Check if can fast-forward (unless force)
    if (!options.force && !options.forceWithLease) {
      if (!canPushFastForward(repo, localHash, remoteHash || '')) {
        result.refs.push({
          ref: remote,
          status: 'rejected',
          oldHash: remoteHash || undefined,
          newHash: localHash,
          message: 'non-fast-forward update, use --force to override',
        });
        continue;
      }
    }

    // For force-with-lease, verify expected hash
    if (options.forceWithLease) {
      const trackingHash = remoteManager.getTrackingBranchHash(remoteName, remote);
      if (trackingHash !== remoteHash) {
        result.refs.push({
          ref: remote,
          status: 'rejected',
          oldHash: remoteHash || undefined,
          newHash: localHash,
          message: 'stale info, run fetch first',
        });
        continue;
      }
    }

    // Dry run
    if (options.dryRun) {
      result.refs.push({
        ref: remote,
        status: remoteHash ? 'pushed' : 'new',
        oldHash: remoteHash || undefined,
        newHash: localHash,
        message: '(dry run)',
      });
      continue;
    }

    // Copy objects to remote
    copyObjectsToRemote(repo.gitDir, destGitDir, localHash);

    // Update remote branch
    destRepo.refs.updateBranch(remote, localHash);

    // Update tracking branch
    remoteManager.updateTrackingBranch(remoteName, remote, localHash);

    result.refs.push({
      ref: remote,
      status: remoteHash ? 'pushed' : 'new',
      oldHash: remoteHash || undefined,
      newHash: localHash,
    });
  }

  return result;
}

/**
 * Copy objects needed for a commit to remote
 */
function copyObjectsToRemote(srcGitDir: string, destGitDir: string, commitHash: string): void {
  const srcObjectsDir = path.join(srcGitDir, 'objects');
  const destObjectsDir = path.join(destGitDir, 'objects');

  // Simple approach: copy all objects
  // A proper implementation would do reachability analysis
  copyAllObjects(srcObjectsDir, destObjectsDir);
}

/**
 * Copy all objects from source to destination
 */
function copyAllObjects(src: string, dest: string): void {
  if (!exists(src)) return;

  const entries = readDir(src);
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    
    if (isDirectory(srcPath)) {
      if (!exists(destPath)) {
        mkdirp(destPath);
      }
      
      const objects = readDir(srcPath);
      for (const obj of objects) {
        const srcObjPath = path.join(srcPath, obj);
        const destObjPath = path.join(destPath, obj);
        
        if (!exists(destObjPath) && !isDirectory(srcObjPath)) {
          fs.copyFileSync(srcObjPath, destObjPath);
        }
      }
    }
  }
}

/**
 * Push to a remote repository (network)
 */
function pushToRemote(
  repo: Repository,
  remoteManager: RemoteManager,
  remoteName: string,
  remoteUrl: string,
  refs: { local: string; remote: string }[],
  options: PushOptions = {}
): PushResult {
  const result: PushResult = {
    remote: remoteName,
    refs: [],
  };

  // For network remotes, we need to implement the Git protocol
  console.log(colors.dim(`Pushing to ${remoteName} (${remoteUrl})...`));
  console.log();
  console.log(colors.yellow('!') + ' Network push requires Git wire protocol implementation');
  console.log(colors.dim('  In a full implementation, this would:'));
  console.log(colors.dim('  1. Connect to the remote server'));
  console.log(colors.dim('  2. Negotiate which objects to send'));
  console.log(colors.dim('  3. Upload pack files'));
  console.log(colors.dim('  4. Update remote refs'));
  console.log();

  for (const { local, remote } of refs) {
    const localHash = repo.refs.resolve(local);
    console.log(colors.dim(`  Would push ${local} -> ${remote} (${localHash?.slice(0, 7) || 'none'})`));
    
    result.refs.push({
      ref: remote,
      status: 'rejected',
      message: 'Network push not implemented',
    });
  }

  console.log();
  console.log(colors.cyan('ℹ') + ' For now, use local paths or interop with Git for network operations.');

  return result;
}

/**
 * Push tags
 */
function pushTags(
  repo: Repository,
  remoteName: string,
  remoteUrl: string,
  options: PushOptions = {}
): PushRefResult[] {
  const results: PushRefResult[] = [];

  // Check if local path
  if (!exists(remoteUrl)) {
    console.log(colors.yellow('!') + ' Pushing tags to network remotes not implemented');
    return results;
  }

  const destGitDir = path.join(remoteUrl, '.tsgit');
  const destRepo = new Repository(remoteUrl);

  const localTags = repo.refs.listTags();
  
  for (const tag of localTags) {
    const localHash = repo.refs.resolve(`refs/tags/${tag}`);
    if (!localHash) continue;

    const remoteHasTag = destRepo.refs.tagExists(tag);
    
    if (remoteHasTag) {
      const remoteHash = destRepo.refs.resolve(`refs/tags/${tag}`);
      if (remoteHash === localHash) {
        results.push({ ref: `refs/tags/${tag}`, status: 'up-to-date' });
      } else {
        results.push({ 
          ref: `refs/tags/${tag}`, 
          status: 'rejected',
          message: 'tag already exists with different hash' 
        });
      }
    } else {
      if (!options.dryRun) {
        // Copy objects needed for this tag
        copyObjectsToRemote(repo.gitDir, destGitDir, localHash);
        destRepo.refs.createTag(tag, localHash);
      }
      results.push({ ref: `refs/tags/${tag}`, status: 'new', newHash: localHash });
    }
  }

  return results;
}

/**
 * Push to remote
 */
export function push(
  remoteName?: string,
  branchName?: string,
  options: PushOptions = {}
): PushResult {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);

  // Get current branch
  const currentBranch = repo.refs.getCurrentBranch();
  if (!currentBranch && !branchName && !options.all && !options.tags) {
    throw new TsgitError(
      'You are not currently on a branch',
      ErrorCode.DETACHED_HEAD,
      [
        'tsgit checkout <branch>    # Switch to a branch first',
        'tsgit push origin <branch> # Or specify a branch to push',
      ]
    );
  }

  // Determine remote
  const remote = remoteName || 'origin';
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

  // Build list of refs to push
  const refs: { local: string; remote: string }[] = [];

  if (options.all) {
    // Push all branches
    const branches = repo.refs.listBranches();
    for (const branch of branches) {
      refs.push({ local: branch, remote: branch });
    }
  } else if (options.delete) {
    // Delete mode
    if (!branchName) {
      throw new TsgitError(
        'You must specify a branch to delete',
        ErrorCode.INVALID_ARGUMENT,
        ['tsgit push --delete origin <branch>']
      );
    }
    refs.push({ local: branchName, remote: branchName });
  } else {
    // Normal push
    const localBranch = branchName || currentBranch!;
    const remoteBranch = branchName || currentBranch!;
    refs.push({ local: localBranch, remote: remoteBranch });
  }

  // Perform push
  let result: PushResult;
  
  if (exists(remoteConfig.url) || remoteConfig.url.startsWith('/') || remoteConfig.url.startsWith('./')) {
    // Local push
    result = pushToLocal(repo, remoteManager, remote, remoteConfig.url, refs, options);
  } else {
    // Network push
    result = pushToRemote(repo, remoteManager, remote, remoteConfig.url, refs, options);
  }

  // Push tags if requested
  if (options.tags) {
    const tagResults = pushTags(repo, remote, remoteConfig.url, options);
    result.refs.push(...tagResults);
  }

  // Set upstream if requested
  if (options.setUpstream && result.refs.some(r => r.status === 'pushed' || r.status === 'new')) {
    const branch = branchName || currentBranch!;
    remoteManager.setTrackingBranch(branch, remote, branch);
    console.log(colors.dim(`Branch '${branch}' set up to track remote branch '${branch}' from '${remote}'.`));
  }

  return result;
}

/**
 * Format push results for display
 */
function formatPushResults(result: PushResult, verbose: boolean): void {
  let hasErrors = false;

  for (const ref of result.refs) {
    switch (ref.status) {
      case 'pushed':
        if (ref.oldHash && ref.newHash) {
          console.log(
            `   ${ref.oldHash.slice(0, 7)}..${ref.newHash.slice(0, 7)}  ` +
            `${ref.ref} -> ${ref.ref}`
          );
        }
        break;

      case 'new':
        console.log(colors.green(' * [new branch]     ') + `${ref.ref} -> ${ref.ref}`);
        break;

      case 'deleted':
        console.log(colors.red(' - [deleted]        ') + ref.ref);
        break;

      case 'up-to-date':
        if (verbose) {
          console.log(colors.dim(' = [up to date]     ') + ref.ref);
        }
        break;

      case 'rejected':
        hasErrors = true;
        console.log(colors.red(' ! [rejected]       ') + `${ref.ref} (${ref.message})`);
        break;
    }
  }

  if (hasErrors) {
    console.log();
    console.log(colors.red('error: ') + 'failed to push some refs');
    console.log(colors.dim('hint: Updates were rejected because the tip of your current branch is behind'));
    console.log(colors.dim('hint: its remote counterpart. Integrate the remote changes (e.g.'));
    console.log(colors.dim('hint: \'tsgit pull ...\') before pushing again.'));
  }
}

/**
 * CLI handler for push command
 */
export function handlePush(args: string[]): void {
  const options: PushOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-u' || arg === '--set-upstream') {
      options.setUpstream = true;
    } else if (arg === '-f' || arg === '--force') {
      options.force = true;
    } else if (arg === '--force-with-lease') {
      options.forceWithLease = true;
    } else if (arg === '--tags') {
      options.tags = true;
    } else if (arg === '-d' || arg === '--delete') {
      options.delete = true;
    } else if (arg === '-n' || arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const remoteName = positional[0];
  const branchName = positional[1];

  try {
    const result = push(remoteName, branchName, options);
    
    // Format output
    console.log(colors.dim(`To ${result.remote}`));
    formatPushResults(result, options.verbose || false);

    // Summary
    const pushed = result.refs.filter(r => r.status === 'pushed').length;
    const newRefs = result.refs.filter(r => r.status === 'new').length;
    const deleted = result.refs.filter(r => r.status === 'deleted').length;
    const rejected = result.refs.filter(r => r.status === 'rejected').length;

    if (pushed > 0 || newRefs > 0 || deleted > 0) {
      const parts: string[] = [];
      if (pushed > 0) parts.push(`${pushed} updated`);
      if (newRefs > 0) parts.push(`${newRefs} new`);
      if (deleted > 0) parts.push(`${deleted} deleted`);
      
      console.log(colors.green('✓') + ` Push complete: ${parts.join(', ')}`);
    } else if (rejected === 0) {
      console.log(colors.dim('Everything up-to-date'));
    }

    if (rejected > 0) {
      process.exit(1);
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
