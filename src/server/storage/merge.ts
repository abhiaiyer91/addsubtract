/**
 * Server-side merge operations for bare repositories
 * 
 * Performs actual Git merges on bare repositories (no working directory).
 * This is the critical piece that makes PRs actually work - without this,
 * merging a PR only updates the database, not the Git refs.
 */

import * as path from 'path';
import { execSync } from 'child_process';
import { exists } from '../../utils/fs';

/**
 * Merge strategy for pull requests
 */
export type MergeStrategy = 'merge' | 'squash' | 'rebase';

/**
 * Result of a merge operation
 */
export interface MergeResult {
  success: boolean;
  mergeSha?: string;
  error?: string;
  conflicts?: string[];
}

/**
 * Options for merge operation
 */
export interface MergeOptions {
  authorName: string;
  authorEmail: string;
  message?: string;
  strategy?: MergeStrategy;
}

/**
 * Storage error class
 */
class MergeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MergeError';
  }
}

/**
 * Execute a git command in a repository
 */
function git(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Disable interactive prompts
        GIT_TERMINAL_PROMPT: '0',
      },
    }).trim();
  } catch (error) {
    if (error instanceof Error && 'stderr' in error) {
      throw new MergeError(
        (error as any).stderr || error.message,
        'GIT_COMMAND_FAILED'
      );
    }
    throw error;
  }
}

/**
 * Check if a merge would have conflicts
 * 
 * For bare repositories, we can't do a real merge check without a worktree.
 * Instead, we use git merge-tree to simulate the merge.
 */
export function checkMergeability(
  repoPath: string,
  sourceBranch: string,
  targetBranch: string
): { canMerge: boolean; conflicts: string[]; behindBy: number; aheadBy: number } {
  if (!exists(repoPath)) {
    throw new MergeError(`Repository not found: ${repoPath}`, 'REPO_NOT_FOUND');
  }

  try {
    // Get the SHAs for both branches
    const sourceRef = `refs/heads/${sourceBranch}`;
    const targetRef = `refs/heads/${targetBranch}`;
    
    let sourceSha: string;
    let targetSha: string;
    
    try {
      sourceSha = git(`rev-parse ${sourceRef}`, repoPath);
    } catch {
      throw new MergeError(`Source branch '${sourceBranch}' not found`, 'BRANCH_NOT_FOUND');
    }
    
    try {
      targetSha = git(`rev-parse ${targetRef}`, repoPath);
    } catch {
      throw new MergeError(`Target branch '${targetBranch}' not found`, 'BRANCH_NOT_FOUND');
    }

    // Find merge base
    let mergeBase: string;
    try {
      mergeBase = git(`merge-base ${sourceSha} ${targetSha}`, repoPath);
    } catch {
      // No common ancestor - can still merge but it's a root merge
      mergeBase = '';
    }

    // Check ahead/behind counts
    let aheadBy = 0;
    let behindBy = 0;
    
    try {
      const counts = git(`rev-list --left-right --count ${targetSha}...${sourceSha}`, repoPath);
      const [behind, ahead] = counts.split('\t').map(n => parseInt(n, 10));
      behindBy = behind || 0;
      aheadBy = ahead || 0;
    } catch {
      // Ignore count errors
    }

    // Check if already up to date
    if (sourceSha === targetSha || sourceSha === mergeBase) {
      return { canMerge: true, conflicts: [], behindBy: 0, aheadBy: 0 };
    }

    // Use merge-tree to detect conflicts (Git 2.38+)
    // merge-tree --write-tree returns the tree SHA if no conflicts, or lists conflicts
    try {
      // Try the newer merge-tree command first (Git 2.38+)
      // If successful, returns the tree SHA (which we don't need, just indicates no conflicts)
      git(`merge-tree --write-tree ${targetSha} ${sourceSha}`, repoPath);
      return { canMerge: true, conflicts: [], behindBy, aheadBy };
    } catch (error) {
      // Check if it's a conflict error or an unsupported command error
      const errorMsg = error instanceof MergeError ? error.message : String(error);
      
      if (errorMsg.includes('CONFLICT') || errorMsg.includes('conflict')) {
        // Parse conflict files from error message
        const conflicts: string[] = [];
        const lines = errorMsg.split('\n');
        for (const line of lines) {
          const match = line.match(/CONFLICT \([^)]+\): (?:Merge conflict in )?(.+)/);
          if (match) {
            conflicts.push(match[1].trim());
          }
        }
        return { canMerge: false, conflicts, behindBy, aheadBy };
      }
      
      // Fallback for older Git versions: use merge-base and diff
      // This is less accurate but better than nothing
      try {
        if (mergeBase) {
          // Check if there are overlapping changes
          const baseToSource = git(`diff --name-only ${mergeBase} ${sourceSha}`, repoPath);
          const baseToTarget = git(`diff --name-only ${mergeBase} ${targetSha}`, repoPath);
          
          const sourceFiles = new Set(baseToSource.split('\n').filter(f => f));
          const targetFiles = new Set(baseToTarget.split('\n').filter(f => f));
          
          // Files modified in both branches might have conflicts
          // We can't know for sure without actually merging, so assume mergeable
          // Real conflicts will be caught during actual merge
          // Note: potentialConflicts = [...sourceFiles].filter(f => targetFiles.has(f))
          return { canMerge: true, conflicts: [], behindBy, aheadBy };
        }
      } catch {
        // Ignore fallback errors
      }
      
      // If all else fails, assume mergeable (actual merge will catch conflicts)
      return { canMerge: true, conflicts: [], behindBy, aheadBy };
    }
  } catch (error) {
    if (error instanceof MergeError) {
      throw error;
    }
    throw new MergeError(
      `Failed to check mergeability: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CHECK_FAILED'
    );
  }
}

/**
 * Perform a merge in a bare repository
 * 
 * For bare repos, we need to use git plumbing commands since there's no working directory.
 * 
 * Strategy:
 * 1. Create a temporary worktree
 * 2. Perform the merge in the worktree  
 * 3. Clean up the worktree
 * 
 * This is how GitHub/GitLab handle merges on bare repos.
 */
export async function mergePullRequest(
  repoPath: string,
  sourceBranch: string,
  targetBranch: string,
  options: MergeOptions
): Promise<MergeResult> {
  if (!exists(repoPath)) {
    return { success: false, error: `Repository not found: ${repoPath}` };
  }

  const strategy = options.strategy || 'merge';
  const worktreePath = path.join(repoPath, '..', `.worktree-${Date.now()}`);
  
  try {
    // Set up author info for the merge commit
    const authorEnv = {
      GIT_AUTHOR_NAME: options.authorName,
      GIT_AUTHOR_EMAIL: options.authorEmail,
      GIT_COMMITTER_NAME: options.authorName,
      GIT_COMMITTER_EMAIL: options.authorEmail,
    };

    // Resolve branch refs to SHAs
    const sourceRef = `refs/heads/${sourceBranch}`;
    const targetRef = `refs/heads/${targetBranch}`;
    
    let sourceSha: string;
    let targetSha: string;
    
    try {
      sourceSha = git(`rev-parse ${sourceRef}`, repoPath);
    } catch {
      return { success: false, error: `Source branch '${sourceBranch}' not found` };
    }
    
    try {
      targetSha = git(`rev-parse ${targetRef}`, repoPath);
    } catch {
      return { success: false, error: `Target branch '${targetBranch}' not found` };
    }

    // Check if already merged (source is ancestor of target)
    try {
      git(`merge-base --is-ancestor ${sourceSha} ${targetSha}`, repoPath);
      // If command succeeds, source is already in target
      return { success: true, mergeSha: targetSha };
    } catch {
      // Not an ancestor, need to merge
    }

    // Check for fast-forward possibility
    let isFastForward = false;
    try {
      git(`merge-base --is-ancestor ${targetSha} ${sourceSha}`, repoPath);
      isFastForward = true;
    } catch {
      // Not fast-forward
    }

    // Fast-forward merge (just update the ref)
    if (isFastForward && strategy === 'merge') {
      git(`update-ref ${targetRef} ${sourceSha}`, repoPath);
      return { success: true, mergeSha: sourceSha };
    }

    // For non-fast-forward merges, we need a worktree
    // Create worktree for the merge
    git(`worktree add "${worktreePath}" ${targetBranch}`, repoPath);

    try {
      // Set author info in worktree
      const envString = Object.entries(authorEnv)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');

      let mergeSha: string;

      if (strategy === 'squash') {
        // Squash merge: combine all commits into one
        execSync(`env ${envString} git merge --squash ${sourceBranch}`, {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        // Create the squash commit
        const message = options.message || `Squash merge branch '${sourceBranch}' into ${targetBranch}`;
        execSync(`env ${envString} git commit -m "${message.replace(/"/g, '\\"')}"`, {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        mergeSha = git('rev-parse HEAD', worktreePath);
        
      } else if (strategy === 'rebase') {
        // Rebase: replay source commits on top of target
        // Note: This changes commit SHAs, so we're actually doing a merge after rebase
        execSync(`env ${envString} git rebase ${targetBranch} ${sourceBranch}`, {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        // Fast-forward target to rebased source
        mergeSha = git(`rev-parse ${sourceBranch}`, worktreePath);
        git(`checkout ${targetBranch}`, worktreePath);
        git(`merge --ff-only ${sourceBranch}`, worktreePath);
        
      } else {
        // Regular merge commit
        const message = options.message || `Merge branch '${sourceBranch}' into ${targetBranch}`;
        execSync(`env ${envString} git merge --no-ff -m "${message.replace(/"/g, '\\"')}" ${sourceBranch}`, {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        mergeSha = git('rev-parse HEAD', worktreePath);
      }

      return { success: true, mergeSha };
      
    } catch (error) {
      // Check for merge conflicts - get output from execSync error
      // For execSync, conflict info is typically in stdout, not stderr
      let errorOutput = '';
      if (error && typeof error === 'object') {
        // Combine stdout and stderr - git merge conflicts show in stdout
        const stdout = 'stdout' in error ? String((error as any).stdout) : '';
        const stderr = 'stderr' in error ? String((error as any).stderr) : '';
        errorOutput = stdout + stderr;
      }
      if (!errorOutput && error instanceof Error) {
        errorOutput = error.message;
      }
      
      if (errorOutput.includes('CONFLICT') || errorOutput.includes('Automatic merge failed') || 
          errorOutput.includes('fix conflicts') || errorOutput.includes('Merge conflict')) {
        // Try to get list of conflicted files
        try {
          const conflictOutput = git('diff --name-only --diff-filter=U', worktreePath);
          const conflicts = conflictOutput.split('\n').filter(f => f);
          return { success: false, error: 'Merge conflict detected', conflicts };
        } catch {
          return { success: false, error: 'Merge conflict detected', conflicts: [] };
        }
      }
      
      // Re-throw to be caught by outer handler with the actual error message
      const errorMsg = errorOutput || (error instanceof Error ? error.message : 'Unknown merge error');
      throw new MergeError(errorMsg, 'MERGE_FAILED');
    }
    
  } catch (error) {
    // Check if it's a conflict error that bubbled up
    const errorMsg = error instanceof MergeError ? error.message : 
                     error instanceof Error ? error.message : 'Unknown error';
    
    // Double-check for conflict keywords in case they were in a re-thrown error
    if (errorMsg.includes('CONFLICT') || errorMsg.includes('conflict') || 
        errorMsg.includes('Automatic merge failed')) {
      return { success: false, error: 'Merge conflict detected', conflicts: [] };
    }
    
    return { success: false, error: `Merge failed: ${errorMsg}` };
    
  } finally {
    // Clean up worktree
    try {
      git(`worktree remove "${worktreePath}" --force`, repoPath);
    } catch {
      // Try manual cleanup
      try {
        execSync(`rm -rf "${worktreePath}"`, { encoding: 'utf-8' });
        // Also clean up worktree from git's tracking
        git('worktree prune', repoPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Get the default merge message for a PR
 */
export function getDefaultMergeMessage(
  prNumber: number,
  prTitle: string,
  sourceBranch: string,
  targetBranch: string,
  strategy: MergeStrategy = 'merge'
): string {
  switch (strategy) {
    case 'squash':
      return `${prTitle} (#${prNumber})\n\nSquash merge of '${sourceBranch}' into ${targetBranch}`;
    case 'rebase':
      return `${prTitle} (#${prNumber})`;
    default:
      return `Merge pull request #${prNumber} from ${sourceBranch}\n\n${prTitle}`;
  }
}
