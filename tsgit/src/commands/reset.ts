/**
 * Reset Command
 * Reset current HEAD to the specified state
 * 
 * Modes:
 * --soft: Only move HEAD (keep index and working tree)
 * --mixed: Move HEAD and reset index (keep working tree) - DEFAULT
 * --hard: Move HEAD, reset index, and reset working tree
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { walkDir, exists } from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

export type ResetMode = 'soft' | 'mixed' | 'hard';

export interface ResetOptions {
  mode?: ResetMode;      // Reset mode (default: 'mixed')
  target?: string;       // Target ref/commit (default: HEAD)
}

export interface ResetResult {
  previousHash: string;
  targetHash: string;
  mode: ResetMode;
  filesChanged: number;
}

/**
 * Parse commit reference like HEAD~1, HEAD~2, etc.
 */
function parseCommitRef(repo: Repository, ref: string): string {
  // Handle HEAD~N syntax
  const tildeMatch = ref.match(/^(HEAD|[a-f0-9]+)~(\d+)$/i);
  if (tildeMatch) {
    const base = tildeMatch[1];
    const count = parseInt(tildeMatch[2], 10);
    
    let currentHash = repo.refs.resolve(base);
    if (!currentHash) {
      throw new TsgitError(
        `Unknown ref: ${base}`,
        ErrorCode.UNKNOWN_REF,
        []
      );
    }
    
    for (let i = 0; i < count; i++) {
      const commit = repo.objects.readCommit(currentHash);
      if (commit.parentHashes.length === 0) {
        throw new TsgitError(
          `Cannot go back ${count} commits - only ${i} parents available`,
          ErrorCode.OPERATION_FAILED,
          [`tsgit reset HEAD~${i}    # Reset to the earliest possible commit`]
        );
      }
      currentHash = commit.parentHashes[0];
    }
    
    return currentHash;
  }
  
  // Handle HEAD^ syntax (same as HEAD~1)
  const caretMatch = ref.match(/^(HEAD|[a-f0-9]+)\^$/i);
  if (caretMatch) {
    const base = caretMatch[1];
    const currentHash = repo.refs.resolve(base);
    if (!currentHash) {
      throw new TsgitError(
        `Unknown ref: ${base}`,
        ErrorCode.UNKNOWN_REF,
        []
      );
    }
    
    const commit = repo.objects.readCommit(currentHash);
    if (commit.parentHashes.length === 0) {
      throw new TsgitError(
        'Cannot go back - no parent commit',
        ErrorCode.OPERATION_FAILED,
        []
      );
    }
    
    return commit.parentHashes[0];
  }
  
  // Regular ref resolution
  const hash = repo.refs.resolve(ref);
  if (!hash) {
    throw new TsgitError(
      `Unknown ref: ${ref}`,
      ErrorCode.UNKNOWN_REF,
      [
        'Make sure the commit hash or branch name is correct',
        'tsgit log    # View commit history',
      ]
    );
  }
  
  return hash;
}

/**
 * Reset current HEAD to a specified state
 */
export function reset(options: ResetOptions = {}): ResetResult {
  const repo = Repository.find();
  const mode = options.mode || 'mixed';
  const targetRef = options.target || 'HEAD';
  
  // Get current HEAD
  const previousHash = repo.refs.resolve('HEAD');
  if (!previousHash) {
    throw new TsgitError(
      'No commits yet - nothing to reset',
      ErrorCode.NO_COMMITS_YET,
      ['tsgit commit -m "Initial commit"    # Create your first commit']
    );
  }
  
  // Resolve target
  const targetHash = parseCommitRef(repo, targetRef);
  
  // Record before state for journal
  const beforeState = {
    head: previousHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  // Move HEAD/branch pointer
  const head = repo.refs.getHead();
  if (head.isSymbolic) {
    const branchName = head.target.replace('refs/heads/', '');
    repo.refs.updateBranch(branchName, targetHash);
  } else {
    repo.refs.setHeadDetached(targetHash);
  }
  
  let filesChanged = 0;
  
  // Handle different modes
  if (mode === 'soft') {
    // Soft reset: only move HEAD, keep index and working tree as-is
    // Nothing more to do
  } else if (mode === 'mixed') {
    // Mixed reset: move HEAD, reset index to match target, keep working tree
    filesChanged = resetIndex(repo, targetHash);
  } else if (mode === 'hard') {
    // Hard reset: move HEAD, reset index, and reset working tree
    filesChanged = resetIndexAndWorkTree(repo, targetHash);
  }
  
  // Record in journal
  const afterState = {
    head: targetHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  repo.journal.record(
    'reset',
    [mode, targetRef],
    `Reset ${mode}: ${previousHash.slice(0, 8)} -> ${targetHash.slice(0, 8)}`,
    beforeState,
    afterState
  );
  
  return {
    previousHash,
    targetHash,
    mode,
    filesChanged,
  };
}

/**
 * Reset the index to match a specific commit
 */
function resetIndex(repo: Repository, commitHash: string): number {
  const commit = repo.objects.readCommit(commitHash);
  const targetFiles = new Map<string, string>();
  flattenTree(repo, commit.treeHash, '', targetFiles);
  
  // Clear current index
  repo.index.clear();
  
  // Add all files from target tree to index
  for (const [filePath, blobHash] of targetFiles) {
    // We need to add to index without requiring the file to exist
    // Create a minimal entry
    const fullPath = path.join(repo.workDir, filePath);
    if (exists(fullPath)) {
      repo.index.add(filePath, blobHash, repo.workDir);
    }
  }
  
  repo.index.save();
  return targetFiles.size;
}

/**
 * Reset both index and working tree to match a specific commit
 */
function resetIndexAndWorkTree(repo: Repository, commitHash: string): number {
  const commit = repo.objects.readCommit(commitHash);
  const targetFiles = new Map<string, string>();
  flattenTree(repo, commit.treeHash, '', targetFiles);
  
  // Get current working files
  const workFiles = walkDir(repo.workDir, ['.tsgit/', 'node_modules/', '.git/']);
  const currentFiles = new Set<string>();
  
  for (const file of workFiles) {
    currentFiles.add(path.relative(repo.workDir, file));
  }
  
  // Delete files not in target tree
  for (const file of currentFiles) {
    if (!targetFiles.has(file)) {
      const fullPath = path.join(repo.workDir, file);
      try {
        fs.unlinkSync(fullPath);
        // Try to remove empty parent directories
        let dir = path.dirname(fullPath);
        while (dir !== repo.workDir) {
          try {
            fs.rmdirSync(dir);
            dir = path.dirname(dir);
          } catch {
            break; // Directory not empty or can't be removed
          }
        }
      } catch {
        // Ignore file removal errors
      }
    }
  }
  
  // Clear index
  repo.index.clear();
  
  // Restore files from target tree
  for (const [filePath, blobHash] of targetFiles) {
    const fullPath = path.join(repo.workDir, filePath);
    const blob = repo.objects.readBlob(blobHash);
    
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!exists(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, blob.content);
    repo.index.add(filePath, blobHash, repo.workDir);
  }
  
  repo.index.save();
  return targetFiles.size;
}

/**
 * Flatten tree to map of path -> blob hash
 */
function flattenTree(repo: Repository, treeHash: string, prefix: string, result: Map<string, string>): void {
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    const fullPath = prefix ? prefix + '/' + entry.name : entry.name;
    
    if (entry.mode === '40000') {
      flattenTree(repo, entry.hash, fullPath, result);
    } else {
      result.set(fullPath, entry.hash);
    }
  }
}

/**
 * CLI handler for reset command
 */
export function handleReset(args: string[]): void {
  const options: ResetOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--soft') {
      options.mode = 'soft';
    } else if (arg === '--mixed') {
      options.mode = 'mixed';
    } else if (arg === '--hard') {
      options.mode = 'hard';
    } else if (!arg.startsWith('-')) {
      options.target = arg;
    }
  }
  
  try {
    const result = reset(options);
    
    console.log(colors.green('✓') + ` Reset ${result.mode}: ${colors.yellow(result.previousHash.slice(0, 8))} -> ${colors.yellow(result.targetHash.slice(0, 8))}`);
    
    if (result.mode === 'soft') {
      console.log(colors.dim('  Index and working tree unchanged'));
    } else if (result.mode === 'mixed') {
      console.log(colors.dim(`  Index reset (${result.filesChanged} files)`));
      console.log(colors.dim('  Working tree unchanged'));
    } else {
      console.log(colors.dim(`  Index and working tree reset (${result.filesChanged} files)`));
    }
    
    console.log();
    console.log(colors.cyan('Tips:'));
    if (result.mode === 'soft') {
      console.log(colors.dim('  tsgit status    # See staged changes'));
      console.log(colors.dim('  tsgit commit    # Create a new commit'));
    } else if (result.mode === 'mixed') {
      console.log(colors.dim('  tsgit status    # See unstaged changes'));
      console.log(colors.dim('  tsgit add .     # Stage changes'));
    } else {
      console.log(colors.dim('  tsgit status    # Verify clean state'));
      console.log(colors.dim('  tsgit undo      # Undo this reset'));
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
