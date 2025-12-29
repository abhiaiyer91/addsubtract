/**
 * Planning Agent
 * 
 * An AI agent that helps users plan complex development tasks.
 * It operates in a planning loop where users can iterate on the plan
 * until they're satisfied, then generates tasks for parallel coding agents.
 * 
 * The planning agent:
 * 1. Analyzes the user's high-level request
 * 2. Explores the codebase to understand context
 * 3. Proposes a plan with discrete tasks
 * 4. Iterates based on user feedback
 * 5. Generates structured tasks ready for parallel execution
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { AgentContext } from '../types.js';
import { VirtualRepository } from '../../primitives/virtual-repository.js';

export const PLANNING_AGENT_INSTRUCTIONS = `You are wit AI Planning Agent - an expert software architect that helps developers plan complex tasks and break them down into parallelizable work units.

## Your Role

You help developers:
1. Understand their high-level requirements
2. Explore the codebase to gather context
3. Create detailed implementation plans
4. Break down work into discrete, parallelizable tasks
5. Iterate on the plan based on feedback

## Planning Process

### Phase 1: Understanding
- Ask clarifying questions about the requirements
- Understand the scope and constraints
- Identify potential challenges

### Phase 2: Exploration
- Use readFile and listDirectory to understand the codebase
- Identify relevant patterns and conventions
- Find existing code that relates to the task

### Phase 3: Planning
- Propose a structured plan with clear tasks
- Identify dependencies between tasks
- Estimate relative complexity
- Suggest which tasks can run in parallel

### Phase 4: Iteration
- Refine the plan based on user feedback
- Add or remove tasks as needed
- Adjust priorities and dependencies

### Phase 5: Finalization
- Generate a final list of structured tasks
- Each task should be self-contained with clear instructions
- Tasks should be executable by independent coding agents

## Task Structure

When you finalize a plan, output tasks in this format:

\`\`\`json
{
  "tasks": [
    {
      "title": "Brief task title",
      "description": "Detailed description of what the coding agent should do",
      "targetFiles": ["file1.ts", "file2.ts"],
      "priority": "high|medium|low",
      "dependsOn": [1, 2]  // Task numbers this depends on (empty array if none)
    }
  ]
}
\`\`\`

## Guidelines

### Task Decomposition
- Each task should be completable in one coding session
- Avoid tasks that are too broad ("refactor entire codebase")
- Avoid tasks that are too narrow ("add semicolon to line 5")
- Aim for tasks that can be independently tested

### Dependencies
- Minimize dependencies to maximize parallelism
- Core changes (types, interfaces) should come first
- Implementation tasks can often run in parallel
- Tests can run after implementation

### Parallelism
- Tasks without dependencies can run in parallel
- Group related tasks that share context
- Consider resource conflicts (same files)

## Safety Rules
- Never suggest modifying .git or .wit directories
- Be conservative with destructive changes
- Recommend backups for risky operations

## Communication Style
- Be collaborative and iterative
- Explain your reasoning
- Ask for confirmation before major decisions
- Provide clear progress updates`;

// Cache for VirtualRepository instances
const repoCache = new Map<string, VirtualRepository>();

/**
 * Get or create a VirtualRepository for the given context
 */
function getVirtualRepo(context: AgentContext): VirtualRepository {
  const cached = repoCache.get(context.repoPath);
  if (cached) {
    return cached;
  }

  const vrepo = new VirtualRepository(context.repoPath);
  
  // Try to checkout main branch if it exists
  try {
    vrepo.checkout('main');
  } catch {
    try {
      vrepo.checkout('master');
    } catch {
      // Empty repo
    }
  }

  repoCache.set(context.repoPath, vrepo);
  return vrepo;
}

/**
 * Create read file tool for planning
 */
function createReadFileTool(context: AgentContext) {
  return createTool({
    id: 'read-file',
    description: 'Read the contents of a file to understand the codebase',
    inputSchema: z.object({
      path: z.string().describe('Path to the file relative to repository root'),
    }),
    outputSchema: z.object({
      content: z.string().optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ path: filePath }) => {
      try {
        const vrepo = getVirtualRepo(context);
        const content = vrepo.read(filePath);
        
        if (content === null) {
          return { errorMessage: `File not found: ${filePath}` };
        }
        
        return { content };
      } catch (error) {
        return { errorMessage: error instanceof Error ? error.message : 'Failed to read file' };
      }
    },
  });
}

/**
 * Create list directory tool for exploration
 */
function createListDirectoryTool(context: AgentContext) {
  return createTool({
    id: 'list-directory',
    description: 'List files and directories to explore the codebase structure',
    inputSchema: z.object({
      path: z.string().optional().default('.').describe('Directory path (default: root)'),
      recursive: z.boolean().optional().default(false).describe('List recursively'),
      maxDepth: z.number().optional().default(3).describe('Maximum recursion depth'),
    }),
    outputSchema: z.object({
      entries: z.array(z.object({
        name: z.string(),
        path: z.string(),
        type: z.enum(['file', 'dir']),
      })).optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ path: dirPath, recursive, maxDepth }) => {
      try {
        const vrepo = getVirtualRepo(context);
        
        if (recursive) {
          // Get all files and filter by depth
          const allPaths = vrepo.getAllFilePaths();
          const normalizedDir = dirPath === '.' ? '' : dirPath.replace(/\/$/, '') + '/';
          
          const entries = allPaths
            .filter(p => normalizedDir === '' || p.startsWith(normalizedDir))
            .filter(p => {
              const relativePath = normalizedDir === '' ? p : p.slice(normalizedDir.length);
              const depth = relativePath.split('/').length;
              return depth <= maxDepth;
            })
            .map(p => ({
              name: p.split('/').pop() || p,
              path: p,
              type: 'file' as const,
            }));
          
          return { entries };
        } else {
          const entries = vrepo.list(dirPath);
          return { entries };
        }
      } catch (error) {
        return { errorMessage: error instanceof Error ? error.message : 'Failed to list directory' };
      }
    },
  });
}

/**
 * Create search tool for finding relevant code
 */
function createSearchTool(context: AgentContext) {
  return createTool({
    id: 'search-code',
    description: 'Search for code patterns or text in the repository',
    inputSchema: z.object({
      query: z.string().describe('Search query (simple text or regex pattern)'),
      filePattern: z.string().optional().describe('File pattern to filter (e.g., "*.ts", "src/**/*.tsx")'),
    }),
    outputSchema: z.object({
      matches: z.array(z.object({
        file: z.string(),
        line: z.number(),
        content: z.string(),
      })).optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ query, filePattern }) => {
      try {
        const vrepo = getVirtualRepo(context);
        const allPaths = vrepo.getAllFilePaths();
        
        // Filter by file pattern if provided
        let filesToSearch = allPaths;
        if (filePattern) {
          const pattern = filePattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\./g, '\\.');
          const regex = new RegExp(pattern);
          filesToSearch = allPaths.filter(p => regex.test(p));
        }
        
        const matches: Array<{ file: string; line: number; content: string }> = [];
        const searchRegex = new RegExp(query, 'gi');
        
        for (const filePath of filesToSearch.slice(0, 100)) { // Limit files to search
          const content = vrepo.read(filePath);
          if (!content) continue;
          
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (searchRegex.test(lines[i])) {
              matches.push({
                file: filePath,
                line: i + 1,
                content: lines[i].trim().slice(0, 200),
              });
              
              if (matches.length >= 50) break; // Limit matches
            }
          }
          
          if (matches.length >= 50) break;
        }
        
        return { matches };
      } catch (error) {
        return { errorMessage: error instanceof Error ? error.message : 'Search failed' };
      }
    },
  });
}

/**
 * Create analyze structure tool
 */
function createAnalyzeStructureTool(context: AgentContext) {
  return createTool({
    id: 'analyze-structure',
    description: 'Analyze the overall project structure and identify key components',
    inputSchema: z.object({}),
    outputSchema: z.object({
      projectType: z.string(),
      framework: z.string().optional(),
      language: z.string(),
      directories: z.array(z.object({
        path: z.string(),
        purpose: z.string(),
        fileCount: z.number(),
      })),
      keyFiles: z.array(z.string()),
      dependencies: z.array(z.string()).optional(),
    }),
    execute: async () => {
      try {
        const vrepo = getVirtualRepo(context);
        const allPaths = vrepo.getAllFilePaths();
        
        // Analyze project type
        let projectType = 'unknown';
        let framework: string | undefined;
        let language = 'javascript';
        const keyFiles: string[] = [];
        const dependencies: string[] = [];
        
        // Check for package.json
        const packageJson = vrepo.read('package.json');
        if (packageJson) {
          keyFiles.push('package.json');
          try {
            const pkg = JSON.parse(packageJson);
            projectType = 'node';
            
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            dependencies.push(...Object.keys(allDeps).slice(0, 20));
            
            if (allDeps.react) {
              framework = 'react';
            } else if (allDeps.vue) {
              framework = 'vue';
            } else if (allDeps.next) {
              framework = 'nextjs';
            } else if (allDeps.express) {
              framework = 'express';
            } else if (allDeps.hono) {
              framework = 'hono';
            }
            
            if (allDeps.typescript) {
              language = 'typescript';
            }
          } catch {
            // Invalid JSON
          }
        }
        
        // Check for other project types
        if (vrepo.exists('Cargo.toml')) {
          projectType = 'rust';
          language = 'rust';
          keyFiles.push('Cargo.toml');
        } else if (vrepo.exists('go.mod')) {
          projectType = 'go';
          language = 'go';
          keyFiles.push('go.mod');
        } else if (vrepo.exists('requirements.txt') || vrepo.exists('pyproject.toml')) {
          projectType = 'python';
          language = 'python';
          if (vrepo.exists('pyproject.toml')) {
            keyFiles.push('pyproject.toml');
          } else {
            keyFiles.push('requirements.txt');
          }
        }
        
        // Analyze directory structure
        const dirCounts = new Map<string, number>();
        for (const path of allPaths) {
          const parts = path.split('/');
          if (parts.length > 1) {
            const topDir = parts[0];
            dirCounts.set(topDir, (dirCounts.get(topDir) || 0) + 1);
          }
        }
        
        const directories = Array.from(dirCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([path, fileCount]) => {
            let purpose = 'unknown';
            if (path === 'src') purpose = 'Source code';
            else if (path === 'tests' || path === 'test' || path === '__tests__') purpose = 'Tests';
            else if (path === 'docs') purpose = 'Documentation';
            else if (path === 'lib') purpose = 'Library code';
            else if (path === 'bin') purpose = 'Executables';
            else if (path === 'scripts') purpose = 'Build/utility scripts';
            else if (path === 'public') purpose = 'Static assets';
            else if (path === 'components') purpose = 'UI components';
            else if (path === 'pages') purpose = 'Page components';
            else if (path === 'api') purpose = 'API routes/handlers';
            else if (path === 'utils' || path === 'helpers') purpose = 'Utility functions';
            else if (path === 'hooks') purpose = 'React hooks';
            else if (path === 'types') purpose = 'Type definitions';
            else if (path === 'config') purpose = 'Configuration';
            else if (path === 'assets') purpose = 'Assets';
            else if (path === 'styles') purpose = 'Stylesheets';
            
            return { path, purpose, fileCount };
          });
        
        // Add key configuration files
        const configFiles = ['tsconfig.json', '.eslintrc.js', '.eslintrc.json', 'vite.config.ts', 'next.config.js', 'drizzle.config.ts'];
        for (const file of configFiles) {
          if (vrepo.exists(file)) {
            keyFiles.push(file);
          }
        }
        
        return {
          projectType,
          framework,
          language,
          directories,
          keyFiles,
          dependencies,
        };
      } catch (error) {
        return {
          projectType: 'unknown',
          language: 'unknown',
          directories: [],
          keyFiles: [],
        };
      }
    },
  });
}

/**
 * Task generation schema (for structured output)
 */
export const TaskGenerationSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().describe('Brief task title (max 100 chars)'),
    description: z.string().describe('Detailed instructions for the coding agent'),
    targetFiles: z.array(z.string()).optional().describe('Files to create or modify'),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    dependsOn: z.array(z.number()).optional().describe('Task numbers this depends on (1-indexed)'),
  })),
  summary: z.string().describe('Brief summary of the overall plan'),
});

export type TaskGeneration = z.infer<typeof TaskGenerationSchema>;

/**
 * Create the Planning Agent
 */
export function createPlanningAgent(
  context: AgentContext,
  model: string = 'anthropic/claude-sonnet-4-20250514'
): Agent {
  return new Agent({
    id: `wit-planning-${context.repoId}`,
    name: 'wit Planning Agent',
    description: 'An AI agent that helps plan complex tasks and break them into parallelizable work units',
    instructions: PLANNING_AGENT_INSTRUCTIONS,
    model,
    tools: {
      readFile: createReadFileTool(context),
      listDirectory: createListDirectoryTool(context),
      searchCode: createSearchTool(context),
      analyzeStructure: createAnalyzeStructureTool(context),
    },
  });
}

/**
 * Parse task output from agent response
 */
export function parseTasksFromResponse(response: string): TaskGeneration | null {
  try {
    // Try to find JSON in the response
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return TaskGenerationSchema.parse(parsed);
    }
    
    // Try to parse the whole response as JSON
    const parsed = JSON.parse(response);
    return TaskGenerationSchema.parse(parsed);
  } catch {
    return null;
  }
}
