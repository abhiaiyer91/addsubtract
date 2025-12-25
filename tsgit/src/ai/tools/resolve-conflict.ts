/**
 * Resolve Conflict Tool
 * Resolves a merge conflict by writing the resolved content
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { MergeManager } from '../../core/merge.js';
import * as fs from 'fs';
import * as path from 'path';

export const resolveConflictTool = createTool({
  id: 'wit-resolve-conflict',
  description: 'Resolve a merge conflict by providing the resolved content for a file. After resolving all conflicts, the merge can be completed.',
  inputSchema: z.object({
    file: z.string().describe('Path to the file with the conflict'),
    content: z.string().describe('The resolved content to write to the file'),
    markResolved: z.boolean().optional().default(true).describe('Whether to mark the file as resolved'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    remainingConflicts: z.number(),
    canComplete: z.boolean().describe('Whether all conflicts are now resolved and merge can be completed'),
  }),
  execute: async ({ file, content, markResolved }) => {
    try {
      const repo = Repository.find();
      const mergeManager = new MergeManager(repo, repo.gitDir);
      
      const state = mergeManager.getState();
      if (!state || !state.inProgress) {
        return {
          success: false,
          message: 'No merge in progress',
          remainingConflicts: 0,
          canComplete: false,
        };
      }
      
      // Write the resolved content
      const fullPath = path.join(repo.workDir, file);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      
      // Stage the resolved file
      repo.add(file);
      
      // Mark as resolved if requested
      if (markResolved) {
        mergeManager.resolveFile(file);
      }
      
      // Check remaining conflicts
      const unresolvedConflicts = mergeManager.getUnresolvedConflicts();
      const remainingConflicts = unresolvedConflicts.length;
      
      return {
        success: true,
        message: `Resolved conflict in ${file}`,
        remainingConflicts,
        canComplete: remainingConflicts === 0,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to resolve conflict',
        remainingConflicts: -1,
        canComplete: false,
      };
    }
  },
});
