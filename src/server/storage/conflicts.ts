/**
 * Conflict detection and resolution helpers
 * 
 * Provides utilities for detecting and extracting merge conflict information
 * from bare repositories using wit's TypeScript API.
 */

import { BareRepository } from './repos';
import { exists } from '../../utils/fs';
import { diff } from '../../core/diff';

/**
 * Information about a single conflict in a file
 */
export interface ConflictInfo {
  filePath: string;
  oursContent: string;
  theirsContent: string;
  baseContent: string | null;
  conflictMarkers: string;
}

/**
 * Result from getting conflict details
 */
export interface ConflictDetailsResult {
  hasConflicts: boolean;
  conflicts: ConflictInfo[];
  error?: string;
}

/**
 * Flatten a tree into a map of path -> hash
 */
function flattenTree(repo: BareRepository, treeHash: string, prefix: string): Map<string, string> {
  const result = new Map<string, string>();
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.mode === '40000') {
      const subTree = flattenTree(repo, entry.hash, fullPath);
      for (const [path, hash] of subTree) {
        result.set(path, hash);
      }
    } else {
      result.set(fullPath, entry.hash);
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
 * Check if sha1 is an ancestor of sha2
 */
function isAncestor(repo: BareRepository, sha1: string, sha2: string): boolean {
  const visited = new Set<string>();
  const queue = [sha2];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sha1) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    
    try {
      const commit = repo.objects.readCommit(current);
      for (const parent of commit.parentHashes) {
        queue.push(parent);
      }
    } catch {
      break;
    }
  }
  
  return false;
}

/**
 * Get detailed conflict information for a merge between two branches
 * using wit's TypeScript API
 */
export async function getConflictDetails(
  repoPath: string,
  sourceBranch: string,
  targetBranch: string
): Promise<ConflictDetailsResult> {
  if (!exists(repoPath)) {
    return { hasConflicts: false, conflicts: [], error: 'Repository not found' };
  }

  try {
    const repo = new BareRepository(repoPath);
    
    // Get SHAs for branches
    const sourceSha = repo.refs.resolve(`refs/heads/${sourceBranch}`);
    const targetSha = repo.refs.resolve(`refs/heads/${targetBranch}`);

    if (!sourceSha) {
      return { hasConflicts: false, conflicts: [], error: `Source branch '${sourceBranch}' not found` };
    }

    if (!targetSha) {
      return { hasConflicts: false, conflicts: [], error: `Target branch '${targetBranch}' not found` };
    }

    // Check if already up to date
    if (sourceSha === targetSha) {
      return { hasConflicts: false, conflicts: [] };
    }

    // Check for fast-forward
    if (isAncestor(repo, sourceSha, targetSha)) {
      // Source is ancestor of target - already merged
      return { hasConflicts: false, conflicts: [] };
    }

    if (isAncestor(repo, targetSha, sourceSha)) {
      // Fast-forward possible - no conflicts
      return { hasConflicts: false, conflicts: [] };
    }

    // Get merge base
    const mergeBaseSha = findMergeBase(repo, sourceSha, targetSha);
    if (!mergeBaseSha) {
      // No common ancestor - could still merge but might have conflicts on all files
      return { hasConflicts: false, conflicts: [] };
    }

    // Get trees
    const baseCommit = repo.objects.readCommit(mergeBaseSha);
    const sourceCommit = repo.objects.readCommit(sourceSha);
    const targetCommit = repo.objects.readCommit(targetSha);
    
    const baseFiles = flattenTree(repo, baseCommit.treeHash, '');
    const sourceFiles = flattenTree(repo, sourceCommit.treeHash, '');
    const targetFiles = flattenTree(repo, targetCommit.treeHash, '');
    
    const conflicts: ConflictInfo[] = [];
    
    // Check each file for conflicts
    for (const [filePath, sourceHash] of sourceFiles) {
      const baseHash = baseFiles.get(filePath);
      const targetHash = targetFiles.get(filePath);
      
      // Skip if not changed in both branches
      if (!baseHash) continue; // New file in source
      if (!targetHash) continue; // Deleted in target
      if (sourceHash === baseHash) continue; // Not changed in source
      if (targetHash === baseHash) continue; // Not changed in target
      if (sourceHash === targetHash) continue; // Same change in both
      
      // Both branches modified this file differently - potential conflict
      try {
        const baseBlob = repo.objects.readBlob(baseHash);
        const sourceBlob = repo.objects.readBlob(sourceHash);
        const targetBlob = repo.objects.readBlob(targetHash);
        
        const baseContent = baseBlob.content.toString('utf-8');
        const sourceContent = sourceBlob.content.toString('utf-8');
        const targetContent = targetBlob.content.toString('utf-8');
        
        // Check for actual line-level conflicts
        const sourceDiff = diff(baseContent, sourceContent);
        const targetDiff = diff(baseContent, targetContent);
        
        const sourceChangedLines = new Set<number>();
        const targetChangedLines = new Set<number>();
        
        for (const line of sourceDiff) {
          if (line.type !== 'context' && line.oldLineNum) {
            sourceChangedLines.add(line.oldLineNum);
          }
        }
        
        for (const line of targetDiff) {
          if (line.type !== 'context' && line.oldLineNum) {
            targetChangedLines.add(line.oldLineNum);
          }
        }
        
        // Check for overlap
        let hasOverlap = false;
        for (const lineNum of sourceChangedLines) {
          if (targetChangedLines.has(lineNum)) {
            hasOverlap = true;
            break;
          }
        }
        
        if (hasOverlap) {
          // Generate conflict markers
          const conflictMarkers = 
            `<<<<<<< ${targetBranch}\n` +
            targetContent +
            `\n=======\n` +
            sourceContent +
            `\n>>>>>>> ${sourceBranch}`;
          
          conflicts.push({
            filePath,
            oursContent: targetContent,
            theirsContent: sourceContent,
            baseContent,
            conflictMarkers,
          });
        }
      } catch {
        // If we can't read blobs, report as potential conflict
        conflicts.push({
          filePath,
          oursContent: '',
          theirsContent: '',
          baseContent: null,
          conflictMarkers: `Binary or unreadable file: ${filePath}`,
        });
      }
    }
    
    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };

  } catch (error) {
    return {
      hasConflicts: false,
      conflicts: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Parse conflict markers from file content
 */
export function parseConflictMarkers(content: string): Array<{
  start: number;
  end: number;
  ours: string;
  theirs: string;
  base?: string;
}> {
  const conflicts: Array<{
    start: number;
    end: number;
    ours: string;
    theirs: string;
    base?: string;
  }> = [];

  const lines = content.split('\n');
  let currentConflict: { start: number; ours: string[]; base?: string[]; theirs: string[]; section: 'ours' | 'base' | 'theirs' } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('<<<<<<<')) {
      currentConflict = { start: i, ours: [], theirs: [], section: 'ours' };
    } else if (currentConflict && line.startsWith('|||||||')) {
      currentConflict.base = [];
      currentConflict.section = 'base';
    } else if (currentConflict && line.startsWith('=======')) {
      currentConflict.section = 'theirs';
    } else if (currentConflict && line.startsWith('>>>>>>>')) {
      conflicts.push({
        start: currentConflict.start,
        end: i,
        ours: currentConflict.ours.join('\n'),
        theirs: currentConflict.theirs.join('\n'),
        base: currentConflict.base?.join('\n'),
      });
      currentConflict = null;
    } else if (currentConflict) {
      if (currentConflict.section === 'ours') {
        currentConflict.ours.push(line);
      } else if (currentConflict.section === 'base' && currentConflict.base) {
        currentConflict.base.push(line);
      } else if (currentConflict.section === 'theirs') {
        currentConflict.theirs.push(line);
      }
    }
  }

  return conflicts;
}
