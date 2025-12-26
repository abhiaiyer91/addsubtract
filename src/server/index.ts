/**
 * Server Entrypoint
 * 
 * Main entry point for running wit as a Git server supporting
 * both HTTP and SSH protocols.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { SSHServer, generateHostKey, SSHServerOptions } from './ssh';
import { SSHKeyManager, FileBasedAccessControl } from './ssh/keys';
import { Repository } from '../core/repository';

/**
 * Server configuration
 */
export interface ServerConfig {
  /** Repository storage root */
  repoRoot: string;
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
  /** HTTP server options */
  http?: {
    /** Enable HTTP server */
    enabled: boolean;
    /** HTTP port (default: 8080) */
    port?: number;
    /** HTTP host (default: 0.0.0.0) */
    host?: string;
  };
  /** Data directory for configuration and keys */
  dataDir?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ServerConfig = {
  repoRoot: './repositories',
  ssh: {
    enabled: true,
    port: 22,
    host: '0.0.0.0',
  },
  http: {
    enabled: true,
    port: 8080,
    host: '0.0.0.0',
  },
};

/**
 * Git Server
 * 
 * Combined SSH and HTTP server for hosting Git repositories.
 */
export class GitServer {
  private config: ServerConfig;
  private sshServer?: SSHServer;
  private httpServer?: http.Server;
  private keyManager?: SSHKeyManager;
  private running = false;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Ensure directories exist
    fs.mkdirSync(this.config.repoRoot, { recursive: true });
    if (this.config.dataDir) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
    }
  }

  /**
   * Start all enabled servers
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Server is already running');
    }

    const promises: Promise<void>[] = [];

    if (this.config.ssh?.enabled) {
      promises.push(this.startSSHServer());
    }

    if (this.config.http?.enabled) {
      promises.push(this.startHTTPServer());
    }

    await Promise.all(promises);
    this.running = true;

    console.log('Git server started successfully');
  }

  /**
   * Stop all servers
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    const promises: Promise<void>[] = [];

    if (this.sshServer) {
      promises.push(this.sshServer.stop());
    }

    if (this.httpServer) {
      promises.push(new Promise((resolve) => {
        this.httpServer!.close(() => resolve());
      }));
    }

    await Promise.all(promises);
    this.running = false;

    console.log('Git server stopped');
  }

  /**
   * Get the SSH key manager
   */
  getKeyManager(): SSHKeyManager | undefined {
    return this.keyManager;
  }

  /**
   * Get the SSH server
   */
  getSSHServer(): SSHServer | undefined {
    return this.sshServer;
  }

  /**
   * Start SSH server
   */
  private async startSSHServer(): Promise<void> {
    const sshConfig = this.config.ssh!;
    
    // Load or generate host keys
    const hostKeys = await this.loadHostKeys();

    // Initialize key manager with file-based storage
    const keysDir = this.config.dataDir 
      ? path.join(this.config.dataDir, 'keys')
      : path.join(this.config.repoRoot, '.wit-server', 'keys');
    
    const accessConfigDir = this.config.dataDir
      ? path.join(this.config.dataDir, 'access')
      : path.join(this.config.repoRoot, '.wit-server', 'access');

    fs.mkdirSync(keysDir, { recursive: true });
    fs.mkdirSync(accessConfigDir, { recursive: true });

    const accessControl = new FileBasedAccessControl(accessConfigDir);
    this.keyManager = new SSHKeyManager({
      storagePath: keysDir,
      accessControl,
    });

    const options: SSHServerOptions = {
      hostKeys,
      port: sshConfig.port || 22,
      host: sshConfig.host || '0.0.0.0',
      repoRoot: this.config.repoRoot,
      allowAnonymousRead: sshConfig.allowAnonymousRead || false,
      banner: sshConfig.banner,
    };

    this.sshServer = new SSHServer(options, this.keyManager);

    // Set up event handlers
    this.sshServer.on('connection', (session) => {
      console.log(`SSH connection from ${session.remoteAddress}`);
    });

    this.sshServer.on('authenticated', (session) => {
      console.log(`SSH authenticated: ${session.username}`);
    });

    this.sshServer.on('git-command', (session, command) => {
      console.log(`Git ${command.service}: ${command.repoPath} (${session.username})`);
    });

    this.sshServer.on('error', (error, session) => {
      console.error(`SSH error${session ? ` (${session.username})` : ''}: ${error.message}`);
    });

    await this.sshServer.start();
  }

  /**
   * Start HTTP server
   */
  private async startHTTPServer(): Promise<void> {
    const httpConfig = this.config.http!;

    this.httpServer = http.createServer((req, res) => {
      this.handleHTTPRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.httpServer!.on('error', reject);
      
      this.httpServer!.listen(
        httpConfig.port || 8080,
        httpConfig.host || '0.0.0.0',
        () => {
          console.log(`HTTP server listening on ${httpConfig.host || '0.0.0.0'}:${httpConfig.port || 8080}`);
          resolve();
        }
      );
    });
  }

  /**
   * Handle HTTP requests
   */
  private handleHTTPRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith('/api/')) {
      this.handleAPIRequest(req, res, pathname.slice(5));
      return;
    }

    // Git smart HTTP protocol
    if (pathname.includes('/info/refs') || 
        pathname.endsWith('/git-upload-pack') ||
        pathname.endsWith('/git-receive-pack')) {
      this.handleGitHTTPRequest(req, res, pathname);
      return;
    }

    // Default: not found
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  /**
   * Handle API requests
   */
  private handleAPIRequest(req: http.IncomingMessage, res: http.ServerResponse, path: string): void {
    res.setHeader('Content-Type', 'application/json');

    try {
      switch (path) {
        case 'status':
          res.writeHead(200);
          res.end(JSON.stringify({
            status: 'ok',
            ssh: this.sshServer ? this.sshServer.getStats() : null,
            repos: this.listRepositories(),
          }));
          break;

        case 'keys':
          if (!this.keyManager) {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'SSH server not enabled' }));
            return;
          }

          if (req.method === 'GET') {
            this.keyManager.getAllKeys().then((keys) => {
              res.writeHead(200);
              res.end(JSON.stringify({ keys }));
            });
          } else if (req.method === 'POST') {
            this.handleAddKey(req, res);
          } else if (req.method === 'DELETE') {
            this.handleDeleteKey(req, res);
          }
          break;

        case 'repos':
          res.writeHead(200);
          res.end(JSON.stringify({ repos: this.listRepositories() }));
          break;

        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  /**
   * Handle Git smart HTTP protocol requests
   */
  private handleGitHTTPRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string
  ): void {
    // This is a simplified handler - in production you'd want full Git smart HTTP support
    // For now, we focus on SSH and provide basic HTTP discovery
    
    res.writeHead(501, { 'Content-Type': 'text/plain' });
    res.end('Git smart HTTP not fully implemented. Please use SSH.');
  }

  /**
   * Handle adding a new SSH key
   */
  private async handleAddKey(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readRequestBody(req);
    
    try {
      const { userId, title, publicKey } = JSON.parse(body);

      if (!userId || !title || !publicKey) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing required fields: userId, title, publicKey' }));
        return;
      }

      const key = await this.keyManager!.addKey({
        userId,
        title,
        publicKey,
        keyType: 'ssh-rsa', // Will be updated by addKey
        isActive: true,
      });

      res.writeHead(201);
      res.end(JSON.stringify({ key }));
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  /**
   * Handle deleting an SSH key
   */
  private async handleDeleteKey(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const keyId = url.searchParams.get('id');

    if (!keyId) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing key id' }));
      return;
    }

    const deleted = await this.keyManager!.removeKey(keyId);

    if (deleted) {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Key not found' }));
    }
  }

  /**
   * Load or generate SSH host keys
   */
  private async loadHostKeys(): Promise<Buffer[]> {
    const sshConfig = this.config.ssh!;
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
      const keyDir = this.config.dataDir
        ? path.join(this.config.dataDir, 'ssh')
        : path.join(this.config.repoRoot, '.wit-server', 'ssh');
      
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
   * List repositories
   */
  private listRepositories(): string[] {
    const repos: string[] = [];

    const entries = fs.readdirSync(this.config.repoRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const repoPath = path.join(this.config.repoRoot, entry.name);
        
        // Check if it's a bare repo or has .wit directory
        if (entry.name.endsWith('.git') || 
            fs.existsSync(path.join(repoPath, '.wit')) ||
            fs.existsSync(path.join(repoPath, 'HEAD'))) {
          repos.push(entry.name);
        }
      }
    }

    return repos;
  }

  /**
   * Read request body
   */
  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString());
      });

      req.on('error', reject);
    });
  }
}

/**
 * Create and start a Git server with the given configuration
 */
export async function startServer(config: Partial<ServerConfig> = {}): Promise<GitServer> {
  const server = new GitServer(config);
  await server.start();
  return server;
}

/**
 * Create a new repository
 */
export function createRepository(repoRoot: string, name: string): Repository {
  const repoPath = path.join(repoRoot, name.endsWith('.git') ? name : `${name}.git`);
  fs.mkdirSync(repoPath, { recursive: true });
  return Repository.init(repoPath);
}

// Re-export SSH server components
export { SSHServer, SSHKeyManager, generateHostKey } from './ssh';
export * from './ssh/types';
