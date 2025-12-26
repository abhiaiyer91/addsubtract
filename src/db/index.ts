import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

let db: Database | null = null;
let pool: Pool | null = null;

/**
 * Initialize the database connection
 * @param connectionString PostgreSQL connection string or pool config
 * @returns Drizzle database instance
 */
export function initDatabase(connectionString: string | PoolConfig): Database {
  const config =
    typeof connectionString === 'string'
      ? { connectionString }
      : connectionString;

  pool = new Pool(config);
  db = drizzle(pool, { schema });
  return db;
}

/**
 * Get the database instance
 * @throws Error if database is not initialized
 * @returns Drizzle database instance
 */
export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Get the raw PostgreSQL pool
 * @throws Error if pool is not initialized
 * @returns PostgreSQL pool instance
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initDatabase() first.');
  }
  return pool;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}

/**
 * Check if the database is connected
 */
export async function isConnected(): Promise<boolean> {
  if (!pool) {
    return false;
  }
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a health check query
 */
export async function healthCheck(): Promise<{ ok: boolean; latency: number }> {
  if (!pool) {
    return { ok: false, latency: -1 };
  }

  const start = Date.now();
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return { ok: true, latency: Date.now() - start };
  } catch {
    return { ok: false, latency: Date.now() - start };
  }
}

// Re-export schema for convenience
export { schema };
export * from './schema';
