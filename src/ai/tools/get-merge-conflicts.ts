/**
 * Get Merge Conflicts Tool
 * Returns information about current merge conflicts
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { MergeManager } from '../../core/merge.js';

export const getMergeConflictsTool = createTool({
  id: 'wit-get-merge-conflicts',
  description: 'Get information about current merge conflicts, including the conflicting files and the specific conflict regions. Use this to understand what needs to be resolved.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    inProgress: z.boolean().describe('Whether a merge is currently in progress'),
    sourceBranch: z.string().optional(),
    targetBranch: z.string().optional(),
    conflicts: z.array(z.object({
      file: z.string(),
      regions: z.array(z.object({
        startLine: z.number(),
        ours: z.array(z.string()),
        theirs: z.array(z.string()),
        base: z.array(z.string()).optional(),
      })),
      oursContent: z.string(),
      theirsContent: z.string(),
      baseContent: z.string().optional(),
    })),
    resolved: z.array(z.string()),
    unresolved: z.number(),
  }),
  execute: async () => {
    try {
      const repo = Repository.find();
      const mergeManager = new MergeManager(repo, repo.gitDir);
      
      const state = mergeManager.getState();
      
      if (!state || !state.inProgress) {
        return {
          inProgress: false,
          conflicts: [],
          resolved: [],
          unresolved: 0,
        };
      }
      
      const conflicts = state.conflicts.map(c => ({
        file: c.path,
        regions: c.regions.map(r => ({
          startLine: r.startLine,
          ours: r.ours,
          theirs: r.theirs,
          base: r.base,
        })),
        oursContent: c.oursContent,
        theirsContent: c.theirsContent,
        baseContent: c.baseContent,
      }));
      
      return {
        inProgress: true,
        sourceBranch: state.sourceBranch,
        targetBranch: state.targetBranch,
        conflicts,
        resolved: state.resolved,
        unresolved: state.conflicts.length - state.resolved.length,
      };
    } catch {
      return {
        inProgress: false,
        conflicts: [],
        resolved: [],
        unresolved: 0,
      };
    }
  },
});
