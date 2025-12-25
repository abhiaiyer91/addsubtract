/**
 * Create Commit Tool
 * Creates a new commit with the staged changes
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { Journal, StateSnapshot } from '../../core/journal.js';

export const createCommitTool = createTool({
  id: 'wit-create-commit',
  description: 'Create a new commit with the currently staged changes. Requires a commit message. Optionally can stage all tracked modified files before committing with the "all" flag.',
  inputSchema: z.object({
    message: z.string().describe('The commit message. Should describe what changes were made and why.'),
    all: z.boolean().optional().describe('If true, automatically stage all tracked modified files before committing (like git commit -a)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    hash: z.string().optional(),
    shortHash: z.string().optional(),
    branch: z.string().nullable().optional(),
    message: z.string(),
    filesCommitted: z.number().optional(),
  }),
  execute: async ({ message, all }) => {
    try {
      const repo = Repository.find();
      const journal = new Journal(repo.gitDir);
      
      // Capture state before
      const beforeState: StateSnapshot = {
        head: repo.refs.resolve('HEAD') || '',
        branch: repo.refs.getCurrentBranch(),
        indexHash: '',
      };
      
      // Stage all tracked files if requested
      if (all) {
        const status = repo.status();
        for (const file of status.modified) {
          repo.add(file);
        }
        for (const file of status.deleted) {
          repo.index.remove(file);
        }
        repo.index.save();
      }
      
      // Check if there's anything to commit
      if (repo.index.size === 0) {
        return {
          success: false,
          message: 'Nothing to commit - no files are staged. Use stageFiles first or set all=true.',
          filesCommitted: 0,
        };
      }
      
      // Create the commit
      const hash = repo.commit(message);
      const branch = repo.refs.getCurrentBranch();
      
      // Capture state after
      const afterState: StateSnapshot = {
        head: hash,
        branch,
        indexHash: '',
      };
      
      // Record in journal for undo
      journal.record(
        'commit',
        [message.slice(0, 50)],
        `Committed: ${message.split('\n')[0].slice(0, 50)}`,
        beforeState,
        afterState,
        { commitHash: hash }
      );
      
      const shortHash = hash.slice(0, 8);
      const filesCommitted = repo.index.size;
      
      return {
        success: true,
        hash,
        shortHash,
        branch,
        message: `[${branch || 'detached HEAD'} ${shortHash}] ${message.split('\n')[0]}`,
        filesCommitted,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create commit',
        filesCommitted: 0,
      };
    }
  },
});
