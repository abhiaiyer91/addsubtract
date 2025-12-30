/**
 * Merge command
 * Handles branch merging with structured conflict resolution
 */

import { Repository } from '../core/repository';
import { MergeManager, MergeOptions, formatMergeResult, formatConflict } from '../core/merge';
import { TsgitError, ErrorCode, Errors } from '../core/errors';
import { HookManager } from '../core/hooks';

const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

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
    throw new TsgitError(
      'No merge in progress to abort',
      ErrorCode.OPERATION_FAILED,
      [
        'wit status    # Check repository status',
        'wit merge <branch>    # Start a new merge',
      ]
    );
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
    throw new TsgitError(
      'No merge in progress to continue',
      ErrorCode.OPERATION_FAILED,
      [
        'wit status    # Check repository status',
        'wit merge <branch>    # Start a new merge',
      ]
    );
  }

  // Check for unresolved conflicts
  const unresolved = mergeManager.getUnresolvedConflicts();
  if (unresolved.length > 0) {
    const files = unresolved.map(c => c.path);
    throw new TsgitError(
      `Cannot continue merge: ${unresolved.length} unresolved conflict(s)`,
      ErrorCode.MERGE_CONFLICT,
      [
        `Unresolved files: ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` (+${files.length - 3} more)` : ''}`,
        'wit merge --conflicts    # View all conflicts',
        'wit merge --resolve <file>    # Mark file as resolved after fixing',
      ],
      { files }
    );
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
    throw new TsgitError(
      'No merge in progress - cannot mark file as resolved',
      ErrorCode.OPERATION_FAILED,
      [
        'wit status    # Check repository status',
        'wit merge <branch>    # Start a new merge',
      ]
    );
  }

  try {
    mergeManager.resolveFile(filePath);
    console.log(`Marked '${filePath}' as resolved`);

    const remaining = mergeManager.getUnresolvedConflicts();
    if (remaining.length === 0) {
      console.log(`\n${colors.cyan('hint:')} All conflicts resolved. Run ${colors.cyan('wit merge --continue')} to complete.`);
    } else {
      console.log(`\n${colors.yellow(remaining.length.toString())} conflict(s) remaining`);
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
        throw new TsgitError(
          '--resolve requires a file path',
          ErrorCode.INVALID_ARGUMENT,
          [
            'wit merge --resolve <file>    # Mark specific file as resolved',
            'wit merge --conflicts         # View files with conflicts',
          ]
        );
      }
      resolveFile(resolveFilePath);
      break;
    case 'merge':
    default:
      if (!branchName) {
        const repo = Repository.find();
        const branches = repo.refs.listBranches();
        const currentBranch = repo.refs.getCurrentBranch();
        const otherBranches = branches.filter(b => b !== currentBranch).slice(0, 3);

        const suggestions: string[] = [];
        if (otherBranches.length > 0) {
          suggestions.push(`Available branches: ${otherBranches.join(', ')}${branches.length > 4 ? '...' : ''}`);
        }
        suggestions.push('wit branch    # List all branches');
        suggestions.push('wit merge --help    # See all options');

        throw new TsgitError(
          'Branch name required for merge',
          ErrorCode.INVALID_ARGUMENT,
          suggestions
        );
      }
      await merge(branchName, options);
      break;
  }
}
