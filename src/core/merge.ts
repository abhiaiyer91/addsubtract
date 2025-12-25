/**
 * Merge and Conflict Resolution
 * Provides structured merge operations and conflict handling
 */

import * as path from 'path';
import { Repository } from './repository';
import { Commit, Tree, Blob } from './object';
import { TreeEntry } from './types';
import { diff, DiffLine } from './diff';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';
import { TsgitError, ErrorCode } from './errors';

/**
 * Represents a conflict region in a file
 */
export interface ConflictRegion {
  startLine: number;
  endLine: number;
  ours: string[];
  theirs: string[];
  base?: string[];
  context: {
    before: string[];
    after: string[];
  };
}

/**
 * Represents a file with conflicts
 */
export interface FileConflict {
  path: string;
  regions: ConflictRegion[];
  oursContent: string;
  theirsContent: string;
  baseContent?: string;
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  success: boolean;
  conflicts: FileConflict[];
  autoMerged: string[];
  unchanged: string[];
  added: string[];
  deleted: string[];
  mergeCommit?: string;
}

/**
 * Merge state saved to disk during conflict resolution
 */
export interface MergeState {
  inProgress: boolean;
  sourceBranch: string;
  targetBranch: string;
  sourceCommit: string;
  targetCommit: string;
  baseCommit?: string;
  conflicts: FileConflict[];
  resolved: string[];
  startedAt: number;
}

/**
 * Merge options
 */
export interface MergeOptions {
  noCommit?: boolean;        // Don't create merge commit
  noFastForward?: boolean;   // Always create merge commit
  squash?: boolean;          // Squash commits
  message?: string;          // Custom commit message
}

/**
 * Merge manager handles merge operations and conflict resolution
 */
export class MergeManager {
  private mergeStatePath: string;
  private conflictsDir: string;

  constructor(
    private repo: Repository,
    private gitDir: string
  ) {
    this.mergeStatePath = path.join(gitDir, 'MERGE_STATE.json');
    this.conflictsDir = path.join(gitDir, 'conflicts');
  }

  /**
   * Check if a merge is in progress
   */
  isInProgress(): boolean {
    return exists(this.mergeStatePath);
  }

  /**
   * Get current merge state
   */
  getState(): MergeState | null {
    if (!this.isInProgress()) {
      return null;
    }

    try {
      const content = readFile(this.mergeStatePath).toString('utf8');
      return JSON.parse(content) as MergeState;
    } catch {
      return null;
    }
  }

  /**
   * Save merge state
   */
  private saveState(state: MergeState): void {
    mkdirp(this.conflictsDir);
    writeFile(this.mergeStatePath, JSON.stringify(state, null, 2));
  }

  /**
   * Clear merge state
   */
  private clearState(): void {
    if (exists(this.mergeStatePath)) {
      require('fs').unlinkSync(this.mergeStatePath);
    }
  }

  /**
   * Perform a merge
   */
  merge(sourceBranch: string, options: MergeOptions = {}): MergeResult {
    if (this.isInProgress()) {
      throw new TsgitError(
        'A merge is already in progress',
        ErrorCode.MERGE_CONFLICT,
        [
          'wit merge --continue    # Continue after resolving conflicts',
          'wit merge --abort       # Abort the merge',
        ]
      );
    }

    const targetBranch = this.repo.refs.getCurrentBranch();
    if (!targetBranch) {
      throw new TsgitError(
        'Cannot merge in detached HEAD state',
        ErrorCode.DETACHED_HEAD,
        ['wit checkout <branch>    # Switch to a branch first']
      );
    }

    const sourceHash = this.repo.refs.resolve(sourceBranch);
    const targetHash = this.repo.refs.resolve('HEAD');

    if (!sourceHash) {
      throw new TsgitError(
        `Branch '${sourceBranch}' not found`,
        ErrorCode.BRANCH_NOT_FOUND,
        ['wit branch list    # List available branches']
      );
    }

    if (!targetHash) {
      throw new TsgitError(
        'No commits on current branch',
        ErrorCode.NO_COMMITS_YET
      );
    }

    // Find merge base
    const baseHash = this.findMergeBase(sourceHash, targetHash);

    // Check for fast-forward
    if (baseHash === targetHash && !options.noFastForward) {
      return this.fastForwardMerge(sourceBranch, sourceHash);
    }

    // Perform three-way merge
    return this.threeWayMerge(
      sourceBranch,
      targetBranch,
      sourceHash,
      targetHash,
      baseHash,
      options
    );
  }

  /**
   * Find the merge base (common ancestor)
   */
  private findMergeBase(hash1: string, hash2: string): string | undefined {
    const ancestors1 = this.getAncestors(hash1);
    const ancestors2 = this.getAncestors(hash2);

    // Find first common ancestor
    for (const ancestor of ancestors1) {
      if (ancestors2.has(ancestor)) {
        return ancestor;
      }
    }

    return undefined;
  }

  /**
   * Get all ancestors of a commit
   */
  private getAncestors(hash: string): Set<string> {
    const ancestors = new Set<string>();
    const queue = [hash];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (ancestors.has(current)) continue;
      ancestors.add(current);

      try {
        const commit = this.repo.objects.readCommit(current);
        queue.push(...commit.parentHashes);
      } catch {
        // Commit not found, skip
      }
    }

    return ancestors;
  }

  /**
   * Perform a fast-forward merge
   */
  private fastForwardMerge(sourceBranch: string, sourceHash: string): MergeResult {
    const targetBranch = this.repo.refs.getCurrentBranch()!;
    this.repo.refs.updateBranch(targetBranch, sourceHash);
    
    // Update working directory
    this.repo.checkout(targetBranch);

    return {
      success: true,
      conflicts: [],
      autoMerged: [],
      unchanged: [],
      added: [],
      deleted: [],
    };
  }

  /**
   * Perform a three-way merge
   */
  private threeWayMerge(
    sourceBranch: string,
    targetBranch: string,
    sourceHash: string,
    targetHash: string,
    baseHash: string | undefined,
    options: MergeOptions
  ): MergeResult {
    const result: MergeResult = {
      success: true,
      conflicts: [],
      autoMerged: [],
      unchanged: [],
      added: [],
      deleted: [],
    };

    // Get file trees
    const sourceTree = this.getFileTree(sourceHash);
    const targetTree = this.getFileTree(targetHash);
    const baseTree = baseHash ? this.getFileTree(baseHash) : new Map();

    // Get all unique file paths
    const allPaths = new Set([
      ...sourceTree.keys(),
      ...targetTree.keys(),
      ...baseTree.keys(),
    ]);

    // Process each file
    for (const filePath of allPaths) {
      const sourceBlob = sourceTree.get(filePath);
      const targetBlob = targetTree.get(filePath);
      const baseBlob = baseTree.get(filePath);

      const mergeFileResult = this.mergeFile(
        filePath,
        baseBlob,
        targetBlob,
        sourceBlob
      );

      if (mergeFileResult.conflict) {
        result.conflicts.push(mergeFileResult.conflict);
        result.success = false;
      } else if (mergeFileResult.merged) {
        result.autoMerged.push(filePath);
      } else if (mergeFileResult.added) {
        result.added.push(filePath);
      } else if (mergeFileResult.deleted) {
        result.deleted.push(filePath);
      } else {
        result.unchanged.push(filePath);
      }
    }

    // If there are conflicts, save state
    if (!result.success) {
      const state: MergeState = {
        inProgress: true,
        sourceBranch,
        targetBranch,
        sourceCommit: sourceHash,
        targetCommit: targetHash,
        baseCommit: baseHash,
        conflicts: result.conflicts,
        resolved: [],
        startedAt: Date.now(),
      };
      this.saveState(state);
      this.writeConflictFiles(result.conflicts);
    } else if (!options.noCommit) {
      // Create merge commit
      const message = options.message || `Merge branch '${sourceBranch}' into ${targetBranch}`;
      // Note: Would need to extend commit to support multiple parents
    }

    return result;
  }

  /**
   * Get file tree from a commit
   */
  private getFileTree(commitHash: string): Map<string, string> {
    const result = new Map<string, string>();
    const commit = this.repo.objects.readCommit(commitHash);
    this.flattenTree(commit.treeHash, '', result);
    return result;
  }

  /**
   * Flatten a tree into a map of path -> blob hash
   */
  private flattenTree(treeHash: string, prefix: string, result: Map<string, string>): void {
    const tree = this.repo.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      const fullPath = prefix ? prefix + '/' + entry.name : entry.name;

      if (entry.mode === '40000') {
        this.flattenTree(entry.hash, fullPath, result);
      } else {
        result.set(fullPath, entry.hash);
      }
    }
  }

  /**
   * Merge a single file (three-way)
   */
  private mergeFile(
    filePath: string,
    baseHash: string | undefined,
    oursHash: string | undefined,
    theirsHash: string | undefined
  ): {
    conflict?: FileConflict;
    merged?: boolean;
    added?: boolean;
    deleted?: boolean;
  } {
    // Both sides unchanged
    if (oursHash === theirsHash) {
      return {};
    }

    // File added in theirs
    if (!oursHash && !baseHash && theirsHash) {
      return { added: true };
    }

    // File added in ours
    if (oursHash && !baseHash && !theirsHash) {
      return {};
    }

    // File deleted in theirs
    if (oursHash && baseHash && !theirsHash) {
      if (oursHash === baseHash) {
        return { deleted: true };
      }
      // Modified in ours, deleted in theirs - conflict
    }

    // File deleted in ours
    if (!oursHash && baseHash && theirsHash) {
      if (theirsHash === baseHash) {
        return {};
      }
      // Deleted in ours, modified in theirs - conflict
    }

    // Both sides modified
    if (oursHash && theirsHash && oursHash !== theirsHash) {
      // Try to auto-merge
      const oursContent = this.repo.objects.readBlob(oursHash).toString();
      const theirsContent = this.repo.objects.readBlob(theirsHash).toString();
      const baseContent = baseHash 
        ? this.repo.objects.readBlob(baseHash).toString() 
        : '';

      const mergeResult = this.mergeContent(baseContent, oursContent, theirsContent);

      if (mergeResult.hasConflicts) {
        return {
          conflict: {
            path: filePath,
            regions: mergeResult.conflicts,
            oursContent,
            theirsContent,
            baseContent: baseHash ? baseContent : undefined,
          },
        };
      }

      return { merged: true };
    }

    return {};
  }

  /**
   * Merge file content (line by line)
   */
  private mergeContent(
    base: string,
    ours: string,
    theirs: string
  ): { hasConflicts: boolean; content: string; conflicts: ConflictRegion[] } {
    const baseLines = base.split('\n');
    const oursLines = ours.split('\n');
    const theirsLines = theirs.split('\n');

    const conflicts: ConflictRegion[] = [];
    const result: string[] = [];

    // Simple line-by-line merge
    // In a real implementation, this would use a proper 3-way merge algorithm
    const maxLines = Math.max(baseLines.length, oursLines.length, theirsLines.length);

    for (let i = 0; i < maxLines; i++) {
      const baseLine = baseLines[i];
      const oursLine = oursLines[i];
      const theirsLine = theirsLines[i];

      if (oursLine === theirsLine) {
        // Both sides agree
        if (oursLine !== undefined) {
          result.push(oursLine);
        }
      } else if (oursLine === baseLine) {
        // Ours unchanged, take theirs
        if (theirsLine !== undefined) {
          result.push(theirsLine);
        }
      } else if (theirsLine === baseLine) {
        // Theirs unchanged, take ours
        if (oursLine !== undefined) {
          result.push(oursLine);
        }
      } else {
        // Conflict!
        conflicts.push({
          startLine: i + 1,
          endLine: i + 1,
          ours: oursLine !== undefined ? [oursLine] : [],
          theirs: theirsLine !== undefined ? [theirsLine] : [],
          base: baseLine !== undefined ? [baseLine] : undefined,
          context: {
            before: result.slice(-3),
            after: [],
          },
        });
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      content: result.join('\n'),
      conflicts,
    };
  }

  /**
   * Write conflict files for resolution
   */
  private writeConflictFiles(conflicts: FileConflict[]): void {
    mkdirp(this.conflictsDir);

    for (const conflict of conflicts) {
      // Write ours version
      const oursPath = path.join(this.conflictsDir, conflict.path + '.ours');
      mkdirp(path.dirname(oursPath));
      writeFile(oursPath, conflict.oursContent);

      // Write theirs version
      const theirsPath = path.join(this.conflictsDir, conflict.path + '.theirs');
      writeFile(theirsPath, conflict.theirsContent);

      // Write base version if available
      if (conflict.baseContent) {
        const basePath = path.join(this.conflictsDir, conflict.path + '.base');
        writeFile(basePath, conflict.baseContent);
      }

      // Write conflict manifest
      const manifestPath = path.join(this.conflictsDir, conflict.path + '.conflict.json');
      writeFile(manifestPath, JSON.stringify(conflict, null, 2));
    }
  }

  /**
   * Mark a file as resolved
   */
  resolveFile(filePath: string): void {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No merge in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    if (!state.resolved.includes(filePath)) {
      state.resolved.push(filePath);
      this.saveState(state);
    }
  }

  /**
   * Get unresolved conflicts
   */
  getUnresolvedConflicts(): FileConflict[] {
    const state = this.getState();
    if (!state) {
      return [];
    }

    return state.conflicts.filter(c => !state.resolved.includes(c.path));
  }

  /**
   * Abort the merge
   */
  abort(): void {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No merge in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Restore to target commit
    this.repo.checkout(state.targetBranch);
    this.clearState();
  }

  /**
   * Continue merge after resolving conflicts
   */
  continue(message?: string): string {
    const state = this.getState();
    if (!state) {
      throw new TsgitError(
        'No merge in progress',
        ErrorCode.OPERATION_FAILED
      );
    }

    const unresolved = this.getUnresolvedConflicts();
    if (unresolved.length > 0) {
      throw new TsgitError(
        `${unresolved.length} conflict(s) still unresolved`,
        ErrorCode.MERGE_CONFLICT,
        unresolved.slice(0, 3).map(c => `  ${c.path}`)
      );
    }

    // Create merge commit
    const commitMessage = message || 
      `Merge branch '${state.sourceBranch}' into ${state.targetBranch}`;
    
    const commitHash = this.repo.commit(commitMessage);
    this.clearState();

    return commitHash;
  }
}

/**
 * Format conflict for display
 */
export function formatConflict(conflict: FileConflict): string {
  let output = `Conflict in: ${conflict.path}\n`;
  output += `  ${conflict.regions.length} conflict region(s)\n`;

  for (let i = 0; i < conflict.regions.length; i++) {
    const region = conflict.regions[i];
    output += `\n  Region ${i + 1} (line ${region.startLine}):\n`;
    output += `    Ours:   ${region.ours.join(' | ')}\n`;
    output += `    Theirs: ${region.theirs.join(' | ')}\n`;
  }

  return output;
}

/**
 * Format merge result for display
 */
export function formatMergeResult(result: MergeResult): string {
  if (result.success) {
    let output = 'Merge completed successfully!\n\n';
    
    if (result.autoMerged.length > 0) {
      output += `Auto-merged: ${result.autoMerged.length} file(s)\n`;
    }
    if (result.added.length > 0) {
      output += `Added: ${result.added.length} file(s)\n`;
    }
    if (result.deleted.length > 0) {
      output += `Deleted: ${result.deleted.length} file(s)\n`;
    }
    
    return output;
  }

  let output = `Merge failed with ${result.conflicts.length} conflict(s):\n\n`;
  
  for (const conflict of result.conflicts) {
    output += `  ${conflict.path}\n`;
  }

  output += '\nResolve conflicts and run:\n';
  output += '  wit merge --continue\n\n';
  output += 'Or abort with:\n';
  output += '  wit merge --abort\n';

  return output;
}
