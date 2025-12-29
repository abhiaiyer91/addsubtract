/**
 * Merge command
 * Handles branch merging with structured conflict resolution
 */

import { Repository } from '../core/repository';
import { MergeManager, MergeOptions, formatMergeResult, formatConflict } from '../core/merge';
import { TsgitError } from '../core/errors';
import { HookManager } from '../core/hooks';

/**
 * Extended merge options with hook support
 */
export interface ExtendedMergeOptions extends MergeOptions {
  noVerify?: boolean;
}

/**
 * Merge a branch into the current branch
 */
export async function merge(
  branchName: string,
  options: ExtendedMergeOptions = {}
): Promise<void> {
  const repo = Repository.find();
  const mergeManager = new MergeManager(repo, repo.gitDir);
  const hookManager = new HookManager(repo.gitDir, repo.workDir);
  const currentBranch = repo.refs.getCurrentBranch();

  try {
    const result = mergeManager.merge(branchName, options);
    
    // Run post-merge hook after successful merge (if not in conflict state)
    if (result.success && !options.noVerify) {
      hookManager.runHook('post-merge', {
        branch: currentBranch || undefined,
        targetBranch: branchName,
      }).catch((err) => {
        console.error(`post-merge hook error: ${err.message}`);
      });
    }
    
    console.log(formatMergeResult(result));
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else {
      throw error;
    }
    process.exit(1);
  }
}

/**
 * Abort an in-progress merge
 */
export function mergeAbort(): void {
  const repo = Repository.find();
  const mergeManager = new MergeManager(repo, repo.gitDir);

  if (!mergeManager.isInProgress()) {
    console.error('No merge in progress');
    process.exit(1);
  }

  mergeManager.abort();
  console.log('Merge aborted.');
}

/**
 * Continue merge after resolving conflicts
 */
export function mergeContinue(message?: string): void {
  const repo = Repository.find();
  const mergeManager = new MergeManager(repo, repo.gitDir);

  if (!mergeManager.isInProgress()) {
    console.error('No merge in progress');
    process.exit(1);
  }

  try {
    const commitHash = mergeManager.continue(message);
    console.log(`Merge complete: ${commitHash.slice(0, 8)}`);
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else {
      throw error;
    }
    process.exit(1);
  }
}

/**
 * Show current merge conflicts
 */
export function showConflicts(): void {
  const repo = Repository.find();
  const mergeManager = new MergeManager(repo, repo.gitDir);

  const state = mergeManager.getState();
  if (!state) {
    console.log('No merge in progress');
    return;
  }

  const unresolved = mergeManager.getUnresolvedConflicts();
  
  if (unresolved.length === 0) {
    console.log('All conflicts resolved. Run `wit merge --continue` to complete.');
    return;
  }

  console.log(`Merging ${state.sourceBranch} into ${state.targetBranch}`);
  console.log(`${unresolved.length} unresolved conflict(s):\n`);

  for (const conflict of unresolved) {
    console.log(formatConflict(conflict));
  }
}

/**
 * Mark a file as resolved
 */
export function resolveFile(filePath: string): void {
  const repo = Repository.find();
  const mergeManager = new MergeManager(repo, repo.gitDir);

  if (!mergeManager.isInProgress()) {
    console.error('No merge in progress');
    process.exit(1);
  }

  try {
    mergeManager.resolveFile(filePath);
    console.log(`Marked '${filePath}' as resolved`);

    const remaining = mergeManager.getUnresolvedConflicts();
    if (remaining.length === 0) {
      console.log('\nAll conflicts resolved. Run `wit merge --continue` to complete.');
    } else {
      console.log(`\n${remaining.length} conflict(s) remaining`);
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else {
      throw error;
    }
    process.exit(1);
  }
}

/**
 * CLI handler for merge command
 */
export async function handleMerge(args: string[]): Promise<void> {
  const options: ExtendedMergeOptions = {};
  let branchName: string | undefined;
  let action: 'merge' | 'abort' | 'continue' | 'conflicts' | 'resolve' = 'merge';
  let resolveFilePath: string | undefined;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--abort') {
      action = 'abort';
    } else if (arg === '--continue') {
      action = 'continue';
    } else if (arg === '--conflicts') {
      action = 'conflicts';
    } else if (arg === '--resolve') {
      action = 'resolve';
      resolveFilePath = args[++i];
    } else if (arg === '--no-commit') {
      options.noCommit = true;
    } else if (arg === '--no-ff') {
      options.noFastForward = true;
    } else if (arg === '--squash') {
      options.squash = true;
    } else if (arg === '--no-verify') {
      options.noVerify = true;
    } else if (arg === '-m' || arg === '--message') {
      options.message = args[++i];
    } else if (!arg.startsWith('-')) {
      branchName = arg;
    }
  }

  switch (action) {
    case 'abort':
      mergeAbort();
      break;
    case 'continue':
      mergeContinue(options.message);
      break;
    case 'conflicts':
      showConflicts();
      break;
    case 'resolve':
      if (!resolveFilePath) {
        console.error('error: --resolve requires a file path');
        process.exit(1);
      }
      resolveFile(resolveFilePath);
      break;
    case 'merge':
    default:
      if (!branchName) {
        console.error('error: Branch name required');
        console.error('\nUsage: wit merge [options] <branch>');
        console.error('\nOptions:');
        console.error('  --abort           Abort the current merge');
        console.error('  --continue        Continue after resolving conflicts');
        console.error('  --conflicts       Show current conflicts');
        console.error('  --resolve <file>  Mark file as resolved');
        console.error('  --no-commit       Perform merge but don\'t commit');
        console.error('  --no-ff           Create merge commit even for fast-forward');
        console.error('  --squash          Squash commits');
        console.error('  --no-verify       Skip post-merge hooks');
        console.error('  -m <message>      Merge commit message');
        process.exit(1);
      }
      await merge(branchName, options);
      break;
  }
}
