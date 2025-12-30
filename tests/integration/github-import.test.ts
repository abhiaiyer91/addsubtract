/**
 * GitHub Import Integration Tests
 * 
 * Tests for importing repositories from GitHub including:
 * - Repository import
 * - Issue import
 * - PR import
 * - User mapping
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

describe('GitHub Import', () => {
  let userToken: string;
  let userId: string;
  let username: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create test user
    username = uniqueUsername('github-import-test');
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('github-import-test'),
      password: 'password123',
      name: 'GitHub Import Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Import Configuration', () => {
    it('checks import availability', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const status = await authApi.githubImport.status.query();

      expect(status).toBeDefined();
      expect(typeof status.available).toBe('boolean');
    });

    it('requires authentication for import', async () => {
      const api = createTestClient();

      await expect(
        api.githubImport.status.query()
      ).rejects.toThrow();
    });
  });

  describe('Repository Import', () => {
    it('validates GitHub URL format', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Invalid URL should be rejected
      await expect(
        authApi.githubImport.validateUrl.mutate({
          url: 'not-a-valid-url',
        })
      ).rejects.toThrow();
    });

    it('validates GitHub repository URL', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.githubImport.validateUrl.mutate({
        url: 'https://github.com/octocat/Hello-World',
      });

      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
      expect(result.owner).toBe('octocat');
      expect(result.repo).toBe('Hello-World');
    });

    it('starts import job', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // This might fail if GitHub API is not available or rate limited
      try {
        const job = await authApi.githubImport.start.mutate({
          githubUrl: 'https://github.com/octocat/Hello-World',
          newName: uniqueRepoName('imported'),
          importIssues: true,
          importPrs: false,
        });

        expect(job).toBeDefined();
        expect(job.id).toBeDefined();
        expect(job.status).toBeDefined();
      } catch (error: any) {
        // GitHub API rate limiting or unavailability is acceptable
        expect(error.message).toMatch(/rate|limit|unavailable|token/i);
      }
    });

    it('lists import jobs', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const jobs = await authApi.githubImport.listJobs.query();

      expect(Array.isArray(jobs)).toBe(true);
    });

    it('gets import job status', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // First create a job
      try {
        const job = await authApi.githubImport.start.mutate({
          githubUrl: 'https://github.com/octocat/Hello-World',
          newName: uniqueRepoName('import-status'),
        });

        const status = await authApi.githubImport.getJob.query({
          jobId: job.id,
        });

        expect(status).toBeDefined();
        expect(status.id).toBe(job.id);
        expect(['pending', 'running', 'completed', 'failed']).toContain(status.status);
      } catch (error: any) {
        // GitHub API rate limiting is acceptable
        expect(error.message).toMatch(/rate|limit|unavailable|token|not found/i);
      }
    });
  });

  describe('Import Options', () => {
    it('imports without issues', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const job = await authApi.githubImport.start.mutate({
          githubUrl: 'https://github.com/octocat/Hello-World',
          newName: uniqueRepoName('no-issues'),
          importIssues: false,
          importPrs: false,
        });

        expect(job).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/rate|limit|unavailable|token/i);
      }
    });

    it('imports to organization', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Create an org first
      const orgName = `import-org-${Date.now()}`;
      await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'Import Test Org',
      });

      try {
        const job = await authApi.githubImport.start.mutate({
          githubUrl: 'https://github.com/octocat/Hello-World',
          newName: uniqueRepoName('org-import'),
          targetOrg: orgName,
        });

        expect(job).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/rate|limit|unavailable|token/i);
      }
    });

    it('validates repository name availability', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Create a repo with a specific name
      const existingName = uniqueRepoName('existing');
      await authApi.repos.create.mutate({
        name: existingName,
        description: 'Existing repo',
        isPrivate: false,
      });

      // Trying to import with same name should fail or warn
      const validation = await authApi.githubImport.validateUrl.mutate({
        url: 'https://github.com/octocat/Hello-World',
        targetName: existingName,
      });

      expect(validation.nameAvailable).toBe(false);
    });
  });

  describe('Import Progress', () => {
    it('tracks import progress', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const job = await authApi.githubImport.start.mutate({
          githubUrl: 'https://github.com/octocat/Hello-World',
          newName: uniqueRepoName('progress-test'),
        });

        // Check progress
        const progress = await authApi.githubImport.getProgress.query({
          jobId: job.id,
        });

        expect(progress).toBeDefined();
        expect(typeof progress.percentage).toBe('number');
        expect(progress.percentage).toBeGreaterThanOrEqual(0);
        expect(progress.percentage).toBeLessThanOrEqual(100);
      } catch (error: any) {
        expect(error.message).toMatch(/rate|limit|unavailable|token/i);
      }
    });
  });

  describe('Import Cancellation', () => {
    it('cancels pending import', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const job = await authApi.githubImport.start.mutate({
          githubUrl: 'https://github.com/octocat/Hello-World',
          newName: uniqueRepoName('cancel-test'),
        });

        const result = await authApi.githubImport.cancel.mutate({
          jobId: job.id,
        });

        expect(result.success).toBe(true);

        // Verify cancellation
        const status = await authApi.githubImport.getJob.query({
          jobId: job.id,
        });
        expect(['cancelled', 'failed']).toContain(status.status);
      } catch (error: any) {
        expect(error.message).toMatch(/rate|limit|unavailable|token|cannot cancel/i);
      }
    });
  });

  describe('Import History', () => {
    it('lists completed imports', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const history = await authApi.githubImport.history.query({
        limit: 10,
      });

      expect(Array.isArray(history)).toBe(true);
    });

    it('filters imports by status', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const completed = await authApi.githubImport.history.query({
        status: 'completed',
      });

      expect(Array.isArray(completed)).toBe(true);
      expect(completed.every((j: any) => j.status === 'completed')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('handles non-existent GitHub repo', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.githubImport.start.mutate({
          githubUrl: 'https://github.com/nonexistent-user-xyz123/nonexistent-repo-xyz123',
          newName: uniqueRepoName('nonexistent'),
        })
      ).rejects.toThrow();
    });

    it('handles private GitHub repo without token', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Most private repos will fail without proper GitHub token
      await expect(
        authApi.githubImport.start.mutate({
          githubUrl: 'https://github.com/private-org/private-repo',
          newName: uniqueRepoName('private'),
        })
      ).rejects.toThrow();
    });

    it('handles invalid GitHub URL', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.githubImport.start.mutate({
          githubUrl: 'https://gitlab.com/user/repo',
          newName: uniqueRepoName('gitlab'),
        })
      ).rejects.toThrow();
    });
  });
});
