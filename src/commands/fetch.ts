/**
 * Fetch Command
 * Download objects and refs from remote repositories
 * 
 * Usage:
 *   wit fetch                     # Fetch from origin
 *   wit fetch <remote>            # Fetch from specific remote
 *   wit fetch --all               # Fetch from all remotes
 *   wit fetch --prune             # Delete stale remote refs
 *   wit fetch <remote> <refspec>  # Fetch specific ref
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { RemoteManager, RemoteConfig } from '../core/remote';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, readDir, isDirectory } from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Fetch options
 */
export interface FetchOptions {
  all?: boolean;
  prune?: boolean;
  tags?: boolean;
  depth?: number;
  deepen?: number;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  progress?: boolean;
}

/**
 * Fetch result for a single branch
 */
export interface FetchBranchResult {
  remote: string;
  branch: string;
  oldHash: string | null;
  newHash: string;
  status: 'new' | 'updated' | 'unchanged' | 'pruned';
}

/**
 * Fetch result summary
 */
export interface FetchResult {
  remote: string;
  branches: FetchBranchResult[];
  newBranches: number;
  updatedBranches: number;
  prunedBranches: number;
  objectsFetched: number;
}

/**
 * Fetch from a local repository (file:// protocol)
 */
function fetchFromLocal(
  repo: Repository,
  remoteManager: RemoteManager,
  remote: RemoteConfig,
  refspec?: string,
  options: FetchOptions = {}
): FetchResult {
  const result: FetchResult = {
    remote: remote.name,
    branches: [],
    newBranches: 0,
    updatedBranches: 0,
    prunedBranches: 0,
    objectsFetched: 0,
  };

  // Get source repository
  const sourcePath = remote.url;
  const sourceGitDir = path.join(sourcePath, '.wit');
  
  if (!exists(sourceGitDir)) {
    throw new TsgitError(
      `Could not read from remote repository '${remote.name}'`,
      ErrorCode.NOT_A_REPOSITORY,
      ['Check that the remote URL is correct: ' + remote.url]
    );
  }

  const sourceRepo = new Repository(sourcePath);
  const sourceBranches = sourceRepo.refs.listBranches();

  // Get current tracking branches
  const currentTracking = remoteManager.getTrackingBranches(remote.name);
  const currentTrackingMap = new Map<string, string>();
  for (const tb of currentTracking) {
    currentTrackingMap.set(tb.branch, tb.hash);
  }

  // Determine which branches to fetch
  let branchesToFetch = sourceBranches;
  if (refspec) {
    // Parse refspec (simplified: just branch name)
    const branchName = refspec.replace(/^refs\/heads\//, '').split(':')[0];
    branchesToFetch = sourceBranches.filter(b => b === branchName);
  }

  // Copy new objects
  const sourceObjectsDir = path.join(sourceGitDir, 'objects');
  const destObjectsDir = path.join(repo.gitDir, 'objects');
  let objectsCopied = 0;

  if (exists(sourceObjectsDir)) {
    objectsCopied = copyNewObjects(sourceObjectsDir, destObjectsDir);
    result.objectsFetched = objectsCopied;
  }

  // Update tracking branches
  for (const branch of branchesToFetch) {
    const hash = sourceRepo.refs.resolve(branch);
    if (!hash) continue;

    const oldHash = currentTrackingMap.get(branch) || null;

    if (oldHash === hash) {
      result.branches.push({
        remote: remote.name,
        branch,
        oldHash,
        newHash: hash,
        status: 'unchanged',
      });
    } else {
      remoteManager.updateTrackingBranch(remote.name, branch, hash);
      
      if (oldHash === null) {
        result.branches.push({
          remote: remote.name,
          branch,
          oldHash,
          newHash: hash,
          status: 'new',
        });
        result.newBranches++;
      } else {
        result.branches.push({
          remote: remote.name,
          branch,
          oldHash,
          newHash: hash,
          status: 'updated',
        });
        result.updatedBranches++;
      }
    }

    currentTrackingMap.delete(branch);
  }

  // Handle pruning
  if (options.prune) {
    for (const [branch, hash] of currentTrackingMap) {
      remoteManager.deleteTrackingBranch(remote.name, branch);
      result.branches.push({
        remote: remote.name,
        branch,
        oldHash: hash,
        newHash: '',
        status: 'pruned',
      });
      result.prunedBranches++;
    }
  }

  // Fetch tags if requested
  if (options.tags) {
    const sourceTags = sourceRepo.refs.listTags();
    for (const tag of sourceTags) {
      const hash = sourceRepo.refs.resolve(`refs/tags/${tag}`);
      if (hash && !repo.refs.tagExists(tag)) {
        repo.refs.createTag(tag, hash);
      }
    }
  }

  return result;
}

/**
 * Copy new objects from source to destination
 */
function copyNewObjects(src: string, dest: string): number {
  let copied = 0;
  
  if (!exists(src)) return copied;

  const entries = readDir(src);
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    
    if (isDirectory(srcPath)) {
      // Hash prefix directory
      if (!exists(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      
      const objects = readDir(srcPath);
      for (const obj of objects) {
        const srcObjPath = path.join(srcPath, obj);
        const destObjPath = path.join(destPath, obj);
        
        if (!exists(destObjPath)) {
          fs.copyFileSync(srcObjPath, destObjPath);
          copied++;
        }
      }
    }
  }
  
  return copied;
}

/**
 * Fetch from a remote (network)
 */
function fetchFromRemote(
  repo: Repository,
  remoteManager: RemoteManager,
  remote: RemoteConfig,
  refspec?: string,
  options: FetchOptions = {}
): FetchResult {
  const result: FetchResult = {
    remote: remote.name,
    branches: [],
    newBranches: 0,
    updatedBranches: 0,
    prunedBranches: 0,
    objectsFetched: 0,
  };

  // For network remotes, we need to implement the Git protocol
  // This is a placeholder that explains what would happen
  console.log(colors.dim(`Fetching from ${remote.name} (${remote.url})...`));
  console.log();
  console.log(colors.yellow('!') + ' Network fetch requires Git wire protocol implementation');
  console.log(colors.dim('  In a full implementation, this would:'));
  console.log(colors.dim('  1. Connect to the remote server'));
  console.log(colors.dim('  2. Negotiate which objects to transfer'));
  console.log(colors.dim('  3. Download pack files'));
  console.log(colors.dim('  4. Update remote tracking branches'));
  console.log();
  
  if (options.depth) {
    console.log(colors.dim(`  Would fetch with depth: ${options.depth}`));
  }
  
  if (options.prune) {
    console.log(colors.dim('  Would prune stale remote-tracking branches'));
  }

  console.log(colors.cyan('ℹ') + ' For now, use local paths or interop with Git for network operations.');

  return result;
}

/**
 * Fetch from a remote
 */
export function fetch(
  remoteName?: string,
  refspec?: string,
  options: FetchOptions = {}
): FetchResult[] {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);
  const results: FetchResult[] = [];

  // Get remotes to fetch from
  let remotes: RemoteConfig[];
  
  if (options.all) {
    remotes = remoteManager.list();
    if (remotes.length === 0) {
      throw new TsgitError(
        'No remotes configured',
        ErrorCode.REF_NOT_FOUND,
        ['wit remote add <name> <url>    # Add a remote first']
      );
    }
  } else {
    const name = remoteName || 'origin';
    const remote = remoteManager.get(name);
    
    if (!remote) {
      const available = remoteManager.list().map(r => r.name);
      throw new TsgitError(
        `'${name}' does not appear to be a git repository`,
        ErrorCode.REF_NOT_FOUND,
        available.length > 0 
          ? [`Available remotes: ${available.join(', ')}`]
          : ['wit remote add origin <url>    # Add origin remote']
      );
    }
    
    remotes = [remote];
  }

  // Fetch from each remote
  for (const remote of remotes) {
    let result: FetchResult;

    // Check if it's a local path
    if (exists(remote.url) || remote.url.startsWith('/') || remote.url.startsWith('./')) {
      result = fetchFromLocal(repo, remoteManager, remote, refspec, options);
    } else {
      result = fetchFromRemote(repo, remoteManager, remote, refspec, options);
    }

    results.push(result);
  }

  return results;
}

/**
 * Format fetch results for display
 */
function formatFetchResults(results: FetchResult[], verbose: boolean): void {
  for (const result of results) {
    const hasChanges = result.newBranches > 0 || 
                       result.updatedBranches > 0 || 
                       result.prunedBranches > 0;

    if (!hasChanges && !verbose) {
      continue;
    }

    if (results.length > 1) {
      console.log(colors.bold(`From ${result.remote}`));
    }

    for (const branch of result.branches) {
      if (branch.status === 'unchanged' && !verbose) {
        continue;
      }

      const arrow = '  ';
      let status = '';
      let ref = `${result.remote}/${branch.branch}`;

      switch (branch.status) {
        case 'new':
          status = colors.green(' * [new branch]     ');
          break;
        case 'updated':
          const oldShort = branch.oldHash?.slice(0, 7) || '';
          const newShort = branch.newHash.slice(0, 7);
          status = `   ${oldShort}..${newShort}  `;
          break;
        case 'pruned':
          status = colors.red(' - [deleted]        ');
          ref = `(was ${branch.oldHash?.slice(0, 7)})`;
          break;
        case 'unchanged':
          status = colors.dim(' = [up to date]     ');
          break;
      }

      console.log(`${arrow}${status}${ref}`);
    }

    if (result.objectsFetched > 0) {
      console.log(colors.dim(`  Fetched ${result.objectsFetched} objects`));
    }
  }
}

/**
 * CLI handler for fetch command
 */
export function handleFetch(args: string[]): void {
  const options: FetchOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--prune' || arg === '-p') {
      options.prune = true;
    } else if (arg === '--tags' || arg === '-t') {
      options.tags = true;
    } else if (arg === '--depth') {
      options.depth = parseInt(args[++i], 10);
    } else if (arg === '--deepen') {
      options.deepen = parseInt(args[++i], 10);
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--progress') {
      options.progress = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const remoteName = positional[0];
  const refspec = positional[1];

  try {
    const results = fetch(remoteName, refspec, options);
    
    formatFetchResults(results, options.verbose || false);

    // Summary
    const totalNew = results.reduce((sum, r) => sum + r.newBranches, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.updatedBranches, 0);
    const totalPruned = results.reduce((sum, r) => sum + r.prunedBranches, 0);
    const totalObjects = results.reduce((sum, r) => sum + r.objectsFetched, 0);

    if (totalNew === 0 && totalUpdated === 0 && totalPruned === 0) {
      // Only show if there's nothing to report
      if (results.length > 0 && results[0].branches.length > 0) {
        console.log(colors.dim('Already up to date.'));
      }
    } else {
      const parts: string[] = [];
      if (totalNew > 0) parts.push(`${totalNew} new`);
      if (totalUpdated > 0) parts.push(`${totalUpdated} updated`);
      if (totalPruned > 0) parts.push(`${totalPruned} pruned`);
      
      console.log(colors.green('✓') + ` Fetch complete: ${parts.join(', ')}`);
      
      if (totalObjects > 0) {
        console.log(colors.dim(`  ${totalObjects} objects received`));
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
