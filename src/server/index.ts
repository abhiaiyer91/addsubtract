import { Hono } from 'hono';
import { serve, ServerType } from '@hono/node-server';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { createGitRoutes } from './routes/git';
import { RepoManager } from './storage/repos';
import { syncReposToDatabase } from './storage/sync';
import { appRouter, createContext } from '../api/trpc';
import * as path from 'path';
import { initDatabase, healthCheck as dbHealthCheck, isConnected as isDbConnected } from '../db';

/**
 * Server configuration options
 */
export interface ServerOptions {
  /** Port to listen on */
  port: number;
  /** Base directory for repositories */
  reposDir: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Hostname to bind to (default: 0.0.0.0) */
  host?: string;
}

/**
 * Server instance
 */
export interface WitServer {
  /** The Hono app instance */
  app: Hono;
  /** The underlying HTTP server */
  server: ServerType;
  /** Repository manager */
  repoManager: RepoManager;
  /** Stop the server */
  stop: () => Promise<void>;
}

/**
 * Create and configure the Hono app
 */
export function createApp(repoManager: RepoManager, options: { verbose?: boolean } = {}): Hono {
  const app = new Hono();

  // Add logger middleware if verbose
  if (options.verbose) {
    app.use('*', logger());
  }

  // Enable CORS for web clients
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }));

  // Health check endpoint
  app.get('/health', async (c) => {
    const dbStatus = await dbHealthCheck();
    
    return c.json({
      status: dbStatus.ok ? 'ok' : 'degraded',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      database: {
        connected: dbStatus.ok,
        latency: dbStatus.latency,
      },
    });
  });

  // List repositories endpoint
  app.get('/repos', (c) => {
    const repos = repoManager.listRepos();
    return c.json({
      count: repos.length,
      repositories: repos.map(r => ({
        owner: r.owner,
        name: r.name,
        url: `/${r.owner}/${r.name}.git`,
      })),
    });
  });

  // Sync repositories to database
  app.post('/sync', async (c) => {
    const results = await syncReposToDatabase(repoManager);
    return c.json({
      message: 'Sync complete',
      results,
      summary: {
        created: results.filter(r => r.action === 'created').length,
        skipped: results.filter(r => r.action === 'skipped').length,
        errors: results.filter(r => r.action === 'error').length,
      },
    });
  });

  // tRPC API routes
  app.use('/trpc/*', trpcServer({
    router: appRouter,
    createContext: (_opts, c) => createContext(c),
  }));

  // Git Smart HTTP routes
  const gitRoutes = createGitRoutes(repoManager);
  app.route('/', gitRoutes);

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    console.error('[server] Error:', err);
    return c.json({ error: err.message }, 500);
  });

  return app;
}

/**
 * Start the Git server
 */
export function startServer(options: ServerOptions): WitServer {
  const { port, reposDir, verbose = false, host = '0.0.0.0' } = options;

  // Initialize database if DATABASE_URL is set
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      initDatabase(databaseUrl);
      console.log('✓ Database connected');
    } catch (error) {
      console.error('✗ Database connection failed:', error instanceof Error ? error.message : error);
      console.warn('⚠ Running without database');
    }
  } else {
    console.warn('⚠ DATABASE_URL not set - running without database');
  }

  // Resolve repos directory
  const absoluteReposDir = path.resolve(reposDir);

  // Create repository manager
  const repoManager = new RepoManager(absoluteReposDir);

  // Create app
  const app = createApp(repoManager, { verbose });

  // Start server
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 wit server is running!                                  ║
║                                                              ║
║   HTTP URL: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}                              ${port.toString().length === 4 ? ' ' : ''}║
║   tRPC API: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/trpc                         ${port.toString().length === 4 ? ' ' : ''}║
║   Repositories: ${absoluteReposDir.slice(0, 40).padEnd(41)}║
║                                                              ║
║   Clone: wit clone http://localhost:${port}/owner/repo.git     ${port.toString().length === 4 ? ' ' : ''}║
║   Push:  wit push origin main                                ║
║                                                              ║
║   Press Ctrl+C to stop                                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

  // List existing repositories
  const repos = repoManager.listRepos();
  if (repos.length > 0) {
    console.log(`Existing repositories:`);
    for (const repo of repos) {
      console.log(`  - ${repo.owner}/${repo.name}`);
    }
    console.log('');
  }

  return {
    app,
    server,
    repoManager,
    stop: async () => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          console.log('[server] Server stopped');
          resolve();
        });
      });
    },
  };
}

/**
 * Export for use as a module
 */
export { RepoManager } from './storage/repos';
export { createGitRoutes } from './routes/git';
export { syncReposToDatabase, syncRepoToDatabase } from './storage/sync';
export { authMiddleware, gitAuthMiddleware, requireAuth } from './middleware/auth';
