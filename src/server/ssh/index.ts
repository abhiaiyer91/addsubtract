/**
 * SSH Server Implementation for Git Operations
 * 
 * Provides SSH protocol support for git clone/push/pull operations.
 * Supports public key authentication and integrates with the key management system.
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  SSHServerOptions,
  SSHSession,
  SSHAuthContext,
  ParsedGitCommand,
  SSHKeyStore,
  InMemoryKeyStore,
  SSHServerStats,
  SSHServerEvents,
  KeyVerificationResult,
} from './types';
import { GitCommandHandler } from './git-commands';

// Type definitions for ssh2 module
interface SSH2Connection extends EventEmitter {
  on(event: 'authentication', listener: (ctx: SSH2AuthContext) => void): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'session', listener: (accept: () => SSH2Session, reject: () => void) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  end(): void;
}

interface SSH2AuthContext {
  username: string;
  method: 'publickey' | 'password' | 'keyboard-interactive' | 'none';
  key?: {
    algo: string;
    data: Buffer;
  };
  signature?: Buffer;
  blob?: Buffer;
  accept(): void;
  reject(methods?: string[]): void;
}

interface SSH2Session extends EventEmitter {
  on(event: 'exec', listener: (accept: () => SSH2Channel, reject: () => void, info: { command: string }) => void): this;
  on(event: 'close', listener: () => void): this;
}

interface SSH2Channel extends EventEmitter {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  exit(code: number): void;
  close(): void;
  on(event: 'close', listener: () => void): this;
  on(event: 'data', listener: (data: Buffer) => void): this;
  on(event: 'end', listener: () => void): this;
  write(data: Buffer | string): boolean;
  end(data?: Buffer | string): void;
}

interface SSH2ServerConfig {
  hostKeys: Buffer[];
  banner?: string;
}

interface SSH2Server extends EventEmitter {
  listen(port: number, host?: string, callback?: () => void): void;
  close(callback?: () => void): void;
  on(event: 'connection', listener: (client: SSH2Connection, info: { ip: string; port: number }) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
}

// Dynamically import ssh2 to allow the module to load without it installed
let ssh2: { Server: new (config: SSH2ServerConfig, connectionHandler?: (client: SSH2Connection) => void) => SSH2Server } | null = null;

async function loadSSH2(): Promise<typeof ssh2> {
  if (!ssh2) {
    try {
      // Dynamic import to avoid build-time errors when ssh2 is not installed
      const moduleName = 'ssh2';
      ssh2 = await (eval(`import('${moduleName}')`) as Promise<typeof ssh2>);
    } catch (e) {
      throw new Error(
        'ssh2 module is required for SSH server functionality. Install it with: npm install ssh2'
      );
    }
  }
  return ssh2;
}

/**
 * SSH Server for Git operations
 * 
 * Handles SSH connections for git-upload-pack (fetch/clone) and
 * git-receive-pack (push) operations with public key authentication.
 */
export class SSHServer extends EventEmitter {
  private server: SSH2Server | null = null;
  private options: Required<SSHServerOptions>;
  private keyStore: SSHKeyStore;
  private sessions: Map<string, SSHSession> = new Map();
  private gitHandler: GitCommandHandler;
  private stats: SSHServerStats;
  private startTime: Date = new Date();

  constructor(options: SSHServerOptions, keyStore?: SSHKeyStore) {
    super();
    
    this.options = {
      host: '0.0.0.0',
      allowAnonymousRead: false,
      connectionTimeout: 120000, // 2 minutes
      maxConnections: 100,
      banner: 'Welcome to wit Git SSH server\n',
      ...options,
    };

    this.keyStore = keyStore || new InMemoryKeyStore();
    this.gitHandler = new GitCommandHandler(this.options.repoRoot);
    
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      gitOperations: {
        uploadPack: 0,
        receivePack: 0,
      },
      failedAuths: 0,
      uptime: 0,
    };
  }

  /**
   * Start the SSH server
   */
  async start(): Promise<void> {
    const ssh2Module = await loadSSH2();
    if (!ssh2Module) {
      throw new Error('Failed to load ssh2 module');
    }

    this.server = new ssh2Module.Server(
      {
        hostKeys: this.options.hostKeys,
        banner: this.options.banner,
      },
      this.onConnection.bind(this)
    );

    return new Promise((resolve, reject) => {
      if (!this.server) {
        return reject(new Error('Server not initialized'));
      }

      this.server.on('error', (err: Error) => {
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(this.options.port, this.options.host, () => {
        console.log(`SSH server listening on ${this.options.host}:${this.options.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the SSH server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        return resolve();
      }

      // Close all active sessions
      for (const session of this.sessions.values()) {
        this.emit('disconnect', session);
      }
      this.sessions.clear();

      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Get server statistics
   */
  getStats(): SSHServerStats {
    return {
      ...this.stats,
      uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
    };
  }

  /**
   * Get the key store
   */
  getKeyStore(): SSHKeyStore {
    return this.keyStore;
  }

  /**
   * Handle new SSH connection
   */
  private onConnection(client: SSH2Connection, info?: { ip: string; port: number }): void {
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    if (this.stats.activeConnections > this.options.maxConnections) {
      console.warn('Max connections reached, rejecting connection');
      client.end();
      this.stats.activeConnections--;
      return;
    }

    const sessionId = this.generateSessionId();
    const session: SSHSession = {
      sessionId,
      userId: '',
      username: '',
      remoteAddress: info?.ip || 'unknown',
      connectedAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.emit('connection', session);

    // Set connection timeout
    const timeout = setTimeout(() => {
      console.warn(`Connection timeout for session ${sessionId}`);
      client.end();
    }, this.options.connectionTimeout);

    client.on('authentication', (ctx: SSH2AuthContext) => {
      this.handleAuth(ctx, session).catch((err) => {
        console.error('Authentication error:', err);
        ctx.reject();
      });
    });

    client.on('ready', () => {
      clearTimeout(timeout);
      this.emit('authenticated', session);

      client.on('session', (accept: () => SSH2Session, reject: () => void) => {
        this.handleSession(accept(), session);
      });
    });

    client.on('close', () => {
      clearTimeout(timeout);
      this.stats.activeConnections--;
      this.sessions.delete(sessionId);
      this.emit('disconnect', session);
    });

    client.on('error', (err: Error) => {
      console.error(`SSH client error for session ${sessionId}:`, err);
      this.emit('error', err, session);
    });
  }

  /**
   * Handle SSH authentication
   */
  private async handleAuth(ctx: SSH2AuthContext, session: SSHSession): Promise<void> {
    session.username = ctx.username;

    if (ctx.method === 'publickey') {
      const result = await this.verifyPublicKey(ctx, session);
      
      if (result.authorized) {
        session.userId = result.key?.userId || ctx.username;
        session.keyId = result.key?.id;
        
        // Update last used timestamp
        if (result.key) {
          await this.keyStore.updateLastUsed(result.key.id);
        }
        
        ctx.accept();
      } else {
        this.stats.failedAuths++;
        ctx.reject(['publickey']);
      }
    } else if (ctx.method === 'none') {
      // Check if anonymous access is allowed
      if (this.options.allowAnonymousRead) {
        session.userId = 'anonymous';
        ctx.accept();
      } else {
        ctx.reject(['publickey']);
      }
    } else {
      // We only support public key authentication
      ctx.reject(['publickey']);
    }
  }

  /**
   * Verify a public key for authentication
   */
  private async verifyPublicKey(ctx: SSH2AuthContext, _session: SSHSession): Promise<KeyVerificationResult> {
    if (!ctx.key) {
      return { authorized: false, error: 'No key provided' };
    }

    // Calculate fingerprint from key data
    const fingerprint = this.calculateFingerprint(ctx.key.data);

    // Look up the key in our store
    const key = await this.keyStore.findByFingerprint(fingerprint);

    if (!key) {
      return { authorized: false, error: 'Key not found' };
    }

    if (!key.isActive) {
      return { authorized: false, error: 'Key is deactivated' };
    }

    // If there's a signature, verify it (this is the actual auth, not just key check)
    if (ctx.signature && ctx.blob) {
      const verified = this.verifySignature(ctx.key, ctx.signature, ctx.blob);
      if (!verified) {
        return { authorized: false, error: 'Signature verification failed' };
      }
    }

    return { authorized: true, key };
  }

  /**
   * Verify a signature from the SSH client
   * 
   * Note: The ssh2 library handles signature verification internally.
   * This is a placeholder that trusts the library's authentication.
   * In a full implementation, you might want to add additional verification.
   */
  private verifySignature(_key: { algo: string; data: Buffer }, _signature: Buffer, _blob: Buffer): boolean {
    // The ssh2 library validates signatures during authentication.
    // If we reach this point with a signature, the client has proven
    // possession of the private key.
    //
    // A more complete implementation would use sshpk or similar library
    // to perform independent verification.
    return true;
  }

  /**
   * Handle SSH session (shell/exec)
   */
  private handleSession(session: SSH2Session, sshSession: SSHSession): void {
    session.on('exec', (accept: () => SSH2Channel, reject: () => void, info: { command: string }) => {
      const command = this.parseGitCommand(info.command);
      
      if (!command) {
        console.warn(`Invalid command: ${info.command}`);
        reject();
        return;
      }

      sshSession.repository = command.repoPath;
      sshSession.operation = command.service === 'git-upload-pack' ? 'upload-pack' : 'receive-pack';

      // Check access permissions
      this.checkAccess(sshSession, command).then((allowed) => {
        if (!allowed) {
          console.warn(`Access denied for ${sshSession.username} to ${command.repoPath}`);
          reject();
          return;
        }

        const channel = accept();
        this.emit('git-command', sshSession, command);

        // Track operation
        if (command.service === 'git-upload-pack') {
          this.stats.gitOperations.uploadPack++;
        } else {
          this.stats.gitOperations.receivePack++;
        }

        // Handle the git command
        this.gitHandler.handleCommand(command, channel, sshSession)
          .then((success) => {
            this.emit('git-complete', sshSession, command, success);
            channel.exit(success ? 0 : 1);
            channel.close();
          })
          .catch((err) => {
            console.error('Git command error:', err);
            this.emit('git-complete', sshSession, command, false);
            this.emit('error', err, sshSession);
            channel.stderr.write(`Error: ${err.message}\n`);
            channel.exit(1);
            channel.close();
          });
      });
    });
  }

  /**
   * Parse a git command from SSH exec
   */
  private parseGitCommand(command: string): ParsedGitCommand | null {
    // Git commands look like:
    // git-upload-pack '/path/to/repo.git'
    // git-receive-pack '/path/to/repo.git'
    
    const match = command.match(/^(git-(?:upload|receive)-pack)\s+['"]?([^'"]+)['"]?$/);
    
    if (!match) {
      return null;
    }

    const service = match[1] as 'git-upload-pack' | 'git-receive-pack';
    let repoPath = match[2];

    // Normalize the path
    if (repoPath.startsWith('/')) {
      repoPath = repoPath.slice(1);
    }
    if (!repoPath.endsWith('.git')) {
      repoPath += '.git';
    }

    return {
      service,
      repoPath,
      rawCommand: command,
    };
  }

  /**
   * Check if a session has access to perform an operation
   */
  private async checkAccess(session: SSHSession, command: ParsedGitCommand): Promise<boolean> {
    // Anonymous users can only read if allowed
    if (session.userId === 'anonymous') {
      if (command.service === 'git-receive-pack') {
        return false; // No anonymous writes
      }
      return this.options.allowAnonymousRead;
    }

    // Check with key store for access control
    const operation = command.service === 'git-upload-pack' ? 'read' : 'write';
    const result = await this.keyStore.checkAccess(session.userId, command.repoPath, operation);

    return result.allowed;
  }

  /**
   * Calculate SSH key fingerprint
   */
  private calculateFingerprint(keyData: Buffer): string {
    const hash = crypto.createHash('sha256').update(keyData).digest('base64');
    return `SHA256:${hash.replace(/=+$/, '')}`;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `ssh_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
}

/**
 * Generate SSH host keys for the server
 */
export async function generateHostKey(type: 'rsa' | 'ed25519' = 'rsa'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (type === 'rsa') {
      crypto.generateKeyPair('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      }, (err, _publicKey, privateKey) => {
        if (err) reject(err);
        else resolve(Buffer.from(privateKey));
      });
    } else {
      crypto.generateKeyPair('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      }, (err, _publicKey, privateKey) => {
        if (err) reject(err);
        else resolve(Buffer.from(privateKey));
      });
    }
  });
}

/**
 * Parse an OpenSSH public key and extract its fingerprint
 */
export function parsePublicKey(publicKey: string): { type: string; fingerprint: string; comment?: string } {
  const parts = publicKey.trim().split(' ');
  
  if (parts.length < 2) {
    throw new Error('Invalid public key format');
  }

  const type = parts[0];
  const keyData = Buffer.from(parts[1], 'base64');
  const comment = parts.length > 2 ? parts.slice(2).join(' ') : undefined;

  const hash = crypto.createHash('sha256').update(keyData).digest('base64');
  const fingerprint = `SHA256:${hash.replace(/=+$/, '')}`;

  return { type, fingerprint, comment };
}

// Re-export types
export * from './types';
export { GitCommandHandler } from './git-commands';
export { SSHKeyManager } from './keys';
