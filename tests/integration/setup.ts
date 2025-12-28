/**
 * Integration test setup
 * 
 * This file provides utilities for setting up and tearing down
 * the test environment for integration tests.
 */

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../src/api/trpc/routers';
import { startServer, WitServer } from '../../src/server';
import { initDatabase, closeDatabase, getDb, getPool } from '../../src/db';
import * as fs from 'fs';
import superjson from 'superjson';

const TEST_PORT = 3456;
const TEST_REPOS_DIR = '/tmp/wit-test-repos';
export const API_URL = `http://localhost:${TEST_PORT}`;

let server: WitServer | null = null;

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    [tableName]
  );
  return result.rows[0].exists;
}

/**
 * Ensure the packages schema exists with correct column types
 * This handles databases that were set up with db:push instead of db:migrate
 */
async function ensurePackagesSchema(): Promise<void> {
  const pool = getPool();
  
  // Check if packages table exists with correct schema
  // We need to verify the user_id column is TEXT (not UUID) for better-auth compatibility
  const hasPackages = await tableExists('packages');
  if (hasPackages) {
    // Check if package_maintainers has correct column type
    const result = await pool.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'package_maintainers' AND column_name = 'user_id'
    `);
    if (result.rows.length > 0 && result.rows[0].data_type === 'text') {
      return; // Schema exists with correct types
    }
    // Drop and recreate if wrong types
    console.log('[test-setup] Recreating packages schema with correct types...');
    await pool.query('DROP TABLE IF EXISTS package_maintainers CASCADE');
    await pool.query('DROP TABLE IF EXISTS package_dist_tags CASCADE');
    await pool.query('DROP TABLE IF EXISTS package_versions CASCADE');
    await pool.query('DROP TABLE IF EXISTS packages CASCADE');
  }
  
  console.log('[test-setup] Creating packages schema...');
  
  // Create the package_visibility enum if it doesn't exist
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE "public"."package_visibility" AS ENUM('public', 'private');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  
  // Create packages table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "packages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" text NOT NULL,
      "scope" text,
      "repo_id" uuid NOT NULL REFERENCES "repositories"("id") ON DELETE CASCADE,
      "description" text,
      "visibility" "package_visibility" DEFAULT 'public' NOT NULL,
      "keywords" text,
      "license" text,
      "homepage" text,
      "readme" text,
      "download_count" integer DEFAULT 0 NOT NULL,
      "deprecated" text,
      "publish_on_release" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "packages_scope_name_unique" UNIQUE("scope","name"),
      CONSTRAINT "packages_repo_id_unique" UNIQUE("repo_id")
    )
  `);
  
  // Create package_versions table
  // Note: published_by is TEXT to reference better-auth's user table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "package_versions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "package_id" uuid NOT NULL REFERENCES "packages"("id") ON DELETE CASCADE,
      "version" text NOT NULL,
      "tag_name" text,
      "tarball_url" text NOT NULL,
      "tarball_sha512" text NOT NULL,
      "tarball_size" integer NOT NULL,
      "manifest" text NOT NULL,
      "dependencies" text,
      "dev_dependencies" text,
      "peer_dependencies" text,
      "optional_dependencies" text,
      "engines" text,
      "bin" text,
      "published_by" text NOT NULL REFERENCES "user"("id"),
      "deprecated" text,
      "download_count" integer DEFAULT 0 NOT NULL,
      "published_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "package_versions_package_id_version_unique" UNIQUE("package_id","version")
    )
  `);
  
  // Create package_dist_tags table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "package_dist_tags" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "package_id" uuid NOT NULL REFERENCES "packages"("id") ON DELETE CASCADE,
      "tag" text NOT NULL,
      "version_id" uuid NOT NULL REFERENCES "package_versions"("id") ON DELETE CASCADE,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "package_dist_tags_package_id_tag_unique" UNIQUE("package_id","tag")
    )
  `);
  
  // Create package_maintainers table
  // Note: user_id is TEXT to reference better-auth's user table (not the legacy users table)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "package_maintainers" (
      "package_id" uuid NOT NULL REFERENCES "packages"("id") ON DELETE CASCADE,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "added_at" timestamp with time zone DEFAULT now() NOT NULL,
      "added_by" text REFERENCES "user"("id"),
      CONSTRAINT "package_maintainers_package_id_user_id_pk" PRIMARY KEY("package_id","user_id")
    )
  `);
  
  console.log('[test-setup] Packages schema created successfully');
}

/**
 * Start the test server
 */
export async function startTestServer(): Promise<void> {
  // Set up test database
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://wit:wit@localhost:5432/wit';
  initDatabase(databaseUrl);
  
  // Ensure packages schema exists (handles db:push vs db:migrate scenarios)
  await ensurePackagesSchema();
  
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
