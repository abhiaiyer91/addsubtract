/**
 * Base Sandbox Provider
 *
 * Abstract base class for sandbox providers with common functionality.
 */

import { EventEmitter } from 'events';
import type {
  SandboxProvider,
  SandboxProviderType,
  SandboxProviderConfig,
  SandboxSession,
  SandboxSessionConfig,
  SandboxState,
  SandboxStats,
  SandboxInfo,
  CommandResult,
} from './types';
import { DEFAULT_RESOURCE_LIMITS } from './types';

/**
 * Abstract base class for sandbox sessions
 */
export abstract class BaseSandboxSession
  extends EventEmitter
  implements SandboxSession
{
  abstract readonly id: string;
  abstract readonly userId: string;
  abstract readonly providerId: string;
  abstract readonly providerType: SandboxProviderType;
  readonly createdAt: Date = new Date();

  protected _state: SandboxState = 'creating';

  get state(): SandboxState {
    return this._state;
  }

  protected setState(state: SandboxState): void {
    this._state = state;
    this.emit('state', state);
  }

  // These must be implemented by subclasses
  abstract readonly stdin: NodeJS.WritableStream;
  abstract readonly stdout: NodeJS.ReadableStream;
  abstract readonly stderr: NodeJS.ReadableStream;

  abstract exec(
    command: string,
    args?: string[],
    options?: { timeout?: number; cwd?: string }
  ): Promise<CommandResult>;

  abstract sendInput(data: string | Buffer): void;
  abstract resize(cols: number, rows: number): Promise<void>;
  abstract pause(): Promise<void>;
  abstract resume(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract kill(): Promise<void>;
  abstract getStats(): Promise<SandboxStats>;
  abstract setTimeout(timeoutMs: number): Promise<void>;
  abstract getInfo(): Promise<SandboxInfo>;

  // Optional methods with default implementations
  async runCode?(_code: string, _language?: string): Promise<CommandResult> {
    throw new Error('Code execution not supported by this provider');
  }

  async archive?(): Promise<void> {
    throw new Error('Archive not supported by this provider');
  }
}

/**
 * Abstract base class for sandbox providers
 */
export abstract class BaseSandboxProvider implements SandboxProvider {
  abstract readonly type: SandboxProviderType;
  abstract readonly name: string;

  protected config: SandboxProviderConfig;
  protected sessions: Map<string, SandboxSession> = new Map();
  protected initialized = false;

  constructor(config: SandboxProviderConfig) {
    this.config = config;
  }

  get available(): boolean {
    return this.initialized;
  }

  abstract initialize(): Promise<void>;

  abstract createSession(config: SandboxSessionConfig): Promise<SandboxSession>;

  async getSession(sessionId: string): Promise<SandboxSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async listSessions(userId?: string): Promise<SandboxSession[]> {
    const sessions = Array.from(this.sessions.values());
    if (userId) {
      return sessions.filter((s) => s.userId === userId);
    }
    return sessions;
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.stop();
      this.sessions.delete(sessionId);
    }
  }

  async stopAllSessions(): Promise<void> {
    const stopPromises = Array.from(this.sessions.values()).map((session) =>
      session.stop().catch((err) => {
        console.error(`Failed to stop session ${session.id}:`, err);
      })
    );
    await Promise.all(stopPromises);
    this.sessions.clear();
  }

  abstract healthCheck(): Promise<{
    healthy: boolean;
    message?: string;
    details?: Record<string, unknown>;
  }>;

  async shutdown(): Promise<void> {
    await this.stopAllSessions();
    this.initialized = false;
  }

  /**
   * Register a session in the internal map
   */
  protected registerSession(session: SandboxSession): void {
    this.sessions.set(session.id, session);

    // Auto-remove on exit
    session.on('exit', () => {
      this.sessions.delete(session.id);
    });

    session.on('error', (err) => {
      console.error(`Session ${session.id} error:`, err);
    });
  }

  /**
   * Check if user is within session limits
   */
  protected async checkSessionLimits(userId: string): Promise<void> {
    const userSessions = await this.listSessions(userId);

    if (
      this.config.maxSessionsPerUser &&
      userSessions.length >= this.config.maxSessionsPerUser
    ) {
      throw new Error(
        `User ${userId} has reached the maximum number of sessions (${this.config.maxSessionsPerUser})`
      );
    }

    if (
      this.config.maxTotalSessions &&
      this.sessions.size >= this.config.maxTotalSessions
    ) {
      throw new Error(
        `Maximum total sessions reached (${this.config.maxTotalSessions})`
      );
    }
  }

  /**
   * Generate a unique session ID
   */
  protected generateSessionId(): string {
    return `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Merge config with defaults
   */
  protected mergeWithDefaults(
    config: SandboxSessionConfig
  ): SandboxSessionConfig {
    return {
      ...config,
      resources: {
        ...DEFAULT_RESOURCE_LIMITS,
        ...this.config.defaultResources,
        ...config.resources,
      },
      networkMode: config.networkMode || this.config.defaultNetworkMode || 'none',
      image: config.image || this.config.defaultImage,
    };
  }
}

/**
 * No-op writable stream for providers that don't support PTY
 */
export class NullWritableStream extends require('stream').Writable {
  _write(
    chunk: Buffer,
    encoding: string,
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
}

/**
 * No-op readable stream for providers that don't support PTY
 */
export class NullReadableStream extends require('stream').Readable {
  _read(): void {
    // No-op
  }
}
