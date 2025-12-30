/**
 * Commit command with simplified staging options
 * Supports direct commits without explicit staging
 */

import { Repository } from '../core/repository';
import { Journal, StateSnapshot } from '../core/journal';
import { TsgitError, Errors, ErrorCode } from '../core/errors';
import { Author } from '../core/types';
import { updateReflog } from './reflog';
import { HookManager } from '../core/hooks';
import { IssueManager } from '../core/issues';

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
  closes?: string[];           // Issue IDs to close (e.g., WIT-1, WIT-2)
  refs?: string[];             // Issue IDs to reference without closing
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
  closedIssues?: string[];    // Display IDs of closed issues
  referencedIssues?: string[]; // Display IDs of referenced issues
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
export async function commitWithOptions(
  repo: Repository,
  options: CommitOptions
): Promise<CommitResult> {
  const journal = new Journal(repo.gitDir);
  const hookManager = new HookManager(repo.gitDir, repo.workDir);

  // Validate message
  if (!options.message || options.message.trim() === '') {
    throw new TsgitError(
      'Commit message cannot be empty',
      ErrorCode.INVALID_ARGUMENT,
      [
        'wit commit -m "Your commit message"',
        'wit ai commit    # Let AI generate a commit message',
      ]
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
          `Cannot commit '${file}': file not found or not accessible`,
          ErrorCode.FILE_NOT_FOUND,
          [
            `Check the file exists: ls ${file}`,
            'wit status    # See tracked and untracked files',
            'wit add <file>    # Stage the file first if needed',
          ],
          { file, originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
      }
    }
  }

  // Check if there's anything to commit
  if (repo.index.size === 0 && !options.allowEmpty) {
    throw Errors.nothingToCommit();
  }

  // Run pre-commit hook (unless --no-verify)
  if (!options.noVerify) {
    const stagedFiles = repo.index.getEntries().map(e => e.path);
    const preCommitError = await hookManager.shouldAbort('pre-commit', {
      files: stagedFiles,
      branch: repo.refs.getCurrentBranch() || undefined,
    });
    if (preCommitError) {
      throw new TsgitError(
        'pre-commit hook failed',
        ErrorCode.HOOK_FAILED,
        [preCommitError, 'Use --no-verify to bypass hooks']
      );
    }
  }

  // Run commit-msg hook (unless --no-verify)
  const finalMessage = options.message;
  if (!options.noVerify) {
    const commitMsgResult = await hookManager.runHook('commit-msg', {
      commitMessage: options.message,
      branch: repo.refs.getCurrentBranch() || undefined,
    });
    if (!commitMsgResult.success) {
      const errorMsg = commitMsgResult.stderr || commitMsgResult.stdout || 'commit-msg hook rejected the commit';
      throw new TsgitError(
        'commit-msg hook failed',
        ErrorCode.HOOK_FAILED,
        [errorMsg.trim(), 'Use --no-verify to bypass hooks']
      );
    }
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
  const hash = repo.commit(finalMessage, author);
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
    [finalMessage.slice(0, 50)],
    `Committed: ${finalMessage.split('\n')[0].slice(0, 50)}`,
    beforeState,
    afterState,
    { commitHash: hash }
  );

  // Update reflog
  const messageFirstLineForReflog = finalMessage.split('\n')[0].slice(0, 50);
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

  // Run post-commit hook (fire and forget, errors logged but don't fail)
  if (!options.noVerify) {
    hookManager.runHook('post-commit', {
      commitHash: hash,
      branch: branch || undefined,
    }).catch((err) => {
      console.error(`post-commit hook error: ${err.message}`);
    });
  }

  const shortHash = hash.slice(0, 8);
  const messageFirstLine = finalMessage.split('\n')[0];
  let resultMessage: string;

  if (branch) {
    resultMessage = `[${branch} ${shortHash}] ${messageFirstLine}`;
  } else {
    resultMessage = `[detached HEAD ${shortHash}] ${messageFirstLine}`;
  }

  // Handle issue integration
  const closedIssues: string[] = [];
  const referencedIssues: string[] = [];

  try {
    const issueManager = new IssueManager(repo.gitDir);
    
    // Process --closes flags
    if (options.closes && options.closes.length > 0) {
      for (const issueId of options.closes) {
        const issue = issueManager.close(issueId, hash);
        if (issue) {
          closedIssues.push(issueManager.getDisplayId(issue));
        }
      }
    }

    // Process --refs flags  
    if (options.refs && options.refs.length > 0) {
      for (const issueId of options.refs) {
        const linked = issueManager.linkCommit(issueId, hash);
        if (linked) {
          const issue = issueManager.get(issueId);
          if (issue) {
            referencedIssues.push(issueManager.getDisplayId(issue));
          }
        }
      }
    }

    // Also process issue references in commit message automatically
    const { closed, referenced } = issueManager.processCommit(options.message, hash);
    for (const issue of closed) {
      const displayId = issueManager.getDisplayId(issue);
      if (!closedIssues.includes(displayId)) {
        closedIssues.push(displayId);
      }
    }
    for (const issue of referenced) {
      const displayId = issueManager.getDisplayId(issue);
      if (!referencedIssues.includes(displayId) && !closedIssues.includes(displayId)) {
        referencedIssues.push(displayId);
      }
    }
  } catch {
    // Issue manager might not be initialized, that's ok
  }

  return {
    success: true,
    hash,
    message: resultMessage,
    branch,
    filesCommitted: repo.index.size,
    isAmend: !!options.amend,
    closedIssues: closedIssues.length > 0 ? closedIssues : undefined,
    referencedIssues: referencedIssues.length > 0 ? referencedIssues : undefined,
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
export async function commit(message: string): Promise<void> {
  if (!message || message.trim() === '') {
    const error = new TsgitError(
      'Commit message cannot be empty',
      ErrorCode.INVALID_ARGUMENT,
      [
        'wit commit -m "Your commit message"',
        'wit ai commit    # Let AI generate a commit message',
      ]
    );
    console.error(error.format());
    process.exit(1);
  }

  try {
    const repo = Repository.find();
    const result = await commitWithOptions(repo, { message });
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
export async function handleCommit(args: string[]): Promise<void> {
  const repo = Repository.find();
  const options: CommitOptions = {
    message: '',
  };
  const files: string[] = [];
  const closes: string[] = [];
  const refs: string[] = [];

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
    } else if (arg === '--closes' || arg === '--close' || arg === '-c') {
      // Support comma-separated or multiple flags
      const issueArg = args[++i] || '';
      closes.push(...issueArg.split(',').map(s => s.trim()).filter(Boolean));
    } else if (arg === '--refs' || arg === '--ref') {
      const issueArg = args[++i] || '';
      refs.push(...issueArg.split(',').map(s => s.trim()).filter(Boolean));
    } else if (!arg.startsWith('-')) {
      files.push(arg);
    }
  }

  if (files.length > 0) {
    options.files = files;
  }

  if (closes.length > 0) {
    options.closes = closes;
  }

  if (refs.length > 0) {
    options.refs = refs;
  }

  if (!options.message) {
    throw new TsgitError(
      'Commit message is required',
      ErrorCode.INVALID_ARGUMENT,
      [
        'wit commit -m "Your message"    # Commit with a message',
        'wit ai commit                   # Let AI generate a commit message',
        'wit commit --help               # See all options',
      ]
    );
  }

  try {
    const result = await commitWithOptions(repo, options);
    console.log(result.message);
    
    // Show closed/referenced issues
    if (result.closedIssues && result.closedIssues.length > 0) {
      console.log(`\x1b[32m✓\x1b[0m Closed: ${result.closedIssues.join(', ')}`);
    }
    if (result.referencedIssues && result.referencedIssues.length > 0) {
      console.log(`\x1b[36m→\x1b[0m Referenced: ${result.referencedIssues.join(', ')}`);
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
