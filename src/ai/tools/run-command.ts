/**
 * Run Command Tool
 * Executes shell commands in the repository with safety restrictions.
 * 
 * When a sandbox is configured for the repository, commands are executed
 * in an isolated sandbox environment for security. Otherwise, commands
 * run locally with safety restrictions.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn } from 'child_process';
import * as path from 'path';
import { Repository } from '../../core/repository.js';
import { 
  sandboxConfigModel, 
  sandboxKeyModel,
  sandboxSessionModel,
  type SandboxProvider as SandboxProviderType 
} from '../../db/models/sandbox.js';

// Commands that are allowed to run locally
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

// Sandbox context passed from the agent
interface SandboxContext {
  repoId?: string;
  userId?: string;
  useSandbox?: boolean;
}

// Global sandbox context (set by the agent when running)
let currentSandboxContext: SandboxContext | null = null;

/**
 * Set the sandbox context for the current execution
 * Called by the agent before running tools
 */
export function setSandboxContext(context: SandboxContext | null): void {
  currentSandboxContext = context;
}

/**
 * Get the current sandbox context
 */
export function getSandboxContext(): SandboxContext | null {
  return currentSandboxContext;
}

/**
 * Check if sandbox is available and should be used
 */
async function checkSandboxAvailability(repoId?: string): Promise<{
  useSandbox: boolean;
  provider?: SandboxProviderType;
  apiKey?: string;
  reason?: string;
}> {
  if (!repoId) {
    return { useSandbox: false, reason: 'No repository context' };
  }

  try {
    const status = await sandboxConfigModel.getStatus(repoId);
    
    if (!status.configured) {
      return { useSandbox: false, reason: 'Sandbox not configured for this repository' };
    }

    if (!status.enabled) {
      return { useSandbox: false, reason: 'Sandbox is disabled for this repository' };
    }

    if (!status.ready) {
      return { useSandbox: false, reason: 'Sandbox is not ready (missing API key?)' };
    }

    // Get the API key for the provider
    const apiKey = status.provider !== 'docker' 
      ? await sandboxKeyModel.getDecryptedKey(repoId, status.provider!)
      : undefined;

    if (status.provider !== 'docker' && !apiKey) {
      return { useSandbox: false, reason: 'Sandbox API key not found' };
    }

    return { 
      useSandbox: true, 
      provider: status.provider!, 
      apiKey: apiKey ?? undefined 
    };
  } catch (error) {
    console.error('Error checking sandbox availability:', error);
    return { useSandbox: false, reason: 'Error checking sandbox configuration' };
  }
}

/**
 * Execute command in a sandbox environment
 */
async function executeInSandbox(
  command: string,
  args: string[],
  options: {
    provider: SandboxProviderType;
    apiKey?: string;
    repoId: string;
    userId: string;
    cwd: string;
    timeout: number;
    env?: Record<string, string>;
  }
): Promise<{
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
  timedOut?: boolean;
  truncated?: boolean;
  sandbox?: boolean;
}> {
  const { provider, apiKey, repoId, userId, cwd, timeout, env } = options;

  try {
    // Dynamic import of sandbox provider based on type
    switch (provider) {
      case 'e2b': {
        return await executeInE2B(command, args, { apiKey: apiKey!, cwd, timeout, env });
      }
      case 'daytona': {
        return await executeInDaytona(command, args, { apiKey: apiKey!, cwd, timeout, env });
      }
      case 'docker': {
        return await executeInDocker(command, args, { cwd, timeout, env });
      }
      case 'vercel': {
        return await executeInVercel(command, args, { apiKey: apiKey!, repoId, cwd, timeout, env });
      }
      default:
        return {
          success: false,
          errorMessage: `Unknown sandbox provider: ${provider}`,
          sandbox: true,
        };
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Sandbox execution failed',
      sandbox: true,
    };
  }
}

/**
 * Execute in E2B sandbox
 */
async function executeInE2B(
  command: string,
  args: string[],
  options: { apiKey: string; cwd: string; timeout: number; env?: Record<string, string> }
): Promise<{
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
  timedOut?: boolean;
  sandbox: boolean;
}> {
  try {
    // Dynamic import to avoid requiring e2b if not used
    const { Sandbox } = await import('@e2b/code-interpreter');
    
    const sandbox = await Sandbox.create({ 
      apiKey: options.apiKey,
      timeoutMs: options.timeout,
    });

    try {
      const fullCommand = [command, ...args].join(' ');
      const result = await sandbox.commands.run(fullCommand, {
        cwd: options.cwd,
        envs: options.env,
        timeoutMs: options.timeout,
      });

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        sandbox: true,
      };
    } finally {
      await sandbox.kill();
    }
  } catch (error) {
    // If E2B SDK is not available, return error
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      return {
        success: false,
        errorMessage: 'E2B SDK not installed. Install with: npm install @e2b/code-interpreter',
        sandbox: true,
      };
    }
    throw error;
  }
}

/**
 * Execute in Daytona sandbox
 */
async function executeInDaytona(
  command: string,
  args: string[],
  options: { apiKey: string; cwd: string; timeout: number; env?: Record<string, string> }
): Promise<{
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
  timedOut?: boolean;
  sandbox: boolean;
}> {
  try {
    // Dynamic import to avoid requiring daytona if not used
    const { Daytona } = await import('@daytonaio/sdk');
    
    const daytona = new Daytona({ apiKey: options.apiKey });
    const sandbox = await daytona.create();

    try {
      const fullCommand = [command, ...args].join(' ');
      const response = await sandbox.process.commandRun(fullCommand, {
        cwd: options.cwd,
        timeout: options.timeout,
      });

      return {
        success: response.exitCode === 0,
        exitCode: response.exitCode,
        stdout: response.stdout || '',
        stderr: response.stderr || '',
        sandbox: true,
      };
    } finally {
      await sandbox.delete();
    }
  } catch (error) {
    // If Daytona SDK is not available, return error
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      return {
        success: false,
        errorMessage: 'Daytona SDK not installed. Install with: npm install @daytonaio/sdk',
        sandbox: true,
      };
    }
    throw error;
  }
}

/**
 * Execute in Docker sandbox
 */
async function executeInDocker(
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; env?: Record<string, string> }
): Promise<{
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
  timedOut?: boolean;
  sandbox: boolean;
}> {
  return new Promise((resolve) => {
    const dockerArgs = [
      'run',
      '--rm',
      '-w', '/workspace',
      '-v', `${options.cwd}:/workspace:ro`, // Read-only mount
      '--network', 'none', // No network by default
      '--memory', '2g',
      '--cpus', '1',
      '--security-opt', 'no-new-privileges',
    ];

    // Add environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        dockerArgs.push('-e', `${key}=${value}`);
      }
    }

    // Add image and command
    dockerArgs.push(
      'wit-sandbox:latest',
      command,
      ...args
    );

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn('docker', dockerArgs, {
      shell: false,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeout);

    child.stdout?.on('data', (data: Buffer) => {
      if (stdout.length < MAX_OUTPUT_SIZE) {
        stdout += data.toString();
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length < MAX_OUTPUT_SIZE) {
        stderr += data.toString();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        errorMessage: err.message,
        sandbox: true,
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
        sandbox: true,
      });
    });
  });
}

/**
 * Execute in Vercel Sandbox
 */
async function executeInVercel(
  command: string,
  args: string[],
  options: { apiKey: string; repoId: string; cwd: string; timeout: number; env?: Record<string, string> }
): Promise<{
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
  timedOut?: boolean;
  sandbox: boolean;
}> {
  try {
    // Dynamic import to avoid requiring vercel sandbox if not used
    const { Sandbox } = await import('@vercel/sandbox');
    
    // Get Vercel config from database
    const config = await sandboxConfigModel.getConfig(options.repoId);
    if (!config) {
      return {
        success: false,
        errorMessage: 'Sandbox configuration not found',
        sandbox: true,
      };
    }

    const vercelProjectId = config.vercelProjectId;
    const vercelTeamId = config.vercelTeamId;
    
    if (!vercelProjectId) {
      return {
        success: false,
        errorMessage: 'Vercel Project ID is not configured',
        sandbox: true,
      };
    }
    
    if (!vercelTeamId) {
      return {
        success: false,
        errorMessage: 'Vercel Team ID is not configured. This is required when using a personal access token.',
        sandbox: true,
      };
    }

    if (!options.apiKey) {
      return {
        success: false,
        errorMessage: 'Vercel access token is not configured',
        sandbox: true,
      };
    }

    // Debug: Log credentials info (without exposing full token)
    console.log('[Vercel Sandbox] Creating sandbox with:', {
      projectId: vercelProjectId,
      teamId: vercelTeamId,
      hasToken: !!options.apiKey,
      tokenLength: options.apiKey.length,
      tokenPrefix: options.apiKey.substring(0, 10) + '...',
      timeout: options.timeout,
      runtime: config.vercelRuntime || 'node22',
    });

    const sandbox = await Sandbox.create({ 
      projectId: vercelProjectId,
      teamId: vercelTeamId,
      token: options.apiKey,
      timeout: options.timeout,
      runtime: (config.vercelRuntime as 'node22' | 'python3.13') || 'node22',
    });

    try {
      const result = await sandbox.runCommand(command, args, {
        signal: AbortSignal.timeout(options.timeout),
      });

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        sandbox: true,
      };
    } finally {
      await sandbox.stop();
    }
  } catch (error) {
    // If Vercel SDK is not available, return error
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      return {
        success: false,
        errorMessage: 'Vercel Sandbox SDK not installed. Install with: npm install @vercel/sandbox',
        sandbox: true,
      };
    }
    throw error;
  }
}

export const runCommandTool = createTool({
  id: 'wit-run-command',
  description: `Execute a shell command in the repository directory.
This tool executes commands safely:
- When sandbox is configured: Commands run in an isolated sandbox environment (E2B, Daytona, Docker, or Vercel)
- Without sandbox: Commands run locally with safety restrictions

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
    errorMessage: z.string().optional().describe('Error message if operation failed'),
    timedOut: z.boolean().optional(),
    truncated: z.boolean().optional(),
    duration: z.number().optional().describe('Execution time in milliseconds'),
    sandbox: z.boolean().optional().describe('Whether the command ran in a sandbox'),
  }),
  execute: async ({ command, args = [], timeout = 60000, env = {} }) => {
    try {
      const repo = Repository.find();
      const context = getSandboxContext();

      // Parse command and args if command contains spaces and no args provided
      let execCommand = command;
      let execArgs = args;

      if (args.length === 0 && command.includes(' ')) {
        const parts = parseCommand(command);
        execCommand = parts[0];
        execArgs = parts.slice(1);
      }

      // Check if sandbox is available
      const sandboxCheck = await checkSandboxAvailability(context?.repoId);
      
      const startTime = Date.now();

      // Use sandbox if available
      if (sandboxCheck.useSandbox && context?.userId) {
        const result = await executeInSandbox(execCommand, execArgs, {
          provider: sandboxCheck.provider!,
          apiKey: sandboxCheck.apiKey,
          repoId: context.repoId!,
          userId: context.userId,
          cwd: repo.workDir,
          timeout: Math.min(Math.max(timeout, 1000), MAX_TIMEOUT),
          env,
        });

        return {
          ...result,
          duration: Date.now() - startTime,
        };
      }

      // Fall back to local execution with safety restrictions
      // Security: Check if command is allowed
      const baseCommand = path.basename(execCommand);

      if (BLOCKED_COMMANDS.has(baseCommand)) {
        return {
          success: false,
          errorMessage: `Command '${baseCommand}' is blocked for security reasons`,
          sandbox: false,
        };
      }

      // For non-allowed commands, check if they're npm/yarn scripts
      const isAllowedScript = execCommand === 'npm' || execCommand === 'yarn' || execCommand === 'pnpm';
      const isRunScript = isAllowedScript && (execArgs[0] === 'run' || execArgs[0] === 'test' || execArgs[0] === 'build');

      if (!ALLOWED_COMMANDS.has(baseCommand) && !isRunScript) {
        // If sandbox would be available but isn't configured, suggest it
        const suggestion = sandboxCheck.reason 
          ? ` (${sandboxCheck.reason}. Configure sandbox in repository settings for unrestricted access.)`
          : '';
        return {
          success: false,
          errorMessage: `Command '${baseCommand}' is not in the allowed list${suggestion}. Allowed: ${Array.from(ALLOWED_COMMANDS).slice(0, 20).join(', ')}...`,
          sandbox: false,
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
              errorMessage: `Argument contains potentially dangerous pattern: ${arg}`,
              sandbox: false,
            };
          }
        }
      }

      // Clamp timeout
      const actualTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT);

      // Execute command locally
      const result = await executeCommand(execCommand, execArgs, {
        cwd: repo.workDir,
        timeout: actualTimeout,
        env: { ...process.env, ...env },
      });

      const duration = Date.now() - startTime;

      return {
        ...result,
        duration,
        sandbox: false,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to execute command',
        sandbox: false,
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
 * Execute command locally with timeout and output limits
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
  errorMessage?: string;
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
        errorMessage: err.message,
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
