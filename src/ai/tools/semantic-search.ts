/**
 * Semantic Search Tool
 * 
 * AI tool for natural language code search using embeddings.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { createSemanticSearch } from '../../search/index.js';

/**
 * Semantic search tool for AI agent
 */
export const semanticSearchTool = createTool({
  id: 'wit-semantic-search',
  description: `Search the codebase using natural language queries. This tool uses AI embeddings to find semantically relevant code based on meaning, not just keywords.

Use this tool when you need to:
- Find code that handles a specific concept (e.g., "find authentication logic")
- Locate functions or classes by their purpose (e.g., "code that validates user input")
- Search for implementations of specific features (e.g., "error handling in API calls")
- Find code related to a concept even if the exact terms aren't used

The search returns code snippets ranked by semantic similarity to your query.`,
  inputSchema: z.object({
    query: z.string().describe('Natural language description of what you\'re looking for (e.g., "function that handles user authentication", "code that validates email addresses")'),
    limit: z.number().optional().default(10).describe('Maximum number of results to return'),
    minSimilarity: z.number().optional().default(0.5).describe('Minimum similarity threshold (0-1, higher = more relevant)'),
    pathPattern: z.string().optional().describe('Filter results to files matching this pattern'),
    language: z.string().optional().describe('Filter by programming language'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      path: z.string(),
      startLine: z.number(),
      endLine: z.number(),
      content: z.string(),
      score: z.number(),
      chunkType: z.string(),
      chunkName: z.string().optional(),
      language: z.string(),
    })),
    totalResults: z.number(),
    query: z.string(),
    searchTime: z.number(),
  }),
  execute: async ({ query, limit, minSimilarity, pathPattern, language }) => {
    const startTime = Date.now();
    
    try {
      const repo = Repository.find();
      const semanticSearch = createSemanticSearch(repo);
      
      const results = await semanticSearch.search(query, {
        limit,
        minSimilarity,
        pathPattern,
        language,
      });

      return {
        results: results.map(r => ({
          path: r.path,
          startLine: r.startLine,
          endLine: r.endLine,
          content: r.content,
          score: r.score,
          chunkType: r.chunkType,
          chunkName: r.chunkName,
          language: r.language,
        })),
        totalResults: results.length,
        query,
        searchTime: Date.now() - startTime,
      };
    } catch (_error) {
      // Return empty results on error
      return {
        results: [],
        totalResults: 0,
        query,
        searchTime: Date.now() - startTime,
      };
    }
  },
});

/**
 * Tool to index the repository for semantic search
 */
export const indexRepositoryTool = createTool({
  id: 'wit-index-repository',
  description: `Index the repository for semantic search. This creates embeddings for all code files to enable natural language search.

Use this tool when:
- Setting up semantic search for the first time
- After significant code changes
- When search results seem outdated

Note: This operation may take a while for large repositories and requires an OpenAI API key.`,
  inputSchema: z.object({
    force: z.boolean().optional().default(false).describe('Force reindex all files, even if unchanged'),
    include: z.array(z.string()).optional().describe('File patterns to include (e.g., ["*.ts", "*.js"])'),
    exclude: z.array(z.string()).optional().describe('File patterns to exclude'),
  }),
  outputSchema: z.object({
    filesIndexed: z.number(),
    filesSkipped: z.number(),
    chunksCreated: z.number(),
    errorsCount: z.number(),
    duration: z.number(),
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ force, include, exclude }) => {
    try {
      const repo = Repository.find();
      const semanticSearch = createSemanticSearch(repo);
      
      const stats = await semanticSearch.indexRepository({
        force,
        include,
        exclude,
        verbose: false,
      });

      return {
        filesIndexed: stats.filesIndexed,
        filesSkipped: stats.filesSkipped,
        chunksCreated: stats.chunksCreated,
        errorsCount: stats.errors.length,
        duration: stats.duration,
        success: true,
        message: `Successfully indexed ${stats.filesIndexed} files with ${stats.chunksCreated} code chunks`,
      };
    } catch (error) {
      return {
        filesIndexed: 0,
        filesSkipped: 0,
        chunksCreated: 0,
        errorsCount: 1,
        duration: 0,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error during indexing',
      };
    }
  },
});

/**
 * Tool to get semantic search index status
 */
export const getIndexStatusTool = createTool({
  id: 'wit-index-status',
  description: 'Get the status of the semantic search index, including number of indexed files and vectors.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    vectorCount: z.number(),
    fileCount: z.number(),
    dimensions: z.number(),
    lastUpdated: z.string(),
    isReady: z.boolean(),
  }),
  execute: async () => {
    try {
      const repo = Repository.find();
      const semanticSearch = createSemanticSearch(repo);
      
      const stats = semanticSearch.getStats();

      return {
        vectorCount: stats.vectorCount,
        fileCount: stats.fileCount,
        dimensions: stats.dimensions,
        lastUpdated: stats.lastUpdated.toISOString(),
        isReady: stats.vectorCount > 0,
      };
    } catch {
      return {
        vectorCount: 0,
        fileCount: 0,
        dimensions: 0,
        lastUpdated: new Date(0).toISOString(),
        isReady: false,
      };
    }
  },
});
