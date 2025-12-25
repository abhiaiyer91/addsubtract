/**
 * Get Status Tool
 * Returns the current repository status including staged, modified, and untracked files
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';

export const getStatusTool = createTool({
  id: 'wit-get-status',
  description: 'Get the current status of the git repository including staged files, modified files, untracked files, and deleted files. Use this to understand what changes exist in the working directory.',
  inputSchema: z.object({
    path: z.string().optional().describe('Optional path to the repository. Defaults to current directory.'),
  }),
  outputSchema: z.object({
    branch: z.string().nullable().describe('Current branch name'),
    staged: z.array(z.string()).describe('Files staged for commit'),
    modified: z.array(z.string()).describe('Files modified but not staged'),
    untracked: z.array(z.string()).describe('New files not being tracked'),
    deleted: z.array(z.string()).describe('Files that have been deleted'),
    hasChanges: z.boolean().describe('Whether there are any changes'),
    isClean: z.boolean().describe('Whether the working tree is clean'),
  }),
  execute: async ({ path }) => {
    try {
      const repo = path ? Repository.find(path) : Repository.find();
      const status = repo.status();
      const branch = repo.refs.getCurrentBranch();
      
      const hasChanges = 
        status.staged.length > 0 || 
        status.modified.length > 0 || 
        status.untracked.length > 0 ||
        status.deleted.length > 0;
      
      return {
        branch,
        staged: status.staged,
        modified: status.modified,
        untracked: status.untracked,
        deleted: status.deleted,
        hasChanges,
        isClean: !hasChanges,
      };
    } catch (error) {
      return {
        branch: null,
        staged: [],
        modified: [],
        untracked: [],
        deleted: [],
        hasChanges: false,
        isClean: true,
      };
    }
  },
});
