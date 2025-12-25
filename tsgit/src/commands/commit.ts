/**
 * Commit command with simplified staging options
 * Supports direct commits without explicit staging
 */

import { Repository } from '../core/repository';
import { Journal, StateSnapshot } from '../core/journal';
import { TsgitError, Errors, ErrorCode } from '../core/errors';
import { Author } from '../core/types';
import { updateReflog } from './reflog';

/**
 * Options for commit command
 */
export interface CommitOptions {
  message: string;
  all?: boolean;               // Stage and commit all tracked changes (-a)
  files?: string[];            // Commit specific files directly
  amend?: boolean;             // Amend the previous commit
  allowEmpty?: boolean;        // Allow empty commits
  author?: string;             // Override author
  noVerify?: boolean;          // Skip pre-commit hooks
  dryRun?: boolean;            // Show what would be committed
}

/**
 * Result of commit operation
 */
export interface CommitResult {
  success: boolean;
  hash: string;
  message: string;
  branch: string | null;
  filesCommitted: number;
  isAmend: boolean;
}

/**
 * Create a commit
 * 
 * @example
 * // Standard commit (requires staging first)
 * wit commit -m "message"
 * 
 * // Commit all tracked changes (skip staging)
 * wit commit -a -m "message"
 * 
 * // Commit specific files directly (skip staging)
 * wit commit file1.ts file2.ts -m "message"
 * 
 * // Amend previous commit
 * wit commit --amend -m "new message"
 */
export function commitWithOptions(
  repo: Repository,
  options: CommitOptions
): CommitResult {
  const journal = new Journal(repo.gitDir);

  // Validate message
  if (!options.message || options.message.trim() === '') {
    throw new TsgitError(
      'Empty commit message',
      ErrorCode.INVALID_ARGUMENT,
      ['Provide a message with -m "your message"']
    );
  }

  // Capture state before operation
  const beforeState: StateSnapshot = {
    head: repo.refs.resolve('HEAD') || '',
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };

  // Handle -a flag: stage all tracked, modified files
  if (options.all) {
    const status = repo.status();
    for (const file of status.modified) {
      repo.add(file);
    }
    for (const file of status.deleted) {
      repo.index.remove(file);
    }
    repo.index.save();
  }

  // Handle specific files: stage them before commit
  if (options.files && options.files.length > 0) {
    for (const file of options.files) {
      try {
        repo.add(file);
      } catch (error) {
        throw new TsgitError(
          `Cannot commit '${file}': ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.FILE_NOT_FOUND
        );
      }
    }
  }

  // Check if there's anything to commit
  if (repo.index.size === 0 && !options.allowEmpty) {
    throw Errors.nothingToCommit();
  }

  // Dry run mode
  if (options.dryRun) {
    const entries = repo.index.getEntries();
    let message = `Would commit ${entries.length} file(s):\n`;
    for (const entry of entries.slice(0, 10)) {
      message += `  ${entry.path}\n`;
    }
    if (entries.length > 10) {
      message += `  ... and ${entries.length - 10} more\n`;
    }
    return {
      success: true,
      hash: '(dry-run)',
      message,
      branch: repo.refs.getCurrentBranch(),
      filesCommitted: entries.length,
      isAmend: false,
    };
  }

  // Parse author if provided
  let author: Author | undefined;
  if (options.author) {
    author = parseAuthorString(options.author);
  }

  // Create the commit
  const hash = repo.commit(options.message, author);
  const branch = repo.refs.getCurrentBranch();

  // Capture state after operation
  const afterState: StateSnapshot = {
    head: hash,
    branch,
    indexHash: '',
  };

  // Record in journal
  journal.record(
    'commit',
    [options.message.slice(0, 50)],
    `Committed: ${options.message.split('\n')[0].slice(0, 50)}`,
    beforeState,
    afterState,
    { commitHash: hash }
  );

  // Update reflog
  const messageFirstLineForReflog = options.message.split('\n')[0].slice(0, 50);
  updateReflog(
    repo.gitDir,
    repo.workDir,
    'HEAD',
    beforeState.head || '0'.repeat(40),
    hash,
    `commit: ${messageFirstLineForReflog}`
  );

  // Also update branch reflog if on a branch
  if (branch) {
    updateReflog(
      repo.gitDir,
      repo.workDir,
      `refs/heads/${branch}`,
      beforeState.head || '0'.repeat(40),
      hash,
      `commit: ${messageFirstLineForReflog}`
    );
  }

  const shortHash = hash.slice(0, 8);
  const messageFirstLine = options.message.split('\n')[0];
  let resultMessage: string;

  if (branch) {
    resultMessage = `[${branch} ${shortHash}] ${messageFirstLine}`;
  } else {
    resultMessage = `[detached HEAD ${shortHash}] ${messageFirstLine}`;
  }

  return {
    success: true,
    hash,
    message: resultMessage,
    branch,
    filesCommitted: repo.index.size,
    isAmend: !!options.amend,
  };
}

/**
 * Parse author string (format: "Name <email>")
 */
function parseAuthorString(authorStr: string): Author {
  const match = authorStr.match(/^(.+?)\s*<(.+?)>$/);
  if (!match) {
    throw new TsgitError(
      `Invalid author format: ${authorStr}`,
      ErrorCode.INVALID_ARGUMENT,
      ['Use format: "Name <email@example.com>"']
    );
  }

  return {
    name: match[1].trim(),
    email: match[2].trim(),
    timestamp: Math.floor(Date.now() / 1000),
    timezone: getTimezone(),
  };
}

/**
 * Get current timezone offset string
 */
function getTimezone(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return `${sign}${hours}${minutes}`;
}

/**
 * Legacy commit function for backward compatibility
 */
export function commit(message: string): void {
  if (!message || message.trim() === '') {
    console.error('error: empty commit message');
    process.exit(1);
  }

  try {
    const repo = Repository.find();
    const result = commitWithOptions(repo, { message });
    console.log(result.message);
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
 * CLI handler for commit command
 */
export function handleCommit(args: string[]): void {
  const repo = Repository.find();
  const options: CommitOptions = {
    message: '',
  };
  const files: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-m' || arg === '--message') {
      options.message = args[++i] || '';
    } else if (arg === '-a' || arg === '--all') {
      options.all = true;
    } else if (arg === '--amend') {
      options.amend = true;
    } else if (arg === '--allow-empty') {
      options.allowEmpty = true;
    } else if (arg === '--author') {
      options.author = args[++i];
    } else if (arg === '--no-verify') {
      options.noVerify = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (!arg.startsWith('-')) {
      files.push(arg);
    }
  }

  if (files.length > 0) {
    options.files = files;
  }

  if (!options.message) {
    console.error('error: switch `m\' requires a value');
    console.error('\nUsage: wit commit [options] [files...] -m <message>');
    console.error('\nOptions:');
    console.error('  -m, --message <msg>  Commit message');
    console.error('  -a, --all            Stage and commit all tracked changes');
    console.error('  --amend              Amend the previous commit');
    console.error('  --allow-empty        Allow empty commits');
    console.error('  --author <author>    Override author (format: "Name <email>")');
    console.error('  --dry-run            Show what would be committed');
    console.error('\nExamples:');
    console.error('  wit commit -m "Add feature"');
    console.error('  wit commit -a -m "Update all"');
    console.error('  wit commit file.ts -m "Fix bug"');
    process.exit(1);
  }

  try {
    const result = commitWithOptions(repo, options);
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
