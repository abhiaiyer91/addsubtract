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
  isDraft?: boolean;
  isMergeable?: boolean;
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
  status?: string;
  authorId: string;
  assigneeId?: string;
  priority?: string;
  dueDate?: string;
  estimate?: number;
  parentId?: string;
  parentNumber?: number;
  projectId?: string;
  projectName?: string;
  cycleId?: string;
  cycleNumber?: number;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueWithAuthor extends Issue {
  author: User;
  labels?: { id: string; name: string; color: string }[];
  subIssueCount?: number;
  subIssueProgress?: number;
  relations?: {
    blocking?: number[];
    blockedBy?: number[];
    related?: number[];
    duplicates?: number[];
    duplicatedBy?: number[];
  };
}

export interface IssueActivity {
  id: string;
  issueId: string;
  issueNumber?: number;
  actorId: string;
  actor?: string;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
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

    /**
     * Transfer a repository to a new owner (user or organization)
     */
    transfer: async (
      owner: string,
      repo: string,
      data: {
        newOwner: string;
        newOwnerType: 'user' | 'organization';
      }
    ): Promise<{
      success: boolean;
      repo: Repository;
      previousOwner: string;
      newOwner: string;
    }> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/transfer`, data);
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
      options?: {
        state?: 'open' | 'closed' | 'all';
        status?: string;
        priority?: string;
        overdue?: boolean;
        dueSoon?: boolean;
        assignee?: string;
        project?: string;
        cycle?: number;
      }
    ): Promise<IssueWithAuthor[]> => {
      const params = new URLSearchParams();
      if (options?.state) params.set('state', options.state);
      if (options?.status) params.set('status', options.status);
      if (options?.priority) params.set('priority', options.priority);
      if (options?.overdue) params.set('overdue', 'true');
      if (options?.dueSoon) params.set('dueSoon', 'true');
      if (options?.assignee) params.set('assignee', options.assignee);
      if (options?.project) params.set('project', options.project);
      if (options?.cycle) params.set('cycle', options.cycle.toString());
      const query = params.toString() ? `?${params.toString()}` : '';
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
      data: {
        title: string;
        body?: string;
        labels?: string[];
        priority?: string;
        dueDate?: string;
        estimate?: number;
        parentNumber?: number;
        project?: string;
        cycle?: number;
      }
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
      data: {
        title?: string;
        body?: string;
        priority?: string;
        dueDate?: string | null;
        estimate?: number | null;
      }
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

    // =========================================================================
    // Priority Operations
    // =========================================================================

    /**
     * Update issue priority
     */
    updatePriority: async (
      owner: string,
      repo: string,
      number: number,
      priority: string
    ): Promise<Issue> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/issues/${number}`, {
        priority,
      });
    },

    // =========================================================================
    // Due Date Operations
    // =========================================================================

    /**
     * Set issue due date
     */
    setDueDate: async (
      owner: string,
      repo: string,
      number: number,
      dueDate: string
    ): Promise<Issue> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/issues/${number}`, {
        dueDate,
      });
    },

    /**
     * Clear issue due date
     */
    clearDueDate: async (owner: string, repo: string, number: number): Promise<Issue> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/issues/${number}`, {
        dueDate: null,
      });
    },

    // =========================================================================
    // Estimate Operations
    // =========================================================================

    /**
     * Set issue estimate
     */
    setEstimate: async (
      owner: string,
      repo: string,
      number: number,
      estimate: number
    ): Promise<Issue> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/issues/${number}`, {
        estimate,
      });
    },

    // =========================================================================
    // Parent/Sub-Issue Operations
    // =========================================================================

    /**
     * Set parent issue
     */
    setParent: async (
      owner: string,
      repo: string,
      number: number,
      parentNumber: number
    ): Promise<Issue> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/issues/${number}/parent`, {
        parentNumber,
      });
    },

    /**
     * Remove parent issue
     */
    removeParent: async (owner: string, repo: string, number: number): Promise<Issue> => {
      return this.request('DELETE', `/api/repos/${owner}/${repo}/issues/${number}/parent`);
    },

    /**
     * Get sub-issues
     */
    getSubIssues: async (
      owner: string,
      repo: string,
      number: number
    ): Promise<IssueWithAuthor[]> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/issues/${number}/sub-issues`);
    },

    // =========================================================================
    // Relation Operations
    // =========================================================================

    /**
     * Add relation between issues
     */
    addRelation: async (
      owner: string,
      repo: string,
      issueNumber: number,
      relatedNumber: number,
      type: 'blocks' | 'relates_to' | 'duplicates'
    ): Promise<{ success: boolean }> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/issues/${issueNumber}/relations`,
        {
          relatedNumber,
          type,
        }
      );
    },

    /**
     * Remove relation between issues
     */
    removeRelation: async (
      owner: string,
      repo: string,
      issueNumber: number,
      relatedNumber: number,
      type: 'blocks' | 'relates_to' | 'duplicates'
    ): Promise<{ success: boolean }> => {
      return this.request(
        'DELETE',
        `/api/repos/${owner}/${repo}/issues/${issueNumber}/relations/${relatedNumber}?type=${type}`
      );
    },

    /**
     * Mark issue as duplicate
     */
    markDuplicate: async (
      owner: string,
      repo: string,
      duplicateNumber: number,
      canonicalNumber: number
    ): Promise<Issue> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/issues/${duplicateNumber}/duplicate`,
        {
          canonicalNumber,
        }
      );
    },

    // =========================================================================
    // Triage Operations
    // =========================================================================

    /**
     * List triage items
     */
    listTriage: async (owner: string, repo: string): Promise<IssueWithAuthor[]> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/issues?status=triage`);
    },

    /**
     * Accept triage item
     */
    acceptTriage: async (
      owner: string,
      repo: string,
      number: number,
      targetStatus?: string,
      priority?: string
    ): Promise<Issue> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/issues/${number}/accept`, {
        targetStatus,
        priority,
      });
    },

    /**
     * Reject triage item
     */
    rejectTriage: async (
      owner: string,
      repo: string,
      number: number,
      reason?: string
    ): Promise<Issue> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/issues/${number}/reject`, {
        reason,
      });
    },

    // =========================================================================
    // Activity Operations
    // =========================================================================

    /**
     * Get issue activity
     */
    getActivity: async (
      owner: string,
      repo: string,
      number: number,
      limit?: number
    ): Promise<IssueActivity[]> => {
      const query = limit ? `?limit=${limit}` : '';
      return this.request(
        'GET',
        `/api/repos/${owner}/${repo}/issues/${number}/activity${query}`
      );
    },

    /**
     * Get repository activity
     */
    getRepoActivity: async (
      owner: string,
      repo: string,
      limit?: number
    ): Promise<IssueActivity[]> => {
      const query = limit ? `?limit=${limit}` : '';
      return this.request('GET', `/api/repos/${owner}/${repo}/issues/activity${query}`);
    },

    // =========================================================================
    // Stage Operations (Custom Workflow)
    // =========================================================================

    /**
     * Update issue stage (using custom workflow)
     */
    updateStage: async (
      owner: string,
      repo: string,
      number: number,
      stageKey: string
    ): Promise<Issue> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/issues/${number}/stage`, {
        stageKey,
      });
    },
  };

  // ============================================================================
  // Stage Operations (Custom Workflow)
  // ============================================================================

  readonly stages = {
    /**
     * List all stages for a repository
     */
    list: async (owner: string, repo: string): Promise<IssueStage[]> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/stages`);
    },

    /**
     * Get a specific stage
     */
    get: async (owner: string, repo: string, key: string): Promise<IssueStage> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/stages/${key}`);
    },

    /**
     * Create a new stage
     */
    create: async (
      owner: string,
      repo: string,
      data: {
        key: string;
        name: string;
        description?: string;
        icon?: string;
        color?: string;
        position?: number;
        isClosedState?: boolean;
        isTriageState?: boolean;
        isDefault?: boolean;
      }
    ): Promise<IssueStage> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/stages`, data);
    },

    /**
     * Update a stage
     */
    update: async (
      owner: string,
      repo: string,
      key: string,
      data: {
        name?: string;
        description?: string;
        icon?: string;
        color?: string;
        position?: number;
        isClosedState?: boolean;
        isTriageState?: boolean;
        isDefault?: boolean;
      }
    ): Promise<IssueStage> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/stages/${key}`, data);
    },

    /**
     * Delete a stage
     */
    delete: async (owner: string, repo: string, key: string): Promise<void> => {
      return this.request('DELETE', `/api/repos/${owner}/${repo}/stages/${key}`);
    },

    /**
     * Reorder stages
     */
    reorder: async (
      owner: string,
      repo: string,
      stageIds: string[]
    ): Promise<IssueStage[]> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/stages/reorder`, { stageIds });
    },

    /**
     * Initialize default stages for a repository
     */
    init: async (owner: string, repo: string): Promise<IssueStage[]> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/stages/init`);
    },
  };

  // ============================================================================
  // Project Operations
  // ============================================================================

  readonly projects = {
    /**
     * List projects for a repository
     */
    list: async (
      owner: string,
      repo: string,
      options?: { status?: string }
    ): Promise<Project[]> => {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/repos/${owner}/${repo}/projects${query}`);
    },

    /**
     * Get a project by name
     */
    get: async (owner: string, repo: string, name: string): Promise<Project> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/projects/${encodeURIComponent(name)}`);
    },

    /**
     * Create a project
     */
    create: async (
      owner: string,
      repo: string,
      data: {
        name: string;
        description?: string;
        leadId?: string;
        startDate?: string;
        targetDate?: string;
      }
    ): Promise<Project> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/projects`, data);
    },

    /**
     * Update a project
     */
    update: async (
      owner: string,
      repo: string,
      name: string,
      data: {
        name?: string;
        description?: string;
        status?: string;
        leadId?: string;
        startDate?: string;
        targetDate?: string;
      }
    ): Promise<Project> => {
      return this.request(
        'PATCH',
        `/api/repos/${owner}/${repo}/projects/${encodeURIComponent(name)}`,
        data
      );
    },

    /**
     * Delete a project
     */
    delete: async (owner: string, repo: string, name: string): Promise<void> => {
      return this.request(
        'DELETE',
        `/api/repos/${owner}/${repo}/projects/${encodeURIComponent(name)}`
      );
    },

    /**
     * Get project progress
     */
    getProgress: async (
      owner: string,
      repo: string,
      name: string
    ): Promise<{ total: number; completed: number; percentage: number }> => {
      return this.request(
        'GET',
        `/api/repos/${owner}/${repo}/projects/${encodeURIComponent(name)}/progress`
      );
    },

    /**
     * Get project issues
     */
    getIssues: async (
      owner: string,
      repo: string,
      name: string
    ): Promise<IssueWithAuthor[]> => {
      return this.request(
        'GET',
        `/api/repos/${owner}/${repo}/projects/${encodeURIComponent(name)}/issues`
      );
    },

    /**
     * Complete a project
     */
    complete: async (owner: string, repo: string, name: string): Promise<Project> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/projects/${encodeURIComponent(name)}/complete`
      );
    },
  };

  // ============================================================================
  // Cycle Operations
  // ============================================================================

  readonly cycles = {
    /**
     * List cycles for a repository
     */
    list: async (
      owner: string,
      repo: string,
      options?: { filter?: 'past' | 'current' | 'upcoming' }
    ): Promise<Cycle[]> => {
      const params = new URLSearchParams();
      if (options?.filter) params.set('filter', options.filter);
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/repos/${owner}/${repo}/cycles${query}`);
    },

    /**
     * Get current cycle
     */
    getCurrent: async (owner: string, repo: string): Promise<Cycle | null> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/cycles/current`);
    },

    /**
     * Get a cycle by number
     */
    get: async (owner: string, repo: string, number: number): Promise<Cycle> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/cycles/${number}`);
    },

    /**
     * Create a cycle
     */
    create: async (
      owner: string,
      repo: string,
      data: {
        name: string;
        description?: string;
        startDate: string;
        endDate: string;
      }
    ): Promise<Cycle> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/cycles`, data);
    },

    /**
     * Update a cycle
     */
    update: async (
      owner: string,
      repo: string,
      number: number,
      data: {
        name?: string;
        description?: string;
        startDate?: string;
        endDate?: string;
      }
    ): Promise<Cycle> => {
      return this.request('PATCH', `/api/repos/${owner}/${repo}/cycles/${number}`, data);
    },

    /**
     * Delete a cycle
     */
    delete: async (owner: string, repo: string, number: number): Promise<void> => {
      return this.request('DELETE', `/api/repos/${owner}/${repo}/cycles/${number}`);
    },

    /**
     * Get cycle progress
     */
    getProgress: async (
      owner: string,
      repo: string,
      number: number
    ): Promise<{
      total: number;
      completed: number;
      inProgress: number;
      percentage: number;
      totalEstimate: number;
      completedEstimate: number;
    }> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/cycles/${number}/progress`);
    },

    /**
     * Get cycle issues
     */
    getIssues: async (
      owner: string,
      repo: string,
      number: number
    ): Promise<IssueWithAuthor[]> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/cycles/${number}/issues`);
    },

    /**
     * Add issue to cycle
     */
    addIssue: async (
      owner: string,
      repo: string,
      cycleNumber: number,
      issueNumber: number
    ): Promise<{ success: boolean }> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/cycles/${cycleNumber}/issues`, {
        issueNumber,
      });
    },

    /**
     * Remove issue from cycle
     */
    removeIssue: async (
      owner: string,
      repo: string,
      cycleNumber: number,
      issueNumber: number
    ): Promise<{ success: boolean }> => {
      return this.request(
        'DELETE',
        `/api/repos/${owner}/${repo}/cycles/${cycleNumber}/issues/${issueNumber}`
      );
    },

    /**
     * Get velocity metrics
     */
    getVelocity: async (
      owner: string,
      repo: string,
      cycleCount?: number
    ): Promise<{
      averagePoints: number;
      averageIssues: number;
      cycles: { number: number; completedPoints: number; completedIssues: number }[];
    }> => {
      const query = cycleCount ? `?count=${cycleCount}` : '';
      return this.request('GET', `/api/repos/${owner}/${repo}/cycles/velocity${query}`);
    },
  };

  // ============================================================================
  // Dashboard Operations
  // ============================================================================

  readonly dashboard = {
    /**
     * Get complete dashboard data
     */
    getData: async (options?: {
      includeCalendar?: boolean;
      repoLimit?: number;
      activityLimit?: number;
    }): Promise<DashboardData> => {
      const params = new URLSearchParams();
      if (options?.includeCalendar) params.set('includeCalendar', 'true');
      if (options?.repoLimit) params.set('repoLimit', options.repoLimit.toString());
      if (options?.activityLimit) params.set('activityLimit', options.activityLimit.toString());
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/dashboard${query}`);
    },

    /**
     * Get dashboard summary with inbox counts
     */
    getSummary: async (): Promise<DashboardSummary> => {
      return this.request('GET', '/api/dashboard/summary');
    },

    /**
     * Get contribution statistics
     */
    getContributionStats: async (year?: number): Promise<ContributionStats> => {
      const query = year ? `?year=${year}` : '';
      return this.request('GET', `/api/dashboard/contributions${query}`);
    },

    /**
     * Get user's repositories for dashboard
     */
    getRepositories: async (limit?: number): Promise<DashboardRepo[]> => {
      const query = limit ? `?limit=${limit}` : '';
      return this.request('GET', `/api/dashboard/repos${query}`);
    },

    /**
     * Get activity feed
     */
    getActivityFeed: async (limit?: number): Promise<ActivityFeedItem[]> => {
      const query = limit ? `?limit=${limit}` : '';
      return this.request('GET', `/api/dashboard/activity${query}`);
    },

    /**
     * Get PRs awaiting review
     */
    getPrsAwaitingReview: async (options?: {
      limit?: number;
      offset?: number;
    }): Promise<InboxPullRequest[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/dashboard/prs/awaiting-review${query}`);
    },

    /**
     * Get user's open PRs
     */
    getMyOpenPrs: async (options?: {
      limit?: number;
      offset?: number;
    }): Promise<InboxPullRequest[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/dashboard/prs/mine${query}`);
    },

    /**
     * Get assigned issues
     */
    getAssignedIssues: async (options?: {
      limit?: number;
      offset?: number;
    }): Promise<DashboardIssue[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/dashboard/issues/assigned${query}`);
    },
  };

  // ============================================================================
  // Journal Operations (Notion-like docs)
  // ============================================================================

  readonly journal = {
    /**
     * List journal pages for a repository
     */
    list: async (
      owner: string,
      repo: string,
      options?: {
        parentId?: string | null;
        status?: 'draft' | 'published' | 'archived';
      }
    ): Promise<JournalPage[]> => {
      const params = new URLSearchParams();
      if (options?.parentId !== undefined) {
        params.set('parentId', options.parentId ?? 'null');
      }
      if (options?.status) params.set('status', options.status);
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/repos/${owner}/${repo}/journal${query}`);
    },

    /**
     * Get page tree (hierarchical structure)
     */
    tree: async (
      owner: string,
      repo: string,
      options?: { status?: 'draft' | 'published' | 'archived' }
    ): Promise<JournalPageTree[]> => {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request('GET', `/api/repos/${owner}/${repo}/journal/tree${query}`);
    },

    /**
     * Get a page by slug
     */
    get: async (owner: string, repo: string, slug: string): Promise<JournalPageWithAuthor> => {
      return this.request('GET', `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}`);
    },

    /**
     * Create a journal page
     */
    create: async (
      owner: string,
      repo: string,
      data: {
        title: string;
        slug?: string;
        content?: string;
        icon?: string;
        coverImage?: string;
        parentId?: string;
        status?: 'draft' | 'published' | 'archived';
      }
    ): Promise<JournalPage> => {
      return this.request('POST', `/api/repos/${owner}/${repo}/journal`, data);
    },

    /**
     * Update a journal page
     */
    update: async (
      owner: string,
      repo: string,
      slug: string,
      data: {
        title?: string;
        content?: string;
        icon?: string | null;
        coverImage?: string | null;
      }
    ): Promise<JournalPage> => {
      return this.request(
        'PATCH',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}`,
        data
      );
    },

    /**
     * Delete a journal page
     */
    delete: async (owner: string, repo: string, slug: string): Promise<void> => {
      return this.request(
        'DELETE',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}`
      );
    },

    /**
     * Publish a page
     */
    publish: async (owner: string, repo: string, slug: string): Promise<JournalPage> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/publish`
      );
    },

    /**
     * Unpublish a page (back to draft)
     */
    unpublish: async (owner: string, repo: string, slug: string): Promise<JournalPage> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/unpublish`
      );
    },

    /**
     * Archive a page
     */
    archive: async (owner: string, repo: string, slug: string): Promise<JournalPage> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/archive`
      );
    },

    /**
     * Move a page
     */
    move: async (
      owner: string,
      repo: string,
      slug: string,
      data: { newParentId?: string | null; newPosition?: number }
    ): Promise<JournalPage> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/move`,
        data
      );
    },

    /**
     * Search pages
     */
    search: async (
      owner: string,
      repo: string,
      query: string,
      options?: { status?: 'draft' | 'published' | 'archived'; limit?: number }
    ): Promise<JournalPage[]> => {
      const params = new URLSearchParams({ q: query });
      if (options?.status) params.set('status', options.status);
      if (options?.limit) params.set('limit', options.limit.toString());
      return this.request('GET', `/api/repos/${owner}/${repo}/journal/search?${params.toString()}`);
    },

    /**
     * Get page history
     */
    history: async (
      owner: string,
      repo: string,
      slug: string,
      limit?: number
    ): Promise<JournalPageHistoryEntry[]> => {
      const query = limit ? `?limit=${limit}` : '';
      return this.request(
        'GET',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/history${query}`
      );
    },

    /**
     * Restore page to a specific version
     */
    restoreVersion: async (
      owner: string,
      repo: string,
      slug: string,
      version: number
    ): Promise<JournalPage> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/restore`,
        { version }
      );
    },

    /**
     * Get page count
     */
    count: async (
      owner: string,
      repo: string,
      status?: 'draft' | 'published' | 'archived'
    ): Promise<number> => {
      const query = status ? `?status=${status}` : '';
      return this.request('GET', `/api/repos/${owner}/${repo}/journal/count${query}`);
    },

    // =========================================================================
    // Comment Operations
    // =========================================================================

    /**
     * List comments for a page
     */
    listComments: async (
      owner: string,
      repo: string,
      slug: string
    ): Promise<Array<JournalComment & { user: { id: string; name: string; image: string | null } }>> => {
      return this.request(
        'GET',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/comments`
      );
    },

    /**
     * Create a comment
     */
    createComment: async (
      owner: string,
      repo: string,
      slug: string,
      data: { body: string; blockId?: string; replyToId?: string }
    ): Promise<JournalComment> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/comments`,
        data
      );
    },

    /**
     * Delete a comment
     */
    deleteComment: async (
      owner: string,
      repo: string,
      slug: string,
      commentId: string
    ): Promise<void> => {
      return this.request(
        'DELETE',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/comments/${commentId}`
      );
    },

    /**
     * Resolve a comment
     */
    resolveComment: async (
      owner: string,
      repo: string,
      slug: string,
      commentId: string
    ): Promise<JournalComment> => {
      return this.request(
        'POST',
        `/api/repos/${owner}/${repo}/journal/${encodeURIComponent(slug)}/comments/${commentId}/resolve`
      );
    },
  };
}

// ============================================================================
// Additional Types for Projects & Cycles
// ============================================================================

export interface Project {
  id: string;
  repoId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  status: 'backlog' | 'planned' | 'in_progress' | 'paused' | 'completed' | 'canceled';
  leadId?: string;
  startDate?: string;
  targetDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Cycle {
  id: string;
  repoId: string;
  name: string;
  number: number;
  description?: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueStage {
  id: string;
  repoId: string;
  key: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  position: number;
  isClosedState: boolean;
  isTriageState: boolean;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JournalPage {
  id: string;
  repoId: string;
  title: string;
  slug: string;
  content?: string;
  icon?: string;
  coverImage?: string;
  parentId?: string;
  position: number;
  status: 'draft' | 'published' | 'archived';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface JournalPageWithAuthor extends JournalPage {
  author: { id: string; name: string; image: string | null };
}

export interface JournalPageTree extends JournalPage {
  children: JournalPageTree[];
}

export interface JournalComment {
  id: string;
  pageId: string;
  userId: string;
  body: string;
  blockId?: string;
  replyToId?: string;
  isResolved: boolean;
  resolvedAt?: string;
  resolvedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalPageHistoryEntry {
  id: string;
  pageId: string;
  title: string;
  content?: string;
  authorId: string;
  version: number;
  changeDescription?: string;
  createdAt: string;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ContributionStreak {
  current: number;
  longest: number;
  lastContributionDate: string | null;
}

export interface ContributionStats {
  totalCommits: number;
  totalPullRequests: number;
  totalPullRequestsMerged: number;
  totalIssues: number;
  totalIssuesClosed: number;
  totalReviews: number;
  totalComments: number;
  streak: ContributionStreak;
  contributionCalendar: ContributionDay[];
  contributionsByDayOfWeek: number[];
}

export interface InboxCounts {
  prsAwaitingReview: number;
  myOpenPrs: number;
  prsParticipated: number;
  issuesAssigned: number;
  issuesCreated: number;
  issuesParticipated: number;
}

export interface DashboardSummary {
  prsAwaitingReview: number;
  myOpenPrs: number;
  prsParticipated: number;
  issuesAssigned: number;
  issuesCreated: number;
  recentActivity: number;
  activeRepos: number;
  thisWeekContributions: number;
  lastWeekContributions: number;
  contributionTrend: 'up' | 'down' | 'stable';
  inbox: InboxCounts;
}

export interface DashboardRepo {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  description: string | null;
  starsCount: number;
  isPrivate: boolean;
  updatedAt: Date;
  pushedAt: Date | null;
  recentCommits?: number;
  openPrs?: number;
  openIssues?: number;
}

export interface ActivityFeedItem {
  id: string;
  type: string;
  actorId: string;
  actorName?: string;
  actorUsername?: string;
  repoId: string | null;
  repoName?: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface DashboardIssue {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  status?: string;
  priority?: string;
  repoId: string;
  repoName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardData {
  summary: DashboardSummary;
  repos: DashboardRepo[];
  activity: ActivityFeedItem[];
  contributionStats: ContributionStats | null;
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
