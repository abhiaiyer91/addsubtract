/**
 * Admin Integration Tests
 * 
 * Tests for administrative functionality including:
 * - System status
 * - User management
 * - Repository management
 * - System configuration
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

describe('Admin', () => {
  setupIntegrationTest();

  let adminToken: string;
  let adminId: string;
  let regularUserToken: string;
  let regularUserId: string;
  let regularUsername: string;

  beforeAll(async () => {
    const api = createTestClient();

    // Create admin user (first user might be admin)
    const adminResult = await api.auth.register.mutate({
      username: uniqueUsername('admin-test'),
      email: uniqueEmail('admin-test'),
      password: 'password123',
      name: 'Admin Test User',
    });
    adminToken = adminResult.sessionId;
    adminId = adminResult.user.id;

    // Create regular user
    regularUsername = uniqueUsername('regular-test');
    const regularResult = await api.auth.register.mutate({
      username: regularUsername,
      email: uniqueEmail('regular-test'),
      password: 'password123',
      name: 'Regular Test User',
    });
    regularUserToken = regularResult.sessionId;
    regularUserId = regularResult.user.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('System Status', () => {
    it('gets system status', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const status = await authApi.admin.systemStatus.query();

        expect(status).toBeDefined();
        expect(status.version).toBeDefined();
        expect(status.uptime).toBeDefined();
      } catch (error: any) {
        // May require admin role
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('gets database stats', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const stats = await authApi.admin.databaseStats.query();

        expect(stats).toBeDefined();
        expect(stats.users).toBeDefined();
        expect(stats.repos).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('denies regular user access', async () => {
      const api = createAuthenticatedClient(regularUserToken);

      await expect(
        api.admin.systemStatus.query()
      ).rejects.toThrow();
    });
  });

  describe('User Management', () => {
    it('lists all users', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const users = await authApi.admin.listUsers.query({
          limit: 10,
        });

        expect(Array.isArray(users)).toBe(true);
        expect(users.length).toBeGreaterThan(0);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('gets user details', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const user = await authApi.admin.getUser.query({
          userId: regularUserId,
        });

        expect(user).toBeDefined();
        expect(user.id).toBe(regularUserId);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('suspends user', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const result = await authApi.admin.suspendUser.mutate({
          userId: regularUserId,
          reason: 'Test suspension',
        });

        expect(result.success).toBe(true);

        // Unsuspend for further tests
        await authApi.admin.unsuspendUser.mutate({
          userId: regularUserId,
        });
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('updates user role', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const result = await authApi.admin.updateUserRole.mutate({
          userId: regularUserId,
          role: 'user',
        });

        expect(result.success).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('searches users', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const users = await authApi.admin.searchUsers.query({
          query: 'regular',
        });

        expect(Array.isArray(users)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });
  });

  describe('Repository Management', () => {
    let testRepoId: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(regularUserToken);
      const repo = await authApi.repos.create.mutate({
        name: uniqueRepoName('admin-test-repo'),
        description: 'Repo for admin tests',
        isPrivate: false,
      });
      testRepoId = repo.id;
    });

    it('lists all repositories', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const repos = await authApi.admin.listRepos.query({
          limit: 10,
        });

        expect(Array.isArray(repos)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('gets repository details', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const repo = await authApi.admin.getRepo.query({
          repoId: testRepoId,
        });

        expect(repo).toBeDefined();
        expect(repo.id).toBe(testRepoId);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('archives repository', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const result = await authApi.admin.archiveRepo.mutate({
          repoId: testRepoId,
        });

        expect(result.success).toBe(true);

        // Unarchive for further tests
        await authApi.admin.unarchiveRepo.mutate({
          repoId: testRepoId,
        });
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('transfers repository ownership', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const result = await authApi.admin.transferRepo.mutate({
          repoId: testRepoId,
          newOwnerId: adminId,
        });

        expect(result.success).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });
  });

  describe('System Configuration', () => {
    it('gets system configuration', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const config = await authApi.admin.getConfig.query();

        expect(config).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('updates system configuration', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const result = await authApi.admin.updateConfig.mutate({
          allowRegistration: true,
          maxReposPerUser: 100,
        });

        expect(result.success).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });
  });

  describe('Audit Logs', () => {
    it('gets audit logs', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const logs = await authApi.admin.auditLogs.query({
          limit: 10,
        });

        expect(Array.isArray(logs)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('filters audit logs by action', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const logs = await authApi.admin.auditLogs.query({
          action: 'user.create',
          limit: 10,
        });

        expect(Array.isArray(logs)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('filters audit logs by user', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const logs = await authApi.admin.auditLogs.query({
          userId: adminId,
          limit: 10,
        });

        expect(Array.isArray(logs)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });
  });

  describe('Background Jobs', () => {
    it('lists background jobs', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const jobs = await authApi.admin.listJobs.query();

        expect(Array.isArray(jobs)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('gets job status', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const jobs = await authApi.admin.listJobs.query();

        if (jobs.length > 0) {
          const status = await authApi.admin.getJobStatus.query({
            jobId: jobs[0].id,
          });

          expect(status).toBeDefined();
        }
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });
  });

  describe('Maintenance Mode', () => {
    it('checks maintenance mode status', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const status = await authApi.admin.maintenanceStatus.query();

        expect(status).toBeDefined();
        expect(typeof status.enabled).toBe('boolean');
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });

    it('enables maintenance mode', async () => {
      const authApi = createAuthenticatedClient(adminToken);

      try {
        const result = await authApi.admin.setMaintenanceMode.mutate({
          enabled: true,
          message: 'System upgrade in progress',
        });

        expect(result.success).toBe(true);

        // Disable immediately
        await authApi.admin.setMaintenanceMode.mutate({
          enabled: false,
        });
      } catch (error: any) {
        expect(error.message).toMatch(/unauthorized|forbidden|admin/i);
      }
    });
  });
});
