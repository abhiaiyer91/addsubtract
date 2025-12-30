/**
 * Wrapped Integration Tests
 * 
 * Tests for year-in-review/wrapped functionality including:
 * - Statistics generation
 * - Highlights computation
 * - Sharing and export
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('Wrapped', () => {
  let userToken: string;
  let userId: string;
  let username: string;
  let repoId: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create test user
    username = uniqueUsername('wrapped-test');
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('wrapped-test'),
      password: 'password123',
      name: 'Wrapped Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create activity for wrapped stats
    const authApi = createAuthenticatedClient(userToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('wrapped-repo'),
      description: 'Repository for wrapped tests',
      isPrivate: false,
    });
    repoId = repo.id;

    // Create some issues and PRs
    await authApi.issues.create.mutate({
      repoId,
      title: 'Wrapped Test Issue',
      body: 'Issue for wrapped stats',
    });

    await authApi.pulls.create.mutate({
      repoId,
      title: 'Wrapped Test PR',
      body: 'PR for wrapped stats',
      sourceBranch: 'feature-wrapped',
      targetBranch: 'main',
      headSha: 'a'.repeat(64),
      baseSha: 'b'.repeat(64),
      isDraft: false,
    });
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Wrapped Generation', () => {
    it('generates wrapped for current year', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.generate.mutate({
        year: new Date().getFullYear(),
      });

      expect(wrapped).toBeDefined();
      expect(wrapped.year).toBe(new Date().getFullYear());
      expect(wrapped.userId).toBe(userId);
    });

    it('gets wrapped data', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(wrapped).toBeDefined();
      expect(wrapped.stats).toBeDefined();
    });

    it('requires authentication', async () => {
      const api = createTestClient();

      await expect(
        api.wrapped.generate.mutate({
          year: new Date().getFullYear(),
        })
      ).rejects.toThrow();
    });
  });

  describe('Wrapped Statistics', () => {
    it('includes commit stats', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(wrapped.stats.commits).toBeDefined();
      expect(typeof wrapped.stats.commits.total).toBe('number');
    });

    it('includes PR stats', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(wrapped.stats.pullRequests).toBeDefined();
      expect(typeof wrapped.stats.pullRequests.opened).toBe('number');
      expect(typeof wrapped.stats.pullRequests.merged).toBe('number');
    });

    it('includes issue stats', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(wrapped.stats.issues).toBeDefined();
      expect(typeof wrapped.stats.issues.opened).toBe('number');
      expect(typeof wrapped.stats.issues.closed).toBe('number');
    });

    it('includes review stats', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(wrapped.stats.reviews).toBeDefined();
      expect(typeof wrapped.stats.reviews.given).toBe('number');
    });

    it('includes language stats', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(wrapped.stats.languages).toBeDefined();
      expect(Array.isArray(wrapped.stats.languages)).toBe(true);
    });
  });

  describe('Wrapped Highlights', () => {
    it('includes top repositories', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(wrapped.highlights).toBeDefined();
      expect(Array.isArray(wrapped.highlights.topRepos)).toBe(true);
    });

    it('includes busiest day', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(wrapped.highlights.busiestDay).toBeDefined();
    });

    it('includes longest streak', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(typeof wrapped.highlights.longestStreak).toBe('number');
    });

    it('includes achievements unlocked', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const wrapped = await authApi.wrapped.get.query({
        year: new Date().getFullYear(),
      });

      expect(Array.isArray(wrapped.highlights.achievements)).toBe(true);
    });
  });

  describe('Wrapped Comparison', () => {
    it('compares with previous year', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const currentYear = new Date().getFullYear();

      const comparison = await authApi.wrapped.compare.query({
        year: currentYear,
        previousYear: currentYear - 1,
      });

      expect(comparison).toBeDefined();
      expect(comparison.currentYear).toBe(currentYear);
      expect(comparison.previousYear).toBe(currentYear - 1);
      expect(comparison.changes).toBeDefined();
    });
  });

  describe('Wrapped Sharing', () => {
    it('generates shareable link', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const shareLink = await authApi.wrapped.share.mutate({
        year: new Date().getFullYear(),
      });

      expect(shareLink).toBeDefined();
      expect(shareLink.url).toBeDefined();
      expect(shareLink.url).toContain('wrapped');
    });

    it('gets public wrapped by share link', async () => {
      const authApi = createAuthenticatedClient(userToken);
      const api = createTestClient();

      // Generate share link
      const shareLink = await authApi.wrapped.share.mutate({
        year: new Date().getFullYear(),
      });

      // Access without auth using share token
      const publicWrapped = await api.wrapped.getPublic.query({
        shareToken: shareLink.token,
      });

      expect(publicWrapped).toBeDefined();
      expect(publicWrapped.stats).toBeDefined();
    });

    it('revokes share link', async () => {
      const authApi = createAuthenticatedClient(userToken);
      const api = createTestClient();

      // Generate share link
      const shareLink = await authApi.wrapped.share.mutate({
        year: new Date().getFullYear(),
      });

      // Revoke it
      await authApi.wrapped.revokeShare.mutate({
        year: new Date().getFullYear(),
      });

      // Try to access - should fail
      await expect(
        api.wrapped.getPublic.query({
          shareToken: shareLink.token,
        })
      ).rejects.toThrow();
    });
  });

  describe('Wrapped Export', () => {
    it('exports wrapped as JSON', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const exportData = await authApi.wrapped.export.query({
        year: new Date().getFullYear(),
        format: 'json',
      });

      expect(exportData).toBeDefined();
      expect(typeof exportData.data).toBe('string');
      
      const parsed = JSON.parse(exportData.data);
      expect(parsed.stats).toBeDefined();
    });

    it('exports wrapped as image URL', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const exportData = await authApi.wrapped.export.query({
        year: new Date().getFullYear(),
        format: 'image',
      });

      expect(exportData).toBeDefined();
      expect(exportData.url).toBeDefined();
    });
  });

  describe('Available Years', () => {
    it('lists available years', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const years = await authApi.wrapped.availableYears.query();

      expect(Array.isArray(years)).toBe(true);
      expect(years).toContain(new Date().getFullYear());
    });
  });

  describe('Edge Cases', () => {
    it('handles year with no activity', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Try to generate for a year before user existed
      const oldYear = 2010;

      const wrapped = await authApi.wrapped.generate.mutate({
        year: oldYear,
      });

      expect(wrapped.stats.commits.total).toBe(0);
      expect(wrapped.stats.pullRequests.opened).toBe(0);
    });

    it('handles future year', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.wrapped.generate.mutate({
          year: new Date().getFullYear() + 1,
        })
      ).rejects.toThrow();
    });
  });
});
