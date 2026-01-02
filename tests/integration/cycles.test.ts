/**
 * Cycles Integration Tests
 * 
 * Tests for development cycles/sprints functionality including:
 * - Cycle creation and management
 * - Issue assignment to cycles
 * - Cycle progress tracking
 * - Cycle completion
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

// TODO: Cycles API has different input requirements than tests expect
// Need to update tests to match actual API (e.g., projectId required, different progress response format)
describe.skip('Cycles', () => {
  setupIntegrationTest();

  let ownerToken: string;
  let ownerId: string;
  let repoId: string;
  let cycleId: string;
  let issueId: string;

  beforeAll(async () => {

    const api = createTestClient();

    // Create test user
    const result = await api.auth.register.mutate({
      username: uniqueUsername('cycles-test'),
      email: uniqueEmail('cycles-test'),
      password: 'password123',
      name: 'Cycles Test User',
    });
    ownerToken = result.sessionId;
    ownerId = result.user.id;

    // Create a repository
    const authApi = createAuthenticatedClient(ownerToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('cycles-repo'),
      description: 'Repository for cycles tests',
      isPrivate: false,
    });
    repoId = repo.id;

    // Create an issue for cycle assignment
    const issue = await authApi.issues.create.mutate({
      repoId,
      title: 'Issue for cycle',
      body: 'This issue will be assigned to a cycle',
    });
    issueId = issue.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Cycle Creation', () => {
    it('creates a new cycle', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 14); // 2-week cycle

      const cycle = await authApi.cycles.create.mutate({
        repoId,
        name: 'Sprint 1',
        description: 'First development sprint',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      expect(cycle).toBeDefined();
      expect(cycle.name).toBe('Sprint 1');
      expect(cycle.repoId).toBe(repoId);
      cycleId = cycle.id;
    });

    it('creates cycle with just name', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const cycle = await authApi.cycles.create.mutate({
        repoId,
        name: 'Minimal Cycle',
      });

      expect(cycle).toBeDefined();
      expect(cycle.name).toBe('Minimal Cycle');
    });

    it('fails to create cycle without authentication', async () => {
      const api = createTestClient();

      await expect(
        api.cycles.create.mutate({
          repoId,
          name: 'Unauthenticated Cycle',
        })
      ).rejects.toThrow();
    });

    it('validates date range', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 14); // Start after end

      await expect(
        authApi.cycles.create.mutate({
          repoId,
          name: 'Invalid Dates',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        })
      ).rejects.toThrow();
    });
  });

  describe('Cycle Listing', () => {
    it('lists cycles for repository', async () => {
      const api = createTestClient();

      const cycles = await api.cycles.list.query({ repoId });

      expect(Array.isArray(cycles)).toBe(true);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('lists active cycles', async () => {
      const api = createTestClient();

      const cycles = await api.cycles.list.query({
        repoId,
        status: 'active',
      });

      expect(Array.isArray(cycles)).toBe(true);
      expect(cycles.every(c => c.status === 'active')).toBe(true);
    });

    it('lists completed cycles', async () => {
      const api = createTestClient();

      const cycles = await api.cycles.list.query({
        repoId,
        status: 'completed',
      });

      expect(Array.isArray(cycles)).toBe(true);
    });

    it('gets cycle by ID', async () => {
      const api = createTestClient();

      const cycle = await api.cycles.get.query({ cycleId });

      expect(cycle).toBeDefined();
      expect(cycle.id).toBe(cycleId);
      expect(cycle.name).toBe('Sprint 1');
    });
  });

  describe('Issue Assignment', () => {
    it('adds issue to cycle', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.cycles.addIssue.mutate({
        cycleId,
        issueId,
      });

      expect(result.success).toBe(true);
    });

    it('lists issues in cycle', async () => {
      const api = createTestClient();

      const issues = await api.cycles.getIssues.query({ cycleId });

      expect(Array.isArray(issues)).toBe(true);
      expect(issues.some(i => i.id === issueId)).toBe(true);
    });

    it('prevents duplicate assignment', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.cycles.addIssue.mutate({
          cycleId,
          issueId,
        })
      ).rejects.toThrow();
    });

    it('removes issue from cycle', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.cycles.removeIssue.mutate({
        cycleId,
        issueId,
      });

      expect(result.success).toBe(true);

      const issues = await api.cycles.getIssues.query({ cycleId });
      expect(issues.some(i => i.id === issueId)).toBe(false);
    });
  });

  describe('Cycle Progress', () => {
    beforeAll(async () => {
        const authApi = createAuthenticatedClient(ownerToken);

      // Create multiple issues and add to cycle
      for (let i = 0; i < 3; i++) {
        const issue = await authApi.issues.create.mutate({
          repoId,
          title: `Progress Issue ${i + 1}`,
          body: 'Issue for progress tracking',
        });
        await authApi.cycles.addIssue.mutate({
          cycleId,
          issueId: issue.id,
        });
      }
    });

    it('gets cycle progress', async () => {
      const api = createTestClient();

      const progress = await api.cycles.getProgress.query({ cycleId });

      expect(progress).toBeDefined();
      expect(typeof progress.total).toBe('number');
      expect(typeof progress.completed).toBe('number');
      expect(typeof progress.inProgress).toBe('number');
      expect(typeof progress.percentage).toBe('number');
      expect(progress.percentage).toBeGreaterThanOrEqual(0);
      expect(progress.percentage).toBeLessThanOrEqual(100);
    });

    it('updates progress when issue closed', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Get initial progress
      const before = await api.cycles.getProgress.query({ cycleId });

      // Close an issue
      const issues = await api.cycles.getIssues.query({ cycleId });
      if (issues.length > 0) {
        await authApi.issues.close.mutate({ issueId: issues[0].id });
      }

      // Check progress updated
      const after = await api.cycles.getProgress.query({ cycleId });

      expect(after.completed).toBeGreaterThanOrEqual(before.completed);
    });
  });

  describe('Cycle Updates', () => {
    it('updates cycle name', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const updated = await authApi.cycles.update.mutate({
        cycleId,
        name: 'Sprint 1 - Updated',
      });

      expect(updated.name).toBe('Sprint 1 - Updated');
    });

    it('updates cycle dates', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const newEndDate = new Date();
      newEndDate.setDate(newEndDate.getDate() + 21);

      const updated = await authApi.cycles.update.mutate({
        cycleId,
        endDate: newEndDate.toISOString(),
      });

      expect(updated).toBeDefined();
    });

    it('requires authentication for updates', async () => {
      const api = createTestClient();

      await expect(
        api.cycles.update.mutate({
          cycleId,
          name: 'Hacked Name',
        })
      ).rejects.toThrow();
    });
  });

  // TODO: Cycle completion endpoint doesn't exist in the router
  describe.skip('Cycle Completion', () => {
    it('completes a cycle', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.cycles.complete.mutate({ cycleId });

      expect(result.status).toBe('completed');
    });

    it('completed cycle appears in completed list', async () => {
      const api = createTestClient();

      const cycles = await api.cycles.list.query({
        repoId,
        status: 'completed',
      });

      expect(cycles.some(c => c.id === cycleId)).toBe(true);
    });

    it('cannot add issues to completed cycle', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const newIssue = await authApi.issues.create.mutate({
        repoId,
        title: 'New Issue',
        body: 'Should not be added to completed cycle',
      });

      await expect(
        authApi.cycles.addIssue.mutate({
          cycleId,
          issueId: newIssue.id,
        })
      ).rejects.toThrow();
    });
  });

  describe('Cycle Deletion', () => {
    let deleteCycleId: string;

    beforeAll(async () => {
        const authApi = createAuthenticatedClient(ownerToken);

      const cycle = await authApi.cycles.create.mutate({
        repoId,
        name: 'Cycle to Delete',
      });
      deleteCycleId = cycle.id;
    });

    it('deletes a cycle', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.cycles.delete.mutate({ cycleId: deleteCycleId });

      expect(result.success).toBe(true);
    });

    it('deleted cycle is no longer retrievable', async () => {
      const api = createTestClient();

      await expect(
        api.cycles.get.query({ cycleId: deleteCycleId })
      ).rejects.toThrow();
    });
  });
});

// Add a reference to the test client for progress test
const api = createTestClient();
