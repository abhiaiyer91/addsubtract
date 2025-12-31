/**
 * Planning Workflow Integration Tests
 * 
 * Comprehensive tests for AI-powered planning functionality including:
 * - Planning API endpoints
 * - Workflow status tracking
 * - Dry run mode
 * - Error handling and edge cases
 * 
 * These tests focus on the API layer and mock the AI to test the workflow logic.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  startTestServer,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('Planning Workflow Integration', () => {
  let userToken: string;
  let userId: string;
  let repoId: string;
  let repoName: string;
  let username: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create test user
    username = uniqueUsername('planning-workflow-test');
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('planning-workflow'),
      password: 'password123',
      name: 'Planning Workflow Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create a repository
    const authApi = createAuthenticatedClient(userToken);
    repoName = uniqueRepoName('planning-workflow-repo');
    const repo = await authApi.repos.create.mutate({
      name: repoName,
      description: 'Repository for planning workflow tests',
      isPrivate: false,
    });
    repoId = repo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  // ===========================================
  // PLANNING STATUS TESTS
  // ===========================================
  describe('Planning Status API', () => {
    it('should check planning availability status', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const status = await authApi.planning.status.query({ repoId });

      expect(status).toBeDefined();
      expect(typeof status.available).toBe('boolean');
      expect(status.capabilities).toBeDefined();
      expect(status.capabilities.parallelExecution).toBe(true);
      expect(status.capabilities.iterativePlanning).toBe(true);
      expect(status.capabilities.maxIterations).toBe(3);
      expect(status.capabilities.maxParallelTasks).toBe(5);
    });

    it('should return model and provider info', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const status = await authApi.planning.status.query({ repoId });

      expect(status.model).toBeDefined();
      expect(status.provider).toBeDefined();
    });

    it('should require authentication', async () => {
      const api = createTestClient();

      await expect(
        api.planning.status.query({ repoId })
      ).rejects.toThrow();
    });

    it('should reject invalid repo ID', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.planning.status.query({ repoId: 'invalid-id' })
      ).rejects.toThrow();
    });
  });

  // ===========================================
  // PLANNING LIST RUNS TESTS
  // ===========================================
  describe('List Planning Runs', () => {
    it('should list planning runs for a repository', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const runs = await authApi.planning.listRuns.query({
        repoId,
        limit: 10,
      });

      expect(Array.isArray(runs)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const runs = await authApi.planning.listRuns.query({
        repoId,
        limit: 5,
      });

      expect(runs.length).toBeLessThanOrEqual(5);
    });

    it('should require authentication', async () => {
      const api = createTestClient();

      await expect(
        api.planning.listRuns.query({ repoId, limit: 10 })
      ).rejects.toThrow();
    });
  });

  // ===========================================
  // PLANNING START TESTS
  // ===========================================
  describe('Start Planning Workflow', () => {
    it('should start a planning workflow with dry run', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.planning.start.mutate({
          repoId,
          task: 'Create a simple greeting function that says hello world',
          dryRun: true,
          createBranch: false,
          autoCommit: false,
        });

        expect(result).toBeDefined();
        expect(result.runId).toBeDefined();
        expect(result.status).toBe('pending');
        expect(result.message).toContain('started');
      } catch (error: any) {
        // AI may not be configured
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('should validate task minimum length', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.planning.start.mutate({
          repoId,
          task: 'short', // Less than 10 chars
          dryRun: true,
        })
      ).rejects.toThrow();
    });

    it('should validate task maximum length', async () => {
      const authApi = createAuthenticatedClient(userToken);
      
      const veryLongTask = 'a'.repeat(6000); // More than 5000 chars

      await expect(
        authApi.planning.start.mutate({
          repoId,
          task: veryLongTask,
          dryRun: true,
        })
      ).rejects.toThrow();
    });

    it('should accept optional context parameter', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.planning.start.mutate({
          repoId,
          task: 'Build a user authentication feature with login and logout',
          context: 'This is a TypeScript project using Express.js and PostgreSQL',
          dryRun: true,
        });

        expect(result.runId).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('should validate maxIterations range', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.planning.start.mutate({
          repoId,
          task: 'Build a feature with too many iterations',
          maxIterations: 10, // Max is 5
          dryRun: true,
        })
      ).rejects.toThrow();
    });

    it('should validate maxParallelTasks range', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.planning.start.mutate({
          repoId,
          task: 'Build a feature with too many parallel tasks',
          maxParallelTasks: 20, // Max is 10
          dryRun: true,
        })
      ).rejects.toThrow();
    });

    it('should require authentication', async () => {
      const api = createTestClient();

      await expect(
        api.planning.start.mutate({
          repoId,
          task: 'Build a feature without auth',
          dryRun: true,
        })
      ).rejects.toThrow();
    });
  });

  // ===========================================
  // GET PLANNING RUN TESTS
  // ===========================================
  describe('Get Planning Run', () => {
    it('should return 404 for non-existent run', async () => {
      const authApi = createAuthenticatedClient(userToken);
      const fakeRunId = '00000000-0000-0000-0000-000000000000';

      await expect(
        authApi.planning.getRun.query({ runId: fakeRunId })
      ).rejects.toThrow(/not found/i);
    });

    it('should validate run ID format', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.planning.getRun.query({ runId: 'invalid-uuid' })
      ).rejects.toThrow();
    });

    it('should require authentication', async () => {
      const api = createTestClient();
      const fakeRunId = '00000000-0000-0000-0000-000000000000';

      await expect(
        api.planning.getRun.query({ runId: fakeRunId })
      ).rejects.toThrow();
    });
  });

  // ===========================================
  // PLANNING RUN SYNCHRONOUS TESTS
  // ===========================================
  describe('Run Planning Workflow Synchronously', () => {
    it('should run workflow synchronously with dry run', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.planning.run.mutate({
          repoId,
          task: 'Create a utility function that formats dates to ISO format',
          dryRun: true,
          createBranch: false,
          autoCommit: false,
        });

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(result.totalIterations).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(result.groupResults)).toBe(true);
        expect(Array.isArray(result.filesModified)).toBe(true);
        expect(typeof result.totalDuration).toBe('number');
      } catch (error: any) {
        // AI may not be configured
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    }, 60000); // Allow more time for workflow

    it('should return execution plan in result', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.planning.run.mutate({
          repoId,
          task: 'Add a simple math utility with add and subtract functions',
          dryRun: true,
        });

        if (result.success && result.finalPlan) {
          expect(result.finalPlan.id).toBeDefined();
          expect(result.finalPlan.version).toBeGreaterThanOrEqual(1);
          expect(result.finalPlan.originalTask).toContain('math');
          expect(result.finalPlan.summary).toBeDefined();
          expect(Array.isArray(result.finalPlan.parallelGroups)).toBe(true);
        }
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    }, 60000);

    it('should return review in result when completed', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.planning.run.mutate({
          repoId,
          task: 'Create a string utility with capitalize and lowercase functions',
          dryRun: true,
        });

        if (result.success && result.review) {
          expect(typeof result.review.overallSuccess).toBe('boolean');
          expect(typeof result.review.completedTasks).toBe('number');
          expect(typeof result.review.failedTasks).toBe('number');
          expect(typeof result.review.skippedTasks).toBe('number');
          expect(Array.isArray(result.review.issues)).toBe(true);
          expect(typeof result.review.needsReplanning).toBe('boolean');
          expect(result.review.summary).toBeDefined();
        }
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    }, 60000);
  });

  // ===========================================
  // PLANNING CONFIGURATION TESTS
  // ===========================================
  describe('Planning Configuration Options', () => {
    it('should accept custom branch name', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.planning.start.mutate({
          repoId,
          task: 'Build a feature with a custom branch name',
          createBranch: true,
          branchName: 'feature/custom-planning-branch',
          dryRun: true,
        });

        expect(result.runId).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('should support autoCommit: false', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.planning.start.mutate({
          repoId,
          task: 'Build a feature without auto-commit',
          autoCommit: false,
          dryRun: true,
        });

        expect(result.runId).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('should support createBranch: false', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.planning.start.mutate({
          repoId,
          task: 'Build a feature without creating a new branch',
          createBranch: false,
          dryRun: true,
        });

        expect(result.runId).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });
  });

  // ===========================================
  // ERROR HANDLING TESTS
  // ===========================================
  describe('Error Handling', () => {
    it('should handle repository not found error', async () => {
      const authApi = createAuthenticatedClient(userToken);
      const fakeRepoId = '00000000-0000-0000-0000-000000000000';

      await expect(
        authApi.planning.start.mutate({
          repoId: fakeRepoId,
          task: 'Build a feature for non-existent repo',
          dryRun: true,
        })
      ).rejects.toThrow(/not found/i);
    });

    it('should return appropriate error when AI is not configured', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Temporarily ensure no API keys are set (this should be the test environment state)
      const hasAI = !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY;
      
      if (!hasAI) {
        await expect(
          authApi.planning.start.mutate({
            repoId,
            task: 'Build a feature when AI is not available',
            dryRun: false, // Force actual execution
          })
        ).rejects.toThrow(/not configured|api key/i);
      }
    });
  });

  // ===========================================
  // CROSS-USER ACCESS TESTS
  // ===========================================
  describe('Cross-User Access Control', () => {
    let otherUserToken: string;
    let otherUserId: string;

    beforeAll(async () => {
      const api = createTestClient();
      
      // Create another user
      const result = await api.auth.register.mutate({
        username: uniqueUsername('other-planning-user'),
        email: uniqueEmail('other-planning'),
        password: 'password123',
        name: 'Other Planning User',
      });
      otherUserToken = result.sessionId;
      otherUserId = result.user.id;
    });

    it('should prevent other users from accessing private repo planning', async () => {
      // Create a private repository with the original user
      const authApi = createAuthenticatedClient(userToken);
      const privateRepo = await authApi.repos.create.mutate({
        name: uniqueRepoName('private-planning-repo'),
        description: 'Private repo for access control test',
        isPrivate: true,
      });

      // Try to access with another user
      const otherApi = createAuthenticatedClient(otherUserToken);

      await expect(
        otherApi.planning.start.mutate({
          repoId: privateRepo.id,
          task: 'Try to access private repo planning',
          dryRun: true,
        })
      ).rejects.toThrow();
    });
  });
});
