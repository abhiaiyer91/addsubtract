/**
 * Stats Cache
 *
 * Simple in-memory cache for expensive statistics queries.
 * Uses LRU eviction with TTL-based expiration.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessedAt: number;
}

interface CacheOptions {
  maxSize?: number;
  defaultTTL?: number;
}

/**
 * Simple LRU cache with TTL support
 */
export class StatsCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTTL: number;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 100;
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access time for LRU
    entry.accessedAt = Date.now();
    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict if necessary
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + (ttl || this.defaultTTL),
      accessedAt: now,
    });
  }

  /**
   * Delete a value from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get or set a value using a factory function
   */
  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldest = key;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// ==========================================
// Pre-configured caches for different stats
// ==========================================

// Cache key generators
export const cacheKeys = {
  repoStats: (repoId: string, period: string) => `repo:${repoId}:${period}`,
  commitFrequency: (repoId: string, period: string) =>
    `commits:${repoId}:${period}`,
  contributors: (repoId: string, period: string) =>
    `contributors:${repoId}:${period}`,
  prMetrics: (repoId: string, period: string) => `prs:${repoId}:${period}`,
  issueMetrics: (repoId: string, period: string) =>
    `issues:${repoId}:${period}`,
  wrapped: (userId: string, year: number, month: number) =>
    `wrapped:${userId}:${year}:${month}`,
  teamWrapped: (teamId: string, year: number, month: number) =>
    `team-wrapped:${teamId}:${year}:${month}`,
  userDashboard: (userId: string) => `dashboard:${userId}`,
};

// TTL values (in milliseconds)
export const cacheTTL = {
  repoStats: 5 * 60 * 1000, // 5 minutes
  commitFrequency: 10 * 60 * 1000, // 10 minutes
  contributors: 15 * 60 * 1000, // 15 minutes
  prMetrics: 5 * 60 * 1000, // 5 minutes
  issueMetrics: 5 * 60 * 1000, // 5 minutes
  wrapped: 60 * 60 * 1000, // 1 hour (monthly data changes slowly)
  teamWrapped: 30 * 60 * 1000, // 30 minutes
  userDashboard: 2 * 60 * 1000, // 2 minutes (more real-time)
};

// Singleton cache instances
export const repoStatsCache = new StatsCache({
  maxSize: 200,
  defaultTTL: cacheTTL.repoStats,
});

export const wrappedCache = new StatsCache({
  maxSize: 100,
  defaultTTL: cacheTTL.wrapped,
});

export const dashboardCache = new StatsCache({
  maxSize: 500,
  defaultTTL: cacheTTL.userDashboard,
});

/**
 * Invalidate all caches for a repository
 */
export function invalidateRepoCache(repoId: string): void {
  // Since we can't iterate efficiently, we'll clear the entire cache
  // In production, you'd use Redis with pattern-based deletion
  repoStatsCache.clear();
}

/**
 * Invalidate all caches for a user
 */
export function invalidateUserCache(userId: string): void {
  wrappedCache.clear();
  dashboardCache.clear();
}

/**
 * Prune all caches
 */
export function pruneAllCaches(): { stats: number; wrapped: number; dashboard: number } {
  return {
    stats: repoStatsCache.prune(),
    wrapped: wrappedCache.prune(),
    dashboard: dashboardCache.prune(),
  };
}

// Run periodic cache pruning every 5 minutes
let pruneInterval: NodeJS.Timeout | null = null;

export function startCachePruning(): void {
  if (pruneInterval) return;

  pruneInterval = setInterval(() => {
    pruneAllCaches();
  }, 5 * 60 * 1000);
}

export function stopCachePruning(): void {
  if (pruneInterval) {
    clearInterval(pruneInterval);
    pruneInterval = null;
  }
}
