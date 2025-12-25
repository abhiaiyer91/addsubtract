/**
 * Stage Files Tool
 * Stages files for commit
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';

export const stageFilesTool = createTool({
  id: 'wit-stage-files',
  description: 'Stage files for the next commit. Use "." to stage all files, or specify individual file paths. Staging prepares changes to be included in the next commit.',
  inputSchema: z.object({
    files: z.array(z.string()).describe('Array of file paths to stage. Use ["."] to stage all files.'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stagedFiles: z.array(z.string()),
    message: z.string(),
  }),
  execute: async ({ files }) => {
    try {
      const repo = Repository.find();
      const stagedFiles: string[] = [];
      
      for (const file of files) {
        if (file === '.') {
          // Stage all files
          const status = repo.status();
          const allFiles = [...status.modified, ...status.untracked];
          for (const f of allFiles) {
            repo.add(f);
            stagedFiles.push(f);
          }
          // Handle deleted files
          for (const f of status.deleted) {
            repo.index.remove(f);
            stagedFiles.push(f);
          }
        } else {
          repo.add(file);
          stagedFiles.push(file);
        }
      }
      
      return {
        success: true,
        stagedFiles,
        message: `Staged ${stagedFiles.length} file(s)`,
      };
    } catch (error) {
      return {
        success: false,
        stagedFiles: [],
        message: error instanceof Error ? error.message : 'Failed to stage files',
      };
    }
  },
});
