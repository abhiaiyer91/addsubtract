/**
 * Server Entrypoint
 * 
 * Main entry point for running wit as a Git server supporting
 * HTTP (via Hono) and SSH protocols.
 */

// Load environment variables from .env file in the current working directory
import * as dotenv from 'dotenv';
import * as path from 'path';

// Try to load .env from cwd first, then from __dirname (for spawned processes)
dotenv.config(); // Try cwd
dotenv.config({ path: path.join(__dirname, '../../.env') }); // Try project root

import { Hono } from 'hono';
import { serve, ServerType } from '@hono/node-server';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { createGitRoutes } from './routes/git';
import { createIssueRoutes } from './routes/issues';
import { createProjectRoutes } from './routes/projects';
import { createCycleRoutes } from './routes/cycles';
import { createAgentStreamRoutes } from './routes/agent-stream';
import { createPackageRoutes } from './routes/packages';
import { createOAuthRoutes } from './routes/oauth';
import { createSandboxRoutes } from './routes/sandbox-ws';
import { createRepoRoutes } from './routes/repos';
import { RepoManager } from './storage/repos';
import { syncReposToDatabase } from './storage/sync';
import { appRouter, createContext } from '../api/trpc';
import * as fs from 'fs';
import { initDatabase, healthCheck as dbHealthCheck, isConnected as isDbConnected } from '../db';
import { SSHServer, generateHostKey, SSHServerOptions } from './ssh';
import { SSHKeyManager, FileBasedAccessControl } from './ssh/keys';
import { Repository } from '../core/repository';
import { createAuth } from '../lib/auth';
import { registerNotificationHandlers, registerCIHandlers, registerTriageHandlers, registerMergeQueueHandlers, registerMarketingHandlers } from '../events';

/**
 * Server configuration options
 */
export interface ServerOptions {
  /** Port to listen on for HTTP */
  port: number;
  /** Base directory for repositories */
  reposDir: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Hostname to bind to (default: 0.0.0.0) */
  host?: string;
  /** SSH server options */
  ssh?: {
    /** Enable SSH server */
    enabled: boolean;
    /** SSH port (default: 22) */
    port?: number;
    /** SSH host (default: 0.0.0.0) */
    host?: string;
    /** Path to host key files */
    hostKeyPaths?: string[];
    /** Allow anonymous read access */
    allowAnonymousRead?: boolean;
    /** Banner message */
    banner?: string;
  };
  /** Data directory for SSH keys and config */
  dataDir?: string;
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
  /** SSH server (if enabled) */
  sshServer?: SSHServer;
  /** SSH key manager (if SSH enabled) */
  keyManager?: SSHKeyManager;
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
  // In production, set CORS_ORIGINS env var (comma-separated list)
  const corsOrigins = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];
  
  app.use('*', cors({
    origin: corsOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
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
        url: `/${r.owner}/${r.name}.wit`,
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

  // Better Auth routes
  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    const auth = createAuth();
    return auth.handler(c.req.raw);
  });

  // tRPC API routes
  app.use('/trpc/*', trpcServer({
    router: appRouter,
    createContext: (_opts, c) => createContext(c),
  }));

  // REST API routes for repos, issues, projects, cycles
  const repoRoutes = createRepoRoutes();
  const issueRoutes = createIssueRoutes();
  const projectRoutes = createProjectRoutes();
  const cycleRoutes = createCycleRoutes();
  const agentStreamRoutes = createAgentStreamRoutes();
  const oauthRoutes = createOAuthRoutes();
  const sandboxRoutes = createSandboxRoutes();
  
  app.route('/api/repos', repoRoutes);
  app.route('/api/repos', issueRoutes);
  app.route('/api/repos', projectRoutes);
  app.route('/api/repos', cycleRoutes);
  app.route('/api/agent', agentStreamRoutes);
  app.route('/api/sandbox', sandboxRoutes);
  app.route('/oauth', oauthRoutes);

  // Package registry routes (npm-compatible)
  // Base URL is used for generating tarball download URLs
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const packageRoutes = createPackageRoutes(baseUrl);
  app.route('/api/packages', packageRoutes);

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
      
      // Register event handlers for notifications, CI, triage, merge queue, and marketing
      registerNotificationHandlers();
      registerCIHandlers();
      registerTriageHandlers();
      registerMergeQueueHandlers();
      registerMarketingHandlers();
      console.log('✓ Event handlers registered');
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

  // Start HTTP server
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  // Initialize SSH server if enabled
  let sshServer: SSHServer | undefined;
  let keyManager: SSHKeyManager | undefined;

  if (options.ssh?.enabled) {
    startSSHServer(options, absoluteReposDir).then(result => {
      sshServer = result.sshServer;
      keyManager = result.keyManager;
    }).catch(err => {
      console.error('✗ SSH server failed to start:', err.message);
    });
  }

  const sshInfo = options.ssh?.enabled 
    ? `\n║   SSH URL:  ssh://git@${host === '0.0.0.0' ? 'localhost' : host}:${options.ssh?.port || 22}                          ${(options.ssh?.port || 22).toString().length === 2 ? ' ' : ''}║`
    : '';

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 wit server is running!                                  ║
║                                                              ║
║   HTTP URL: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}                              ${port.toString().length === 4 ? ' ' : ''}║
║   tRPC API: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/trpc                         ${port.toString().length === 4 ? ' ' : ''}║${sshInfo}
║   Repositories: ${absoluteReposDir.slice(0, 40).padEnd(41)}║
║                                                              ║
║   Clone: wit clone http://localhost:${port}/owner/repo.wit     ${port.toString().length === 4 ? ' ' : ''}║
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
    sshServer,
    keyManager,
    stop: async () => {
      const promises: Promise<void>[] = [];
      
      promises.push(new Promise<void>((resolve) => {
        server.close(() => {
          console.log('[server] HTTP server stopped');
          resolve();
        });
      }));

      if (sshServer) {
        promises.push(sshServer.stop().then(() => {
          console.log('[server] SSH server stopped');
        }));
      }

      await Promise.all(promises);
    },
  };
}

/**
 * Start the SSH server
 */
async function startSSHServer(
  options: ServerOptions,
  reposDir: string
): Promise<{ sshServer: SSHServer; keyManager: SSHKeyManager }> {
  const sshConfig = options.ssh!;
  
  // Load or generate host keys
  const hostKeys = await loadHostKeys(options);

  // Initialize key manager with file-based storage
  const dataDir = options.dataDir || path.join(reposDir, '.wit-server');
  const keysDir = path.join(dataDir, 'keys');
  const accessConfigDir = path.join(dataDir, 'access');

  fs.mkdirSync(keysDir, { recursive: true });
  fs.mkdirSync(accessConfigDir, { recursive: true });

  const accessControl = new FileBasedAccessControl(accessConfigDir);
  const keyManager = new SSHKeyManager({
    storagePath: keysDir,
    accessControl,
  });

  const sshOptions: SSHServerOptions = {
    hostKeys,
    port: sshConfig.port || 22,
    host: sshConfig.host || options.host || '0.0.0.0',
    repoRoot: reposDir,
    allowAnonymousRead: sshConfig.allowAnonymousRead || false,
    banner: sshConfig.banner,
  };

  const sshServer = new SSHServer(sshOptions, keyManager);

  // Set up event handlers
  sshServer.on('connection', (session) => {
    console.log(`[ssh] Connection from ${session.remoteAddress}`);
  });

  sshServer.on('authenticated', (session) => {
    console.log(`[ssh] Authenticated: ${session.username}`);
  });

  sshServer.on('git-command', (session, command) => {
    console.log(`[ssh] Git ${command.service}: ${command.repoPath} (${session.username})`);
  });

  sshServer.on('error', (error, session) => {
    console.error(`[ssh] Error${session ? ` (${session.username})` : ''}: ${error.message}`);
  });

  await sshServer.start();
  console.log(`✓ SSH server listening on port ${sshConfig.port || 22}`);

  return { sshServer, keyManager };
}

/**
 * Load or generate SSH host keys
 */
async function loadHostKeys(options: ServerOptions): Promise<Buffer[]> {
  const sshConfig = options.ssh!;
  const hostKeys: Buffer[] = [];

  // Try to load from configured paths
  if (sshConfig.hostKeyPaths) {
    for (const keyPath of sshConfig.hostKeyPaths) {
      if (fs.existsSync(keyPath)) {
        hostKeys.push(fs.readFileSync(keyPath));
      }
    }
  }

  // If no keys loaded, check default locations or generate
  if (hostKeys.length === 0) {
    const dataDir = options.dataDir || path.join(options.reposDir, '.wit-server');
    const keyDir = path.join(dataDir, 'ssh');
    
    fs.mkdirSync(keyDir, { recursive: true });

    const rsaKeyPath = path.join(keyDir, 'ssh_host_rsa_key');
    const ed25519KeyPath = path.join(keyDir, 'ssh_host_ed25519_key');

    // Load or generate RSA key
    if (fs.existsSync(rsaKeyPath)) {
      hostKeys.push(fs.readFileSync(rsaKeyPath));
    } else {
      console.log('Generating RSA host key...');
      const rsaKey = await generateHostKey('rsa');
      fs.writeFileSync(rsaKeyPath, rsaKey, { mode: 0o600 });
      hostKeys.push(rsaKey);
    }

    // Load or generate Ed25519 key
    if (fs.existsSync(ed25519KeyPath)) {
      hostKeys.push(fs.readFileSync(ed25519KeyPath));
    } else {
      console.log('Generating Ed25519 host key...');
      const ed25519Key = await generateHostKey('ed25519');
      fs.writeFileSync(ed25519KeyPath, ed25519Key, { mode: 0o600 });
      hostKeys.push(ed25519Key);
    }
  }

  return hostKeys;
}

/**
 * Create a new repository
 */
export function createRepository(reposDir: string, owner: string, name: string): Repository {
  // Normalize name - strip .wit/.git suffix and add .git for internal storage
  let repoName = name;
  if (repoName.endsWith('.wit')) {
    repoName = repoName.slice(0, -4) + '.git';
  } else if (!repoName.endsWith('.git')) {
    repoName = `${repoName}.git`;
  }
  const repoPath = path.join(reposDir, owner, repoName);
  fs.mkdirSync(path.dirname(repoPath), { recursive: true });
  fs.mkdirSync(repoPath, { recursive: true });
  return Repository.init(repoPath);
}

/**
 * Export for use as a module
 */
export { RepoManager } from './storage/repos';
export { createGitRoutes } from './routes/git';
export { syncReposToDatabase, syncRepoToDatabase } from './storage/sync';
export { authMiddleware, gitAuthMiddleware, requireAuth } from './middleware/auth';

// SSH exports
export { SSHServer, SSHKeyManager, generateHostKey } from './ssh';
export * from './ssh/types';
