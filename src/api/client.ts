/**
 * API Client for wit platform features
 *
 * This client provides access to the wit server API for platform features
 * like pull requests, issues, and repository management.
 *
 * The client can work with:
 * - Remote wit server via HTTP
 * - Environment variables for auth
 * - Stored credentials from `wit github login`
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';
import { loadGitHubCredentials } from '../core/github';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get server URL from config or environment
 */
export function getServerUrl(): string {
  return process.env.WIT_SERVER_URL || 'http://localhost:3000';
}

/**
 * Get authentication token from various sources
 */
export function getAuthToken(): string | undefined {
  // Check environment variables first
  if (process.env.WIT_TOKEN) {
    return process.env.WIT_TOKEN;
  }

  // Check for GitHub token (can be used for wit auth too)
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }

  // Check wit stored credentials
  const witConfigPath = path.join(os.homedir(), '.config', 'wit', 'credentials.json');
  if (fs.existsSync(witConfigPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(witConfigPath, 'utf-8'));
      return creds.token;
    } catch {
      // Ignore parsing errors
    }
  }

  // Check GitHub stored credentials from `wit github login`
  const githubCreds = loadGitHubCredentials();
  if (githubCreds) {
    return githubCreds.access_token;
  }

  return undefined;
}

// ============================================================================
// HTTP Client
// ============================================================================

interface HttpResponse<T = unknown> {
  status: number;
  data: T;
}

/**
 * Make an HTTP request
 */
async function httpRequest<T = unknown>(
  url: string,
  options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<HttpResponse<T>> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const reqOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'wit-cli/2.0.0',
        ...options.headers,
      },
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode || 0, data: parsed as T });
        } catch {
          resolve({ status: res.statusCode || 0, data: data as unknown as T });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// ============================================================================
// API Types
// ============================================================================

export interface User {
  id: string;
  username: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export interface Repository {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerType: 'user' | 'organization';
  isPrivate: boolean;
  defaultBranch: string;
  starsCount: number;
  forksCount: number;
  openIssuesCount: number;
  openPrsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PullRequest {
  id: string;
  number: number;
  repoId: string;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  headSha: string;
  baseSha: string;
  authorId: string;
  isMergeable?: boolean;
  isDraft?: boolean;
  mergedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PullRequestWithAuthor extends PullRequest {
  author: User;
}

export interface Issue {
  id: string;
  number: number;
  repoId: string;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  authorId: string;
  assigneeId?: string;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueWithAuthor extends Issue {
  author: User;
  labels?: { id: string; name: string; color: string }[];
}

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string | null;
}

export interface InboxPullRequest extends PullRequest {
  repo: { id: string; name: string; ownerId: string };
  author: User | null;
  labels: Label[];
  reviewState?: 'pending' | 'approved' | 'changes_requested' | 'commented' | null;
  ciStatus?: 'success' | 'failure' | 'pending' | null;
  reviewRequestedAt?: Date | null;
}

// ============================================================================
// API Client Class
// ============================================================================

export class ApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = (baseUrl || getServerUrl()).replace(/\/$/, '');
    this.token = token || getAuthToken();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await httpRequest<T | { error?: string; message?: string }>(url, {
        method,
        headers: this.getHeaders(),
        body,
      });

      if (response.status >= 400) {
        const errorData = response.data as { error?: string; message?: string };
        throw new ApiError(
          errorData?.error || errorData?.message || `Request failed with status ${response.status}`,
          response.status
        );
      }

      return response.data as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
        throw new ApiError(
          `Cannot connect to wit server at ${this.baseUrl}. Is the server running?`,
          0
        );
      }
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        0
      );
    }
  }

  // ============================================================================
  // Repository Operations
  // ============================================================================

  readonly repos = {
    /**
     * Get a repository by owner and name
     */
    get: async (owner: string, repo: string): Promise<{ repo: Repository; owner: User }> => {
      return this.request('GET', `/api/repos/${owner}/${repo}`);
    },

    /**
     * List repositories for a user
     */
    list: async (owner: string): Promise<Repository[]> => {
      return this.request('GET', `/api/repos/${owner}`);
    },

    /**
     * Create a new repository
     */
    create: async (data: {
      name: string;
      description?: string;
      isPrivate?: boolean;
    }): Promise<Repository> => {
      return this.request('POST', '/api/repos', data);
    },
  };

  // ============================================================================
  // Pull Request Operations
  // ============================================================================

  readonly pulls = {
    /**
     * List pull requests for a repository
     */
    list: async (
      owner: string,
      repo: string,
      options?: { state?: 'open' | 'closed' | 'merged' | 'all' }
    ): Promise<PullRequestWithAuthor[]> => {
      const query = options?.state ? `?state=${options.state}` : '';
      return this.request('GET', `/api/repos/${owner}/${repo}/pulls${query}`);
    },

    /**
     * Get a single pull request
     */
    get: async (
      owner: string,
      repo: string,
      number: number
    ): Promise<PullRequestWithAuthor> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/pulls/${number}`);
    },

    /**
     * Create a pull request
     */
    create: async (
      owner: string,
      repo: string,
      data: {
        title: string;
        body?: string;
        sourceBranch: string;
        targetBranch: string;
        headSha: string;
        baseSha: string;
      }
    ): Promise<PullRequest> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/pulls`, data);
    },

    /**
     * Update a pull request
     */
    update: async (
      owner: string,
      repo: string,
      number: number,
      data: { title?: string; body?: string }
    ): Promise<PullRequest> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/pulls/${number}`, data);
    },

    /**
     * Merge a pull request
     */
    merge: async (
      owner: string,
      repo: string,
      number: number,
      data?: { mergeMethod?: 'merge' | 'squash' | 'rebase' }
    ): Promise<{ sha: string; merged: boolean }> => {
      return this.request('PUT', `/api/repos/${owner}/${repo}/pulls/${number}/merge`, data);
    },

    /**
     * Close a pull request
     */
    close: async (owner: string, repo: string, number: number): Promise<PullRequest> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/pulls/${number}`, {
        state: 'closed',
      });
    },

    /**
     * Reopen a pull request
     */
    reopen: async (owner: string, repo: string, number: number): Promise<PullRequest> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/pulls/${number}`, {
        state: 'open',
      });
    },

    /**
     * Add a comment to a pull request
     */
    addComment: async (
      owner: string,
      repo: string,
      number: number,
      body: string
    ): Promise<{ id: string; body: string }> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/pulls/${number}/comments`, {
        body,
      });
    },
  };

  // ============================================================================
  // Inbox Operations (Graphite-style PR inbox)
  // ============================================================================

  readonly inbox = {
    /**
     * Get inbox summary - counts for each section
     */
    summary: async (): Promise<{
      awaitingReview: number;
      myPrsOpen: number;
      participated: number;
    }> => {
      return this.request('GET', '/api/inbox/summary');
    },

    /**
     * Get PRs awaiting my review
     */
    awaitingReview: async (options?: {
      limit?: number;
      offset?: number;
    }): Promise<InboxPullRequest[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/inbox/awaiting-review${query}`);
    },

    /**
     * Get my open PRs
     */
    myPrs: async (options?: {
      limit?: number;
      offset?: number;
    }): Promise<InboxPullRequest[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/inbox/my-prs${query}`);
    },

    /**
     * Get PRs I've participated in
     */
    participated: async (options?: {
      limit?: number;
      offset?: number;
      state?: 'open' | 'closed' | 'all';
    }): Promise<InboxPullRequest[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());
      if (options?.state) params.set('state', options.state);
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/inbox/participated${query}`);
    },

    /**
     * Request a review on a PR
     */
    requestReview: async (
      prId: string,
      reviewerId: string
    ): Promise<{ success: boolean }> => {
      return this.request('POST', `/api/pulls/${prId}/reviewers`, { reviewerId });
    },

    /**
     * Remove a review request
     */
    removeReviewRequest: async (
      prId: string,
      reviewerId: string
    ): Promise<{ success: boolean }> => {
      return this.request('DELETE', `/api/pulls/${prId}/reviewers/${reviewerId}`);
    },
  };

  // ============================================================================
  // Issue Operations
  // ============================================================================

  readonly issues = {
    /**
     * List issues for a repository
     */
    list: async (
      owner: string,
      repo: string,
      options?: { state?: 'open' | 'closed' | 'all' }
    ): Promise<IssueWithAuthor[]> => {
      const query = options?.state ? `?state=${options.state}` : '';
      return this.request('GET', `/api/repos/${owner}/${repo}/issues${query}`);
    },

    /**
     * Get a single issue
     */
    get: async (owner: string, repo: string, number: number): Promise<IssueWithAuthor> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/issues/${number}`);
    },

    /**
     * Create an issue
     */
    create: async (
      owner: string,
      repo: string,
      data: { title: string; body?: string; labels?: string[] }
    ): Promise<Issue> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/issues`, data);
    },

    /**
     * Update an issue
     */
    update: async (
      owner: string,
      repo: string,
      number: number,
      data: { title?: string; body?: string }
    ): Promise<Issue> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/issues/${number}`, data);
    },

    /**
     * Close an issue
     */
    close: async (owner: string, repo: string, number: number): Promise<Issue> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/issues/${number}`, {
        state: 'closed',
      });
    },

    /**
     * Reopen an issue
     */
    reopen: async (owner: string, repo: string, number: number): Promise<Issue> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/issues/${number}`, {
        state: 'open',
      });
    },

    /**
     * Add a comment to an issue
     */
    addComment: async (
      owner: string,
      repo: string,
      number: number,
      body: string
    ): Promise<{ id: string; body: string }> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/issues/${number}/comments`, {
        body,
      });
    },
  };
}

// ============================================================================
// Error Handling
// ============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================================================
// Singleton Client
// ============================================================================

let _client: ApiClient | null = null;

/**
 * Get a singleton API client instance
 */
export function getApiClient(): ApiClient {
  if (!_client) {
    _client = createApiClient();
  }
  return _client;
}

/**
 * Create a new API client instance
 */
export function createApiClient(baseUrl?: string, token?: string): ApiClient {
  return new ApiClient(baseUrl, token);
}

/**
 * Reset the singleton client (useful for testing)
 */
export function resetApiClient(): void {
  _client = null;
}
