import { Hono } from 'hono';
import { serve, ServerType } from '@hono/node-server';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { createGitRoutes } from './routes/git';
import { RepoManager } from './storage/repos';
import * as path from 'path';

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
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
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
