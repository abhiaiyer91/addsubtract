/**
 * Daytona Sandbox Provider
 *
 * Provides cloud development environments via Daytona (daytona.io).
 * Features:
 * - Full PTY support with interactive terminals
 * - Git operations built-in
 * - Language Server Protocol support
 * - Snapshots for fast startup
 * - Auto-stop/auto-archive lifecycle management
 *
 * @see https://www.daytona.io/docs
 */

import { EventEmitter } from 'events';
import { PassThrough, Duplex } from 'stream';
import type {
  SandboxProvider,
  SandboxSession,
  SandboxSessionConfig,
  SandboxState,
  SandboxStats,
  SandboxInfo,
  CommandResult,
  DaytonaProviderConfig,
} from '../types';
import { BaseSandboxProvider, BaseSandboxSession } from '../base-provider';

// Daytona SDK types
type DaytonaSandbox = {
  id: string;
  state: string;
  process: {
    codeRun: (code: string) => Promise<{ exitCode: number; result: string }>;
    commandRun: (
      cmd: string,
      opts?: { timeout?: number; cwd?: string }
    ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
    createPty: (opts: {
      id: string;
      cols?: number;
      rows?: number;
      onData?: (data: Uint8Array) => void;
    }) => Promise<DaytonaPtyHandle>;
    resizePtySession: (id: string, cols: number, rows: number) => Promise<void>;
  };
  fs: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
    list: (path: string) => Promise<{ name: string; isDir: boolean }[]>;
  };
  git: {
    clone: (url: string, path: string) => Promise<void>;
    status: () => Promise<{ modified: string[]; untracked: string[] }>;
  };
  getUserRootDir: () => Promise<string>;
  stop: () => Promise<void>;
  start: () => Promise<void>;
  archive: () => Promise<void>;
  delete: () => Promise<void>;
  setAutoStopInterval: (minutes: number) => Promise<void>;
  autoStopInterval: number;
};

type DaytonaPtyHandle = {
  waitForConnection: () => Promise<void>;
  sendInput: (data: string) => Promise<void>;
  kill: () => Promise<void>;
  wait: () => Promise<{ exitCode: number; error?: string }>;
};

type DaytonaClient = {
  create: (opts?: {
    language?: string;
    name?: string;
    snapshot?: string;
    autoStopInterval?: number;
    labels?: Record<string, string>;
    resources?: { cpu?: number; memory?: number; disk?: number };
    envVars?: Record<string, string>;
  }) => Promise<DaytonaSandbox>;
  findOne: (id: string) => Promise<DaytonaSandbox>;
  list: () => Promise<DaytonaSandbox[]>;
};

/**
 * Daytona Sandbox Session
 */
class DaytonaSandboxSession extends BaseSandboxSession {
  readonly id: string;
  readonly userId: string;
  readonly providerId: string;
  readonly providerType = 'daytona' as const;

  private sandbox: DaytonaSandbox;
  private ptyHandle: DaytonaPtyHandle | null = null;
  private _stdin: PassThrough;
  private _stdout: PassThrough;
  private _stderr: PassThrough;

  constructor(
    sessionId: string,
    userId: string,
    sandbox: DaytonaSandbox
  ) {
    super();
    this.id = sessionId;
    this.userId = userId;
    this.sandbox = sandbox;
    this.providerId = sandbox.id;

    this._stdin = new PassThrough();
    this._stdout = new PassThrough();
    this._stderr = new PassThrough();

    // Map Daytona state to our state
    this.setState(this.mapState(sandbox.state));
  }

  private mapState(daytonaState: string): SandboxState {
    switch (daytonaState.toUpperCase()) {
      case 'STARTED':
        return 'running';
      case 'STOPPED':
        return 'stopped';
      case 'ARCHIVED':
        return 'archived';
      case 'STARTING':
        return 'starting';
      case 'STOPPING':
        return 'stopping';
      case 'ERROR':
        return 'error';
      default:
        return 'creating';
    }
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

  /**
   * Initialize PTY session for interactive terminal
   */
  async initPty(cols: number = 120, rows: number = 30): Promise<void> {
    if (this.ptyHandle) return;

    this.ptyHandle = await this.sandbox.process.createPty({
      id: `pty_${this.id}`,
      cols,
      rows,
      onData: (data) => {
        const buffer = Buffer.from(data);
        this._stdout.write(buffer);
        this.emit('data', buffer);
      },
    });

    await this.ptyHandle.waitForConnection();

    // Pipe stdin to PTY
    this._stdin.on('data', async (data) => {
      if (this.ptyHandle) {
        await this.ptyHandle.sendInput(data.toString());
      }
    });
  }

  async exec(
    command: string,
    args?: string[],
    options?: { timeout?: number; cwd?: string }
  ): Promise<CommandResult> {
    const fullCommand = args ? `${command} ${args.join(' ')}` : command;

    try {
      const result = await this.sandbox.process.commandRun(fullCommand, {
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
    try {
      const result = await this.sandbox.process.codeRun(code);

      if (result.result) {
        this._stdout.write(result.result);
        this.emit('data', Buffer.from(result.result));
      }

      return {
        exitCode: result.exitCode,
        stdout: result.result,
        stderr: '',
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      };
    }
  }

  sendInput(data: string | Buffer): void {
    this._stdin.write(data);
  }

  async resize(cols: number, rows: number): Promise<void> {
    if (this.ptyHandle) {
      await this.sandbox.process.resizePtySession(`pty_${this.id}`, cols, rows);
    }
  }

  async pause(): Promise<void> {
    // Daytona uses stop as the equivalent of pause
    await this.stop();
  }

  async resume(): Promise<void> {
    this.setState('starting');
    await this.sandbox.start();
    this.setState('running');
  }

  async stop(): Promise<void> {
    this.setState('stopping');

    if (this.ptyHandle) {
      await this.ptyHandle.kill();
      this.ptyHandle = null;
    }

    await this.sandbox.stop();
    this.setState('stopped');
    this.emit('exit', 0);
  }

  async kill(): Promise<void> {
    if (this.ptyHandle) {
      await this.ptyHandle.kill();
      this.ptyHandle = null;
    }

    await this.sandbox.delete();
    this.setState('stopped');
    this.emit('exit', -1);
  }

  async archive(): Promise<void> {
    if (this.state !== 'stopped') {
      await this.stop();
    }
    await this.sandbox.archive();
    this.setState('archived');
  }

  async getStats(): Promise<SandboxStats> {
    // Daytona doesn't expose detailed metrics via SDK
    return {
      memoryBytes: 0,
      cpuPercent: 0,
      diskBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      uptimeSeconds: Math.floor((Date.now() - this.createdAt.getTime()) / 1000),
    };
  }

  async setTimeout(timeoutMs: number): Promise<void> {
    const minutes = Math.ceil(timeoutMs / 60000);
    await this.sandbox.setAutoStopInterval(minutes);
  }

  async getInfo(): Promise<SandboxInfo> {
    const rootDir = await this.sandbox.getUserRootDir();

    return {
      id: this.id,
      providerId: this.sandbox.id,
      state: this.state,
      createdAt: this.createdAt,
      metadata: {
        rootDir,
        autoStopInterval: String(this.sandbox.autoStopInterval),
      },
    };
  }
}

/**
 * Daytona Sandbox Provider
 */
export class DaytonaProvider extends BaseSandboxProvider {
  readonly type = 'daytona' as const;
  readonly name = 'Daytona';

  private daytonaClient: DaytonaClient | null = null;

  constructor(config: DaytonaProviderConfig) {
    super(config);
  }

  private get daytonaConfig(): DaytonaProviderConfig {
    return this.config as DaytonaProviderConfig;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Dynamically import Daytona SDK
    try {
      const { Daytona } = await import('@daytonaio/sdk');
      this.daytonaClient = new Daytona({
        apiKey: this.daytonaConfig.options?.apiKey,
      });
    } catch (error) {
      throw new Error(
        'Daytona SDK not installed. Install with: npm install @daytonaio/sdk'
      );
    }

    // Verify API key is set
    if (!this.daytonaConfig.options?.apiKey) {
      throw new Error('Daytona API key is required');
    }

    this.initialized = true;
  }

  async createSession(config: SandboxSessionConfig): Promise<SandboxSession> {
    if (!this.daytonaClient) {
      throw new Error('Daytona provider not initialized');
    }

    await this.checkSessionLimits(config.userId);

    const mergedConfig = this.mergeWithDefaults(config);
    const opts = this.daytonaConfig.options || {};

    // Create Daytona sandbox
    const sandbox = await this.daytonaClient.create({
      language: config.language || opts.language || 'typescript',
      name: config.sessionId,
      snapshot: config.image || opts.snapshot,
      autoStopInterval: config.autoStopMinutes ?? opts.autoStopInterval ?? 15,
      labels: {
        userId: config.userId,
        sessionId: config.sessionId,
        repository: config.repository || '',
        ...opts.labels,
      },
      resources: mergedConfig.resources
        ? {
            cpu: mergedConfig.resources.cpuCores,
            memory: mergedConfig.resources.memoryMB
              ? mergedConfig.resources.memoryMB / 1024
              : undefined,
            disk: mergedConfig.resources.diskMB
              ? mergedConfig.resources.diskMB / 1024
              : undefined,
          }
        : undefined,
      envVars: config.env,
    });

    const session = new DaytonaSandboxSession(
      config.sessionId,
      config.userId,
      sandbox
    );

    // Initialize PTY if requested
    if (config.pty) {
      await session.initPty(config.pty.cols, config.pty.rows);
    }

    this.registerSession(session);

    return session;
  }

  async getSession(sessionId: string): Promise<SandboxSession | null> {
    // First check local cache
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;

    // Try to reconnect to existing sandbox
    if (!this.daytonaClient) return null;

    try {
      const sandbox = await this.daytonaClient.findOne(sessionId);
      if (sandbox) {
        // Reconstruct session from sandbox
        // Note: We don't have userId in the sandbox metadata, so this is limited
        const session = new DaytonaSandboxSession(
          sessionId,
          'unknown', // Would need to store userId in labels
          sandbox
        );
        this.registerSession(session);
        return session;
      }
    } catch {
      // Sandbox not found
    }

    return null;
  }

  async listSessions(userId?: string): Promise<SandboxSession[]> {
    // Return locally tracked sessions
    // For full listing, would need to query Daytona API
    return super.listSessions(userId);
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    message?: string;
    details?: Record<string, unknown>;
  }> {
    if (!this.initialized) {
      return {
        healthy: false,
        message: 'Daytona provider not initialized',
      };
    }

    if (!this.daytonaConfig.options?.apiKey) {
      return {
        healthy: false,
        message: 'Daytona API key not configured',
      };
    }

    // Try to list sandboxes to verify connectivity
    try {
      if (this.daytonaClient) {
        await this.daytonaClient.list();
      }

      return {
        healthy: true,
        message: 'Daytona provider is ready',
        details: {
          snapshot: this.daytonaConfig.options?.snapshot || 'default',
          language: this.daytonaConfig.options?.language || 'typescript',
          activeSessions: this.sessions.size,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Daytona API error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
