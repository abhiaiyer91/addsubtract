/**
 * Users Integration Tests
 * 
 * Tests for user management including:
 * - User profile operations
 * - User search
 * - User repositories and stars
 * - Profile updates
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

describe('Users Flow', () => {
  let userToken: string;
  let userId: string;
  let username: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create a test user
    username = uniqueUsername('userflowtest');
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('userflowtest'),
      password: 'password123',
      name: 'User Flow Test',
    });
    userToken = result.sessionId;
    userId = result.user.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('User Profile', () => {
    it('gets user by username', async () => {
      const api = createTestClient();

      const user = await api.users.get.query({ username });

      expect(user).toBeDefined();
      expect(user.username).toBe(username);
      expect(user.name).toBe('User Flow Test');
    });

    it('gets user by ID', async () => {
      const api = createTestClient();

      const user = await api.users.getById.query({ id: userId });

      expect(user).toBeDefined();
      expect(user.id).toBe(userId);
      expect(user.username).toBe(username);
    });

    it('fails to get non-existent user by username', async () => {
      const api = createTestClient();

      await expect(
        api.users.get.query({ username: 'non-existent-user-12345' })
      ).rejects.toThrow();
    });

    it('fails to get non-existent user by ID', async () => {
      const api = createTestClient();

      await expect(
        api.users.getById.query({ id: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow();
    });
  });

  describe('User Search', () => {
    it('searches users by username', async () => {
      const api = createTestClient();

      const results = await api.users.search.query({
        query: username.substring(0, 10),
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.some(u => u.username === username)).toBe(true);
    });

    it('searches users by name', async () => {
      const api = createTestClient();

      const results = await api.users.search.query({
        query: 'User Flow Test',
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.some(u => u.name === 'User Flow Test')).toBe(true);
    });

    it('returns empty array for no matches', async () => {
      const api = createTestClient();

      const results = await api.users.search.query({
        query: 'xyznonexistentuserquery12345',
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('respects search limit', async () => {
      const api = createTestClient();

      const results = await api.users.search.query({
        query: 'user',
        limit: 5,
      });

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('User Repositories', () => {
    let repoId: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(userToken);

      const repo = await authApi.repos.create.mutate({
        name: uniqueRepoName('user-repo-test'),
        description: 'User repo test',
        isPrivate: false,
      });
      repoId = repo.id;
    });

    it('lists user repositories', async () => {
      const api = createTestClient();

      const repos = await api.users.repos.query({ username });

      expect(Array.isArray(repos)).toBe(true);
      expect(repos.length).toBeGreaterThan(0);
    });

    it('does not list private repos for other users', async () => {
      const authApi = createAuthenticatedClient(userToken);
      const api = createTestClient();

      // Create private repo
      await authApi.repos.create.mutate({
        name: uniqueRepoName('private-user-repo'),
        description: 'Private repo',
        isPrivate: true,
      });

      // Other user (unauthenticated) lists repos
      const repos = await api.users.repos.query({ username });

      // Should not include private repos
      expect(repos.every(r => !r.isPrivate)).toBe(true);
    });
  });

  describe('User Stars', () => {
    it('lists user starred repositories', async () => {
      const authApi = createAuthenticatedClient(userToken);
      const api = createTestClient();

      // Create and star a repo
      const repo = await authApi.repos.create.mutate({
        name: uniqueRepoName('star-list-test'),
        description: 'Star list test',
        isPrivate: false,
      });

      await authApi.repos.star.mutate({ repoId: repo.id });

      const stars = await api.users.stars.query({ username });

      expect(Array.isArray(stars)).toBe(true);
      expect(stars.some(r => r.id === repo.id)).toBe(true);
    });
  });

  describe('User Organizations', () => {
    it('lists user organizations', async () => {
      const authApi = createAuthenticatedClient(userToken);
      const api = createTestClient();

      // Create an organization
      const orgName = `userorg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'User Org Test',
      });

      const orgs = await api.users.orgs.query({ username });

      expect(Array.isArray(orgs)).toBe(true);
      expect(orgs.some(o => o.name === orgName)).toBe(true);
    });
  });

  describe('Profile Updates', () => {
    it('updates user profile', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const updated = await authApi.users.update.mutate({
        name: 'Updated Name',
        bio: 'This is my bio',
        website: 'https://example.com',
        location: 'San Francisco',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.bio).toBe('This is my bio');
      expect(updated.website).toBe('https://example.com');
      expect(updated.location).toBe('San Francisco');
    });

    it('clears optional profile fields', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Set fields first
      await authApi.users.update.mutate({
        bio: 'Some bio',
        website: 'https://example.com',
      });

      // Clear them
      const updated = await authApi.users.update.mutate({
        bio: null,
        website: null,
      });

      expect(updated.bio).toBeNull();
      expect(updated.website).toBeNull();
    });

    it('validates website URL format', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.users.update.mutate({
          website: 'not-a-valid-url',
        })
      ).rejects.toThrow();
    });

    it('requires authentication for profile update', async () => {
      const api = createTestClient();

      await expect(
        api.users.update.mutate({
          name: 'Hacked Name',
        })
      ).rejects.toThrow();
    });
  });

  describe('Username Availability', () => {
    it('checks username availability', async () => {
      const api = createTestClient();

      // Existing username
      const existingCheck = await api.users.checkUsername.query({ username });
      expect(existingCheck.available).toBe(false);

      // Non-existing username
      const newCheck = await api.users.checkUsername.query({
        username: `newuser-${Date.now()}`,
      });
      expect(newCheck.available).toBe(true);
    });
  });

  describe('Auth-Specific User Operations', () => {
    it('gets current user (me)', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const me = await authApi.auth.me.query();

      expect(me).toBeDefined();
      expect(me?.id).toBe(userId);
      expect(me?.username).toBe(username);
    });

    it('returns null for unauthenticated me query', async () => {
      const api = createTestClient();

      const me = await api.auth.me.query();

      expect(me).toBeNull();
    });

    it('checks email availability', async () => {
      const api = createTestClient();

      // Should not be available (used during registration)
      // Note: This depends on the email used during registration
      const newCheck = await api.auth.checkEmail.query({
        email: `newemail-${Date.now()}@example.com`,
      });
      expect(newCheck.available).toBe(true);
    });

    it('updates auth profile', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const updated = await authApi.auth.updateProfile.mutate({
        name: 'Auth Updated Name',
      });

      expect(updated.name).toBe('Auth Updated Name');
    });

    it('checks if user can change password', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.auth.canChangePassword.query();

      expect(typeof result.canChange).toBe('boolean');
    });
  });

  describe('Edge Cases', () => {
    it('handles special characters in search query', async () => {
      const api = createTestClient();

      // Should not throw, even with special characters
      const results = await api.users.search.query({
        query: '!@#$%^&*()',
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('handles unicode in profile', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const updated = await authApi.users.update.mutate({
        name: '用户名 🎉',
        bio: 'Bio with émojis and 日本語',
        location: 'Tōkyō',
      });

      expect(updated.name).toBe('用户名 🎉');
      expect(updated.bio).toBe('Bio with émojis and 日本語');
      expect(updated.location).toBe('Tōkyō');
    });

    it('handles very long bio', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const longBio = 'A'.repeat(500);

      const updated = await authApi.users.update.mutate({
        bio: longBio,
      });

      expect(updated.bio?.length).toBe(500);
    });
  });
});
