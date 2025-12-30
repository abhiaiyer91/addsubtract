import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

let db: Database | null = null;
let pool: Pool | null = null;

/**
 * Default pool configuration for production
 */
const DEFAULT_POOL_CONFIG = {
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  min: parseInt(process.env.DB_POOL_MIN || '5', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000', 10),
  allowExitOnIdle: false,
};

/**
 * Initialize the database connection
 * @param connectionString PostgreSQL connection string or pool config
 * @returns Drizzle database instance
 */
export function initDatabase(connectionString: string | PoolConfig): Database {
  const config =
    typeof connectionString === 'string'
      ? { connectionString, ...DEFAULT_POOL_CONFIG }
      : { ...DEFAULT_POOL_CONFIG, ...connectionString };

  pool = new Pool(config);
  
  // Handle pool errors gracefully
  pool.on('error', (err) => {
    console.error('[db] Pool error:', err.message);
  });
  
  pool.on('connect', () => {
    console.debug('[db] New client connected to pool');
  });
  
  db = drizzle(pool, { schema });
  return db;
}

/**
 * Initialize database with auto-retry for container environments
 * Useful when DB might not be ready immediately (e.g., Railway cold starts)
 */
export async function initDatabaseWithRetry(
  connectionString: string,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<Database> {
  const { 
    maxRetries = 5, 
    retryDelay = 3000,
    onRetry = (attempt, error) => {
      console.warn(`[db] Connection attempt ${attempt} failed: ${error.message}`);
    }
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const database = initDatabase(connectionString);
      
      // Verify connection works
      const { ok } = await healthCheck();
      if (!ok) {
        throw new Error('Health check failed');
      }
      
      console.log(`[db] Connected successfully (attempt ${attempt})`);
      return database;
    } catch (error) {
      lastError = error as Error;
      onRetry(attempt, lastError);
      
      if (attempt < maxRetries) {
        // Close failed pool before retry
        if (pool) {
          await pool.end().catch(() => {});
          pool = null;
          db = null;
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error(`Failed to connect after ${maxRetries} attempts: ${lastError?.message}`);
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

// Workflow run model exports
export {
  // Types
  type UpdateWorkflowRun,
  type UpdateJobRun,
  type UpdateStepRun,
  type WorkflowRunWithJobs,
  type JobRunWithSteps,
  
  // Workflow run operations
  createWorkflowRun,
  findWorkflowRunById,
  findWorkflowRunByIdWithJobs,
  findWorkflowRunsByRepoId,
  findWorkflowRunsByState,
  updateWorkflowRun,
  updateWorkflowRunState,
  deleteWorkflowRun,
  
  // Job run operations
  createJobRun,
  createJobRuns,
  findJobRunById,
  findJobRunByIdWithSteps,
  findJobRunsByWorkflowRunId,
  findJobRunsByWorkflowAndState,
  updateJobRun,
  updateJobRunState,
  appendJobRunLogs,
  deleteJobRun,
  
  // Step run operations
  createStepRun,
  createStepRuns,
  findStepRunById,
  findStepRunsByJobRunId,
  updateStepRun,
  updateStepRunState,
  appendStepRunLogs,
  deleteStepRun,
  
  // Utility functions
  areAllJobsComplete,
  areAllStepsComplete,
  determineWorkflowConclusion,
  determineJobConclusion,
} from './models/workflow-runs';
