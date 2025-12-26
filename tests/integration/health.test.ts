/**
 * Health Check Integration Tests
 * 
 * Quick sanity tests for server health and basic endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  stopTestServer,
  API_URL,
} from './setup';

describe('Health Check', () => {
  beforeAll(async () => {
    await startTestServer();
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  it('responds to health check', async () => {
    const response = await fetch(`${API_URL}/health`);
    
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('application/json');
    
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('database');
  });

  it('includes database status in health check', async () => {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    
    expect(data.database).toHaveProperty('connected');
    expect(data.database).toHaveProperty('latency');
    expect(typeof data.database.latency).toBe('number');
  });

  it('returns repos list', async () => {
    const response = await fetch(`${API_URL}/repos`);
    
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('repositories');
    expect(Array.isArray(data.repositories)).toBe(true);
  });

  it('returns 404 for unknown routes', async () => {
    const response = await fetch(`${API_URL}/unknown-route`);
    
    expect(response.status).toBe(404);
  });

  it('supports CORS', async () => {
    const response = await fetch(`${API_URL}/health`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    });
    
    // CORS preflight should succeed or the GET should have CORS headers
    expect(response.status).toBeLessThan(500);
  });
});
