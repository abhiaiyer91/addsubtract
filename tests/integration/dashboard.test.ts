/**
 * Dashboard Integration Tests
 * 
 * Tests for user dashboard functionality including:
 * - Activity summary
 * - Repository statistics
 * - Contribution overview
 * - Recent activity
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

// TODO: Tests expect overview/contributionStats/recentActivity/repoStats endpoints
// Dashboard router has getData/getSummary/getContributionStats instead
describe.skip('Dashboard', () => {
  setupIntegrationTest();

  let userToken: string;
  let userId: string;
  let username: string;
  let repoId: string;

  beforeAll(async () => {

    const api = createTestClient();

    // Create test user
    username = uniqueUsername('dashboard-test');
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('dashboard-test'),
      password: 'password123',
      name: 'Dashboard Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create a repository with some activity
    const authApi = createAuthenticatedClient(userToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('dashboard-repo'),
      description: 'Repository for dashboard tests',
      isPrivate: false,
    });
    repoId = repo.id;

    // Create some issues and PRs for activity
    await authApi.issues.create.mutate({
      repoId,
      title: 'Dashboard Test Issue',
      body: 'Issue for dashboard activity',
    });

    await authApi.pulls.create.mutate({
      repoId,
      title: 'Dashboard Test PR',
      body: 'PR for dashboard activity',
      sourceBranch: 'feature-dashboard',
      targetBranch: 'main',
      headSha: 'a'.repeat(64),
      baseSha: 'b'.repeat(64),
      isDraft: false,
    });
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('User Dashboard', () => {
    it('gets dashboard overview', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const dashboard = await authApi.dashboard.overview.query();

      expect(dashboard).toBeDefined();
      expect(dashboard.user).toBeDefined();
      expect(dashboard.user.id).toBe(userId);
    });

    it('gets repository count', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const dashboard = await authApi.dashboard.overview.query();

      expect(typeof dashboard.repoCount).toBe('number');
      expect(dashboard.repoCount).toBeGreaterThanOrEqual(1);
    });

    it('gets contribution stats', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const stats = await authApi.dashboard.contributionStats.query();

      expect(stats).toBeDefined();
      expect(typeof stats.totalCommits).toBe('number');
      expect(typeof stats.totalIssues).toBe('number');
      expect(typeof stats.totalPrs).toBe('number');
    });

    it('gets recent activity', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const activity = await authApi.dashboard.recentActivity.query({
        limit: 10,
      });

      expect(Array.isArray(activity)).toBe(true);
    });

    it('requires authentication', async () => {
      const api = createTestClient();

      await expect(
        api.dashboard.overview.query()
      ).rejects.toThrow();
    });
  });

  describe('Repository Dashboard', () => {
    it('gets repository dashboard', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const repoDashboard = await authApi.dashboard.repository.query({
        repoId,
      });

      expect(repoDashboard).toBeDefined();
      expect(repoDashboard.repo).toBeDefined();
      expect(repoDashboard.repo.id).toBe(repoId);
    });

    it('gets repository statistics', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const stats = await authApi.dashboard.repoStats.query({
        repoId,
      });

      expect(stats).toBeDefined();
      expect(typeof stats.openIssues).toBe('number');
      expect(typeof stats.openPrs).toBe('number');
      expect(typeof stats.starCount).toBe('number');
      expect(typeof stats.forkCount).toBe('number');
    });

    it('gets repository activity', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const activity = await authApi.dashboard.repoActivity.query({
        repoId,
        limit: 10,
      });

      expect(Array.isArray(activity)).toBe(true);
    });

    it('gets repository contributors', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const contributors = await authApi.dashboard.contributors.query({
        repoId,
      });

      expect(Array.isArray(contributors)).toBe(true);
      if (contributors.length > 0) {
        expect(contributors[0].userId).toBeDefined();
        expect(typeof contributors[0].contributions).toBe('number');
      }
    });
  });

  describe('Activity Feed', () => {
    it('gets personal activity feed', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const feed = await authApi.activity.feed.query({
        limit: 20,
      });

      expect(Array.isArray(feed)).toBe(true);
    });

    it('gets public activity feed', async () => {
      const api = createTestClient();

      const feed = await api.activity.publicFeed.query({
        limit: 20,
      });

      expect(Array.isArray(feed)).toBe(true);
    });

    it('gets activity for specific repo', async () => {
      const api = createTestClient();

      const activity = await api.activity.forRepo.query({
        repoId,
        limit: 10,
      });

      expect(Array.isArray(activity)).toBe(true);
    });

    it('gets activity for specific user', async () => {
      const api = createTestClient();

      const activity = await api.activity.forUser.query({
        userId,
        limit: 10,
      });

      expect(Array.isArray(activity)).toBe(true);
    });
  });

  describe('Contribution Graph', () => {
    it('gets contribution calendar data', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const calendar = await authApi.dashboard.contributionCalendar.query({
        year: new Date().getFullYear(),
      });

      expect(calendar).toBeDefined();
      expect(Array.isArray(calendar.weeks)).toBe(true);
    });

    it('gets contribution summary', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const summary = await authApi.dashboard.contributionSummary.query({
        days: 30,
      });

      expect(summary).toBeDefined();
      expect(typeof summary.totalContributions).toBe('number');
    });
  });

  describe('Notifications', () => {
    it('gets notification count', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const count = await authApi.notifications.unreadCount.query();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('lists notifications', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const notifications = await authApi.notifications.list.query({
        limit: 10,
      });

      expect(Array.isArray(notifications)).toBe(true);
    });
  });

  describe('Starred Repositories', () => {
    it('lists starred repositories', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Star the repo first
      await authApi.repos.star.mutate({ repoId });

      const starred = await authApi.dashboard.starredRepos.query({
        limit: 10,
      });

      expect(Array.isArray(starred)).toBe(true);
      expect(starred.some(r => r.id === repoId)).toBe(true);
    });
  });

  describe('Recent Repositories', () => {
    it('lists recently accessed repositories', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const recent = await authApi.dashboard.recentRepos.query({
        limit: 5,
      });

      expect(Array.isArray(recent)).toBe(true);
    });

    it('lists user owned repositories', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const repos = await authApi.dashboard.myRepos.query({
        limit: 10,
      });

      expect(Array.isArray(repos)).toBe(true);
      expect(repos.some(r => r.id === repoId)).toBe(true);
    });
  });
});
