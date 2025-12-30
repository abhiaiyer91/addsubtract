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
 * 
 * Uses wit's TypeScript API for all git operations.
 */

import * as path from 'path';
import { BareRepository } from '../server/storage/repos';
import { Commit, Tree } from './object';
import { Author, TreeEntry } from './types';

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

// ============ HELPER FUNCTIONS ============

/**
 * Flatten a tree into a map of path -> { hash, mode }
 */
function flattenTree(repo: BareRepository, treeHash: string, prefix: string): Map<string, { hash: string; mode: string }> {
  const result = new Map<string, { hash: string; mode: string }>();
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.mode === '40000') {
      const subTree = flattenTree(repo, entry.hash, fullPath);
      for (const [path, info] of subTree) {
        result.set(path, info);
      }
    } else {
      result.set(fullPath, { hash: entry.hash, mode: entry.mode });
    }
  }
  
  return result;
}

/**
 * Find merge base between two commits
 */
function findMergeBase(repo: BareRepository, sha1: string, sha2: string): string | null {
  const ancestors1 = new Set<string>();
  const queue1 = [sha1];
  
  while (queue1.length > 0) {
    const current = queue1.shift()!;
    if (ancestors1.has(current)) continue;
    ancestors1.add(current);
    
    try {
      const commit = repo.objects.readCommit(current);
      for (const parent of commit.parentHashes) {
        queue1.push(parent);
      }
    } catch {
      break;
    }
  }
  
  const queue2 = [sha2];
  const visited2 = new Set<string>();
  
  while (queue2.length > 0) {
    const current = queue2.shift()!;
    if (visited2.has(current)) continue;
    visited2.add(current);
    
    if (ancestors1.has(current)) {
      return current;
    }
    
    try {
      const commit = repo.objects.readCommit(current);
      for (const parent of commit.parentHashes) {
        queue2.push(parent);
      }
    } catch {
      break;
    }
  }
  
  return null;
}

/**
 * Build a tree from a flat file map
 */
function buildTree(repo: BareRepository, files: Map<string, { hash: string; mode: string }>): string {
  const dirs = new Map<string, TreeEntry[]>();
  dirs.set('', []);
  
  for (const [filePath, info] of files) {
    const parts = filePath.split('/');
    const fileName = parts.pop()!;
    const dirPath = parts.join('/');
    
    let currentPath = '';
    for (const part of parts) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!dirs.has(currentPath)) {
        dirs.set(currentPath, []);
        const parentEntries = dirs.get(parentPath)!;
        if (!parentEntries.some(e => e.name === part && e.mode === '40000')) {
          parentEntries.push({ name: part, mode: '40000', hash: '' });
        }
      }
    }
    
    const dirEntries = dirs.get(dirPath) || [];
    if (!dirs.has(dirPath)) {
      dirs.set(dirPath, dirEntries);
    }
    dirEntries.push({ name: fileName, mode: info.mode, hash: info.hash });
  }
  
  const sortedPaths = Array.from(dirs.keys()).sort((a, b) => b.split('/').length - a.split('/').length);
  const treeHashes = new Map<string, string>();
  
  for (const dirPath of sortedPaths) {
    const entries = dirs.get(dirPath)!;
    
    for (const entry of entries) {
      if (entry.mode === '40000') {
        const childPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
        entry.hash = treeHashes.get(childPath)!;
      }
    }
    
    entries.sort((a, b) => {
      if (a.mode === '40000' && b.mode !== '40000') return -1;
      if (a.mode !== '40000' && b.mode === '40000') return 1;
      return a.name.localeCompare(b.name);
    });
    
    const tree = new Tree(entries.filter(e => e.hash));
    const hash = repo.objects.writeObject(tree);
    treeHashes.set(dirPath, hash);
  }
  
  return treeHashes.get('')!;
}

/**
 * Get timezone string
 */
function getTimezone(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return `${sign}${hours}${minutes}`;
}

// ============ MERGE QUEUE MANAGER ============

export class MergeQueueManager {
  private repo: BareRepository;

  constructor(
    private diskPath: string,
    private targetBranch: string
  ) {
    this.repo = new BareRepository(diskPath);
  }

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
   * Get files changed between two commits using wit's TS API
   */
  private getChangedFiles(headSha: string, baseSha: string): FileChange[] {
    try {
      const baseCommit = this.repo.objects.readCommit(baseSha);
      const headCommit = this.repo.objects.readCommit(headSha);
      
      const baseFiles = flattenTree(this.repo, baseCommit.treeHash, '');
      const headFiles = flattenTree(this.repo, headCommit.treeHash, '');
      
      const files: FileChange[] = [];
      const allPaths = new Set([...baseFiles.keys(), ...headFiles.keys()]);
      
      for (const filePath of allPaths) {
        const baseInfo = baseFiles.get(filePath);
        const headInfo = headFiles.get(filePath);
        
        if (baseInfo?.hash === headInfo?.hash) continue;
        
        let changeType: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
        let additions = 0;
        let deletions = 0;
        
        if (!baseInfo && headInfo) {
          changeType = 'added';
        } else if (baseInfo && !headInfo) {
          changeType = 'deleted';
        }
        
        // Count line changes
        if (baseInfo && headInfo) {
          try {
            const baseBlob = this.repo.objects.readBlob(baseInfo.hash);
            const headBlob = this.repo.objects.readBlob(headInfo.hash);
            const baseLines = baseBlob.content.toString('utf-8').split('\n').length;
            const headLines = headBlob.content.toString('utf-8').split('\n').length;
            additions = Math.max(0, headLines - baseLines);
            deletions = Math.max(0, baseLines - headLines);
          } catch {
            // Ignore errors counting lines
          }
        }
        
        files.push({
          path: filePath,
          changeType,
          additions,
          deletions,
        });
      }
      
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Check if a file exists in a specific commit using wit's TS API
   */
  private fileExistsInCommit(sha: string, filePath: string): boolean {
    try {
      const commit = this.repo.objects.readCommit(sha);
      const files = flattenTree(this.repo, commit.treeHash, '');
      return files.has(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Get commits between two refs using wit's TS API
   */
  private getCommits(baseSha: string, headSha: string): CommitInfo[] {
    try {
      const commits: CommitInfo[] = [];
      let currentHash: string | null = headSha;
      const visited = new Set<string>();
      
      while (currentHash && currentHash !== baseSha && !visited.has(currentHash)) {
        visited.add(currentHash);
        
        try {
          const commit = this.repo.objects.readCommit(currentHash);
          
          // Get files changed in this commit
          const files: string[] = [];
          if (commit.parentHashes.length > 0) {
            const parentCommit = this.repo.objects.readCommit(commit.parentHashes[0]);
            const parentFiles = flattenTree(this.repo, parentCommit.treeHash, '');
            const commitFiles = flattenTree(this.repo, commit.treeHash, '');
            
            const allPaths = new Set([...parentFiles.keys(), ...commitFiles.keys()]);
            for (const filePath of allPaths) {
              if (parentFiles.get(filePath)?.hash !== commitFiles.get(filePath)?.hash) {
                files.push(filePath);
              }
            }
          }
          
          commits.push({
            sha: currentHash,
            message: commit.message,
            author: commit.author.name,
            authorEmail: commit.author.email,
            date: new Date(commit.author.timestamp * 1000),
            files,
          });
          
          currentHash = commit.parentHashes.length > 0 ? commit.parentHashes[0] : null;
        } catch {
          break;
        }
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
   * Attempt to merge a single PR into the current state
   * Returns the new commit SHA if successful
   */
  private tryMergePR(
    currentSha: string,
    headSha: string,
    message: string,
    author: Author
  ): { success: boolean; sha?: string; error?: string; conflicts?: string[] } {
    try {
      // Find merge base
      const mergeBase = findMergeBase(this.repo, currentSha, headSha);
      if (!mergeBase) {
        return { success: false, error: 'No common ancestor found' };
      }
      
      // Get trees
      const baseCommit = this.repo.objects.readCommit(mergeBase);
      const currentCommit = this.repo.objects.readCommit(currentSha);
      const headCommit = this.repo.objects.readCommit(headSha);
      
      const baseFiles = flattenTree(this.repo, baseCommit.treeHash, '');
      const currentFiles = flattenTree(this.repo, currentCommit.treeHash, '');
      const headFiles = flattenTree(this.repo, headCommit.treeHash, '');
      
      // Three-way merge
      const mergedFiles = new Map<string, { hash: string; mode: string }>();
      const conflicts: string[] = [];
      
      const allPaths = new Set([...baseFiles.keys(), ...currentFiles.keys(), ...headFiles.keys()]);
      
      for (const filePath of allPaths) {
        const baseInfo = baseFiles.get(filePath);
        const currentInfo = currentFiles.get(filePath);
        const headInfo = headFiles.get(filePath);
        
        // Simple merge logic
        if (currentInfo?.hash === headInfo?.hash) {
          if (currentInfo) mergedFiles.set(filePath, currentInfo);
          continue;
        }
        
        if (!baseInfo) {
          // File added
          if (currentInfo && headInfo && currentInfo.hash !== headInfo.hash) {
            conflicts.push(filePath);
          }
          if (headInfo) mergedFiles.set(filePath, headInfo);
          else if (currentInfo) mergedFiles.set(filePath, currentInfo);
          continue;
        }
        
        if (currentInfo?.hash === baseInfo.hash) {
          // Only changed in head
          if (headInfo) mergedFiles.set(filePath, headInfo);
          continue;
        }
        
        if (headInfo?.hash === baseInfo.hash) {
          // Only changed in current
          if (currentInfo) mergedFiles.set(filePath, currentInfo);
          continue;
        }
        
        // Both changed - check for actual conflict
        if (currentInfo && headInfo) {
          conflicts.push(filePath);
          mergedFiles.set(filePath, headInfo); // Prefer head on conflict
        } else if (currentInfo) {
          mergedFiles.set(filePath, currentInfo);
        } else if (headInfo) {
          mergedFiles.set(filePath, headInfo);
        }
      }
      
      if (conflicts.length > 0) {
        return { success: false, error: 'Merge conflict', conflicts };
      }
      
      // Build merged tree
      const mergedTreeHash = buildTree(this.repo, mergedFiles);
      
      // Create merge commit
      const mergeCommit = new Commit(
        mergedTreeHash,
        [currentSha, headSha],
        author,
        author,
        message
      );
      
      const sha = this.repo.objects.writeObject(mergeCommit);
      return { success: true, sha };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Merge failed' };
    }
  }

  /**
   * Reassemble commits from multiple PRs into a logical sequence
   */
  async reassembleCommits(
    prAnalyses: PRAnalysis[],
    prHeadShas: Map<string, string>
  ): Promise<MergeQueueResult> {
    // Determine optimal order
    const orderedPrs = await this.determineOptimalOrder(prAnalyses);
    const reassembledCommits: ReassembledCommit[] = [];

    // Get current target branch SHA
    let currentSha = this.repo.refs.resolve(`refs/heads/${this.targetBranch}`);
    if (!currentSha) {
      return {
        success: false,
        errorMessage: `Target branch '${this.targetBranch}' not found`,
        reassembledCommits,
      };
    }

    const author: Author = {
      name: 'Merge Queue',
      email: 'merge-queue@wit.dev',
      timestamp: Math.floor(Date.now() / 1000),
      timezone: getTimezone(),
    };

    let order = 0;

    for (const pr of orderedPrs) {
      const headSha = prHeadShas.get(pr.prId);
      if (!headSha) continue;

      const message = `Merge PR: ${pr.prId}`;
      const result = this.tryMergePR(currentSha, headSha, message, author);

      if (!result.success) {
        return {
          success: false,
          failedPrId: pr.prId,
          errorMessage: result.error || 'Merge failed',
          reassembledCommits,
        };
      }

      reassembledCommits.push({
        originalSha: headSha,
        newSha: result.sha!,
        prId: pr.prId,
        message,
        order: order++,
      });

      currentSha = result.sha!;
    }

    return {
      success: true,
      mergeSha: currentSha,
      reassembledCommits,
    };
  }

  /**
   * Process a batch of PRs with optimistic merging
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
      this.repo.refs.updateBranch(this.targetBranch, mergeSha);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a PR can be fast-forwarded
   */
  canFastForward(headSha: string, baseSha: string): boolean {
    const mergeBase = findMergeBase(this.repo, headSha, baseSha);
    return mergeBase === baseSha;
  }

  /**
   * Rebase a PR's commits onto the current target branch
   */
  async rebasePR(
    headSha: string,
    originalBaseSha: string
  ): Promise<{ success: boolean; newHeadSha?: string; error?: string }> {
    try {
      // Get current target branch SHA
      const targetSha = this.repo.refs.resolve(`refs/heads/${this.targetBranch}`);
      if (!targetSha) {
        return { success: false, error: `Target branch '${this.targetBranch}' not found` };
      }
      
      // Get commits to rebase
      const commits = this.getCommits(originalBaseSha, headSha);
      if (commits.length === 0) {
        return { success: true, newHeadSha: targetSha };
      }
      
      // Rebase each commit
      let currentBase = targetSha;
      
      for (const commitInfo of commits.reverse()) {
        const originalCommit = this.repo.objects.readCommit(commitInfo.sha);
        
        // Get the changes in this commit
        const parentSha = originalCommit.parentHashes[0];
        if (!parentSha) continue;
        
        const parentCommit = this.repo.objects.readCommit(parentSha);
        const parentFiles = flattenTree(this.repo, parentCommit.treeHash, '');
        const commitFiles = flattenTree(this.repo, originalCommit.treeHash, '');
        
        // Apply changes to current base
        const baseCommit = this.repo.objects.readCommit(currentBase);
        const baseFiles = flattenTree(this.repo, baseCommit.treeHash, '');
        
        // Merge the changes
        const newFiles = new Map(baseFiles);
        
        for (const [filePath, info] of commitFiles) {
          const parentInfo = parentFiles.get(filePath);
          if (!parentInfo || parentInfo.hash !== info.hash) {
            // File was changed in this commit
            newFiles.set(filePath, info);
          }
        }
        
        // Handle deletions
        for (const filePath of parentFiles.keys()) {
          if (!commitFiles.has(filePath)) {
            newFiles.delete(filePath);
          }
        }
        
        // Build new tree
        const newTreeHash = buildTree(this.repo, newFiles);
        
        // Create rebased commit
        const rebasedCommit = new Commit(
          newTreeHash,
          [currentBase],
          originalCommit.author,
          originalCommit.committer,
          originalCommit.message
        );
        
        currentBase = this.repo.objects.writeObject(rebasedCommit);
      }
      
      return { success: true, newHeadSha: currentBase };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Rebase failed' };
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
