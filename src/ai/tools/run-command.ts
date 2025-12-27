/**
 * Run Command Tool
 * Executes shell commands in the repository with safety restrictions
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn } from 'child_process';
import * as path from 'path';
import { Repository } from '../../core/repository.js';

// Commands that are allowed to run
const ALLOWED_COMMANDS = new Set([
  // Package managers
  'npm', 'npx', 'yarn', 'pnpm', 'bun',
  // Build/dev tools
  'node', 'tsc', 'tsx', 'vite', 'webpack', 'esbuild', 'rollup',
  // Testing
  'jest', 'vitest', 'mocha', 'pytest', 'cargo',
  // Linting/formatting
  'eslint', 'prettier', 'biome', 'rustfmt', 'black', 'ruff',
  // Languages
  'python', 'python3', 'ruby', 'go', 'rustc',
  // General utilities
  'cat', 'ls', 'pwd', 'echo', 'head', 'tail', 'grep', 'find', 'wc',
  'make', 'cmake',
  // Database
  'psql', 'mysql', 'sqlite3',
]);

// Commands that are explicitly blocked (dangerous)
const BLOCKED_COMMANDS = new Set([
  'rm', 'rmdir', 'del', 'format',
  'sudo', 'su', 'doas',
  'curl', 'wget', 'nc', 'netcat', // Network operations
  'ssh', 'scp', 'rsync',
  'chmod', 'chown', 'chgrp',
  'kill', 'pkill', 'killall',
  'reboot', 'shutdown', 'halt',
  'dd', 'mkfs', 'fdisk', 'parted',
  'iptables', 'ufw', 'firewall-cmd',
  'env', 'export', 'source', 'eval', // Shell builtins that could be dangerous
]);

// Maximum execution time (2 minutes)
const MAX_TIMEOUT = 120000;

// Maximum output size (1MB)
const MAX_OUTPUT_SIZE = 1024 * 1024;

export const runCommandTool = createTool({
  id: 'wit-run-command',
  description: `Execute a shell command in the repository directory.
This tool is sandboxed with safety restrictions:
- Only allowed commands can be run (npm, node, tsc, pytest, etc.)
- Dangerous commands are blocked (rm, sudo, curl, etc.)
- Commands timeout after 2 minutes
- Output is truncated if too large

Use this for:
- Running tests (npm test, pytest, cargo test)
- Running builds (npm run build, tsc)
- Running linters (eslint, prettier --check)
- Installing dependencies (npm install)

Do NOT use this for file operations - use readFile, writeFile, editFile instead.`,
  inputSchema: z.object({
    command: z.string().describe('The command to execute'),
    args: z.array(z.string()).optional().describe('Command arguments as separate array items'),
    timeout: z.number().optional().default(60000).describe('Timeout in milliseconds (max 120000)'),
    env: z.record(z.string()).optional().describe('Additional environment variables'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    exitCode: z.number().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    error: z.string().optional(),
    timedOut: z.boolean().optional(),
    truncated: z.boolean().optional(),
    duration: z.number().optional().describe('Execution time in milliseconds'),
  }),
  execute: async ({ command, args = [], timeout = 60000, env = {} }) => {
    try {
      const repo = Repository.find();

      // Parse command and args if command contains spaces and no args provided
      let execCommand = command;
      let execArgs = args;

      if (args.length === 0 && command.includes(' ')) {
        const parts = parseCommand(command);
        execCommand = parts[0];
        execArgs = parts.slice(1);
      }

      // Security: Check if command is allowed
      const baseCommand = path.basename(execCommand);

      if (BLOCKED_COMMANDS.has(baseCommand)) {
        return {
          success: false,
          error: `Command '${baseCommand}' is blocked for security reasons`,
        };
      }

      // For non-allowed commands, check if they're npm/yarn scripts
      const isAllowedScript = execCommand === 'npm' || execCommand === 'yarn' || execCommand === 'pnpm';
      const isRunScript = isAllowedScript && (execArgs[0] === 'run' || execArgs[0] === 'test' || execArgs[0] === 'build');

      if (!ALLOWED_COMMANDS.has(baseCommand) && !isRunScript) {
        return {
          success: false,
          error: `Command '${baseCommand}' is not in the allowed list. Allowed: ${Array.from(ALLOWED_COMMANDS).slice(0, 20).join(', ')}...`,
        };
      }

      // Security: Check args for shell injection attempts
      const dangerousPatterns = [
        /[;&|`$]/, // Shell operators
        /\$\(/, // Command substitution
        />\s*\//, // Redirect to absolute path
        /\.\.\//g, // Path traversal
      ];

      for (const arg of execArgs) {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(arg)) {
            return {
              success: false,
              error: `Argument contains potentially dangerous pattern: ${arg}`,
            };
          }
        }
      }

      // Clamp timeout
      const actualTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT);

      // Execute command
      const startTime = Date.now();
      const result = await executeCommand(execCommand, execArgs, {
        cwd: repo.workDir,
        timeout: actualTimeout,
        env: { ...process.env, ...env },
      });

      const duration = Date.now() - startTime;

      return {
        ...result,
        duration,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute command',
      };
    }
  },
});

/**
 * Parse a command string into command and arguments
 */
function parseCommand(cmd: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i];

    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
    } else if (char === ' ') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Execute command with timeout and output limits
 */
async function executeCommand(
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; env: NodeJS.ProcessEnv }
): Promise<{
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  timedOut?: boolean;
  truncated?: boolean;
}> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false, // Don't use shell for safety
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
      }, 1000);
    }, options.timeout);

    child.stdout?.on('data', (data: Buffer) => {
      if (stdout.length < MAX_OUTPUT_SIZE) {
        stdout += data.toString();
        if (stdout.length > MAX_OUTPUT_SIZE) {
          stdout = stdout.slice(0, MAX_OUTPUT_SIZE);
          truncated = true;
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length < MAX_OUTPUT_SIZE) {
        stderr += data.toString();
        if (stderr.length > MAX_OUTPUT_SIZE) {
          stderr = stderr.slice(0, MAX_OUTPUT_SIZE);
          truncated = true;
        }
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: err.message,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        success: code === 0,
        exitCode: code ?? undefined,
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        timedOut,
        truncated,
      });
    });
  });
}
