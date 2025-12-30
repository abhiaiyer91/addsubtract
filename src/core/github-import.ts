/**
 * GitHub Import
 * 
 * Imports repositories from GitHub to wit, including:
 * - Repository (git clone + convert to wit format)
 * - Issues
 * - Pull Requests  
 * - Labels
 * - Milestones
 * - Releases
 * 
 * This module uses the GitHub REST API to fetch metadata and git clone
 * for the repository data.
 */

import * as https from 'https';
import { getGitHubToken } from './github';

/**
 * GitHub API response types
 */
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  clone_url: string;
  ssh_url: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  owner: {
    login: string;
    id: number;
    type: 'User' | 'Organization';
  };
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface GitHubMilestone {
  id: number;
  number: number;
  title: string;
  description: string | null;
  state: 'open' | 'closed';
  due_on: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface GitHubUser {
  login: string;
  id: number;
  type: 'User' | 'Organization' | 'Bot';
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: GitHubUser;
  assignee: GitHubUser | null;
  assignees: GitHubUser[];
  labels: GitHubLabel[];
  milestone: GitHubMilestone | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by: GitHubUser | null;
  pull_request?: {
    url: string;
    html_url: string;
  };
  comments: number;
}

export interface GitHubIssueComment {
  id: number;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  merged_at: string | null;
  merged_by: GitHubUser | null;
  draft: boolean;
  user: GitHubUser;
  head: {
    ref: string;
    sha: string;
    repo: GitHubRepo | null;
  };
  base: {
    ref: string;
    sha: string;
    repo: GitHubRepo;
  };
  labels: GitHubLabel[];
  milestone: GitHubMilestone | null;
  assignees: GitHubUser[];
  requested_reviewers: GitHubUser[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
  review_comments: number;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  author: GitHubUser;
  created_at: string;
  published_at: string | null;
  assets: Array<{
    id: number;
    name: string;
    content_type: string;
    size: number;
    download_count: number;
    browser_download_url: string;
  }>;
}

/**
 * Import options
 */
export interface GitHubImportOptions {
  /** GitHub repository in owner/repo format */
  repo: string;
  /** GitHub access token (optional, uses stored credentials if not provided) */
  token?: string;
  /** What to import */
  import: {
    repository: boolean;
    issues: boolean;
    pullRequests: boolean;
    labels: boolean;
    milestones: boolean;
    releases: boolean;
  };
  /** Progress callback */
  onProgress?: (status: ImportProgress) => void;
}

/**
 * Import progress
 */
export interface ImportProgress {
  phase: 'auth' | 'repo_info' | 'clone' | 'labels' | 'milestones' | 'issues' | 'pull_requests' | 'releases' | 'complete';
  current: number;
  total: number;
  message?: string;
  item?: string;
}

/**
 * Import result
 */
export interface GitHubImportResult {
  repository: {
    imported: boolean;
    name: string;
    cloneUrl: string;
  } | null;
  labels: {
    imported: number;
    items: Array<{ name: string; color: string }>;
  };
  milestones: {
    imported: number;
    items: Array<{ title: string; number: number }>;
  };
  issues: {
    imported: number;
    items: Array<{ number: number; title: string }>;
  };
  pullRequests: {
    imported: number;
    items: Array<{ number: number; title: string }>;
  };
  releases: {
    imported: number;
    items: Array<{ tagName: string; name: string }>;
  };
  errors: string[];
  /** Mapping from GitHub issue/PR number to wit ID */
  idMap: {
    issues: Map<number, string>;
    pullRequests: Map<number, string>;
    milestones: Map<number, string>;
    labels: Map<string, string>;
  };
}

/**
 * GitHub API client
 */
export class GitHubAPIClient {
  private token: string | null;
  private baseUrl = 'api.github.com';

  constructor(token?: string | null) {
    this.token = token ?? null;
  }

  /**
   * Make a request to the GitHub API with retry logic
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: unknown,
    retries = 3
  ): Promise<T> {
    return this.requestWithRetry<T>(method, endpoint, body, retries);
  }

  private async requestWithRetry<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    body: unknown,
    retriesLeft: number
  ): Promise<T> {
    try {
      return await this.doRequest<T>(method, endpoint, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Retry on transient errors
      if (retriesLeft > 0 && (message.includes('temporarily unavailable') || message.includes('timeout'))) {
        console.log(`[GitHub API] Retrying ${endpoint} (${retriesLeft} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        return this.requestWithRetry<T>(method, endpoint, body, retriesLeft - 1);
      }
      throw error;
    }
  }

  private doRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: this.baseUrl,
        port: 443,
        path: endpoint,
        method,
        timeout: 30000, // 30 second timeout
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'wit-vcs/2.0.0',
          ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
      };

      console.log(`[GitHub API] ${method} ${endpoint}`);

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              resolve(data as unknown as T);
            }
          } else if (res.statusCode === 404) {
            reject(new Error(`Repository or resource not found: ${endpoint}`));
          } else if (res.statusCode === 401) {
            reject(new Error('GitHub authentication failed. Please reconnect your GitHub account or use a valid token.'));
          } else if (res.statusCode === 403) {
            // Check if it's rate limiting
            if (data.includes('rate limit')) {
              reject(new Error('GitHub API rate limit exceeded. Please wait a few minutes and try again.'));
            } else {
              reject(new Error('GitHub access denied. Your token may not have the required permissions (repo scope).'));
            }
          } else if (res.statusCode === 502 || res.statusCode === 503 || res.statusCode === 504) {
            reject(new Error('GitHub is temporarily unavailable. Please try again in a few minutes.'));
          } else {
            // Clean up HTML error pages from GitHub
            const cleanError = data.includes('<!DOCTYPE') || data.includes('<html') 
              ? `GitHub returned an error (HTTP ${res.statusCode})` 
              : data.substring(0, 200);
            reject(new Error(`GitHub API error: ${cleanError}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after 30s: ${endpoint}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Get paginated results
   */
  async *paginate<T>(endpoint: string): AsyncGenerator<T[], void, unknown> {
    let page = 1;
    const perPage = 100;

    while (true) {
      const separator = endpoint.includes('?') ? '&' : '?';
      const results = await this.request<T[]>('GET', `${endpoint}${separator}per_page=${perPage}&page=${page}`);
      
      if (results.length === 0) break;
      
      yield results;
      
      if (results.length < perPage) break;
      page++;
    }
  }

  /**
   * Get all results from a paginated endpoint
   */
  async getAll<T>(endpoint: string): Promise<T[]> {
    const results: T[] = [];
    for await (const page of this.paginate<T>(endpoint)) {
      results.push(...page);
    }
    return results;
  }

  /**
   * Get repository info
   */
  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>('GET', `/repos/${owner}/${repo}`);
  }

  /**
   * Get repository labels
   */
  async getLabels(owner: string, repo: string): Promise<GitHubLabel[]> {
    return this.getAll<GitHubLabel>(`/repos/${owner}/${repo}/labels`);
  }

  /**
   * Get repository milestones
   */
  async getMilestones(owner: string, repo: string): Promise<GitHubMilestone[]> {
    // Get both open and closed milestones
    const open = await this.getAll<GitHubMilestone>(`/repos/${owner}/${repo}/milestones?state=open`);
    const closed = await this.getAll<GitHubMilestone>(`/repos/${owner}/${repo}/milestones?state=closed`);
    return [...open, ...closed];
  }

  /**
   * Get repository issues (excludes pull requests)
   */
  async getIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    const all = await this.getAll<GitHubIssue>(`/repos/${owner}/${repo}/issues?state=all`);
    // Filter out pull requests (they have a pull_request property)
    return all.filter(issue => !issue.pull_request);
  }

  /**
   * Get issue comments
   */
  async getIssueComments(owner: string, repo: string, issueNumber: number): Promise<GitHubIssueComment[]> {
    return this.getAll<GitHubIssueComment>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
  }

  /**
   * Get repository pull requests
   */
  async getPullRequests(owner: string, repo: string): Promise<GitHubPullRequest[]> {
    return this.getAll<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls?state=all`);
  }

  /**
   * Get single pull request (with more details)
   */
  async getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>('GET', `/repos/${owner}/${repo}/pulls/${number}`);
  }

  /**
   * Get repository releases
   */
  async getReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
    return this.getAll<GitHubRelease>(`/repos/${owner}/${repo}/releases`);
  }
}

/**
 * Parse a GitHub repo string (owner/repo or URL)
 */
export function parseGitHubRepo(input: string): { owner: string; repo: string } | null {
  // Try to parse as owner/repo
  const simpleMatch = input.match(/^([^/]+)\/([^/]+)$/);
  if (simpleMatch) {
    return { owner: simpleMatch[1], repo: simpleMatch[2].replace(/\.git$/, '') };
  }

  // Try to parse as URL
  const urlPatterns = [
    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
    /github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
  ];

  for (const pattern of urlPatterns) {
    const match = input.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }

  return null;
}

/**
 * Fetch all GitHub data for import
 */
export async function fetchGitHubData(
  options: GitHubImportOptions
): Promise<{
  repo: GitHubRepo;
  labels: GitHubLabel[];
  milestones: GitHubMilestone[];
  issues: GitHubIssue[];
  issueComments: Map<number, GitHubIssueComment[]>;
  pullRequests: GitHubPullRequest[];
  prComments: Map<number, GitHubIssueComment[]>;
  releases: GitHubRelease[];
}> {
  const { onProgress } = options;
  
  console.log('[fetchGitHubData] Starting...');
  
  // Get token
  onProgress?.({ phase: 'auth', current: 0, total: 1, message: 'Getting GitHub authentication...' });
  const token = options.token || await getGitHubToken();
  console.log('[fetchGitHubData] Token obtained:', token ? 'yes (starts with ' + token.substring(0, 4) + ')' : 'NO TOKEN - will be rate limited!');
  
  if (!token) {
    console.warn('[fetchGitHubData] WARNING: No GitHub token provided. Requests may be rate-limited (60/hour).');
  }
  
  const client = new GitHubAPIClient(token);
  
  // Parse repo
  const parsed = parseGitHubRepo(options.repo);
  if (!parsed) {
    throw new Error(`Invalid repository format: ${options.repo}. Use owner/repo or GitHub URL.`);
  }
  
  const { owner, repo } = parsed;
  
  // Fetch repo info
  console.log(`[fetchGitHubData] Fetching repo info for ${owner}/${repo}...`);
  onProgress?.({ phase: 'repo_info', current: 0, total: 1, message: 'Fetching repository info...' });
  const repoInfo = await client.getRepo(owner, repo);
  console.log(`[fetchGitHubData] Repo info fetched: ${repoInfo.full_name}`);
  
  // Fetch labels
  let labels: GitHubLabel[] = [];
  if (options.import.labels) {
    console.log('[fetchGitHubData] Fetching labels...');
    onProgress?.({ phase: 'labels', current: 0, total: 1, message: 'Fetching labels...' });
    labels = await client.getLabels(owner, repo);
    console.log(`[fetchGitHubData] Labels fetched: ${labels.length}`);
    onProgress?.({ phase: 'labels', current: 1, total: 1, message: `Found ${labels.length} labels` });
  }
  
  // Fetch milestones
  let milestones: GitHubMilestone[] = [];
  if (options.import.milestones) {
    console.log('[fetchGitHubData] Fetching milestones...');
    onProgress?.({ phase: 'milestones', current: 0, total: 1, message: 'Fetching milestones...' });
    milestones = await client.getMilestones(owner, repo);
    console.log(`[fetchGitHubData] Milestones fetched: ${milestones.length}`);
    onProgress?.({ phase: 'milestones', current: 1, total: 1, message: `Found ${milestones.length} milestones` });
  }
  
  // Fetch issues
  let issues: GitHubIssue[] = [];
  const issueComments = new Map<number, GitHubIssueComment[]>();
  if (options.import.issues) {
    console.log('[fetchGitHubData] Fetching issues...');
    onProgress?.({ phase: 'issues', current: 0, total: 1, message: 'Fetching issues...' });
    issues = await client.getIssues(owner, repo);
    console.log(`[fetchGitHubData] Issues fetched: ${issues.length}`);
    onProgress?.({ phase: 'issues', current: 0, total: issues.length, message: `Found ${issues.length} issues, fetching comments...` });
    
    // Fetch comments for each issue (only if they have comments)
    const issuesWithComments = issues.filter(i => i.comments > 0);
    console.log(`[fetchGitHubData] Fetching comments for ${issuesWithComments.length} issues with comments...`);
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      onProgress?.({ 
        phase: 'issues', 
        current: i + 1, 
        total: issues.length, 
        message: `Fetching comments for issue #${issue.number}`,
        item: `#${issue.number} ${issue.title.slice(0, 40)}`,
      });
      
      if (issue.comments > 0) {
        const comments = await client.getIssueComments(owner, repo, issue.number);
        issueComments.set(issue.number, comments);
      }
    }
    console.log(`[fetchGitHubData] Issue comments fetched`);
  }
  
  // Fetch pull requests
  let pullRequests: GitHubPullRequest[] = [];
  const prComments = new Map<number, GitHubIssueComment[]>();
  if (options.import.pullRequests) {
    console.log('[fetchGitHubData] Fetching pull requests...');
    onProgress?.({ phase: 'pull_requests', current: 0, total: 1, message: 'Fetching pull requests...' });
    pullRequests = await client.getPullRequests(owner, repo);
    console.log(`[fetchGitHubData] Pull requests fetched: ${pullRequests.length}`);
    onProgress?.({ phase: 'pull_requests', current: 0, total: pullRequests.length, message: `Found ${pullRequests.length} pull requests` });
    
    // Fetch detailed PR info and comments
    console.log(`[fetchGitHubData] Fetching details for ${pullRequests.length} PRs...`);
    for (let i = 0; i < pullRequests.length; i++) {
      const pr = pullRequests[i];
      onProgress?.({ 
        phase: 'pull_requests', 
        current: i + 1, 
        total: pullRequests.length, 
        message: `Fetching details for PR #${pr.number}`,
        item: `#${pr.number} ${pr.title.slice(0, 40)}`,
      });
      
      // Get full PR details (includes merge info)
      try {
        pullRequests[i] = await client.getPullRequest(owner, repo, pr.number);
      } catch {
        // Keep the list version if details fail
      }
      
      // Fetch comments (issues API works for PRs too)
      if (pr.comments > 0) {
        const comments = await client.getIssueComments(owner, repo, pr.number);
        prComments.set(pr.number, comments);
      }
    }
    console.log(`[fetchGitHubData] PR details fetched`);
  }
  
  // Fetch releases
  let releases: GitHubRelease[] = [];
  if (options.import.releases) {
    console.log('[fetchGitHubData] Fetching releases...');
    onProgress?.({ phase: 'releases', current: 0, total: 1, message: 'Fetching releases...' });
    releases = await client.getReleases(owner, repo);
    console.log(`[fetchGitHubData] Releases fetched: ${releases.length}`);
    onProgress?.({ phase: 'releases', current: 1, total: 1, message: `Found ${releases.length} releases` });
  }
  
  console.log('[fetchGitHubData] All data fetched successfully');
  return {
    repo: repoInfo,
    labels,
    milestones,
    issues,
    issueComments,
    pullRequests,
    prComments,
    releases,
  };
}

/**
 * Get clone URL with token for private repos
 */
export function getAuthenticatedCloneUrl(cloneUrl: string, token: string | null): string {
  if (!token) return cloneUrl;
  
  // Convert https://github.com/owner/repo.git to https://token@github.com/owner/repo.git
  return cloneUrl.replace('https://', `https://${token}@`);
}

/**
 * Map GitHub issue state to wit issue state
 */
export function mapIssueState(state: 'open' | 'closed'): 'open' | 'closed' {
  return state;
}

/**
 * Map GitHub issue to wit issue status
 */
export function mapIssueStatus(state: 'open' | 'closed'): 'backlog' | 'done' {
  return state === 'open' ? 'backlog' : 'done';
}

/**
 * Map GitHub PR state to wit PR state
 */
export function mapPRState(pr: GitHubPullRequest): 'open' | 'closed' | 'merged' {
  if (pr.merged) return 'merged';
  if (pr.state === 'closed') return 'closed';
  return 'open';
}

/**
 * Validate import options
 */
export function validateImportOptions(options: GitHubImportOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check repo format
  const parsed = parseGitHubRepo(options.repo);
  if (!parsed) {
    errors.push(`Invalid repository format: ${options.repo}. Use owner/repo or GitHub URL.`);
  }
  
  // At least one thing to import
  const importing = Object.values(options.import).some(v => v);
  if (!importing) {
    errors.push('At least one import option must be enabled.');
  }
  
  // If importing issues or PRs, should import labels and milestones too
  if ((options.import.issues || options.import.pullRequests) && !options.import.labels) {
    // This is a warning, not an error - we'll create labels as needed
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format a human-readable summary of the import
 */
export function formatImportSummary(result: GitHubImportResult): string {
  const lines: string[] = ['GitHub Import Summary', '═'.repeat(50)];
  
  if (result.repository) {
    lines.push(`✓ Repository: ${result.repository.name}`);
  }
  
  if (result.labels.imported > 0) {
    lines.push(`✓ Labels: ${result.labels.imported} imported`);
  }
  
  if (result.milestones.imported > 0) {
    lines.push(`✓ Milestones: ${result.milestones.imported} imported`);
  }
  
  if (result.issues.imported > 0) {
    lines.push(`✓ Issues: ${result.issues.imported} imported`);
  }
  
  if (result.pullRequests.imported > 0) {
    lines.push(`✓ Pull Requests: ${result.pullRequests.imported} imported`);
  }
  
  if (result.releases.imported > 0) {
    lines.push(`✓ Releases: ${result.releases.imported} imported`);
  }
  
  if (result.errors.length > 0) {
    lines.push('', 'Errors:', ...result.errors.map(e => `  ✗ ${e}`));
  }
  
  return lines.join('\n');
}
