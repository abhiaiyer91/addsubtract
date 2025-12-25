/**
 * Rev-Parse Command
 * Parse revision (or other objects) and output SHA-256/SHA-1 hashes
 * 
 * Usage:
 * - tsgit rev-parse HEAD             # Output: commit hash
 * - tsgit rev-parse HEAD~3           # 3 commits back
 * - tsgit rev-parse --short HEAD     # Short hash
 * - tsgit rev-parse --verify <ref>   # Verify ref exists (silent if not)
 * - tsgit rev-parse --git-dir        # Output: .tsgit
 * - tsgit rev-parse --show-toplevel  # Output: repo root
 * 
 * This is a plumbing command for scripting and advanced usage.
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { parseRevision } from './reset';
import { shortHash, getDigestLength } from '../utils/hash';

export interface RevParseOptions {
  short?: boolean | number;
  verify?: boolean;
  gitDir?: boolean;
  showToplevel?: boolean;
  abbrevRef?: boolean;
  symbolic?: boolean;
  symbolicFullName?: boolean;
  quiet?: boolean;
}

/**
 * Parse a revision and return its full hash
 */
export function revParse(
  repo: Repository,
  revSpec: string,
  options: RevParseOptions = {}
): string | null {
  try {
    // Handle special queries first
    if (options.gitDir) {
      return repo.gitDir;
    }

    if (options.showToplevel) {
      return repo.workDir;
    }

    // Handle symbolic ref output
    if (options.symbolicFullName || options.symbolic) {
      const head = repo.refs.getHead();
      if (head.isSymbolic) {
        return options.symbolicFullName ? head.target : head.target.replace('refs/heads/', '');
      }
      // For detached HEAD, return the hash
      return head.target;
    }

    if (options.abbrevRef) {
      // Return the abbreviated ref name
      if (revSpec === 'HEAD') {
        const branch = repo.refs.getCurrentBranch();
        return branch || 'HEAD';
      }
      // For branches, just return the short name
      if (revSpec.startsWith('refs/heads/')) {
        return revSpec.replace('refs/heads/', '');
      }
      return revSpec;
    }

    // Parse the revision to get a hash
    const hash = parseRevision(repo, revSpec);

    if (options.verify) {
      // Verify that the object exists
      if (!repo.objects.hasObject(hash)) {
        if (!options.quiet) {
          console.error(`fatal: Needed a single revision`);
        }
        return null;
      }
    }

    // Return short or full hash
    if (options.short) {
      const length = typeof options.short === 'number' ? options.short : 8;
      return shortHash(hash, length);
    }

    return hash;
  } catch (error) {
    if (!options.quiet) {
      throw error;
    }
    return null;
  }
}

/**
 * CLI handler for rev-parse command
 */
export function handleRevParse(args: string[]): void {
  let repo: Repository | null = null;

  const options: RevParseOptions = {};
  const refs: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--short') {
      // Check if next arg is a number
      if (i + 1 < args.length && /^\d+$/.test(args[i + 1])) {
        options.short = parseInt(args[i + 1], 10);
        i++;
      } else {
        options.short = true;
      }
    } else if (arg.startsWith('--short=')) {
      options.short = parseInt(arg.slice(8), 10);
    } else if (arg === '--verify') {
      options.verify = true;
    } else if (arg === '-q' || arg === '--quiet') {
      options.quiet = true;
    } else if (arg === '--git-dir') {
      options.gitDir = true;
    } else if (arg === '--show-toplevel') {
      options.showToplevel = true;
    } else if (arg === '--abbrev-ref') {
      options.abbrevRef = true;
    } else if (arg === '--symbolic') {
      options.symbolic = true;
    } else if (arg === '--symbolic-full-name') {
      options.symbolicFullName = true;
    } else if (!arg.startsWith('-')) {
      refs.push(arg);
    }
  }

  try {
    // For --git-dir and --show-toplevel, we need a repo
    if (options.gitDir || options.showToplevel) {
      repo = Repository.find();
      const result = revParse(repo, '', options);
      if (result) {
        console.log(result);
      }
      return;
    }

    // Default to HEAD if no refs specified
    if (refs.length === 0) {
      refs.push('HEAD');
    }

    repo = Repository.find();

    for (const ref of refs) {
      const result = revParse(repo, ref, options);
      if (result !== null) {
        console.log(result);
      } else if (options.verify && !options.quiet) {
        process.exit(1);
      }
    }
  } catch (error) {
    if (options.quiet) {
      process.exit(1);
    }
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(`fatal: ${error.message}`);
    }
    process.exit(1);
  }
}
