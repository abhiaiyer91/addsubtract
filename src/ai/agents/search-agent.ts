/**
 * Search Agent
 * 
 * Specialized agent for finding and understanding code.
 * Uses semantic search and knowledge base to answer questions.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { AgentContext } from '../types.js';
import { 
  buildContext, 
  formatContextForPrompt,
  buildContextWithBudget,
} from '../knowledge/context-builder.js';
import { getKnowledgeBase } from '../knowledge/knowledge-base.js';

export const SEARCH_AGENT_INSTRUCTIONS = `You are wit AI's Code Search specialist. You help developers find and understand code in their codebase.

## Your Capabilities

1. **Semantic Search**: Find code by meaning, not just keywords
2. **Pattern Recognition**: Find similar code patterns across the codebase
3. **Dependency Analysis**: Understand what uses what
4. **History Search**: Find when and why things were changed
5. **Documentation Search**: Find relevant docs and comments

## Search Strategy

For any query:

1. **Understand the Question**: What is the user really looking for?
2. **Choose Search Type**:
   - Concept/meaning → Semantic search
   - Specific string → Text search
   - Usage patterns → Dependency search
   - When/why changed → History search
3. **Combine Results**: Often multiple search types give better answers
4. **Provide Context**: Don't just return snippets, explain what they are

## Response Format

When answering questions about code:

1. **Direct Answer**: Answer the question first
2. **Code References**: Show relevant code with file paths and line numbers
3. **Explanation**: Explain what the code does and how it fits together
4. **Related Info**: Mention related code they might want to know about

## Example Responses

**Q: "Where is authentication handled?"**

Authentication is handled in \`src/core/auth.ts\`. Here's the main flow:

1. **Session creation** (\`auth.ts:45-60\`):
   \`\`\`typescript
   export async function createSession(userId: string) {
     // ...
   }
   \`\`\`

2. **Middleware** (\`middleware/auth.ts\`):
   - Validates tokens on each request
   - Extracts user from session

Related: The auth routes are in \`src/routes/auth.ts\`.

## Guidelines

- Be specific with file paths and line numbers
- Show actual code, not just descriptions
- Explain HOW code works, not just WHERE it is
- Mention related code that might be useful
- If you can't find something, suggest alternatives`;

/**
 * Tool for semantic code search
 */
function createSemanticSearchTool(context: AgentContext) {
  return createTool({
    id: 'semantic-search',
    description: 'Search the codebase using natural language. Finds code by meaning, not just keywords.',
    inputSchema: z.object({
      query: z.string().describe('Natural language query describing what you\'re looking for'),
      limit: z.number().optional().default(5).describe('Maximum results'),
      type: z.enum(['code', 'documentation', 'all']).optional().default('all'),
    }),
    outputSchema: z.object({
      results: z.array(z.object({
        path: z.string(),
        content: z.string(),
        similarity: z.number(),
        lines: z.string().optional(),
      })),
      summary: z.string(),
    }),
    execute: async ({ query, limit, type }) => {
      try {
        const kb = getKnowledgeBase(context.repoId);
        await kb.init();
        
        const types = type === 'all' 
          ? ['code', 'documentation'] as const
          : [type] as const;
        
        const results = await kb.query(query, {
          type: types as any,
          limit,
          minSimilarity: 0.4,
        });
        
        return {
          results: results.map(r => ({
            path: r.chunk.metadata.path || 'unknown',
            content: r.chunk.content,
            similarity: Math.round(r.similarity * 100) / 100,
            lines: r.chunk.metadata.startLine 
              ? `${r.chunk.metadata.startLine}-${r.chunk.metadata.endLine}`
              : undefined,
          })),
          summary: `Found ${results.length} results for "${query}"`,
        };
      } catch (error) {
        return {
          results: [],
          summary: `Search failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
      }
    },
  });
}

/**
 * Tool for text/grep search
 */
function createTextSearchTool(context: AgentContext) {
  return createTool({
    id: 'text-search',
    description: 'Search for exact text or patterns in code. Use for specific strings, function names, etc.',
    inputSchema: z.object({
      pattern: z.string().describe('Text pattern to search for'),
      caseSensitive: z.boolean().optional().default(false),
      filePattern: z.string().optional().describe('Glob pattern to filter files (e.g., "*.ts")'),
    }),
    outputSchema: z.object({
      matches: z.array(z.object({
        path: z.string(),
        line: z.number(),
        content: z.string(),
      })),
      totalMatches: z.number(),
    }),
    execute: async ({ pattern, caseSensitive, filePattern }) => {
      try {
        // Use wit's built-in search
        const { searchTool } = await import('../tools/search.js');
        
        const result = await searchTool.execute?.({
          query: pattern,
          searchCommits: false,
          searchFiles: false,
          searchContent: true,
          caseSensitive: caseSensitive ?? false,
          maxResults: 20,
          filePattern,
        }, {} as any);
        
        if (!result || 'error' in result) {
          return { matches: [], totalMatches: 0 };
        }
        
        // Map the content results to matches format
        const typedResult = result as { content: Array<{ path: string; lineNumber: number; lineContent: string }> };
        const matches = (typedResult.content || []).map((c) => ({
          path: c.path,
          line: c.lineNumber,
          content: c.lineContent,
        }));
        
        return {
          matches,
          totalMatches: matches.length,
        };
      } catch {
        return { matches: [], totalMatches: 0 };
      }
    },
  });
}

/**
 * Tool to find usages of a symbol
 */
function createFindUsagesTool(context: AgentContext) {
  return createTool({
    id: 'find-usages',
    description: 'Find all usages of a function, class, or variable',
    inputSchema: z.object({
      symbol: z.string().describe('The symbol name to find usages of'),
      type: z.enum(['function', 'class', 'variable', 'any']).optional().default('any'),
    }),
    outputSchema: z.object({
      usages: z.array(z.object({
        path: z.string(),
        line: z.number(),
        context: z.string(),
        usageType: z.string(),
      })),
      definition: z.object({
        path: z.string(),
        line: z.number(),
        content: z.string(),
      }).optional(),
    }),
    execute: async ({ symbol, type }) => {
      try {
        const kb = getKnowledgeBase(context.repoId);
        await kb.init();
        
        // Search for the symbol
        const results = await kb.query(`${symbol} ${type === 'any' ? '' : type}`, {
          type: 'code',
          limit: 20,
          minSimilarity: 0.3,
        });
        
        // Find definition (usually highest similarity with construct name matching)
        const definition = results.find(r => 
          r.chunk.metadata.constructName === symbol
        );
        
        // Find usages (other occurrences)
        const usages = results
          .filter(r => r.chunk.content.includes(symbol))
          .map(r => ({
            path: r.chunk.metadata.path || 'unknown',
            line: r.chunk.metadata.startLine || 0,
            context: r.chunk.content.split('\n').find(l => l.includes(symbol)) || '',
            usageType: r.chunk.metadata.constructType || 'unknown',
          }));
        
        return {
          usages,
          definition: definition ? {
            path: definition.chunk.metadata.path || 'unknown',
            line: definition.chunk.metadata.startLine || 0,
            content: definition.chunk.content,
          } : undefined,
        };
      } catch {
        return { usages: [] };
      }
    },
  });
}

/**
 * Tool to search git history
 */
function createHistorySearchTool(context: AgentContext) {
  return createTool({
    id: 'search-history',
    description: 'Search git commit history and PR descriptions',
    inputSchema: z.object({
      query: z.string().describe('What to search for in history'),
      limit: z.number().optional().default(10),
    }),
    outputSchema: z.object({
      commits: z.array(z.object({
        sha: z.string().optional(),
        message: z.string(),
        author: z.string().optional(),
        date: z.string().optional(),
      })),
    }),
    execute: async ({ query, limit }) => {
      try {
        const kb = getKnowledgeBase(context.repoId);
        await kb.init();
        
        const results = await kb.query(query, {
          type: 'git-history',
          limit,
          minSimilarity: 0.3,
        });
        
        return {
          commits: results.map(r => ({
            sha: r.chunk.metadata.commitSha,
            message: r.chunk.content.split('\n')[0],
            author: r.chunk.metadata.author,
            date: r.chunk.metadata.timestamp?.toISOString(),
          })),
        };
      } catch {
        return { commits: [] };
      }
    },
  });
}

/**
 * Tool to get full context for a question
 */
function createGetFullContextTool(context: AgentContext) {
  return createTool({
    id: 'get-full-context',
    description: 'Get comprehensive context about a topic from the codebase',
    inputSchema: z.object({
      question: z.string().describe('The question to get context for'),
    }),
    outputSchema: z.object({
      context: z.string(),
      sources: z.array(z.string()),
    }),
    execute: async ({ question }) => {
      try {
        const aiContext = await buildContextWithBudget(question, context.repoId, 4000);
        const formatted = formatContextForPrompt(aiContext);
        
        const sources = [
          ...aiContext.relevantCode.map(r => r.chunk.metadata.path),
          ...aiContext.relevantDocs.map(r => r.chunk.metadata.path),
        ].filter((p): p is string => !!p);
        
        return {
          context: formatted,
          sources: [...new Set(sources)],
        };
      } catch {
        return { context: '', sources: [] };
      }
    },
  });
}

/**
 * Tool to explain a file or function
 */
function createExplainTool(context: AgentContext) {
  return createTool({
    id: 'explain-code',
    description: 'Get a detailed explanation of a file or code section',
    inputSchema: z.object({
      path: z.string().describe('File path to explain'),
      startLine: z.number().optional().describe('Start line (if explaining a section)'),
      endLine: z.number().optional().describe('End line (if explaining a section)'),
    }),
    outputSchema: z.object({
      explanation: z.string(),
      imports: z.array(z.string()),
      exports: z.array(z.string()),
      dependencies: z.array(z.string()),
    }),
    execute: async ({ path: filePath }) => {
      try {
        const kb = getKnowledgeBase(context.repoId);
        await kb.init();
        
        // Get all chunks for this file
        const results = await kb.query(filePath, {
          type: 'code',
          pathPattern: filePath,
          limit: 20,
        });
        
        if (results.length === 0) {
          return {
            explanation: `File not found in knowledge base: ${filePath}`,
            imports: [],
            exports: [],
            dependencies: [],
          };
        }
        
        // Extract structure from chunks
        const content = results.map(r => r.chunk.content).join('\n\n');
        const imports = content.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g) || [];
        const exports = results
          .filter(r => r.chunk.metadata.constructName)
          .map(r => `${r.chunk.metadata.constructType}: ${r.chunk.metadata.constructName}`);
        
        return {
          explanation: `File contains ${results.length} code sections.`,
          imports: imports.slice(0, 10),
          exports: exports.slice(0, 10),
          dependencies: [],
        };
      } catch {
        return {
          explanation: 'Failed to explain code',
          imports: [],
          exports: [],
          dependencies: [],
        };
      }
    },
  });
}

/**
 * Create a Search Agent for a repository
 */
export function createSearchAgent(context: AgentContext, model: string = 'anthropic/claude-sonnet-4-20250514'): Agent {
  return new Agent({
    id: `wit-search-${context.repoId}`,
    name: 'wit Search Agent',
    description: 'Specialized agent for finding and understanding code',
    instructions: SEARCH_AGENT_INSTRUCTIONS,
    model,
    tools: {
      semanticSearch: createSemanticSearchTool(context),
      textSearch: createTextSearchTool(context),
      findUsages: createFindUsagesTool(context),
      searchHistory: createHistorySearchTool(context),
      getFullContext: createGetFullContextTool(context),
      explainCode: createExplainTool(context),
    },
  });
}
