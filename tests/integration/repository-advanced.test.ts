/**
 * Repository Advanced Features Integration Tests
 * 
 * Tests for advanced repository features including:
 * - Forking
 * - Starring
 * - Watching
 * - Collaborator management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  startTestServer,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('Repository Advanced Features', () => {
  let ownerToken: string;
  let userToken: string;
  let ownerId: string;
  let userId: string;
  let ownerUsername: string;
  let userUsername: string;
  let baseRepoId: string;
  let baseRepoName: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create repo owner
    ownerUsername = uniqueUsername('repoowner');
    const ownerResult = await api.auth.register.mutate({
      username: ownerUsername,
      email: uniqueEmail('repoowner'),
      password: 'password123',
      name: 'Repo Owner',
    });
    ownerToken = ownerResult.sessionId;
    ownerId = ownerResult.user.id;

    // Create another user
    userUsername = uniqueUsername('repouser');
    const userResult = await api.auth.register.mutate({
      username: userUsername,
      email: uniqueEmail('repouser'),
      password: 'password123',
      name: 'Repo User',
    });
    userToken = userResult.sessionId;
    userId = userResult.user.id;

    // Create a base repository
    const ownerApi = createAuthenticatedClient(ownerToken);
    baseRepoName = uniqueRepoName('base-repo');
    const repo = await ownerApi.repos.create.mutate({
      name: baseRepoName,
      description: 'Base repo for advanced tests',
      isPrivate: false,
    });
    baseRepoId = repo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Repository Forking', () => {
    it('forks a public repository', async () => {
      const userApi = createAuthenticatedClient(userToken);
      const ownerApi = createAuthenticatedClient(ownerToken);

      // Create a fresh repo to fork
      const originalRepoName = uniqueRepoName('to-fork');
      const original = await ownerApi.repos.create.mutate({
        name: originalRepoName,
        description: 'Repo to be forked',
        isPrivate: false,
      });

      const fork = await userApi.repos.fork.mutate({
        repoId: original.id,
      });

      expect(fork).toBeDefined();
      expect(fork.forkedFromId).toBe(original.id);
      expect(fork.ownerId).toBe(userId);
    });

    it('forks with custom name', async () => {
      const userApi = createAuthenticatedClient(userToken);
      const ownerApi = createAuthenticatedClient(ownerToken);

      const original = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('fork-custom'),
        description: 'Repo to be forked with custom name',
        isPrivate: false,
      });

      const customName = uniqueRepoName('my-custom-fork');
      const fork = await userApi.repos.fork.mutate({
        repoId: original.id,
        name: customName,
      });

      expect(fork.name).toBe(customName);
    });

    it('checks if user can fork', async () => {
      const userApi = createAuthenticatedClient(userToken);
      const ownerApi = createAuthenticatedClient(ownerToken);

      const repo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('can-fork-check'),
        description: 'Check fork permission',
        isPrivate: false,
      });

      const result = await userApi.repos.canFork.query({ repoId: repo.id });

      expect(result.canFork).toBe(true);
    });

    it('fails to fork private repo without access', async () => {
      const userApi = createAuthenticatedClient(userToken);
      const ownerApi = createAuthenticatedClient(ownerToken);

      const privateRepo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('private-no-fork'),
        description: 'Private repo',
        isPrivate: true,
      });

      await expect(
        userApi.repos.fork.mutate({ repoId: privateRepo.id })
      ).rejects.toThrow();
    });

    it('lists forks of a repository', async () => {
      const api = createTestClient();
      const userApi = createAuthenticatedClient(userToken);
      const ownerApi = createAuthenticatedClient(ownerToken);

      const original = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('list-forks'),
        description: 'List forks test',
        isPrivate: false,
      });

      await userApi.repos.fork.mutate({ repoId: original.id });

      const forks = await api.repos.forks.query({ repoId: original.id });

      expect(Array.isArray(forks)).toBe(true);
      expect(forks.length).toBe(1);
      expect(forks[0].forkedFromId).toBe(original.id);
    });
  });

  describe('Repository Starring', () => {
    let starRepoId: string;

    beforeEach(async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const repo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('star-test'),
        description: 'Starring test repo',
        isPrivate: false,
      });
      starRepoId = repo.id;
    });

    it('stars a repository', async () => {
      const userApi = createAuthenticatedClient(userToken);

      await userApi.repos.star.mutate({ repoId: starRepoId });

      const result = await userApi.repos.isStarred.query({ repoId: starRepoId });
      expect(result.starred).toBe(true);
    });

    it('unstars a repository', async () => {
      const userApi = createAuthenticatedClient(userToken);

      await userApi.repos.star.mutate({ repoId: starRepoId });
      await userApi.repos.unstar.mutate({ repoId: starRepoId });

      const result = await userApi.repos.isStarred.query({ repoId: starRepoId });
      expect(result.starred).toBe(false);
    });

    it('checks if repository is starred', async () => {
      const userApi = createAuthenticatedClient(userToken);

      // Not starred initially
      const beforeStar = await userApi.repos.isStarred.query({ repoId: starRepoId });
      expect(beforeStar.starred).toBe(false);

      // Star it
      await userApi.repos.star.mutate({ repoId: starRepoId });

      // Now starred
      const afterStar = await userApi.repos.isStarred.query({ repoId: starRepoId });
      expect(afterStar.starred).toBe(true);
    });

    it('lists stargazers', async () => {
      const api = createTestClient();
      const userApi = createAuthenticatedClient(userToken);

      await userApi.repos.star.mutate({ repoId: starRepoId });

      const stargazers = await api.repos.stargazers.query({ repoId: starRepoId });

      expect(Array.isArray(stargazers)).toBe(true);
      expect(stargazers.some(s => s.id === userId)).toBe(true);
    });

    it('lists user starred repos', async () => {
      const api = createTestClient();
      const userApi = createAuthenticatedClient(userToken);

      await userApi.repos.star.mutate({ repoId: starRepoId });

      const starred = await api.users.stars.query({ username: userUsername });

      expect(Array.isArray(starred)).toBe(true);
      expect(starred.some(r => r.id === starRepoId)).toBe(true);
    });
  });

  describe('Repository Watching', () => {
    let watchRepoId: string;

    beforeEach(async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const repo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('watch-test'),
        description: 'Watching test repo',
        isPrivate: false,
      });
      watchRepoId = repo.id;
    });

    it('watches a repository', async () => {
      const userApi = createAuthenticatedClient(userToken);

      await userApi.repos.watch.mutate({ repoId: watchRepoId });

      const result = await userApi.repos.isWatching.query({ repoId: watchRepoId });
      expect(result.watching).toBe(true);
    });

    it('unwatches a repository', async () => {
      const userApi = createAuthenticatedClient(userToken);

      await userApi.repos.watch.mutate({ repoId: watchRepoId });
      await userApi.repos.unwatch.mutate({ repoId: watchRepoId });

      const result = await userApi.repos.isWatching.query({ repoId: watchRepoId });
      expect(result.watching).toBe(false);
    });

    it('checks if repository is watched', async () => {
      const userApi = createAuthenticatedClient(userToken);

      const beforeWatch = await userApi.repos.isWatching.query({ repoId: watchRepoId });
      expect(beforeWatch.watching).toBe(false);

      await userApi.repos.watch.mutate({ repoId: watchRepoId });

      const afterWatch = await userApi.repos.isWatching.query({ repoId: watchRepoId });
      expect(afterWatch.watching).toBe(true);
    });

    it('lists watchers', async () => {
      const api = createTestClient();
      const userApi = createAuthenticatedClient(userToken);

      await userApi.repos.watch.mutate({ repoId: watchRepoId });

      const watchers = await api.repos.watchers.query({ repoId: watchRepoId });

      expect(Array.isArray(watchers)).toBe(true);
      expect(watchers.some(w => w.id === userId)).toBe(true);
    });
  });

  describe('Collaborator Management', () => {
    let collabRepoId: string;

    beforeEach(async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const repo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('collab-test'),
        description: 'Collaborator test repo',
        isPrivate: false,
      });
      collabRepoId = repo.id;
    });

    it('adds collaborator with read permission', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);

      await ownerApi.repos.addCollaborator.mutate({
        repoId: collabRepoId,
        userId: userId,
        permission: 'read',
      });

      const collaborators = await ownerApi.repos.collaborators.query({
        repoId: collabRepoId,
      });

      expect(collaborators.some(c => c.userId === userId && c.permission === 'read')).toBe(true);
    });

    it('adds collaborator with write permission', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);

      await ownerApi.repos.addCollaborator.mutate({
        repoId: collabRepoId,
        userId: userId,
        permission: 'write',
      });

      const collaborators = await ownerApi.repos.collaborators.query({
        repoId: collabRepoId,
      });

      expect(collaborators.some(c => c.userId === userId && c.permission === 'write')).toBe(true);
    });

    it('adds collaborator with admin permission', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);

      await ownerApi.repos.addCollaborator.mutate({
        repoId: collabRepoId,
        userId: userId,
        permission: 'admin',
      });

      const collaborators = await ownerApi.repos.collaborators.query({
        repoId: collabRepoId,
      });

      expect(collaborators.some(c => c.userId === userId && c.permission === 'admin')).toBe(true);
    });

    it('removes collaborator', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);

      await ownerApi.repos.addCollaborator.mutate({
        repoId: collabRepoId,
        userId: userId,
        permission: 'write',
      });

      await ownerApi.repos.removeCollaborator.mutate({
        repoId: collabRepoId,
        userId: userId,
      });

      const collaborators = await ownerApi.repos.collaborators.query({
        repoId: collabRepoId,
      });

      expect(collaborators.some(c => c.userId === userId)).toBe(false);
    });

    it('lists collaborators', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);

      await ownerApi.repos.addCollaborator.mutate({
        repoId: collabRepoId,
        userId: userId,
        permission: 'write',
      });

      const collaborators = await ownerApi.repos.collaborators.query({
        repoId: collabRepoId,
      });

      expect(Array.isArray(collaborators)).toBe(true);
      expect(collaborators.length).toBeGreaterThan(0);
    });

    it('fails to add collaborator without permission', async () => {
      const userApi = createAuthenticatedClient(userToken);

      await expect(
        userApi.repos.addCollaborator.mutate({
          repoId: collabRepoId,
          userId: ownerId,
          permission: 'write',
        })
      ).rejects.toThrow();
    });

    it('collaborator can access private repo', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const userApi = createAuthenticatedClient(userToken);

      // Create private repo
      const privateRepo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('private-collab'),
        description: 'Private collab test',
        isPrivate: true,
      });

      // User cannot access initially
      await expect(
        userApi.repos.get.query({ owner: ownerUsername, repo: privateRepo.name })
      ).rejects.toThrow();

      // Add as collaborator
      await ownerApi.repos.addCollaborator.mutate({
        repoId: privateRepo.id,
        userId: userId,
        permission: 'read',
      });

      // Now user can access
      const result = await userApi.repos.get.query({
        owner: ownerUsername,
        repo: privateRepo.name,
      });
      expect(result.repo.id).toBe(privateRepo.id);
    });
  });

  describe('Repository Search', () => {
    it('searches repositories by name', async () => {
      const api = createTestClient();
      const ownerApi = createAuthenticatedClient(ownerToken);

      const searchTerm = `searchable-${Date.now()}`;
      await ownerApi.repos.create.mutate({
        name: searchTerm,
        description: 'Searchable repo',
        isPrivate: false,
      });

      const results = await api.repos.search.query({
        query: searchTerm,
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.some(r => r.name === searchTerm)).toBe(true);
    });

    it('searches repositories by description', async () => {
      const api = createTestClient();
      const ownerApi = createAuthenticatedClient(ownerToken);

      const searchTerm = `unique-description-${Date.now()}`;
      await ownerApi.repos.create.mutate({
        name: uniqueRepoName('desc-search'),
        description: searchTerm,
        isPrivate: false,
      });

      const results = await api.repos.search.query({
        query: searchTerm,
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.some(r => r.description?.includes(searchTerm))).toBe(true);
    });

    it('does not return private repos in search', async () => {
      const api = createTestClient();
      const ownerApi = createAuthenticatedClient(ownerToken);

      const searchTerm = `private-search-${Date.now()}`;
      await ownerApi.repos.create.mutate({
        name: searchTerm,
        description: 'Private searchable repo',
        isPrivate: true,
      });

      const results = await api.repos.search.query({
        query: searchTerm,
        limit: 10,
      });

      expect(results.some(r => r.name === searchTerm)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('fails to star non-existent repository', async () => {
      const userApi = createAuthenticatedClient(userToken);

      await expect(
        userApi.repos.star.mutate({ repoId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow();
    });

    it('fails to fork non-existent repository', async () => {
      const userApi = createAuthenticatedClient(userToken);

      await expect(
        userApi.repos.fork.mutate({ repoId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow();
    });

    it('handles double starring gracefully', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const userApi = createAuthenticatedClient(userToken);

      const repo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('double-star'),
        description: 'Double star test',
        isPrivate: false,
      });

      await userApi.repos.star.mutate({ repoId: repo.id });

      // Second star should either succeed silently or throw meaningful error
      try {
        await userApi.repos.star.mutate({ repoId: repo.id });
        // If it succeeds, verify still starred
        const result = await userApi.repos.isStarred.query({ repoId: repo.id });
        expect(result.starred).toBe(true);
      } catch (error: any) {
        // If it throws, that's also acceptable
        expect(error.message).toBeDefined();
      }
    });
  });
});
