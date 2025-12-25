/**
 * Amend Command
 * Quick fix for the last commit - change message or add more changes
 * 
 * This is a QoL improvement over git commit --amend which is verbose and confusing
 */

import { Repository } from '../core/repository';
import { Commit, Tree } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

export interface AmendOptions {
  message?: string;      // New commit message
  noEdit?: boolean;      // Keep the same message
  addAll?: boolean;      // Stage all tracked files first
}

/**
 * Amend the last commit
 * - With -m: Change the commit message
 * - With staged changes: Add them to the last commit
 * - With -a: Stage all tracked changes and add them
 */
export function amend(options: AmendOptions = {}): string {
  const repo = Repository.find();
  
  // Get the last commit
  const headHash = repo.refs.resolve('HEAD');
  if (!headHash) {
    throw new TsgitError(
      'No commits to amend',
      ErrorCode.NO_COMMITS_YET,
      ['wit commit -m "Initial commit"    # Create your first commit']
    );
  }
  
  const lastCommit = repo.objects.readCommit(headHash);
  
  // Stage all tracked files if requested
  if (options.addAll) {
    const status = repo.status();
    for (const file of status.modified) {
      repo.add(file);
    }
  }
  
  // Check what we're amending
  const status = repo.status();
  const hasStaged = status.staged.length > 0;
  const hasNewMessage = !!options.message;
  
  if (!hasStaged && !hasNewMessage) {
    throw new TsgitError(
      'Nothing to amend - no staged changes and no new message provided',
      ErrorCode.NOTHING_TO_COMMIT,
      [
        'wit amend -m "New message"    # Change commit message',
        'wit add <file>                # Stage changes first',
        'wit amend -a                  # Stage and amend all tracked changes',
      ]
    );
  }
  
  // Determine the new message
  const newMessage = options.message || lastCommit.message;
  
  // Get parent(s) of the commit we're amending
  const parentHashes = lastCommit.parentHashes;
  
  // Build new tree from current index
  // If there are staged changes, they'll be included
  // If not, we just reuse the same tree but with new message
  let newTreeHash: string;
  
  if (hasStaged) {
    // Build tree from current index (which includes staged changes)
    newTreeHash = buildTree(repo);
  } else {
    // Reuse the same tree
    newTreeHash = lastCommit.treeHash;
  }
  
  // Create new commit with same author but updated committer
  const newCommit = new Commit(
    newTreeHash,
    parentHashes,
    lastCommit.author,  // Keep original author
    {
      name: process.env.WIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME || lastCommit.committer.name,
      email: process.env.WIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL || lastCommit.committer.email,
      timestamp: Math.floor(Date.now() / 1000),
      timezone: getTimezone(),
    },
    newMessage
  );
  
  const newHash = repo.objects.writeObject(newCommit);
  
  // Update branch to point to new commit
  const head = repo.refs.getHead();
  if (head.isSymbolic) {
    const branchName = head.target.replace('refs/heads/', '');
    repo.refs.updateBranch(branchName, newHash);
  } else {
    repo.refs.setHeadDetached(newHash);
  }
  
  // Record in journal
  const beforeState = {
    head: headHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  const afterState = {
    head: newHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  repo.journal.record(
    'amend',
    options.message ? ['-m', options.message] : [],
    `Amended commit ${headHash.slice(0, 8)} -> ${newHash.slice(0, 8)}`,
    beforeState,
    afterState,
    { commitHash: newHash }
  );
  
  return newHash;
}

/**
 * Build tree from index (simplified version)
 */
function buildTree(repo: Repository): string {
  // Use the same logic as commit
  const entries = repo.index.getEntries();
  
  if (entries.length === 0) {
    throw new TsgitError(
      'Nothing staged',
      ErrorCode.NOTHING_TO_COMMIT,
      ['wit add <file>    # Stage files first']
    );
  }
  
  // Build tree hierarchy
  const trees = new Map<string, Map<string, { isTree: boolean; mode: string; hash: string }>>();
  
  for (const entry of entries) {
    const parts = entry.path.split('/');
    const fileName = parts.pop()!;
    const dirPath = parts.join('/');
    
    // Ensure all parent directories exist in trees map
    let currentPath = '';
    for (const part of parts) {
      if (!trees.has(currentPath)) {
        trees.set(currentPath, new Map());
      }
      const parent = trees.get(currentPath)!;
      const nextPath = currentPath ? currentPath + '/' + part : part;
      if (!parent.has(part)) {
        parent.set(part, { isTree: true, mode: '40000', hash: '' });
      }
      currentPath = nextPath;
    }
    
    // Add file to its directory
    if (!trees.has(dirPath)) {
      trees.set(dirPath, new Map());
    }
    trees.get(dirPath)!.set(fileName, {
      isTree: false,
      mode: entry.mode,
      hash: entry.hash,
    });
  }
  
  // Build trees bottom-up
  const sortedPaths = Array.from(trees.keys()).sort((a, b) => b.length - a.length);
  const treeHashes = new Map<string, string>();
  
  for (const treePath of sortedPaths) {
    const treeEntries = trees.get(treePath)!;
    const finalEntries: Array<{ mode: string; name: string; hash: string }> = [];
    
    for (const [name, info] of treeEntries) {
      if (info.isTree) {
        const childPath = treePath ? treePath + '/' + name : name;
        const childHash = treeHashes.get(childPath)!;
        finalEntries.push({ mode: '40000', name, hash: childHash });
      } else {
        finalEntries.push({ mode: info.mode, name, hash: info.hash });
      }
    }
    
    // Sort entries (Git sorts directories and files together by name)
    finalEntries.sort((a, b) => a.name.localeCompare(b.name));
    
    const tree = new Tree(finalEntries);
    const hash = repo.objects.writeObject(tree);
    treeHashes.set(treePath, hash);
  }
  
  return treeHashes.get('')!;
}

function getTimezone(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return `${sign}${hours}${minutes}`;
}

/**
 * CLI handler for amend
 */
export function handleAmend(args: string[]): void {
  const options: AmendOptions = {};
  
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    if (arg === '-m' && i + 1 < args.length) {
      options.message = args[i + 1];
      i += 2;
    } else if (arg === '--message' && i + 1 < args.length) {
      options.message = args[i + 1];
      i += 2;
    } else if (arg === '--no-edit') {
      options.noEdit = true;
      i++;
    } else if (arg === '-a' || arg === '--all') {
      options.addAll = true;
      i++;
    } else {
      i++;
    }
  }
  
  try {
    const newHash = amend(options);
    console.log(colors.green('✓') + ` Amended commit: ${colors.yellow(newHash.slice(0, 8))}`);
    
    if (options.message) {
      console.log(colors.dim(`  New message: ${options.message.split('\n')[0]}`));
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
