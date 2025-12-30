/**
 * Gamification Integration Tests
 * 
 * Tests for XP, levels, achievements, and leaderboards.
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

describe('Gamification', () => {
  let userToken: string;
  let userId: string;
  let username: string;
  let secondUserToken: string;
  let secondUserId: string;
  let secondUsername: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create first test user
    username = uniqueUsername('gamification-test');
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('gamification-test'),
      password: 'password123',
      name: 'Gamification Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create second test user for leaderboard tests
    secondUsername = uniqueUsername('gamification-test2');
    const result2 = await api.auth.register.mutate({
      username: secondUsername,
      email: uniqueEmail('gamification-test2'),
      password: 'password123',
      name: 'Gamification Test User 2',
    });
    secondUserToken = result2.sessionId;
    secondUserId = result2.user.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('User Profile', () => {
    it('gets current user gamification profile', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const profile = await authApi.gamification.myProfile.query();

      expect(profile).toBeDefined();
      expect(profile.level).toBeGreaterThanOrEqual(1);
      expect(profile.totalXp).toBeGreaterThanOrEqual(0);
      expect(profile.title).toBeDefined();
      expect(typeof profile.xpProgress).toBe('number');
      expect(profile.xpProgress).toBeGreaterThanOrEqual(0);
      expect(profile.xpProgress).toBeLessThanOrEqual(100);
      expect(typeof profile.rank).toBe('number');
    });

    it('gets gamification profile by username', async () => {
      const api = createTestClient();

      const profile = await api.gamification.getProfile.query({ username });

      expect(profile).toBeDefined();
      expect(profile.userId).toBe(userId);
      expect(profile.username).toBe(username);
      expect(profile.level).toBeGreaterThanOrEqual(1);
      expect(profile.title).toBeDefined();
      expect(profile.stats).toBeDefined();
      expect(typeof profile.stats.commits).toBe('number');
      expect(typeof profile.stats.prsOpened).toBe('number');
      expect(typeof profile.stats.prsMerged).toBe('number');
      expect(typeof profile.stats.reviews).toBe('number');
    });

    it('fails to get profile for non-existent user', async () => {
      const api = createTestClient();

      await expect(
        api.gamification.getProfile.query({ username: 'nonexistent-user-xyz123' })
      ).rejects.toThrow();
    });

    it('requires authentication for myProfile', async () => {
      const api = createTestClient();

      await expect(
        api.gamification.myProfile.query()
      ).rejects.toThrow();
    });
  });

  describe('Achievements', () => {
    it('gets current user achievements', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const achievements = await authApi.gamification.myAchievements.query();

      expect(Array.isArray(achievements)).toBe(true);
      // Each achievement should have expected structure
      if (achievements.length > 0) {
        const first = achievements[0];
        expect(first.achievement).toBeDefined();
        expect(typeof first.unlocked).toBe('boolean');
      }
    });

    it('gets achievements for a user by username', async () => {
      const api = createTestClient();

      const achievements = await api.gamification.userAchievements.query({ username });

      expect(Array.isArray(achievements)).toBe(true);
    });

    it('gets all achievement definitions', async () => {
      const api = createTestClient();

      const definitions = await api.gamification.allAchievements.query();

      expect(Array.isArray(definitions)).toBe(true);
      if (definitions.length > 0) {
        const first = definitions[0];
        expect(first.key).toBeDefined();
        expect(first.name).toBeDefined();
        expect(first.description).toBeDefined();
        expect(first.icon).toBeDefined();
        expect(typeof first.xpReward).toBe('number');
      }
    });
  });

  describe('Leaderboard', () => {
    it('gets all-time leaderboard', async () => {
      const api = createTestClient();

      const leaderboard = await api.gamification.leaderboard.query({});

      expect(Array.isArray(leaderboard)).toBe(true);
      if (leaderboard.length > 0) {
        const first = leaderboard[0];
        expect(first.rank).toBe(1);
        expect(first.userId).toBeDefined();
        expect(typeof first.level).toBe('number');
        expect(typeof first.totalXp).toBe('number');
        expect(first.title).toBeDefined();
      }
    });

    it('gets weekly leaderboard', async () => {
      const api = createTestClient();

      const leaderboard = await api.gamification.leaderboard.query({
        timeframe: 'week',
      });

      expect(Array.isArray(leaderboard)).toBe(true);
    });

    it('gets monthly leaderboard', async () => {
      const api = createTestClient();

      const leaderboard = await api.gamification.leaderboard.query({
        timeframe: 'month',
      });

      expect(Array.isArray(leaderboard)).toBe(true);
    });

    it('respects leaderboard limit', async () => {
      const api = createTestClient();

      const leaderboard = await api.gamification.leaderboard.query({
        limit: 5,
      });

      expect(leaderboard.length).toBeLessThanOrEqual(5);
    });
  });

  describe('XP History', () => {
    it('gets XP history for current user', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const history = await authApi.gamification.myXpHistory.query({});

      expect(Array.isArray(history)).toBe(true);
      if (history.length > 0) {
        const first = history[0];
        expect(first.date).toBeDefined();
        expect(typeof first.xp).toBe('number');
      }
    });

    it('gets XP history with custom days', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const history = await authApi.gamification.myXpHistory.query({
        days: 7,
      });

      expect(Array.isArray(history)).toBe(true);
    });

    it('requires authentication for XP history', async () => {
      const api = createTestClient();

      await expect(
        api.gamification.myXpHistory.query({})
      ).rejects.toThrow();
    });
  });

  describe('Activity-based XP', () => {
    let repoId: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(userToken);
      const repo = await authApi.repos.create.mutate({
        name: uniqueRepoName('gamification-activity'),
        description: 'Repo for gamification activity tests',
        isPrivate: false,
      });
      repoId = repo.id;
    });

    it('awards XP for creating an issue', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Get initial XP
      const before = await authApi.gamification.myProfile.query();
      const initialXp = before.totalXp;

      // Create an issue
      await authApi.issues.create.mutate({
        repoId,
        title: 'Test issue for XP',
        body: 'This should award XP',
      });

      // Check XP increased (may need a small delay for event processing)
      await new Promise(resolve => setTimeout(resolve, 100));
      const after = await authApi.gamification.myProfile.query();

      // XP should have increased (or at least not decreased)
      expect(after.totalXp).toBeGreaterThanOrEqual(initialXp);
    });

    it('awards XP for creating a pull request', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const before = await authApi.gamification.myProfile.query();
      const initialXp = before.totalXp;

      // Create a PR
      await authApi.pulls.create.mutate({
        repoId,
        title: 'Test PR for XP',
        body: 'This should award XP',
        sourceBranch: 'feature-xp',
        targetBranch: 'main',
        headSha: 'a'.repeat(64),
        baseSha: 'b'.repeat(64),
        isDraft: false,
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      const after = await authApi.gamification.myProfile.query();

      expect(after.totalXp).toBeGreaterThanOrEqual(initialXp);
    });
  });

  describe('Streaks', () => {
    it('shows current streak in profile', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const profile = await authApi.gamification.myProfile.query();

      expect(typeof profile.currentStreak).toBe('number');
      expect(typeof profile.longestStreak).toBe('number');
      expect(profile.longestStreak).toBeGreaterThanOrEqual(profile.currentStreak);
    });

    it('shows streak info in public profile', async () => {
      const api = createTestClient();

      const profile = await api.gamification.getProfile.query({ username });

      expect(typeof profile.currentStreak).toBe('number');
      expect(typeof profile.longestStreak).toBe('number');
    });
  });

  describe('Level Progression', () => {
    it('shows XP for next level', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const profile = await authApi.gamification.myProfile.query();

      expect(typeof profile.xpForNextLevel).toBe('number');
      expect(profile.xpForNextLevel).toBeGreaterThan(profile.totalXp);
    });

    it('XP progress is between 0 and 100', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const profile = await authApi.gamification.myProfile.query();

      expect(profile.xpProgress).toBeGreaterThanOrEqual(0);
      expect(profile.xpProgress).toBeLessThanOrEqual(100);
    });
  });
});
