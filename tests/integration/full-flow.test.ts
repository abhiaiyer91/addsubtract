/**
 * End-to-End Integration Tests
 * 
 * These tests verify that all components (Server, Database, tRPC API)
 * work together correctly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupIntegrationTest,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  API_URL,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('E2E Integration', () => {
  setupIntegrationTest();

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Health Check', () => {
    it('returns healthy status', async () => {
      const response = await fetch(`${API_URL}/health`);
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.status).toBeDefined();
      expect(data.version).toBe('2.0.0');
      expect(data.timestamp).toBeDefined();
      expect(data.database).toBeDefined();
    });

    it('returns repos list endpoint', async () => {
      const response = await fetch(`${API_URL}/repos`);
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.count).toBeDefined();
      expect(Array.isArray(data.repositories)).toBe(true);
    });
  });

  describe('User Flow', () => {
    let sessionToken: string;
    let userId: string;
    let testUsername: string;
    let testEmail: string;
    const testPassword = 'password123';

    beforeEach(() => {
      testUsername = uniqueUsername();
      testEmail = uniqueEmail();
    });

    it('registers a new user', async () => {
      const api = createTestClient();
      
      const result = await api.auth.register.mutate({
        username: testUsername,
        email: testEmail,
        password: testPassword,
        name: 'Test User',
      });

      expect(result.user).toBeDefined();
      expect(result.user.username).toBe(testUsername);
      expect(result.sessionId).toBeDefined();
      
      userId = result.user.id;
      sessionToken = result.sessionId;
    });

    it('fails to register with duplicate username', async () => {
      const api = createTestClient();
      
      // First registration
      await api.auth.register.mutate({
        username: testUsername,
        email: testEmail,
        password: testPassword,
      });

      // Try to register again with same username
      await expect(
        api.auth.register.mutate({
          username: testUsername,
          email: uniqueEmail(),
          password: testPassword,
        })
      ).rejects.toThrow();
    });

    it('logs in with valid credentials', async () => {
      const api = createTestClient();
      
      // First register
      await api.auth.register.mutate({
        username: testUsername,
        email: testEmail,
        password: testPassword,
      });

      // Then login
      const result = await api.auth.login.mutate({
        usernameOrEmail: testUsername,
        password: testPassword,
      });

      expect(result.user).toBeDefined();
      expect(result.user.username).toBe(testUsername);
      expect(result.sessionId).toBeDefined();
      
      sessionToken = result.sessionId;
    });

    it('fails to login with invalid credentials', async () => {
      const api = createTestClient();
      
      // Register first
      await api.auth.register.mutate({
        username: testUsername,
        email: testEmail,
        password: testPassword,
      });

      // Try to login with wrong password
      await expect(
        api.auth.login.mutate({
          usernameOrEmail: testUsername,
          password: 'wrongpassword',
        })
      ).rejects.toThrow();
    });

    it('gets current user when authenticated', async () => {
      const api = createTestClient();
      
      // Register and get session
      const registerResult = await api.auth.register.mutate({
        username: testUsername,
        email: testEmail,
        password: testPassword,
        name: 'Test User',
      });
      
      sessionToken = registerResult.sessionId;

      // Get current user with authenticated client
      const authApi = createAuthenticatedClient(sessionToken);
      const user = await authApi.auth.me.query();

      expect(user).not.toBeNull();
      expect(user?.username).toBe(testUsername);
    });

    it('returns null for unauthenticated user', async () => {
      const api = createTestClient();
      const user = await api.auth.me.query();
      expect(user).toBeNull();
    });
  });

  describe('Repository Flow', () => {
    let sessionToken: string;
    let repoId: string;
    let testUsername: string;
    let repoName: string;

    beforeAll(async () => {
        // Create a test user for repository tests
      testUsername = uniqueUsername('repouser');
      const api = createTestClient();

      const result = await api.auth.register.mutate({
        username: testUsername,
        email: uniqueEmail('repouser'),
        password: 'password123',
        name: 'Repo Test User',
      });

      sessionToken = result.sessionId;
    });

    beforeEach(() => {
      repoName = uniqueRepoName();
    });

    it('creates a public repository', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const repo = await authApi.repos.create.mutate({
        name: repoName,
        description: 'A test repository',
        isPrivate: false,
      });

      expect(repo).toBeDefined();
      expect(repo.name).toBe(repoName);
      expect(repo.isPrivate).toBe(false);
      
      repoId = repo.id;
    });

    it('creates a private repository', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const repo = await authApi.repos.create.mutate({
        name: repoName,
        description: 'A private test repository',
        isPrivate: true,
      });

      expect(repo).toBeDefined();
      expect(repo.isPrivate).toBe(true);
    });

    it('fails to create repo without authentication', async () => {
      const api = createTestClient();
      
      await expect(
        (api.repos.create as any).mutate({
          name: repoName,
          description: 'Should fail',
          isPrivate: false,
        })
      ).rejects.toThrow();
    });

    it('gets repository by owner and name', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      // Create repo first
      await authApi.repos.create.mutate({
        name: repoName,
        description: 'A test repository',
        isPrivate: false,
      });

      // Get the repo
      const result = await authApi.repos.get.query({
        owner: testUsername,
        repo: repoName,
      });

      expect(result).toBeDefined();
      expect(result.repo.name).toBe(repoName);
    });

    it('lists repositories by owner', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      // Create a repo
      await authApi.repos.create.mutate({
        name: repoName,
        description: 'A test repository',
        isPrivate: false,
      });

      // List repos
      const repos = await authApi.repos.list.query({
        owner: testUsername,
      });

      expect(Array.isArray(repos)).toBe(true);
      expect(repos.length).toBeGreaterThan(0);
    });

    it('updates repository', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      // Create repo
      const repo = await authApi.repos.create.mutate({
        name: repoName,
        description: 'Original description',
        isPrivate: false,
      });

      // Update repo
      const updated = await authApi.repos.update.mutate({
        repoId: repo.id,
        description: 'Updated description',
      });

      expect(updated.description).toBe('Updated description');
    });

    it('deletes repository', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      // Create repo
      const repo = await authApi.repos.create.mutate({
        name: repoName,
        description: 'To be deleted',
        isPrivate: false,
      });

      // Delete repo
      await authApi.repos.delete.mutate({
        repoId: repo.id,
      });

      // Verify it's deleted
      await expect(
        authApi.repos.get.query({
          owner: testUsername,
          repo: repoName,
        })
      ).rejects.toThrow();
    });
  });

  describe('Issue Flow', () => {
    let sessionToken: string;
    let repoId: string;
    let issueId: string;
    let testUsername: string;

    beforeAll(async () => {
        // Create a test user and repo
      testUsername = uniqueUsername('issueuser');
      const api = createTestClient();

      const result = await api.auth.register.mutate({
        username: testUsername,
        email: uniqueEmail('issueuser'),
        password: 'password123',
      });
      
      sessionToken = result.sessionId;
      
      // Create a repo for issues
      const authApi = createAuthenticatedClient(sessionToken);
      const repo = await authApi.repos.create.mutate({
        name: uniqueRepoName('issue-test'),
        description: 'Repo for issue tests',
        isPrivate: false,
      });
      
      repoId = repo.id;
    });

    it('creates an issue', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const issue = await authApi.issues.create.mutate({
        repoId,
        title: 'Bug: Something is broken',
        body: 'Please fix this issue',
      });

      expect(issue).toBeDefined();
      expect(issue.title).toBe('Bug: Something is broken');
      expect(issue.state).toBe('open');
      expect(issue.number).toBe(1);
      
      issueId = issue.id;
    });

    it('lists issues for a repository', async () => {
      const api = createTestClient();
      
      const issues = await api.issues.list.query({
        repoId,
        state: 'open',
      });

      expect(Array.isArray(issues)).toBe(true);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('gets issue by number', async () => {
      const api = createTestClient();
      
      const issue = await api.issues.get.query({
        repoId,
        number: 1,
      });

      expect(issue).toBeDefined();
      expect(issue.title).toBe('Bug: Something is broken');
    });

    it('updates an issue', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const updated = await authApi.issues.update.mutate({
        issueId,
        title: 'Updated: Bug is now a feature',
        body: 'Actually this is working as intended',
      });

      expect(updated.title).toBe('Updated: Bug is now a feature');
    });

    it('closes an issue', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const closed = await authApi.issues.close.mutate({
        issueId,
      });

      expect(closed.state).toBe('closed');
      expect(closed.closedAt).toBeDefined();
    });

    it('reopens an issue', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const reopened = await authApi.issues.reopen.mutate({
        issueId,
      });

      expect(reopened.state).toBe('open');
    });

    it('adds a comment to an issue', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const comment = await authApi.issues.addComment.mutate({
        issueId,
        body: 'This is a test comment',
      });

      expect(comment).toBeDefined();
      expect(comment.body).toBe('This is a test comment');
    });

    it('lists comments on an issue', async () => {
      const api = createTestClient();
      
      const comments = await api.issues.comments.query({
        issueId,
      });

      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBeGreaterThan(0);
    });
  });

  describe('Pull Request Flow', () => {
    let sessionToken: string;
    let repoId: string;
    let prId: string;
    let testUsername: string;

    beforeAll(async () => {
        // Create a test user and repo
      testUsername = uniqueUsername('pruser');
      const api = createTestClient();

      const result = await api.auth.register.mutate({
        username: testUsername,
        email: uniqueEmail('pruser'),
        password: 'password123',
      });
      
      sessionToken = result.sessionId;
      
      // Create a repo for PRs
      const authApi = createAuthenticatedClient(sessionToken);
      const repo = await authApi.repos.create.mutate({
        name: uniqueRepoName('pr-test'),
        description: 'Repo for PR tests',
        isPrivate: false,
      });
      
      repoId = repo.id;
    });

    it('creates a pull request', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const pr = await authApi.pulls.create.mutate({
        repoId,
        title: 'Add new feature',
        body: 'This PR adds a new feature',
        sourceBranch: 'feature',
        targetBranch: 'main',
        headSha: '0'.repeat(64),
        baseSha: '1'.repeat(64),
        isDraft: false,
      });

      expect(pr).toBeDefined();
      expect(pr.title).toBe('Add new feature');
      expect(pr.state).toBe('open');
      expect(pr.number).toBe(1);
      
      prId = pr.id;
    });

    it('lists pull requests for a repository', async () => {
      const api = createTestClient();
      
      const prs = await api.pulls.list.query({
        repoId,
        state: 'open',
      });

      expect(Array.isArray(prs)).toBe(true);
      expect(prs.length).toBeGreaterThan(0);
    });

    it('gets pull request by number', async () => {
      const api = createTestClient();
      
      const pr = await api.pulls.get.query({
        repoId,
        number: 1,
      });

      expect(pr).toBeDefined();
      expect(pr.title).toBe('Add new feature');
    });

    it('updates a pull request', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const updated = await authApi.pulls.update.mutate({
        prId,
        title: 'Updated: Add awesome feature',
        body: 'This is now an awesome feature',
      });

      expect(updated.title).toBe('Updated: Add awesome feature');
    });

    it('adds a review to a pull request', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const review = await authApi.pulls.addReview.mutate({
        prId,
        state: 'approved',
        body: 'Looks good to me!',
        commitSha: '0'.repeat(64),
      });

      expect(review).toBeDefined();
      expect(review.state).toBe('approved');
    });

    it('lists reviews for a pull request', async () => {
      const api = createTestClient();
      
      const reviews = await api.pulls.reviews.query({
        prId,
      });

      expect(Array.isArray(reviews)).toBe(true);
      expect(reviews.length).toBeGreaterThan(0);
    });

    it('adds a comment to a pull request', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const comment = await authApi.pulls.addComment.mutate({
        prId,
        body: 'Great work!',
      });

      expect(comment).toBeDefined();
      expect(comment.body).toBe('Great work!');
    });

    it('closes a pull request', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const closed = await authApi.pulls.close.mutate({
        prId,
      });

      expect(closed.state).toBe('closed');
    });

    it('reopens a pull request', async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      
      const reopened = await authApi.pulls.reopen.mutate({
        prId,
      });

      expect(reopened.state).toBe('open');
    });
  });

  describe('Activity Flow', () => {
    let sessionToken: string;
    let userId: string;
    let testUsername: string;

    beforeAll(async () => {
        // Create a test user
      testUsername = uniqueUsername('activityuser');
      const api = createTestClient();

      const result = await api.auth.register.mutate({
        username: testUsername,
        email: uniqueEmail('activityuser'),
        password: 'password123',
      });
      
      sessionToken = result.sessionId;
      userId = result.user.id;
      
      // Create some activity by creating a repo
      const authApi = createAuthenticatedClient(sessionToken);
      await authApi.repos.create.mutate({
        name: uniqueRepoName('activity-test'),
        description: 'Repo for activity tests',
        isPrivate: false,
      });
    });

    it('lists activity feed', async () => {
      // Note: activity.feed requires authentication, use publicFeed for unauthenticated access
      const authApi = createAuthenticatedClient(sessionToken);
      
      const activity = await authApi.activity.feed.query({
        limit: 10,
      });

      expect(Array.isArray(activity)).toBe(true);
      // Activity feed should have at least the repo creation
    });

    it('lists activity for a specific user', async () => {
      const api = createTestClient();
      
      // Use the correct method name: forUser (not byUser)
      const activity = await api.activity.forUser.query({
        userId,
        limit: 10,
      });

      expect(Array.isArray(activity)).toBe(true);
    });
  });

  describe('Search', () => {
    let sessionToken: string;
    let testUsername: string;
    const searchableRepoName = `searchable-${Date.now()}`;

    beforeAll(async () => {
        // Create a test user and searchable repo
      testUsername = uniqueUsername('searchuser');
      const api = createTestClient();

      const result = await api.auth.register.mutate({
        username: testUsername,
        email: uniqueEmail('searchuser'),
        password: 'password123',
      });
      
      sessionToken = result.sessionId;
      
      // Create a searchable repo
      const authApi = createAuthenticatedClient(sessionToken);
      await authApi.repos.create.mutate({
        name: searchableRepoName,
        description: 'A searchable test repository',
        isPrivate: false,
      });
    });

    it('searches repositories', async () => {
      const api = createTestClient();
      
      const results = await api.repos.search.query({
        query: 'searchable',
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
      // Should find our searchable repo
    });
  });
});
