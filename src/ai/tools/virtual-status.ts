/**
 * Virtual Status Tool
 * 
 * Gets the status of changes in the VirtualFS.
 * Used by the IDE and AI agents to see what files have been modified.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getVirtualRepo } from './virtual-write-file.js';

export const virtualStatusTool = createTool({
  id: 'vfs-status',
  description: `Get the status of all changes in the virtual filesystem.
Shows which files have been added, modified, or deleted since the last commit.
Use this before committing to see what changes will be included.`,
  inputSchema: z.object({
    sessionId: z.string().describe('The session ID for the virtual repository'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    branch: z.string().optional().describe('Current branch name'),
    changes: z.array(z.object({
      path: z.string(),
      status: z.enum(['added', 'modified', 'deleted', 'untracked']),
    })).optional(),
    hasChanges: z.boolean().optional(),
    message: z.string(),
  }),
  execute: async ({ sessionId }) => {
    try {
      const vrepo = getVirtualRepo(sessionId);
      if (!vrepo) {
        return {
          success: false,
          message: `Virtual repository session not found: ${sessionId}`,
        };
      }

      const status = vrepo.status();
      const branch = vrepo.getCurrentBranch();

      return {
        success: true,
        branch,
        changes: status,
        hasChanges: status.length > 0,
        message: status.length > 0
          ? `${status.length} file(s) changed on branch ${branch}`
          : `No changes on branch ${branch}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get status',
      };
    }
  },
});
