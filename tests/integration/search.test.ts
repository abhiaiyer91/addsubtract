/**
 * Search Integration Tests
 * 
 * Tests for global search functionality including:
 * - Repository search
 * - User search
 * - Issue search
 * - Code search (if available)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupIntegrationTest,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

// TODO: Tests expect repos.search/users.search/issues.search/pulls.search endpoints
// Search functionality needs to be implemented on each respective router
describe.skip('Search', () => {
  setupIntegrationTest();

  let userToken: string;
  let userId: string;
  let username: string;
  let repoId: string;
  let repoName: string;
  const searchablePrefix = `searchable-${Date.now()}`;

  beforeAll(async () => {

    const api = createTestClient();

    // Create test user with searchable name
    username = uniqueUsername(searchablePrefix);
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('search-test'),
      password: 'password123',
      name: `${searchablePrefix} Test User`,
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create searchable repository
    const authApi = createAuthenticatedClient(userToken);
    repoName = uniqueRepoName(searchablePrefix);
    const repo = await authApi.repos.create.mutate({
      name: repoName,
      description: `A ${searchablePrefix} repository for testing search`,
      isPrivate: false,
    });
    repoId = repo.id;

    // Create some issues for search
    await authApi.issues.create.mutate({
      repoId,
      title: `${searchablePrefix} Bug Report`,
      body: 'This is a searchable bug report',
    });

    await authApi.issues.create.mutate({
      repoId,
      title: `${searchablePrefix} Feature Request`,
      body: 'This is a searchable feature request',
    });

    // Wait a moment for indexing
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Repository Search', () => {
    it('searches repositories by name', async () => {
      const api = createTestClient();

      const results = await api.repos.search.query({
        query: searchablePrefix,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.some(r => r.name === repoName)).toBe(true);
    });

    it('searches repositories by description', async () => {
      const api = createTestClient();

      const results = await api.repos.search.query({
        query: 'testing search',
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('respects search limit', async () => {
      const api = createTestClient();

      const results = await api.repos.search.query({
        query: 'test',
        limit: 3,
      });

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('returns empty array for no matches', async () => {
      const api = createTestClient();

      const results = await api.repos.search.query({
        query: 'xyznonexistentrepoquery12345',
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('does not return private repos in search', async () => {
      const authApi = createAuthenticatedClient(userToken);
      const api = createTestClient();

      // Create a private repo with searchable name
      const privateName = uniqueRepoName(`private-${searchablePrefix}`);
      await authApi.repos.create.mutate({
        name: privateName,
        description: 'Private searchable repo',
        isPrivate: true,
      });

      // Search as unauthenticated user
      const results = await api.repos.search.query({
        query: privateName,
      });

      expect(results.every(r => !r.isPrivate)).toBe(true);
    });
  });

  describe('User Search', () => {
    it('searches users by username', async () => {
      const api = createTestClient();

      const results = await api.users.search.query({
        query: searchablePrefix,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.some(u => u.username === username)).toBe(true);
    });

    it('searches users by name', async () => {
      const api = createTestClient();

      const results = await api.users.search.query({
        query: `${searchablePrefix} Test`,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('respects user search limit', async () => {
      const api = createTestClient();

      const results = await api.users.search.query({
        query: 'test',
        limit: 2,
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Issue Search', () => {
    it('searches issues by title', async () => {
      const api = createTestClient();

      const results = await api.issues.search.query({
        query: `${searchablePrefix} Bug`,
      });

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results.some(i => i.title.includes('Bug Report'))).toBe(true);
      }
    });

    it('searches issues within a repository', async () => {
      const api = createTestClient();

      const results = await api.issues.search.query({
        query: searchablePrefix,
        repoId,
      });

      expect(Array.isArray(results)).toBe(true);
      // All results should be from our repo
      expect(results.every(i => i.repoId === repoId)).toBe(true);
    });

    it('searches issues by state', async () => {
      const api = createTestClient();

      const openResults = await api.issues.search.query({
        query: searchablePrefix,
        state: 'open',
      });

      expect(Array.isArray(openResults)).toBe(true);
      expect(openResults.every(i => i.state === 'open')).toBe(true);
    });

    it('respects issue search limit', async () => {
      const api = createTestClient();

      const results = await api.issues.search.query({
        query: searchablePrefix,
        limit: 1,
      });

      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Pull Request Search', () => {
    beforeAll(async () => {
        const authApi = createAuthenticatedClient(userToken);

      // Create some PRs for search
      await authApi.pulls.create.mutate({
        repoId,
        title: `${searchablePrefix} Fix Bug`,
        body: 'Searchable PR fixing a bug',
        sourceBranch: 'fix-bug',
        targetBranch: 'main',
        headSha: 'c'.repeat(64),
        baseSha: 'd'.repeat(64),
        isDraft: false,
      });
    });

    it('searches pull requests by title', async () => {
      const api = createTestClient();

      const results = await api.pulls.search.query({
        query: `${searchablePrefix} Fix`,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('searches pull requests within a repository', async () => {
      const api = createTestClient();

      const results = await api.pulls.search.query({
        query: searchablePrefix,
        repoId,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.every(p => p.repoId === repoId)).toBe(true);
    });

    it('searches pull requests by state', async () => {
      const api = createTestClient();

      const results = await api.pulls.search.query({
        query: searchablePrefix,
        state: 'open',
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.every(p => p.state === 'open')).toBe(true);
    });
  });

  describe('Global Search', () => {
    it('performs global search across entities', async () => {
      const api = createTestClient();

      const results = await api.search.global.query({
        query: searchablePrefix,
      });

      expect(results).toBeDefined();
      expect(results.repos).toBeDefined();
      expect(results.users).toBeDefined();
      expect(results.issues).toBeDefined();
      expect(Array.isArray(results.repos)).toBe(true);
      expect(Array.isArray(results.users)).toBe(true);
      expect(Array.isArray(results.issues)).toBe(true);
    });

    it('filters global search by type', async () => {
      const api = createTestClient();

      const repoResults = await api.search.global.query({
        query: searchablePrefix,
        type: 'repos',
      });

      expect(repoResults.repos.length).toBeGreaterThan(0);
    });

    it('respects global search limits', async () => {
      const api = createTestClient();

      const results = await api.search.global.query({
        query: 'test',
        limit: 5,
      });

      expect(results.repos.length).toBeLessThanOrEqual(5);
      expect(results.users.length).toBeLessThanOrEqual(5);
      expect(results.issues.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Search Edge Cases', () => {
    it('handles empty query', async () => {
      const api = createTestClient();

      const results = await api.repos.search.query({
        query: '',
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('handles special characters in query', async () => {
      const api = createTestClient();

      // Should not throw
      const results = await api.repos.search.query({
        query: 'test!@#$%^&*()',
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('handles unicode in query', async () => {
      const api = createTestClient();

      const results = await api.repos.search.query({
        query: '日本語 🔍',
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('handles very long query', async () => {
      const api = createTestClient();

      const longQuery = 'a'.repeat(200);
      const results = await api.repos.search.query({
        query: longQuery,
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });
});
