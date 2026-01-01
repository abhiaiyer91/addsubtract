/**
 * Redis Client Initialization
 * 
 * Provides centralized Redis connection management with auto-initialization,
 * health checks, and graceful shutdown support.
 */

// @ts-expect-error - redis is an optional dependency
import { createClient, RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { setRateLimitStore, RedisStore, RedisClient } from './middleware/rate-limit';

// =============================================================================
// Types
// =============================================================================

export type WitRedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

export interface RedisOptions {
  /** Redis connection URL */
  url: string;
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Max retries before giving up */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Enable auto-reconnect */
  autoReconnect?: boolean;
}

export interface RedisHealthCheck {
  connected: boolean;
  latency: number;
  uptime?: number;
}

// =============================================================================
// Redis Client Singleton
// =============================================================================

let redisClient: WitRedisClient | null = null;
let isConnecting = false;
let connectionPromise: Promise<WitRedisClient> | null = null;

/**
 * Initialize Redis connection
 * Returns existing client if already connected
 */
export async function initRedis(options: RedisOptions): Promise<WitRedisClient> {
  // Return existing client if connected
  if (redisClient?.isOpen) {
    return redisClient;
  }

  // If already connecting, wait for that connection
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  isConnecting = true;
  connectionPromise = connectRedis(options);

  try {
    redisClient = await connectionPromise;
    return redisClient;
  } finally {
    isConnecting = false;
    connectionPromise = null;
  }
}

/**
 * Internal connection function with retry logic
 */
async function connectRedis(options: RedisOptions): Promise<WitRedisClient> {
  const {
    url,
    connectTimeout = 5000,
    maxRetries = 3,
    retryDelay = 1000,
    autoReconnect = true,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = createClient({
        url,
        socket: {
          connectTimeout,
          reconnectStrategy: autoReconnect
            ? (retries: number) => Math.min(retries * 100, 3000)
            : false,
        },
      });

      // Set up error handling
      client.on('error', (err: Error) => {
        console.error('[redis] Error:', err.message);
      });

      client.on('reconnecting', () => {
        console.log('[redis] Reconnecting...');
      });

      client.on('ready', () => {
        console.log('[redis] Connection ready');
      });

      await client.connect();
      console.log(`[redis] Connected (attempt ${attempt})`);
      
      return client as WitRedisClient;
    } catch (error) {
      lastError = error as Error;
      console.warn(`[redis] Connection attempt ${attempt} failed: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error(`Redis connection failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Get the Redis client instance
 * Throws if not initialized
 */
export function getRedis(): WitRedisClient {
  if (!redisClient?.isOpen) {
    throw new Error('Redis not initialized. Call initRedis() first.');
  }
  return redisClient;
}

/**
 * Get the Redis client if available, or null
 */
export function getRedisOptional(): WitRedisClient | null {
  return redisClient?.isOpen ? redisClient : null;
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient?.isOpen ?? false;
}

/**
 * Perform Redis health check
 */
export async function redisHealthCheck(): Promise<RedisHealthCheck> {
  if (!redisClient?.isOpen) {
    return { connected: false, latency: -1 };
  }

  const start = Date.now();
  try {
    await redisClient.ping();
    const info = await redisClient.info('server');
    const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
    
    return {
      connected: true,
      latency: Date.now() - start,
      uptime: uptimeMatch ? parseInt(uptimeMatch[1], 10) : undefined,
    };
  } catch {
    return { connected: false, latency: Date.now() - start };
  }
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[redis] Connection closed');
    } catch (error) {
      console.error('[redis] Error closing connection:', error);
    } finally {
      redisClient = null;
    }
  }
}

// =============================================================================
// Rate Limiting Integration
// =============================================================================

/**
 * Adapter to make node-redis compatible with our RedisClient interface
 */
function createRateLimitAdapter(client: WitRedisClient): RedisClient {
  return {
    async incr(key: string): Promise<number> {
      return await client.incr(key);
    },
    async pexpire(key: string, milliseconds: number): Promise<number> {
      return await client.pExpire(key, milliseconds) ? 1 : 0;
    },
    async pttl(key: string): Promise<number> {
      return await client.pTTL(key);
    },
    async get(key: string): Promise<string | null> {
      return await client.get(key);
    },
    async del(key: string): Promise<number> {
      return await client.del(key);
    },
    async quit(): Promise<string> {
      await client.quit();
      return 'OK';
    },
  };
}

/**
 * Initialize Redis and configure rate limiting
 * Safe to call multiple times
 */
export async function initRedisRateLimiting(url: string): Promise<void> {
  try {
    const client = await initRedis({ url });
    const adapter = createRateLimitAdapter(client);
    setRateLimitStore(new RedisStore(adapter));
    console.log('[redis] Rate limiting configured with Redis store');
  } catch (error) {
    console.warn('[redis] Rate limiting will use in-memory store:', (error as Error).message);
  }
}

// =============================================================================
// Cache Helpers
// =============================================================================

/**
 * Generic cache get/set with automatic JSON serialization
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisOptional();
    if (!client) return null;
    
    const value = await client.get(key);
    if (!value) return null;
    
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  },

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const client = getRedisOptional();
    if (!client) return;
    
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, stringValue);
    } else {
      await client.set(key, stringValue);
    }
  },

  async del(key: string): Promise<void> {
    const client = getRedisOptional();
    if (!client) return;
    await client.del(key);
  },

  async exists(key: string): Promise<boolean> {
    const client = getRedisOptional();
    if (!client) return false;
    return (await client.exists(key)) > 0;
  },

  async ttl(key: string): Promise<number> {
    const client = getRedisOptional();
    if (!client) return -2;
    return await client.ttl(key);
  },

  /**
   * Get or set with callback
   * Returns cached value if exists, otherwise calls fn and caches result
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  },
};

// =============================================================================
// Pub/Sub Support
// =============================================================================

let subscriberClient: WitRedisClient | null = null;
const subscriptions = new Map<string, Set<(message: string) => void>>();

/**
 * Get or create a dedicated subscriber client
 */
async function getSubscriberClient(): Promise<WitRedisClient> {
  if (subscriberClient?.isOpen) {
    return subscriberClient;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL not set, cannot create subscriber');
  }

  subscriberClient = await initRedis({ url });
  return subscriberClient;
}

/**
 * Subscribe to a Redis channel
 */
export async function subscribe(channel: string, callback: (message: string) => void): Promise<void> {
  const client = await getSubscriberClient();
  
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
    await client.subscribe(channel, (message: string) => {
      const callbacks = subscriptions.get(channel);
      callbacks?.forEach(cb => cb(message));
    });
  }
  
  subscriptions.get(channel)!.add(callback);
}

/**
 * Unsubscribe from a Redis channel
 */
export async function unsubscribe(channel: string, callback?: (message: string) => void): Promise<void> {
  const callbacks = subscriptions.get(channel);
  if (!callbacks) return;
  
  if (callback) {
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      subscriptions.delete(channel);
      if (subscriberClient?.isOpen) {
        await subscriberClient.unsubscribe(channel);
      }
    }
  } else {
    subscriptions.delete(channel);
    if (subscriberClient?.isOpen) {
      await subscriberClient.unsubscribe(channel);
    }
  }
}

/**
 * Publish a message to a Redis channel
 */
export async function publish(channel: string, message: string): Promise<void> {
  const client = getRedisOptional();
  if (!client) return;
  await client.publish(channel, message);
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

/**
 * Close all Redis connections
 */
export async function closeAllRedis(): Promise<void> {
  const promises: Promise<void>[] = [];
  
  if (redisClient) {
    promises.push(closeRedis());
  }
  
  if (subscriberClient) {
    promises.push((async () => {
      try {
        await subscriberClient!.quit();
        subscriberClient = null;
      } catch (error) {
        console.error('[redis] Error closing subscriber:', error);
      }
    })());
  }
  
  await Promise.all(promises);
  subscriptions.clear();
}

// Handle process signals for graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[redis] SIGTERM received, closing connections...');
  await closeAllRedis();
});

process.on('SIGINT', async () => {
  console.log('[redis] SIGINT received, closing connections...');
  await closeAllRedis();
});
