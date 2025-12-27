/**
 * Merge Queue Manager
 * 
 * Implements an intelligent merge queue that reassembles commits from multiple PRs
 * into a coherent sequence, avoiding conflicts by understanding code locality and
 * dependencies between changes.
 * 
 * Key features:
 * - Conflict detection before merging
 * - Intelligent ordering based on file overlap
 * - Speculative merging with rollback
 * - Commit reassembly to create a clean history
 */

import * as path from 'path';
import { execSync, spawn } from 'child_process';
import type { MergeQueueEntry, MergeQueueBatch, MergeQueueConfig, PullRequest } from '../db/schema';

// ============ TYPES ============

export interface FileChange {
  path: string;
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  oldPath?: string; // For renames
}

export interface PRAnalysis {
  prId: string;
  headSha: string;
  files: FileChange[];
  commits: CommitInfo[];
  directories: Set<string>;
  conflictAreas: string[]; // Paths that commonly conflict
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  date: Date;
  files: string[];
}

export interface ConflictPrediction {
  pr1Id: string;
  pr2Id: string;
  probability: number; // 0-1
  conflictingFiles: string[];
  resolution: 'pr1_first' | 'pr2_first' | 'manual_required';
}

export interface ReassembledCommit {
  originalSha: string;
  newSha: string;
  prId: string;
  message: string;
  order: number;
}

export interface MergeQueueResult {
  success: boolean;
  mergeSha?: string;
  failedPrId?: string;
  errorMessage?: string;
  reassembledCommits: ReassembledCommit[];
}

export interface BatchMergeResult {
  success: boolean;
  mergeSha?: string;
  mergedPrs: string[];
  failedPrs: string[];
  errorMessage?: string;
}

// ============ MERGE QUEUE MANAGER ============

export class MergeQueueManager {
  constructor(
    private diskPath: string,
    private targetBranch: string
  ) {}

  /**
   * Analyze a PR's changes to understand what files it touches
   * and potential conflict areas
   */
  async analyzePR(headSha: string, baseSha: string): Promise<PRAnalysis> {
    const files = this.getChangedFiles(headSha, baseSha);
    const commits = this.getCommits(baseSha, headSha);
    const directories = new Set<string>();
    
    // Extract directories from file paths
    for (const file of files) {
      const dir = path.dirname(file.path);
      let current = dir;
      while (current && current !== '.') {
        directories.add(current);
        current = path.dirname(current);
      }
    }

    // Identify conflict-prone areas
    const conflictAreas = this.identifyConflictAreas(files);

    return {
      prId: '', // Will be set by caller
      headSha,
      files,
      commits,
      directories,
      conflictAreas,
    };
  }

  /**
   * Get files changed between two commits
   */
  private getChangedFiles(headSha: string, baseSha: string): FileChange[] {
    try {
      const output = execSync(
        `git diff --numstat --diff-filter=AMDRT ${baseSha}...${headSha}`,
        { cwd: this.diskPath, encoding: 'utf8' }
      );

      const files: FileChange[] = [];
      for (const line of output.trim().split('\n')) {
        if (!line) continue;
        const [additions, deletions, filePath] = line.split('\t');
        
        // Handle renames (format: old => new)
        const renameMatch = filePath.match(/^(.+) => (.+)$/);
        if (renameMatch) {
          files.push({
            path: renameMatch[2],
            oldPath: renameMatch[1],
            changeType: 'renamed',
            additions: parseInt(additions) || 0,
            deletions: parseInt(deletions) || 0,
          });
        } else {
          files.push({
            path: filePath,
            changeType: this.determineChangeType(baseSha, headSha, filePath),
            additions: parseInt(additions) || 0,
            deletions: parseInt(deletions) || 0,
          });
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  /**
   * Determine if a file was added, modified, or deleted
   */
  private determineChangeType(
    baseSha: string,
    headSha: string,
    filePath: string
  ): 'added' | 'modified' | 'deleted' {
    try {
      // Check if file exists in base
      const inBase = this.fileExistsInCommit(baseSha, filePath);
      const inHead = this.fileExistsInCommit(headSha, filePath);

      if (!inBase && inHead) return 'added';
      if (inBase && !inHead) return 'deleted';
      return 'modified';
    } catch {
      return 'modified';
    }
  }

  /**
   * Check if a file exists in a specific commit
   */
  private fileExistsInCommit(sha: string, filePath: string): boolean {
    try {
      execSync(`git cat-file -e ${sha}:${filePath}`, {
        cwd: this.diskPath,
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get commits between two refs
   */
  private getCommits(baseSha: string, headSha: string): CommitInfo[] {
    try {
      const format = '%H|%s|%an|%ae|%aI';
      const output = execSync(
        `git log --format="${format}" ${baseSha}..${headSha}`,
        { cwd: this.diskPath, encoding: 'utf8' }
      );

      const commits: CommitInfo[] = [];
      for (const line of output.trim().split('\n')) {
        if (!line) continue;
        const [sha, message, author, authorEmail, dateStr] = line.split('|');
        
        // Get files for this commit
        const filesOutput = execSync(
          `git diff-tree --no-commit-id --name-only -r ${sha}`,
          { cwd: this.diskPath, encoding: 'utf8' }
        );

        commits.push({
          sha,
          message,
          author,
          authorEmail,
          date: new Date(dateStr),
          files: filesOutput.trim().split('\n').filter(Boolean),
        });
      }

      return commits;
    } catch {
      return [];
    }
  }

  /**
   * Identify areas that commonly cause conflicts
   */
  private identifyConflictAreas(files: FileChange[]): string[] {
    const conflictAreas: string[] = [];

    for (const file of files) {
      // Lock files, package manifests, and generated files often conflict
      if (
        file.path.endsWith('package-lock.json') ||
        file.path.endsWith('yarn.lock') ||
        file.path.endsWith('pnpm-lock.yaml') ||
        file.path.endsWith('.generated.ts') ||
        file.path.includes('schema.') ||
        file.path.includes('migration')
      ) {
        conflictAreas.push(file.path);
      }

      // High churn files
      if (file.additions + file.deletions > 100) {
        conflictAreas.push(file.path);
      }
    }

    return conflictAreas;
  }

  /**
   * Predict conflicts between two PRs
   */
  predictConflicts(pr1: PRAnalysis, pr2: PRAnalysis): ConflictPrediction {
    const conflictingFiles: string[] = [];
    let conflictScore = 0;

    // Check for direct file overlaps
    const pr1Files = new Set(pr1.files.map(f => f.path));
    const pr2Files = new Set(pr2.files.map(f => f.path));

    for (const file of pr1Files) {
      if (pr2Files.has(file)) {
        conflictingFiles.push(file);
        conflictScore += 20; // Direct file conflict
      }
    }

    // Check for directory overlaps (weaker signal)
    for (const dir of pr1.directories) {
      if (pr2.directories.has(dir)) {
        conflictScore += 2; // Same directory, might conflict
      }
    }

    // Check for conflict-prone areas
    const pr1ConflictAreas = new Set(pr1.conflictAreas);
    for (const area of pr2.conflictAreas) {
      if (pr1ConflictAreas.has(area)) {
        conflictScore += 30; // Both touch conflict-prone file
      }
    }

    // Normalize score to 0-1
    const probability = Math.min(1, conflictScore / 100);

    // Determine resolution order
    let resolution: ConflictPrediction['resolution'] = 'pr1_first';
    if (probability > 0.7) {
      resolution = 'manual_required';
    } else if (probability > 0.3) {
      // Prefer merging the smaller PR first
      const pr1Size = pr1.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
      const pr2Size = pr2.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
      resolution = pr1Size <= pr2Size ? 'pr1_first' : 'pr2_first';
    }

    return {
      pr1Id: pr1.prId,
      pr2Id: pr2.prId,
      probability,
      conflictingFiles,
      resolution,
    };
  }

  /**
   * Determine optimal merge order for a set of PRs
   * Uses a greedy algorithm with conflict prediction
   */
  async determineOptimalOrder(
    prAnalyses: PRAnalysis[]
  ): Promise<PRAnalysis[]> {
    if (prAnalyses.length <= 1) return prAnalyses;

    // Build conflict matrix
    const conflictMatrix = new Map<string, Map<string, ConflictPrediction>>();
    for (let i = 0; i < prAnalyses.length; i++) {
      for (let j = i + 1; j < prAnalyses.length; j++) {
        const prediction = this.predictConflicts(prAnalyses[i], prAnalyses[j]);
        
        if (!conflictMatrix.has(prAnalyses[i].prId)) {
          conflictMatrix.set(prAnalyses[i].prId, new Map());
        }
        if (!conflictMatrix.has(prAnalyses[j].prId)) {
          conflictMatrix.set(prAnalyses[j].prId, new Map());
        }
        
        conflictMatrix.get(prAnalyses[i].prId)!.set(prAnalyses[j].prId, prediction);
        conflictMatrix.get(prAnalyses[j].prId)!.set(prAnalyses[i].prId, prediction);
      }
    }

    // Greedy ordering: always pick the PR with lowest total conflict score
    const ordered: PRAnalysis[] = [];
    const remaining = new Set(prAnalyses);

    while (remaining.size > 0) {
      let bestPr: PRAnalysis | null = null;
      let bestScore = Infinity;

      for (const pr of remaining) {
        let totalScore = 0;
        // Score against already-ordered PRs (weighted higher)
        for (const orderedPr of ordered) {
          const prediction = conflictMatrix.get(pr.prId)?.get(orderedPr.prId);
          if (prediction) {
            totalScore += prediction.probability * 2;
          }
        }
        // Score against remaining PRs
        for (const otherPr of remaining) {
          if (otherPr.prId === pr.prId) continue;
          const prediction = conflictMatrix.get(pr.prId)?.get(otherPr.prId);
          if (prediction) {
            totalScore += prediction.probability;
          }
        }

        if (totalScore < bestScore) {
          bestScore = totalScore;
          bestPr = pr;
        }
      }

      if (bestPr) {
        ordered.push(bestPr);
        remaining.delete(bestPr);
      }
    }

    return ordered;
  }

  /**
   * Create a temporary worktree for speculative merging
   */
  private createWorktree(): string {
    const worktreePath = path.join(
      this.diskPath,
      '..',
      `merge-queue-${Date.now()}`
    );
    
    execSync(
      `git worktree add -d "${worktreePath}" ${this.targetBranch}`,
      { cwd: this.diskPath }
    );

    return worktreePath;
  }

  /**
   * Remove a temporary worktree
   */
  private removeWorktree(worktreePath: string): void {
    try {
      execSync(`git worktree remove --force "${worktreePath}"`, {
        cwd: this.diskPath,
      });
    } catch {
      // Worktree might not exist
    }
  }

  /**
   * Attempt to merge a single PR into the worktree
   */
  private tryMergePR(
    worktreePath: string,
    headSha: string,
    message: string
  ): { success: boolean; sha?: string; error?: string } {
    try {
      // Attempt the merge
      execSync(`git merge --no-ff -m "${message}" ${headSha}`, {
        cwd: worktreePath,
        stdio: 'pipe',
      });

      // Get the merge commit SHA
      const sha = execSync('git rev-parse HEAD', {
        cwd: worktreePath,
        encoding: 'utf8',
      }).trim();

      return { success: true, sha };
    } catch (error: any) {
      // Merge failed, abort it
      try {
        execSync('git merge --abort', { cwd: worktreePath, stdio: 'ignore' });
      } catch {
        // Might not be in a merge state
      }

      return {
        success: false,
        error: error.message || 'Merge failed',
      };
    }
  }

  /**
   * Reassemble commits from multiple PRs into a logical sequence
   * 
   * This is the core algorithm that makes the merge queue intelligent:
   * 1. Analyze all PRs for file changes and conflict potential
   * 2. Determine optimal merge order
   * 3. For each PR, cherry-pick commits in order, preserving authorship
   * 4. If conflicts occur, try reordering or report failure
   */
  async reassembleCommits(
    prAnalyses: PRAnalysis[],
    prHeadShas: Map<string, string>
  ): Promise<MergeQueueResult> {
    // Determine optimal order
    const orderedPrs = await this.determineOptimalOrder(prAnalyses);
    
    // Create temporary worktree
    const worktreePath = this.createWorktree();
    const reassembledCommits: ReassembledCommit[] = [];

    try {
      let order = 0;
      
      for (const pr of orderedPrs) {
        const headSha = prHeadShas.get(pr.prId);
        if (!headSha) continue;

        // For each commit in the PR (in chronological order)
        const commits = [...pr.commits].reverse(); // Oldest first
        
        for (const commit of commits) {
          // Cherry-pick the commit
          try {
            execSync(`git cherry-pick ${commit.sha}`, {
              cwd: worktreePath,
              stdio: 'pipe',
            });

            const newSha = execSync('git rev-parse HEAD', {
              cwd: worktreePath,
              encoding: 'utf8',
            }).trim();

            reassembledCommits.push({
              originalSha: commit.sha,
              newSha,
              prId: pr.prId,
              message: commit.message,
              order: order++,
            });
          } catch (cherryPickError) {
            // Cherry-pick failed, try squash merge instead
            try {
              execSync('git cherry-pick --abort', {
                cwd: worktreePath,
                stdio: 'ignore',
              });
            } catch { /* ignore */ }

            // Fall back to merge commit
            const mergeResult = this.tryMergePR(
              worktreePath,
              headSha,
              `Merge PR: ${pr.prId}`
            );

            if (!mergeResult.success) {
              this.removeWorktree(worktreePath);
              return {
                success: false,
                failedPrId: pr.prId,
                errorMessage: `Failed to merge: ${mergeResult.error}`,
                reassembledCommits,
              };
            }

            // Add merge commit to reassembled list
            reassembledCommits.push({
              originalSha: headSha,
              newSha: mergeResult.sha!,
              prId: pr.prId,
              message: `Merge PR: ${pr.prId}`,
              order: order++,
            });

            break; // Move to next PR since we merged all commits
          }
        }
      }

      // Get final merge SHA
      const mergeSha = execSync('git rev-parse HEAD', {
        cwd: worktreePath,
        encoding: 'utf8',
      }).trim();

      // Push the result to a temp branch for CI
      const tempBranch = `merge-queue/batch-${Date.now()}`;
      execSync(`git push origin HEAD:refs/heads/${tempBranch}`, {
        cwd: worktreePath,
      });

      this.removeWorktree(worktreePath);

      return {
        success: true,
        mergeSha,
        reassembledCommits,
      };
    } catch (error: any) {
      this.removeWorktree(worktreePath);
      return {
        success: false,
        errorMessage: error.message,
        reassembledCommits,
      };
    }
  }

  /**
   * Process a batch of PRs with optimistic merging
   * 
   * Optimistic merging attempts to merge multiple PRs at once,
   * rolling back and bisecting on failure
   */
  async processBatch(
    entries: Array<{ prId: string; headSha: string; baseSha: string }>
  ): Promise<BatchMergeResult> {
    if (entries.length === 0) {
      return { success: true, mergedPrs: [], failedPrs: [] };
    }

    // Analyze all PRs
    const analyses: PRAnalysis[] = [];
    const headShas = new Map<string, string>();

    for (const entry of entries) {
      const analysis = await this.analyzePR(entry.headSha, entry.baseSha);
      analysis.prId = entry.prId;
      analyses.push(analysis);
      headShas.set(entry.prId, entry.headSha);
    }

    // Attempt to reassemble all commits
    const result = await this.reassembleCommits(analyses, headShas);

    if (result.success) {
      return {
        success: true,
        mergeSha: result.mergeSha,
        mergedPrs: entries.map(e => e.prId),
        failedPrs: [],
      };
    }

    // Batch failed - bisect to find the failing PR
    if (entries.length === 1) {
      return {
        success: false,
        mergedPrs: [],
        failedPrs: [entries[0].prId],
        errorMessage: result.errorMessage,
      };
    }

    // Split batch and try each half
    const mid = Math.floor(entries.length / 2);
    const firstHalf = entries.slice(0, mid);
    const secondHalf = entries.slice(mid);

    const firstResult = await this.processBatch(firstHalf);
    
    if (!firstResult.success) {
      // First half failed, second half untested
      return {
        success: false,
        mergedPrs: [],
        failedPrs: firstResult.failedPrs,
        errorMessage: firstResult.errorMessage,
      };
    }

    // First half succeeded, try second half on top
    const secondResult = await this.processBatch(secondHalf);

    return {
      success: secondResult.success,
      mergeSha: secondResult.mergeSha,
      mergedPrs: [...firstResult.mergedPrs, ...secondResult.mergedPrs],
      failedPrs: secondResult.failedPrs,
      errorMessage: secondResult.errorMessage,
    };
  }

  /**
   * Finalize a batch merge by updating the target branch
   */
  async finalizeMerge(mergeSha: string): Promise<boolean> {
    try {
      // Update the target branch to point to the merge commit
      execSync(
        `git update-ref refs/heads/${this.targetBranch} ${mergeSha}`,
        { cwd: this.diskPath }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a PR can be fast-forwarded
   */
  canFastForward(headSha: string, baseSha: string): boolean {
    try {
      const mergeBase = execSync(
        `git merge-base ${headSha} ${baseSha}`,
        { cwd: this.diskPath, encoding: 'utf8' }
      ).trim();
      return mergeBase === baseSha;
    } catch {
      return false;
    }
  }

  /**
   * Rebase a PR's commits onto the current target branch
   */
  async rebasePR(
    headSha: string,
    originalBaseSha: string
  ): Promise<{ success: boolean; newHeadSha?: string; error?: string }> {
    const worktreePath = this.createWorktree();

    try {
      // Get current target branch SHA
      const targetSha = execSync(
        `git rev-parse ${this.targetBranch}`,
        { cwd: this.diskPath, encoding: 'utf8' }
      ).trim();

      // Checkout the PR head
      execSync(`git checkout ${headSha}`, { cwd: worktreePath, stdio: 'pipe' });

      // Rebase onto target
      execSync(`git rebase --onto ${targetSha} ${originalBaseSha}`, {
        cwd: worktreePath,
        stdio: 'pipe',
      });

      const newHeadSha = execSync('git rev-parse HEAD', {
        cwd: worktreePath,
        encoding: 'utf8',
      }).trim();

      this.removeWorktree(worktreePath);

      return { success: true, newHeadSha };
    } catch (error: any) {
      // Abort rebase
      try {
        execSync('git rebase --abort', { cwd: worktreePath, stdio: 'ignore' });
      } catch { /* ignore */ }

      this.removeWorktree(worktreePath);

      return { success: false, error: error.message };
    }
  }
}

// ============ EXPORTS ============

export function createMergeQueueManager(
  diskPath: string,
  targetBranch: string
): MergeQueueManager {
  return new MergeQueueManager(diskPath, targetBranch);
}
