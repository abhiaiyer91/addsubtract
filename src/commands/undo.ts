/**
 * Undo command - revert the last operation
 * Uses the journal to track and undo operations
 */

import { Repository } from '../core/repository';
import { Journal, JournalEntry, formatHistory, isUndoable } from '../core/journal';
import { TsgitError, ErrorCode } from '../core/errors';

/**
 * Options for undo command
 */
export interface UndoOptions {
  steps?: number;     // Number of operations to undo (default: 1)
  dryRun?: boolean;   // Show what would be undone without doing it
}

/**
 * Result of undo operation
 */
export interface UndoResult {
  success: boolean;
  undoneOperations: JournalEntry[];
  message: string;
}

/**
 * Undo the last operation(s)
 * 
 * @example
 * // Undo last operation
 * wit undo
 * 
 * // Undo last 3 operations
 * wit undo --steps 3
 * 
 * // Show what would be undone
 * wit undo --dry-run
 */
export function undo(
  repo: Repository,
  options: UndoOptions = {}
): UndoResult {
  const journal = new Journal(repo.gitDir);
  const steps = options.steps || 1;
  const undoneOperations: JournalEntry[] = [];

  if (journal.isEmpty()) {
    throw new TsgitError(
      'Nothing to undo',
      ErrorCode.OPERATION_FAILED,
      ['wit history    # View operation history']
    );
  }

  // Get operations to undo
  const history = journal.history(steps);
  
  if (history.length === 0) {
    throw new TsgitError(
      'No operations to undo',
      ErrorCode.OPERATION_FAILED
    );
  }

  // Check if operations are undoable
  for (const entry of history) {
    if (!isUndoable(entry.operation)) {
      throw new TsgitError(
        `Operation '${entry.operation}' cannot be undone`,
        ErrorCode.OPERATION_FAILED,
        ['Some operations are not reversible']
      );
    }
  }

  if (options.dryRun) {
    let message = `Would undo ${history.length} operation(s):\n\n`;
    for (const entry of history) {
      message += `  ${entry.operation}: ${entry.description}\n`;
    }
    return {
      success: true,
      undoneOperations: history,
      message,
    };
  }

  // Perform the undo
  for (const entry of history) {
    try {
      undoOperation(repo, entry);
      journal.popEntry();
      undoneOperations.push(entry);
    } catch (error) {
      throw new TsgitError(
        `Failed to undo '${entry.operation}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.OPERATION_FAILED
      );
    }
  }

  const message = undoneOperations.length === 1
    ? `Undone: ${undoneOperations[0].operation} - ${undoneOperations[0].description}`
    : `Undone ${undoneOperations.length} operations`;

  return {
    success: true,
    undoneOperations,
    message,
  };
}

/**
 * Undo a single operation
 */
function undoOperation(repo: Repository, entry: JournalEntry): void {
  const { beforeState } = entry;

  switch (entry.operation) {
    case 'commit':
      // Reset HEAD to parent commit
      if (beforeState.branch) {
        const parentHash = beforeState.head;
        if (parentHash && parentHash.startsWith('ref: ')) {
          // No parent, this was first commit
          // Would need to handle this case specially
        } else if (parentHash) {
          repo.refs.updateBranch(beforeState.branch, parentHash);
        }
      }
      break;

    case 'add':
      // Remove files from index
      if (entry.affectedFiles) {
        for (const file of entry.affectedFiles) {
          repo.index.remove(file);
        }
        repo.index.save();
      }
      break;

    case 'switch':
    case 'checkout':
      // Switch back to previous branch
      if (beforeState.branch) {
        repo.checkout(beforeState.branch);
      } else if (beforeState.head) {
        repo.checkout(beforeState.head);
      }
      break;

    case 'branch-create':
      // Delete the created branch
      const branchName = entry.args[0];
      if (branchName && repo.refs.branchExists(branchName)) {
        repo.refs.deleteBranch(branchName);
      }
      break;

    case 'branch-delete':
      // Recreate the deleted branch
      const deletedBranch = entry.args[0];
      const commitHash = entry.context?.commitHash as string;
      if (deletedBranch && commitHash) {
        repo.refs.createBranch(deletedBranch, commitHash);
      }
      break;

    case 'reset':
      // Restore to pre-reset state
      if (beforeState.branch && beforeState.head) {
        repo.refs.updateBranch(beforeState.branch, beforeState.head);
      }
      break;

    default:
      throw new Error(`Don't know how to undo '${entry.operation}'`);
  }
}

/**
 * Show operation history
 */
export function history(repo: Repository, limit: number = 20): string {
  const journal = new Journal(repo.gitDir);
  const entries = journal.history(limit);
  return formatHistory(entries);
}

/**
 * CLI handler for undo command
 */
export function handleUndo(args: string[]): void {
  const repo = Repository.find();
  const options: UndoOptions = {};

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-n' || arg === '--steps') {
      options.steps = parseInt(args[++i], 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  try {
    const result = undo(repo, options);
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

/**
 * CLI handler for history command
 */
export function handleHistory(args: string[]): void {
  const repo = Repository.find();
  let limit = 20;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-n' || arg === '--limit') {
      limit = parseInt(args[++i], 10);
    }
  }

  const output = history(repo, limit);
  console.log(output);
}
