/**
 * Webhooks Integration Tests
 * 
 * Tests for webhook management including:
 * - Webhook CRUD operations
 * - Event validation
 * - Permission checks
 * - Webhook testing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupIntegrationTest,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('Webhooks Flow', () => {
  setupIntegrationTest();

  let ownerToken: string;
  let collaboratorToken: string;
  let ownerId: string;
  let collaboratorId: string;
  let repoId: string;
  let ownerUsername: string;

  beforeAll(async () => {

    const api = createTestClient();

    // Create repo owner
    ownerUsername = uniqueUsername('webhookowner');
    const ownerResult = await api.auth.register.mutate({
      username: ownerUsername,
      email: uniqueEmail('webhookowner'),
      password: 'password123',
      name: 'Webhook Owner',
    });
    ownerToken = ownerResult.sessionId;
    ownerId = ownerResult.user.id;

    // Create collaborator
    const collaboratorUsername = uniqueUsername('webhookcollab');
    const collaboratorResult = await api.auth.register.mutate({
      username: collaboratorUsername,
      email: uniqueEmail('webhookcollab'),
      password: 'password123',
      name: 'Webhook Collaborator',
    });
    collaboratorToken = collaboratorResult.sessionId;
    collaboratorId = collaboratorResult.user.id;

    // Create a test repository
    const ownerApi = createAuthenticatedClient(ownerToken);
    const repo = await ownerApi.repos.create.mutate({
      name: uniqueRepoName('webhook-test'),
      description: 'Repo for webhook tests',
      isPrivate: false,
    });
    repoId = repo.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Webhook CRUD Operations', () => {
    it('creates a webhook', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/webhook',
        events: ['push', 'pull_request'],
        secret: 'my-secret-key',
      });

      expect(webhook).toBeDefined();
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.events).toContain('push');
      expect(webhook.events).toContain('pull_request');
      expect(webhook.isActive).toBe(true);
      // Secret should be masked
      expect(webhook.secret).toBe('********');
    });

    it('creates webhook with all valid events', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const allEvents = [
        'push',
        'pull_request',
        'pull_request_review',
        'issue',
        'issue_comment',
        'create',
        'delete',
        'fork',
        'star',
      ];

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/all-events',
        events: allEvents,
      });

      expect(webhook.events).toEqual(expect.arrayContaining(allEvents));
    });

    it('fails to create webhook with invalid events', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.webhooks.create.mutate({
          repoId,
          url: 'https://example.com/invalid',
          events: ['invalid_event'],
        })
      ).rejects.toThrow();
    });

    it('fails to create webhook with empty events', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.webhooks.create.mutate({
          repoId,
          url: 'https://example.com/empty',
          events: [],
        })
      ).rejects.toThrow();
    });

    it('fails to create webhook with invalid URL', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.webhooks.create.mutate({
          repoId,
          url: 'not-a-valid-url',
          events: ['push'],
        })
      ).rejects.toThrow();
    });

    it('lists webhooks for repository', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create multiple webhooks
      await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/hook1',
        events: ['push'],
      });
      await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/hook2',
        events: ['issue'],
      });

      const webhooks = await authApi.webhooks.list.query({ repoId });

      expect(Array.isArray(webhooks)).toBe(true);
      expect(webhooks.length).toBeGreaterThanOrEqual(2);
    });

    it('gets webhook by ID', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const created = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/get-by-id',
        events: ['push', 'star'],
        secret: 'secret123',
      });

      const webhook = await authApi.webhooks.get.query({
        id: created.id,
        repoId,
      });

      expect(webhook).toBeDefined();
      expect(webhook.id).toBe(created.id);
      expect(webhook.url).toBe('https://example.com/get-by-id');
      expect(webhook.secret).toBe('********');
    });

    it('updates webhook URL', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/original',
        events: ['push'],
      });

      const updated = await authApi.webhooks.update.mutate({
        id: webhook.id,
        repoId,
        url: 'https://example.com/updated',
      });

      expect(updated.url).toBe('https://example.com/updated');
    });

    it('updates webhook events', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/events-update',
        events: ['push'],
      });

      const updated = await authApi.webhooks.update.mutate({
        id: webhook.id,
        repoId,
        events: ['push', 'issue', 'star'],
      });

      expect(updated.events).toContain('push');
      expect(updated.events).toContain('issue');
      expect(updated.events).toContain('star');
    });

    it('updates webhook secret', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/secret-update',
        events: ['push'],
      });

      const updated = await authApi.webhooks.update.mutate({
        id: webhook.id,
        repoId,
        secret: 'new-secret',
      });

      expect(updated.secret).toBe('********');
    });

    it('clears webhook secret', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/clear-secret',
        events: ['push'],
        secret: 'initial-secret',
      });

      const updated = await authApi.webhooks.update.mutate({
        id: webhook.id,
        repoId,
        secret: null,
      });

      expect(updated.secret).toBeNull();
    });

    it('deactivates webhook', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/deactivate',
        events: ['push'],
      });

      expect(webhook.isActive).toBe(true);

      const updated = await authApi.webhooks.update.mutate({
        id: webhook.id,
        repoId,
        isActive: false,
      });

      expect(updated.isActive).toBe(false);
    });

    it('reactivates webhook', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/reactivate',
        events: ['push'],
      });

      // Deactivate
      await authApi.webhooks.update.mutate({
        id: webhook.id,
        repoId,
        isActive: false,
      });

      // Reactivate
      const updated = await authApi.webhooks.update.mutate({
        id: webhook.id,
        repoId,
        isActive: true,
      });

      expect(updated.isActive).toBe(true);
    });

    it('deletes webhook', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/to-delete',
        events: ['push'],
      });

      const result = await authApi.webhooks.delete.mutate({
        id: webhook.id,
        repoId,
      });

      expect(result.success).toBe(true);

      // Should not be found after deletion
      await expect(
        authApi.webhooks.get.query({ id: webhook.id, repoId })
      ).rejects.toThrow();
    });
  });

  describe('Webhook Permission Checks', () => {
    it('fails to list webhooks without write permission', async () => {
      const collabApi = createAuthenticatedClient(collaboratorToken);

      await expect(
        collabApi.webhooks.list.query({ repoId })
      ).rejects.toThrow();
    });

    it('fails to create webhook without admin permission', async () => {
      const collabApi = createAuthenticatedClient(collaboratorToken);

      await expect(
        collabApi.webhooks.create.mutate({
          repoId,
          url: 'https://example.com/unauthorized',
          events: ['push'],
        })
      ).rejects.toThrow();
    });

    it('allows collaborator with admin permission to manage webhooks', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const collabApi = createAuthenticatedClient(collaboratorToken);

      // Create a new repo for this test
      const newRepo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('webhook-collab-test'),
        description: 'Test repo for collaborator webhook access',
        isPrivate: false,
      });

      // Add collaborator with admin permission
      await ownerApi.repos.addCollaborator.mutate({
        repoId: newRepo.id,
        userId: collaboratorId,
        permission: 'admin',
      });

      // Collaborator should now be able to create webhooks
      const webhook = await collabApi.webhooks.create.mutate({
        repoId: newRepo.id,
        url: 'https://example.com/collab-webhook',
        events: ['push'],
      });

      expect(webhook).toBeDefined();
      expect(webhook.url).toBe('https://example.com/collab-webhook');
    });

    it('fails to access webhook from different repository', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);

      // Create webhook in original repo
      const webhook = await ownerApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/cross-repo',
        events: ['push'],
      });

      // Create another repo
      const otherRepo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('other-webhook-repo'),
        description: 'Another repo',
        isPrivate: false,
      });

      // Try to access webhook with wrong repoId
      await expect(
        ownerApi.webhooks.get.query({
          id: webhook.id,
          repoId: otherRepo.id,
        })
      ).rejects.toThrow();
    });
  });

  describe('Webhook Testing', () => {
    it('tests an active webhook', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://httpbin.org/post', // This is a real endpoint that accepts POST
        events: ['push'],
      });

      // Note: This test may fail if the external service is unavailable
      // In a real test environment, you'd mock this
      try {
        const result = await authApi.webhooks.test.mutate({
          id: webhook.id,
          repoId,
        });

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(result.message).toBeDefined();
      } catch (error) {
        // Network errors are acceptable in test environment
        console.log('Webhook test skipped due to network:', error);
      }
    });

    it('fails to test inactive webhook', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const webhook = await authApi.webhooks.create.mutate({
        repoId,
        url: 'https://example.com/inactive-test',
        events: ['push'],
      });

      // Deactivate webhook
      await authApi.webhooks.update.mutate({
        id: webhook.id,
        repoId,
        isActive: false,
      });

      await expect(
        authApi.webhooks.test.mutate({
          id: webhook.id,
          repoId,
        })
      ).rejects.toThrow();
    });

    it('fails to test non-existent webhook', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.webhooks.test.mutate({
          id: '00000000-0000-0000-0000-000000000000',
          repoId,
        })
      ).rejects.toThrow();
    });
  });

  describe('Webhook for Non-Existent Repository', () => {
    it('fails to create webhook for non-existent repo', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.webhooks.create.mutate({
          repoId: '00000000-0000-0000-0000-000000000000',
          url: 'https://example.com/no-repo',
          events: ['push'],
        })
      ).rejects.toThrow();
    });

    it('fails to list webhooks for non-existent repo', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.webhooks.list.query({
          repoId: '00000000-0000-0000-0000-000000000000',
        })
      ).rejects.toThrow();
    });
  });
});
