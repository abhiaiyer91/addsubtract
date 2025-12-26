/**
 * Integration test setup
 * 
 * This file provides utilities for setting up and tearing down
 * the test environment for integration tests.
 */

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../src/api/trpc/routers';
import { startServer, WitServer } from '../../src/server';
import { initDatabase, closeDatabase, getDb } from '../../src/db';
import * as fs from 'fs';
import * as path from 'path';
import superjson from 'superjson';

const TEST_PORT = 3456;
const TEST_REPOS_DIR = '/tmp/wit-test-repos';
export const API_URL = `http://localhost:${TEST_PORT}`;

let server: WitServer | null = null;

/**
 * Start the test server
 */
export async function startTestServer(): Promise<void> {
  // Set up test database
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://wit:wit@localhost:5432/wit';
  initDatabase(databaseUrl);
  
  // Clean up test repos directory
  if (fs.existsSync(TEST_REPOS_DIR)) {
    fs.rmSync(TEST_REPOS_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_REPOS_DIR, { recursive: true });

  // Start server
  server = startServer({
    port: TEST_PORT,
    reposDir: TEST_REPOS_DIR,
    verbose: false,
    host: 'localhost',
  });

  // Wait for server to be ready
  await waitForServer();
}

/**
 * Stop the test server
 */
export async function stopTestServer(): Promise<void> {
  if (server) {
    await server.stop();
    server = null;
  }
  
  await closeDatabase();

  // Clean up test repos
  if (fs.existsSync(TEST_REPOS_DIR)) {
    fs.rmSync(TEST_REPOS_DIR, { recursive: true, force: true });
  }
}

/**
 * Wait for the server to be ready
 */
async function waitForServer(maxRetries = 30, delayMs = 100): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${API_URL}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error('Server failed to start');
}

/**
 * Create a tRPC client for tests
 */
export function createTestClient(sessionToken?: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        headers: sessionToken
          ? { Authorization: `Bearer ${sessionToken}` }
          : undefined,
        transformer: superjson,
      }),
    ],
  });
}

/**
 * Create an authenticated tRPC client
 */
export function createAuthenticatedClient(sessionToken: string) {
  return createTestClient(sessionToken);
}

/**
 * Clean up test data from the database
 */
export async function cleanupTestData(): Promise<void> {
  const db = getDb();
  
  // Delete in reverse order of dependencies
  // Note: In a real application, you might want to use transactions
  // and cascade deletes, but for tests we'll be explicit
  try {
    // This is a simplified cleanup - in production you'd want proper cascade deletes
    // For now, we'll rely on unique usernames/emails in tests
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
}

/**
 * Generate a unique test username
 * Note: Username must match /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/
 * (alphanumeric with hyphens only, no underscores)
 */
export function uniqueUsername(prefix = 'testuser'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique test email
 */
export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * Generate a unique repo name
 */
export function uniqueRepoName(prefix = 'test-repo'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
