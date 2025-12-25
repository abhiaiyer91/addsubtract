/**
 * For-Each-Ref Command
 * Iterate over refs and output information about each one
 * 
 * Usage:
 * - tsgit for-each-ref                           # List all refs
 * - tsgit for-each-ref refs/heads                # List branches
 * - tsgit for-each-ref refs/tags                 # List tags
 * - tsgit for-each-ref --format='%(refname)'     # Custom format
 * 
 * Format placeholders:
 * - %(objectname)     - Full SHA hash
 * - %(objectname:short) - Short SHA hash
 * - %(refname)        - Full ref name (refs/heads/main)
 * - %(refname:short)  - Short ref name (main)
 * - %(objecttype)     - Object type (commit, tag, etc.)
 * - %(HEAD)           - * if HEAD points to this ref
 * 
 * This is a plumbing command for scripting and advanced usage.
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, readDir, readFileText, isDirectory } from '../utils/fs';
import { shortHash } from '../utils/hash';

export interface ForEachRefOptions {
  format?: string;
  sort?: string;
  count?: number;
  pointsAt?: string;
}

export interface RefInfo {
  refname: string;
  objectname: string;
  objecttype: string;
  isHead: boolean;
}

/**
 * Get all refs matching a pattern
 */
export function forEachRef(
  repo: Repository,
  patterns: string[] = [],
  options: ForEachRefOptions = {}
): RefInfo[] {
  const refs: RefInfo[] = [];
  const refsDir = path.join(repo.gitDir, 'refs');

  // Get HEAD info for marking current branch
  const head = repo.refs.getHead();
  const headTarget = head.isSymbolic ? head.target : null;

  // Collect all refs
  if (patterns.length === 0) {
    // List all refs
    collectRefs(repo, refsDir, 'refs', refs, headTarget);
  } else {
    // List refs matching patterns
    for (const pattern of patterns) {
      const patternPath = path.join(repo.gitDir, pattern);
      if (exists(patternPath)) {
        if (isDirectory(patternPath)) {
          collectRefs(repo, patternPath, pattern, refs, headTarget);
        } else {
          // Single ref
          const content = readFileText(patternPath).trim();
          addRefInfo(repo, pattern, content, refs, headTarget);
        }
      }
    }
  }

  // Filter by --points-at if specified
  if (options.pointsAt) {
    const targetHash = repo.refs.resolve(options.pointsAt);
    if (targetHash) {
      return refs.filter(ref => ref.objectname === targetHash);
    }
  }

  // Sort refs
  if (options.sort) {
    sortRefs(refs, options.sort);
  } else {
    // Default: sort by refname
    refs.sort((a, b) => a.refname.localeCompare(b.refname));
  }

  // Limit count
  if (options.count && options.count > 0) {
    return refs.slice(0, options.count);
  }

  return refs;
}

/**
 * Collect refs recursively from a directory
 */
function collectRefs(
  repo: Repository,
  dir: string,
  prefix: string,
  refs: RefInfo[],
  headTarget: string | null
): void {
  if (!exists(dir)) return;

  const entries = readDir(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const refName = prefix + '/' + entry;

    if (isDirectory(fullPath)) {
      collectRefs(repo, fullPath, refName, refs, headTarget);
    } else {
      const content = readFileText(fullPath).trim();
      addRefInfo(repo, refName, content, refs, headTarget);
    }
  }
}

/**
 * Add ref info to the list
 */
function addRefInfo(
  repo: Repository,
  refName: string,
  hash: string,
  refs: RefInfo[],
  headTarget: string | null
): void {
  // Skip if it's a symbolic ref (contains "ref: ")
  if (hash.startsWith('ref: ')) {
    return;
  }

  let objecttype = 'commit';
  try {
    const { type } = repo.objects.readRawObject(hash);
    objecttype = type;
  } catch {
    // Object might not exist (partial clone, etc.)
  }

  refs.push({
    refname: refName,
    objectname: hash,
    objecttype,
    isHead: headTarget === refName,
  });
}

/**
 * Sort refs by a field
 */
function sortRefs(refs: RefInfo[], sortKey: string): void {
  const descending = sortKey.startsWith('-');
  const key = descending ? sortKey.slice(1) : sortKey;

  refs.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'refname':
        cmp = a.refname.localeCompare(b.refname);
        break;
      case 'objectname':
        cmp = a.objectname.localeCompare(b.objectname);
        break;
      case 'objecttype':
        cmp = a.objecttype.localeCompare(b.objecttype);
        break;
      default:
        cmp = a.refname.localeCompare(b.refname);
    }
    return descending ? -cmp : cmp;
  });
}

/**
 * Format ref output according to format string
 */
export function formatRef(ref: RefInfo, format: string): string {
  let result = format;

  // Replace format placeholders
  result = result.replace(/\%\(objectname\)/g, ref.objectname);
  result = result.replace(/\%\(objectname:short\)/g, shortHash(ref.objectname, 8));
  result = result.replace(/\%\(refname\)/g, ref.refname);
  result = result.replace(/\%\(refname:short\)/g, getShortRefName(ref.refname));
  result = result.replace(/\%\(objecttype\)/g, ref.objecttype);
  result = result.replace(/\%\(HEAD\)/g, ref.isHead ? '*' : ' ');

  return result;
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
 * CLI handler for for-each-ref command
 */
export function handleForEachRef(args: string[]): void {
  const options: ForEachRefOptions = {};
  const patterns: string[] = [];

  // Default format similar to git
  let format = '%(objectname) %(objecttype)\t%(refname)';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--format=')) {
      format = arg.slice(9);
      // Remove quotes if present
      if ((format.startsWith("'") && format.endsWith("'")) ||
          (format.startsWith('"') && format.endsWith('"'))) {
        format = format.slice(1, -1);
      }
    } else if (arg === '--format') {
      i++;
      format = args[i] || format;
    } else if (arg.startsWith('--sort=')) {
      options.sort = arg.slice(7);
    } else if (arg === '--sort') {
      i++;
      options.sort = args[i];
    } else if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.slice(8), 10);
    } else if (arg === '--count') {
      i++;
      options.count = parseInt(args[i], 10);
    } else if (arg.startsWith('--points-at=')) {
      options.pointsAt = arg.slice(12);
    } else if (arg === '--points-at') {
      i++;
      options.pointsAt = args[i];
    } else if (!arg.startsWith('-')) {
      patterns.push(arg);
    }
  }

  try {
    const repo = Repository.find();
    const refs = forEachRef(repo, patterns, options);

    for (const ref of refs) {
      console.log(formatRef(ref, format));
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
