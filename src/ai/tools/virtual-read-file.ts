/**
 * Virtual Read File Tool
 * 
 * Reads files from a VirtualFS (in-memory filesystem).
 * Used by the IDE and AI agents for server-side code viewing.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getVirtualRepo } from './virtual-write-file.js';

export const virtualReadFileTool = createTool({
  id: 'vfs-read-file',
  description: `Read the contents of a file from the virtual filesystem.
Use this to examine existing code before making changes, or to understand the current state of a file.
Returns the file content as a string, or an error if the file doesn't exist.`,
  inputSchema: z.object({
    sessionId: z.string().describe('The session ID for the virtual repository'),
    filePath: z.string().describe('Path to the file relative to the repository root'),
    startLine: z.number().optional().describe('Start reading from this line (1-indexed). If not provided, reads from the beginning.'),
    endLine: z.number().optional().describe('Stop reading at this line (inclusive). If not provided, reads to the end.'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filePath: z.string().optional(),
    content: z.string().optional().describe('The file contents, or the specified line range'),
    totalLines: z.number().optional().describe('Total number of lines in the file'),
    startLine: z.number().optional().describe('The starting line number of the returned content'),
    endLine: z.number().optional().describe('The ending line number of the returned content'),
    message: z.string(),
  }),
  execute: async ({ sessionId, filePath, startLine, endLine }) => {
    try {
      const vrepo = getVirtualRepo(sessionId);
      if (!vrepo) {
        return {
          success: false,
          message: `Virtual repository session not found: ${sessionId}`,
        };
      }

      // Check if file exists
      if (!vrepo.exists(filePath)) {
        return {
          success: false,
          message: `File not found: ${filePath}`,
        };
      }

      // Check if it's a directory
      const entries = vrepo.list(filePath);
      if (entries.length > 0 && !vrepo.read(filePath)) {
        return {
          success: false,
          message: `Path is a directory, not a file: ${filePath}`,
        };
      }

      // Read the file
      const content = vrepo.read(filePath);
      if (content === null) {
        return {
          success: false,
          message: `Could not read file: ${filePath}`,
        };
      }

      const lines = content.split('\n');
      const totalLines = lines.length;

      // Handle line range
      let resultContent = content;
      let actualStartLine = 1;
      let actualEndLine = totalLines;

      if (startLine !== undefined || endLine !== undefined) {
        actualStartLine = Math.max(1, startLine || 1);
        actualEndLine = Math.min(totalLines, endLine || totalLines);

        if (actualStartLine > totalLines) {
          return {
            success: false,
            message: `Start line ${actualStartLine} exceeds file length (${totalLines} lines)`,
          };
        }

        const selectedLines = lines.slice(actualStartLine - 1, actualEndLine);
        resultContent = selectedLines.join('\n');
      }

      return {
        success: true,
        filePath,
        content: resultContent,
        totalLines,
        startLine: actualStartLine,
        endLine: actualEndLine,
        message: `Read ${actualEndLine - actualStartLine + 1} lines from ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to read file',
      };
    }
  },
});
