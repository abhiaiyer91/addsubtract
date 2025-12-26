import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Database connection configuration
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL not set. Database operations will not work.');
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString,
  max: 10, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Timeout for new connections
});

// Create Drizzle ORM instance with schema
export const db = drizzle(pool, { schema });

// Export pool for direct access if needed
export { pool };

// Export schema for use in other modules
export * from './schema';
