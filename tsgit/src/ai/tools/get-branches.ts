/**
 * Get Branches Tool
 * Returns all branches in the repository
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';

export const getBranchesTool = createTool({
  id: 'tsgit-get-branches',
  description: 'List all branches in the repository and identify the current branch. Use this to understand the branching structure and find available branches to switch to.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    current: z.string().nullable().describe('Name of the current branch'),
    branches: z.array(z.object({
      name: z.string(),
      isCurrent: z.boolean(),
      hash: z.string().optional(),
    })),
    totalBranches: z.number(),
  }),
  execute: async () => {
    try {
      const repo = Repository.find();
      const currentBranch = repo.refs.getCurrentBranch();
      const branchList = repo.refs.listBranches();
      
      const branches = branchList.map(name => {
        const hash = repo.refs.resolve(`refs/heads/${name}`);
        return {
          name,
          isCurrent: name === currentBranch,
          hash: hash || undefined,
        };
      });
      
      return {
        current: currentBranch,
        branches,
        totalBranches: branches.length,
      };
    } catch (error) {
      return {
        current: null,
        branches: [],
        totalBranches: 0,
      };
    }
  },
});
