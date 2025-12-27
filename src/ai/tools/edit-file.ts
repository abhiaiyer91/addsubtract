/**
 * Edit File Tool
 * Makes targeted edits to existing files using search and replace
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as path from 'path';
import { Repository } from '../../core/repository.js';
import { exists, readFileText, writeFile } from '../../utils/fs.js';

export const editFileTool = createTool({
  id: 'wit-edit-file',
  description: `Make targeted edits to an existing file using search and replace.
This is the preferred tool for modifying existing code as it:
- Only changes the specific parts you identify
- Preserves the rest of the file unchanged
- Validates that the search text exists before making changes
- Supports multiple edits in a single operation

Each edit specifies an 'oldText' to find and 'newText' to replace it with.
The oldText must match exactly (including whitespace and indentation).
Tip: Include enough context in oldText to uniquely identify the location.`,
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file relative to the repository root'),
    edits: z.array(z.object({
      oldText: z.string().describe('The exact text to find (must match exactly including whitespace)'),
      newText: z.string().describe('The text to replace it with'),
    })).describe('Array of edits to apply. Applied in order.'),
    dryRun: z.boolean().optional().default(false).describe('If true, validate edits without applying them'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filePath: z.string().optional(),
    editsApplied: z.number().optional().describe('Number of edits successfully applied'),
    editResults: z.array(z.object({
      index: z.number(),
      applied: z.boolean(),
      errorMessage: z.string().optional(),
    })).optional(),
    message: z.string(),
    diff: z.string().optional().describe('Preview of changes (in dry-run mode or on success)'),
  }),
  execute: async ({ filePath, edits, dryRun = false }) => {
    try {
      const repo = Repository.find();
      const fullPath = path.join(repo.workDir, filePath);

      // Security: Ensure path is within repo
      const resolvedPath = path.resolve(fullPath);
      if (!resolvedPath.startsWith(repo.workDir)) {
        return {
          success: false,
          message: 'Access denied: Path is outside repository',
        };
      }

      // Security: Prevent editing .wit or .git directories
      const relativePath = path.relative(repo.workDir, resolvedPath);
      if (relativePath.startsWith('.wit') || relativePath.startsWith('.git')) {
        return {
          success: false,
          message: 'Access denied: Cannot edit .wit or .git directories',
        };
      }

      if (!exists(fullPath)) {
        return {
          success: false,
          message: `File not found: ${filePath}. Use writeFile to create new files.`,
        };
      }

      // Read current content
      const originalContent = readFileText(fullPath);
      let modifiedContent = originalContent;
      const editResults: Array<{ index: number; applied: boolean; errorMessage?: string }> = [];

      // Apply edits in order
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        // Check if oldText exists in current content
        const occurrences = countOccurrences(modifiedContent, edit.oldText);

        if (occurrences === 0) {
          editResults.push({
            index: i,
            applied: false,
            errorMessage: `oldText not found in file. Make sure it matches exactly including whitespace.`,
          });
          continue;
        }

        if (occurrences > 1) {
          editResults.push({
            index: i,
            applied: false,
            errorMessage: `oldText found ${occurrences} times. Add more context to make it unique.`,
          });
          continue;
        }

        // Apply the edit
        modifiedContent = modifiedContent.replace(edit.oldText, edit.newText);
        editResults.push({ index: i, applied: true });
      }

      const appliedCount = editResults.filter(r => r.applied).length;
      const allApplied = appliedCount === edits.length;

      // Generate diff preview
      const diff = generateSimpleDiff(originalContent, modifiedContent, filePath);

      if (dryRun) {
        return {
          success: allApplied,
          filePath,
          editsApplied: appliedCount,
          editResults,
          message: allApplied
            ? `Dry run: All ${appliedCount} edits would be applied successfully`
            : `Dry run: ${appliedCount}/${edits.length} edits would be applied`,
          diff,
        };
      }

      // Only write if at least one edit was applied
      if (appliedCount > 0) {
        writeFile(fullPath, Buffer.from(modifiedContent, 'utf-8'));
      }

      return {
        success: allApplied,
        filePath,
        editsApplied: appliedCount,
        editResults,
        message: allApplied
          ? `Applied all ${appliedCount} edits to ${filePath}`
          : `Applied ${appliedCount}/${edits.length} edits to ${filePath}`,
        diff,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to edit file',
      };
    }
  },
});

/**
 * Count occurrences of a substring
 */
function countOccurrences(text: string, search: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

/**
 * Generate a simple unified diff preview
 */
function generateSimpleDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const diffLines: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  // Simple line-by-line diff (not a full algorithm, but good enough for preview)
  let i = 0, j = 0;
  let hunkStart = -1;
  let hunkOld: string[] = [];
  let hunkNew: string[] = [];

  const flushHunk = () => {
    if (hunkStart >= 0 && (hunkOld.length > 0 || hunkNew.length > 0)) {
      diffLines.push(`@@ -${hunkStart + 1},${hunkOld.length} +${hunkStart + 1},${hunkNew.length} @@`);
      for (const line of hunkOld) {
        diffLines.push(`-${line}`);
      }
      for (const line of hunkNew) {
        diffLines.push(`+${line}`);
      }
    }
    hunkStart = -1;
    hunkOld = [];
    hunkNew = [];
  };

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      flushHunk();
      i++;
      j++;
    } else if (j < newLines.length && (i >= oldLines.length || !oldLines.includes(newLines[j]))) {
      // Line was added
      if (hunkStart < 0) hunkStart = i;
      hunkNew.push(newLines[j]);
      j++;
    } else if (i < oldLines.length && (j >= newLines.length || !newLines.includes(oldLines[i]))) {
      // Line was removed
      if (hunkStart < 0) hunkStart = i;
      hunkOld.push(oldLines[i]);
      i++;
    } else {
      // Changed line
      if (hunkStart < 0) hunkStart = i;
      hunkOld.push(oldLines[i]);
      hunkNew.push(newLines[j]);
      i++;
      j++;
    }
  }

  flushHunk();

  return diffLines.join('\n');
}
