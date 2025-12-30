/**
 * Push Command
 * Update remote refs along with associated objects
 * 
 * Usage:
 *   wit push                      # Push current branch to origin
 *   wit push <remote>             # Push to specific remote
 *   wit push <remote> <branch>    # Push specific branch
 *   wit push -u <remote> <branch> # Push and set upstream
 *   wit push --force              # Force push
 *   wit push --force-with-lease   # Safe force push
 *   wit push --tags               # Push all tags
 *   wit push --delete <branch>    # Delete remote branch
 * 
 * Dual-push (push to multiple remotes):
 *   wit push --also <remote>      # Push to origin AND specified remote
 *   wit push --all-remotes        # Push to ALL configured remotes
 *   wit push origin --also github # Push to both origin and github remotes
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { RemoteManager } from '../core/remote';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, mkdirp, readDir, isDirectory } from '../utils/fs';
import {
  SmartHttpClient,
  normalizeRepoUrl,
  createPackfile,
  updateRefUpdate,
  createRefUpdate,
  deleteRefUpdate,
  getBranches,
} from '../core/protocol';
import { HookManager } from '../core/hooks';
import { colors } from '../utils/colors';

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
  noVerify?: boolean;
  /** Push to an additional remote after the primary push */
  also?: string;
  /** Push to all configured remotes */
  allRemotes?: boolean;
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
 * Push result for a single remote
 */
export interface PushResult {
  remote: string;
  refs: PushRefResult[];
}

/**
 * Push result for multiple remotes (dual-push)
 */
export interface MultiPushResult {
  results: PushResult[];
  allSucceeded: boolean;
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
  const destGitDir = path.join(remoteUrl, '.wit');

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
 * Push to a remote repository (network) - async implementation
 */
async function pushToRemoteAsync(
  repo: Repository,
  remoteManager: RemoteManager,
  remoteName: string,
  remoteUrl: string,
  refs: { local: string; remote: string }[],
  options: PushOptions = {}
): Promise<PushResult> {
  const result: PushResult = {
    remote: remoteName,
    refs: [],
  };

  if (options.verbose) {
    console.log(colors.dim(`Pushing to ${remoteName} (${remoteUrl})...`));
  }

  // Normalize URL for HTTP client
  const httpUrl = normalizeRepoUrl(remoteUrl);
  const client = new SmartHttpClient(httpUrl);

  try {
    // Step 1: Discover refs from remote
    console.log(colors.dim('Discovering refs...'));
    const advertisement = await client.discoverRefs('receive-pack');
    console.log(colors.dim(`Found ${advertisement.refs.length} refs on remote`));
    for (const ref of advertisement.refs.slice(0, 5)) {
      console.log(colors.dim(`  ${ref.name}: ${ref.hash.slice(0, 7)}`));
    }
    // Show server capabilities
    const caps = advertisement.capabilities;
    if (caps && typeof caps === 'object') {
      const capKeys = Object.keys(caps).slice(0, 10);
      console.log(colors.dim(`Server capabilities: ${capKeys.join(', ')}...`));
    }

    // Get remote branch hashes
    const remoteBranches = getBranches(advertisement);
    const remoteRefMap = new Map<string, string>();
    for (const branch of remoteBranches) {
      const branchName = branch.name.replace('refs/heads/', '');
      remoteRefMap.set(branchName, branch.hash);
    }

    // Step 2: Prepare ref updates and collect objects to send
    const refUpdates: { name: string; oldHash: string; newHash: string; force?: boolean }[] = [];
    const objectsToSend: string[] = [];

    for (const { local, remote } of refs) {
      const localHash = repo.refs.resolve(local);
      const remoteHash = remoteRefMap.get(remote) || null;

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

        refUpdates.push(deleteRefUpdate(`refs/heads/${remote}`, remoteHash));
        result.refs.push({
          ref: remote,
          status: 'deleted',
          oldHash: remoteHash,
        });
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
      if (!options.force && !options.forceWithLease && remoteHash) {
        if (!canPushFastForward(repo, localHash, remoteHash)) {
          result.refs.push({
            ref: remote,
            status: 'rejected',
            oldHash: remoteHash,
            newHash: localHash,
            message: 'non-fast-forward update, use --force to override',
          });
          continue;
        }
      }

      // For force-with-lease, verify expected hash
      if (options.forceWithLease && remoteHash) {
        const trackingHash = remoteManager.getTrackingBranchHash(remoteName, remote);
        if (trackingHash !== remoteHash) {
          result.refs.push({
            ref: remote,
            status: 'rejected',
            oldHash: remoteHash,
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

      // Add ref update
      if (remoteHash) {
        refUpdates.push(updateRefUpdate(`refs/heads/${remote}`, remoteHash, localHash, options.force));
      } else {
        refUpdates.push(createRefUpdate(`refs/heads/${remote}`, localHash));
      }

      // Collect objects to send (walk from local commit)
      collectObjectsToSend(repo, localHash, remoteHash, objectsToSend);

      result.refs.push({
        ref: remote,
        status: remoteHash ? 'pushed' : 'new',
        oldHash: remoteHash || undefined,
        newHash: localHash,
      });
    }

    // Step 3: Create pack file if we have objects to send
    if (refUpdates.length > 0 && !options.dryRun) {
      // Build packable objects
      const packableObjects = objectsToSend.map(hash => {
        const { type, content } = repo.objects.readRawObject(hash);
        return { type, data: content, hash };
      });

      // Create pack (without delta compression for speed)
      console.log(colors.dim(`Creating pack with ${packableObjects.length} objects...`));
      const packData = packableObjects.length > 0
        ? createPackfile(packableObjects, { useDelta: false })
        : Buffer.alloc(0);
      console.log(colors.dim(`Pack size: ${packData.length} bytes`));

      // Step 4: Push to remote
      console.log(colors.dim('Pushing to remote...'));
      for (const refUpdate of refUpdates) {
        console.log(colors.dim(`  Ref: ${refUpdate.name} ${refUpdate.oldHash?.slice(0, 7) || '(new)'} -> ${refUpdate.newHash.slice(0, 7)}`));
      }
      const pushResult = await client.pushPack(refUpdates, packData, {
        progress: (info) => {
          console.log(colors.dim(`  ${info.phase}: ${info.current}/${info.total}`));
        },
      });
      console.log(colors.dim('Push complete'));

      // Update results based on server response
      if (!pushResult.ok) {
        for (const refResult of pushResult.refResults) {
          const existing = result.refs.find(r => r.ref === refResult.refName.replace('refs/heads/', ''));
          if (existing && refResult.status === 'ng') {
            existing.status = 'rejected';
            existing.message = refResult.message || 'Server rejected';
          }
        }
      }

      // Update tracking branches for successful pushes
      for (const ref of result.refs) {
        if (ref.status === 'pushed' || ref.status === 'new') {
          if (ref.newHash) {
            remoteManager.updateTrackingBranch(remoteName, ref.ref, ref.newHash);
          }
        }
      }
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new TsgitError(
        `Failed to push to '${remoteName}': ${error.message}`,
        ErrorCode.OPERATION_FAILED,
        [
          'Check your network connection',
          'Verify you have push access to the repository',
          'For private repos, ensure you have proper authentication',
        ]
      );
    }
    throw error;
  }
}

/**
 * Collect objects that need to be sent to remote
 */
function collectObjectsToSend(
  repo: Repository,
  localHash: string,
  remoteHash: string | null,
  objects: string[]
): void {
  // First, collect all objects reachable from remote (these already exist on server)
  const remoteObjects = new Set<string>();
  if (remoteHash) {
    collectAllObjects(repo, remoteHash, remoteObjects);
  }

  // Now walk from local commit and only include objects NOT on remote
  const visited = new Set<string>();
  const queue = [localHash];

  while (queue.length > 0) {
    const hash = queue.shift()!;

    if (visited.has(hash)) continue;
    if (remoteObjects.has(hash)) continue; // Skip objects already on remote

    visited.add(hash);

    if (!objects.includes(hash)) {
      objects.push(hash);
    }

    try {
      const { type, content } = repo.objects.readRawObject(hash);

      if (type === 'commit') {
        // Parse commit to get tree and parents
        const commitStr = content.toString('utf8');
        const treeMatch = commitStr.match(/^tree ([a-f0-9]+)/m);
        if (treeMatch) {
          queue.push(treeMatch[1]);
        }

        const parentMatches = commitStr.matchAll(/^parent ([a-f0-9]+)/gm);
        for (const match of parentMatches) {
          queue.push(match[1]);
        }
      } else if (type === 'tree') {
        // Parse tree to get blobs and subtrees
        let offset = 0;
        while (offset < content.length) {
          const spaceIdx = content.indexOf(0x20, offset);
          if (spaceIdx === -1) break;

          const nullIdx = content.indexOf(0x00, spaceIdx);
          if (nullIdx === -1) break;

          const entryHash = content.slice(nullIdx + 1, nullIdx + 21).toString('hex');
          queue.push(entryHash);

          offset = nullIdx + 21;
        }
      }
      // Blobs don't reference other objects
    } catch {
      // Object might not exist locally, skip
    }
  }
}

/**
 * Collect ALL objects reachable from a given hash
 */
function collectAllObjects(
  repo: Repository,
  startHash: string,
  objects: Set<string>
): void {
  const queue = [startHash];

  while (queue.length > 0) {
    const hash = queue.shift()!;

    if (objects.has(hash)) continue;
    objects.add(hash);

    try {
      const { type, content } = repo.objects.readRawObject(hash);

      if (type === 'commit') {
        const commitStr = content.toString('utf8');
        const treeMatch = commitStr.match(/^tree ([a-f0-9]+)/m);
        if (treeMatch) {
          queue.push(treeMatch[1]);
        }
        // Don't walk parents - we just want objects reachable from this commit
      } else if (type === 'tree') {
        let offset = 0;
        while (offset < content.length) {
          const spaceIdx = content.indexOf(0x20, offset);
          if (spaceIdx === -1) break;

          const nullIdx = content.indexOf(0x00, spaceIdx);
          if (nullIdx === -1) break;

          const entryHash = content.slice(nullIdx + 1, nullIdx + 21).toString('hex');
          queue.push(entryHash);

          offset = nullIdx + 21;
        }
      }
    } catch {
      // Object might not exist locally, skip
    }
  }
}

/**
 * Push to a remote repository (network) - sync wrapper
 */
function pushToRemote(
  repo: Repository,
  remoteManager: RemoteManager,
  remoteName: string,
  remoteUrl: string,
  refs: { local: string; remote: string }[],
  options: PushOptions = {}
): PushResult {
  throw new TsgitError(
    'Use pushAsync for remote repositories',
    ErrorCode.OPERATION_FAILED,
    ['Remote pushing requires async operation']
  );
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

  const destGitDir = path.join(remoteUrl, '.wit');
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
 * Push to a single remote (internal helper)
 */
async function pushToSingleRemoteAsync(
  repo: Repository,
  remoteManager: RemoteManager,
  remoteName: string,
  branchName: string | undefined,
  currentBranch: string | null,
  options: PushOptions
): Promise<PushResult> {
  const remoteConfig = remoteManager.get(remoteName);

  if (!remoteConfig) {
    throw new TsgitError(
      `No such remote: '${remoteName}'`,
      ErrorCode.REF_NOT_FOUND,
      [
        'wit remote add origin <url>    # Add origin remote',
        'wit remote -v                  # List configured remotes',
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
        ['wit push --delete origin <branch>']
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
    result = pushToLocal(repo, remoteManager, remoteName, remoteConfig.url, refs, options);
  } else {
    // Network push
    result = await pushToRemoteAsync(repo, remoteManager, remoteName, remoteConfig.url, refs, options);
  }

  // Push tags if requested
  if (options.tags) {
    const tagResults = pushTags(repo, remoteName, remoteConfig.url, options);
    result.refs.push(...tagResults);
  }

  // Set upstream if requested (only for primary remote)
  if (options.setUpstream && result.refs.some(r => r.status === 'pushed' || r.status === 'new')) {
    const branch = branchName || currentBranch!;
    remoteManager.setTrackingBranch(branch, remoteName, branch);
    console.log(colors.dim(`Branch '${branch}' set up to track remote branch '${branch}' from '${remoteName}'.`));
  }

  return result;
}

/**
 * Push to remote (async version)
 * 
 * Supports dual-push with --also <remote> or --all-remotes flags
 */
export async function pushAsync(
  remoteName?: string,
  branchName?: string,
  options: PushOptions = {}
): Promise<PushResult> {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);

  // Get current branch
  const currentBranch = repo.refs.getCurrentBranch();
  if (!currentBranch && !branchName && !options.all && !options.tags) {
    throw new TsgitError(
      'You are not currently on a branch',
      ErrorCode.DETACHED_HEAD,
      [
        'wit checkout <branch>    # Switch to a branch first',
        'wit push origin <branch> # Or specify a branch to push',
      ]
    );
  }

  // Determine primary remote
  const primaryRemote = remoteName || 'origin';

  // Push to primary remote
  const result = await pushToSingleRemoteAsync(
    repo,
    remoteManager,
    primaryRemote,
    branchName,
    currentBranch,
    options
  );

  return result;
}

/**
 * Push to multiple remotes (async version)
 * 
 * Use this when you want to push to multiple remotes (dual-push)
 */
export async function pushMultiAsync(
  remoteName?: string,
  branchName?: string,
  options: PushOptions = {}
): Promise<MultiPushResult> {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);

  // Get current branch
  const currentBranch = repo.refs.getCurrentBranch();
  if (!currentBranch && !branchName && !options.all && !options.tags) {
    throw new TsgitError(
      'You are not currently on a branch',
      ErrorCode.DETACHED_HEAD,
      [
        'wit checkout <branch>    # Switch to a branch first',
        'wit push origin <branch> # Or specify a branch to push',
      ]
    );
  }

  // Determine which remotes to push to
  const primaryRemote = remoteName || 'origin';
  const remotesToPush: string[] = [primaryRemote];

  if (options.allRemotes) {
    // Push to all configured remotes
    const allRemotes = remoteManager.list();
    for (const remote of allRemotes) {
      if (!remotesToPush.includes(remote.name)) {
        remotesToPush.push(remote.name);
      }
    }
  } else if (options.also) {
    // Push to the specified additional remote
    if (!remotesToPush.includes(options.also)) {
      remotesToPush.push(options.also);
    }
  }

  // Push to all specified remotes
  const results: PushResult[] = [];
  let allSucceeded = true;

  for (const remote of remotesToPush) {
    try {
      // Only set upstream for the primary remote
      const remoteOptions = { 
        ...options, 
        setUpstream: remote === primaryRemote ? options.setUpstream : false 
      };
      
      const result = await pushToSingleRemoteAsync(
        repo,
        remoteManager,
        remote,
        branchName,
        currentBranch,
        remoteOptions
      );
      
      results.push(result);
      
      // Check if this push had any failures
      if (result.refs.some(r => r.status === 'rejected')) {
        allSucceeded = false;
      }
    } catch (error) {
      allSucceeded = false;
      // Create a failed result for this remote
      results.push({
        remote,
        refs: [{
          ref: branchName || currentBranch || 'unknown',
          status: 'rejected',
          message: error instanceof Error ? error.message : 'Push failed',
        }],
      });
    }
  }

  return { results, allSucceeded };
}

/**
 * Push to remote (sync version - only for local repos)
 */
export function push(
  remoteName?: string,
  branchName?: string,
  options: PushOptions = {}
): PushResult {
  throw new TsgitError(
    'Synchronous push is not supported. Use pushAsync() instead.',
    ErrorCode.OPERATION_FAILED,
    ['Use: await pushAsync(remoteName, branchName, options)']
  );
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
    console.log(colors.dim('hint: \'wit pull ...\') before pushing again.'));
  }
}

/**
 * CLI handler for push command (async)
 */
async function handlePushAsync(args: string[]): Promise<void> {
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
    } else if (arg === '--no-verify') {
      options.noVerify = true;
    } else if (arg === '--also') {
      // --also <remote> - push to an additional remote
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.also = args[++i];
      } else {
        throw new TsgitError(
          '--also requires a remote name',
          ErrorCode.INVALID_ARGUMENT,
          ['Usage: wit push --also <remote>', 'Example: wit push origin main --also github']
        );
      }
    } else if (arg === '--all-remotes') {
      options.allRemotes = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const remoteName = positional[0];
  const branchName = positional[1];

  // Run pre-push hook (unless --no-verify)
  if (!options.noVerify) {
    const repo = Repository.find();
    const hookManager = new HookManager(repo.gitDir, repo.workDir);
    const currentBranch = repo.refs.getCurrentBranch();
    
    const prePushError = await hookManager.shouldAbort('pre-push', {
      branch: currentBranch || branchName || undefined,
    });
    if (prePushError) {
      throw new TsgitError(
        'pre-push hook failed',
        ErrorCode.HOOK_FAILED,
        [prePushError, 'Use --no-verify to bypass hooks']
      );
    }
  }

  // Check if we need multi-remote push
  if (options.also || options.allRemotes) {
    const multiResult = await pushMultiAsync(remoteName, branchName, options);
    
    // Format output for each remote
    let totalPushed = 0;
    let totalNew = 0;
    let totalDeleted = 0;
    let totalRejected = 0;

    for (const result of multiResult.results) {
      console.log(colors.dim(`\nTo ${result.remote}`));
      formatPushResults(result, options.verbose || false);

      totalPushed += result.refs.filter(r => r.status === 'pushed').length;
      totalNew += result.refs.filter(r => r.status === 'new').length;
      totalDeleted += result.refs.filter(r => r.status === 'deleted').length;
      totalRejected += result.refs.filter(r => r.status === 'rejected').length;
    }

    // Summary
    console.log();
    if (totalPushed > 0 || totalNew > 0 || totalDeleted > 0) {
      const parts: string[] = [];
      if (totalPushed > 0) parts.push(`${totalPushed} updated`);
      if (totalNew > 0) parts.push(`${totalNew} new`);
      if (totalDeleted > 0) parts.push(`${totalDeleted} deleted`);

      console.log(
        colors.green('✓') + 
        ` Pushed to ${multiResult.results.length} remote(s): ${parts.join(', ')}`
      );
    } else if (totalRejected === 0) {
      console.log(colors.dim('Everything up-to-date on all remotes'));
    }

    if (totalRejected > 0) {
      process.exit(1);
    }
  } else {
    // Single remote push
    const result = await pushAsync(remoteName, branchName, options);

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
  }
}

/**
 * CLI handler for push command
 */
export function handlePush(args: string[]): void {
  handlePushAsync(args).catch(error => {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  });
}
