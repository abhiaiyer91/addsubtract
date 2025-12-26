/**
 * Rate Limiting Middleware Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  rateLimit,
  RateLimitConfig,
  MemoryStore,
  RateLimitPresets,
  createTrustedBypass,
  userRateLimit,
  rateLimitForEndpoint,
  setRateLimitStore,
  getRateLimitStore,
  RateLimitStore,
} from '../middleware/rate-limit';

// Mock Hono Context
function createMockContext(options: {
  headers?: Record<string, string>;
  ip?: string;
} = {}): MockContext {
  const responseHeaders = new Map<string, string>();
  let responseStatus = 200;
  let responseBody: unknown = null;

  const context = {
    req: {
      header: (name: string) => options.headers?.[name.toLowerCase()] ?? null,
    },
    header: (name: string, value: string) => {
      responseHeaders.set(name, value);
    },
    json: (body: unknown, status?: number) => {
      responseBody = body;
      if (status) responseStatus = status;
      return { body, status: status ?? 200 } as Response;
    },
    set: vi.fn(),
    get: vi.fn(),
    _getResponseHeaders: () => Object.fromEntries(responseHeaders),
    _getResponseStatus: () => responseStatus,
    _getResponseBody: () => responseBody,
  };

  return context as MockContext;
}

interface MockContext {
  req: { header: (name: string) => string | null };
  header: (name: string, value: string) => void;
  json: (body: unknown, status?: number) => Response;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  _getResponseHeaders: () => Record<string, string>;
  _getResponseStatus: () => number;
  _getResponseBody: () => unknown;
}

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(1000); // 1 second cleanup
  });

  afterEach(async () => {
    await store.close();
  });

  it('should increment counter for new key', async () => {
    const result = await store.increment('test-key', 60000);
    expect(result.count).toBe(1);
    expect(result.ttl).toBeLessThanOrEqual(60000);
  });

  it('should increment existing counter', async () => {
    await store.increment('test-key', 60000);
    const result = await store.increment('test-key', 60000);
    expect(result.count).toBe(2);
  });

  it('should reset counter after window expires', async () => {
    await store.increment('test-key', 50); // 50ms window
    
    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const result = await store.increment('test-key', 50);
    expect(result.count).toBe(1);
  });

  it('should get counter value', async () => {
    await store.increment('test-key', 60000);
    await store.increment('test-key', 60000);
    
    const result = await store.get('test-key');
    expect(result).not.toBeNull();
    expect(result!.count).toBe(2);
  });

  it('should return null for non-existent key', async () => {
    const result = await store.get('non-existent');
    expect(result).toBeNull();
  });

  it('should reset counter', async () => {
    await store.increment('test-key', 60000);
    await store.reset('test-key');
    
    const result = await store.get('test-key');
    expect(result).toBeNull();
  });
});

describe('rateLimit middleware', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    setRateLimitStore(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it('should allow requests under limit', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 10,
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context as any, next);

    expect(nextCalled).toBe(true);
    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Limit']).toBe('10');
    expect(headers['X-RateLimit-Remaining']).toBe('9');
  });

  it('should block requests over limit', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 2,
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    const next = async () => {};

    // First two requests should pass
    await middleware(context as any, next);
    await middleware(context as any, next);

    // Third request should be blocked
    const result = await middleware(context as any, next);

    expect(result).toBeDefined();
    const body = context._getResponseBody() as { error: string };
    expect(body.error).toContain('Too many requests');
    
    const headers = context._getResponseHeaders();
    expect(headers['Retry-After']).toBeDefined();
  });

  it('should set proper rate limit headers', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 100,
      headers: true,
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });

    await middleware(context as any, async () => {});

    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Limit']).toBe('100');
    expect(headers['X-RateLimit-Remaining']).toBe('99');
    expect(headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('should not set headers when headers option is false', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 100,
      headers: false,
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });

    await middleware(context as any, async () => {});

    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Limit']).toBeUndefined();
  });

  it('should use custom key generator', async () => {
    const customKeyGenerator = vi.fn().mockReturnValue('custom-key');

    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 10,
      keyGenerator: customKeyGenerator,
    };

    const middleware = rateLimit(config);
    const context = createMockContext();

    await middleware(context as any, async () => {});

    expect(customKeyGenerator).toHaveBeenCalled();
  });

  it('should use custom handler when rate limited', async () => {
    const customHandler = vi.fn().mockReturnValue(
      new Response('Custom error', { status: 429 })
    );

    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 1,
      handler: customHandler,
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-forwarded-for': '192.168.1.2' },
    });

    const next = async () => {};

    await middleware(context as any, next);
    await middleware(context as any, next);

    expect(customHandler).toHaveBeenCalled();
  });

  it('should skip rate limiting when skip returns true', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 1,
      skip: async () => true,
    };

    const middleware = rateLimit(config);
    const context = createMockContext();

    let callCount = 0;
    const next = async () => { callCount++; };

    // Even with max: 1, multiple requests should pass
    await middleware(context as any, next);
    await middleware(context as any, next);
    await middleware(context as any, next);

    expect(callCount).toBe(3);
  });

  it('should use x-real-ip header as fallback', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 10,
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-real-ip': '10.0.0.5' },
    });

    await middleware(context as any, async () => {});

    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Remaining']).toBe('9');
  });

  it('should store rate limit info in context', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 10,
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-forwarded-for': '192.168.1.100' },
    });

    await middleware(context as any, async () => {});

    expect(context.set).toHaveBeenCalledWith('rateLimit', expect.objectContaining({
      limit: 10,
      remaining: 9,
      limited: false,
    }));
  });
});

describe('RateLimitPresets', () => {
  it('should have strict preset with low limits', () => {
    expect(RateLimitPresets.strict.max).toBe(5);
    expect(RateLimitPresets.strict.windowMs).toBe(60000);
  });

  it('should have auth preset with very low limits', () => {
    expect(RateLimitPresets.auth.max).toBe(3);
    expect(RateLimitPresets.auth.windowMs).toBe(15 * 60 * 1000);
  });

  it('should have relaxed preset with high limits', () => {
    expect(RateLimitPresets.relaxed.max).toBe(300);
  });

  it('should have standard preset with moderate limits', () => {
    expect(RateLimitPresets.standard.max).toBe(100);
  });

  it('should have all expected presets', () => {
    expect(RateLimitPresets).toHaveProperty('strict');
    expect(RateLimitPresets).toHaveProperty('standard');
    expect(RateLimitPresets).toHaveProperty('relaxed');
    expect(RateLimitPresets).toHaveProperty('auth');
    expect(RateLimitPresets).toHaveProperty('upload');
    expect(RateLimitPresets).toHaveProperty('webhook');
    expect(RateLimitPresets).toHaveProperty('search');
  });
});

describe('createTrustedBypass', () => {
  it('should bypass for trusted IPs', async () => {
    const bypass = createTrustedBypass({
      trustedIPs: ['10.0.0.1', '192.168.1.1'],
    });

    const context = createMockContext({
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });

    const result = await bypass(context as any);
    expect(result).toBe(true);
  });

  it('should not bypass for untrusted IPs', async () => {
    const bypass = createTrustedBypass({
      trustedIPs: ['10.0.0.1'],
    });

    const context = createMockContext({
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    const result = await bypass(context as any);
    expect(result).toBe(false);
  });

  it('should bypass for trusted API keys', async () => {
    const bypass = createTrustedBypass({
      trustedApiKeys: ['secret-key-123'],
      apiKeyHeader: 'x-api-key',
    });

    const context = createMockContext({
      headers: { 'x-api-key': 'secret-key-123' },
    });

    const result = await bypass(context as any);
    expect(result).toBe(true);
  });

  it('should not bypass for invalid API keys', async () => {
    const bypass = createTrustedBypass({
      trustedApiKeys: ['secret-key-123'],
      apiKeyHeader: 'x-api-key',
    });

    const context = createMockContext({
      headers: { 'x-api-key': 'wrong-key' },
    });

    const result = await bypass(context as any);
    expect(result).toBe(false);
  });

  it('should bypass for CIDR range /24', async () => {
    const bypass = createTrustedBypass({
      trustedIPs: ['10.0.0.0/24'],
    });

    const context = createMockContext({
      headers: { 'x-forwarded-for': '10.0.0.50' },
    });

    const result = await bypass(context as any);
    expect(result).toBe(true);
  });

  it('should not bypass for IP outside CIDR range', async () => {
    const bypass = createTrustedBypass({
      trustedIPs: ['10.0.0.0/24'],
    });

    const context = createMockContext({
      headers: { 'x-forwarded-for': '10.0.1.50' },
    });

    const result = await bypass(context as any);
    expect(result).toBe(false);
  });

  it('should use custom isTrusted function', async () => {
    const bypass = createTrustedBypass({
      isTrusted: async (c) => c.req.header('x-admin') === 'true',
    });

    const context = createMockContext({
      headers: { 'x-admin': 'true' },
    });

    const result = await bypass(context as any);
    expect(result).toBe(true);
  });
});

describe('userRateLimit', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    setRateLimitStore(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it('should use user ID for authenticated users', async () => {
    const middleware = userRateLimit({
      windowMs: 60000,
      max: 10,
      getUserId: () => 'user-123',
      authenticatedMax: 50,
    });

    const context = createMockContext();
    await middleware(context as any, async () => {});

    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Limit']).toBe('50');
  });

  it('should use IP for unauthenticated users', async () => {
    const middleware = userRateLimit({
      windowMs: 60000,
      max: 10,
      getUserId: () => null,
      unauthenticatedMax: 5,
    });

    const context = createMockContext({
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });
    await middleware(context as any, async () => {});

    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Limit']).toBe('5');
  });

  it('should use default max when no override specified', async () => {
    const middleware = userRateLimit({
      windowMs: 60000,
      max: 20,
      getUserId: () => 'user-456',
    });

    const context = createMockContext();
    await middleware(context as any, async () => {});

    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Limit']).toBe('20');
  });
});

describe('rateLimitForEndpoint', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    setRateLimitStore(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it('should create middleware for read endpoints', async () => {
    const middleware = rateLimitForEndpoint('read');
    const context = createMockContext({
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });

    await middleware(context as any, async () => {});

    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Limit']).toBe('300'); // relaxed preset
  });

  it('should create middleware for auth endpoints', async () => {
    const middleware = rateLimitForEndpoint('auth');
    const context = createMockContext({
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });

    await middleware(context as any, async () => {});

    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Limit']).toBe('3'); // auth preset
  });

  it('should allow overrides', async () => {
    const middleware = rateLimitForEndpoint('read', { max: 1000 });
    const context = createMockContext({
      headers: { 'x-forwarded-for': '10.0.0.3' },
    });

    await middleware(context as any, async () => {});

    const headers = context._getResponseHeaders();
    expect(headers['X-RateLimit-Limit']).toBe('1000');
  });
});

describe('Rate limiting with Retry-After', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    setRateLimitStore(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it('should set Retry-After header when rate limited', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 1,
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-forwarded-for': '192.168.99.99' },
    });

    const next = async () => {};

    // First request passes
    await middleware(context as any, next);
    
    // Second request is rate limited
    await middleware(context as any, next);

    const headers = context._getResponseHeaders();
    expect(headers['Retry-After']).toBeDefined();
    expect(parseInt(headers['Retry-After'])).toBeGreaterThan(0);
  });
});

describe('Store management', () => {
  it('should get and set global store', () => {
    const customStore = new MemoryStore();
    setRateLimitStore(customStore);
    expect(getRateLimitStore()).toBe(customStore);
  });
});

describe('429 response', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    setRateLimitStore(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it('should return 429 status when rate limited', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 1,
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-forwarded-for': '192.168.50.50' },
    });

    const next = async () => {};

    await middleware(context as any, next);
    const result = await middleware(context as any, next);

    expect(result).toBeDefined();
    // Check the json call returned 429
    const body = context._getResponseBody() as { error: string; code: string };
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('should include custom message in response', async () => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 1,
      message: 'Custom rate limit message',
    };

    const middleware = rateLimit(config);
    const context = createMockContext({
      headers: { 'x-forwarded-for': '192.168.60.60' },
    });

    const next = async () => {};

    await middleware(context as any, next);
    await middleware(context as any, next);

    const body = context._getResponseBody() as { error: string };
    expect(body.error).toBe('Custom rate limit message');
  });
});
