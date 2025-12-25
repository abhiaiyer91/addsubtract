/**
 * Merge command
 * Handles branch merging with structured conflict resolution
 */

import { Repository } from '../core/repository';
import { MergeManager, MergeOptions, formatMergeResult, formatConflict } from '../core/merge';
import { TsgitError } from '../core/errors';

/**
 * Merge a branch into the current branch
 */
export function merge(
  branchName: string,
  options: MergeOptions = {}
): void {
  const repo = Repository.find();
  const mergeManager = new MergeManager(repo, repo.gitDir);

  try {
    const result = mergeManager.merge(branchName, options);
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
export function handleMerge(args: string[]): void {
  const options: MergeOptions = {};
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
        console.error('  -m <message>      Merge commit message');
        process.exit(1);
      }
      merge(branchName, options);
      break;
  }
}
