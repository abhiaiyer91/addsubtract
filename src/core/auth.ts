import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { exists, readFileText } from '../utils/fs';
import { Credentials } from './protocol/types';
import { loadGitHubCredentials } from './github';

/**
 * Credential source types
 */
export type CredentialSource = 
  | 'environment'
  | 'git-credential-helper'
  | 'netrc'
  | 'interactive'
  | 'cache';

/**
 * Result of credential lookup
 */
export interface CredentialResult {
  credentials: Credentials | null;
  source: CredentialSource;
}

/**
 * Parsed URL for credential matching
 */
export interface ParsedUrl {
  protocol: string;
  host: string;
  port?: number;
  path?: string;
  username?: string;
}

/**
 * Netrc entry
 */
interface NetrcEntry {
  machine: string;
  login: string;
  password: string;
}

/**
 * CredentialManager handles authentication for remote operations
 * 
 * Tries to get credentials from various sources in order:
 * 1. Environment variables: WIT_TOKEN, GIT_TOKEN, GITHUB_TOKEN
 * 2. Git credential helper (if available)
 * 3. .netrc file
 * 4. Interactive prompt (if TTY available)
 */
export class CredentialManager {
  private cache: Map<string, Credentials> = new Map();
  private gitCredentialHelperPath?: string;

  constructor() {
    this.detectGitCredentialHelper();
  }

  /**
   * Get credentials for a URL
   */
  async getCredentials(url: string): Promise<Credentials | null> {
    const result = await this.getCredentialsWithSource(url);
    return result.credentials;
  }

  /**
   * Get credentials with information about the source
   */
  async getCredentialsWithSource(url: string): Promise<CredentialResult> {
    const parsed = this.parseUrl(url);
    const cacheKey = `${parsed.protocol}://${parsed.host}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { credentials: cached, source: 'cache' };
    }

    // Try environment variables
    const envCredentials = this.getFromEnvironment(parsed);
    if (envCredentials) {
      this.cache.set(cacheKey, envCredentials);
      return { credentials: envCredentials, source: 'environment' };
    }

    // Try git credential helper
    const helperCredentials = await this.getFromGitCredentialHelper(parsed);
    if (helperCredentials) {
      this.cache.set(cacheKey, helperCredentials);
      return { credentials: helperCredentials, source: 'git-credential-helper' };
    }

    // Try netrc
    const netrcCredentials = this.getFromNetrc(parsed);
    if (netrcCredentials) {
      this.cache.set(cacheKey, netrcCredentials);
      return { credentials: netrcCredentials, source: 'netrc' };
    }

    // Try interactive prompt
    if (this.isTTY()) {
      const interactiveCredentials = await this.getFromInteractive(parsed);
      if (interactiveCredentials) {
        this.cache.set(cacheKey, interactiveCredentials);
        return { credentials: interactiveCredentials, source: 'interactive' };
      }
    }

    return { credentials: null, source: 'environment' };
  }

  /**
   * Store credentials (for credential helper integration)
   */
  async storeCredentials(url: string, credentials: Credentials): Promise<void> {
    const parsed = this.parseUrl(url);
    const cacheKey = `${parsed.protocol}://${parsed.host}`;
    
    // Update cache
    this.cache.set(cacheKey, credentials);

    // Try to store in git credential helper
    if (this.gitCredentialHelperPath) {
      await this.storeInGitCredentialHelper(parsed, credentials);
    }
  }

  /**
   * Reject credentials (for credential helper integration)
   */
  async rejectCredentials(url: string): Promise<void> {
    const parsed = this.parseUrl(url);
    const cacheKey = `${parsed.protocol}://${parsed.host}`;
    
    // Remove from cache
    this.cache.delete(cacheKey);

    // Try to reject in git credential helper
    if (this.gitCredentialHelperPath) {
      await this.rejectInGitCredentialHelper(parsed);
    }
  }

  /**
   * Clear cached credentials
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Parse URL for credential matching
   */
  private parseUrl(url: string): ParsedUrl {
    try {
      const parsed = new URL(url);
      return {
        protocol: parsed.protocol.replace(':', ''),
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : undefined,
        path: parsed.pathname,
        username: parsed.username || undefined,
      };
    } catch {
      // Try to parse as SSH-style URL: git@github.com:user/repo.git
      const sshMatch = url.match(/^(?:(\w+)@)?([^:]+):(.+)$/);
      if (sshMatch) {
        return {
          protocol: 'ssh',
          host: sshMatch[2],
          path: sshMatch[3],
          username: sshMatch[1],
        };
      }

      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * Get credentials from environment variables
   */
  private getFromEnvironment(parsed: ParsedUrl): Credentials | null {
    // Check for wit-specific token first
    const witToken = process.env.WIT_TOKEN;
    if (witToken) {
      return {
        username: 'wit',
        password: witToken,
        type: 'bearer',
      };
    }

    // Check for GitHub token (for github.com)
    if (parsed.host === 'github.com' || parsed.host.includes('github')) {
      // First check environment variables
      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      if (githubToken) {
        return {
          username: 'x-access-token',
          password: githubToken,
          type: 'basic',
        };
      }

      // Then check stored GitHub credentials from device flow login
      const storedGitHub = loadGitHubCredentials();
      if (storedGitHub) {
        return {
          username: 'x-access-token',
          password: storedGitHub.access_token,
          type: 'basic',
        };
      }
    }

    // Check for GitLab token
    if (parsed.host === 'gitlab.com' || parsed.host.includes('gitlab')) {
      const gitlabToken = process.env.GITLAB_TOKEN || process.env.GL_TOKEN;
      if (gitlabToken) {
        return {
          username: 'oauth2',
          password: gitlabToken,
          type: 'basic',
        };
      }
    }

    // Check for generic git token
    const gitToken = process.env.GIT_TOKEN;
    if (gitToken) {
      return {
        username: 'git',
        password: gitToken,
        type: 'bearer',
      };
    }

    // Check for username/password environment variables
    const username = process.env.GIT_USERNAME || process.env.WIT_USERNAME;
    const password = process.env.GIT_PASSWORD || process.env.WIT_PASSWORD;
    if (username && password) {
      return {
        username,
        password,
        type: 'basic',
      };
    }

    return null;
  }

  /**
   * Detect git credential helper
   */
  private detectGitCredentialHelper(): void {
    // Common credential helper names
    const helpers = [
      'git-credential-manager',
      'git-credential-manager-core',
      'git-credential-osxkeychain',
      'git-credential-wincred',
      'git-credential-libsecret',
      'git-credential-gnome-keyring',
    ];

    // For now, just check if git is available
    // A more complete implementation would read git config
    this.gitCredentialHelperPath = 'git';
  }

  /**
   * Get credentials from git credential helper
   */
  private async getFromGitCredentialHelper(parsed: ParsedUrl): Promise<Credentials | null> {
    if (!this.gitCredentialHelperPath) {
      return null;
    }

    try {
      const input = [
        `protocol=${parsed.protocol}`,
        `host=${parsed.host}`,
        parsed.path ? `path=${parsed.path}` : '',
        '',
      ].filter(Boolean).join('\n');

      const result = await this.runGitCredential('fill', input);
      if (!result) {
        return null;
      }

      const lines = result.split('\n');
      let username = '';
      let password = '';

      for (const line of lines) {
        if (line.startsWith('username=')) {
          username = line.slice(9);
        } else if (line.startsWith('password=')) {
          password = line.slice(9);
        }
      }

      if (username && password) {
        return {
          username,
          password,
          type: 'basic',
        };
      }
    } catch {
      // Git credential helper not available or failed
    }

    return null;
  }

  /**
   * Store credentials in git credential helper
   */
  private async storeInGitCredentialHelper(parsed: ParsedUrl, credentials: Credentials): Promise<void> {
    if (!this.gitCredentialHelperPath) {
      return;
    }

    try {
      const input = [
        `protocol=${parsed.protocol}`,
        `host=${parsed.host}`,
        `username=${credentials.username}`,
        `password=${credentials.password}`,
        '',
      ].join('\n');

      await this.runGitCredential('store', input);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Reject credentials in git credential helper
   */
  private async rejectInGitCredentialHelper(parsed: ParsedUrl): Promise<void> {
    if (!this.gitCredentialHelperPath) {
      return;
    }

    try {
      const input = [
        `protocol=${parsed.protocol}`,
        `host=${parsed.host}`,
        '',
      ].join('\n');

      await this.runGitCredential('reject', input);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Run git credential command
   */
  private runGitCredential(action: string, input: string): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn('git', ['credential', action], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      // Timeout after 5 seconds
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill();
          resolve(null);
        }
      }, 5000);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(null);
        }
      });

      proc.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          if (code === 0 && stdout) {
            resolve(stdout);
          } else {
            resolve(null);
          }
        }
      });

      proc.stdin.write(input);
      proc.stdin.end();
    });
  }

  /**
   * Get credentials from .netrc file
   */
  private getFromNetrc(parsed: ParsedUrl): Credentials | null {
    const netrcPath = this.getNetrcPath();
    if (!netrcPath || !exists(netrcPath)) {
      return null;
    }

    try {
      const content = readFileText(netrcPath);
      const entries = this.parseNetrc(content);

      // Find matching entry
      const entry = entries.find(e => 
        e.machine === parsed.host || 
        e.machine === 'default'
      );

      if (entry) {
        return {
          username: entry.login,
          password: entry.password,
          type: 'basic',
        };
      }
    } catch {
      // Ignore errors
    }

    return null;
  }

  /**
   * Get path to .netrc file
   */
  private getNetrcPath(): string | null {
    const home = os.homedir();
    
    // Windows uses _netrc
    if (process.platform === 'win32') {
      const winPath = path.join(home, '_netrc');
      if (exists(winPath)) {
        return winPath;
      }
    }

    // Unix uses .netrc
    const unixPath = path.join(home, '.netrc');
    if (exists(unixPath)) {
      return unixPath;
    }

    return null;
  }

  /**
   * Parse .netrc file
   */
  private parseNetrc(content: string): NetrcEntry[] {
    const entries: NetrcEntry[] = [];
    const tokens = content.split(/\s+/).filter(t => t);

    let i = 0;
    while (i < tokens.length) {
      if (tokens[i] === 'machine' || tokens[i] === 'default') {
        const entry: Partial<NetrcEntry> = {};

        if (tokens[i] === 'machine') {
          entry.machine = tokens[++i];
        } else {
          entry.machine = 'default';
        }
        i++;

        // Read attributes
        while (i < tokens.length && tokens[i] !== 'machine' && tokens[i] !== 'default') {
          const key = tokens[i];
          const value = tokens[i + 1];

          if (key === 'login') {
            entry.login = value;
          } else if (key === 'password') {
            entry.password = value;
          }

          i += 2;
        }

        if (entry.machine && entry.login && entry.password) {
          entries.push(entry as NetrcEntry);
        }
      } else {
        i++;
      }
    }

    return entries;
  }

  /**
   * Check if running in a TTY
   */
  private isTTY(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
  }

  /**
   * Get credentials interactively
   */
  private async getFromInteractive(parsed: ParsedUrl): Promise<Credentials | null> {
    if (!this.isTTY()) {
      return null;
    }

    // Use readline for interactive input
    const readline = await import('readline');
    
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log(`\nAuthentication required for ${parsed.host}`);

      rl.question('Username: ', (username) => {
        if (!username) {
          rl.close();
          resolve(null);
          return;
        }

        // For password, we need to hide input
        // This is a simplified version - real implementation would hide input
        rl.question('Password/Token: ', (password) => {
          rl.close();

          if (!password) {
            resolve(null);
            return;
          }

          resolve({
            username,
            password,
            type: 'basic',
          });
        });
      });
    });
  }
}

/**
 * Create a credentials object from username and password
 */
export function createBasicCredentials(username: string, password: string): Credentials {
  return {
    username,
    password,
    type: 'basic',
  };
}

/**
 * Create a credentials object from a bearer token
 */
export function createBearerCredentials(token: string): Credentials {
  return {
    username: 'token',
    password: token,
    type: 'bearer',
  };
}

/**
 * Create credentials for GitHub
 */
export function createGitHubCredentials(token: string): Credentials {
  return {
    username: 'x-access-token',
    password: token,
    type: 'basic',
  };
}

/**
 * Create credentials for GitLab
 */
export function createGitLabCredentials(token: string): Credentials {
  return {
    username: 'oauth2',
    password: token,
    type: 'basic',
  };
}

/**
 * Global credential manager instance
 */
let globalCredentialManager: CredentialManager | null = null;

/**
 * Get the global credential manager
 */
export function getCredentialManager(): CredentialManager {
  if (!globalCredentialManager) {
    globalCredentialManager = new CredentialManager();
  }
  return globalCredentialManager;
}
