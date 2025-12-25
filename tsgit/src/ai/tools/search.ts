/**
 * Search Tool
 * Searches the repository for commits, files, and content
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { SearchEngine } from '../../ui/search.js';

export const searchTool = createTool({
  id: 'tsgit-search',
  description: 'Search the repository for commits, files, and content matching a query. Use this to find specific code, commits by message, or files by name.',
  inputSchema: z.object({
    query: z.string().describe('Search query string'),
    searchCommits: z.boolean().optional().default(true).describe('Search in commit messages'),
    searchFiles: z.boolean().optional().default(true).describe('Search in file names'),
    searchContent: z.boolean().optional().default(true).describe('Search in file contents'),
    caseSensitive: z.boolean().optional().default(false),
    maxResults: z.number().optional().default(20),
  }),
  outputSchema: z.object({
    commits: z.array(z.object({
      hash: z.string(),
      shortHash: z.string(),
      message: z.string(),
      author: z.string(),
      matchedText: z.string(),
    })),
    files: z.array(z.object({
      path: z.string(),
      matchedText: z.string(),
    })),
    content: z.array(z.object({
      path: z.string(),
      lineNumber: z.number(),
      lineContent: z.string(),
      matchedText: z.string(),
    })),
    totalResults: z.number(),
    searchTime: z.number(),
  }),
  execute: async ({ query, searchCommits, searchFiles, searchContent, caseSensitive, maxResults }) => {
    try {
      const repo = Repository.find();
      const searchEngine = new SearchEngine(repo);
      
      const results = searchEngine.search(query, {
        searchCommits,
        searchFiles,
        searchContent,
        caseSensitive,
        maxResults,
      });
      
      return {
        commits: results.commits.map(c => ({
          hash: c.hash,
          shortHash: c.shortHash,
          message: c.message,
          author: c.author,
          matchedText: c.matchedText,
        })),
        files: results.files.map(f => ({
          path: f.path,
          matchedText: f.matchedText,
        })),
        content: results.content.map(c => ({
          path: c.path,
          lineNumber: c.lineNumber,
          lineContent: c.lineContent,
          matchedText: c.matchedText,
        })),
        totalResults: results.totalCount,
        searchTime: results.searchTime,
      };
    } catch (error) {
      return {
        commits: [],
        files: [],
        content: [],
        totalResults: 0,
        searchTime: 0,
      };
    }
  },
});
