/**
 * Questions Mode Agent
 * 
 * A read-only agent that helps users understand their codebase.
 * Can read files, search code, and explain concepts but cannot make changes.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { AgentContext } from '../types.js';

export const QUESTIONS_AGENT_INSTRUCTIONS = `You are wit AI in Questions mode - a helpful assistant that helps developers understand their codebase.

## Your Role
You help users understand code, explain concepts, find information, and answer questions about repositories. You are READ-ONLY and cannot make any changes.

## Your Capabilities
- Read and explain code files
- Search for code patterns and files
- Explain architecture and code structure
- Answer questions about how things work
- Help debug by analyzing code
- Suggest improvements (but not implement them)

## What You CANNOT Do
- Write or edit files
- Run commands
- Create commits or branches
- Make any modifications

## Response Style
- Be concise but thorough
- Include code snippets when helpful
- Reference specific files and line numbers
- If asked to make changes, explain that you're in Questions mode and suggest switching to Code mode

When you need to make changes, politely explain: "I'm currently in Questions mode which is read-only. Switch to Code mode if you'd like me to make changes."`;

/**
 * Create read file tool scoped to a repository
 */
function createReadFileTool(context: AgentContext) {
  return createTool({
    id: 'read-file',
    description: 'Read the contents of a file in the repository',
    inputSchema: z.object({
      path: z.string().describe('Path to the file relative to repository root'),
    }),
    outputSchema: z.object({
      content: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ path: filePath }) => {
      try {
        const fs = await import('fs/promises');
        const pathModule = await import('path');
        const fullPath = pathModule.join(context.repoPath, filePath);
        
        // Security: ensure path doesn't escape repo
        if (!fullPath.startsWith(context.repoPath)) {
          return { error: 'Invalid path: cannot access files outside repository' };
        }
        
        const content = await fs.readFile(fullPath, 'utf-8');
        return { content };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to read file' };
      }
    },
  });
}

/**
 * Create list directory tool scoped to a repository
 */
function createListDirectoryTool(context: AgentContext) {
  return createTool({
    id: 'list-directory',
    description: 'List files and directories in a path',
    inputSchema: z.object({
      path: z.string().optional().default('.').describe('Path relative to repository root'),
    }),
    outputSchema: z.object({
      entries: z.array(z.object({
        name: z.string(),
        type: z.enum(['file', 'directory']),
        size: z.number().optional(),
      })).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ path: dirPath }) => {
      try {
        const fs = await import('fs/promises');
        const pathModule = await import('path');
        const fullPath = pathModule.join(context.repoPath, dirPath);
        
        // Security: ensure path doesn't escape repo
        if (!fullPath.startsWith(context.repoPath)) {
          return { error: 'Invalid path: cannot access files outside repository' };
        }
        
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const result = await Promise.all(
          entries
            .filter(e => !e.name.startsWith('.git'))
            .map(async (entry) => {
              const entryPath = pathModule.join(fullPath, entry.name);
              let size: number | undefined;
              if (entry.isFile()) {
                try {
                  const stat = await fs.stat(entryPath);
                  size = stat.size;
                } catch {
                  // Ignore stat errors
                }
              }
              return {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' as const : 'file' as const,
                size,
              };
            })
        );
        return { entries: result };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to list directory' };
      }
    },
  });
}

/**
 * Create search tool scoped to a repository
 */
function createSearchTool(context: AgentContext) {
  return createTool({
    id: 'search',
    description: 'Search for text patterns in the repository',
    inputSchema: z.object({
      pattern: z.string().describe('Text or regex pattern to search for'),
      filePattern: z.string().optional().describe('Glob pattern to filter files (e.g., "*.ts")'),
    }),
    outputSchema: z.object({
      matches: z.array(z.object({
        file: z.string(),
        line: z.number(),
        content: z.string(),
      })).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ pattern, filePattern }) => {
      try {
        const { execSync } = await import('child_process');
        
        // Use grep for searching
        let cmd = `grep -rn "${pattern.replace(/"/g, '\\"')}" .`;
        if (filePattern) {
          cmd = `grep -rn --include="${filePattern}" "${pattern.replace(/"/g, '\\"')}" .`;
        }
        
        const result = execSync(cmd, {
          cwd: context.repoPath,
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        });
        
        const matches = result
          .split('\n')
          .filter(Boolean)
          .slice(0, 50) // Limit results
          .map(line => {
            const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
            if (match) {
              return {
                file: match[1],
                line: parseInt(match[2], 10),
                content: match[3].trim(),
              };
            }
            return null;
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);
        
        return { matches };
      } catch (error) {
        // grep returns exit code 1 when no matches found
        if (error instanceof Error && 'status' in error && (error as any).status === 1) {
          return { matches: [] };
        }
        return { error: error instanceof Error ? error.message : 'Search failed' };
      }
    },
  });
}

/**
 * Create a Questions mode agent for a specific repository
 */
export function createQuestionsAgent(context: AgentContext, model: string = 'anthropic/claude-opus-4-5'): Agent {
  return new Agent({
    id: `wit-questions-${context.repoId}`,
    name: 'wit Questions Agent',
    description: 'A read-only agent that helps understand codebases',
    instructions: QUESTIONS_AGENT_INSTRUCTIONS,
    model,
    tools: {
      readFile: createReadFileTool(context),
      listDirectory: createListDirectoryTool(context),
      search: createSearchTool(context),
    },
  });
}
