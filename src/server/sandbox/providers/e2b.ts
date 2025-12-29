/**
 * E2B Sandbox Provider
 *
 * Provides Firecracker microVM sandboxes via E2B (e2b.dev).
 * Features:
 * - ~150ms sandbox startup
 * - Full filesystem access
 * - Command execution with streaming
 * - Code interpreter support
 * - Persistence via pause/resume
 *
 * @see https://e2b.dev/docs
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
  E2BProviderConfig,
} from '../types';
import { BaseSandboxProvider, BaseSandboxSession } from '../base-provider';

// E2B SDK types (will be dynamically imported)
type E2BSandbox = {
  sandboxId: string;
  commands: {
    run: (
      cmd: string,
      opts?: { timeout?: number; cwd?: string }
    ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  };
  files: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
    list: (path: string) => Promise<{ name: string; isDir: boolean }[]>;
  };
  setTimeout: (ms: number) => Promise<void>;
  getInfo: () => Promise<{
    sandboxId: string;
    templateId: string;
    startedAt: string;
    endAt: string;
    metadata: Record<string, string>;
  }>;
  kill: () => Promise<void>;
};

type E2BCodeInterpreter = E2BSandbox & {
  notebook: {
    execCell: (
      code: string,
      opts?: { onStdout?: (data: string) => void; onStderr?: (data: string) => void }
    ) => Promise<{ results: unknown[]; error?: string }>;
  };
};

/**
 * E2B Sandbox Session
 */
class E2BSandboxSession extends BaseSandboxSession {
  readonly id: string;
  readonly userId: string;
  readonly providerId: string;
  readonly providerType = 'e2b' as const;

  private sandbox: E2BSandbox | E2BCodeInterpreter;
  private _stdin: PassThrough;
  private _stdout: PassThrough;
  private _stderr: PassThrough;

  constructor(
    sessionId: string,
    userId: string,
    sandbox: E2BSandbox | E2BCodeInterpreter
  ) {
    super();
    this.id = sessionId;
    this.userId = userId;
    this.sandbox = sandbox;
    this.providerId = sandbox.sandboxId;

    // Create pass-through streams for PTY simulation
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
    const fullCommand = args ? `${command} ${args.join(' ')}` : command;

    try {
      const result = await this.sandbox.commands.run(fullCommand, {
        timeout: options?.timeout,
        cwd: options?.cwd,
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        exitCode: 1,
        stdout: '',
        stderr: errorMessage,
      };
    }
  }

  async runCode(code: string, language?: string): Promise<CommandResult> {
    const interpreter = this.sandbox as E2BCodeInterpreter;
    if (!interpreter.notebook?.execCell) {
      throw new Error('Code interpreter not available. Use a code interpreter template.');
    }

    let stdout = '';
    let stderr = '';

    try {
      const result = await interpreter.notebook.execCell(code, {
        onStdout: (data) => {
          stdout += data;
          this._stdout.write(data);
          this.emit('data', Buffer.from(data));
        },
        onStderr: (data) => {
          stderr += data;
          this._stderr.write(data);
        },
      });

      if (result.error) {
        return {
          exitCode: 1,
          stdout,
          stderr: result.error,
        };
      }

      // Append results to stdout
      if (result.results?.length) {
        const resultStr = JSON.stringify(result.results, null, 2);
        stdout += resultStr;
      }

      return {
        exitCode: 0,
        stdout,
        stderr,
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout,
        stderr: error instanceof Error ? error.message : String(error),
      };
    }
  }

  sendInput(data: string | Buffer): void {
    // E2B doesn't support interactive PTY in the same way
    // Input is typically handled via exec commands
    this._stdin.write(data);
  }

  async resize(cols: number, rows: number): Promise<void> {
    // E2B doesn't support PTY resize
    // This is a no-op
  }

  async pause(): Promise<void> {
    // E2B supports pause via the dashboard but not via SDK currently
    throw new Error('Pause not supported by E2B provider');
  }

  async resume(): Promise<void> {
    throw new Error('Resume not supported by E2B provider');
  }

  async stop(): Promise<void> {
    this.setState('stopping');
    await this.sandbox.kill();
    this.setState('stopped');
    this.emit('exit', 0);
  }

  async kill(): Promise<void> {
    await this.sandbox.kill();
    this.setState('stopped');
    this.emit('exit', -1);
  }

  async getStats(): Promise<SandboxStats> {
    // E2B doesn't expose detailed metrics via SDK
    const info = await this.sandbox.getInfo();
    const startedAt = new Date(info.startedAt);
    const uptimeSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);

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
    await this.sandbox.setTimeout(timeoutMs);
  }

  async getInfo(): Promise<SandboxInfo> {
    const info = await this.sandbox.getInfo();

    return {
      id: this.id,
      providerId: info.sandboxId,
      state: this.state,
      createdAt: this.createdAt,
      expiresAt: new Date(info.endAt),
      metadata: info.metadata,
    };
  }
}

/**
 * E2B Sandbox Provider
 */
export class E2BProvider extends BaseSandboxProvider {
  readonly type = 'e2b' as const;
  readonly name = 'E2B';

  private e2bModule: {
    Sandbox: { create: (opts: Record<string, unknown>) => Promise<E2BSandbox> };
  } | null = null;

  constructor(config: E2BProviderConfig) {
    super(config);
  }

  private get e2bConfig(): E2BProviderConfig {
    return this.config as E2BProviderConfig;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Dynamically import E2B SDK
    try {
      // Try code interpreter first (includes base Sandbox)
      this.e2bModule = await import('@e2b/code-interpreter');
    } catch {
      try {
        // Fall back to base SDK
        this.e2bModule = await import('e2b');
      } catch (error) {
        throw new Error(
          'E2B SDK not installed. Install with: npm install @e2b/code-interpreter or npm install e2b'
        );
      }
    }

    // Verify API key is set
    if (!this.e2bConfig.options?.apiKey) {
      throw new Error('E2B API key is required');
    }

    // Set API key in environment (E2B SDK reads from env)
    process.env.E2B_API_KEY = this.e2bConfig.options.apiKey;

    this.initialized = true;
  }

  async createSession(config: SandboxSessionConfig): Promise<SandboxSession> {
    if (!this.e2bModule) {
      throw new Error('E2B provider not initialized');
    }

    await this.checkSessionLimits(config.userId);

    const mergedConfig = this.mergeWithDefaults(config);

    // Create E2B sandbox
    const sandboxOptions: Record<string, unknown> = {
      timeoutMs:
        (mergedConfig.resources?.timeoutSeconds || 300) * 1000,
      metadata: {
        userId: config.userId,
        sessionId: config.sessionId,
        repository: config.repository || '',
      },
    };

    // Use template if specified
    if (this.e2bConfig.options?.templateId || config.image) {
      sandboxOptions.template = config.image || this.e2bConfig.options?.templateId;
    }

    // Add environment variables
    if (config.env) {
      sandboxOptions.envs = config.env;
    }

    const sandbox = await this.e2bModule.Sandbox.create(sandboxOptions);

    const session = new E2BSandboxSession(
      config.sessionId,
      config.userId,
      sandbox
    );

    this.registerSession(session);

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
        message: 'E2B provider not initialized',
      };
    }

    // E2B doesn't have a direct health check endpoint
    // We verify the API key is set
    if (!this.e2bConfig.options?.apiKey) {
      return {
        healthy: false,
        message: 'E2B API key not configured',
      };
    }

    return {
      healthy: true,
      message: 'E2B provider is ready',
      details: {
        templateId: this.e2bConfig.options?.templateId || 'default',
        activeSessions: this.sessions.size,
      },
    };
  }
}
