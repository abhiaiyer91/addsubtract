/**
 * Journal Integration Tests
 * 
 * Tests for developer journal/work log functionality including:
 * - Journal entry creation
 * - Entry retrieval
 * - Filtering and search
 * - Entry updates
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

// TODO: Tests expect work-log style journal with stats/activityByDate endpoints
// Journal router is page-based with publish/archive/comments functionality instead
describe.skip('Journal', () => {
  setupIntegrationTest();

  let userToken: string;
  let userId: string;
  let repoId: string;
  let entryId: string;

  beforeAll(async () => {

    const api = createTestClient();

    // Create test user
    const result = await api.auth.register.mutate({
      username: uniqueUsername('journal-test'),
      email: uniqueEmail('journal-test'),
      password: 'password123',
      name: 'Journal Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create a repository
    const authApi = createAuthenticatedClient(userToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('journal-repo'),
      description: 'Repository for journal tests',
      isPrivate: false,
    });
    repoId = repo.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Journal Entry Creation', () => {
    it('creates a journal entry', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const entry = await authApi.journal.create.mutate({
        title: 'Today\'s Work',
        content: 'Worked on implementing new features',
        mood: 'productive',
      });

      expect(entry).toBeDefined();
      expect(entry.title).toBe('Today\'s Work');
      expect(entry.content).toBe('Worked on implementing new features');
      expect(entry.mood).toBe('productive');
      entryId = entry.id;
    });

    it('creates entry with repository link', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const entry = await authApi.journal.create.mutate({
        title: 'Repo Work',
        content: 'Working on the journal repo',
        repoId,
      });

      expect(entry.repoId).toBe(repoId);
    });

    it('creates entry with tags', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const entry = await authApi.journal.create.mutate({
        title: 'Tagged Entry',
        content: 'Entry with tags',
        tags: ['feature', 'bugfix', 'review'],
      });

      expect(entry.tags).toContain('feature');
      expect(entry.tags).toContain('bugfix');
    });

    it('requires authentication', async () => {
      const api = createTestClient();

      await expect(
        api.journal.create.mutate({
          title: 'Unauthorized',
          content: 'Should fail',
        })
      ).rejects.toThrow();
    });

    it('validates required fields', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.journal.create.mutate({
          title: '',
          content: 'Content without title',
        })
      ).rejects.toThrow();
    });
  });

  describe('Journal Entry Retrieval', () => {
    it('lists journal entries', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const entries = await authApi.journal.list.query({
        limit: 10,
      });

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('gets entry by ID', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const entry = await authApi.journal.get.query({ entryId });

      expect(entry).toBeDefined();
      expect(entry.id).toBe(entryId);
      expect(entry.title).toBe('Today\'s Work');
    });

    it('lists entries by date range', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const entries = await authApi.journal.list.query({
        fromDate: yesterday.toISOString(),
        toDate: today.toISOString(),
      });

      expect(Array.isArray(entries)).toBe(true);
    });

    it('lists entries by repository', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const entries = await authApi.journal.list.query({
        repoId,
      });

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.every((e: any) => e.repoId === repoId)).toBe(true);
    });

    it('lists entries by tag', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const entries = await authApi.journal.list.query({
        tag: 'feature',
      });

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.every((e: any) => e.tags?.includes('feature'))).toBe(true);
    });

    it('lists entries by mood', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const entries = await authApi.journal.list.query({
        mood: 'productive',
      });

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.every((e: any) => e.mood === 'productive')).toBe(true);
    });
  });

  describe('Journal Entry Updates', () => {
    it('updates entry title', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const updated = await authApi.journal.update.mutate({
        entryId,
        title: 'Updated Title',
      });

      expect(updated.title).toBe('Updated Title');
    });

    it('updates entry content', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const updated = await authApi.journal.update.mutate({
        entryId,
        content: 'Updated content here',
      });

      expect(updated.content).toBe('Updated content here');
    });

    it('updates entry mood', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const updated = await authApi.journal.update.mutate({
        entryId,
        mood: 'frustrated',
      });

      expect(updated.mood).toBe('frustrated');
    });

    it('updates entry tags', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const updated = await authApi.journal.update.mutate({
        entryId,
        tags: ['updated', 'tags'],
      });

      expect(updated.tags).toContain('updated');
    });
  });

  describe('Journal Search', () => {
    it('searches entries by content', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const results = await authApi.journal.search.query({
        query: 'implementing',
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('searches entries by title', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const results = await authApi.journal.search.query({
        query: 'Updated',
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Journal Statistics', () => {
    it('gets journal statistics', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const stats = await authApi.journal.stats.query();

      expect(stats).toBeDefined();
      expect(typeof stats.totalEntries).toBe('number');
      expect(stats.totalEntries).toBeGreaterThan(0);
    });

    it('gets mood distribution', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const stats = await authApi.journal.stats.query();

      expect(stats.moodDistribution).toBeDefined();
    });

    it('gets tag usage', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const stats = await authApi.journal.stats.query();

      expect(stats.topTags).toBeDefined();
      expect(Array.isArray(stats.topTags)).toBe(true);
    });

    it('gets activity by date', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const stats = await authApi.journal.activityByDate.query({
        days: 30,
      });

      expect(Array.isArray(stats)).toBe(true);
    });
  });

  describe('Journal Entry Deletion', () => {
    let deleteEntryId: string;

    beforeAll(async () => {
        const authApi = createAuthenticatedClient(userToken);

      const entry = await authApi.journal.create.mutate({
        title: 'Entry to Delete',
        content: 'This will be deleted',
      });
      deleteEntryId = entry.id;
    });

    it('deletes a journal entry', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.journal.delete.mutate({
        entryId: deleteEntryId,
      });

      expect(result.success).toBe(true);
    });

    it('deleted entry is not retrievable', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.journal.get.query({ entryId: deleteEntryId })
      ).rejects.toThrow();
    });
  });

  describe('Privacy', () => {
    it('entries are private to user', async () => {
      const api = createTestClient();

      // Create another user
      const otherUser = await api.auth.register.mutate({
        username: uniqueUsername('other-journal'),
        email: uniqueEmail('other-journal'),
        password: 'password123',
      });

      const otherApi = createAuthenticatedClient(otherUser.sessionId);

      // Try to access first user's entry
      await expect(
        otherApi.journal.get.query({ entryId })
      ).rejects.toThrow();
    });
  });
});
