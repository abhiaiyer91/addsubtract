/**
 * Sandbox Provider Types
 *
 * Defines the interface for pluggable sandbox providers that enable
 * safe code execution in isolated environments.
 *
 * Supported providers:
 * - Docker: Local container-based isolation (self-hosted)
 * - ComputeSDK: Unified API for cloud providers (E2B, Daytona, Modal, CodeSandbox, Vercel)
 *
 * @see https://computesdk.com/docs
 */

import { EventEmitter } from 'events';

/**
 * Sandbox provider types
 *
 * - docker: Self-hosted container-based sandboxes
 * - computesdk: Cloud sandboxes via ComputeSDK (E2B, Daytona, Modal, CodeSandbox, Vercel, Blaxel)
 */
export type SandboxProviderType = 'docker' | 'computesdk';

/**
 * ComputeSDK underlying provider types
 */
export type ComputeSDKUnderlyingProvider =
  | 'e2b'
  | 'daytona'
  | 'modal'
  | 'codesandbox'
  | 'vercel'
  | 'blaxel';

/**
 * Network isolation mode
 */
export type NetworkMode =
  | 'none' // No network access (most secure)
  | 'restricted' // Only allowed hosts
  | 'full'; // Full internet access

/**
 * Resource limits for sandbox
 */
export interface SandboxResourceLimits {
  /** Memory limit in MB (default: 2048) */
  memoryMB: number;
  /** CPU cores (default: 1) */
  cpuCores: number;
  /** Disk space limit in MB (default: 10240) */
  diskMB: number;
  /** Maximum number of processes (default: 100) */
  maxProcesses: number;
  /** Session timeout in seconds (default: 3600 = 1 hour) */
  timeoutSeconds: number;
}

/**
 * PTY (pseudo-terminal) configuration
 */
export interface PTYConfig {
  /** Terminal columns (default: 120) */
  cols: number;
  /** Terminal rows (default: 30) */
  rows: number;
  /** Terminal type (default: 'xterm-256color') */
  term: string;
}

/**
 * Sandbox session configuration
 */
export interface SandboxSessionConfig {
  /** Unique session identifier */
  sessionId: string;
  /** User ID for the session */
  userId: string;
  /** Repository path to mount (optional) */
  repository?: string;
  /** Branch to checkout (optional) */
  branch?: string;
  /** PTY configuration for interactive sessions */
  pty?: PTYConfig;
  /** Resource limits (uses provider defaults if not specified) */
  resources?: Partial<SandboxResourceLimits>;
  /** Network mode */
  networkMode?: NetworkMode;
  /** Allowed hosts when networkMode is 'restricted' */
  allowedHosts?: string[];
  /** Environment variables to inject */
  env?: Record<string, string>;
  /** Custom image/template/snapshot to use */
  image?: string;
  /** Working directory inside sandbox */
  workdir?: string;
  /** Language runtime */
  language?: 'python' | 'typescript' | 'javascript';
  /** Auto-stop interval in minutes (0 = never, default: 15) */
  autoStopMinutes?: number;
}

/**
 * Sandbox session state
 */
export type SandboxState =
  | 'creating'
  | 'starting'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'archived'
  | 'error';

/**
 * Command execution result
 */
export interface CommandResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

/**
 * Active sandbox session
 */
export interface SandboxSession extends EventEmitter {
  /** Unique session identifier */
  readonly id: string;
  /** User ID */
  readonly userId: string;
  /** Current state */
  readonly state: SandboxState;
  /** Provider-specific identifier (container ID, sandbox ID, etc.) */
  readonly providerId: string;
  /** When the session was created */
  readonly createdAt: Date;
  /** Provider type */
  readonly providerType: SandboxProviderType;

  /** Standard input stream (for PTY mode) */
  readonly stdin: NodeJS.WritableStream;
  /** Standard output stream (for PTY mode) */
  readonly stdout: NodeJS.ReadableStream;
  /** Standard error stream (for PTY mode) */
  readonly stderr: NodeJS.ReadableStream;

  /**
   * Execute a command in the sandbox
   * @param command Command to execute
   * @param args Command arguments
   * @param options Execution options
   * @returns Exit code and output
   */
  exec(
    command: string,
    args?: string[],
    options?: { timeout?: number; cwd?: string }
  ): Promise<CommandResult>;

  /**
   * Execute code directly (for code interpreter sandboxes)
   * @param code Code to execute
   * @param language Language of the code
   */
  runCode?(code: string, language?: string): Promise<CommandResult>;

  /**
   * Send input to the PTY session
   * @param data Input data to send
   */
  sendInput(data: string | Buffer): void;

  /**
   * Resize the PTY (if applicable)
   */
  resize(cols: number, rows: number): Promise<void>;

  /**
   * Pause the sandbox (if supported by provider)
   */
  pause(): Promise<void>;

  /**
   * Resume a paused sandbox
   */
  resume(): Promise<void>;

  /**
   * Stop the sandbox gracefully
   */
  stop(): Promise<void>;

  /**
   * Kill the sandbox immediately
   */
  kill(): Promise<void>;

  /**
   * Archive the sandbox (for providers that support it)
   */
  archive?(): Promise<void>;

  /**
   * Get sandbox resource usage
   */
  getStats(): Promise<SandboxStats>;

  /**
   * Set session timeout
   * @param timeoutMs Timeout in milliseconds
   */
  setTimeout(timeoutMs: number): Promise<void>;

  /**
   * Get session info
   */
  getInfo(): Promise<SandboxInfo>;

  // Events
  on(event: 'data', listener: (data: Buffer) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'state', listener: (state: SandboxState) => void): this;
}

/**
 * Sandbox info returned by getInfo()
 */
export interface SandboxInfo {
  id: string;
  providerId: string;
  state: SandboxState;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, string>;
}

/**
 * Sandbox resource usage statistics
 */
export interface SandboxStats {
  /** Memory usage in bytes */
  memoryBytes: number;
  /** CPU usage percentage (0-100) */
  cpuPercent: number;
  /** Disk usage in bytes */
  diskBytes: number;
  /** Network bytes received */
  networkRxBytes: number;
  /** Network bytes transmitted */
  networkTxBytes: number;
  /** Session uptime in seconds */
  uptimeSeconds: number;
}

/**
 * Base provider configuration
 */
export interface SandboxProviderConfig {
  /** Provider type */
  type: SandboxProviderType;

  /** Default resource limits */
  defaultResources?: Partial<SandboxResourceLimits>;

  /** Default network mode */
  defaultNetworkMode?: NetworkMode;

  /** Default image/template/snapshot */
  defaultImage?: string;

  /** Maximum concurrent sessions per user */
  maxSessionsPerUser?: number;

  /** Maximum total concurrent sessions */
  maxTotalSessions?: number;

  /** Provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Docker provider configuration
 *
 * Docker provides local container-based isolation for self-hosted deployments.
 * Best for: Development, self-hosted production, air-gapped environments
 *
 * Requires Docker to be installed and accessible.
 */
export interface DockerProviderConfig extends SandboxProviderConfig {
  type: 'docker';
  options?: {
    /**
     * Docker socket path
     * Default: '/var/run/docker.sock'
     */
    socketPath?: string;
    /**
     * Docker host for remote Docker daemon
     * Example: 'tcp://localhost:2376'
     */
    host?: string;
    /**
     * TLS certificates for remote Docker
     */
    tls?: {
      ca: string;
      cert: string;
      key: string;
    };
    /**
     * Docker registry to pull images from
     * Default: Docker Hub
     */
    registry?: string;
    /**
     * Docker network to attach containers to
     * Default: 'bridge'
     */
    network?: string;
    /**
     * Default image for sandboxes
     * Default: 'wit-sandbox:latest'
     */
    image?: string;
    /**
     * Security options
     */
    security?: {
      /** Drop all capabilities and add only required ones */
      dropCapabilities?: boolean;
      /** Run as non-root user */
      runAsNonRoot?: boolean;
      /** Read-only root filesystem */
      readOnlyRootFs?: boolean;
      /** Disable network by default */
      noNetwork?: boolean;
    };
  };
}

/**
 * ComputeSDK provider configuration
 *
 * ComputeSDK provides a unified API across multiple sandbox providers,
 * allowing you to switch between E2B, Daytona, Modal, CodeSandbox, Vercel,
 * and more with zero code changes.
 *
 * @see https://computesdk.com/docs
 */
export interface ComputeSDKProviderConfig extends SandboxProviderConfig {
  type: 'computesdk';
  options: {
    /**
     * ComputeSDK API key (optional, for managed gateway)
     */
    apiKey?: string;
    /**
     * Underlying provider to use
     * Default: auto-detected from environment variables
     *
     * Detection order: Modal → E2B → Daytona → CodeSandbox → Vercel → Blaxel
     */
    provider?: ComputeSDKUnderlyingProvider;
    /**
     * Provider-specific API key (required for most providers)
     * Will be passed to the underlying provider
     *
     * Alternatively, set the provider's env var directly:
     * - E2B: E2B_API_KEY
     * - Daytona: DAYTONA_API_KEY
     * - Modal: MODAL_TOKEN_ID + MODAL_TOKEN_SECRET
     * - CodeSandbox: CODESANDBOX_TOKEN
     * - Vercel: VERCEL_TOKEN
     */
    providerApiKey?: string;
    /**
     * Default sandbox timeout in milliseconds
     * Default: 300000 (5 minutes)
     */
    timeoutMs?: number;
    /**
     * Auto-detect provider from environment variables
     * Default: true
     */
    autoDetect?: boolean;
    /**
     * Metadata to attach to sandboxes
     */
    metadata?: Record<string, string>;
  };
}

/**
 * Union of all provider configurations
 */
export type ProviderConfig = DockerProviderConfig | ComputeSDKProviderConfig;

/**
 * Sandbox provider interface
 *
 * All sandbox providers must implement this interface.
 */
export interface SandboxProvider {
  /** Provider type */
  readonly type: SandboxProviderType;

  /** Provider display name */
  readonly name: string;

  /** Whether the provider is available/configured */
  readonly available: boolean;

  /**
   * Initialize the provider (connect to API, verify credentials, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Create a new sandbox session
   */
  createSession(config: SandboxSessionConfig): Promise<SandboxSession>;

  /**
   * Get an existing session by ID
   */
  getSession(sessionId: string): Promise<SandboxSession | null>;

  /**
   * List all active sessions
   * @param userId Optional filter by user
   */
  listSessions(userId?: string): Promise<SandboxSession[]>;

  /**
   * Stop a session by ID
   */
  stopSession(sessionId: string): Promise<void>;

  /**
   * Stop all sessions (for shutdown)
   */
  stopAllSessions(): Promise<void>;

  /**
   * Get provider health status
   */
  healthCheck(): Promise<{
    healthy: boolean;
    message?: string;
    details?: Record<string, unknown>;
  }>;

  /**
   * Cleanup resources (called on shutdown)
   */
  shutdown(): Promise<void>;
}

/**
 * Sandbox manager configuration
 */
export interface SandboxManagerConfig {
  /** Primary provider configuration */
  provider: ProviderConfig;

  /** Fallback provider (optional, used if primary fails) */
  fallbackProvider?: ProviderConfig;

  /** Repository root path for mounting */
  repoRoot: string;

  /** Global resource limits (override provider defaults) */
  globalLimits?: Partial<SandboxResourceLimits>;

  /** Enable audit logging */
  enableAuditLog?: boolean;

  /**
   * Callback to get secrets/env vars for a user
   * Used to inject API keys, credentials, etc.
   */
  getSecretsForUser?: (userId: string) => Promise<Record<string, string>>;
}

/**
 * Default resource limits
 */
export const DEFAULT_RESOURCE_LIMITS: SandboxResourceLimits = {
  memoryMB: 2048,
  cpuCores: 1,
  diskMB: 10240,
  maxProcesses: 100,
  timeoutSeconds: 3600,
};

/**
 * Default PTY configuration
 */
export const DEFAULT_PTY_CONFIG: PTYConfig = {
  cols: 120,
  rows: 30,
  term: 'xterm-256color',
};

/**
 * Sandbox event types for audit logging
 */
export interface SandboxAuditEvent {
  timestamp: Date;
  sessionId: string;
  userId: string;
  providerType: SandboxProviderType;
  event:
    | 'session_created'
    | 'session_started'
    | 'session_paused'
    | 'session_resumed'
    | 'session_stopped'
    | 'session_killed'
    | 'session_archived'
    | 'session_timeout'
    | 'session_error'
    | 'command_executed'
    | 'code_executed'
    | 'file_written'
    | 'file_read'
    | 'network_request'
    | 'pty_input'
    | 'pty_resize';
  details?: Record<string, unknown>;
}

/**
 * Provider comparison helper
 *
 * ComputeSDK provides access to multiple cloud providers through a unified API.
 */
export const PROVIDER_FEATURES = {
  docker: {
    name: 'Docker',
    isolation: 'Container',
    startupTime: 'Seconds',
    ptySupport: true,
    codeInterpreter: false,
    persistence: true,
    pricing: 'Self-hosted',
    bestFor: 'Development, self-hosted production, air-gapped environments',
  },
  computesdk: {
    name: 'ComputeSDK',
    isolation: 'Varies by underlying provider',
    startupTime: 'Varies (E2B: ~150ms, Modal: ~2s, Vercel: ~1s)',
    ptySupport: true,
    codeInterpreter: true,
    persistence: true,
    pricing: 'Varies by provider',
    bestFor: 'Cloud sandboxes, GPU workloads (Modal), collaboration (CodeSandbox)',
    underlyingProviders: {
      e2b: 'Firecracker microVMs, ~150ms startup, great for AI code execution',
      daytona: 'Full dev environments with PTY, git, LSP support',
      modal: 'GPU-accelerated Python, great for ML workloads',
      codesandbox: 'Collaborative sandboxes with real-time editing',
      vercel: 'Ephemeral Node.js/Python compute, ~1s startup',
      blaxel: 'AI-powered code execution',
    },
  },
} as const;
