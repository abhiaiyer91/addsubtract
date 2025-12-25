/**
 * Fsck Command
 * Verify the connectivity and validity of objects in the database
 * 
 * Usage:
 * - wit fsck                        # Verify object database
 * - wit fsck --full                 # Full verification (slower)
 * - wit fsck --unreachable          # Show unreachable objects
 * - wit fsck --dangling             # Show dangling objects (default)
 * - wit fsck --connectivity-only    # Only check reachability
 * 
 * This is a plumbing command for verifying repository integrity.
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { Commit, Tree, Tag, Blob } from '../core/object';
import { hashObject } from '../utils/hash';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export interface FsckOptions {
  full?: boolean;
  unreachable?: boolean;
  dangling?: boolean;
  connectivityOnly?: boolean;
  verbose?: boolean;
  strict?: boolean;
}

export interface FsckResult {
  valid: boolean;
  errors: FsckError[];
  warnings: FsckWarning[];
  stats: FsckStats;
}

export interface FsckError {
  type: 'missing' | 'corrupt' | 'hash-mismatch' | 'invalid-type' | 'parse-error';
  objectHash: string;
  objectType?: string;
  message: string;
}

export interface FsckWarning {
  type: 'dangling' | 'unreachable';
  objectHash: string;
  objectType: string;
}

export interface FsckStats {
  commits: number;
  trees: number;
  blobs: number;
  tags: number;
  totalObjects: number;
  reachableObjects: number;
  danglingObjects: number;
}

/**
 * Verify the object database
 */
export function fsck(
  repo: Repository,
  options: FsckOptions = {}
): FsckResult {
  const errors: FsckError[] = [];
  const warnings: FsckWarning[] = [];
  const stats: FsckStats = {
    commits: 0,
    trees: 0,
    blobs: 0,
    tags: 0,
    totalObjects: 0,
    reachableObjects: 0,
    danglingObjects: 0,
  };

  // Get all objects in the database
  const allObjects = repo.objects.listObjects();
  stats.totalObjects = allObjects.length;

  // Set of reachable objects (from refs)
  const reachable = new Set<string>();

  // First pass: find all reachable objects from refs
  const refs = getAllRefs(repo);
  for (const { hash } of refs) {
    markReachable(repo, hash, reachable, errors);
  }

  stats.reachableObjects = reachable.size;

  // Second pass: verify each object
  for (const hash of allObjects) {
    try {
      const { type, content } = repo.objects.readRawObject(hash);

      // Count by type
      switch (type) {
        case 'commit':
          stats.commits++;
          break;
        case 'tree':
          stats.trees++;
          break;
        case 'blob':
          stats.blobs++;
          break;
        case 'tag':
          stats.tags++;
          break;
      }

      // Full verification: check hash matches content
      if (options.full) {
        const computedHash = hashObject(type, content);
        if (computedHash !== hash) {
          errors.push({
            type: 'hash-mismatch',
            objectHash: hash,
            objectType: type,
            message: `Object ${hash} has hash mismatch (computed ${computedHash})`,
          });
        }
      }

      // Verify object structure
      if (!options.connectivityOnly) {
        verifyObject(repo, hash, type, content, errors);
      }

      // Check for dangling/unreachable objects
      if (!reachable.has(hash)) {
        stats.danglingObjects++;
        if (options.dangling || options.unreachable) {
          warnings.push({
            type: 'dangling',
            objectHash: hash,
            objectType: type,
          });
        }
      }
    } catch (error) {
      errors.push({
        type: 'corrupt',
        objectHash: hash,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * Get all refs in the repository
 */
function getAllRefs(repo: Repository): { name: string; hash: string }[] {
  const refs: { name: string; hash: string }[] = [];

  // HEAD
  const head = repo.refs.getHead();
  if (!head.isSymbolic) {
    refs.push({ name: 'HEAD', hash: head.target });
  } else {
    const resolved = repo.refs.resolve('HEAD');
    if (resolved) {
      refs.push({ name: 'HEAD', hash: resolved });
    }
  }

  // Branches
  for (const branch of repo.refs.listBranches()) {
    const hash = repo.refs.resolve(branch);
    if (hash) {
      refs.push({ name: `refs/heads/${branch}`, hash });
    }
  }

  // Tags
  for (const tag of repo.refs.listTags()) {
    const hash = repo.refs.resolve(tag);
    if (hash) {
      refs.push({ name: `refs/tags/${tag}`, hash });
    }
  }

  return refs;
}

/**
 * Mark all objects reachable from a starting hash
 */
function markReachable(
  repo: Repository,
  hash: string,
  reachable: Set<string>,
  errors: FsckError[]
): void {
  if (reachable.has(hash)) return;

  if (!repo.objects.hasObject(hash)) {
    errors.push({
      type: 'missing',
      objectHash: hash,
      message: `Missing object ${hash}`,
    });
    return;
  }

  reachable.add(hash);

  try {
    const obj = repo.objects.readObject(hash);

    if (obj instanceof Commit) {
      // Mark tree as reachable
      markReachable(repo, obj.treeHash, reachable, errors);

      // Mark parents as reachable
      for (const parent of obj.parentHashes) {
        markReachable(repo, parent, reachable, errors);
      }
    } else if (obj instanceof Tree) {
      // Mark all entries as reachable
      for (const entry of obj.entries) {
        markReachable(repo, entry.hash, reachable, errors);
      }
    } else if (obj instanceof Tag) {
      // Mark tagged object as reachable
      markReachable(repo, obj.objectHash, reachable, errors);
    }
    // Blobs have no references
  } catch (error) {
    errors.push({
      type: 'corrupt',
      objectHash: hash,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Verify object structure is valid
 */
function verifyObject(
  repo: Repository,
  hash: string,
  type: string,
  content: Buffer,
  errors: FsckError[]
): void {
  try {
    switch (type) {
      case 'commit': {
        const commit = Commit.deserialize(content);
        // Verify tree exists
        if (!repo.objects.hasObject(commit.treeHash)) {
          errors.push({
            type: 'missing',
            objectHash: hash,
            objectType: 'commit',
            message: `Commit ${hash} references missing tree ${commit.treeHash}`,
          });
        }
        // Verify parents exist
        for (const parent of commit.parentHashes) {
          if (!repo.objects.hasObject(parent)) {
            errors.push({
              type: 'missing',
              objectHash: hash,
              objectType: 'commit',
              message: `Commit ${hash} references missing parent ${parent}`,
            });
          }
        }
        break;
      }

      case 'tree': {
        const tree = Tree.deserialize(content);
        for (const entry of tree.entries) {
          if (!repo.objects.hasObject(entry.hash)) {
            errors.push({
              type: 'missing',
              objectHash: hash,
              objectType: 'tree',
              message: `Tree ${hash} references missing object ${entry.hash} (${entry.name})`,
            });
          }
        }
        break;
      }

      case 'tag': {
        const tag = Tag.deserialize(content);
        if (!repo.objects.hasObject(tag.objectHash)) {
          errors.push({
            type: 'missing',
            objectHash: hash,
            objectType: 'tag',
            message: `Tag ${hash} references missing object ${tag.objectHash}`,
          });
        }
        break;
      }

      case 'blob':
        // Blobs are just content, no verification needed
        break;

      default:
        errors.push({
          type: 'invalid-type',
          objectHash: hash,
          message: `Unknown object type: ${type}`,
        });
    }
  } catch (error) {
    errors.push({
      type: 'parse-error',
      objectHash: hash,
      objectType: type,
      message: `Failed to parse ${type} ${hash}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

/**
 * CLI handler for fsck command
 */
export function handleFsck(args: string[]): void {
  const options: FsckOptions = {
    dangling: true, // Show dangling objects by default
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--full') {
      options.full = true;
    } else if (arg === '--unreachable') {
      options.unreachable = true;
    } else if (arg === '--dangling') {
      options.dangling = true;
    } else if (arg === '--no-dangling') {
      options.dangling = false;
    } else if (arg === '--connectivity-only') {
      options.connectivityOnly = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--strict') {
      options.strict = true;
    }
  }

  try {
    const repo = Repository.find();

    console.log(colors.bold('Verifying object database...'));
    console.log();

    const result = fsck(repo, options);

    // Print errors
    if (result.errors.length > 0) {
      console.log(colors.red('Errors found:'));
      for (const error of result.errors) {
        console.log(`  ${colors.red('error')}: ${error.message}`);
      }
      console.log();
    }

    // Print warnings (dangling/unreachable)
    if (result.warnings.length > 0 && (options.dangling || options.unreachable)) {
      console.log(colors.yellow('Dangling objects:'));
      for (const warning of result.warnings) {
        console.log(`  ${colors.dim(warning.objectType)} ${warning.objectHash.slice(0, 12)}`);
      }
      console.log();
    }

    // Print stats
    console.log(colors.bold('Object database statistics:'));
    console.log(`  Commits: ${result.stats.commits}`);
    console.log(`  Trees:   ${result.stats.trees}`);
    console.log(`  Blobs:   ${result.stats.blobs}`);
    console.log(`  Tags:    ${result.stats.tags}`);
    console.log(`  Total:   ${result.stats.totalObjects}`);
    console.log();
    console.log(`  Reachable: ${result.stats.reachableObjects}`);
    console.log(`  Dangling:  ${result.stats.danglingObjects}`);
    console.log();

    // Final status
    if (result.valid) {
      console.log(colors.green('✓') + ' Object database is valid');
    } else {
      console.log(colors.red('✗') + ` Found ${result.errors.length} error(s)`);
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
