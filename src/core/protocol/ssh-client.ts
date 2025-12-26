/**
 * SSH Client for Git Protocol Operations
 * 
 * Provides SSH transport for git fetch and push operations.
 * Supports public key authentication and agent forwarding.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import {
  RefAdvertisement,
  RefUpdate,
  PushResult,
  RefUpdateResult,
  FetchOptions,
  PushOptions,
  pktLine,
  pktFlush,
  parsePktLines,
  SideBandChannel,
  NULL_HASH,
} from './types';
import { parseRefAdvertisement, serializeCapabilities } from './refs-discovery';

// Type definitions for ssh2 client
interface SSH2ClientConfig {
  host: string;
  port: number;
  username: string;
  privateKey?: Buffer | string;
  passphrase?: string;
  agent?: string;
  readyTimeout?: number;
  keepaliveInterval?: number;
  keepaliveCountMax?: number;
}

interface SSH2Client extends EventEmitter {
  connect(config: SSH2ClientConfig): void;
  exec(command: string, callback: (err: Error | undefined, channel: SSH2Channel) => void): void;
  end(): void;
}

interface SSH2Channel extends EventEmitter {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  write(data: Buffer | string): boolean;
  end(data?: Buffer | string): void;
  close(): void;
  signal(signal: string): void;
}

// Dynamically import ssh2
let ssh2Client: { Client: new () => SSH2Client } | null = null;

async function loadSSH2Client(): Promise<typeof ssh2Client> {
  if (!ssh2Client) {
    try {
      // Dynamic import to avoid build-time errors
      const moduleName = 'ssh2';
      const ssh2 = await (eval(`import('${moduleName}')`) as Promise<{ Client: new () => SSH2Client }>);
      ssh2Client = { Client: ssh2.Client };
    } catch (e) {
      throw new Error(
        'ssh2 module is required for SSH client functionality. Install it with: npm install ssh2'
      );
    }
  }
  return ssh2Client;
}

/**
 * SSH URL parsing result
 */
export interface ParsedSSHUrl {
  user: string;
  host: string;
  port: number;
  path: string;
}

/**
 * SSH authentication options
 */
export interface SSHAuthOptions {
  /** Path to private key file */
  privateKeyPath?: string;
  /** Private key contents */
  privateKey?: Buffer | string;
  /** Passphrase for encrypted private key */
  passphrase?: string;
  /** Use SSH agent for authentication */
  useAgent?: boolean;
  /** Custom SSH agent socket path */
  agentPath?: string;
}

/**
 * SSH Client for Git operations
 * 
 * Handles SSH connections for git-upload-pack (fetch/clone) and
 * git-receive-pack (push) operations.
 */
export class SSHGitClient {
  private url: ParsedSSHUrl;
  private auth: SSHAuthOptions;
  private userAgent: string = 'wit/2.0';
  private client: SSH2Client | null = null;
  private connectionTimeout: number = 30000;

  constructor(url: string, auth?: SSHAuthOptions) {
    this.url = this.parseSSHUrl(url);
    this.auth = auth || this.getDefaultAuth();
  }

  /**
   * Parse an SSH URL
   */
  private parseSSHUrl(url: string): ParsedSSHUrl {
    // Format: git@github.com:user/repo.git
    // Or: ssh://git@github.com:22/user/repo.git
    
    let user = 'git';
    let host: string;
    let port = 22;
    let repoPath: string;

    if (url.startsWith('ssh://')) {
      const parsed = new URL(url);
      user = parsed.username || 'git';
      host = parsed.hostname;
      port = parseInt(parsed.port, 10) || 22;
      repoPath = parsed.pathname;
    } else {
      // SCP-like format: [user@]host:path
      const match = url.match(/^(?:([^@]+)@)?([^:]+):(.+)$/);
      if (!match) {
        throw new Error(`Invalid SSH URL: ${url}`);
      }
      user = match[1] || 'git';
      host = match[2];
      repoPath = match[3];
    }

    // Normalize path
    if (!repoPath.startsWith('/')) {
      repoPath = '/' + repoPath;
    }
    if (!repoPath.endsWith('.git')) {
      repoPath += '.git';
    }

    return { user, host, port, path: repoPath };
  }

  /**
   * Get default SSH authentication options
   */
  private getDefaultAuth(): SSHAuthOptions {
    const auth: SSHAuthOptions = {};

    // Check for SSH agent
    if (process.env.SSH_AUTH_SOCK) {
      auth.useAgent = true;
      auth.agentPath = process.env.SSH_AUTH_SOCK;
    }

    // Look for default private keys
    const sshDir = path.join(os.homedir(), '.ssh');
    const defaultKeys = ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa'];

    for (const keyName of defaultKeys) {
      const keyPath = path.join(sshDir, keyName);
      if (fs.existsSync(keyPath)) {
        auth.privateKeyPath = keyPath;
        break;
      }
    }

    return auth;
  }

  /**
   * Connect to the SSH server
   */
  private async connect(): Promise<SSH2Client> {
    const ssh2Module = await loadSSH2Client();
    if (!ssh2Module) {
      throw new Error('Failed to load ssh2 module');
    }

    this.client = new ssh2Module.Client();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.client?.end();
        reject(new Error('SSH connection timeout'));
      }, this.connectionTimeout);

      this.client!.on('ready', () => {
        clearTimeout(timeout);
        resolve(this.client!);
      });

      this.client!.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      const config: SSH2ClientConfig = {
        host: this.url.host,
        port: this.url.port,
        username: this.url.user,
        readyTimeout: this.connectionTimeout,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
      };

      // Set up authentication
      if (this.auth.useAgent && this.auth.agentPath) {
        config.agent = this.auth.agentPath;
      }

      if (this.auth.privateKey) {
        config.privateKey = this.auth.privateKey;
        if (this.auth.passphrase) {
          config.passphrase = this.auth.passphrase;
        }
      } else if (this.auth.privateKeyPath) {
        try {
          config.privateKey = fs.readFileSync(this.auth.privateKeyPath);
          if (this.auth.passphrase) {
            config.passphrase = this.auth.passphrase;
          }
        } catch (err) {
          // Key file not readable, continue without it
        }
      }

      this.client!.connect(config);
    });
  }

  /**
   * Disconnect from SSH server
   */
  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }

  /**
   * Execute a git command over SSH
   */
  private async execGitCommand(command: string): Promise<SSH2Channel> {
    const client = this.client || await this.connect();

    return new Promise((resolve, reject) => {
      client.exec(command, (err: Error | undefined, channel: SSH2Channel) => {
        if (err) {
          reject(err);
        } else {
          resolve(channel);
        }
      });
    });
  }

  /**
   * Discover refs from the remote repository
   */
  async discoverRefs(service: 'upload-pack' | 'receive-pack'): Promise<RefAdvertisement> {
    const command = `git-${service} '${this.url.path}'`;
    const channel = await this.execGitCommand(command);

    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      let errorOutput = '';

      channel.stdout.on('data', (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);
      });

      channel.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      channel.on('close', () => {
        if (buffer.length === 0) {
          reject(new Error(`Failed to discover refs: ${errorOutput || 'No response'}`));
          return;
        }

        try {
          const advertisement = parseRefAdvertisement(buffer, service);
          resolve(advertisement);
        } catch (err) {
          reject(err);
        }
      });

      channel.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Fetch objects from the remote repository
   */
  async fetchPack(wants: string[], haves: string[], options?: FetchOptions): Promise<Buffer> {
    if (wants.length === 0) {
      throw new Error('No refs to fetch');
    }

    const command = `git-upload-pack '${this.url.path}'`;
    const channel = await this.execGitCommand(command);

    return new Promise((resolve, reject) => {
      let responseBuffer = Buffer.alloc(0);
      let errorOutput = '';
      let readingRefs = true;

      channel.stdout.on('data', (data: Buffer) => {
        if (readingRefs) {
          // Wait for ref advertisement to finish
          responseBuffer = Buffer.concat([responseBuffer, data]);
          
          // Check if we've received the flush packet
          if (responseBuffer.toString().includes('0000')) {
            readingRefs = false;
            
            // Send wants
            this.sendFetchRequest(channel, wants, haves, options);
          }
        } else {
          responseBuffer = Buffer.concat([responseBuffer, data]);
        }
      });

      channel.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      channel.on('close', () => {
        if (errorOutput && responseBuffer.length === 0) {
          reject(new Error(`Fetch failed: ${errorOutput}`));
          return;
        }

        try {
          const packData = this.extractPackData(responseBuffer, options);
          resolve(packData);
        } catch (err) {
          reject(err);
        }
      });

      channel.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Send fetch request (wants and haves)
   */
  private sendFetchRequest(
    channel: SSH2Channel,
    wants: string[],
    haves: string[],
    options?: FetchOptions
  ): void {
    const caps = [
      'multi_ack_detailed',
      'side-band-64k',
      'thin-pack',
      'ofs-delta',
      'no-progress',
    ];

    if (options?.depth) {
      caps.push('shallow');
    }

    // First want with capabilities
    const firstWant = `want ${wants[0]} ${caps.join(' ')}\n`;
    channel.write(pktLine(firstWant));

    // Additional wants
    for (let i = 1; i < wants.length; i++) {
      channel.write(pktLine(`want ${wants[i]}\n`));
    }

    // Shallow/deepen options
    if (options?.depth) {
      channel.write(pktLine(`deepen ${options.depth}\n`));
    }

    // Flush packet to end wants
    channel.write(pktFlush());

    // Haves (objects we already have)
    for (const have of haves) {
      channel.write(pktLine(`have ${have}\n`));
    }

    // Done
    channel.write(pktLine('done\n'));
  }

  /**
   * Extract pack data from fetch response
   */
  private extractPackData(data: Buffer, options?: FetchOptions): Buffer {
    const { lines } = parsePktLines(data);
    const packParts: Buffer[] = [];
    const progressMessages: string[] = [];
    let inPack = false;

    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }

      const lineStr = line.toString('utf8');
      if (lineStr.startsWith('NAK') || lineStr.startsWith('ACK')) {
        continue;
      }

      if (line.length > 0) {
        const channel = line[0];

        if (channel === SideBandChannel.PACK_DATA) {
          packParts.push(line.slice(1));
          inPack = true;
        } else if (channel === SideBandChannel.PROGRESS) {
          const msg = line.slice(1).toString('utf8');
          progressMessages.push(msg);
          if (options?.progress) {
            const match = msg.match(/(\w+).*?(\d+).*?(\d+)/);
            if (match) {
              options.progress({
                phase: 'receiving',
                current: parseInt(match[2], 10),
                total: parseInt(match[3], 10),
                message: msg,
              });
            }
          }
        } else if (channel === SideBandChannel.ERROR) {
          const errorMsg = line.slice(1).toString('utf8');
          throw new Error(`Server error: ${errorMsg}`);
        } else if (!inPack) {
          packParts.push(line);
        }
      }
    }

    if (packParts.length === 0) {
      throw new Error('No pack data received');
    }

    return Buffer.concat(packParts);
  }

  /**
   * Push objects to the remote repository
   */
  async pushPack(refs: RefUpdate[], pack: Buffer, options?: PushOptions): Promise<PushResult> {
    if (refs.length === 0) {
      throw new Error('No refs to push');
    }

    const command = `git-receive-pack '${this.url.path}'`;
    const channel = await this.execGitCommand(command);

    return new Promise((resolve, reject) => {
      let responseBuffer = Buffer.alloc(0);
      let errorOutput = '';
      let readingRefs = true;

      channel.stdout.on('data', (data: Buffer) => {
        if (readingRefs) {
          responseBuffer = Buffer.concat([responseBuffer, data]);
          
          if (responseBuffer.toString().includes('0000')) {
            readingRefs = false;
            
            // Send push request
            this.sendPushRequest(channel, refs, pack, options);
            responseBuffer = Buffer.alloc(0);
          }
        } else {
          responseBuffer = Buffer.concat([responseBuffer, data]);
        }
      });

      channel.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      channel.on('close', () => {
        if (errorOutput && responseBuffer.length === 0) {
          reject(new Error(`Push failed: ${errorOutput}`));
          return;
        }

        try {
          const result = this.parsePushResponse(responseBuffer);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });

      channel.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Send push request
   */
  private sendPushRequest(
    channel: SSH2Channel,
    refs: RefUpdate[],
    pack: Buffer,
    options?: PushOptions
  ): void {
    const caps = ['report-status', 'side-band-64k', 'ofs-delta'];

    if (options?.atomic) {
      caps.push('atomic');
    }

    if (options?.quiet) {
      caps.push('quiet');
    }

    // First ref update with capabilities
    const firstRef = refs[0];
    const firstLine = `${firstRef.oldHash} ${firstRef.newHash} ${firstRef.name}\0${caps.join(' ')}\n`;
    channel.write(pktLine(firstLine));

    // Additional ref updates
    for (let i = 1; i < refs.length; i++) {
      const ref = refs[i];
      channel.write(pktLine(`${ref.oldHash} ${ref.newHash} ${ref.name}\n`));
    }

    // Push options
    if (options?.pushOptions && options.pushOptions.length > 0) {
      channel.write(pktFlush());
      for (const opt of options.pushOptions) {
        channel.write(pktLine(opt));
      }
    }

    // Flush to end commands
    channel.write(pktFlush());

    // Pack data
    channel.write(pack);
    channel.end();
  }

  /**
   * Parse push response
   */
  private parsePushResponse(data: Buffer): PushResult {
    const { lines } = parsePktLines(data);
    const refResults: RefUpdateResult[] = [];
    const serverMessages: string[] = [];
    let ok = true;

    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }

      if (line.length > 1) {
        const channel = line[0];

        if (channel === SideBandChannel.PACK_DATA) {
          const statusLine = line.slice(1).toString('utf8').trim();
          const result = this.parseRefStatusLine(statusLine);
          if (result) {
            refResults.push(result);
            if (result.status === 'ng') {
              ok = false;
            }
          }
        } else if (channel === SideBandChannel.PROGRESS) {
          serverMessages.push(line.slice(1).toString('utf8'));
        } else if (channel === SideBandChannel.ERROR) {
          const errorMsg = line.slice(1).toString('utf8');
          serverMessages.push(`Error: ${errorMsg}`);
          ok = false;
        } else {
          const statusLine = line.toString('utf8').trim();
          const result = this.parseRefStatusLine(statusLine);
          if (result) {
            refResults.push(result);
            if (result.status === 'ng') {
              ok = false;
            }
          }
        }
      } else {
        const statusLine = line.toString('utf8').trim();
        const result = this.parseRefStatusLine(statusLine);
        if (result) {
          refResults.push(result);
          if (result.status === 'ng') {
            ok = false;
          }
        }
      }
    }

    return { ok, refResults, serverMessages };
  }

  /**
   * Parse a ref status line
   */
  private parseRefStatusLine(line: string): RefUpdateResult | null {
    if (line.startsWith('ok ')) {
      return {
        refName: line.slice(3),
        status: 'ok',
      };
    }

    if (line.startsWith('ng ')) {
      const parts = line.slice(3).split(' ');
      const refName = parts[0];
      const message = parts.slice(1).join(' ');
      return {
        refName,
        status: 'ng',
        message,
      };
    }

    if (line === 'unpack ok' || line.startsWith('unpack ')) {
      return null;
    }

    return null;
  }

  /**
   * Test if the connection works
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      this.disconnect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the parsed URL
   */
  getUrl(): ParsedSSHUrl {
    return { ...this.url };
  }

  /**
   * Set connection timeout
   */
  setConnectionTimeout(timeout: number): void {
    this.connectionTimeout = timeout;
  }
}

/**
 * Parse an SSH URL to extract components
 */
export function parseSSHUrl(url: string): ParsedSSHUrl | null {
  try {
    const client = new SSHGitClient(url);
    return client.getUrl();
  } catch {
    return null;
  }
}

/**
 * Check if a URL is an SSH URL
 */
export function isSSHUrl(url: string): boolean {
  // ssh:// format
  if (url.startsWith('ssh://')) {
    return true;
  }

  // SCP-like format: [user@]host:path
  // Must not start with protocol://
  if (url.includes('://')) {
    return false;
  }

  // Check for host:path pattern (but not Windows drive letters like C:)
  const match = url.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (match) {
    // Make sure it's not a Windows path
    if (match[1].length === 1 && /[a-zA-Z]/.test(match[1])) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Convert an SSH URL to HTTPS
 */
export function sshToHttps(url: string): string {
  const parsed = parseSSHUrl(url);
  if (!parsed) {
    throw new Error(`Invalid SSH URL: ${url}`);
  }

  let httpsPath = parsed.path;
  if (httpsPath.startsWith('/')) {
    httpsPath = httpsPath.slice(1);
  }

  return `https://${parsed.host}/${httpsPath}`;
}

/**
 * Convert an HTTPS URL to SSH
 */
export function httpsToSsh(url: string, user: string = 'git'): string {
  const parsed = new URL(url);
  let repoPath = parsed.pathname;
  
  if (repoPath.startsWith('/')) {
    repoPath = repoPath.slice(1);
  }

  return `${user}@${parsed.host}:${repoPath}`;
}
