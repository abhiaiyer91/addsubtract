/**
 * Symbolic-Ref Command
 * Read, modify, and delete symbolic refs
 * 
 * Usage:
 * - wit symbolic-ref HEAD              # Output: refs/heads/main
 * - wit symbolic-ref HEAD refs/heads/x # Set HEAD to branch x
 * - wit symbolic-ref --short HEAD      # Output: main
 * - wit symbolic-ref -d <name>         # Delete symbolic ref
 * 
 * This is a plumbing command for scripting and advanced usage.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, readFileText, writeFile, deleteFile } from '../utils/fs';

export interface SymbolicRefOptions {
  short?: boolean;
  delete?: boolean;
  quiet?: boolean;
}

/**
 * Read a symbolic ref
 */
export function readSymbolicRef(
  repo: Repository,
  refName: string,
  options: SymbolicRefOptions = {}
): string | null {
  const refPath = path.join(repo.gitDir, refName);

  if (!exists(refPath)) {
    if (!options.quiet) {
      throw new TsgitError(
        `ref ${refName} is not a symbolic ref`,
        ErrorCode.REF_NOT_FOUND,
        ['Check that the ref exists']
      );
    }
    return null;
  }

  const content = readFileText(refPath).trim();

  // Check if it's a symbolic ref (starts with "ref: ")
  if (!content.startsWith('ref: ')) {
    if (!options.quiet) {
      throw new TsgitError(
        `ref ${refName} is not a symbolic ref`,
        ErrorCode.OPERATION_FAILED,
        ['The ref contains a direct hash, not a symbolic reference']
      );
    }
    return null;
  }

  const target = content.slice(5);

  if (options.short) {
    // Return short form (e.g., "main" instead of "refs/heads/main")
    if (target.startsWith('refs/heads/')) {
      return target.slice(11);
    }
    if (target.startsWith('refs/tags/')) {
      return target.slice(10);
    }
    if (target.startsWith('refs/remotes/')) {
      return target.slice(13);
    }
    return target;
  }

  return target;
}

/**
 * Set a symbolic ref to point to another ref
 */
export function setSymbolicRef(
  repo: Repository,
  refName: string,
  target: string,
  options: SymbolicRefOptions = {}
): void {
  const refPath = path.join(repo.gitDir, refName);

  // Normalize target to full ref path if needed
  const fullTarget = normalizeTarget(target);

  // Write the symbolic ref
  writeFile(refPath, `ref: ${fullTarget}\n`);
}

/**
 * Delete a symbolic ref
 */
export function deleteSymbolicRef(
  repo: Repository,
  refName: string,
  options: SymbolicRefOptions = {}
): void {
  const refPath = path.join(repo.gitDir, refName);

  if (!exists(refPath)) {
    if (!options.quiet) {
      throw new TsgitError(
        `ref ${refName} does not exist`,
        ErrorCode.REF_NOT_FOUND,
        ['Check that the ref exists']
      );
    }
    return;
  }

  // Check if it's actually a symbolic ref
  const content = readFileText(refPath).trim();
  if (!content.startsWith('ref: ')) {
    if (!options.quiet) {
      throw new TsgitError(
        `ref ${refName} is not a symbolic ref`,
        ErrorCode.OPERATION_FAILED,
        ['Use update-ref -d to delete regular refs']
      );
    }
    return;
  }

  deleteFile(refPath);
}

/**
 * Normalize a target ref to its full path
 */
function normalizeTarget(target: string): string {
  // Already a full path
  if (target.startsWith('refs/')) {
    return target;
  }

  // Assume it's a branch name
  return `refs/heads/${target}`;
}

/**
 * CLI handler for symbolic-ref command
 */
export function handleSymbolicRef(args: string[]): void {
  const options: SymbolicRefOptions = {};
  const positional: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--short') {
      options.short = true;
    } else if (arg === '-d' || arg === '--delete') {
      options.delete = true;
    } else if (arg === '-q' || arg === '--quiet') {
      options.quiet = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length === 0) {
    console.error('usage: wit symbolic-ref <name> [<ref>]');
    console.error('   or: wit symbolic-ref -d <name>');
    console.error('   or: wit symbolic-ref --short <name>');
    process.exit(1);
  }

  try {
    const repo = Repository.find();
    const refName = positional[0];

    if (options.delete) {
      // Delete mode
      deleteSymbolicRef(repo, refName, options);
      return;
    }

    if (positional.length === 1) {
      // Read mode
      const result = readSymbolicRef(repo, refName, options);
      if (result !== null) {
        console.log(result);
      } else if (!options.quiet) {
        process.exit(1);
      }
      return;
    }

    // Write mode
    const target = positional[1];
    setSymbolicRef(repo, refName, target, options);
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(`fatal: ${error.message}`);
    }
    process.exit(1);
  }
}
