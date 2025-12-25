/**
 * Reset Command
 * Reset current HEAD to a specified state
 * 
 * Usage:
 * - tsgit reset --soft HEAD~1    # Undo commit, keep changes staged
 * - tsgit reset --mixed HEAD~1   # Undo commit, keep changes unstaged (default)
 * - tsgit reset --hard HEAD~1    # Undo commit, discard all changes
 * - tsgit reset <file>           # Unstage a file (same as restore --staged)
 * 
 * This provides the full power of git reset with clearer naming.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, walkDir } from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export type ResetMode = 'soft' | 'mixed' | 'hard';

export interface ResetOptions {
  mode: ResetMode;
}

/**
 * Parse revision specification like HEAD~1, HEAD^, branch~3, etc.
 */
export function parseRevision(repo: Repository, revSpec: string): string {
  let ref = revSpec;
  let offset = 0;

  // Handle ~N notation (e.g., HEAD~3)
  const tildeMatch = revSpec.match(/^(.+)~(\d+)$/);
  if (tildeMatch) {
    ref = tildeMatch[1];
    offset = parseInt(tildeMatch[2], 10);
  }

  // Handle ^ notation (e.g., HEAD^, HEAD^^)
  const caretMatch = revSpec.match(/^(.+?)(\^+)$/);
  if (caretMatch) {
    ref = caretMatch[1];
    offset = caretMatch[2].length;
  }

  // Handle ^N notation (e.g., HEAD^2 for second parent)
  const caretNumMatch = revSpec.match(/^(.+)\^(\d+)$/);
  if (caretNumMatch) {
    ref = caretNumMatch[1];
    const parentIndex = parseInt(caretNumMatch[2], 10);
    // For now, just treat ^N as going back N commits
    // A proper implementation would handle merge parent selection
    offset = parentIndex;
  }

  // Resolve the base reference
  let hash = repo.refs.resolve(ref);
  if (!hash) {
    throw new TsgitError(
      `Cannot resolve '${ref}'`,
      ErrorCode.REFERENCE_NOT_FOUND,
      ['Check that the commit or reference exists']
    );
  }

  // Walk back through history
  for (let i = 0; i < offset; i++) {
    const commit = repo.objects.readCommit(hash);
    
    if (commit.parentHashes.length === 0) {
      throw new TsgitError(
        `Cannot go back ${offset} commits from '${ref}' - only ${i} parents exist`,
        ErrorCode.OPERATION_FAILED,
        [`tsgit reset ${ref}~${i}    # Reset to the earliest commit`]
      );
    }

    hash = commit.parentHashes[0];
  }

  return hash;
}

/**
 * Reset HEAD to a specific commit
 */
export function reset(
  repo: Repository, 
  targetRef: string, 
  options: ResetOptions
): { 
  previousHash: string; 
  newHash: string;
  mode: ResetMode;
} {
  // Get current HEAD
  const previousHash = repo.refs.resolve('HEAD');
  if (!previousHash) {
    throw new TsgitError(
      'No commits to reset from',
      ErrorCode.NO_COMMITS_YET,
      ['The repository has no commits yet']
    );
  }

  // Parse and resolve target
  const newHash = parseRevision(repo, targetRef);

  // Record before state
  const beforeState = {
    head: previousHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };

  // Update HEAD/branch reference
  const head = repo.refs.getHead();
  if (head.isSymbolic) {
    const branchName = head.target.replace('refs/heads/', '');
    repo.refs.updateBranch(branchName, newHash);
  } else {
    repo.refs.setHeadDetached(newHash);
  }

  // Handle different reset modes
  switch (options.mode) {
    case 'soft':
      // Only move HEAD, keep index and working directory
      break;

    case 'mixed':
      // Move HEAD and reset index, keep working directory
      resetIndex(repo, newHash);
      break;

    case 'hard':
      // Move HEAD, reset index, and reset working directory
      resetIndex(repo, newHash);
      resetWorkingDirectory(repo, newHash);
      break;
  }

  // Record in journal
  const afterState = {
    head: newHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };

  repo.journal.record(
    'reset',
    [`--${options.mode}`, targetRef],
    `Reset ${options.mode}: ${previousHash.slice(0, 8)} -> ${newHash.slice(0, 8)}`,
    beforeState,
    afterState
  );

  return { previousHash, newHash, mode: options.mode };
}

/**
 * Reset index to match a commit's tree
 */
function resetIndex(repo: Repository, commitHash: string): void {
  const commit = repo.objects.readCommit(commitHash);
  const treeFiles = new Map<string, { hash: string; mode: string }>();
  flattenTree(repo, commit.treeHash, '', treeFiles);

  // Clear index
  repo.index.clear();

  // Add files from tree to index
  for (const [filePath, { hash }] of treeFiles) {
    repo.index.add(filePath, hash, repo.workDir);
  }

  repo.index.save();
}

/**
 * Reset working directory to match a commit's tree
 */
function resetWorkingDirectory(repo: Repository, commitHash: string): void {
  const commit = repo.objects.readCommit(commitHash);
  const treeFiles = new Map<string, { hash: string; mode: string }>();
  flattenTree(repo, commit.treeHash, '', treeFiles);

  // Get current working files
  const excludeDirs = ['.tsgit/', 'node_modules/', '.git/'];
  const workFiles = walkDir(repo.workDir, excludeDirs);

  // Delete files not in tree
  for (const file of workFiles) {
    const relativePath = path.relative(repo.workDir, file);
    if (!treeFiles.has(relativePath)) {
      fs.unlinkSync(file);
    }
  }

  // Restore files from tree
  for (const [filePath, { hash }] of treeFiles) {
    const fullPath = path.join(repo.workDir, filePath);
    const blob = repo.objects.readBlob(hash);

    const dir = path.dirname(fullPath);
    if (!exists(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, blob.content);
  }

  // Clean up empty directories
  cleanEmptyDirectories(repo.workDir, excludeDirs);
}

/**
 * Flatten tree to map
 */
function flattenTree(
  repo: Repository, 
  treeHash: string, 
  prefix: string, 
  result: Map<string, { hash: string; mode: string }>
): void {
  const tree = repo.objects.readTree(treeHash);

  for (const entry of tree.entries) {
    const fullPath = prefix ? prefix + '/' + entry.name : entry.name;

    if (entry.mode === '40000') {
      flattenTree(repo, entry.hash, fullPath, result);
    } else {
      result.set(fullPath, { hash: entry.hash, mode: entry.mode });
    }
  }
}

/**
 * Clean up empty directories
 */
function cleanEmptyDirectories(dir: string, excludeDirs: string[]): void {
  try {
    const entries = fs.readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const relativePath = entry + '/';
      
      if (excludeDirs.some(ex => relativePath.startsWith(ex))) {
        continue;
      }

      if (fs.statSync(fullPath).isDirectory()) {
        cleanEmptyDirectories(fullPath, excludeDirs);
        
        // Check if directory is now empty
        const remaining = fs.readdirSync(fullPath);
        if (remaining.length === 0) {
          fs.rmdirSync(fullPath);
        }
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Reset a specific file (unstage)
 */
export function resetFile(repo: Repository, filePath: string): void {
  const headHash = repo.refs.resolve('HEAD');
  
  if (!headHash) {
    // No commits yet, just remove from index
    repo.index.remove(filePath);
    repo.index.save();
    return;
  }

  const commit = repo.objects.readCommit(headHash);
  const blobHash = findBlobInTree(repo, commit.treeHash, filePath.split('/'));

  if (blobHash) {
    // File exists in HEAD, restore its hash in index
    repo.index.add(filePath, blobHash, repo.workDir);
  } else {
    // File doesn't exist in HEAD, remove from index
    repo.index.remove(filePath);
  }

  repo.index.save();
}

/**
 * Find blob in tree by path
 */
function findBlobInTree(repo: Repository, treeHash: string, pathParts: string[]): string | null {
  const tree = repo.objects.readTree(treeHash);

  for (const entry of tree.entries) {
    if (entry.name === pathParts[0]) {
      if (pathParts.length === 1) {
        return entry.mode === '40000' ? null : entry.hash;
      }
      if (entry.mode === '40000') {
        return findBlobInTree(repo, entry.hash, pathParts.slice(1));
      }
    }
  }

  return null;
}

/**
 * CLI handler for reset command
 */
export function handleReset(args: string[]): void {
  const repo = Repository.find();
  let mode: ResetMode = 'mixed';
  const files: string[] = [];
  let target: string | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--soft') {
      mode = 'soft';
    } else if (arg === '--mixed') {
      mode = 'mixed';
    } else if (arg === '--hard') {
      mode = 'hard';
    } else if (arg === '--') {
      // Everything after -- is files
      files.push(...args.slice(i + 1));
      break;
    } else if (!arg.startsWith('-')) {
      // Could be a target ref or a file
      // If it looks like a ref (HEAD, branch name, hash, or contains ~ or ^), treat as target
      if (arg === 'HEAD' || 
          arg.includes('~') || 
          arg.includes('^') || 
          repo.refs.branchExists(arg) ||
          /^[0-9a-f]{7,}$/.test(arg)) {
        target = arg;
      } else {
        // Assume it's a file
        files.push(arg);
      }
    }
  }

  try {
    // If we have files, do file reset (unstage)
    if (files.length > 0) {
      for (const file of files) {
        resetFile(repo, file);
        console.log(colors.dim(`Unstaged: ${file}`));
      }
      console.log(colors.green('✓') + ` Unstaged ${files.length} file(s)`);
      return;
    }

    // Otherwise, do commit reset
    if (!target) {
      target = 'HEAD';
    }

    const result = reset(repo, target, { mode });

    console.log(colors.green('✓') + ` Reset ${mode} to ${result.newHash.slice(0, 8)}`);
    console.log(colors.dim(`  Was: ${result.previousHash.slice(0, 8)}`));

    // Show helpful hints based on mode
    if (mode === 'soft') {
      console.log();
      console.log(colors.cyan('Your changes are still staged.'));
      console.log(colors.dim('  tsgit status        # See staged changes'));
      console.log(colors.dim('  tsgit commit -m ""  # Commit with new message'));
    } else if (mode === 'mixed') {
      console.log();
      console.log(colors.cyan('Your changes are preserved but unstaged.'));
      console.log(colors.dim('  tsgit status        # See changes'));
      console.log(colors.dim('  tsgit add .         # Stage all'));
    } else if (mode === 'hard') {
      console.log();
      console.log(colors.yellow('Working directory has been reset.'));
      console.log(colors.dim('  tsgit undo          # Undo this reset if needed'));
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
