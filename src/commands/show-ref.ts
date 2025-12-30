/**
 * Show-Ref Command
 * List references in a local repository
 * 
 * Usage:
 * - wit show-ref                    # List all refs with hashes
 * - wit show-ref --heads            # Only branches
 * - wit show-ref --tags             # Only tags
 * - wit show-ref <ref>              # Check if ref exists (exit 0/1)
 * - wit show-ref --verify <ref>     # Verify ref exists
 * - wit show-ref --hash             # Show only hashes
 * - wit show-ref -q                 # Quiet, useful for scripting
 * 
 * This is a plumbing command for scripting and advanced usage.
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { TsgitError } from '../core/errors';
import { exists, readDir, readFileText, isDirectory } from '../utils/fs';
import { shortHash } from '../utils/hash';

export interface ShowRefOptions {
  heads?: boolean;
  tags?: boolean;
  hash?: boolean | number;
  verify?: boolean;
  quiet?: boolean;
  abbrev?: number;
}

export interface RefEntry {
  hash: string;
  refname: string;
}

/**
 * List all refs matching criteria
 */
export function showRef(
  repo: Repository,
  patterns: string[] = [],
  options: ShowRefOptions = {}
): RefEntry[] {
  const refs: RefEntry[] = [];
  const refsDir = path.join(repo.gitDir, 'refs');

  // Determine which directories to search
  const searchDirs: { dir: string; prefix: string }[] = [];

  if (options.heads) {
    searchDirs.push({
      dir: path.join(refsDir, 'heads'),
      prefix: 'refs/heads',
    });
  }

  if (options.tags) {
    searchDirs.push({
      dir: path.join(refsDir, 'tags'),
      prefix: 'refs/tags',
    });
  }

  // If neither --heads nor --tags, search all refs
  if (!options.heads && !options.tags) {
    searchDirs.push({
      dir: refsDir,
      prefix: 'refs',
    });
  }

  // Collect refs
  for (const { dir, prefix } of searchDirs) {
    if (exists(dir)) {
      collectRefs(dir, prefix, refs);
    }
  }

  // Filter by patterns if provided
  if (patterns.length > 0) {
    return refs.filter(ref => {
      return patterns.some(pattern => {
        // Exact match
        if (ref.refname === pattern) return true;
        // Pattern as prefix
        if (ref.refname.startsWith(pattern)) return true;
        // Short name match
        const shortName = getShortRefName(ref.refname);
        if (shortName === pattern) return true;
        // Match without refs/ prefix
        if (ref.refname === `refs/heads/${pattern}`) return true;
        if (ref.refname === `refs/tags/${pattern}`) return true;
        return false;
      });
    });
  }

  // Sort by refname
  refs.sort((a, b) => a.refname.localeCompare(b.refname));

  return refs;
}

/**
 * Collect refs recursively from a directory
 */
function collectRefs(dir: string, prefix: string, refs: RefEntry[]): void {
  if (!exists(dir)) return;

  const entries = readDir(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const refName = prefix + '/' + entry;

    if (isDirectory(fullPath)) {
      collectRefs(fullPath, refName, refs);
    } else {
      const content = readFileText(fullPath).trim();
      // Skip symbolic refs
      if (!content.startsWith('ref: ')) {
        refs.push({
          hash: content,
          refname: refName,
        });
      }
    }
  }
}

/**
 * Verify that a ref exists
 */
export function verifyRef(
  repo: Repository,
  refName: string,
  _options: ShowRefOptions = {}
): RefEntry | null {
  // Try to resolve the ref
  const hash = repo.refs.resolve(refName);
  if (!hash) {
    return null;
  }

  // Determine full ref name
  let fullRefName = refName;
  if (!refName.startsWith('refs/')) {
    // Check branches first
    if (repo.refs.branchExists(refName)) {
      fullRefName = `refs/heads/${refName}`;
    } else if (repo.refs.tagExists(refName)) {
      fullRefName = `refs/tags/${refName}`;
    } else if (refName === 'HEAD') {
      const head = repo.refs.getHead();
      fullRefName = head.isSymbolic ? head.target : 'HEAD';
    }
  }

  return {
    hash,
    refname: fullRefName,
  };
}

/**
 * Get short ref name
 */
function getShortRefName(refname: string): string {
  if (refname.startsWith('refs/heads/')) {
    return refname.slice(11);
  }
  if (refname.startsWith('refs/tags/')) {
    return refname.slice(10);
  }
  if (refname.startsWith('refs/remotes/')) {
    return refname.slice(13);
  }
  return refname;
}

/**
 * CLI handler for show-ref command
 */
export function handleShowRef(args: string[]): void {
  const options: ShowRefOptions = {};
  const patterns: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--heads' || arg === '--head') {
      options.heads = true;
    } else if (arg === '--tags') {
      options.tags = true;
    } else if (arg === '--hash') {
      options.hash = true;
    } else if (arg.startsWith('--hash=')) {
      options.hash = parseInt(arg.slice(7), 10);
    } else if (arg === '--verify') {
      options.verify = true;
    } else if (arg === '-q' || arg === '--quiet') {
      options.quiet = true;
    } else if (arg === '-s' || arg === '--short') {
      // Alias for --hash=8
      options.hash = 8;
    } else if (arg.startsWith('--abbrev=')) {
      options.abbrev = parseInt(arg.slice(9), 10);
    } else if (arg === '--abbrev') {
      i++;
      options.abbrev = parseInt(args[i] || '8', 10);
    } else if (!arg.startsWith('-')) {
      patterns.push(arg);
    }
  }

  try {
    const repo = Repository.find();

    if (options.verify) {
      // Verify mode: check specific refs
      if (patterns.length === 0) {
        if (!options.quiet) {
          console.error('fatal: --verify requires at least one ref');
        }
        process.exit(1);
      }

      let allExist = true;
      for (const pattern of patterns) {
        const ref = verifyRef(repo, pattern, options);
        if (ref) {
          if (!options.quiet) {
            printRef(ref, options);
          }
        } else {
          allExist = false;
          if (!options.quiet) {
            console.error(`fatal: '${pattern}' - not a valid ref`);
          }
        }
      }

      if (!allExist) {
        process.exit(1);
      }
      return;
    }

    // List mode
    const refs = showRef(repo, patterns, options);

    if (refs.length === 0) {
      // If patterns were provided and no matches, exit 1
      if (patterns.length > 0) {
        process.exit(1);
      }
      return;
    }

    for (const ref of refs) {
      printRef(ref, options);
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

/**
 * Print a ref entry
 */
function printRef(ref: RefEntry, options: ShowRefOptions): void {
  let hash = ref.hash;

  // Apply abbreviation
  if (options.hash === true) {
    console.log(hash);
    return;
  }

  if (typeof options.hash === 'number') {
    hash = shortHash(ref.hash, options.hash);
    console.log(hash);
    return;
  }

  if (options.abbrev) {
    hash = shortHash(ref.hash, options.abbrev);
  }

  console.log(`${hash} ${ref.refname}`);
}
