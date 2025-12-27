/**
 * Code Mode Agent
 * 
 * A full-featured coding agent that can:
 * - Read and write files
 * - Create branches and commits
 * - Run commands (sandboxed)
 * 
 * All operations are scoped to the server-side repository.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn } from 'child_process';
import type { AgentContext } from '../types.js';

export const CODE_AGENT_INSTRUCTIONS = `You are wit AI in Code mode - a powerful coding agent that can write code, edit files, and manage the development workflow.

## Your Role
You help developers write code, make changes, and manage their git workflow. All changes happen in the wit platform's repository - users can clone it locally if they want.

## Your Capabilities

### File Operations
- **readFile**: Read file contents
- **writeFile**: Create or overwrite files
- **editFile**: Make targeted edits to existing files
- **listDirectory**: Browse the repository structure

### Git Operations
- **createBranch**: Create new branches for your work
- **switchBranch**: Switch between branches
- **stageFiles**: Stage files for commit
- **createCommit**: Create commits with good messages
- **getStatus**: Check repository status
- **getDiff**: View changes

### Command Execution
- **runCommand**: Run build/test commands (npm, tsc, pytest, etc.)

## Workflow Best Practices

### Starting Work
1. Check the current branch and status
2. Create a feature branch if needed
3. Understand the codebase structure with listDirectory

### Making Changes
1. ALWAYS read a file before editing it
2. Use editFile for small changes, writeFile for new files
3. Run tests after making changes

### Completing Work
1. Check status and diff
2. Stage your changes
3. Create a descriptive commit
4. Suggest creating a PR

## Safety Rules
- Never modify .git or .wit directories
- Create branches for significant changes
- Test your changes when possible
- Ask for clarification if requirements are unclear`;

// Allowed commands for sandboxed execution
const ALLOWED_COMMANDS = new Set([
  'npm', 'npx', 'yarn', 'pnpm', 'bun',
  'node', 'tsc', 'tsx', 'vite', 'webpack',
  'jest', 'vitest', 'mocha', 'pytest', 'cargo',
  'eslint', 'prettier', 'biome',
  'cat', 'ls', 'pwd', 'head', 'tail', 'grep', 'find', 'wc',
  'git', 'wit',
]);

/**
 * Create read file tool scoped to a repository
 */
function createReadFileTool(context: AgentContext) {
  return createTool({
    id: 'read-file',
    description: 'Read the contents of a file',
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
 * Create write file tool scoped to a repository
 */
function createWriteFileTool(context: AgentContext) {
  return createTool({
    id: 'write-file',
    description: 'Write content to a file (creates or overwrites)',
    inputSchema: z.object({
      path: z.string().describe('Path to the file relative to repository root'),
      content: z.string().describe('Content to write'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
    execute: async ({ path: filePath, content }) => {
      try {
        const fs = await import('fs/promises');
        const pathModule = await import('path');
        const fullPath = pathModule.join(context.repoPath, filePath);
        
        if (!fullPath.startsWith(context.repoPath)) {
          return { success: false, error: 'Invalid path: cannot write outside repository' };
        }
        
        // Don't allow writing to .git
        if (filePath.startsWith('.git/') || filePath === '.git') {
          return { success: false, error: 'Cannot modify .git directory' };
        }
        
        // Ensure directory exists
        await fs.mkdir(pathModule.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to write file' };
      }
    },
  });
}

/**
 * Create edit file tool (search and replace)
 */
function createEditFileTool(context: AgentContext) {
  return createTool({
    id: 'edit-file',
    description: 'Edit a file by replacing specific text. Always read the file first!',
    inputSchema: z.object({
      path: z.string().describe('Path to the file'),
      oldText: z.string().describe('Exact text to find and replace'),
      newText: z.string().describe('Text to replace with'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
    execute: async ({ path: filePath, oldText, newText }) => {
      try {
        const fs = await import('fs/promises');
        const pathModule = await import('path');
        const fullPath = pathModule.join(context.repoPath, filePath);
        
        if (!fullPath.startsWith(context.repoPath)) {
          return { success: false, error: 'Invalid path' };
        }
        
        const content = await fs.readFile(fullPath, 'utf-8');
        
        if (!content.includes(oldText)) {
          return { success: false, error: 'oldText not found in file' };
        }
        
        const newContent = content.replace(oldText, newText);
        await fs.writeFile(fullPath, newContent, 'utf-8');
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to edit file' };
      }
    },
  });
}

/**
 * Create list directory tool
 */
function createListDirectoryTool(context: AgentContext) {
  return createTool({
    id: 'list-directory',
    description: 'List files and directories',
    inputSchema: z.object({
      path: z.string().optional().default('.'),
    }),
    outputSchema: z.object({
      entries: z.array(z.object({
        name: z.string(),
        type: z.enum(['file', 'directory']),
      })).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ path: dirPath }) => {
      try {
        const fs = await import('fs/promises');
        const pathModule = await import('path');
        const fullPath = pathModule.join(context.repoPath, dirPath);
        
        if (!fullPath.startsWith(context.repoPath)) {
          return { error: 'Invalid path' };
        }
        
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        return {
          entries: entries
            .filter(e => !e.name.startsWith('.git'))
            .map(e => ({
              name: e.name,
              type: e.isDirectory() ? 'directory' as const : 'file' as const,
            })),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to list directory' };
      }
    },
  });
}

/**
 * Create run command tool (sandboxed)
 */
function createRunCommandTool(context: AgentContext) {
  return createTool({
    id: 'run-command',
    description: 'Run a shell command (sandboxed - only build/test commands allowed)',
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
    execute: async ({ command, timeout }) => {
      return new Promise((resolve) => {
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);
        
        if (!ALLOWED_COMMANDS.has(cmd)) {
          resolve({ success: false, error: `Command '${cmd}' is not allowed` });
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
  });
}

/**
 * Create git status tool
 */
function createGitStatusTool(context: AgentContext) {
  return createTool({
    id: 'git-status',
    description: 'Get the current git status',
    inputSchema: z.object({}),
    outputSchema: z.object({
      branch: z.string().optional(),
      staged: z.array(z.string()).optional(),
      modified: z.array(z.string()).optional(),
      untracked: z.array(z.string()).optional(),
      error: z.string().optional(),
    }),
    execute: async () => {
      try {
        const { execSync } = await import('child_process');
        
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: context.repoPath,
          encoding: 'utf-8',
        }).trim();
        
        const status = execSync('git status --porcelain', {
          cwd: context.repoPath,
          encoding: 'utf-8',
        });
        
        const staged: string[] = [];
        const modified: string[] = [];
        const untracked: string[] = [];
        
        for (const line of status.split('\n').filter(Boolean)) {
          const indexStatus = line[0];
          const workStatus = line[1];
          const file = line.slice(3);
          
          if (indexStatus !== ' ' && indexStatus !== '?') {
            staged.push(file);
          }
          if (workStatus === 'M') {
            modified.push(file);
          }
          if (indexStatus === '?') {
            untracked.push(file);
          }
        }
        
        return { branch, staged, modified, untracked };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to get status' };
      }
    },
  });
}

/**
 * Create git commit tool
 */
function createGitCommitTool(context: AgentContext) {
  return createTool({
    id: 'git-commit',
    description: 'Create a git commit',
    inputSchema: z.object({
      message: z.string().describe('Commit message'),
      files: z.array(z.string()).optional().describe('Files to stage (stages all if empty)'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      commitHash: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ message, files }) => {
      try {
        const { execSync } = await import('child_process');
        
        // Stage files
        if (files && files.length > 0) {
          execSync(`git add ${files.join(' ')}`, { cwd: context.repoPath });
        } else {
          execSync('git add -A', { cwd: context.repoPath });
        }
        
        // Commit
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
          cwd: context.repoPath,
        });
        
        const hash = execSync('git rev-parse HEAD', {
          cwd: context.repoPath,
          encoding: 'utf-8',
        }).trim();
        
        return { success: true, commitHash: hash };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to commit' };
      }
    },
  });
}

/**
 * Create branch tool
 */
function createBranchTool(context: AgentContext) {
  return createTool({
    id: 'create-branch',
    description: 'Create and switch to a new branch',
    inputSchema: z.object({
      name: z.string().describe('Branch name'),
      checkout: z.boolean().optional().default(true),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
    execute: async ({ name, checkout }) => {
      try {
        const { execSync } = await import('child_process');
        
        if (checkout) {
          execSync(`git checkout -b ${name}`, { cwd: context.repoPath });
        } else {
          execSync(`git branch ${name}`, { cwd: context.repoPath });
        }
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create branch' };
      }
    },
  });
}

/**
 * Create a Code mode agent for a specific repository
 */
export function createCodeAgent(context: AgentContext, model: string = 'anthropic/claude-opus-4-5'): Agent {
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
      listDirectory: createListDirectoryTool(context),
      runCommand: createRunCommandTool(context),
      gitStatus: createGitStatusTool(context),
      gitCommit: createGitCommitTool(context),
      createBranch: createBranchTool(context),
    },
  });
}
