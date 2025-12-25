/**
 * Switch Branch Tool
 * Switches to a different branch
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';

export const switchBranchTool = createTool({
  id: 'tsgit-switch-branch',
  description: 'Switch to a different branch. Can also create a new branch and switch to it. Note: tsgit automatically saves uncommitted work when switching branches (auto-stash).',
  inputSchema: z.object({
    branch: z.string().describe('Name of the branch to switch to'),
    create: z.boolean().optional().describe('If true, create the branch if it does not exist'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    previousBranch: z.string().nullable(),
    currentBranch: z.string(),
    message: z.string(),
    wasCreated: z.boolean(),
    workSaved: z.boolean().describe('Whether uncommitted work was auto-saved'),
  }),
  execute: async ({ branch, create }) => {
    try {
      const repo = Repository.find();
      const previousBranch = repo.refs.getCurrentBranch();
      
      // Check if branch exists
      const branchExists = repo.refs.listBranches().includes(branch);
      
      if (!branchExists && !create) {
        return {
          success: false,
          previousBranch,
          currentBranch: previousBranch || '',
          message: `Branch '${branch}' does not exist. Set create=true to create it.`,
          wasCreated: false,
          workSaved: false,
        };
      }
      
      // Create branch if needed
      if (!branchExists && create) {
        const headHash = repo.refs.resolve('HEAD');
        if (headHash) {
          repo.refs.createBranch(branch, headHash);
        }
      }
      
      // Check for uncommitted changes
      const status = repo.status();
      const hasChanges = status.staged.length > 0 || status.modified.length > 0;
      
      // Switch branch (auto-stash happens automatically in tsgit)
      repo.checkout(branch);
      
      return {
        success: true,
        previousBranch,
        currentBranch: branch,
        message: `Switched to branch '${branch}'${!branchExists ? ' (newly created)' : ''}`,
        wasCreated: !branchExists,
        workSaved: hasChanges,
      };
    } catch (error) {
      return {
        success: false,
        previousBranch: null,
        currentBranch: '',
        message: error instanceof Error ? error.message : 'Failed to switch branch',
        wasCreated: false,
        workSaved: false,
      };
    }
  },
});
