/**
 * Update-Ref Command
 * Update the object name stored in a ref safely
 * 
 * Usage:
 * - wit update-ref <ref> <hash>        # Update ref to point to hash
 * - wit update-ref -d <ref>            # Delete ref
 * - wit update-ref --stdin             # Batch update from stdin
 * 
 * This is a plumbing command for scripting and advanced usage.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, writeFile, mkdirp, deleteFile } from '../utils/fs';
import { isValidHash } from '../utils/hash';

export interface UpdateRefOptions {
  delete?: boolean;
  noDeref?: boolean;
  stdin?: boolean;
  createReflog?: boolean;
  oldValue?: string;
}

/**
 * Update a ref to point to a new hash
 */
export function updateRef(
  repo: Repository,
  refName: string,
  newValue: string,
  options: UpdateRefOptions = {}
): void {
  // Normalize ref name
  const fullRefName = normalizeRefName(refName);
  const refPath = path.join(repo.gitDir, fullRefName);

  // Check old value if specified
  if (options.oldValue !== undefined) {
    const currentValue = getRefValue(repo, fullRefName);
    if (currentValue !== options.oldValue) {
      throw new TsgitError(
        `Ref ${refName} is at ${currentValue || 'null'} but expected ${options.oldValue}`,
        ErrorCode.REF_NOT_FOUND,
        ['The ref has been updated by another process']
      );
    }
  }

  if (options.delete) {
    // Delete the ref
    if (!exists(refPath)) {
      throw new TsgitError(
        `Ref ${refName} does not exist`,
        ErrorCode.REF_NOT_FOUND,
        ['Check that the ref exists with: wit show-ref']
      );
    }
    deleteFile(refPath);
    
    // Clean up empty directories
    cleanupEmptyDirs(path.dirname(refPath), repo.gitDir);
    return;
  }

  // Validate the new hash
  if (!isValidHash(newValue) && !repo.objects.hasObject(newValue)) {
    // Try to resolve it as a ref
    const resolved = repo.refs.resolve(newValue);
    if (resolved) {
      newValue = resolved;
    } else {
      throw new TsgitError(
        `Not a valid object name: ${newValue}`,
        ErrorCode.OPERATION_FAILED,
        ['Provide a valid commit hash or reference']
      );
    }
  }

  // Ensure parent directories exist
  mkdirp(path.dirname(refPath));

  // Write the new value
  writeFile(refPath, newValue + '\n');
}

/**
 * Delete a ref
 */
export function deleteRef(
  repo: Repository,
  refName: string,
  options: UpdateRefOptions = {}
): void {
  updateRef(repo, refName, '', { ...options, delete: true });
}

/**
 * Get the current value of a ref
 */
function getRefValue(repo: Repository, fullRefName: string): string | null {
  const refPath = path.join(repo.gitDir, fullRefName);
  if (!exists(refPath)) {
    return null;
  }
  return fs.readFileSync(refPath, 'utf8').trim();
}

/**
 * Normalize a ref name to its full path
 */
function normalizeRefName(refName: string): string {
  // Already a full path
  if (refName.startsWith('refs/')) {
    return refName;
  }

  // HEAD is special
  if (refName === 'HEAD') {
    return 'HEAD';
  }

  // Assume it's a branch name
  return `refs/heads/${refName}`;
}

/**
 * Clean up empty parent directories
 */
function cleanupEmptyDirs(dir: string, stopAt: string): void {
  while (dir !== stopAt && dir.startsWith(stopAt)) {
    try {
      const entries = fs.readdirSync(dir);
      if (entries.length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}

/**
 * Process batch update from stdin
 */
async function processBatchUpdate(repo: Repository): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    const command = parts[0];

    try {
      if (command === 'update') {
        // update <ref> <new-value> [<old-value>]
        const [, refName, newValue, oldValue] = parts;
        updateRef(repo, refName, newValue, { oldValue });
      } else if (command === 'create') {
        // create <ref> <new-value>
        const [, refName, newValue] = parts;
        updateRef(repo, refName, newValue);
      } else if (command === 'delete') {
        // delete <ref> [<old-value>]
        const [, refName, oldValue] = parts;
        deleteRef(repo, refName, { oldValue });
      } else if (command === 'verify') {
        // verify <ref> <old-value>
        const [, refName, expectedValue] = parts;
        const fullRefName = normalizeRefName(refName);
        const actualValue = getRefValue(repo, fullRefName);
        if (actualValue !== expectedValue) {
          throw new Error(`Ref ${refName} is at ${actualValue || 'null'} but expected ${expectedValue}`);
        }
      } else {
        console.error(`Unknown command: ${command}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`error: ${error.message}`);
      }
      process.exit(1);
    }
  }
}

/**
 * CLI handler for update-ref command
 */
export function handleUpdateRef(args: string[]): void {
  const options: UpdateRefOptions = {};
  const positional: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-d' || arg === '--delete') {
      options.delete = true;
    } else if (arg === '--no-deref') {
      options.noDeref = true;
    } else if (arg === '--stdin') {
      options.stdin = true;
    } else if (arg === '--create-reflog') {
      options.createReflog = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  try {
    const repo = Repository.find();

    if (options.stdin) {
      // Process batch update from stdin
      processBatchUpdate(repo).catch((error: Error) => {
        console.error(`error: ${error.message}`);
        process.exit(1);
      });
      return;
    }

    if (options.delete) {
      // Delete mode: update-ref -d <ref>
      if (positional.length < 1) {
        console.error('error: too few arguments for -d');
        process.exit(1);
      }
      deleteRef(repo, positional[0], {
        oldValue: positional[1], // optional old value
      });
      return;
    }

    // Update mode: update-ref <ref> <newvalue> [<oldvalue>]
    if (positional.length < 2) {
      console.error('usage: wit update-ref <ref> <newvalue> [<oldvalue>]');
      console.error('   or: wit update-ref -d <ref> [<oldvalue>]');
      console.error('   or: wit update-ref --stdin');
      process.exit(1);
    }

    updateRef(repo, positional[0], positional[1], {
      oldValue: positional[2],
      noDeref: options.noDeref,
    });
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
