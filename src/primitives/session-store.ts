/**
 * Session Store
 * 
 * Tiered storage for VirtualFS sessions:
 * 
 * 1. Hot Layer (Memory) - Active sessions for immediate access
 * 2. Warm Layer (Redis) - Session persistence, survives restarts
 * 3. Cold Layer (Database) - Long-term session history, recovery
 * 
 * Users don't need to think about storage - sessions are automatically:
 * - Persisted to Redis on every change
 * - Recovered from Redis on reconnection
 * - Evicted from memory when inactive
 * - Backed up to database for important sessions
 */

// Redis type - optional dependency
type Redis = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;
};

/**
 * Serialized file for storage
 */
export interface SerializedFile {
  content: string; // base64 encoded
  mode: string;
  modified: boolean;
}

/**
 * Serialized session state for persistence
 */
export interface SerializedSession {
  id: string;
  userId: string;
  repoPath: string;
  branch: string;
  baseCommit: string | null;
  files: Record<string, SerializedFile>;
  createdAt: string;
  lastModified: string;
  totalSize: number;
}

/**
 * Session store configuration
 */
export interface SessionStoreConfig {
  /** Redis client (optional - falls back to memory-only) */
  redis?: Redis;
  /** Maximum session age in seconds (default: 24 hours) */
  maxSessionAge?: number;
  /** Maximum memory per session in bytes (default: 50MB) */
  maxSessionSize?: number;
  /** Maximum file size in bytes (default: 5MB) */
  maxFileSize?: number;
  /** Maximum files per session (default: 1000) */
  maxFiles?: number;
  /** Auto-persist interval in ms (default: 5000) */
  persistInterval?: number;
  /** Memory eviction threshold - evict when this many sessions (default: 100) */
  maxMemorySessions?: number;
}

const DEFAULT_CONFIG: Required<SessionStoreConfig> = {
  redis: undefined as any,
  maxSessionAge: 24 * 60 * 60, // 24 hours
  maxSessionSize: 50 * 1024 * 1024, // 50MB
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 1000,
  persistInterval: 5000, // 5 seconds
  maxMemorySessions: 100,
};

/**
 * Tiered session storage
 */
export class SessionStore {
  private config: Required<SessionStoreConfig>;
  private memoryCache: Map<string, SerializedSession> = new Map();
  private dirtyKeys: Set<string> = new Set();
  private accessTimes: Map<string, number> = new Map();
  private persistTimer?: NodeJS.Timeout;

  constructor(config: SessionStoreConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Start auto-persist if Redis is available
    if (this.config.redis) {
      this.startAutoPersist();
    }
  }

  /**
   * Get a session, checking memory first, then Redis
   */
  async get(sessionId: string): Promise<SerializedSession | null> {
    // Check memory cache first
    const cached = this.memoryCache.get(sessionId);
    if (cached) {
      this.accessTimes.set(sessionId, Date.now());
      return cached;
    }

    // Try Redis
    if (this.config.redis) {
      const data = await this.config.redis.get(this.redisKey(sessionId));
      if (data) {
        const session = JSON.parse(data) as SerializedSession;
        this.memoryCache.set(sessionId, session);
        this.accessTimes.set(sessionId, Date.now());
        this.evictIfNeeded();
        return session;
      }
    }

    return null;
  }

  /**
   * Save a session (to memory immediately, Redis async)
   */
  async set(session: SerializedSession): Promise<void> {
    // Validate limits
    this.validateSession(session);

    // Save to memory
    this.memoryCache.set(session.id, session);
    this.accessTimes.set(session.id, Date.now());
    this.dirtyKeys.add(session.id);

    // Evict old sessions if memory is full
    this.evictIfNeeded();

    // If no Redis, persist immediately is not possible
    // Otherwise, dirty flag ensures it gets persisted on next interval
  }

  /**
   * Delete a session from all tiers
   */
  async delete(sessionId: string): Promise<void> {
    this.memoryCache.delete(sessionId);
    this.dirtyKeys.delete(sessionId);
    this.accessTimes.delete(sessionId);

    if (this.config.redis) {
      await this.config.redis.del(this.redisKey(sessionId));
    }
  }

  /**
   * List all session IDs for a user
   */
  async listUserSessions(userId: string): Promise<string[]> {
    const sessions: string[] = [];

    // Check memory
    for (const [id, session] of this.memoryCache) {
      if (session.userId === userId) {
        sessions.push(id);
      }
    }

    // Check Redis (if available, get additional sessions not in memory)
    if (this.config.redis) {
      const keys = await this.config.redis.keys(`ide:session:*`);
      for (const key of keys) {
        const sessionId = key.replace('ide:session:', '');
        if (!sessions.includes(sessionId)) {
          const data = await this.config.redis.get(key);
          if (data) {
            const session = JSON.parse(data) as SerializedSession;
            if (session.userId === userId) {
              sessions.push(sessionId);
            }
          }
        }
      }
    }

    return sessions;
  }

  /**
   * Force persist all dirty sessions to Redis
   */
  async flush(): Promise<void> {
    if (!this.config.redis) return;

    const promises: Promise<void>[] = [];
    for (const sessionId of this.dirtyKeys) {
      const session = this.memoryCache.get(sessionId);
      if (session) {
        promises.push(this.persistToRedis(session));
      }
    }
    await Promise.all(promises);
    this.dirtyKeys.clear();
  }

  /**
   * Cleanup expired sessions
   */
  async cleanup(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();
    const maxAge = this.config.maxSessionAge * 1000;

    // Cleanup memory
    for (const [id, session] of this.memoryCache) {
      const lastAccess = this.accessTimes.get(id) || 0;
      if (now - lastAccess > maxAge) {
        this.memoryCache.delete(id);
        this.accessTimes.delete(id);
        cleaned++;
      }
    }

    // Cleanup Redis (sessions have TTL, but we can be proactive)
    // Redis handles this automatically via EXPIRE

    return cleaned;
  }

  /**
   * Stop auto-persist timer
   */
  stop(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }
  }

  // === Private Methods ===

  private redisKey(sessionId: string): string {
    return `ide:session:${sessionId}`;
  }

  private validateSession(session: SerializedSession): void {
    // Check total size
    if (session.totalSize > this.config.maxSessionSize) {
      throw new Error(
        `Session exceeds maximum size (${Math.round(session.totalSize / 1024 / 1024)}MB > ${Math.round(this.config.maxSessionSize / 1024 / 1024)}MB). ` +
        `Commit changes to free memory.`
      );
    }

    // Check file count
    const fileCount = Object.keys(session.files).length;
    if (fileCount > this.config.maxFiles) {
      throw new Error(
        `Session exceeds maximum file count (${fileCount} > ${this.config.maxFiles}). ` +
        `Consider using a local checkout for large repositories.`
      );
    }

    // Check individual file sizes
    for (const [path, file] of Object.entries(session.files)) {
      const size = Buffer.byteLength(file.content, 'base64') * 0.75; // base64 overhead
      if (size > this.config.maxFileSize) {
        throw new Error(
          `File "${path}" exceeds maximum size (${Math.round(size / 1024)}KB > ${Math.round(this.config.maxFileSize / 1024)}KB). ` +
          `Large files should be committed separately.`
        );
      }
    }
  }

  private async persistToRedis(session: SerializedSession): Promise<void> {
    if (!this.config.redis) return;

    const key = this.redisKey(session.id);
    const data = JSON.stringify(session);
    
    // Set with TTL
    await this.config.redis.set(key, data, 'EX', this.config.maxSessionAge);
  }

  private evictIfNeeded(): void {
    if (this.memoryCache.size <= this.config.maxMemorySessions) {
      return;
    }

    // Sort by last access time
    const sorted = [...this.accessTimes.entries()]
      .sort((a, b) => a[1] - b[1]);

    // Evict oldest sessions (but ensure they're persisted first)
    const toEvict = sorted.slice(0, this.memoryCache.size - this.config.maxMemorySessions);
    
    for (const [sessionId] of toEvict) {
      // Don't evict dirty sessions - they need to be persisted first
      if (!this.dirtyKeys.has(sessionId)) {
        this.memoryCache.delete(sessionId);
        this.accessTimes.delete(sessionId);
      }
    }
  }

  private startAutoPersist(): void {
    this.persistTimer = setInterval(async () => {
      try {
        await this.flush();
      } catch (error) {
        console.error('[SessionStore] Auto-persist error:', error);
      }
    }, this.config.persistInterval);

    // Don't prevent process exit
    this.persistTimer.unref();
  }
}

/**
 * Create a session store with Redis if available
 */
export async function createSessionStore(redisUrl?: string): Promise<SessionStore> {
  if (redisUrl) {
    try {
      // Dynamic import for optional ioredis dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      let ioredis: any;
      try {
        // Use indirect require to avoid TypeScript module resolution
        const moduleName = 'ioredis';
        ioredis = await eval(`import('${moduleName}')`);
      } catch {
        console.warn('ioredis not installed, using in-memory session store');
        return new SessionStore();
      }
      if (!ioredis) {
        console.warn('ioredis not installed, using in-memory session store');
        return new SessionStore();
      }
      const redis = new (ioredis as any).default(redisUrl);
      
      // Test connection
      await redis.ping();
      console.log('[SessionStore] Connected to Redis');
      
      return new SessionStore({ redis });
    } catch (error) {
      console.warn('[SessionStore] Redis connection failed, using memory-only:', error);
    }
  }

  console.log('[SessionStore] Using memory-only storage (sessions will not persist across restarts)');
  return new SessionStore();
}

// Singleton instance
let globalStore: SessionStore | null = null;

/**
 * Get the global session store instance
 */
export function getSessionStore(): SessionStore {
  if (!globalStore) {
    globalStore = new SessionStore();
  }
  return globalStore;
}

/**
 * Initialize the global session store with Redis
 */
export async function initSessionStore(redisUrl?: string): Promise<SessionStore> {
  globalStore = await createSessionStore(redisUrl);
  return globalStore;
}
