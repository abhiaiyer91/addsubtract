/**
 * Rate Limiting Middleware for Hono
 * Protects API endpoints from abuse with configurable limits
 */

import { Context, MiddlewareHandler } from 'hono';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed in window */
  max: number;
  /** Custom key generator for rate limiting (default: IP address) */
  keyGenerator?: (c: Context) => string;
  /** Custom handler when rate limit exceeded */
  handler?: (c: Context) => Response;
  /** Skip rate limiting for certain requests */
  skip?: (c: Context) => boolean | Promise<boolean>;
  /** Prefix for rate limit keys */
  keyPrefix?: string;
  /** Whether to send rate limit headers */
  headers?: boolean;
  /** Message to return when rate limited */
  message?: string;
}

export interface RateLimitInfo {
  /** Total allowed requests */
  limit: number;
  /** Remaining requests in current window */
  remaining: number;
  /** Time in ms until the rate limit resets */
  resetTime: number;
  /** Whether the request was rate limited */
  limited: boolean;
}

/**
 * Storage interface for rate limit data
 * Implementations can use Redis, memory, etc.
 */
export interface RateLimitStore {
  /** Increment the counter and get current count */
  increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }>;
  /** Get current count for a key */
  get(key: string): Promise<{ count: number; ttl: number } | null>;
  /** Reset the counter for a key */
  reset(key: string): Promise<void>;
  /** Close the store connection */
  close?(): Promise<void>;
}

// ============================================================================
// In-Memory Store (Default)
// ============================================================================

interface MemoryStoreEntry {
  count: number;
  expiresAt: number;
}

/**
 * Simple in-memory store for rate limiting
 * Suitable for single-instance deployments
 */
export class MemoryStore implements RateLimitStore {
  private store = new Map<string, MemoryStoreEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs: number = 60000) {
    // Periodically clean up expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (entry && entry.expiresAt > now) {
      // Key exists and hasn't expired
      entry.count++;
      return { count: entry.count, ttl: entry.expiresAt - now };
    }

    // Create new entry
    const newEntry: MemoryStoreEntry = {
      count: 1,
      expiresAt: now + windowMs,
    };
    this.store.set(key, newEntry);
    return { count: 1, ttl: windowMs };
  }

  async get(key: string): Promise<{ count: number; ttl: number } | null> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.expiresAt <= now) {
      this.store.delete(key);
      return null;
    }

    return { count: entry.count, ttl: entry.expiresAt - now };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// ============================================================================
// Redis Store
// ============================================================================

/**
 * Redis-based store for rate limiting
 * Suitable for distributed/multi-instance deployments
 */
export class RedisStore implements RateLimitStore {
  private redis: RedisClient;

  constructor(redis: RedisClient) {
    this.redis = redis;
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      // First request in window, set expiry
      await this.redis.pexpire(key, windowMs);
    }

    const ttl = await this.redis.pttl(key);
    return { count, ttl: ttl > 0 ? ttl : windowMs };
  }

  async get(key: string): Promise<{ count: number; ttl: number } | null> {
    const count = await this.redis.get(key);
    if (count === null) {
      return null;
    }

    const ttl = await this.redis.pttl(key);
    return { count: parseInt(count, 10), ttl: ttl > 0 ? ttl : 0 };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Minimal Redis client interface
 * Compatible with ioredis
 */
export interface RedisClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  quit(): Promise<string>;
}

// ============================================================================
// Rate Limiter Middleware
// ============================================================================

// Global store instance (can be overridden)
let globalStore: RateLimitStore = new MemoryStore();

/**
 * Set the global rate limit store
 */
export function setRateLimitStore(store: RateLimitStore): void {
  globalStore = store;
}

/**
 * Get the global rate limit store
 */
export function getRateLimitStore(): RateLimitStore {
  return globalStore;
}

/**
 * Default key generator using IP address
 */
function defaultKeyGenerator(c: Context): string {
  // Try various headers for real IP (behind proxies)
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP if there are multiple
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to connection info or unknown
  return 'unknown';
}

/**
 * Default handler when rate limit exceeded
 */
function defaultHandler(c: Context, config: RateLimitConfig): Response {
  const message = config.message ?? 'Too many requests, please try again later.';
  return c.json({ error: message, code: 'RATE_LIMIT_EXCEEDED' }, 429);
}

/**
 * Create rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig): MiddlewareHandler {
  const {
    windowMs,
    max,
    keyGenerator = defaultKeyGenerator,
    handler,
    skip,
    keyPrefix = 'ratelimit',
    headers = true,
  } = config;

  return async (c, next) => {
    // Check if request should skip rate limiting
    if (skip) {
      const shouldSkip = await skip(c);
      if (shouldSkip) {
        return next();
      }
    }

    // Generate rate limit key
    const clientKey = keyGenerator(c);
    const rateKey = `${keyPrefix}:${clientKey}`;

    // Get current count
    const store = getRateLimitStore();
    const { count, ttl } = await store.increment(rateKey, windowMs);
    const remaining = Math.max(0, max - count);
    const resetTime = Math.ceil(ttl / 1000);

    // Set rate limit headers
    if (headers) {
      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + resetTime));
    }

    // Store rate limit info for access in route handlers
    c.set('rateLimit', {
      limit: max,
      remaining,
      resetTime: ttl,
      limited: count > max,
    } as RateLimitInfo);

    // Check if rate limit exceeded
    if (count > max) {
      if (headers) {
        c.header('Retry-After', String(resetTime));
      }

      if (handler) {
        return handler(c);
      }
      return defaultHandler(c, config);
    }

    return next();
  };
}

// ============================================================================
// Rate Limit Presets
// ============================================================================

/**
 * Preset configurations for common use cases
 */
export const RateLimitPresets = {
  /**
   * Strict limit for sensitive endpoints (auth, password reset)
   * 5 requests per minute
   */
  strict: {
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    keyPrefix: 'ratelimit:strict',
    message: 'Too many attempts. Please wait a minute and try again.',
  } as RateLimitConfig,

  /**
   * Standard API limit for authenticated users
   * 100 requests per minute
   */
  standard: {
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    keyPrefix: 'ratelimit:standard',
    message: 'Rate limit exceeded. Please slow down.',
  } as RateLimitConfig,

  /**
   * Relaxed limit for read-only endpoints
   * 300 requests per minute
   */
  relaxed: {
    windowMs: 60 * 1000, // 1 minute
    max: 300,
    keyPrefix: 'ratelimit:relaxed',
    message: 'Rate limit exceeded.',
  } as RateLimitConfig,

  /**
   * Very strict for login/registration
   * 3 attempts per 15 minutes
   */
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    keyPrefix: 'ratelimit:auth',
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  } as RateLimitConfig,

  /**
   * Upload/mutation limit
   * 30 requests per minute
   */
  upload: {
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    keyPrefix: 'ratelimit:upload',
    message: 'Upload rate limit exceeded. Please wait before uploading more.',
  } as RateLimitConfig,

  /**
   * Webhook/callback limit
   * 60 requests per minute
   */
  webhook: {
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    keyPrefix: 'ratelimit:webhook',
    message: 'Webhook rate limit exceeded.',
  } as RateLimitConfig,

  /**
   * Search/expensive operation limit
   * 20 requests per minute
   */
  search: {
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    keyPrefix: 'ratelimit:search',
    message: 'Search rate limit exceeded. Please wait before searching again.',
  } as RateLimitConfig,
};

// ============================================================================
// User-based Rate Limiting
// ============================================================================

export interface UserRateLimitConfig extends RateLimitConfig {
  /** Get user ID from context (return null for unauthenticated) */
  getUserId: (c: Context) => string | null | Promise<string | null>;
  /** Limits for authenticated users (optional override) */
  authenticatedMax?: number;
  /** Limits for unauthenticated users (optional override) */
  unauthenticatedMax?: number;
}

/**
 * Create user-aware rate limiting middleware
 * Different limits for authenticated vs unauthenticated users
 */
export function userRateLimit(config: UserRateLimitConfig): MiddlewareHandler {
  const {
    getUserId,
    authenticatedMax,
    unauthenticatedMax,
    ...baseConfig
  } = config;

  return async (c, next) => {
    const userId = await getUserId(c);
    const isAuthenticated = userId !== null;

    // Determine the appropriate limit
    let max = baseConfig.max;
    if (isAuthenticated && authenticatedMax !== undefined) {
      max = authenticatedMax;
    } else if (!isAuthenticated && unauthenticatedMax !== undefined) {
      max = unauthenticatedMax;
    }

    // Create key based on user ID or IP
    const keyGenerator = (c: Context): string => {
      if (userId) {
        return `user:${userId}`;
      }
      // Fall back to IP for unauthenticated users
      const forwardedFor = c.req.header('x-forwarded-for');
      if (forwardedFor) {
        return `ip:${forwardedFor.split(',')[0].trim()}`;
      }
      return `ip:${c.req.header('x-real-ip') ?? 'unknown'}`;
    };

    // Create rate limiter with user-specific config
    const limiter = rateLimit({
      ...baseConfig,
      max,
      keyGenerator,
    });

    return limiter(c, next);
  };
}

// ============================================================================
// Trusted Source Bypass
// ============================================================================

export interface TrustedSourceConfig {
  /** List of trusted IP addresses or CIDR ranges */
  trustedIPs?: string[];
  /** List of trusted API keys */
  trustedApiKeys?: string[];
  /** Header to check for API key */
  apiKeyHeader?: string;
  /** Custom trust check function */
  isTrusted?: (c: Context) => boolean | Promise<boolean>;
}

/**
 * Create a skip function that bypasses rate limiting for trusted sources
 */
export function createTrustedBypass(config: TrustedSourceConfig): (c: Context) => Promise<boolean> {
  const {
    trustedIPs = [],
    trustedApiKeys = [],
    apiKeyHeader = 'x-api-key',
    isTrusted,
  } = config;

  // Create IP set for O(1) lookup
  const trustedIPSet = new Set(trustedIPs);
  const trustedKeySet = new Set(trustedApiKeys);

  return async (c: Context): Promise<boolean> => {
    // Check custom trust function first
    if (isTrusted) {
      const trusted = await isTrusted(c);
      if (trusted) return true;
    }

    // Check API key
    const apiKey = c.req.header(apiKeyHeader);
    if (apiKey && trustedKeySet.has(apiKey)) {
      return true;
    }

    // Check IP address
    const clientIP = c.req.header('x-forwarded-for')?.split(',')[0].trim()
      ?? c.req.header('x-real-ip')
      ?? 'unknown';

    if (trustedIPSet.has(clientIP)) {
      return true;
    }

    // Check CIDR ranges (simplified - only /24 and /16 for now)
    for (const trustedIP of trustedIPs) {
      if (trustedIP.includes('/')) {
        if (isIPInCIDR(clientIP, trustedIP)) {
          return true;
        }
      }
    }

    return false;
  };
}

/**
 * Simple CIDR check (supports /8, /16, /24)
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const maskBits = parseInt(bits, 10);
  
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) {
    return false;
  }

  // Check based on mask size
  if (maskBits <= 8) {
    return ipParts[0] === rangeParts[0];
  } else if (maskBits <= 16) {
    return ipParts[0] === rangeParts[0] && ipParts[1] === rangeParts[1];
  } else if (maskBits <= 24) {
    return ipParts[0] === rangeParts[0] && 
           ipParts[1] === rangeParts[1] && 
           ipParts[2] === rangeParts[2];
  }

  return ip === range;
}

// ============================================================================
// Sliding Window Rate Limiter
// ============================================================================

/**
 * Sliding window rate limiter for more accurate limiting
 * Uses Redis sorted sets for precise tracking
 */
export class SlidingWindowStore implements RateLimitStore {
  private redis: SlidingWindowRedisClient;

  constructor(redis: SlidingWindowRedisClient) {
    this.redis = redis;
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Use a pipeline for atomic operations
    const pipeline = this.redis.pipeline();
    
    // Remove old entries
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    
    // Add current request
    pipeline.zadd(key, now, `${now}:${Math.random()}`);
    
    // Count requests in window
    pipeline.zcard(key);
    
    // Set expiry on the key
    pipeline.pexpire(key, windowMs);

    const results = await pipeline.exec();
    
    // Get count from zcard result
    const count = (results?.[2]?.[1] as number) ?? 0;
    
    return { count, ttl: windowMs };
  }

  async get(key: string): Promise<{ count: number; ttl: number } | null> {
    const count = await this.redis.zcard(key);
    if (count === 0) {
      return null;
    }

    const ttl = await this.redis.pttl(key);
    return { count, ttl: ttl > 0 ? ttl : 0 };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Extended Redis client interface for sliding window
 */
export interface SlidingWindowRedisClient extends RedisClient {
  pipeline(): RedisPipeline;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zcard(key: string): Promise<number>;
}

export interface RedisPipeline {
  zremrangebyscore(key: string, min: number | string, max: number | string): this;
  zadd(key: string, score: number, member: string): this;
  zcard(key: string): this;
  pexpire(key: string, milliseconds: number): this;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

// ============================================================================
// Endpoint-specific Rate Limit Factory
// ============================================================================

export type EndpointType = 'read' | 'write' | 'auth' | 'search' | 'upload' | 'webhook' | 'public';

const endpointPresets: Record<EndpointType, RateLimitConfig> = {
  read: RateLimitPresets.relaxed,
  write: RateLimitPresets.standard,
  auth: RateLimitPresets.auth,
  search: RateLimitPresets.search,
  upload: RateLimitPresets.upload,
  webhook: RateLimitPresets.webhook,
  public: RateLimitPresets.relaxed,
};

/**
 * Create rate limiter for specific endpoint type
 */
export function rateLimitForEndpoint(
  type: EndpointType,
  overrides?: Partial<RateLimitConfig>
): MiddlewareHandler {
  const preset = endpointPresets[type];
  return rateLimit({
    ...preset,
    ...overrides,
  });
}

// ============================================================================
// Exports
// ============================================================================

export default rateLimit;
