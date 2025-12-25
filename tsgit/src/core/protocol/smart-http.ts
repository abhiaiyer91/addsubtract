import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import {
  RefAdvertisement,
  RefUpdate,
  PushResult,
  RefUpdateResult,
  Credentials,
  FetchOptions,
  PushOptions,
  pktLine,
  pktFlush,
  parsePktLines,
  SideBandChannel,
  NULL_HASH,
} from './types';
import { parseRefAdvertisement, serializeCapabilities } from './refs-discovery';

/**
 * Smart HTTP client for Git protocol operations
 * 
 * Implements the Git Smart HTTP protocol:
 * - GET /info/refs?service=git-upload-pack (fetch discovery)
 * - POST /git-upload-pack (fetch)
 * - GET /info/refs?service=git-receive-pack (push discovery)
 * - POST /git-receive-pack (push)
 */
export class SmartHttpClient {
  private baseUrl: string;
  private credentials?: Credentials;
  private userAgent: string = 'tsgit/2.0';

  constructor(baseUrl: string, credentials?: Credentials) {
    // Normalize URL
    this.baseUrl = baseUrl.replace(/\.git\/?$/, '').replace(/\/$/, '');
    if (!this.baseUrl.endsWith('.git')) {
      this.baseUrl += '.git';
    }
    this.credentials = credentials;
  }

  /**
   * Discover refs from the remote repository
   */
  async discoverRefs(service: 'upload-pack' | 'receive-pack'): Promise<RefAdvertisement> {
    const url = `${this.baseUrl}/info/refs?service=git-${service}`;
    
    const response = await this.httpRequest({
      method: 'GET',
      url,
      headers: {
        'Accept': '*/*',
        'User-Agent': this.userAgent,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to discover refs: ${response.status} ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes(`application/x-git-${service}-advertisement`)) {
      // Might be a dumb HTTP server or error page
      throw new Error(`Unexpected content type: ${contentType}. Server may not support smart HTTP.`);
    }

    return parseRefAdvertisement(response.body, service);
  }

  /**
   * Fetch objects from the remote repository
   */
  async fetchPack(wants: string[], haves: string[], options?: FetchOptions): Promise<Buffer> {
    if (wants.length === 0) {
      throw new Error('No refs to fetch');
    }

    // Build the request body
    const requestBody = this.buildFetchRequest(wants, haves, options);

    const url = `${this.baseUrl}/git-upload-pack`;
    
    const response = await this.httpRequest({
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/x-git-upload-pack-request',
        'Accept': 'application/x-git-upload-pack-result',
        'User-Agent': this.userAgent,
      },
      body: requestBody,
    });

    if (response.status !== 200) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    // Parse the response
    return this.parseFetchResponse(response.body, options);
  }

  /**
   * Push objects to the remote repository
   */
  async pushPack(refs: RefUpdate[], pack: Buffer, options?: PushOptions): Promise<PushResult> {
    if (refs.length === 0) {
      throw new Error('No refs to push');
    }

    // Build the request body
    const requestBody = this.buildPushRequest(refs, pack, options);

    const url = `${this.baseUrl}/git-receive-pack`;
    
    const response = await this.httpRequest({
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/x-git-receive-pack-request',
        'Accept': 'application/x-git-receive-pack-result',
        'User-Agent': this.userAgent,
      },
      body: requestBody,
    });

    if (response.status !== 200) {
      throw new Error(`Push failed: ${response.status} ${response.statusText}`);
    }

    // Parse the response
    return this.parsePushResponse(response.body);
  }

  /**
   * Build fetch request body
   */
  private buildFetchRequest(wants: string[], haves: string[], options?: FetchOptions): Buffer {
    const parts: Buffer[] = [];

    // Capabilities to request
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
    parts.push(pktLine(firstWant));

    // Additional wants
    for (let i = 1; i < wants.length; i++) {
      parts.push(pktLine(`want ${wants[i]}\n`));
    }

    // Shallow/deepen options
    if (options?.depth) {
      parts.push(pktLine(`deepen ${options.depth}\n`));
    }

    // Flush packet to end wants
    parts.push(pktFlush());

    // Haves (objects we already have)
    for (const have of haves) {
      parts.push(pktLine(`have ${have}\n`));
    }

    // Done
    parts.push(pktLine('done\n'));

    return Buffer.concat(parts);
  }

  /**
   * Parse fetch response
   */
  private parseFetchResponse(data: Buffer, options?: FetchOptions): Buffer {
    const { lines } = parsePktLines(data);
    const packParts: Buffer[] = [];
    const progressMessages: string[] = [];
    let inPack = false;

    for (const line of lines) {
      if (line.length === 0) {
        // Flush packet
        continue;
      }

      // Check for NAK/ACK
      const lineStr = line.toString('utf8');
      if (lineStr.startsWith('NAK') || lineStr.startsWith('ACK')) {
        continue;
      }

      // Check for sideband
      if (line.length > 0) {
        const channel = line[0];

        if (channel === SideBandChannel.PACK_DATA) {
          // Pack data
          packParts.push(line.slice(1));
          inPack = true;
        } else if (channel === SideBandChannel.PROGRESS) {
          // Progress message
          const msg = line.slice(1).toString('utf8');
          progressMessages.push(msg);
          if (options?.progress) {
            // Parse progress message
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
          // Error message
          const errorMsg = line.slice(1).toString('utf8');
          throw new Error(`Server error: ${errorMsg}`);
        } else if (!inPack) {
          // Could be pack data without sideband
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
   * Build push request body
   */
  private buildPushRequest(refs: RefUpdate[], pack: Buffer, options?: PushOptions): Buffer {
    const parts: Buffer[] = [];

    // Capabilities
    const caps = [
      'report-status',
      'side-band-64k',
      'ofs-delta',
    ];

    if (options?.atomic) {
      caps.push('atomic');
    }

    if (options?.quiet) {
      caps.push('quiet');
    }

    // First ref update with capabilities
    const firstRef = refs[0];
    const firstLine = `${firstRef.oldHash} ${firstRef.newHash} ${firstRef.name}\0${caps.join(' ')}\n`;
    parts.push(pktLine(firstLine));

    // Additional ref updates
    for (let i = 1; i < refs.length; i++) {
      const ref = refs[i];
      const line = `${ref.oldHash} ${ref.newHash} ${ref.name}\n`;
      parts.push(pktLine(line));
    }

    // Push options (if supported)
    if (options?.pushOptions && options.pushOptions.length > 0) {
      parts.push(pktFlush());
      for (const opt of options.pushOptions) {
        parts.push(pktLine(opt));
      }
    }

    // Flush packet to end commands
    parts.push(pktFlush());

    // Pack data
    parts.push(pack);

    return Buffer.concat(parts);
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

      // Check for sideband
      if (line.length > 1) {
        const channel = line[0];

        if (channel === SideBandChannel.PACK_DATA) {
          // Status data
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
          // Try to parse as status line
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
        // Parse as status line
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

    if (line === 'unpack ok') {
      return null; // Not a ref status
    }

    if (line.startsWith('unpack ')) {
      // Unpack error
      return null;
    }

    return null;
  }

  /**
   * Make an HTTP request
   */
  private async httpRequest(options: {
    method: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    body?: Buffer;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: Buffer;
  }> {
    const url = new URL(options.url);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const headers: Record<string, string> = {
      ...options.headers,
    };

    // Add authentication
    if (this.credentials) {
      if (this.credentials.type === 'basic') {
        const auth = Buffer.from(
          `${this.credentials.username}:${this.credentials.password}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      } else if (this.credentials.type === 'bearer') {
        headers['Authorization'] = `Bearer ${this.credentials.password}`;
      }
    }

    // Add content length for POST
    if (options.body) {
      headers['Content-Length'] = options.body.length.toString();
    }

    const requestOptions: http.RequestOptions = {
      method: options.method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers,
    };

    return new Promise((resolve, reject) => {
      const req = lib.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const headers: Record<string, string> = {};
          
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') {
              headers[key.toLowerCase()] = value;
            } else if (Array.isArray(value)) {
              headers[key.toLowerCase()] = value.join(', ');
            }
          }

          resolve({
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers,
            body,
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * Test if the remote supports smart HTTP
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.discoverRefs('upload-pack');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current credentials
   */
  getCredentials(): Credentials | undefined {
    return this.credentials;
  }

  /**
   * Set credentials
   */
  setCredentials(credentials: Credentials): void {
    this.credentials = credentials;
  }
}

/**
 * Create a ref update for creating a new ref
 */
export function createRefUpdate(refName: string, newHash: string): RefUpdate {
  return {
    name: refName,
    oldHash: NULL_HASH,
    newHash,
  };
}

/**
 * Create a ref update for deleting a ref
 */
export function deleteRefUpdate(refName: string, oldHash: string): RefUpdate {
  return {
    name: refName,
    oldHash,
    newHash: NULL_HASH,
  };
}

/**
 * Create a ref update for updating a ref
 */
export function updateRefUpdate(refName: string, oldHash: string, newHash: string, force?: boolean): RefUpdate {
  return {
    name: refName,
    oldHash,
    newHash,
    force,
  };
}

/**
 * Parse a remote URL to extract host and path info
 */
export function parseRemoteUrl(url: string): {
  protocol: 'https' | 'http' | 'ssh' | 'git';
  host: string;
  port?: number;
  path: string;
  user?: string;
} {
  // SSH format: git@github.com:user/repo.git
  const sshMatch = url.match(/^(?:(\w+)@)?([^:]+):(.+)$/);
  if (sshMatch && !url.includes('://')) {
    return {
      protocol: 'ssh',
      host: sshMatch[2],
      path: sshMatch[3],
      user: sshMatch[1],
    };
  }

  // URL format
  const parsed = new URL(url);
  const protocol = parsed.protocol.replace(':', '') as 'https' | 'http' | 'git';

  return {
    protocol,
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : undefined,
    path: parsed.pathname,
    user: parsed.username || undefined,
  };
}

/**
 * Normalize a repository URL
 */
export function normalizeRepoUrl(url: string): string {
  // Convert SSH to HTTPS for HTTP client
  const parsed = parseRemoteUrl(url);
  
  if (parsed.protocol === 'ssh') {
    // Convert git@github.com:user/repo.git to https://github.com/user/repo.git
    let path = parsed.path;
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    return `https://${parsed.host}${path}`;
  }

  return url;
}
