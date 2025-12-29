/**
 * Sandbox Manager
 *
 * Manages sandbox providers and sessions, handling provider selection,
 * fallback, and lifecycle management.
 */

import { EventEmitter } from 'events';
import type {
  SandboxProvider,
  SandboxProviderType,
  SandboxSession,
  SandboxSessionConfig,
  SandboxManagerConfig,
  SandboxAuditEvent,
  ProviderConfig,
} from './types';

// Provider implementations will be imported dynamically
type ProviderConstructor = new (config: ProviderConfig) => SandboxProvider;

/**
 * Provider registry for dynamic provider loading
 */
const providerRegistry: Map<SandboxProviderType, ProviderConstructor> = new Map();

/**
 * Register a provider implementation
 */
export function registerProvider(
  type: SandboxProviderType,
  constructor: ProviderConstructor
): void {
  providerRegistry.set(type, constructor);
}

/**
 * Sandbox Manager
 *
 * Handles:
 * - Provider initialization and selection
 * - Session lifecycle management
 * - Fallback to secondary provider
 * - Audit logging
 * - Resource tracking
 */
export class SandboxManager extends EventEmitter {
  private config: SandboxManagerConfig;
  private primaryProvider: SandboxProvider | null = null;
  private fallbackProvider: SandboxProvider | null = null;
  private initialized = false;
  private auditLog: SandboxAuditEvent[] = [];

  constructor(config: SandboxManagerConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize the sandbox manager and providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize primary provider
    this.primaryProvider = await this.createProvider(this.config.provider);
    await this.primaryProvider.initialize();

    // Initialize fallback provider if configured
    if (this.config.fallbackProvider) {
      try {
        this.fallbackProvider = await this.createProvider(
          this.config.fallbackProvider
        );
        await this.fallbackProvider.initialize();
      } catch (error) {
        console.warn('Failed to initialize fallback provider:', error);
        // Continue without fallback
      }
    }

    this.initialized = true;
    this.emit('initialized');
  }

  /**
   * Create a provider instance from config
   */
  private async createProvider(config: ProviderConfig): Promise<SandboxProvider> {
    const Constructor = providerRegistry.get(config.type);

    if (!Constructor) {
      // Try dynamic import
      const provider = await this.loadProvider(config.type);
      if (!provider) {
        throw new Error(`Unknown provider type: ${config.type}`);
      }
      return provider;
    }

    return new Constructor(config);
  }

  /**
   * Dynamically load a provider module
   */
  private async loadProvider(
    type: SandboxProviderType
  ): Promise<SandboxProvider | null> {
    try {
      const config = this.config.provider;
      switch (type) {
        case 'e2b': {
          if (config.type !== 'e2b') return null;
          const { E2BProvider } = await import('./providers/e2b');
          return new E2BProvider(config);
        }
        case 'daytona': {
          if (config.type !== 'daytona') return null;
          const { DaytonaProvider } = await import('./providers/daytona');
          return new DaytonaProvider(config);
        }
        case 'docker': {
          if (config.type !== 'docker') return null;
          const { DockerProvider } = await import('./providers/docker');
          return new DockerProvider(config);
        }
        default:
          return null;
      }
    } catch (error) {
      console.error(`Failed to load provider ${type}:`, error);
      return null;
    }
  }

  /**
   * Create a new sandbox session
   */
  async createSession(
    config: Omit<SandboxSessionConfig, 'sessionId'>
  ): Promise<SandboxSession> {
    this.ensureInitialized();

    const sessionConfig: SandboxSessionConfig = {
      ...config,
      sessionId: this.generateSessionId(),
    };

    // Inject user secrets if callback is configured
    if (this.config.getSecretsForUser) {
      const secrets = await this.config.getSecretsForUser(config.userId);
      sessionConfig.env = { ...sessionConfig.env, ...secrets };
    }

    try {
      const session = await this.primaryProvider!.createSession(sessionConfig);
      this.logAuditEvent({
        sessionId: session.id,
        userId: config.userId,
        providerType: this.primaryProvider!.type,
        event: 'session_created',
        details: {
          repository: config.repository,
          branch: config.branch,
          provider: this.primaryProvider!.type,
        },
      });
      return session;
    } catch (error) {
      // Try fallback provider
      if (this.fallbackProvider?.available) {
        console.warn(
          `Primary provider failed, trying fallback: ${error}`
        );
        const session = await this.fallbackProvider.createSession(sessionConfig);
        this.logAuditEvent({
          sessionId: session.id,
          userId: config.userId,
          providerType: this.fallbackProvider.type,
          event: 'session_created',
          details: {
            repository: config.repository,
            branch: config.branch,
            provider: this.fallbackProvider.type,
            fallback: true,
            primaryError: String(error),
          },
        });
        return session;
      }
      throw error;
    }
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<SandboxSession | null> {
    this.ensureInitialized();

    // Check primary provider
    let session = await this.primaryProvider!.getSession(sessionId);
    if (session) return session;

    // Check fallback provider
    if (this.fallbackProvider) {
      session = await this.fallbackProvider.getSession(sessionId);
    }

    return session;
  }

  /**
   * List all sessions
   */
  async listSessions(userId?: string): Promise<SandboxSession[]> {
    this.ensureInitialized();

    const primarySessions = await this.primaryProvider!.listSessions(userId);
    const fallbackSessions = this.fallbackProvider
      ? await this.fallbackProvider.listSessions(userId)
      : [];

    return [...primarySessions, ...fallbackSessions];
  }

  /**
   * Stop a session
   */
  async stopSession(sessionId: string): Promise<void> {
    this.ensureInitialized();

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await session.stop();

    this.logAuditEvent({
      sessionId,
      userId: session.userId,
      providerType: session.providerType,
      event: 'session_stopped',
    });
  }

  /**
   * Kill a session immediately
   */
  async killSession(sessionId: string): Promise<void> {
    this.ensureInitialized();

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await session.kill();

    this.logAuditEvent({
      sessionId,
      userId: session.userId,
      providerType: session.providerType,
      event: 'session_killed',
    });
  }

  /**
   * Stop all sessions
   */
  async stopAllSessions(): Promise<void> {
    this.ensureInitialized();

    await this.primaryProvider!.stopAllSessions();
    if (this.fallbackProvider) {
      await this.fallbackProvider.stopAllSessions();
    }
  }

  /**
   * Get health status of all providers
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    primary: { healthy: boolean; message?: string };
    fallback?: { healthy: boolean; message?: string };
  }> {
    this.ensureInitialized();

    const primaryHealth = await this.primaryProvider!.healthCheck();
    const fallbackHealth = this.fallbackProvider
      ? await this.fallbackProvider.healthCheck()
      : undefined;

    return {
      healthy: primaryHealth.healthy || (fallbackHealth?.healthy ?? false),
      primary: primaryHealth,
      fallback: fallbackHealth,
    };
  }

  /**
   * Get the active provider type
   */
  getActiveProviderType(): SandboxProviderType {
    this.ensureInitialized();
    return this.primaryProvider!.type;
  }

  /**
   * Get provider info
   */
  getProviderInfo(): {
    primary: { type: SandboxProviderType; name: string; available: boolean };
    fallback?: { type: SandboxProviderType; name: string; available: boolean };
  } {
    this.ensureInitialized();

    return {
      primary: {
        type: this.primaryProvider!.type,
        name: this.primaryProvider!.name,
        available: this.primaryProvider!.available,
      },
      fallback: this.fallbackProvider
        ? {
            type: this.fallbackProvider.type,
            name: this.fallbackProvider.name,
            available: this.fallbackProvider.available,
          }
        : undefined,
    };
  }

  /**
   * Get audit log
   */
  getAuditLog(options?: {
    sessionId?: string;
    userId?: string;
    event?: SandboxAuditEvent['event'];
    since?: Date;
    limit?: number;
  }): SandboxAuditEvent[] {
    let events = [...this.auditLog];

    if (options?.sessionId) {
      events = events.filter((e) => e.sessionId === options.sessionId);
    }
    if (options?.userId) {
      events = events.filter((e) => e.userId === options.userId);
    }
    if (options?.event) {
      events = events.filter((e) => e.event === options.event);
    }
    if (options?.since) {
      events = events.filter((e) => e.timestamp >= options.since!);
    }
    if (options?.limit) {
      events = events.slice(-options.limit);
    }

    return events;
  }

  /**
   * Shutdown the manager and all providers
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    await this.stopAllSessions();

    if (this.primaryProvider) {
      await this.primaryProvider.shutdown();
    }
    if (this.fallbackProvider) {
      await this.fallbackProvider.shutdown();
    }

    this.initialized = false;
    this.emit('shutdown');
  }

  /**
   * Ensure the manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.primaryProvider) {
      throw new Error('SandboxManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log an audit event
   */
  private logAuditEvent(
    event: Omit<SandboxAuditEvent, 'timestamp'>
  ): void {
    if (!this.config.enableAuditLog) return;

    const auditEvent: SandboxAuditEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.auditLog.push(auditEvent);
    this.emit('audit', auditEvent);

    // Keep audit log bounded (last 10000 events)
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }
  }
}

/**
 * Create a sandbox manager with the given configuration
 */
export function createSandboxManager(
  config: SandboxManagerConfig
): SandboxManager {
  return new SandboxManager(config);
}

/**
 * Create a sandbox manager from environment variables
 */
export function createSandboxManagerFromEnv(
  repoRoot: string
): SandboxManager {
  const providerType = (process.env.SANDBOX_PROVIDER || 'docker') as SandboxProviderType;

  let config: SandboxManagerConfig;

  switch (providerType) {
    case 'e2b':
      if (!process.env.E2B_API_KEY) {
        throw new Error('E2B_API_KEY environment variable is required');
      }
      config = {
        repoRoot,
        provider: {
          type: 'e2b',
          options: {
            apiKey: process.env.E2B_API_KEY,
            templateId: process.env.E2B_TEMPLATE_ID,
            timeoutMs: parseInt(process.env.E2B_TIMEOUT_MS || '300000', 10),
          },
        },
        enableAuditLog: process.env.SANDBOX_AUDIT_LOG === 'true',
      };
      break;

    case 'daytona':
      if (!process.env.DAYTONA_API_KEY) {
        throw new Error('DAYTONA_API_KEY environment variable is required');
      }
      config = {
        repoRoot,
        provider: {
          type: 'daytona',
          options: {
            apiKey: process.env.DAYTONA_API_KEY,
            snapshot: process.env.DAYTONA_SNAPSHOT,
            language: (process.env.DAYTONA_LANGUAGE as 'python' | 'typescript' | 'javascript') || 'typescript',
            autoStopInterval: parseInt(process.env.DAYTONA_AUTO_STOP_INTERVAL || '15', 10),
          },
        },
        enableAuditLog: process.env.SANDBOX_AUDIT_LOG === 'true',
      };
      break;

    case 'docker':
    default:
      config = {
        repoRoot,
        provider: {
          type: 'docker',
          options: {
            socketPath: process.env.DOCKER_SOCKET_PATH,
            host: process.env.DOCKER_HOST,
            image: process.env.SANDBOX_IMAGE || 'wit-sandbox:latest',
            network: process.env.DOCKER_NETWORK,
          },
        },
        enableAuditLog: process.env.SANDBOX_AUDIT_LOG === 'true',
      };
      break;
  }

  return new SandboxManager(config);
}
