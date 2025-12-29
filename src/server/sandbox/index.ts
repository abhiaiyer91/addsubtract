/**
 * Sandbox Module
 *
 * Provides pluggable sandbox providers for safe code execution.
 *
 * Supported providers:
 * - E2B: Firecracker microVM sandboxes (e2b.dev) - Best for production
 * - Daytona: Cloud dev environments (daytona.io) - Best for AI coding agents
 * - Docker: Local containers (self-hosted) - Best for development
 *
 * @example
 * ```typescript
 * import { createSandboxManager } from './sandbox';
 *
 * // Create manager with E2B provider
 * const manager = createSandboxManager({
 *   repoRoot: '/var/lib/wit/repos',
 *   provider: {
 *     type: 'e2b',
 *     options: {
 *       apiKey: process.env.E2B_API_KEY!,
 *     },
 *   },
 * });
 *
 * await manager.initialize();
 *
 * // Create a sandbox session
 * const session = await manager.createSession({
 *   userId: 'user-123',
 *   repository: 'my-repo.git',
 *   pty: { cols: 120, rows: 30, term: 'xterm-256color' },
 * });
 *
 * // Execute commands
 * const result = await session.exec('npm', ['install']);
 * console.log(result.stdout);
 *
 * // Or use interactive PTY
 * session.on('data', (data) => process.stdout.write(data));
 * session.sendInput('ls -la\n');
 *
 * // Cleanup
 * await session.stop();
 * await manager.shutdown();
 * ```
 */

// Types
export type {
  SandboxProviderType,
  NetworkMode,
  SandboxResourceLimits,
  PTYConfig,
  SandboxSessionConfig,
  SandboxState,
  CommandResult,
  SandboxSession,
  SandboxInfo,
  SandboxStats,
  SandboxProviderConfig,
  E2BProviderConfig,
  DaytonaProviderConfig,
  DockerProviderConfig,
  ProviderConfig,
  SandboxProvider,
  SandboxManagerConfig,
  SandboxAuditEvent,
} from './types';

// Constants
export {
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_PTY_CONFIG,
  PROVIDER_FEATURES,
} from './types';

// Base classes
export { BaseSandboxProvider, BaseSandboxSession } from './base-provider';

// Manager
export {
  SandboxManager,
  createSandboxManager,
  createSandboxManagerFromEnv,
  registerProvider,
} from './manager';

// Providers (lazy loaded, but exported for direct use)
export { E2BProvider } from './providers/e2b';
export { DaytonaProvider } from './providers/daytona';
export { DockerProvider } from './providers/docker';
