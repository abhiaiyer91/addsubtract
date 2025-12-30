/**
 * Server-side merge operations for bare repositories
 * 
 * Performs actual merges on bare repositories (no working directory).
 * This is the critical piece that makes PRs actually work - without this,
 * merging a PR only updates the database, not the refs.
 * 
 * Uses wit's TypeScript API for all git operations.
 */

import { BareRepository } from './repos';
import { exists } from '../../utils/fs';
import { Commit, Tree, Blob } from '../../core/object';
import { Author, TreeEntry } from '../../core/types';
import { diff } from '../../core/diff';

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
 * Find merge base between two commits by walking ancestry
 */
function findMergeBase(repo: BareRepository, sha1: string, sha2: string): string | null {
  // Collect all ancestors of sha1
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
      // Ignore missing commits
    }
  }
  
  // Walk sha2's ancestors and find first one in sha1's ancestors
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
      // Ignore missing commits
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
      // Ignore missing commits
    }
  }
  
  return false;
}

/**
 * Count commits between two SHAs
 */
function countCommits(repo: BareRepository, fromSha: string, toSha: string): number {
  let count = 0;
  const visited = new Set<string>();
  const queue = [toSha];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === fromSha) continue;
    if (visited.has(current)) continue;
    visited.add(current);
    count++;
    
    try {
      const commit = repo.objects.readCommit(current);
      for (const parent of commit.parentHashes) {
        if (parent !== fromSha) {
          queue.push(parent);
        }
      }
    } catch {
      // Ignore missing commits
    }
  }
  
  return count;
}

/**
 * Check if a merge would have conflicts using wit's TS API
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
    const repo = new BareRepository(repoPath);
    
    // Get the SHAs for both branches
    const sourceSha = repo.refs.resolve(`refs/heads/${sourceBranch}`);
    const targetSha = repo.refs.resolve(`refs/heads/${targetBranch}`);
    
    if (!sourceSha) {
      throw new MergeError(`Source branch '${sourceBranch}' not found`, 'BRANCH_NOT_FOUND');
    }
    
    if (!targetSha) {
      throw new MergeError(`Target branch '${targetBranch}' not found`, 'BRANCH_NOT_FOUND');
    }

    // Find merge base
    const mergeBase = findMergeBase(repo, sourceSha, targetSha);

    // Check ahead/behind counts
    let aheadBy = 0;
    let behindBy = 0;
    
    if (mergeBase) {
      aheadBy = countCommits(repo, mergeBase, sourceSha);
      behindBy = countCommits(repo, mergeBase, targetSha);
    }

    // Check if already up to date
    if (sourceSha === targetSha || sourceSha === mergeBase) {
      return { canMerge: true, conflicts: [], behindBy: 0, aheadBy: 0 };
    }

    // Check for conflicts by comparing trees
    if (mergeBase) {
      const baseCommit = repo.objects.readCommit(mergeBase);
      const sourceCommit = repo.objects.readCommit(sourceSha);
      const targetCommit = repo.objects.readCommit(targetSha);
      
      const baseFiles = flattenTree(repo, baseCommit.treeHash, '');
      const sourceFiles = flattenTree(repo, sourceCommit.treeHash, '');
      const targetFiles = flattenTree(repo, targetCommit.treeHash, '');
      
      const conflicts: string[] = [];
      
      // Check each file modified in source
      for (const [filePath, sourceInfo] of sourceFiles) {
        const baseInfo = baseFiles.get(filePath);
        const targetInfo = targetFiles.get(filePath);
        
        // If file changed in both branches from base
        if (baseInfo && targetInfo && 
            baseInfo.hash !== sourceInfo.hash && 
            baseInfo.hash !== targetInfo.hash &&
            sourceInfo.hash !== targetInfo.hash) {
          // Both modified the same file differently - potential conflict
          // Check if content actually conflicts
          try {
            const baseBlob = repo.objects.readBlob(baseInfo.hash);
            const sourceBlob = repo.objects.readBlob(sourceInfo.hash);
            const targetBlob = repo.objects.readBlob(targetInfo.hash);
            
            const baseContent = baseBlob.content.toString('utf-8');
            const sourceContent = sourceBlob.content.toString('utf-8');
            const targetContent = targetBlob.content.toString('utf-8');
            
            // Simple conflict detection: if same lines modified differently
            const sourceDiff = diff(baseContent, sourceContent);
            const targetDiff = diff(baseContent, targetContent);
            
            // Check for overlapping changes
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
            for (const lineNum of sourceChangedLines) {
              if (targetChangedLines.has(lineNum)) {
                conflicts.push(filePath);
                break;
              }
            }
          } catch {
            // If we can't read blobs, assume potential conflict
            conflicts.push(filePath);
          }
        }
      }
      
      if (conflicts.length > 0) {
        return { canMerge: false, conflicts, behindBy, aheadBy };
      }
    }

    return { canMerge: true, conflicts: [], behindBy, aheadBy };
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
 * Build a tree from a flat file map
 */
function buildTree(repo: BareRepository, files: Map<string, { hash: string; mode: string }>): string {
  // Group files by directory
  const dirs = new Map<string, TreeEntry[]>();
  dirs.set('', []);
  
  for (const [filePath, info] of files) {
    const parts = filePath.split('/');
    const fileName = parts.pop()!;
    const dirPath = parts.join('/');
    
    // Ensure parent directories exist
    let currentPath = '';
    for (const part of parts) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!dirs.has(currentPath)) {
        dirs.set(currentPath, []);
        // Add directory entry to parent
        const parentEntries = dirs.get(parentPath)!;
        if (!parentEntries.some(e => e.name === part && e.mode === '40000')) {
          parentEntries.push({ name: part, mode: '40000', hash: '' }); // Hash filled later
        }
      }
    }
    
    // Add file entry
    const dirEntries = dirs.get(dirPath) || [];
    if (!dirs.has(dirPath)) {
      dirs.set(dirPath, dirEntries);
    }
    dirEntries.push({ name: fileName, mode: info.mode, hash: info.hash });
  }
  
  // Build trees bottom-up
  const sortedPaths = Array.from(dirs.keys()).sort((a, b) => b.split('/').length - a.split('/').length);
  const treeHashes = new Map<string, string>();
  
  for (const dirPath of sortedPaths) {
    const entries = dirs.get(dirPath)!;
    
    // Update directory hashes
    for (const entry of entries) {
      if (entry.mode === '40000') {
        const childPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
        entry.hash = treeHashes.get(childPath)!;
      }
    }
    
    // Sort entries (directories first, then by name)
    entries.sort((a, b) => {
      if (a.mode === '40000' && b.mode !== '40000') return -1;
      if (a.mode !== '40000' && b.mode === '40000') return 1;
      return a.name.localeCompare(b.name);
    });
    
    // Write tree object
    const tree = new Tree(entries.filter(e => e.hash));
    const hash = repo.objects.writeObject(tree);
    treeHashes.set(dirPath, hash);
  }
  
  return treeHashes.get('')!;
}

/**
 * Perform a three-way merge of file contents
 */
function mergeFileContents(
  baseContent: string,
  sourceContent: string,
  targetContent: string
): { merged: string; hasConflicts: boolean } {
  // Simple line-based merge  
  const sourceDiff = diff(baseContent, sourceContent);
  const targetDiff = diff(baseContent, targetContent);
  
  // Find changed line ranges
  const sourceChanges = new Map<number, { type: string; content: string }>();
  const targetChanges = new Map<number, { type: string; content: string }>();
  
  let oldLine = 1;
  for (const line of sourceDiff) {
    if (line.type === 'remove') {
      sourceChanges.set(oldLine, { type: 'remove', content: line.content });
      oldLine++;
    } else if (line.type === 'add') {
      sourceChanges.set(oldLine, { type: 'add', content: line.content });
    } else {
      oldLine++;
    }
  }
  
  oldLine = 1;
  for (const line of targetDiff) {
    if (line.type === 'remove') {
      targetChanges.set(oldLine, { type: 'remove', content: line.content });
      oldLine++;
    } else if (line.type === 'add') {
      targetChanges.set(oldLine, { type: 'add', content: line.content });
    } else {
      oldLine++;
    }
  }
  
  // Check for overlapping changes
  let hasConflicts = false;
  for (const lineNum of sourceChanges.keys()) {
    if (targetChanges.has(lineNum)) {
      const sourceChange = sourceChanges.get(lineNum)!;
      const targetChange = targetChanges.get(lineNum)!;
      if (sourceChange.content !== targetChange.content) {
        hasConflicts = true;
        break;
      }
    }
  }
  
  if (hasConflicts) {
    // Return with conflict markers
    return {
      merged: `<<<<<<< TARGET\n${targetContent}\n=======\n${sourceContent}\n>>>>>>> SOURCE`,
      hasConflicts: true,
    };
  }
  
  // Apply non-conflicting changes (prefer source changes)
  // For simplicity, if source changed a file, use source version
  // If only target changed, use target version
  if (sourceChanges.size > 0) {
    return { merged: sourceContent, hasConflicts: false };
  }
  return { merged: targetContent, hasConflicts: false };
}

/**
 * Perform a merge in a bare repository using wit's TS API
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
  
  try {
    const repo = new BareRepository(repoPath);
    
    // Resolve branch refs to SHAs
    const sourceSha = repo.refs.resolve(`refs/heads/${sourceBranch}`);
    const targetSha = repo.refs.resolve(`refs/heads/${targetBranch}`);
    
    if (!sourceSha) {
      return { success: false, error: `Source branch '${sourceBranch}' not found` };
    }
    
    if (!targetSha) {
      return { success: false, error: `Target branch '${targetBranch}' not found` };
    }

    // Check if already merged (source is ancestor of target)
    if (isAncestor(repo, sourceSha, targetSha)) {
      return { success: true, mergeSha: targetSha };
    }

    // Check for fast-forward possibility
    const isFastForward = isAncestor(repo, targetSha, sourceSha);

    // Fast-forward merge (just update the ref)
    if (isFastForward && strategy === 'merge') {
      repo.refs.updateBranch(targetBranch, sourceSha);
      return { success: true, mergeSha: sourceSha };
    }

    // Find merge base
    const mergeBase = findMergeBase(repo, sourceSha, targetSha);
    if (!mergeBase) {
      return { success: false, error: 'No common ancestor found' };
    }

    // Get trees
    const baseCommit = repo.objects.readCommit(mergeBase);
    const sourceCommit = repo.objects.readCommit(sourceSha);
    const targetCommit = repo.objects.readCommit(targetSha);
    
    const baseFiles = flattenTree(repo, baseCommit.treeHash, '');
    const sourceFiles = flattenTree(repo, sourceCommit.treeHash, '');
    const targetFiles = flattenTree(repo, targetCommit.treeHash, '');
    
    // Three-way merge
    const mergedFiles = new Map<string, { hash: string; mode: string }>();
    const conflicts: string[] = [];
    
    // Collect all file paths
    const allPaths = new Set([...baseFiles.keys(), ...sourceFiles.keys(), ...targetFiles.keys()]);
    
    for (const filePath of allPaths) {
      const baseInfo = baseFiles.get(filePath);
      const sourceInfo = sourceFiles.get(filePath);
      const targetInfo = targetFiles.get(filePath);
      
      // File deleted in source
      if (!sourceInfo && baseInfo && targetInfo?.hash === baseInfo.hash) {
        continue; // Accept deletion
      }
      
      // File deleted in target
      if (!targetInfo && baseInfo && sourceInfo?.hash === baseInfo.hash) {
        continue; // Accept deletion
      }
      
      // File only in source (added)
      if (sourceInfo && !baseInfo && !targetInfo) {
        mergedFiles.set(filePath, sourceInfo);
        continue;
      }
      
      // File only in target (added)
      if (targetInfo && !baseInfo && !sourceInfo) {
        mergedFiles.set(filePath, targetInfo);
        continue;
      }
      
      // File unchanged in source
      if (sourceInfo && baseInfo && sourceInfo.hash === baseInfo.hash) {
        if (targetInfo) {
          mergedFiles.set(filePath, targetInfo);
        }
        continue;
      }
      
      // File unchanged in target
      if (targetInfo && baseInfo && targetInfo.hash === baseInfo.hash) {
        if (sourceInfo) {
          mergedFiles.set(filePath, sourceInfo);
        }
        continue;
      }
      
      // File changed in both - need to merge contents
      if (sourceInfo && targetInfo && baseInfo) {
        if (sourceInfo.hash === targetInfo.hash) {
          // Same change in both
          mergedFiles.set(filePath, sourceInfo);
          continue;
        }
        
        // Different changes - try to merge
        try {
          const baseBlob = repo.objects.readBlob(baseInfo.hash);
          const sourceBlob = repo.objects.readBlob(sourceInfo.hash);
          const targetBlob = repo.objects.readBlob(targetInfo.hash);
          
          const baseContent = baseBlob.content.toString('utf-8');
          const sourceContent = sourceBlob.content.toString('utf-8');
          const targetContent = targetBlob.content.toString('utf-8');
          
          const mergeResult = mergeFileContents(baseContent, sourceContent, targetContent);
          
          if (mergeResult.hasConflicts) {
            conflicts.push(filePath);
            // Still add the conflicted content
            const mergedBlob = new Blob(Buffer.from(mergeResult.merged, 'utf-8'));
            const mergedHash = repo.objects.writeObject(mergedBlob);
            mergedFiles.set(filePath, { hash: mergedHash, mode: sourceInfo.mode });
          } else {
            const mergedBlob = new Blob(Buffer.from(mergeResult.merged, 'utf-8'));
            const mergedHash = repo.objects.writeObject(mergedBlob);
            mergedFiles.set(filePath, { hash: mergedHash, mode: sourceInfo.mode });
          }
        } catch {
          conflicts.push(filePath);
          mergedFiles.set(filePath, sourceInfo); // Prefer source on error
        }
        continue;
      }
      
      // Default: keep target if exists, otherwise source
      if (targetInfo) {
        mergedFiles.set(filePath, targetInfo);
      } else if (sourceInfo) {
        mergedFiles.set(filePath, sourceInfo);
      }
    }
    
    if (conflicts.length > 0) {
      return { success: false, error: 'Merge conflict detected', conflicts };
    }
    
    // Build merged tree
    const mergedTreeHash = buildTree(repo, mergedFiles);
    
    // Create merge commit
    const author: Author = {
      name: options.authorName,
      email: options.authorEmail,
      timestamp: Math.floor(Date.now() / 1000),
      timezone: getTimezone(),
    };
    
    const message = options.message || `Merge branch '${sourceBranch}' into ${targetBranch}`;
    
    let mergeCommit: Commit;
    if (strategy === 'squash') {
      // Squash: single parent (target)
      mergeCommit = new Commit(
        mergedTreeHash,
        [targetSha],
        author,
        author,
        options.message || `${message}\n\nSquash merge of '${sourceBranch}' into ${targetBranch}`
      );
    } else {
      // Regular merge: two parents
      mergeCommit = new Commit(
        mergedTreeHash,
        [targetSha, sourceSha],
        author,
        author,
        message
      );
    }
    
    const mergeSha = repo.objects.writeObject(mergeCommit);
    
    // Update target branch
    repo.refs.updateBranch(targetBranch, mergeSha);
    
    return { success: true, mergeSha };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMsg.includes('CONFLICT') || errorMsg.includes('conflict')) {
      return { success: false, error: 'Merge conflict detected', conflicts: [] };
    }
    
    return { success: false, error: `Merge failed: ${errorMsg}` };
  }
}

/**
 * Get current timezone offset string
 */
function getTimezone(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return `${sign}${hours}${minutes}`;
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
