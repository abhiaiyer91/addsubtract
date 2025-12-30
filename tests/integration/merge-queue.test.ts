/**
 * Merge Queue Integration Tests
 * 
 * Tests for automated merge queue functionality including:
 * - Adding PRs to queue
 * - Queue ordering and priority
 * - Merge conditions and checks
 * - Queue status and management
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

describe('Merge Queue', () => {
  let ownerToken: string;
  let ownerId: string;
  let ownerUsername: string;
  let contributorToken: string;
  let contributorId: string;
  let repoId: string;
  let repoName: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create repo owner
    ownerUsername = uniqueUsername('mq-owner');
    const ownerResult = await api.auth.register.mutate({
      username: ownerUsername,
      email: uniqueEmail('mq-owner'),
      password: 'password123',
      name: 'Merge Queue Owner',
    });
    ownerToken = ownerResult.sessionId;
    ownerId = ownerResult.user.id;

    // Create contributor
    const contributorResult = await api.auth.register.mutate({
      username: uniqueUsername('mq-contributor'),
      email: uniqueEmail('mq-contributor'),
      password: 'password123',
      name: 'Merge Queue Contributor',
    });
    contributorToken = contributorResult.sessionId;
    contributorId = contributorResult.user.id;

    // Create repository with merge queue enabled
    const authApi = createAuthenticatedClient(ownerToken);
    repoName = uniqueRepoName('merge-queue-test');
    const repo = await authApi.repos.create.mutate({
      name: repoName,
      description: 'Repository for merge queue tests',
      isPrivate: false,
    });
    repoId = repo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Merge Queue Configuration', () => {
    it('enables merge queue for repository', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.mergeQueue.configure.mutate({
        repoId,
        enabled: true,
        requiredChecks: [],
        mergeMethod: 'squash',
      });

      expect(result.enabled).toBe(true);
      expect(result.mergeMethod).toBe('squash');
    });

    it('configures merge queue with required checks', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.mergeQueue.configure.mutate({
        repoId,
        enabled: true,
        requiredChecks: ['ci', 'lint'],
        mergeMethod: 'merge',
      });

      expect(result.enabled).toBe(true);
      expect(result.requiredChecks).toContain('ci');
      expect(result.requiredChecks).toContain('lint');
    });

    it('gets merge queue configuration', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const config = await authApi.mergeQueue.getConfig.query({ repoId });

      expect(config).toBeDefined();
      expect(typeof config.enabled).toBe('boolean');
      expect(Array.isArray(config.requiredChecks)).toBe(true);
    });

    it('disables merge queue', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.mergeQueue.configure.mutate({
        repoId,
        enabled: false,
      });

      expect(result.enabled).toBe(false);

      // Re-enable for further tests
      await authApi.mergeQueue.configure.mutate({
        repoId,
        enabled: true,
        requiredChecks: [],
        mergeMethod: 'squash',
      });
    });

    it('requires admin permissions to configure', async () => {
      const contributorApi = createAuthenticatedClient(contributorToken);

      await expect(
        contributorApi.mergeQueue.configure.mutate({
          repoId,
          enabled: true,
        })
      ).rejects.toThrow();
    });
  });

  describe('Adding PRs to Queue', () => {
    let prId: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const pr = await authApi.pulls.create.mutate({
        repoId,
        title: 'Test PR for merge queue',
        body: 'This PR should be added to the merge queue',
        sourceBranch: 'feature-mq-1',
        targetBranch: 'main',
        headSha: 'e'.repeat(64),
        baseSha: 'f'.repeat(64),
        isDraft: false,
      });
      prId = pr.id;
    });

    it('adds PR to merge queue', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.mergeQueue.add.mutate({
        prId,
      });

      expect(result.success).toBe(true);
      expect(result.position).toBeGreaterThan(0);
    });

    it('shows PR position in queue', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const position = await authApi.mergeQueue.getPosition.query({ prId });

      expect(position).toBeDefined();
      expect(typeof position.position).toBe('number');
      expect(position.inQueue).toBe(true);
    });

    it('prevents duplicate queue additions', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.mergeQueue.add.mutate({ prId })
      ).rejects.toThrow();
    });

    it('removes PR from queue', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.mergeQueue.remove.mutate({ prId });

      expect(result.success).toBe(true);

      const position = await authApi.mergeQueue.getPosition.query({ prId });
      expect(position.inQueue).toBe(false);
    });
  });

  describe('Queue Ordering', () => {
    let pr1Id: string;
    let pr2Id: string;
    let pr3Id: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create multiple PRs
      const pr1 = await authApi.pulls.create.mutate({
        repoId,
        title: 'First PR',
        body: 'First in queue',
        sourceBranch: 'feature-order-1',
        targetBranch: 'main',
        headSha: 'g'.repeat(64),
        baseSha: 'h'.repeat(64),
        isDraft: false,
      });
      pr1Id = pr1.id;

      const pr2 = await authApi.pulls.create.mutate({
        repoId,
        title: 'Second PR',
        body: 'Second in queue',
        sourceBranch: 'feature-order-2',
        targetBranch: 'main',
        headSha: 'i'.repeat(64),
        baseSha: 'j'.repeat(64),
        isDraft: false,
      });
      pr2Id = pr2.id;

      const pr3 = await authApi.pulls.create.mutate({
        repoId,
        title: 'Third PR',
        body: 'Third in queue',
        sourceBranch: 'feature-order-3',
        targetBranch: 'main',
        headSha: 'k'.repeat(64),
        baseSha: 'l'.repeat(64),
        isDraft: false,
      });
      pr3Id = pr3.id;
    });

    it('maintains FIFO order', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Add PRs in order
      await authApi.mergeQueue.add.mutate({ prId: pr1Id });
      await authApi.mergeQueue.add.mutate({ prId: pr2Id });
      await authApi.mergeQueue.add.mutate({ prId: pr3Id });

      const pos1 = await authApi.mergeQueue.getPosition.query({ prId: pr1Id });
      const pos2 = await authApi.mergeQueue.getPosition.query({ prId: pr2Id });
      const pos3 = await authApi.mergeQueue.getPosition.query({ prId: pr3Id });

      expect(pos1.position).toBeLessThan(pos2.position);
      expect(pos2.position).toBeLessThan(pos3.position);
    });

    it('lists queue in order', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const queue = await authApi.mergeQueue.list.query({ repoId });

      expect(Array.isArray(queue)).toBe(true);
      expect(queue.length).toBeGreaterThanOrEqual(3);

      // Check ordering
      for (let i = 1; i < queue.length; i++) {
        expect(queue[i].position).toBeGreaterThan(queue[i - 1].position);
      }
    });

    it('updates positions when PR removed', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const posBefore = await authApi.mergeQueue.getPosition.query({ prId: pr3Id });

      // Remove second PR
      await authApi.mergeQueue.remove.mutate({ prId: pr2Id });

      const posAfter = await authApi.mergeQueue.getPosition.query({ prId: pr3Id });

      // Third PR should have moved up
      expect(posAfter.position).toBeLessThan(posBefore.position);
    });

    afterAll(async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      // Clean up queue
      try {
        await authApi.mergeQueue.remove.mutate({ prId: pr1Id });
        await authApi.mergeQueue.remove.mutate({ prId: pr3Id });
      } catch (e) {
        // Ignore if already removed
      }
    });
  });

  describe('Queue Status', () => {
    it('gets queue status for repository', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const status = await authApi.mergeQueue.status.query({ repoId });

      expect(status).toBeDefined();
      expect(typeof status.queueLength).toBe('number');
      expect(typeof status.processing).toBe('boolean');
    });

    it('shows empty queue status', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create a new repo with empty queue
      const newRepo = await authApi.repos.create.mutate({
        name: uniqueRepoName('empty-queue'),
        description: 'Empty queue test',
        isPrivate: false,
      });

      await authApi.mergeQueue.configure.mutate({
        repoId: newRepo.id,
        enabled: true,
      });

      const status = await authApi.mergeQueue.status.query({ repoId: newRepo.id });

      expect(status.queueLength).toBe(0);
    });
  });

  describe('Merge Queue Permissions', () => {
    let prId: string;

    beforeAll(async () => {
      const contributorApi = createAuthenticatedClient(contributorToken);

      // Add contributor to repo
      const authApi = createAuthenticatedClient(ownerToken);
      await authApi.repos.addCollaborator.mutate({
        repoId,
        username: await contributorApi.auth.me.query().then(u => u?.username || ''),
        permission: 'write',
      });

      // Contributor creates a PR
      const pr = await contributorApi.pulls.create.mutate({
        repoId,
        title: 'Contributor PR',
        body: 'PR from contributor',
        sourceBranch: 'contributor-feature',
        targetBranch: 'main',
        headSha: 'm'.repeat(64),
        baseSha: 'n'.repeat(64),
        isDraft: false,
      });
      prId = pr.id;
    });

    it('allows contributor to add their PR to queue', async () => {
      const contributorApi = createAuthenticatedClient(contributorToken);

      const result = await contributorApi.mergeQueue.add.mutate({ prId });

      expect(result.success).toBe(true);
    });

    it('allows owner to remove contributor PR from queue', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.mergeQueue.remove.mutate({ prId });

      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('handles adding closed PR to queue', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create and close a PR
      const pr = await authApi.pulls.create.mutate({
        repoId,
        title: 'Closed PR',
        body: 'This will be closed',
        sourceBranch: 'closed-branch',
        targetBranch: 'main',
        headSha: 'o'.repeat(64),
        baseSha: 'p'.repeat(64),
        isDraft: false,
      });

      await authApi.pulls.close.mutate({ prId: pr.id });

      // Should fail to add closed PR
      await expect(
        authApi.mergeQueue.add.mutate({ prId: pr.id })
      ).rejects.toThrow();
    });

    it('handles draft PR', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create draft PR
      const pr = await authApi.pulls.create.mutate({
        repoId,
        title: 'Draft PR',
        body: 'This is a draft',
        sourceBranch: 'draft-branch',
        targetBranch: 'main',
        headSha: 'q'.repeat(64),
        baseSha: 'r'.repeat(64),
        isDraft: true,
      });

      // Should fail to add draft PR
      await expect(
        authApi.mergeQueue.add.mutate({ prId: pr.id })
      ).rejects.toThrow();
    });

    it('handles non-existent PR', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.mergeQueue.add.mutate({ prId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow();
    });
  });
});
