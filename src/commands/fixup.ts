/**
 * Fixup Command
 * Create a commit that is marked to be squashed into a previous commit
 * 
 * This is a QoL improvement - easier than git commit --fixup
 * Works with wit's auto-squash during rebase
 */

import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { colors } from '../utils/colors';

export interface FixupOptions {
  targetCommit?: string;   // Commit to fix up (hash or HEAD~n)
  all?: boolean;           // Stage all tracked files first
  amend?: boolean;         // Use amend style (replace message)
}

/**
 * Create a fixup commit
 */
export function fixup(options: FixupOptions = {}): string {
  const repo = Repository.find();
  
  // Stage all if requested
  if (options.all) {
    const status = repo.status();
    for (const file of status.modified) {
      repo.add(file);
    }
  }
  
  // Check we have staged changes
  const status = repo.status();
  if (status.staged.length === 0) {
    throw new TsgitError(
      'Nothing staged to commit',
      ErrorCode.NOTHING_TO_COMMIT,
      [
        'wit add <file>     # Stage files first',
        'wit fixup -a HEAD  # Stage all and fixup',
      ]
    );
  }
  
  // Find the target commit
  let targetHash: string;
  let targetMessage: string;
  
  if (options.targetCommit) {
    const resolved = resolveCommitRef(repo, options.targetCommit);
    if (!resolved) {
      throw new TsgitError(
        `Could not resolve commit: ${options.targetCommit}`,
        ErrorCode.REF_NOT_FOUND,
        ['Use a commit hash or relative reference like HEAD~1']
      );
    }
    targetHash = resolved.hash;
    targetMessage = resolved.message;
  } else {
    // Default to HEAD
    const headHash = repo.refs.resolve('HEAD');
    if (!headHash) {
      throw new TsgitError(
        'No commits yet',
        ErrorCode.NO_COMMITS_YET,
        ['Create an initial commit first']
      );
    }
    const commit = repo.objects.readCommit(headHash);
    targetHash = headHash;
    targetMessage = commit.message.split('\n')[0];
  }
  
  // Create the fixup commit message
  const prefix = options.amend ? 'amend!' : 'fixup!';
  const message = `${prefix} ${targetMessage}`;
  
  // Create the commit
  const hash = repo.commit(message);
  
  // Record in journal
  repo.journal.record(
    'fixup',
    [targetHash.slice(0, 8)],
    `Created fixup commit for ${targetHash.slice(0, 8)}`,
    {
      head: repo.refs.resolve('HEAD') || '',
      branch: repo.refs.getCurrentBranch(),
      indexHash: '',
    },
    {
      head: hash,
      branch: repo.refs.getCurrentBranch(),
      indexHash: '',
    },
    {
      commitHash: hash,
      affectedFiles: status.staged,
    }
  );
  
  return hash;
}

/**
 * Resolve a commit reference (hash or relative like HEAD~2)
 */
function resolveCommitRef(repo: Repository, ref: string): { hash: string; message: string } | null {
  // Check if it's a relative reference like HEAD~n
  const relMatch = ref.match(/^(HEAD|[a-f0-9]+)~(\d+)$/i);
  
  if (relMatch) {
    const baseRef = relMatch[1];
    const steps = parseInt(relMatch[2], 10);
    
    let hash = baseRef === 'HEAD' ? repo.refs.resolve('HEAD') : repo.refs.resolve(baseRef);
    if (!hash) return null;
    
    for (let i = 0; i < steps; i++) {
      try {
        const commit = repo.objects.readCommit(hash);
        if (commit.parentHashes.length === 0) {
          return null;  // Can't go further back
        }
        hash = commit.parentHashes[0];
      } catch {
        return null;
      }
    }
    
    try {
      const commit = repo.objects.readCommit(hash);
      return {
        hash,
        message: commit.message.split('\n')[0],
      };
    } catch {
      return null;
    }
  }
  
  // Try as direct ref
  const hash = repo.refs.resolve(ref);
  if (!hash) return null;
  
  try {
    const commit = repo.objects.readCommit(hash);
    return {
      hash,
      message: commit.message.split('\n')[0],
    };
  } catch {
    return null;
  }
}

/**
 * Show recent commits for selection
 */
export function showRecentCommits(limit: number = 10): void {
  const repo = Repository.find();
  
  try {
    const commits = repo.log('HEAD', limit);
    
    console.log(colors.bold('Recent commits:'));
    console.log();
    
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const hash = commit.hash();
      const message = commit.message.split('\n')[0];
      const ref = i === 0 ? 'HEAD' : `HEAD~${i}`;
      
      console.log(
        colors.yellow(hash.slice(0, 8)) + ' ' +
        colors.dim(`(${ref})`) + ' ' +
        message.slice(0, 60)
      );
    }
    
    console.log();
    console.log(colors.dim('Use: wit fixup HEAD~n'));
  } catch {
    console.log(colors.dim('No commits yet'));
  }
}

/**
 * CLI handler for fixup
 */
export function handleFixup(args: string[]): void {
  const options: FixupOptions = {};
  let showList = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-a' || arg === '--all') {
      options.all = true;
    } else if (arg === '--amend') {
      options.amend = true;
    } else if (arg === '-l' || arg === '--list') {
      showList = true;
    } else if (!arg.startsWith('-')) {
      options.targetCommit = arg;
    }
  }
  
  if (showList) {
    showRecentCommits();
    return;
  }
  
  try {
    const hash = fixup(options);
    
    const prefix = options.amend ? 'amend!' : 'fixup!';
    console.log(colors.green('✓') + ` Created ${prefix} commit: ${colors.yellow(hash.slice(0, 8))}`);
    console.log(colors.dim('  This commit will be squashed during rebase'));
    console.log(colors.dim('  Use "wit undo" to revert if needed'));
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
