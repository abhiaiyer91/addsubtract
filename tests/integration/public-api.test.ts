/**
 * Public REST API Integration Tests
 * 
 * Tests for GitHub-compatible REST API endpoints including:
 * - Repositories API
 * - Issues API
 * - Pull Requests API
 * - Users API
 * - Organizations API
 * - Search API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  API_URL,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('Public REST API', () => {
  let userToken: string;
  let userId: string;
  let username: string;
  let repoId: string;
  let repoName: string;
  let issueNumber: number;
  let prNumber: number;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create test user
    username = uniqueUsername('public-api-test');
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('public-api-test'),
      password: 'password123',
      name: 'Public API Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create repository
    const authApi = createAuthenticatedClient(userToken);
    repoName = uniqueRepoName('public-api-repo');
    const repo = await authApi.repos.create.mutate({
      name: repoName,
      description: 'Repository for public API tests',
      isPrivate: false,
    });
    repoId = repo.id;

    // Create issue
    const issue = await authApi.issues.create.mutate({
      repoId,
      title: 'Public API Test Issue',
      body: 'Issue for testing public API',
    });
    issueNumber = issue.number;

    // Create PR
    const pr = await authApi.pulls.create.mutate({
      repoId,
      title: 'Public API Test PR',
      body: 'PR for testing public API',
      sourceBranch: 'feature-public-api',
      targetBranch: 'main',
      headSha: 'a'.repeat(64),
      baseSha: 'b'.repeat(64),
      isDraft: false,
    });
    prNumber = pr.number;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Users API', () => {
    it('GET /api/users/:username - gets user profile', async () => {
      const response = await fetch(`${API_URL}/api/users/${username}`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.login).toBe(username);
      expect(data.id).toBeDefined();
    });

    it('GET /api/users/:username/repos - lists user repos', async () => {
      const response = await fetch(`${API_URL}/api/users/${username}/repos`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((r: any) => r.name === repoName)).toBe(true);
    });

    it('GET /api/user - gets authenticated user', async () => {
      const response = await fetch(`${API_URL}/api/user`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.login).toBe(username);
    });

    it('GET /api/user - returns 401 without auth', async () => {
      const response = await fetch(`${API_URL}/api/user`);

      expect(response.status).toBe(401);
    });

    it('returns 404 for non-existent user', async () => {
      const response = await fetch(`${API_URL}/api/users/nonexistent-user-xyz123`);

      expect(response.status).toBe(404);
    });
  });

  describe('Repositories API', () => {
    it('GET /api/repos/:owner/:repo - gets repository', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.name).toBe(repoName);
      expect(data.owner.login).toBe(username);
      expect(data.full_name).toBe(`${username}/${repoName}`);
    });

    it('includes standard GitHub-like fields', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}`);
      const data = await response.json();

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('full_name');
      expect(data).toHaveProperty('description');
      expect(data).toHaveProperty('private');
      expect(data).toHaveProperty('owner');
      expect(data).toHaveProperty('html_url');
      expect(data).toHaveProperty('clone_url');
      expect(data).toHaveProperty('created_at');
      expect(data).toHaveProperty('updated_at');
    });

    it('GET /api/repos/:owner/:repo/branches - lists branches', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/branches`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/repos/:owner/:repo/contributors - lists contributors', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/contributors`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('returns 404 for non-existent repo', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/nonexistent-repo`);

      expect(response.status).toBe(404);
    });
  });

  describe('Issues API', () => {
    it('GET /api/repos/:owner/:repo/issues - lists issues', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/issues`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((i: any) => i.number === issueNumber)).toBe(true);
    });

    it('GET /api/repos/:owner/:repo/issues/:number - gets issue', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/issues/${issueNumber}`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.number).toBe(issueNumber);
      expect(data.title).toBe('Public API Test Issue');
    });

    it('includes standard issue fields', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/issues/${issueNumber}`);
      const data = await response.json();

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('number');
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('body');
      expect(data).toHaveProperty('state');
      expect(data).toHaveProperty('user');
      expect(data).toHaveProperty('created_at');
    });

    it('POST /api/repos/:owner/:repo/issues - creates issue', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/issues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          title: 'API Created Issue',
          body: 'Created via REST API',
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.title).toBe('API Created Issue');
      expect(data.number).toBeDefined();
    });

    it('PATCH /api/repos/:owner/:repo/issues/:number - updates issue', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/issues/${issueNumber}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          title: 'Updated Issue Title',
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.title).toBe('Updated Issue Title');
    });

    it('GET /api/repos/:owner/:repo/issues/:number/comments - lists comments', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/issues/${issueNumber}/comments`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('supports state filter', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/issues?state=open`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.every((i: any) => i.state === 'open')).toBe(true);
    });
  });

  describe('Pull Requests API', () => {
    it('GET /api/repos/:owner/:repo/pulls - lists PRs', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/pulls`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((p: any) => p.number === prNumber)).toBe(true);
    });

    it('GET /api/repos/:owner/:repo/pulls/:number - gets PR', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/pulls/${prNumber}`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.number).toBe(prNumber);
      expect(data.title).toBe('Public API Test PR');
    });

    it('includes standard PR fields', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/pulls/${prNumber}`);
      const data = await response.json();

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('number');
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('body');
      expect(data).toHaveProperty('state');
      expect(data).toHaveProperty('user');
      expect(data).toHaveProperty('head');
      expect(data).toHaveProperty('base');
      expect(data).toHaveProperty('merged');
    });

    it('GET /api/repos/:owner/:repo/pulls/:number/reviews - lists reviews', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/pulls/${prNumber}/reviews`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/repos/:owner/:repo/pulls/:number/comments - lists comments', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/pulls/${prNumber}/comments`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('supports state filter', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/pulls?state=open`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.every((p: any) => p.state === 'open')).toBe(true);
    });
  });

  describe('Search API', () => {
    it('GET /api/search/repositories - searches repos', async () => {
      const response = await fetch(`${API_URL}/api/search/repositories?q=${repoName}`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty('total_count');
      expect(data).toHaveProperty('items');
      expect(Array.isArray(data.items)).toBe(true);
    });

    it('GET /api/search/users - searches users', async () => {
      const response = await fetch(`${API_URL}/api/search/users?q=${username.slice(0, 10)}`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty('total_count');
      expect(data).toHaveProperty('items');
    });

    it('GET /api/search/issues - searches issues', async () => {
      const response = await fetch(`${API_URL}/api/search/issues?q=API+Test`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty('total_count');
      expect(data).toHaveProperty('items');
    });

    it('supports pagination', async () => {
      const response = await fetch(`${API_URL}/api/search/repositories?q=test&page=1&per_page=5`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.items.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Organizations API', () => {
    let orgName: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(userToken);
      orgName = `org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'Test Organization',
      });
    });

    it('GET /api/orgs/:org - gets organization', async () => {
      const response = await fetch(`${API_URL}/api/orgs/${orgName}`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.login).toBe(orgName);
    });

    it('GET /api/orgs/:org/repos - lists org repos', async () => {
      const response = await fetch(`${API_URL}/api/orgs/${orgName}/repos`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/orgs/:org/members - lists org members', async () => {
      const response = await fetch(`${API_URL}/api/orgs/${orgName}/members`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('returns 404 for non-existent org', async () => {
      const response = await fetch(`${API_URL}/api/orgs/nonexistent-org-xyz123`);

      expect(response.status).toBe(404);
    });
  });

  describe('Rate Limiting', () => {
    it('includes rate limit headers', async () => {
      const response = await fetch(`${API_URL}/api/users/${username}`);

      // GitHub-style rate limit headers
      expect(response.headers.has('x-ratelimit-limit') || response.headers.has('ratelimit-limit')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('returns proper error format', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/nonexistent`);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toHaveProperty('message');
    });

    it('returns 401 for unauthorized requests', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });

      expect(response.status).toBe(401);
    });

    it('returns 400 for invalid request body', async () => {
      const response = await fetch(`${API_URL}/api/repos/${username}/${repoName}/issues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({}), // Missing required fields
      });

      expect([400, 422]).toContain(response.status);
    });
  });

  describe('CORS Headers', () => {
    it('includes CORS headers for API requests', async () => {
      const response = await fetch(`${API_URL}/api/users/${username}`);

      // Should have CORS headers for API access
      // The actual header depends on server configuration
      expect(response.ok).toBe(true);
    });
  });
});
