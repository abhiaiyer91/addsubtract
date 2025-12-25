/**
 * Diff algorithm implementation
 * Uses Myers diff algorithm for computing the shortest edit script
 */

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  isBinary: boolean;
  isNew: boolean;
  isDeleted: boolean;
}

/**
 * Compute the diff between two strings
 */
export function diff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Use LCS-based diff
  const lcs = computeLCS(oldLines, newLines);
  return buildDiffFromLCS(oldLines, newLines, lcs);
}

/**
 * Compute Longest Common Subsequence
 */
function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * Build diff from LCS table
 */
function buildDiffFromLCS(oldLines: string[], newLines: string[], dp: number[][]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  const changes: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      changes.unshift({
        type: 'context',
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      changes.unshift({
        type: 'add',
        content: newLines[j - 1],
        newLineNum: j,
      });
      j--;
    } else if (i > 0) {
      changes.unshift({
        type: 'remove',
        content: oldLines[i - 1],
        oldLineNum: i,
      });
      i--;
    }
  }

  return changes;
}

/**
 * Create unified diff hunks with context
 */
export function createHunks(lines: DiffLine[], contextLines: number = 3): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let contextBuffer: DiffLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.type === 'context') {
      if (currentHunk) {
        // Check if we should end this hunk
        const remainingChanges = hasChangesWithin(lines, i + 1, contextLines);
        
        if (remainingChanges) {
          currentHunk.lines.push(line);
        } else {
          // Add trailing context
          const trailing = lines.slice(i, i + contextLines).filter(l => l.type === 'context');
          currentHunk.lines.push(...trailing);
          updateHunkCounts(currentHunk);
          hunks.push(currentHunk);
          currentHunk = null;
          contextBuffer = [];
        }
      } else {
        contextBuffer.push(line);
        if (contextBuffer.length > contextLines) {
          contextBuffer.shift();
        }
      }
    } else {
      // This is a change
      if (!currentHunk) {
        currentHunk = {
          oldStart: (line.oldLineNum || line.newLineNum || 1) - contextBuffer.length,
          oldCount: 0,
          newStart: (line.newLineNum || line.oldLineNum || 1) - contextBuffer.length,
          newCount: 0,
          lines: [...contextBuffer],
        };
      }
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) {
    updateHunkCounts(currentHunk);
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Check if there are changes within N lines
 */
function hasChangesWithin(lines: DiffLine[], start: number, count: number): boolean {
  for (let i = start; i < Math.min(start + count, lines.length); i++) {
    if (lines[i].type !== 'context') {
      return true;
    }
  }
  return false;
}

/**
 * Update hunk line counts
 */
function updateHunkCounts(hunk: DiffHunk): void {
  hunk.oldCount = hunk.lines.filter(l => l.type !== 'add').length;
  hunk.newCount = hunk.lines.filter(l => l.type !== 'remove').length;
}

/**
 * Format diff output as unified diff
 */
export function formatUnifiedDiff(fileDiff: FileDiff): string {
  const lines: string[] = [];

  if (fileDiff.isNew) {
    lines.push(`diff --wit a/${fileDiff.newPath} b/${fileDiff.newPath}`);
    lines.push('new file mode 100644');
    lines.push(`--- /dev/null`);
    lines.push(`+++ b/${fileDiff.newPath}`);
  } else if (fileDiff.isDeleted) {
    lines.push(`diff --wit a/${fileDiff.oldPath} b/${fileDiff.oldPath}`);
    lines.push('deleted file mode 100644');
    lines.push(`--- a/${fileDiff.oldPath}`);
    lines.push(`+++ /dev/null`);
  } else {
    lines.push(`diff --wit a/${fileDiff.oldPath} b/${fileDiff.newPath}`);
    lines.push(`--- a/${fileDiff.oldPath}`);
    lines.push(`+++ b/${fileDiff.newPath}`);
  }

  if (fileDiff.isBinary) {
    lines.push('Binary files differ');
    return lines.join('\n');
  }

  for (const hunk of fileDiff.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
    
    for (const line of hunk.lines) {
      switch (line.type) {
        case 'add':
          lines.push(`+${line.content}`);
          break;
        case 'remove':
          lines.push(`-${line.content}`);
          break;
        case 'context':
          lines.push(` ${line.content}`);
          break;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Check if content appears to be binary
 */
export function isBinary(content: Buffer): boolean {
  // Check for null bytes in the first 8000 bytes
  const checkLength = Math.min(content.length, 8000);
  for (let i = 0; i < checkLength; i++) {
    if (content[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Color codes for terminal output
 */
export const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  reset: '\x1b[0m',
};

/**
 * Format diff with colors for terminal
 */
export function formatColoredDiff(fileDiff: FileDiff): string {
  const lines: string[] = [];

  lines.push(colors.bold(`diff --wit a/${fileDiff.oldPath} b/${fileDiff.newPath}`));
  
  if (fileDiff.isNew) {
    lines.push(colors.yellow('new file mode 100644'));
  } else if (fileDiff.isDeleted) {
    lines.push(colors.yellow('deleted file mode 100644'));
  }

  lines.push(colors.bold(`--- a/${fileDiff.oldPath}`));
  lines.push(colors.bold(`+++ b/${fileDiff.newPath}`));

  if (fileDiff.isBinary) {
    lines.push(colors.yellow('Binary files differ'));
    return lines.join('\n');
  }

  for (const hunk of fileDiff.hunks) {
    lines.push(colors.cyan(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`));
    
    for (const line of hunk.lines) {
      switch (line.type) {
        case 'add':
          lines.push(colors.green(`+${line.content}`));
          break;
        case 'remove':
          lines.push(colors.red(`-${line.content}`));
          break;
        case 'context':
          lines.push(` ${line.content}`);
          break;
      }
    }
  }

  return lines.join('\n');
}
