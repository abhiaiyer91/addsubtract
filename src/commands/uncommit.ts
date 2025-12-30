/**
 * Uncommit Command
 * Undo the last commit but keep changes staged
 * 
 * This is much clearer than "git reset --soft HEAD~1"
 */

import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { walkDir, exists } from '../utils/fs';
import * as path from 'path';
import * as fs from 'fs';
import { colors } from '../utils/colors';

export interface UncommitOptions {
  count?: number;        // Number of commits to uncommit (default: 1)
  hard?: boolean;        // Also discard changes (careful!)
}

/**
 * Uncommit - undo commit(s) but keep the changes staged
 */
export function uncommit(options: UncommitOptions = {}): { originalHash: string; newHash: string | null; message: string } {
  const repo = Repository.find();
  const count = options.count || 1;
  
  // Get current HEAD
  const headHash = repo.refs.resolve('HEAD');
  if (!headHash) {
    throw new TsgitError(
      'No commits to uncommit',
      ErrorCode.NO_COMMITS_YET,
      ['The repository has no commits yet']
    );
  }
  
  // Walk back 'count' commits to find the new HEAD
  let targetHash: string | null = headHash;
  let lastCommit = repo.objects.readCommit(headHash);
  
  for (let i = 0; i < count; i++) {
    if (!targetHash) {
      throw new TsgitError(
        `Cannot uncommit ${count} commits - only ${i} commits exist`,
        ErrorCode.OPERATION_FAILED,
        [`wit uncommit -n ${i}    # Uncommit ${i} commits instead`]
      );
    }
    
    const commit = repo.objects.readCommit(targetHash);
    
    if (commit.parentHashes.length === 0) {
      if (i < count - 1) {
        throw new TsgitError(
          `Cannot uncommit ${count} commits - only ${i + 1} commits exist`,
          ErrorCode.OPERATION_FAILED,
          [`wit uncommit -n ${i + 1}    # Uncommit all ${i + 1} commits`]
        );
      }
      targetHash = null;  // We're uncommitting the initial commit
      break;
    }
    
    targetHash = commit.parentHashes[0];
    lastCommit = commit;
  }
  
  // Record in journal BEFORE making changes
  const beforeState = {
    head: headHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  // Update HEAD to point to the target
  const head = repo.refs.getHead();
  if (head.isSymbolic) {
    const branchName = head.target.replace('refs/heads/', '');
    if (targetHash) {
      repo.refs.updateBranch(branchName, targetHash);
    } else {
      // Uncommitting all commits - this is a special case
      // We need to delete the branch ref to go back to initial state
      // For now, just error out
      throw new TsgitError(
        'Cannot uncommit the initial commit',
        ErrorCode.OPERATION_FAILED,
        ['Use "wit undo" to undo the initial commit instead']
      );
    }
  } else {
    if (targetHash) {
      repo.refs.setHeadDetached(targetHash);
    } else {
      throw new TsgitError(
        'Cannot uncommit in detached HEAD state with no parent',
        ErrorCode.OPERATION_FAILED,
        []
      );
    }
  }
  
  // If --hard, reset the working directory too
  if (options.hard) {
    // Reset index and working directory to match target
    if (targetHash) {
      const targetCommit = repo.objects.readCommit(targetHash);
      resetToTree(repo, targetCommit.treeHash);
    }
  }
  // Otherwise, keep the index as-is (changes remain staged)
  
  // Record in journal
  const afterState = {
    head: targetHash || '',
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  repo.journal.record(
    'uncommit',
    options.count ? ['-n', options.count.toString()] : [],
    `Uncommitted ${count} commit(s): ${headHash.slice(0, 8)} -> ${targetHash?.slice(0, 8) || 'initial'}`,
    beforeState,
    afterState
  );
  
  return {
    originalHash: headHash,
    newHash: targetHash,
    message: lastCommit.message.split('\n')[0],
  };
}

/**
 * Reset index and working directory to match a tree
 */
function resetToTree(repo: Repository, treeHash: string): void {
  // Clear index
  repo.index.clear();
  
  // Get all files from tree
  const treeFiles = new Map<string, string>();
  flattenTree(repo, treeHash, '', treeFiles);
  
  // Get all current working files
  const workFiles = walkDir(repo.workDir, ['.wit/', 'node_modules/', '.git/']);
  
  // Delete files not in tree
  for (const file of workFiles) {
    const relativePath = path.relative(repo.workDir, file);
    if (!treeFiles.has(relativePath)) {
      fs.unlinkSync(file);
    }
  }
  
  // Restore files from tree
  for (const [filePath, blobHash] of treeFiles) {
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
 * CLI handler for uncommit
 */
export function handleUncommit(args: string[]): void {
  const options: UncommitOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if ((arg === '-n' || arg === '--count') && i + 1 < args.length) {
      options.count = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--hard') {
      options.hard = true;
    } else if (/^\d+$/.test(arg)) {
      options.count = parseInt(arg, 10);
    }
  }
  
  try {
    const result = uncommit(options);
    const count = options.count || 1;
    
    console.log(colors.green('✓') + ` Uncommitted ${count} commit(s)`);
    console.log(colors.dim(`  Was: ${result.originalHash.slice(0, 8)} "${result.message}"`));
    
    if (result.newHash) {
      console.log(colors.dim(`  Now: ${result.newHash.slice(0, 8)}`));
    }
    
    if (!options.hard) {
      console.log();
      console.log(colors.cyan('Your changes are still staged.'));
      console.log(colors.dim('  wit status        # See staged changes'));
      console.log(colors.dim('  wit commit -m ""  # Commit with new message'));
      console.log(colors.dim('  wit restore --staged .  # Unstage all'));
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
