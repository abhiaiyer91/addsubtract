/**
 * Virtual List Directory Tool
 * 
 * Lists files and directories in a VirtualFS.
 * Used by the IDE and AI agents to explore repository structure.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getVirtualRepo } from './virtual-write-file.js';

export const virtualListDirectoryTool = createTool({
  id: 'vfs-list-directory',
  description: `List files and directories in the virtual filesystem.
Use this to explore the repository structure and find files.
Returns a list of entries with their names, paths, and types (file or directory).`,
  inputSchema: z.object({
    sessionId: z.string().describe('The session ID for the virtual repository'),
    dirPath: z.string().optional().default('.').describe('Path to the directory relative to the repository root'),
    recursive: z.boolean().optional().default(false).describe('List all files recursively'),
    includeHidden: z.boolean().optional().default(false).describe('Include hidden files (starting with .)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    dirPath: z.string().optional(),
    entries: z.array(z.object({
      name: z.string(),
      path: z.string(),
      type: z.enum(['file', 'dir']),
    })).optional(),
    totalFiles: z.number().optional(),
    totalDirs: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ sessionId, dirPath = '.', recursive = false, includeHidden = false }) => {
    try {
      const vrepo = getVirtualRepo(sessionId);
      if (!vrepo) {
        return {
          success: false,
          message: `Virtual repository session not found: ${sessionId}`,
        };
      }

      // Get entries
      let entries = recursive ? vrepo.listRecursive(dirPath) : vrepo.list(dirPath);

      // Filter hidden files if needed
      if (!includeHidden) {
        entries = entries.filter(e => !e.name.startsWith('.'));
      }

      // Count files and directories
      const totalFiles = entries.filter(e => e.type === 'file').length;
      const totalDirs = entries.filter(e => e.type === 'dir').length;

      return {
        success: true,
        dirPath,
        entries,
        totalFiles,
        totalDirs,
        message: `Found ${totalFiles} files and ${totalDirs} directories in ${dirPath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to list directory',
      };
    }
  },
});
