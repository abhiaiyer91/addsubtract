/**
 * Conflict detection and resolution helpers
 * 
 * Provides utilities for detecting and extracting merge conflict information
 * from bare repositories using temporary worktrees.
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { exists } from '../../utils/fs';

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
 * Execute a git command in a repository
 */
function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    },
  }).trim();
}

/**
 * Get detailed conflict information for a merge between two branches
 * 
 * Creates a temporary worktree, attempts the merge, and extracts conflict details.
 */
export async function getConflictDetails(
  repoPath: string,
  sourceBranch: string,
  targetBranch: string
): Promise<ConflictDetailsResult> {
  if (!exists(repoPath)) {
    return { hasConflicts: false, conflicts: [], error: 'Repository not found' };
  }

  const worktreePath = path.join(repoPath, '..', `.conflict-check-${Date.now()}`);

  try {
    // Get SHAs for branches
    let sourceSha: string;
    let targetSha: string;
    let mergeBaseSha: string;

    try {
      sourceSha = git(`rev-parse refs/heads/${sourceBranch}`, repoPath);
    } catch {
      return { hasConflicts: false, conflicts: [], error: `Source branch '${sourceBranch}' not found` };
    }

    try {
      targetSha = git(`rev-parse refs/heads/${targetBranch}`, repoPath);
    } catch {
      return { hasConflicts: false, conflicts: [], error: `Target branch '${targetBranch}' not found` };
    }

    // Get merge base
    try {
      mergeBaseSha = git(`merge-base ${sourceSha} ${targetSha}`, repoPath);
    } catch {
      mergeBaseSha = '';
    }

    // Check if already up to date
    if (sourceSha === targetSha) {
      return { hasConflicts: false, conflicts: [] };
    }

    // Check for fast-forward
    try {
      git(`merge-base --is-ancestor ${sourceSha} ${targetSha}`, repoPath);
      // Source is ancestor of target - already merged
      return { hasConflicts: false, conflicts: [] };
    } catch {
      // Not an ancestor, continue
    }

    try {
      git(`merge-base --is-ancestor ${targetSha} ${sourceSha}`, repoPath);
      // Fast-forward possible - no conflicts
      return { hasConflicts: false, conflicts: [] };
    } catch {
      // Not fast-forward, continue
    }

    // Create worktree for conflict detection
    git(`worktree add "${worktreePath}" ${targetBranch}`, repoPath);

    try {
      // Attempt the merge
      try {
        execSync(`git merge --no-commit ${sourceBranch}`, {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // Merge succeeded without conflicts
        git('merge --abort', worktreePath);
        return { hasConflicts: false, conflicts: [] };
      } catch {
        // Merge has conflicts - extract them
      }

      // Get list of conflicted files
      let conflictedFiles: string[];
      try {
        const output = git('diff --name-only --diff-filter=U', worktreePath);
        conflictedFiles = output.split('\n').filter(f => f);
      } catch {
        conflictedFiles = [];
      }

      if (conflictedFiles.length === 0) {
        // No conflicts detected
        try { git('merge --abort', worktreePath); } catch { }
        return { hasConflicts: false, conflicts: [] };
      }

      // Extract conflict details for each file
      const conflicts: ConflictInfo[] = [];

      for (const filePath of conflictedFiles) {
        const fullPath = path.join(worktreePath, filePath);
        
        let conflictMarkers = '';
        try {
          conflictMarkers = fs.readFileSync(fullPath, 'utf-8');
        } catch {
          continue;
        }

        // Get ours version (target branch)
        let oursContent = '';
        try {
          oursContent = git(`show :2:${filePath}`, worktreePath);
        } catch {
          try {
            oursContent = git(`show ${targetSha}:${filePath}`, repoPath);
          } catch { }
        }

        // Get theirs version (source branch)
        let theirsContent = '';
        try {
          theirsContent = git(`show :3:${filePath}`, worktreePath);
        } catch {
          try {
            theirsContent = git(`show ${sourceSha}:${filePath}`, repoPath);
          } catch { }
        }

        // Get base version
        let baseContent: string | null = null;
        if (mergeBaseSha) {
          try {
            baseContent = git(`show :1:${filePath}`, worktreePath);
          } catch {
            try {
              baseContent = git(`show ${mergeBaseSha}:${filePath}`, repoPath);
            } catch { }
          }
        }

        conflicts.push({
          filePath,
          oursContent,
          theirsContent,
          baseContent,
          conflictMarkers,
        });
      }

      // Abort the merge
      try { git('merge --abort', worktreePath); } catch { }

      return {
        hasConflicts: conflicts.length > 0,
        conflicts,
      };

    } finally {
      // Clean up worktree
      try {
        git(`worktree remove "${worktreePath}" --force`, repoPath);
      } catch {
        try {
          execSync(`rm -rf "${worktreePath}"`, { encoding: 'utf-8' });
          git('worktree prune', repoPath);
        } catch { }
      }
    }

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
