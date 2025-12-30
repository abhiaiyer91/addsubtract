/**
 * Get Log Tool
 * Returns the commit history
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';

export const getLogTool = createTool({
  id: 'wit-get-log',
  description: 'Get the commit history log. Returns recent commits with their hash, message, author, and date. Use this to understand the project history and find specific commits.',
  inputSchema: z.object({
    limit: z.number().optional().default(10).describe('Maximum number of commits to return'),
    ref: z.string().optional().default('HEAD').describe('Starting reference (branch name, commit hash, or HEAD)'),
  }),
  outputSchema: z.object({
    commits: z.array(z.object({
      hash: z.string(),
      shortHash: z.string(),
      message: z.string(),
      subject: z.string(),
      author: z.string(),
      email: z.string(),
      date: z.string(),
      timestamp: z.number(),
    })),
    totalShown: z.number(),
  }),
  execute: async ({ limit, ref }) => {
    try {
      const repo = Repository.find();
      const commits = repo.log(ref, limit);
      
      const formattedCommits = commits.map(commit => {
        const hash = commit.hash();
        const messageLines = commit.message.split('\n');
        
        return {
          hash,
          shortHash: hash.slice(0, 8),
          message: commit.message,
          subject: messageLines[0],
          author: commit.author.name,
          email: commit.author.email,
          date: new Date(commit.author.timestamp * 1000).toISOString(),
          timestamp: commit.author.timestamp,
        };
      });
      
      return {
        commits: formattedCommits,
        totalShown: formattedCommits.length,
      };
    } catch {
      return {
        commits: [],
        totalShown: 0,
      };
    }
  },
});
