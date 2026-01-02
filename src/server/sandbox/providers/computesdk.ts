/**
 * ComputeSDK Sandbox Provider
 *
 * Provides a unified API across multiple sandbox providers via ComputeSDK.
 * This enables access to providers like Modal (GPU), CodeSandbox, Blaxel,
 * and more through a single consistent interface.
 *
 * Features:
 * - Zero-config mode with auto-detection
 * - Access to Modal for GPU workloads
 * - Access to CodeSandbox for collaboration
 * - Unified filesystem and command execution API
 * - Seamless provider switching
 *
 * @see https://computesdk.com/docs
 */

import { PassThrough } from 'stream';
import type {
  SandboxSession,
  SandboxSessionConfig,
  SandboxStats,
  SandboxInfo,
  CommandResult,
  ComputeSDKProviderConfig,
} from '../types';
import { BaseSandboxProvider, BaseSandboxSession } from '../base-provider';

// ComputeSDK types - matches the actual SDK interface
type ComputeSDKSandbox = {
  readonly sandboxId: string;
  readonly provider: string;
  runCommand: (
    command: string | [string, ...string[]],
    argsOrOptions?: string[] | { timeout?: number; cwd?: string },
    maybeOptions?: { timeout?: number; cwd?: string }
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  runCode: (
    code: string,
    runtime?: string
  ) => Promise<{ stdout: string; stderr: string; error?: string; results?: unknown[] }>;
  readonly filesystem: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string | Buffer) => Promise<void>;
    list: (path: string) => Promise<{ name: string; isDirectory: boolean }[]>;
    mkdir: (path: string) => Promise<void>;
    remove: (path: string) => Promise<void>;
  };
  getInfo: () => Promise<{
    sandboxId: string;
    status: string;
    createdAt?: string;
  }>;
  destroy: () => Promise<void>;
  kill: () => Promise<void>;
};

// Use 'any' for the compute module since the types are complex and we validate at runtime
type ComputeModule = {
  setConfig: (config: { provider: unknown }) => void;
  sandbox: {
    create: (options?: Record<string, unknown>) => Promise<ComputeSDKSandbox>;
  };
};

/**
 * ComputeSDK Sandbox Session
 */
class ComputeSDKSandboxSession extends BaseSandboxSession {
  readonly id: string;
  readonly userId: string;
  readonly providerId: string;
  readonly providerType = 'computesdk' as const;

  private sandbox: ComputeSDKSandbox;
  private _stdin: PassThrough;
  private _stdout: PassThrough;
  private _stderr: PassThrough;
  private underlyingProvider: string;

  constructor(
    sessionId: string,
    userId: string,
    sandbox: ComputeSDKSandbox,
    underlyingProvider: string
  ) {
    super();
    this.id = sessionId;
    this.userId = userId;
    this.sandbox = sandbox;
    this.providerId = sandbox.sandboxId;
    this.underlyingProvider = underlyingProvider;

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
    try {
      // ComputeSDK uses runCommand with array format for args
      const result = args
        ? await this.sandbox.runCommand(
            [command, ...args] as [string, ...string[]],
            { timeout: options?.timeout, cwd: options?.cwd }
          )
        : await this.sandbox.runCommand(command, {
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
      const result = await this.sandbox.runCode(code, language);

      let stdout = result.stdout || '';

      // Append results to stdout if present
      if (result.results?.length) {
        stdout += JSON.stringify(result.results, null, 2);
      }

      if (stdout) {
        this._stdout.write(stdout);
        this.emit('data', Buffer.from(stdout));
      }
      if (result.stderr) {
        this._stderr.write(result.stderr);
      }

      return {
        exitCode: result.error ? 1 : 0,
        stdout,
        stderr: result.error || result.stderr || '',
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
    // ComputeSDK handles input via exec commands
    this._stdin.write(data);
  }

  async resize(_cols: number, _rows: number): Promise<void> {
    // PTY resize depends on underlying provider
    // This is a no-op for most providers
  }

  async pause(): Promise<void> {
    throw new Error('Pause not supported by ComputeSDK provider');
  }

  async resume(): Promise<void> {
    throw new Error('Resume not supported by ComputeSDK provider');
  }

  async stop(): Promise<void> {
    this.setState('stopping');
    await this.sandbox.destroy();
    this.setState('stopped');
    this.emit('exit', 0);
  }

  async kill(): Promise<void> {
    await this.sandbox.destroy();
    this.setState('stopped');
    this.emit('exit', -1);
  }

  async getStats(): Promise<SandboxStats> {
    const uptimeSeconds = Math.floor(
      (Date.now() - this.createdAt.getTime()) / 1000
    );

    return {
      memoryBytes: 0, // Not available via ComputeSDK
      cpuPercent: 0, // Not available via ComputeSDK
      diskBytes: 0, // Not available via ComputeSDK
      networkRxBytes: 0,
      networkTxBytes: 0,
      uptimeSeconds,
    };
  }

  async setTimeout(_timeoutMs: number): Promise<void> {
    // Timeout is set at sandbox creation time in ComputeSDK
    console.warn('setTimeout not supported after sandbox creation in ComputeSDK');
  }

  async getInfo(): Promise<SandboxInfo> {
    return {
      id: this.id,
      providerId: this.providerId,
      state: this.state,
      createdAt: this.createdAt,
      metadata: {
        underlyingProvider: this.underlyingProvider,
      },
    };
  }
}

/**
 * ComputeSDK Sandbox Provider
 */
export class ComputeSDKProvider extends BaseSandboxProvider {
  readonly type = 'computesdk' as const;
  readonly name = 'ComputeSDK';

  private computeModule: ComputeModule | null = null;
  private underlyingProvider: string = 'auto';
  private providerInstance: unknown = null;

  constructor(config: ComputeSDKProviderConfig) {
    super(config);
  }

  private get computeSDKConfig(): ComputeSDKProviderConfig {
    return this.config as ComputeSDKProviderConfig;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Dynamically import ComputeSDK
    try {
      const computesdk = await import('computesdk');
      this.computeModule = computesdk.compute as unknown as ComputeModule;
    } catch {
      throw new Error(
        'ComputeSDK not installed. Install with: npm install computesdk'
      );
    }

    // Determine which underlying provider to use
    const providerType = this.computeSDKConfig.options?.provider;

    if (providerType) {
      // Explicit provider specified
      await this.initializeProvider(providerType);
    } else if (this.computeSDKConfig.options?.autoDetect !== false) {
      // Auto-detect from environment
      await this.autoDetectProvider();
    } else {
      throw new Error(
        'No provider specified and auto-detect is disabled. ' +
          'Set options.provider or enable options.autoDetect.'
      );
    }

    this.initialized = true;
  }

  private async initializeProvider(
    providerType: 'e2b' | 'daytona' | 'modal' | 'codesandbox' | 'blaxel' | 'vercel'
  ): Promise<void> {
    this.underlyingProvider = providerType;

    // Import the specific provider
    let providerModule: { default?: unknown; [key: string]: unknown };

    switch (providerType) {
      case 'e2b': {
        providerModule = await import('@computesdk/e2b');
        const apiKey =
          this.computeSDKConfig.options?.providerApiKey ||
          process.env.E2B_API_KEY;
        if (!apiKey) {
          throw new Error('E2B_API_KEY is required');
        }
        const { e2b } = providerModule as { e2b: (config: { apiKey: string }) => unknown };
        this.providerInstance = e2b({ apiKey });
        break;
      }
      case 'daytona': {
        providerModule = await import('@computesdk/daytona');
        const apiKey =
          this.computeSDKConfig.options?.providerApiKey ||
          process.env.DAYTONA_API_KEY;
        if (!apiKey) {
          throw new Error('DAYTONA_API_KEY is required');
        }
        const { daytona } = providerModule as {
          daytona: (config: { apiKey: string }) => unknown;
        };
        this.providerInstance = daytona({ apiKey });
        break;
      }
      case 'modal': {
        providerModule = await import('@computesdk/modal');
        const tokenId =
          process.env.MODAL_TOKEN_ID;
        const tokenSecret =
          process.env.MODAL_TOKEN_SECRET;
        if (!tokenId || !tokenSecret) {
          throw new Error('MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are required');
        }
        const { modal } = providerModule as {
          modal: (config: { tokenId: string; tokenSecret: string }) => unknown;
        };
        this.providerInstance = modal({ tokenId, tokenSecret });
        break;
      }
      case 'codesandbox': {
        providerModule = await import('@computesdk/codesandbox');
        const token =
          this.computeSDKConfig.options?.providerApiKey ||
          process.env.CODESANDBOX_TOKEN;
        if (!token) {
          throw new Error('CODESANDBOX_TOKEN is required');
        }
        const { codesandbox } = providerModule as {
          codesandbox: (config: { token: string }) => unknown;
        };
        this.providerInstance = codesandbox({ token });
        break;
      }
      case 'vercel': {
        // Use our native Vercel provider instead, but through ComputeSDK
        throw new Error(
          'Use the native Vercel provider for better integration. ' +
            'Set SANDBOX_PROVIDER=vercel instead.'
        );
      }
      case 'blaxel': {
        throw new Error(
          'Blaxel provider requires @computesdk/blaxel package. ' +
            'Install with: npm install @computesdk/blaxel'
        );
      }
      default:
        throw new Error(`Unknown provider: ${providerType}`);
    }

    // Configure ComputeSDK with the provider
    this.computeModule!.setConfig({
      provider: this.providerInstance,
    });
  }

  private async autoDetectProvider(): Promise<void> {
    // Check environment variables in priority order
    if (process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET) {
      await this.initializeProvider('modal');
    } else if (process.env.E2B_API_KEY) {
      await this.initializeProvider('e2b');
    } else if (process.env.DAYTONA_API_KEY) {
      await this.initializeProvider('daytona');
    } else if (process.env.CODESANDBOX_TOKEN) {
      await this.initializeProvider('codesandbox');
    } else {
      throw new Error(
        'No provider credentials found in environment. ' +
          'Set one of: MODAL_TOKEN_ID/MODAL_TOKEN_SECRET, E2B_API_KEY, ' +
          'DAYTONA_API_KEY, or CODESANDBOX_TOKEN'
      );
    }
  }

  async createSession(config: SandboxSessionConfig): Promise<SandboxSession> {
    if (!this.computeModule) {
      throw new Error('ComputeSDK provider not initialized');
    }

    await this.checkSessionLimits(config.userId);

    const mergedConfig = this.mergeWithDefaults(config);

    // Create sandbox via ComputeSDK
    const sandboxOptions: Record<string, unknown> = {
      timeoutMs: (mergedConfig.resources?.timeoutSeconds || 300) * 1000,
    };

    // Add metadata
    if (this.computeSDKConfig.options?.metadata || config.env) {
      sandboxOptions.metadata = {
        userId: config.userId,
        sessionId: config.sessionId,
        repository: config.repository || '',
        ...this.computeSDKConfig.options?.metadata,
      };
    }

    // Add environment variables
    if (config.env) {
      sandboxOptions.envs = config.env;
    }

    const sandbox = await this.computeModule.sandbox.create(sandboxOptions) as ComputeSDKSandbox;

    const session = new ComputeSDKSandboxSession(
      config.sessionId,
      config.userId,
      sandbox,
      this.underlyingProvider
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
        message: 'ComputeSDK provider not initialized',
      };
    }

    return {
      healthy: true,
      message: `ComputeSDK provider is ready (using ${this.underlyingProvider})`,
      details: {
        underlyingProvider: this.underlyingProvider,
        activeSessions: this.sessions.size,
      },
    };
  }
}
