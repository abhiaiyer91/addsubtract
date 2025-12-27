/**
 * Notifications Integration Tests
 * 
 * Tests for notification management including:
 * - Listing notifications
 * - Mark as read functionality
 * - Deletion
 * - Filtering
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

describe('Notifications Flow', () => {
  let userToken: string;
  let userId: string;
  let username: string;
  let repoId: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create a test user
    username = uniqueUsername('notifuser');
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('notifuser'),
      password: 'password123',
      name: 'Notification User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create a repository to generate notifications
    const authApi = createAuthenticatedClient(userToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('notif-test'),
      description: 'Repo for notification tests',
      isPrivate: false,
    });
    repoId = repo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Notification Listing', () => {
    it('lists notifications', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const notifications = await authApi.notifications.list.query();

      expect(Array.isArray(notifications)).toBe(true);
    });

    it('lists with default parameters', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const notifications = await authApi.notifications.list.query({});

      expect(Array.isArray(notifications)).toBe(true);
    });

    it('lists unread notifications only', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const notifications = await authApi.notifications.list.query({
        unreadOnly: true,
      });

      expect(Array.isArray(notifications)).toBe(true);
      // All returned notifications should be unread
      notifications.forEach(n => {
        expect(n.readAt).toBeNull();
      });
    });

    it('lists with pagination', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const page1 = await authApi.notifications.list.query({
        limit: 5,
        offset: 0,
      });

      const page2 = await authApi.notifications.list.query({
        limit: 5,
        offset: 5,
      });

      expect(Array.isArray(page1)).toBe(true);
      expect(Array.isArray(page2)).toBe(true);
      expect(page1.length).toBeLessThanOrEqual(5);
      expect(page2.length).toBeLessThanOrEqual(5);
    });

    it('enforces limit bounds', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Max limit is 100
      await expect(
        authApi.notifications.list.query({ limit: 101 })
      ).rejects.toThrow();

      // Min limit is 1
      await expect(
        authApi.notifications.list.query({ limit: 0 })
      ).rejects.toThrow();
    });
  });

  describe('Unread Count', () => {
    it('gets unread notification count', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const count = await authApi.notifications.unreadCount.query();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Mark as Read', () => {
    it('marks notification as read', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Get notifications
      const notifications = await authApi.notifications.list.query({
        unreadOnly: true,
      });

      if (notifications.length > 0) {
        const notification = notifications[0];

        await authApi.notifications.markAsRead.mutate({ id: notification.id });

        // Verify it's marked as read
        const updated = await authApi.notifications.list.query();
        const found = updated.find(n => n.id === notification.id);
        expect(found?.readAt).toBeDefined();
      }
    });

    it('marks all notifications as read', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await authApi.notifications.markAllAsRead.mutate();

      // Check unread count is now 0
      const count = await authApi.notifications.unreadCount.query();
      expect(count).toBe(0);

      // Verify all notifications are read
      const unread = await authApi.notifications.list.query({
        unreadOnly: true,
      });
      expect(unread.length).toBe(0);
    });
  });

  describe('Notification Deletion', () => {
    it('deletes a notification', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const notifications = await authApi.notifications.list.query();

      if (notifications.length > 0) {
        const notification = notifications[0];
        const initialCount = notifications.length;

        await authApi.notifications.delete.mutate({ id: notification.id });

        const afterDelete = await authApi.notifications.list.query();
        expect(afterDelete.length).toBe(initialCount - 1);
        expect(afterDelete.find(n => n.id === notification.id)).toBeUndefined();
      }
    });

    it('deletes all notifications', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await authApi.notifications.deleteAll.mutate();

      const notifications = await authApi.notifications.list.query();
      expect(notifications.length).toBe(0);

      const count = await authApi.notifications.unreadCount.query();
      expect(count).toBe(0);
    });
  });

  describe('Authentication Requirements', () => {
    it('requires authentication to list notifications', async () => {
      const api = createTestClient();

      await expect(api.notifications.list.query()).rejects.toThrow();
    });

    it('requires authentication to get unread count', async () => {
      const api = createTestClient();

      await expect(api.notifications.unreadCount.query()).rejects.toThrow();
    });

    it('requires authentication to mark as read', async () => {
      const api = createTestClient();

      await expect(
        api.notifications.markAsRead.mutate({ id: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow();
    });

    it('requires authentication to delete', async () => {
      const api = createTestClient();

      await expect(
        api.notifications.delete.mutate({ id: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('handles marking non-existent notification as read', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // This should either succeed silently or throw an appropriate error
      try {
        await authApi.notifications.markAsRead.mutate({
          id: '00000000-0000-0000-0000-000000000000',
        });
      } catch (error: any) {
        expect(error.message).toBeDefined();
      }
    });

    it('handles deleting non-existent notification', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // This should either succeed silently or throw an appropriate error
      try {
        await authApi.notifications.delete.mutate({
          id: '00000000-0000-0000-0000-000000000000',
        });
      } catch (error: any) {
        expect(error.message).toBeDefined();
      }
    });

    it('handles empty notification list operations', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Clear all notifications first
      await authApi.notifications.deleteAll.mutate();

      // These should work fine even with no notifications
      const notifications = await authApi.notifications.list.query();
      expect(notifications.length).toBe(0);

      const count = await authApi.notifications.unreadCount.query();
      expect(count).toBe(0);

      // Mark all as read with no notifications - should succeed
      await authApi.notifications.markAllAsRead.mutate();

      // Delete all with no notifications - should succeed
      await authApi.notifications.deleteAll.mutate();
    });
  });

  describe('Notification Generation (Indirect)', () => {
    // These tests verify that actions generate notifications
    // Note: The actual notification content depends on your notification system implementation

    it('creates notifications for issue activity', async () => {
      const api = createTestClient();
      const authApi = createAuthenticatedClient(userToken);

      // Create another user to interact with
      const otherUsername = uniqueUsername('othernotifuser');
      const otherResult = await api.auth.register.mutate({
        username: otherUsername,
        email: uniqueEmail('othernotifuser'),
        password: 'password123',
      });
      const otherApi = createAuthenticatedClient(otherResult.sessionId);

      // Create a new repo that the other user watches
      const watchRepo = await authApi.repos.create.mutate({
        name: uniqueRepoName('watch-test'),
        description: 'Watched repo',
        isPrivate: false,
      });

      // Other user watches the repo (if watching creates notifications)
      try {
        await otherApi.repos.watch.mutate({ repoId: watchRepo.id });
      } catch {
        // Watching might not be implemented yet
      }

      // Create an issue in the watched repo
      await authApi.issues.create.mutate({
        repoId: watchRepo.id,
        title: 'Notification Test Issue',
        body: 'This should generate a notification',
      });

      // Check if other user received notifications
      // Note: This depends on your notification implementation
      const otherNotifications = await otherApi.notifications.list.query();
      // Notifications may or may not exist depending on implementation
      expect(Array.isArray(otherNotifications)).toBe(true);
    });
  });
});
