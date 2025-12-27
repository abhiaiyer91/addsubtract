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
  isRename: boolean;
  similarity?: number; // 0-100% for renames
}

/**
 * Rename detection candidate
 */
export interface RenameCandidate {
  oldPath: string;
  newPath: string;
  similarity: number; // 0-100%
}

/**
 * Options for rename detection
 */
export interface RenameDetectionOptions {
  threshold?: number; // Minimum similarity percentage (default: 50)
  maxCandidates?: number; // Max files to compare for performance (default: 1000)
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

  if (fileDiff.isRename) {
    lines.push(`diff --wit a/${fileDiff.oldPath} b/${fileDiff.newPath}`);
    lines.push(`similarity index ${fileDiff.similarity}%`);
    lines.push(`rename from ${fileDiff.oldPath}`);
    lines.push(`rename to ${fileDiff.newPath}`);
    lines.push(`--- a/${fileDiff.oldPath}`);
    lines.push(`+++ b/${fileDiff.newPath}`);
  } else if (fileDiff.isNew) {
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
 * Calculate content similarity between two strings
 * Uses LCS (Longest Common Subsequence) based approach
 * Returns percentage (0-100)
 */
export function calculateContentSimilarity(oldContent: string, newContent: string): number {
  if (oldContent === newContent) return 100;
  if (!oldContent && !newContent) return 100;
  if (!oldContent || !newContent) return 0;

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Use LCS to find common lines
  const lcsLength = computeLCSLength(oldLines, newLines);
  const maxLength = Math.max(oldLines.length, newLines.length);

  if (maxLength === 0) return 100;

  return Math.round((lcsLength / maxLength) * 100);
}

/**
 * Compute LCS length efficiently (only need the length, not the actual LCS)
 */
function computeLCSLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;

  // Use two rows instead of full matrix for memory efficiency
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Calculate filename similarity using Levenshtein distance
 * Returns percentage (0-100)
 */
export function calculateFilenameSimilarity(oldPath: string, newPath: string): number {
  // Extract just the filename without directory
  const oldName = oldPath.split('/').pop() || '';
  const newName = newPath.split('/').pop() || '';

  if (oldName === newName) return 100;

  const distance = levenshteinDistance(oldName, newName);
  const maxLength = Math.max(oldName.length, newName.length);

  if (maxLength === 0) return 100;

  return Math.round(((maxLength - distance) / maxLength) * 100);
}

/**
 * Compute Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use two rows for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Quick hash for content to enable fast pre-filtering
 * Files with very different sizes can be quickly eliminated
 */
function contentFingerprint(content: string): { lineCount: number; charCount: number; hash: number } {
  const lines = content.split('\n');
  let hash = 0;
  
  // Simple hash based on first/last lines and line count
  const sampleLines = [
    lines[0] || '',
    lines[Math.floor(lines.length / 2)] || '',
    lines[lines.length - 1] || '',
  ];
  
  for (const line of sampleLines) {
    for (let i = 0; i < line.length; i++) {
      hash = ((hash << 5) - hash) + line.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
  }

  return {
    lineCount: lines.length,
    charCount: content.length,
    hash,
  };
}

/**
 * Detect renamed files by comparing deleted and added files
 * Uses optimizations to avoid N*M full comparisons:
 * 1. Pre-filter by file extension
 * 2. Pre-filter by size similarity
 * 3. Only do full comparison for candidates that pass filters
 */
export function detectRenames(
  deletedFiles: { path: string; content: string }[],
  addedFiles: { path: string; content: string }[],
  options: RenameDetectionOptions = {}
): RenameCandidate[] {
  const threshold = options.threshold ?? 50;
  const maxCandidates = options.maxCandidates ?? 1000;

  // Early exit if no candidates
  if (deletedFiles.length === 0 || addedFiles.length === 0) {
    return [];
  }

  // Limit candidates for performance
  const limitedDeleted = deletedFiles.slice(0, maxCandidates);
  const limitedAdded = addedFiles.slice(0, maxCandidates);

  // Pre-compute fingerprints for all files
  const deletedFingerprints = limitedDeleted.map(f => ({
    ...f,
    ext: f.path.split('.').pop()?.toLowerCase() || '',
    fingerprint: contentFingerprint(f.content),
  }));

  const addedFingerprints = limitedAdded.map(f => ({
    ...f,
    ext: f.path.split('.').pop()?.toLowerCase() || '',
    fingerprint: contentFingerprint(f.content),
  }));

  const candidates: RenameCandidate[] = [];
  const usedDeleted = new Set<string>();
  const usedAdded = new Set<string>();

  // Group by extension for faster matching
  const addedByExt = new Map<string, typeof addedFingerprints>();
  for (const added of addedFingerprints) {
    const existing = addedByExt.get(added.ext) || [];
    existing.push(added);
    addedByExt.set(added.ext, existing);
  }

  // Find potential matches
  const potentialMatches: {
    deleted: typeof deletedFingerprints[0];
    added: typeof addedFingerprints[0];
    estimatedSimilarity: number;
  }[] = [];

  for (const deleted of deletedFingerprints) {
    // First, try same extension
    const sameExtAdded = addedByExt.get(deleted.ext) || [];
    
    // Also consider all files (for extension changes like .js -> .ts)
    const allAdded = addedFingerprints;

    const candidateAdded = deleted.ext ? sameExtAdded : allAdded;

    for (const added of candidateAdded) {
      if (usedAdded.has(added.path)) continue;

      // Quick size-based pre-filter (allow 3x size difference)
      const sizeRatio = deleted.fingerprint.charCount / (added.fingerprint.charCount || 1);
      if (sizeRatio < 0.33 || sizeRatio > 3) continue;

      // Line count pre-filter (allow 3x difference)
      const lineRatio = deleted.fingerprint.lineCount / (added.fingerprint.lineCount || 1);
      if (lineRatio < 0.33 || lineRatio > 3) continue;

      // Estimate similarity based on filename and size
      const filenameSim = calculateFilenameSimilarity(deleted.path, added.path);
      const sizeSim = 100 - Math.abs(sizeRatio - 1) * 50; // Closer to 1 = higher similarity

      // Combined estimate (filename is more predictive for renames)
      const estimatedSimilarity = Math.round(filenameSim * 0.6 + sizeSim * 0.4);

      potentialMatches.push({ deleted, added, estimatedSimilarity });
    }

    // Also check files with different extensions if we haven't found good matches
    if (deleted.ext) {
      for (const added of allAdded) {
        if (added.ext === deleted.ext) continue; // Already checked
        if (usedAdded.has(added.path)) continue;

        // For different extensions, require higher filename similarity
        const filenameSim = calculateFilenameSimilarity(deleted.path, added.path);
        if (filenameSim < 50) continue; // Must have similar base name

        const sizeRatio = deleted.fingerprint.charCount / (added.fingerprint.charCount || 1);
        if (sizeRatio < 0.33 || sizeRatio > 3) continue;

        potentialMatches.push({
          deleted,
          added,
          estimatedSimilarity: filenameSim,
        });
      }
    }
  }

  // Sort by estimated similarity (descending) for greedy matching
  potentialMatches.sort((a, b) => b.estimatedSimilarity - a.estimatedSimilarity);

  // Compute actual similarity for top candidates
  for (const match of potentialMatches) {
    if (usedDeleted.has(match.deleted.path) || usedAdded.has(match.added.path)) {
      continue;
    }

    // Compute actual content similarity
    const contentSim = calculateContentSimilarity(match.deleted.content, match.added.content);
    
    // Filename contributes to overall similarity (20% weight)
    const filenameSim = calculateFilenameSimilarity(match.deleted.path, match.added.path);
    const overallSimilarity = Math.round(contentSim * 0.8 + filenameSim * 0.2);

    if (overallSimilarity >= threshold) {
      candidates.push({
        oldPath: match.deleted.path,
        newPath: match.added.path,
        similarity: overallSimilarity,
      });
      usedDeleted.add(match.deleted.path);
      usedAdded.add(match.added.path);
    }
  }

  return candidates;
}

/**
 * Process file diffs and detect renames
 * Converts matched delete+add pairs into rename FileDiffs
 */
export function processRenames(
  fileDiffs: FileDiff[],
  getContent: (path: string, isOld: boolean) => string,
  options: RenameDetectionOptions = {}
): FileDiff[] {
  const deleted = fileDiffs.filter(f => f.isDeleted);
  const added = fileDiffs.filter(f => f.isNew);
  const unchanged = fileDiffs.filter(f => !f.isDeleted && !f.isNew);

  if (deleted.length === 0 || added.length === 0) {
    return fileDiffs;
  }

  // Get content for deleted and added files
  const deletedWithContent = deleted.map(f => ({
    path: f.oldPath,
    content: getContent(f.oldPath, true),
  }));

  const addedWithContent = added.map(f => ({
    path: f.newPath,
    content: getContent(f.newPath, false),
  }));

  // Detect renames
  const renames = detectRenames(deletedWithContent, addedWithContent, options);

  // Create rename FileDiffs
  const renamedPaths = new Set<string>();
  const renameDiffs: FileDiff[] = [];

  for (const rename of renames) {
    renamedPaths.add(rename.oldPath);
    renamedPaths.add(rename.newPath);

    const oldContent = getContent(rename.oldPath, true);
    const newContent = getContent(rename.newPath, false);

    // Compute the actual diff between old and new content
    const diffLines = diff(oldContent, newContent);
    const hunks = createHunks(diffLines);

    renameDiffs.push({
      oldPath: rename.oldPath,
      newPath: rename.newPath,
      hunks,
      isBinary: false,
      isNew: false,
      isDeleted: false,
      isRename: true,
      similarity: rename.similarity,
    });
  }

  // Filter out files that were matched as renames
  const remainingDeleted = deleted.filter(f => !renamedPaths.has(f.oldPath));
  const remainingAdded = added.filter(f => !renamedPaths.has(f.newPath));

  return [...unchanged, ...renameDiffs, ...remainingDeleted, ...remainingAdded];
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

  if (fileDiff.isRename) {
    lines.push(colors.bold(`diff --wit a/${fileDiff.oldPath} b/${fileDiff.newPath}`));
    lines.push(colors.yellow(`renamed: ${fileDiff.oldPath} → ${fileDiff.newPath} (${fileDiff.similarity}% similar)`));
  } else {
    lines.push(colors.bold(`diff --wit a/${fileDiff.oldPath} b/${fileDiff.newPath}`));
  }
  
  if (fileDiff.isNew) {
    lines.push(colors.yellow('new file mode 100644'));
  } else if (fileDiff.isDeleted) {
    lines.push(colors.yellow('deleted file mode 100644'));
  }

  if (fileDiff.isRename) {
    lines.push(colors.bold(`--- a/${fileDiff.oldPath}`));
    lines.push(colors.bold(`+++ b/${fileDiff.newPath}`));
  } else {
    lines.push(colors.bold(`--- a/${fileDiff.oldPath}`));
    lines.push(colors.bold(`+++ b/${fileDiff.newPath}`));
  }

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
