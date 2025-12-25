/**
 * Undo Tool
 * Undoes the last operation(s)
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { Journal } from '../../core/journal.js';

export const undoTool = createTool({
  id: 'wit-undo',
  description: 'Undo the last operation(s) in the repository. wit maintains a journal of all operations that can be undone. Use this to revert mistakes.',
  inputSchema: z.object({
    steps: z.number().optional().default(1).describe('Number of operations to undo'),
    dryRun: z.boolean().optional().describe('If true, only show what would be undone without actually undoing'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    undone: z.array(z.object({
      operation: z.string(),
      description: z.string(),
      timestamp: z.number(),
    })),
    message: z.string(),
  }),
  execute: async ({ steps, dryRun }) => {
    try {
      const repo = Repository.find();
      const journal = new Journal(repo.gitDir);
      
      const entries = journal.getAllEntries();
      const toUndo = entries.slice(-steps);
      
      if (toUndo.length === 0) {
        return {
          success: false,
          undone: [],
          message: 'Nothing to undo',
        };
      }
      
      if (dryRun) {
        return {
          success: true,
          undone: toUndo.map((e: { operation: string; description: string; timestamp: number }) => ({
            operation: e.operation,
            description: e.description,
            timestamp: e.timestamp,
          })),
          message: `Would undo ${toUndo.length} operation(s)`,
        };
      }
      
      // Actually undo the operations
      const undone: Array<{ operation: string; description: string; timestamp: number }> = [];
      
      for (const entry of toUndo.reverse()) {
        // Restore the before state
        if (entry.beforeState.head) {
          // Check if it's a symbolic ref or direct hash
          if (entry.beforeState.branch) {
            repo.refs.setHeadSymbolic(`refs/heads/${entry.beforeState.branch}`);
          } else {
            repo.refs.setHeadDetached(entry.beforeState.head);
          }
        }
        
        journal.popEntry();
        
        undone.push({
          operation: entry.operation,
          description: entry.description,
          timestamp: entry.timestamp,
        });
      }
      
      return {
        success: true,
        undone,
        message: `Undid ${undone.length} operation(s)`,
      };
    } catch (error) {
      return {
        success: false,
        undone: [],
        message: error instanceof Error ? error.message : 'Failed to undo',
      };
    }
  },
});
