/**
 * Sandbox Pool Manager
 *
 * Manages a pool of sandbox instances to reuse across requests,
 * reducing cold start latency and costs.
 *
 * Features:
 * - Sandbox reuse by repoId + userId key
 * - Automatic idle timeout and cleanup
 * - Concurrency limits per user/repo
 * - Health monitoring and recovery
 */

import { EventEmitter } from 'events';
import type { SandboxProvider as SandboxProviderType } from '../../db/models/sandbox';

// Generic sandbox interface that works across providers
export interface PooledSandbox {
  id: string;
  provider: SandboxProviderType;
  instance: unknown; // Provider-specific sandbox instance
  createdAt: Date;
  lastUsedAt: Date;
  useCount: number;
  stop: () => Promise<void>;
  runCommand: (command: string, args?: string[], options?: { signal?: AbortSignal }) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}

interface PoolEntry {
  sandbox: PooledSandbox;
  key: string;
  idleTimer: ReturnType<typeof setTimeout> | null;
  inUse: boolean;
}

interface PoolConfig {
  /** Idle timeout in ms before sandbox is stopped (default: 5 minutes) */
  idleTimeoutMs: number;
  /** Maximum sandboxes per pool key (default: 1) */
  maxPerKey: number;
  /** Maximum total sandboxes in pool (default: 10) */
  maxTotal: number;
  /** Health check interval in ms (default: 30 seconds) */
  healthCheckIntervalMs: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
  maxPerKey: 1,
  maxTotal: 10,
  healthCheckIntervalMs: 30 * 1000, // 30 seconds
};

/**
 * Sandbox Pool Manager
 *
 * Singleton that manages pooled sandbox instances across the application.
 */
export class SandboxPool extends EventEmitter {
  private pool: Map<string, PoolEntry[]> = new Map();
  private config: PoolConfig;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private totalCount = 0;
  private shuttingDown = false;

  constructor(config: Partial<PoolConfig> = {}) {
    super();
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  /**
   * Generate a pool key from repoId and optional userId
   */
  private getKey(repoId: string, userId?: string): string {
    return userId ? `${repoId}:${userId}` : repoId;
  }

  /**
   * Acquire a sandbox from the pool or create a new one
   */
  async acquire<T extends PooledSandbox>(
    key: string,
    factory: () => Promise<T>
  ): Promise<T> {
    if (this.shuttingDown) {
      throw new Error('Sandbox pool is shutting down');
    }

    // Check if we have an available sandbox for this key
    const entries = this.pool.get(key) || [];
    const available = entries.find(e => !e.inUse);

    if (available) {
      // Reuse existing sandbox
      available.inUse = true;
      available.sandbox.lastUsedAt = new Date();
      available.sandbox.useCount++;
      
      // Clear idle timer
      if (available.idleTimer) {
        clearTimeout(available.idleTimer);
        available.idleTimer = null;
      }

      this.emit('acquired', { key, reused: true, sandbox: available.sandbox });
      return available.sandbox as T;
    }

    // Check limits before creating new sandbox
    if (entries.length >= this.config.maxPerKey) {
      throw new Error(`Maximum sandboxes (${this.config.maxPerKey}) reached for key: ${key}`);
    }
    if (this.totalCount >= this.config.maxTotal) {
      // Try to evict an idle sandbox from another key
      const evicted = await this.evictIdle();
      if (!evicted) {
        throw new Error(`Maximum total sandboxes (${this.config.maxTotal}) reached`);
      }
    }

    // Create new sandbox
    const sandbox = await factory();
    const entry: PoolEntry = {
      sandbox,
      key,
      idleTimer: null,
      inUse: true,
    };

    if (!this.pool.has(key)) {
      this.pool.set(key, []);
    }
    this.pool.get(key)!.push(entry);
    this.totalCount++;

    this.emit('acquired', { key, reused: false, sandbox });
    return sandbox;
  }

  /**
   * Release a sandbox back to the pool
   */
  release(key: string, sandbox: PooledSandbox): void {
    const entries = this.pool.get(key);
    if (!entries) return;

    const entry = entries.find(e => e.sandbox.id === sandbox.id);
    if (!entry) return;

    entry.inUse = false;
    entry.sandbox.lastUsedAt = new Date();

    // Start idle timer
    entry.idleTimer = setTimeout(() => {
      this.remove(key, sandbox.id).catch(console.error);
    }, this.config.idleTimeoutMs);

    this.emit('released', { key, sandbox });
  }

  /**
   * Remove a sandbox from the pool and stop it
   */
  async remove(key: string, sandboxId: string): Promise<boolean> {
    const entries = this.pool.get(key);
    if (!entries) return false;

    const index = entries.findIndex(e => e.sandbox.id === sandboxId);
    if (index === -1) return false;

    const entry = entries[index];
    
    // Clear idle timer
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }

    // Remove from pool
    entries.splice(index, 1);
    this.totalCount--;

    if (entries.length === 0) {
      this.pool.delete(key);
    }

    // Stop the sandbox
    try {
      await entry.sandbox.stop();
      this.emit('removed', { key, sandboxId, reason: 'manual' });
    } catch (error) {
      this.emit('error', { key, sandboxId, error });
    }

    return true;
  }

  /**
   * Evict an idle sandbox to make room for a new one
   */
  private async evictIdle(): Promise<boolean> {
    // Find the oldest idle sandbox
    let oldest: { key: string; entry: PoolEntry } | null = null;

    for (const [key, entries] of this.pool) {
      for (const entry of entries) {
        if (!entry.inUse) {
          if (!oldest || entry.sandbox.lastUsedAt < oldest.entry.sandbox.lastUsedAt) {
            oldest = { key, entry };
          }
        }
      }
    }

    if (oldest) {
      await this.remove(oldest.key, oldest.entry.sandbox.id);
      return true;
    }

    return false;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalSandboxes: number;
    activeSandboxes: number;
    idleSandboxes: number;
    keyCount: number;
    keys: string[];
  } {
    let active = 0;
    let idle = 0;

    for (const entries of this.pool.values()) {
      for (const entry of entries) {
        if (entry.inUse) {
          active++;
        } else {
          idle++;
        }
      }
    }

    return {
      totalSandboxes: this.totalCount,
      activeSandboxes: active,
      idleSandboxes: idle,
      keyCount: this.pool.size,
      keys: Array.from(this.pool.keys()),
    };
  }

  /**
   * Get sandbox for a specific key (if exists and available)
   */
  get(key: string): PooledSandbox | null {
    const entries = this.pool.get(key);
    if (!entries) return null;
    
    const available = entries.find(e => !e.inUse);
    return available?.sandbox || null;
  }

  /**
   * Check if a sandbox exists for a key
   */
  has(key: string): boolean {
    const entries = this.pool.get(key);
    return !!entries && entries.length > 0;
  }

  /**
   * Start health check timer
   */
  startHealthCheck(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      await this.runHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Run health check on all sandboxes
   */
  private async runHealthCheck(): Promise<void> {
    const toRemove: Array<{ key: string; sandboxId: string }> = [];

    for (const [key, entries] of this.pool) {
      for (const entry of entries) {
        // Skip in-use sandboxes
        if (entry.inUse) continue;

        try {
          // Try a simple command to verify sandbox is healthy
          const result = await entry.sandbox.runCommand('echo', ['health'], {
            signal: AbortSignal.timeout(5000),
          });

          if (result.exitCode !== 0) {
            toRemove.push({ key, sandboxId: entry.sandbox.id });
          }
        } catch {
          // Sandbox is unhealthy, mark for removal
          toRemove.push({ key, sandboxId: entry.sandbox.id });
        }
      }
    }

    // Remove unhealthy sandboxes
    for (const { key, sandboxId } of toRemove) {
      await this.remove(key, sandboxId);
      this.emit('healthcheck-failed', { key, sandboxId });
    }
  }

  /**
   * Shutdown the pool and stop all sandboxes
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    // Stop health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Stop all sandboxes
    const stopPromises: Promise<void>[] = [];

    for (const [key, entries] of this.pool) {
      for (const entry of entries) {
        if (entry.idleTimer) {
          clearTimeout(entry.idleTimer);
        }
        stopPromises.push(
          entry.sandbox.stop().catch(error => {
            console.error(`Failed to stop sandbox ${entry.sandbox.id}:`, error);
          })
        );
      }
    }

    await Promise.all(stopPromises);
    this.pool.clear();
    this.totalCount = 0;

    this.emit('shutdown');
  }
}

// Singleton instance
let poolInstance: SandboxPool | null = null;

/**
 * Get the singleton sandbox pool instance
 */
export function getSandboxPool(config?: Partial<PoolConfig>): SandboxPool {
  if (!poolInstance) {
    poolInstance = new SandboxPool(config);
    poolInstance.startHealthCheck();
  }
  return poolInstance;
}

/**
 * Shutdown and reset the sandbox pool (for testing)
 */
export async function resetSandboxPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.shutdown();
    poolInstance = null;
  }
}
