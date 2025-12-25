/**
 * Restore command - dedicated file restoration
 * Unlike git checkout, this command ONLY restores files
 * For branch switching, use the 'switch' command
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { Journal, StateSnapshot } from '../core/journal';
import { TsgitError, Errors, ErrorCode } from '../core/errors';
import { exists, writeFile, mkdirp } from '../utils/fs';

/**
 * Options for restore command
 */
export interface RestoreOptions {
  source?: string;          // Source to restore from (default: index for --staged, HEAD for working tree)
  staged?: boolean;         // Restore staged files (unstage)
  worktree?: boolean;       // Restore working tree files (default if not --staged)
  theirs?: boolean;         // During merge, use theirs version
  ours?: boolean;           // During merge, use ours version
  merge?: boolean;          // Restore to merge state
}

/**
 * Result of restore operation
 */
export interface RestoreResult {
  success: boolean;
  restoredFiles: string[];
  failedFiles: { path: string; reason: string }[];
  message: string;
}

/**
 * Restore file contents to working directory or index
 * 
 * @example
 * // Restore file from index (discard working tree changes)
 * wit restore file.txt
 * 
 * // Restore file from a specific commit
 * wit restore --source HEAD~1 file.txt
 * 
 * // Unstage a file (restore staged to index)
 * wit restore --staged file.txt
 * 
 * // Restore all files
 * wit restore .
 */
export function restore(
  repo: Repository,
  paths: string[],
  options: RestoreOptions = {}
): RestoreResult {
  const journal = new Journal(repo.gitDir);
  const restoredFiles: string[] = [];
  const failedFiles: { path: string; reason: string }[] = [];

  // Default to restoring worktree if neither specified
  if (!options.staged && !options.worktree) {
    options.worktree = true;
  }

  // Default source
  const source = options.source || (options.staged ? 'HEAD' : undefined);

  // Capture state before operation
  const beforeState: StateSnapshot = {
    head: repo.refs.getHead().target,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };

  for (const filePath of paths) {
    try {
      // Handle '.' to restore all
      if (filePath === '.') {
        const allFiles = options.staged 
          ? repo.index.getEntries().map(e => e.path)
          : Object.keys(getTrackedFiles(repo));
        
        for (const file of allFiles) {
          try {
            restoreSingleFile(repo, file, options, source);
            restoredFiles.push(file);
          } catch (error) {
            failedFiles.push({
              path: file,
              reason: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
        continue;
      }

      restoreSingleFile(repo, filePath, options, source);
      restoredFiles.push(filePath);
    } catch (error) {
      failedFiles.push({
        path: filePath,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Capture state after operation
  const afterState: StateSnapshot = {
    head: repo.refs.getHead().target,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };

  // Record in journal
  if (restoredFiles.length > 0) {
    journal.record(
      'restore',
      paths,
      `Restored ${restoredFiles.length} file(s)`,
      beforeState,
      afterState,
      { affectedFiles: restoredFiles }
    );
  }

  // Build result message
  let message = '';
  if (restoredFiles.length > 0) {
    message = `Restored ${restoredFiles.length} file(s)`;
    if (options.staged) {
      message = `Unstaged ${restoredFiles.length} file(s)`;
    }
  }
  if (failedFiles.length > 0) {
    message += `\nFailed to restore ${failedFiles.length} file(s)`;
  }

  return {
    success: failedFiles.length === 0,
    restoredFiles,
    failedFiles,
    message: message || 'Nothing to restore',
  };
}

/**
 * Restore a single file
 */
function restoreSingleFile(
  repo: Repository,
  filePath: string,
  options: RestoreOptions,
  source?: string
): void {
  const fullPath = path.join(repo.workDir, filePath);

  if (options.staged) {
    // Unstage: restore index entry from source (usually HEAD)
    const sourceRef = source || 'HEAD';
    const content = repo.getFileAtRef(sourceRef, filePath);
    
    if (content) {
      const hash = repo.objects.writeBlob(content);
      repo.index.add(filePath, hash, repo.workDir);
      repo.index.save();
    } else {
      // File doesn't exist in source, remove from index
      repo.index.remove(filePath);
      repo.index.save();
    }
  }

  if (options.worktree) {
    let content: Buffer | null = null;

    if (source) {
      // Restore from specific commit/ref
      content = repo.getFileAtRef(source, filePath);
      if (!content) {
        throw new TsgitError(
          `Path '${filePath}' does not exist in '${source}'`,
          ErrorCode.FILE_NOT_FOUND,
          [`wit log    # View available commits`]
        );
      }
    } else {
      // Restore from index
      const entry = repo.index.get(filePath);
      if (!entry) {
        throw new TsgitError(
          `Path '${filePath}' is not in the index`,
          ErrorCode.FILE_NOT_STAGED,
          [
            `wit restore --source HEAD ${filePath}    # Restore from HEAD`,
            `wit status    # Check file status`,
          ]
        );
      }
      const blob = repo.objects.readBlob(entry.hash);
      content = blob.content;
    }

    // Write to working directory
    mkdirp(path.dirname(fullPath));
    writeFile(fullPath, content);
  }
}

/**
 * Get all tracked files in the repository
 */
function getTrackedFiles(repo: Repository): Record<string, string> {
  const headHash = repo.refs.resolve('HEAD');
  if (!headHash) {
    return {};
  }

  const result: Record<string, string> = {};
  const commit = repo.objects.readCommit(headHash);
  flattenTree(repo, commit.treeHash, '', result);
  return result;
}

/**
 * Flatten tree to file paths
 */
function flattenTree(
  repo: Repository,
  treeHash: string,
  prefix: string,
  result: Record<string, string>
): void {
  const tree = repo.objects.readTree(treeHash);

  for (const entry of tree.entries) {
    const fullPath = prefix ? prefix + '/' + entry.name : entry.name;

    if (entry.mode === '40000') {
      flattenTree(repo, entry.hash, fullPath, result);
    } else {
      result[fullPath] = entry.hash;
    }
  }
}

/**
 * CLI handler for restore command
 */
export function handleRestore(args: string[]): void {
  const repo = Repository.find();
  const options: RestoreOptions = {};
  const paths: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-s' || arg === '--source') {
      options.source = args[++i];
    } else if (arg === '-S' || arg === '--staged') {
      options.staged = true;
    } else if (arg === '-W' || arg === '--worktree') {
      options.worktree = true;
    } else if (arg === '--theirs') {
      options.theirs = true;
    } else if (arg === '--ours') {
      options.ours = true;
    } else if (arg === '-m' || arg === '--merge') {
      options.merge = true;
    } else if (!arg.startsWith('-')) {
      paths.push(arg);
    }
  }

  if (paths.length === 0) {
    console.error('Error: File path(s) required');
    console.error('\nUsage: wit restore [options] <pathspec>...');
    console.error('\nOptions:');
    console.error('  -s, --source <ref>  Restore from specific commit/ref');
    console.error('  -S, --staged        Restore staged content (unstage)');
    console.error('  -W, --worktree      Restore working tree files');
    console.error('  --theirs            Use theirs version during merge');
    console.error('  --ours              Use ours version during merge');
    console.error('\nExamples:');
    console.error('  wit restore file.txt           # Restore from index');
    console.error('  wit restore --staged file.txt  # Unstage file');
    console.error('  wit restore --source HEAD~1 .  # Restore all from previous commit');
    process.exit(1);
  }

  try {
    const result = restore(repo, paths, options);
    console.log(result.message);
    
    if (result.failedFiles.length > 0) {
      console.error('\nFailed files:');
      for (const failed of result.failedFiles) {
        console.error(`  ${failed.path}: ${failed.reason}`);
      }
    }

    if (!result.success) {
      process.exit(1);
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
