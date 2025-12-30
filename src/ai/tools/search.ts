/**
 * Search Tool
 * Searches the repository for commits, files, and content
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { SearchEngine } from '../../ui/search.js';

export const searchTool = createTool({
  id: 'wit-search',
  description: 'Search the repository for commits, files, and content matching a query. Use this to find specific code, commits by message, or files by name. Supports glob patterns for file filtering.',
  inputSchema: z.object({
    query: z.string().describe('Search query string (text pattern or regex)'),
    searchCommits: z.boolean().optional().default(true).describe('Search in commit messages'),
    searchFiles: z.boolean().optional().default(true).describe('Search in file names'),
    searchContent: z.boolean().optional().default(true).describe('Search in file contents'),
    caseSensitive: z.boolean().optional().default(false),
    maxResults: z.number().optional().default(20),
    filePattern: z.string().optional().describe('Glob pattern to filter files (e.g., "*.ts", "src/**/*.js")'),
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
  execute: async ({ query, searchCommits, searchFiles, searchContent, caseSensitive, maxResults, filePattern }) => {
    try {
      const repo = Repository.find();
      const searchEngine = new SearchEngine(repo);
      
      const results = searchEngine.search(query, {
        searchCommits,
        searchFiles,
        searchContent,
        caseSensitive,
        maxResults,
        filePattern,
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
    } catch {
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

/**
 * Glob Search Tool
 * Find files by glob pattern only (no text query required)
 */
export const globSearchTool = createTool({
  id: 'wit-glob-search',
  description: 'Find files matching a glob pattern. Use this to locate files by name pattern without searching content. Examples: "*.ts" for TypeScript files, "src/**/*.test.js" for test files in src.',
  inputSchema: z.object({
    pattern: z.string().describe('Glob pattern to match files (e.g., "*.ts", "**/*.test.js", "src/**/*.tsx")'),
    maxResults: z.number().optional().default(50).describe('Maximum number of results to return'),
  }),
  outputSchema: z.object({
    files: z.array(z.object({
      path: z.string(),
      filename: z.string(),
    })),
    totalFiles: z.number(),
    searchTime: z.number(),
  }),
  execute: async ({ pattern, maxResults }) => {
    try {
      const repo = Repository.find();
      const searchEngine = new SearchEngine(repo);
      const startTime = Date.now();
      
      const results = searchEngine.searchFilesByGlob(pattern, { maxResults });
      
      return {
        files: results.map(f => ({
          path: f.path,
          filename: f.filename,
        })),
        totalFiles: results.length,
        searchTime: Date.now() - startTime,
      };
    } catch {
      return {
        files: [],
        totalFiles: 0,
        searchTime: 0,
      };
    }
  },
});

/**
 * Content Search Tool
 * Search for code patterns within specific files
 */
export const contentSearchTool = createTool({
  id: 'wit-content-search',
  description: 'Search for text/code patterns within files. Optionally filter by file type using glob patterns. Returns matching lines with context.',
  inputSchema: z.object({
    query: z.string().describe('Text or regex pattern to search for in file contents'),
    filePattern: z.string().optional().describe('Glob pattern to filter which files to search (e.g., "*.ts", "src/**/*.js")'),
    caseSensitive: z.boolean().optional().default(false),
    contextLines: z.number().optional().default(2).describe('Number of context lines before and after match'),
    maxResults: z.number().optional().default(30),
  }),
  outputSchema: z.object({
    matches: z.array(z.object({
      path: z.string(),
      lineNumber: z.number(),
      lineContent: z.string(),
      matchedText: z.string(),
      contextBefore: z.array(z.string()),
      contextAfter: z.array(z.string()),
    })),
    totalMatches: z.number(),
    searchTime: z.number(),
  }),
  execute: async ({ query, filePattern, caseSensitive, contextLines, maxResults }) => {
    try {
      const repo = Repository.find();
      const searchEngine = new SearchEngine(repo);
      const startTime = Date.now();
      
      const results = searchEngine.search(query, {
        searchCommits: false,
        searchFiles: false,
        searchContent: true,
        caseSensitive,
        contextLines,
        maxResults,
        filePattern,
      });
      
      return {
        matches: results.content.map(c => ({
          path: c.path,
          lineNumber: c.lineNumber,
          lineContent: c.lineContent,
          matchedText: c.matchedText,
          contextBefore: c.context.before,
          contextAfter: c.context.after,
        })),
        totalMatches: results.content.length,
        searchTime: Date.now() - startTime,
      };
    } catch {
      return {
        matches: [],
        totalMatches: 0,
        searchTime: 0,
      };
    }
  },
});
