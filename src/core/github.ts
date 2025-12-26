/**
 * GitHub Integration
 * Provides OAuth Device Flow authentication for GitHub
 * 
 * The device flow is ideal for CLI applications:
 * 1. User runs `wit github login`
 * 2. We display a URL and code
 * 3. User visits the URL in browser and enters the code
 * 4. We poll for the access token
 * 5. Token is stored securely for future use
 */

import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { exists, readFileText, writeFile, mkdirp } from '../utils/fs';

/**
 * GitHub OAuth configuration for wit
 * 
 * This is the official wit OAuth App client ID, registered at:
 * https://github.com/settings/developers
 * 
 * Users can override with WIT_GITHUB_CLIENT_ID environment variable
 * if they want to use their own OAuth App.
 */
const WIT_OFFICIAL_CLIENT_ID = 'Ov23liMqOvVmaVU7515C';

// Allow override via environment variable for custom deployments
const GITHUB_CLIENT_ID = process.env.WIT_GITHUB_CLIENT_ID || WIT_OFFICIAL_CLIENT_ID;

/**
 * GitHub Device Flow response
 */
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/**
 * GitHub Token Response
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

/**
 * GitHub User Info
 */
export interface GitHubUser {
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

/**
 * Stored GitHub credentials
 */
export interface StoredGitHubCredentials {
  access_token: string;
  token_type: string;
  scope: string;
  username?: string;
  name?: string;
  email?: string;
  created_at: number;
}

/**
 * Get the path to the GitHub credentials file
 */
export function getGitHubCredentialsPath(): string {
  const witConfigDir = path.join(os.homedir(), '.wit');
  return path.join(witConfigDir, 'github-credentials.json');
}

/**
 * Load stored GitHub credentials
 */
export function loadGitHubCredentials(): StoredGitHubCredentials | null {
  const credPath = getGitHubCredentialsPath();

  if (!exists(credPath)) {
    return null;
  }

  try {
    const content = readFileText(credPath);
    return JSON.parse(content) as StoredGitHubCredentials;
  } catch {
    return null;
  }
}

/**
 * Save GitHub credentials
 */
export function saveGitHubCredentials(credentials: StoredGitHubCredentials): void {
  const credPath = getGitHubCredentialsPath();
  const dir = path.dirname(credPath);

  if (!exists(dir)) {
    mkdirp(dir);
  }

  writeFile(credPath, JSON.stringify(credentials, null, 2));

  // Set restrictive permissions on Unix-like systems
  if (process.platform !== 'win32') {
    const fs = require('fs');
    fs.chmodSync(credPath, 0o600);
  }
}

/**
 * Delete stored GitHub credentials
 */
export function deleteGitHubCredentials(): boolean {
  const credPath = getGitHubCredentialsPath();

  if (!exists(credPath)) {
    return false;
  }

  const fs = require('fs');
  fs.unlinkSync(credPath);
  return true;
}

/**
 * Make HTTPS request (Promise-based)
 */
function httpsRequest(
  url: string,
  options: https.RequestOptions,
  body?: string
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const reqOptions: https.RequestOptions = {
      ...options,
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, data });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Start the GitHub Device Flow
 * Returns the device code and user code for display
 */
export async function startDeviceFlow(clientId?: string): Promise<DeviceCodeResponse> {
  const effectiveClientId = clientId || GITHUB_CLIENT_ID;

  if (!effectiveClientId) {
    throw new Error(
      'GitHub OAuth client ID not configured.\n\n' +
      'Please use a Personal Access Token instead:\n' +
      '  1. Go to https://github.com/settings/tokens\n' +
      '  2. Click "Generate new token (classic)"\n' +
      '  3. Select scopes: repo, user:email\n' +
      '  4. Copy the token and run: export GITHUB_TOKEN=ghp_your_token'
    );
  }

  const body = new URLSearchParams({
    client_id: effectiveClientId,
    scope: 'repo user:email',
  }).toString();

  const response = await httpsRequest(
    'https://github.com/login/device/code',
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body).toString(),
      },
    },
    body
  );

  if (response.status !== 200) {
    throw new Error(`Failed to start device flow: ${response.data}`);
  }

  return JSON.parse(response.data) as DeviceCodeResponse;
}

/**
 * Poll for the access token
 * This should be called repeatedly until success or expiration
 */
export async function pollForToken(
  deviceCode: string,
  clientId?: string
): Promise<TokenResponse | 'pending' | 'slow_down' | 'expired'> {
  const effectiveClientId = clientId || GITHUB_CLIENT_ID;

  const body = new URLSearchParams({
    client_id: effectiveClientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  }).toString();

  const response = await httpsRequest(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body).toString(),
      },
    },
    body
  );

  if (response.status !== 200) {
    throw new Error(`Failed to poll for token: ${response.data}`);
  }

  const data = JSON.parse(response.data);

  if (data.error) {
    switch (data.error) {
      case 'authorization_pending':
        return 'pending';
      case 'slow_down':
        return 'slow_down';
      case 'expired_token':
        return 'expired';
      case 'access_denied':
        throw new Error('Access denied by user');
      default:
        throw new Error(`OAuth error: ${data.error} - ${data.error_description || ''}`);
    }
  }

  return data as TokenResponse;
}

/**
 * Get the current GitHub user info
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await httpsRequest(
    'https://api.github.com/user',
    {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'wit-vcs/2.0.0',
      },
    }
  );

  if (response.status !== 200) {
    throw new Error(`Failed to get user info: ${response.data}`);
  }

  return JSON.parse(response.data) as GitHubUser;
}

/**
 * Validate an access token by making a simple API call
 */
export async function validateToken(accessToken: string): Promise<boolean> {
  try {
    await getGitHubUser(accessToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a valid GitHub token
 * Returns null if not logged in or token is invalid
 */
export async function getGitHubToken(): Promise<string | null> {
  // First check environment variable
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) {
    return envToken;
  }

  // Check stored credentials
  const stored = loadGitHubCredentials();
  if (stored) {
    // Optionally validate (can be skipped for performance)
    return stored.access_token;
  }

  return null;
}

/**
 * Complete device flow with polling
 * This handles the entire authentication flow
 */
export async function completeDeviceFlow(
  deviceCode: string,
  interval: number,
  expiresIn: number,
  clientId?: string,
  onProgress?: (message: string) => void
): Promise<TokenResponse> {
  const startTime = Date.now();
  const expiresAt = startTime + expiresIn * 1000;
  let pollInterval = interval * 1000;

  while (Date.now() < expiresAt) {
    await sleep(pollInterval);

    const result = await pollForToken(deviceCode, clientId);

    if (result === 'pending') {
      onProgress?.('Waiting for authorization...');
      continue;
    }

    if (result === 'slow_down') {
      pollInterval += 5000; // Add 5 seconds as per spec
      onProgress?.('Slowing down polling...');
      continue;
    }

    if (result === 'expired') {
      throw new Error('Device code expired. Please try again.');
    }

    // Success!
    return result;
  }

  throw new Error('Authorization timed out. Please try again.');
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if we're already logged in to GitHub
 */
export async function isLoggedIn(): Promise<{ loggedIn: boolean; username?: string; source?: string }> {
  // Check environment variable first
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) {
    try {
      const user = await getGitHubUser(envToken);
      return { loggedIn: true, username: user.login, source: 'environment' };
    } catch {
      // Token might be invalid
    }
  }

  // Check stored credentials
  const stored = loadGitHubCredentials();
  if (stored) {
    return { loggedIn: true, username: stored.username, source: 'stored' };
  }

  return { loggedIn: false };
}

/**
 * GitHub Manager class for managing authentication
 */
export class GitHubManager {
  private clientId: string;

  constructor(clientId?: string) {
    this.clientId = clientId || GITHUB_CLIENT_ID;
  }

  /**
   * Check login status
   */
  async status(): Promise<{ loggedIn: boolean; username?: string; source?: string }> {
    return isLoggedIn();
  }

  /**
   * Start the login flow
   */
  async login(): Promise<{ user: GitHubUser; token: TokenResponse }> {
    // Start device flow
    const deviceCode = await startDeviceFlow(this.clientId);

    // Display instructions
    console.log('\n' + '='.repeat(60));
    console.log('GitHub Device Authorization');
    console.log('='.repeat(60));
    console.log('\n  Please visit: ' + '\x1b[36m' + deviceCode.verification_uri + '\x1b[0m');
    console.log('\n  And enter code: ' + '\x1b[1m\x1b[33m' + deviceCode.user_code + '\x1b[0m');
    console.log('\n' + '='.repeat(60));
    console.log('\nWaiting for authorization...\n');

    // Poll for token
    const token = await completeDeviceFlow(
      deviceCode.device_code,
      deviceCode.interval,
      deviceCode.expires_in,
      this.clientId,
      (msg) => console.log('\x1b[2m' + msg + '\x1b[0m')
    );

    // Get user info
    const user = await getGitHubUser(token.access_token);

    // Store credentials
    const credentials: StoredGitHubCredentials = {
      access_token: token.access_token,
      token_type: token.token_type,
      scope: token.scope,
      username: user.login,
      name: user.name || undefined,
      email: user.email || undefined,
      created_at: Date.now(),
    };

    saveGitHubCredentials(credentials);

    return { user, token };
  }

  /**
   * Logout - remove stored credentials
   */
  logout(): boolean {
    return deleteGitHubCredentials();
  }

  /**
   * Get the access token for API calls
   */
  async getToken(): Promise<string | null> {
    return getGitHubToken();
  }
}

/**
 * Get the global GitHub manager instance
 */
let globalGitHubManager: GitHubManager | null = null;

export function getGitHubManager(clientId?: string): GitHubManager {
  if (!globalGitHubManager) {
    globalGitHubManager = new GitHubManager(clientId);
  }
  return globalGitHubManager;
}
