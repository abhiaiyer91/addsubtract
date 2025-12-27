/**
 * Virtual Edit File Tool
 * 
 * Performs search-and-replace edits on files in a VirtualFS.
 * Used by the IDE and AI agents for targeted code modifications.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getVirtualRepo } from './virtual-write-file.js';

export const virtualEditFileTool = createTool({
  id: 'vfs-edit-file',
  description: `Edit an existing file using search and replace.
This is the preferred tool for making targeted changes to existing files.
The search text must match exactly (including whitespace and indentation).
For creating new files or completely rewriting files, use vfs-write-file instead.

Tips:
- Include enough context in the search text to make it unique
- Be precise with indentation (spaces vs tabs)
- Include multiple lines if needed for unique matching`,
  inputSchema: z.object({
    sessionId: z.string().describe('The session ID for the virtual repository'),
    filePath: z.string().describe('Path to the file relative to the repository root'),
    search: z.string().describe('The exact text to search for (must match exactly including whitespace)'),
    replace: z.string().describe('The text to replace the search text with'),
    replaceAll: z.boolean().optional().default(false).describe('Replace all occurrences (default: replace only the first match)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filePath: z.string().optional(),
    content: z.string().optional().describe('The new file content after editing'),
    matchCount: z.number().optional().describe('Number of matches found'),
    replacedCount: z.number().optional().describe('Number of replacements made'),
    message: z.string(),
    previousContent: z.string().optional().describe('Previous file content (for undo)'),
  }),
  execute: async ({ sessionId, filePath, search, replace, replaceAll = false }) => {
    try {
      const vrepo = getVirtualRepo(sessionId);
      if (!vrepo) {
        return {
          success: false,
          message: `Virtual repository session not found: ${sessionId}`,
        };
      }

      // Security: Prevent editing .wit or .git directories
      if (filePath.startsWith('.wit') || filePath.startsWith('.git') ||
          filePath.includes('/.wit/') || filePath.includes('/.git/')) {
        return {
          success: false,
          message: 'Access denied: Cannot edit files in .wit or .git directories',
        };
      }

      // Check if file exists
      if (!vrepo.exists(filePath)) {
        return {
          success: false,
          message: `File not found: ${filePath}. Use vfs-write-file to create new files.`,
        };
      }

      // Read current content
      const content = vrepo.read(filePath);
      if (content === null) {
        return {
          success: false,
          message: `Could not read file: ${filePath}`,
        };
      }

      // Count matches
      const matchCount = content.split(search).length - 1;

      if (matchCount === 0) {
        return {
          success: false,
          matchCount: 0,
          message: `Search text not found in ${filePath}. Make sure the search text matches exactly, including whitespace and indentation.`,
          previousContent: content,
        };
      }

      // Perform replacement
      let newContent: string;
      let replacedCount: number;

      if (replaceAll) {
        newContent = content.split(search).join(replace);
        replacedCount = matchCount;
      } else {
        newContent = content.replace(search, replace);
        replacedCount = 1;
      }

      // Write the updated file
      vrepo.write(filePath, newContent);

      return {
        success: true,
        filePath,
        content: newContent,
        matchCount,
        replacedCount,
        message: `Replaced ${replacedCount} occurrence(s) in ${filePath}`,
        previousContent: content,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to edit file',
      };
    }
  },
});
