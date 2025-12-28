/**
 * Code Mode Agent
 * 
 * A full-featured coding agent that can:
 * - Read and write files
 * - Create branches and commits
 * - Run commands (sandboxed)
 * 
 * All operations are scoped to the server-side repository using
 * wit's VirtualRepository for in-memory file operations on bare repos.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn } from 'child_process';
import type { AgentContext } from '../types.js';
import { VirtualRepository } from '../../primitives/virtual-repository.js';
import type { Author } from '../../core/types.js';

export const CODE_AGENT_INSTRUCTIONS = `You are wit AI in Code mode - a powerful coding agent that can write code, edit files, and manage the development workflow.

## Your Role
You help developers write code, make changes, and manage their git workflow. All changes happen in the wit platform's repository on the main branch.

## Your Capabilities

### File Operations (auto-committed to main branch)
- **readFile**: Read file contents
- **writeFile**: Create or overwrite files (automatically committed)
- **editFile**: Make targeted edits to existing files (automatically committed)
- **deleteFile**: Delete files (automatically committed)
- **listDirectory**: Browse the repository structure

### Git Operations
- **createBranch**: Create a new branch (for PRs) - does NOT switch branches
- **getHistory**: View commit history

## Workflow

### Making Changes
1. ALWAYS read a file before editing it
2. Use editFile for small changes, writeFile for new files
3. All file changes are automatically committed to main - no need to call commit separately

### IMPORTANT
- All your work happens on the main branch
- Do NOT try to switch branches - the IDE only shows main branch
- createBranch just creates a branch pointer for future PRs, it doesn't switch to it

## Safety Rules
- Never modify .git or .wit directories
- Ask for clarification if requirements are unclear`;

// Allowed commands for sandboxed execution
const ALLOWED_COMMANDS = new Set([
  'npm', 'npx', 'yarn', 'pnpm', 'bun',
  'node', 'tsc', 'tsx', 'vite', 'webpack',
  'jest', 'vitest', 'mocha', 'pytest', 'cargo',
  'eslint', 'prettier', 'biome',
  'cat', 'ls', 'pwd', 'head', 'tail', 'grep', 'find', 'wc',
]);

// Cache for VirtualRepository instances per repoPath
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
    // Repo might be empty or have different default branch
    try {
      vrepo.checkout('master');
    } catch {
      // Empty repo - that's fine
    }
  }

  repoCache.set(context.repoPath, vrepo);
  return vrepo;
}

/**
 * Get default author info for commits
 */
function getDefaultAuthor(): Author {
  return {
    name: 'wit AI',
    email: 'ai@wit.dev',
    timestamp: Math.floor(Date.now() / 1000),
    timezone: '+0000',
  };
}

/**
 * Create read file tool scoped to a repository
 */
function createReadFileTool(context: AgentContext) {
  return createTool({
    id: 'read-file',
    description: 'Read the contents of a file from the repository',
    inputSchema: z.object({
      path: z.string().describe('Path to the file relative to repository root'),
    }),
    outputSchema: z.object({
      content: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ path: filePath }: { path: string }) => {
      try {
        const vrepo = getVirtualRepo(context);
        const content = vrepo.read(filePath);
        
        if (content === null) {
          // Check if repo is empty
          if (vrepo.getAllFilePaths().length === 0) {
            return { error: 'Repository is empty. Use writeFile to create the first file.' };
          }
          return { error: `File not found: ${filePath}` };
        }
        
        return { content };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to read file' };
      }
    },
  } as any);
}

/**
 * Create write file tool scoped to a repository
 */
function createWriteFileTool(context: AgentContext) {
  return createTool({
    id: 'write-file',
    description: 'Write content to a file (creates or overwrites). The file is automatically committed to the repository.',
    inputSchema: z.object({
      path: z.string().describe('Path to the file relative to repository root'),
      content: z.string().describe('Content to write'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      commitHash: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ path: filePath, content }: { path: string; content: string }) => {
      try {
        // Validate path
        if (filePath.startsWith('.git/') || filePath === '.git') {
          return { success: false, error: 'Cannot modify .git directory' };
        }
        if (filePath.startsWith('.wit/') || filePath === '.wit') {
          return { success: false, error: 'Cannot modify .wit directory' };
        }
        if (filePath.startsWith('/') || filePath.includes('..')) {
          return { success: false, error: 'Invalid path: must be relative without ..' };
        }

        const vrepo = getVirtualRepo(context);
        
        // Check if file exists before writing
        const isNew = !vrepo.exists(filePath);
        
        vrepo.write(filePath, content);
        
        // Auto-commit so changes are immediately visible in the file explorer
        const author = getDefaultAuthor();
        const message = isNew ? `Create ${filePath}` : `Update ${filePath}`;
        const commitHash = vrepo.commit(message, author);
        
        console.log(`[writeFile] Committed: ${filePath} -> ${commitHash.slice(0, 8)}`);
        return { success: true, commitHash: commitHash.slice(0, 8) };
      } catch (error) {
        console.error('[writeFile] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to write file' };
      }
    },
  } as any);
}

/**
 * Create edit file tool (search and replace)
 */
function createEditFileTool(context: AgentContext) {
  return createTool({
    id: 'edit-file',
    description: 'Edit a file by replacing specific text. Always read the file first! The change is automatically committed.',
    inputSchema: z.object({
      path: z.string().describe('Path to the file'),
      oldText: z.string().describe('Exact text to find and replace'),
      newText: z.string().describe('Text to replace with'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      commitHash: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ path: filePath, oldText, newText }: { path: string; oldText: string; newText: string }) => {
      try {
        const vrepo = getVirtualRepo(context);
        const content = vrepo.read(filePath);
        
        if (content === null) {
          return { success: false, error: `File not found: ${filePath}` };
        }
        
        if (!content.includes(oldText)) {
          return { success: false, error: 'oldText not found in file. Make sure to read the file first and use exact text.' };
        }
        
        const newContent = content.replace(oldText, newText);
        vrepo.write(filePath, newContent);
        
        // Auto-commit so changes are immediately visible
        const author = getDefaultAuthor();
        const commitHash = vrepo.commit(`Edit ${filePath}`, author);
        
        console.log(`[editFile] Committed: ${filePath} -> ${commitHash.slice(0, 8)}`);
        return { success: true, commitHash: commitHash.slice(0, 8) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to edit file' };
      }
    },
  } as any);
}

/**
 * Create list directory tool
 */
function createListDirectoryTool(context: AgentContext) {
  return createTool({
    id: 'list-directory',
    description: 'List files and directories in the repository',
    inputSchema: z.object({
      path: z.string().optional().default('.').describe('Directory path (default: root)'),
    }),
    outputSchema: z.object({
      entries: z.array(z.object({
        name: z.string(),
        path: z.string(),
        type: z.enum(['file', 'dir']),
      })).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ path: dirPath }: { path: string }): Promise<{ entries?: Array<{ name: string; path: string; type: 'file' | 'dir' }>; error?: string }> => {
      try {
        const vrepo = getVirtualRepo(context);
        const entries = vrepo.list(dirPath);
        
        if (entries.length === 0 && dirPath === '.') {
          return { entries: [], error: 'Repository is empty' };
        }
        
        return { entries };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to list directory' };
      }
    },
  } as any);
}

/**
 * Create status tool
 */
function createStatusTool(context: AgentContext) {
  return createTool({
    id: 'get-status',
    description: 'Get the current status showing what files have been added, modified, or deleted',
    inputSchema: z.object({}),
    outputSchema: z.object({
      branch: z.string(),
      changes: z.array(z.object({
        path: z.string(),
        status: z.enum(['added', 'modified', 'deleted']),
      })),
      error: z.string().optional(),
    }),
    execute: async (): Promise<{ branch: string; changes: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>; error?: string }> => {
      try {
        const vrepo = getVirtualRepo(context);
        const status = vrepo.status();
        const branch = vrepo.getCurrentBranch();
        
        // Map 'untracked' to 'added' for the output schema
        const mappedChanges = status.map(s => ({
          path: s.path,
          status: (s.status === 'untracked' ? 'added' : s.status) as 'added' | 'modified' | 'deleted',
        }));
        return {
          branch,
          changes: mappedChanges,
        };
      } catch (error) {
        return { branch: 'unknown', changes: [], error: error instanceof Error ? error.message : 'Failed to get status' };
      }
    },
  } as any);
}

/**
 * Create commit tool
 */
function createCommitTool(context: AgentContext) {
  return createTool({
    id: 'commit',
    description: 'Create a commit with all current changes',
    inputSchema: z.object({
      message: z.string().describe('Commit message describing the changes'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      commitHash: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ message }: { message: string }) => {
      try {
        const vrepo = getVirtualRepo(context);
        
        // Check if there are changes to commit
        if (!vrepo.hasChanges()) {
          return { success: false, error: 'No changes to commit' };
        }
        
        const author = getDefaultAuthor();
        const commitHash = vrepo.commit(message, author);
        
        console.log(`[commit] Created: ${commitHash.slice(0, 8)} - ${message}`);
        return { success: true, commitHash };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to commit' };
      }
    },
  } as any);
}

/**
 * Create branch tool
 */
function createBranchTool(context: AgentContext) {
  return createTool({
    id: 'create-branch',
    description: 'Create a new branch from the current HEAD. Does NOT switch to the new branch - all work continues on the current branch (main).',
    inputSchema: z.object({
      name: z.string().describe('Branch name'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      branchName: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ name }: { name: string }) => {
      try {
        const vrepo = getVirtualRepo(context);
        
        vrepo.createBranch(name);
        // Do NOT checkout - stay on current branch so IDE file explorer stays in sync
        
        console.log(`[createBranch] Created branch: ${name}`);
        return { success: true, branchName: name };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create branch' };
      }
    },
  } as any);
}

/**
 * Create history tool
 */
function createHistoryTool(context: AgentContext) {
  return createTool({
    id: 'get-history',
    description: 'Get the commit history',
    inputSchema: z.object({
      limit: z.number().optional().default(10).describe('Maximum number of commits to return'),
    }),
    outputSchema: z.object({
      commits: z.array(z.object({
        hash: z.string(),
        message: z.string(),
        author: z.string(),
        date: z.string(),
      })),
      error: z.string().optional(),
    }),
    execute: async ({ limit }: { limit: number }): Promise<{ commits: Array<{ hash: string; message: string; author: string; date: string }>; error?: string }> => {
      try {
        const vrepo = getVirtualRepo(context);
        const commits = vrepo.log(limit);
        
        return {
          commits: commits.map(c => ({
            hash: c.hash.slice(0, 8),
            message: c.message,
            author: c.author,
            date: c.date.toISOString(),
          })),
        };
      } catch (error) {
        return { commits: [], error: error instanceof Error ? error.message : 'Failed to get history' };
      }
    },
  } as any);
}

/**
 * Create run command tool (sandboxed)
 * Note: This requires a working directory, so it may not work for bare repos
 */
function createRunCommandTool(context: AgentContext) {
  return createTool({
    id: 'run-command',
    description: 'Run a shell command (sandboxed - only build/test commands allowed). Note: May not work for server-side bare repositories.',
    inputSchema: z.object({
      command: z.string().describe('Command to run'),
      timeout: z.number().optional().default(60000),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      exitCode: z.number().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ command, timeout }: { command: string; timeout: number }) => {
      return new Promise((resolve) => {
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);
        
        if (!ALLOWED_COMMANDS.has(cmd)) {
          resolve({ success: false, error: `Command '${cmd}' is not allowed. Allowed: ${Array.from(ALLOWED_COMMANDS).join(', ')}` });
          return;
        }
        
        let stdout = '';
        let stderr = '';
        
        const child = spawn(cmd, args, {
          cwd: context.repoPath,
          shell: false,
          timeout: Math.min(timeout, 120000),
        });
        
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
        
        child.on('close', (code) => {
          resolve({
            success: code === 0,
            stdout: stdout || undefined,
            stderr: stderr || undefined,
            exitCode: code ?? undefined,
          });
        });
      });
    },
  } as any);
}

/**
 * Create delete file tool
 */
function createDeleteFileTool(context: AgentContext) {
  return createTool({
    id: 'delete-file',
    description: 'Delete a file from the repository. The deletion is automatically committed.',
    inputSchema: z.object({
      path: z.string().describe('Path to the file to delete'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      commitHash: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ path: filePath }: { path: string }) => {
      try {
        const vrepo = getVirtualRepo(context);
        const deleted = vrepo.delete(filePath);
        
        if (!deleted) {
          return { success: false, error: `File not found: ${filePath}` };
        }
        
        // Auto-commit so changes are immediately visible
        const author = getDefaultAuthor();
        const commitHash = vrepo.commit(`Delete ${filePath}`, author);
        
        console.log(`[deleteFile] Committed: ${filePath} -> ${commitHash.slice(0, 8)}`);
        return { success: true, commitHash: commitHash.slice(0, 8) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete file' };
      }
    },
  } as any);
}

/**
 * Create a Code mode agent for a specific repository
 */
export function createCodeAgent(context: AgentContext, model: string = 'anthropic/claude-sonnet-4-20250514'): Agent {
  return new Agent({
    id: `wit-code-${context.repoId}`,
    name: 'wit Code Agent',
    description: 'A full-featured coding agent that can write and edit code',
    instructions: CODE_AGENT_INSTRUCTIONS,
    model,
    tools: {
      readFile: createReadFileTool(context),
      writeFile: createWriteFileTool(context),
      editFile: createEditFileTool(context),
      deleteFile: createDeleteFileTool(context),
      listDirectory: createListDirectoryTool(context),
      createBranch: createBranchTool(context),
      getHistory: createHistoryTool(context),
      runCommand: createRunCommandTool(context),
    },
  });
}
