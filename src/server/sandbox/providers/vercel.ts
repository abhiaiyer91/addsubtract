/**
 * Vercel Sandbox Provider
 *
 * Provides ephemeral compute environments via Vercel Sandbox.
 * Features:
 * - ~1s sandbox startup
 * - Full filesystem access
 * - Command execution with streaming
 * - File read/write operations
 * - Support for Node.js and Python runtimes
 *
 * @see https://vercel.com/docs/vercel-sandbox
 */

import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type {
  SandboxProvider,
  SandboxSession,
  SandboxSessionConfig,
  SandboxState,
  SandboxStats,
  SandboxInfo,
  CommandResult,
  VercelProviderConfig,
} from '../types';
import { BaseSandboxProvider, BaseSandboxSession } from '../base-provider';

// Vercel Sandbox SDK types (will be dynamically imported)
type VercelSandboxInstance = {
  sandboxId: string;
  status: 'pending' | 'running' | 'stopping' | 'stopped' | 'failed';
  timeout: number;
  runCommand: (params: {
    cmd: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    signal?: AbortSignal;
  }) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
  writeFiles: (
    files: { path: string; content: Buffer }[],
    opts?: { signal?: AbortSignal }
  ) => Promise<void>;
  readFile: (
    file: { path: string; cwd?: string },
    opts?: { signal?: AbortSignal }
  ) => Promise<ReadableStream | null>;
  mkDir: (path: string, opts?: { signal?: AbortSignal }) => Promise<void>;
  domain: (port: number) => string;
  stop: (opts?: { signal?: AbortSignal }) => Promise<void>;
  extendTimeout: (duration: number, opts?: { signal?: AbortSignal }) => Promise<void>;
};

type VercelSandboxModule = {
  Sandbox: {
    create: (params?: {
      source?: {
        type: 'git';
        url: string;
        depth?: number;
        revision?: string;
      } | {
        type: 'tarball';
        url: string;
      };
      ports?: number[];
      timeout?: number;
      resources?: { vcpus: number };
      runtime?: 'node22' | 'python3.13';
      signal?: AbortSignal;
      token?: string;
      teamId?: string;
      projectId?: string;
    }) => Promise<VercelSandboxInstance>;
    get: (params: {
      sandboxId: string;
      signal?: AbortSignal;
      token?: string;
      teamId?: string;
      projectId?: string;
    }) => Promise<VercelSandboxInstance>;
    list: (params: {
      projectId: string;
      limit?: number;
      since?: number | Date;
      until?: number | Date;
      signal?: AbortSignal;
      token?: string;
      teamId?: string;
    }) => Promise<{
      sandboxes: Array<{
        id: string;
        memory: number;
        vcpus: number;
        region: string;
        runtime: string;
        timeout: number;
        status: 'pending' | 'running' | 'stopping' | 'stopped' | 'failed';
        requestedAt: number;
        startedAt?: number;
        requestedStopAt?: number;
        stoppedAt?: number;
        duration?: number;
        createdAt: number;
        cwd: string;
        updatedAt: number;
      }>;
      pagination: {
        count: number;
        next: number | null;
        prev: number | null;
      };
    }>;
  };
};

/**
 * Vercel Sandbox Session
 */
class VercelSandboxSession extends BaseSandboxSession {
  readonly id: string;
  readonly userId: string;
  readonly providerId: string;
  readonly providerType = 'vercel' as const;

  private sandbox: VercelSandboxInstance;
  private _stdin: PassThrough;
  private _stdout: PassThrough;
  private _stderr: PassThrough;

  constructor(
    sessionId: string,
    userId: string,
    sandbox: VercelSandboxInstance
  ) {
    super();
    this.id = sessionId;
    this.userId = userId;
    this.sandbox = sandbox;
    this.providerId = sandbox.sandboxId;

    // Create pass-through streams for output
    this._stdin = new PassThrough();
    this._stdout = new PassThrough();
    this._stderr = new PassThrough();

    this.setState('running');
  }

  get stdin(): NodeJS.WritableStream {
    return this._stdin;
  }

  get stdout(): NodeJS.ReadableStream {
    return this._stdout;
  }

  get stderr(): NodeJS.ReadableStream {
    return this._stderr;
  }

  async exec(
    command: string,
    args?: string[],
    options?: { timeout?: number; cwd?: string }
  ): Promise<CommandResult> {
    try {
      // Create an AbortController for timeout
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      if (options?.timeout) {
        timeoutId = setTimeout(() => controller.abort(), options.timeout);
      }

      // Wrap the command in a shell to support shell built-ins (echo, cd, etc.)
      // and shell features (pipes, redirects, etc.)
      // Vercel SDK's runCommand expects executable and args separately
      let executable = '/bin/sh';
      let execArgs = ['-c', args && args.length > 0 ? `${command} ${args.join(' ')}` : command];

      // Debug: Log command execution details
      console.log('[VercelSandboxSession.exec] Executing command:', {
        originalCommand: command,
        originalArgs: args,
        wrappedExecutable: executable,
        wrappedArgs: execArgs,
        timeout: options?.timeout,
        cwd: options?.cwd,
        sandboxId: this.sandbox.sandboxId,
      });

      try {
        const result = await this.sandbox.runCommand({
          cmd: executable,
          args: execArgs,
          signal: controller.signal,
        });

        // Debug: Log command result
        console.log('[VercelSandboxSession.exec] Command result:', {
          exitCode: result.exitCode,
          stdoutLength: result.stdout?.length ?? 0,
          stderrLength: result.stderr?.length ?? 0,
          stderrPreview: result.stderr?.substring(0, 200),
        });

        // Emit output to streams
        if (result.stdout) {
          this._stdout.write(result.stdout);
          this.emit('data', Buffer.from(result.stdout));
        }
        if (result.stderr) {
          this._stderr.write(result.stderr);
        }

        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      const errorObj = error as any;
      console.error('[VercelSandboxSession.exec] Error:', {
        message: errorObj?.message,
        code: errorObj?.code,
        name: errorObj?.name,
        command,
        args,
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        exitCode: 1,
        stdout: '',
        stderr: errorMessage,
      };
    }
  }

  async runCode(code: string, language?: string): Promise<CommandResult> {
    // Determine the appropriate command based on language
    const lang = language?.toLowerCase() || 'javascript';
    let command: string;
    let args: string[];

    switch (lang) {
      case 'python':
      case 'python3':
        command = 'python3';
        args = ['-c', code];
        break;
      case 'javascript':
      case 'js':
      case 'node':
      default:
        command = 'node';
        args = ['-e', code];
        break;
      case 'typescript':
      case 'ts':
        // Write to temp file and run with ts-node or tsx
        const tempFile = `/tmp/code_${Date.now()}.ts`;
        await this.sandbox.writeFiles([
          { path: tempFile, content: Buffer.from(code) },
        ]);
        command = 'npx';
        args = ['tsx', tempFile];
        break;
    }

    return this.exec(command, args);
  }

  sendInput(data: string | Buffer): void {
    // Vercel Sandbox doesn't support interactive PTY
    // Input is typically handled via exec commands
    this._stdin.write(data);
  }

  async resize(cols: number, rows: number): Promise<void> {
    // Vercel Sandbox doesn't support PTY resize
    // This is a no-op
  }

  async pause(): Promise<void> {
    // Vercel Sandbox doesn't support pause
    throw new Error('Pause not supported by Vercel Sandbox provider');
  }

  async resume(): Promise<void> {
    throw new Error('Resume not supported by Vercel Sandbox provider');
  }

  async stop(): Promise<void> {
    this.setState('stopping');
    await this.sandbox.stop();
    this.setState('stopped');
    this.emit('exit', 0);
  }

  async kill(): Promise<void> {
    await this.sandbox.stop();
    this.setState('stopped');
    this.emit('exit', -1);
  }

  async getStats(): Promise<SandboxStats> {
    // Vercel Sandbox doesn't expose detailed metrics
    const uptimeSeconds = Math.floor(
      (Date.now() - this.createdAt.getTime()) / 1000
    );

    return {
      memoryBytes: 0, // Not available
      cpuPercent: 0, // Not available
      diskBytes: 0, // Not available
      networkRxBytes: 0,
      networkTxBytes: 0,
      uptimeSeconds,
    };
  }

  async setTimeout(timeoutMs: number): Promise<void> {
    // Vercel max timeout is 2700000ms (45 minutes)
    const VERCEL_MAX_TIMEOUT_MS = 2700000;
    await this.sandbox.extendTimeout(Math.min(timeoutMs, VERCEL_MAX_TIMEOUT_MS));
  }

  async getInfo(): Promise<SandboxInfo> {
    const expiresAt = new Date(this.createdAt.getTime() + this.sandbox.timeout);

    return {
      id: this.id,
      providerId: this.sandbox.sandboxId,
      state: this.state,
      createdAt: this.createdAt,
      expiresAt,
      metadata: {
        status: this.sandbox.status,
      },
    };
  }

  /**
   * Get the public domain for a port exposed by the sandbox
   */
  getDomain(port: number): string {
    return this.sandbox.domain(port);
  }

  /**
   * Write files to the sandbox filesystem
   */
  async writeFiles(
    files: Array<{ path: string; content: string | Buffer }>
  ): Promise<void> {
    const bufferFiles = files.map((f) => ({
      path: f.path,
      content: typeof f.content === 'string' ? Buffer.from(f.content) : f.content,
    }));
    await this.sandbox.writeFiles(bufferFiles);
  }

  /**
   * Read a file from the sandbox filesystem
   */
  async readFile(path: string): Promise<string | null> {
    const stream = await this.sandbox.readFile({ path });
    if (!stream) return null;

    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(result);
  }

  /**
   * Create a directory in the sandbox filesystem
   */
  async mkDir(path: string): Promise<void> {
    await this.sandbox.mkDir(path);
  }
}

/**
 * Vercel Sandbox Provider
 */
export class VercelProvider extends BaseSandboxProvider {
  readonly type = 'vercel' as const;
  readonly name = 'Vercel Sandbox';

  private vercelModule: VercelSandboxModule | null = null;

  constructor(config: VercelProviderConfig) {
    super(config);
  }

  private get vercelConfig(): VercelProviderConfig {
    return this.config as VercelProviderConfig;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Dynamically import Vercel Sandbox SDK
    try {
      this.vercelModule = await import('@vercel/sandbox') as VercelSandboxModule;
    } catch (error) {
      throw new Error(
        'Vercel Sandbox SDK not installed. Install with: npm install @vercel/sandbox'
      );
    }

    // Verify project ID is set
    if (!this.vercelConfig.options?.projectId) {
      throw new Error('Vercel project ID is required');
    }

    // Set environment variables if access token is provided
    if (this.vercelConfig.options?.accessToken) {
      process.env.VERCEL_TOKEN = this.vercelConfig.options.accessToken;
    }
    if (this.vercelConfig.options?.teamId) {
      process.env.VERCEL_TEAM_ID = this.vercelConfig.options.teamId;
    }
    if (this.vercelConfig.options?.projectId) {
      process.env.VERCEL_PROJECT_ID = this.vercelConfig.options.projectId;
    }

    this.initialized = true;
  }

  async createSession(config: SandboxSessionConfig): Promise<SandboxSession> {
    if (!this.vercelModule) {
      throw new Error('Vercel provider not initialized');
    }

    await this.checkSessionLimits(config.userId);

    const mergedConfig = this.mergeWithDefaults(config);

    // Vercel max timeout is 2700000ms (45 minutes)
    const VERCEL_MAX_TIMEOUT_MS = 2700000;
    const requestedTimeout = this.vercelConfig.options?.timeoutMs || 
      (mergedConfig.resources?.timeoutSeconds || 300) * 1000;

    // Build sandbox creation options
    const sandboxOptions: Parameters<typeof this.vercelModule.Sandbox.create>[0] = {
      timeout: Math.min(requestedTimeout, VERCEL_MAX_TIMEOUT_MS),
      runtime: this.vercelConfig.options?.runtime || 'node22',
      ports: this.vercelConfig.options?.ports,
    };

    // Add resources if specified
    if (this.vercelConfig.options?.vcpus) {
      sandboxOptions.resources = {
        vcpus: this.vercelConfig.options.vcpus,
      };
    }

    // Add source if specified
    if (this.vercelConfig.options?.source) {
      sandboxOptions.source = this.vercelConfig.options.source;
    }

    // Add credentials (SDK uses 'token' not 'accessToken')
    if (this.vercelConfig.options?.accessToken) {
      (sandboxOptions as any).token = this.vercelConfig.options.accessToken;
    }
    if (this.vercelConfig.options?.teamId) {
      sandboxOptions.teamId = this.vercelConfig.options.teamId;
    }
    if (this.vercelConfig.options?.projectId) {
      sandboxOptions.projectId = this.vercelConfig.options.projectId;
    }

    const sandbox = await this.vercelModule.Sandbox.create(sandboxOptions);

    const session = new VercelSandboxSession(
      config.sessionId,
      config.userId,
      sandbox
    );

    this.registerSession(session);

    // Set environment variables if provided
    if (config.env && Object.keys(config.env).length > 0) {
      // Write a shell script to set environment variables
      const envScript = Object.entries(config.env)
        .map(([key, value]) => `export ${key}="${value.replace(/"/g, '\\"')}"`)
        .join('\n');
      
      await session.writeFiles([
        { path: '/vercel/sandbox/.env.sh', content: envScript },
      ]);
    }

    return session;
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    message?: string;
    details?: Record<string, unknown>;
  }> {
    if (!this.initialized) {
      return {
        healthy: false,
        message: 'Vercel Sandbox provider not initialized',
      };
    }

    // Verify project ID is configured
    if (!this.vercelConfig.options?.projectId) {
      return {
        healthy: false,
        message: 'Vercel project ID not configured',
      };
    }

    // Try to list sandboxes to verify connectivity
    try {
      if (this.vercelModule) {
        await this.vercelModule.Sandbox.list({
          projectId: this.vercelConfig.options.projectId,
          limit: 1,
          token: this.vercelConfig.options?.accessToken,
          teamId: this.vercelConfig.options?.teamId,
        });
      }

      return {
        healthy: true,
        message: 'Vercel Sandbox provider is ready',
        details: {
          projectId: this.vercelConfig.options.projectId,
          runtime: this.vercelConfig.options?.runtime || 'node22',
          activeSessions: this.sessions.size,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Failed to connect to Vercel Sandbox API: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get an existing sandbox by ID
   */
  async getSandboxById(sandboxId: string): Promise<SandboxSession | null> {
    if (!this.vercelModule) {
      throw new Error('Vercel provider not initialized');
    }

    try {
      const sandbox = await this.vercelModule.Sandbox.get({
        sandboxId,
        token: this.vercelConfig.options?.accessToken,
        teamId: this.vercelConfig.options?.teamId,
        projectId: this.vercelConfig.options?.projectId,
      });

      // Create a session wrapper for the existing sandbox
      const session = new VercelSandboxSession(
        `session_${sandboxId}`,
        'unknown', // User ID not available from API
        sandbox
      );

      return session;
    } catch {
      return null;
    }
  }

  /**
   * List all sandboxes for the project
   */
  async listSandboxes(options?: {
    limit?: number;
    since?: Date;
    until?: Date;
  }): Promise<Array<{
    id: string;
    status: string;
    runtime: string;
    createdAt: Date;
    duration?: number;
  }>> {
    if (!this.vercelModule) {
      throw new Error('Vercel provider not initialized');
    }

    const result = await this.vercelModule.Sandbox.list({
      projectId: this.vercelConfig.options.projectId,
      limit: options?.limit,
      since: options?.since,
      until: options?.until,
      token: this.vercelConfig.options?.accessToken,
      teamId: this.vercelConfig.options?.teamId,
    });

    return result.sandboxes.map((s) => ({
      id: s.id,
      status: s.status,
      runtime: s.runtime,
      createdAt: new Date(s.createdAt),
      duration: s.duration,
    }));
  }
}
