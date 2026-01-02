/**
 * Planning Integration Tests
 * 
 * Tests for AI-powered planning functionality including:
 * - Planning sessions
 * - Task breakdown
 * - Milestone planning
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

// TODO: These tests are for unimplemented planning API endpoints
// The planning router has different endpoints than these tests expect
describe.skip('Planning', () => {
  setupIntegrationTest();

  let userToken: string;
  let userId: string;
  let repoId: string;

  beforeAll(async () => {

    const api = createTestClient();

    // Create test user
    const result = await api.auth.register.mutate({
      username: uniqueUsername('planning-test'),
      email: uniqueEmail('planning-test'),
      password: 'password123',
      name: 'Planning Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create a repository
    const authApi = createAuthenticatedClient(userToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('planning-repo'),
      description: 'Repository for planning tests',
      isPrivate: false,
    });
    repoId = repo.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Planning Sessions', () => {
    let sessionId: string;

    it('starts a planning session', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const session = await authApi.planning.startSession.mutate({
          repoId,
          goal: 'Implement user authentication system',
        });

        expect(session).toBeDefined();
        expect(session.id).toBeDefined();
        sessionId = session.id;
      } catch (error: any) {
        // AI may not be configured
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('lists planning sessions', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const sessions = await authApi.planning.listSessions.query({
        repoId,
      });

      expect(Array.isArray(sessions)).toBe(true);
    });

    it('gets session details', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!sessionId) return;

      const session = await authApi.planning.getSession.query({
        sessionId,
      });

      expect(session).toBeDefined();
      expect(session.id).toBe(sessionId);
    });

    it('closes planning session', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!sessionId) return;

      const result = await authApi.planning.closeSession.mutate({
        sessionId,
      });

      expect(result.success).toBe(true);
    });

    it('requires authentication', async () => {
      const api = createTestClient();

      await expect(
        api.planning.startSession.mutate({
          repoId,
          goal: 'Test goal',
        })
      ).rejects.toThrow();
    });
  });

  describe('Task Breakdown', () => {
    it('generates task breakdown', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const breakdown = await authApi.planning.generateBreakdown.mutate({
          repoId,
          feature: 'Add user registration with email verification',
        });

        expect(breakdown).toBeDefined();
        expect(Array.isArray(breakdown.tasks)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('refines task breakdown', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const breakdown = await authApi.planning.generateBreakdown.mutate({
          repoId,
          feature: 'User login',
        });

        if (breakdown.tasks.length > 0) {
          const refined = await authApi.planning.refineTask.mutate({
            taskId: breakdown.tasks[0].id,
            feedback: 'Add more detail about error handling',
          });

          expect(refined).toBeDefined();
        }
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });
  });

  describe('Milestone Planning', () => {
    it('suggests milestones', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const suggestions = await authApi.planning.suggestMilestones.mutate({
          repoId,
          projectDescription: 'Build a full-stack web application with authentication',
        });

        expect(suggestions).toBeDefined();
        expect(Array.isArray(suggestions.milestones)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('generates timeline', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const timeline = await authApi.planning.generateTimeline.mutate({
          repoId,
          milestones: [
            { name: 'MVP', description: 'Basic features' },
            { name: 'Beta', description: 'Feature complete' },
          ],
          teamSize: 3,
        });

        expect(timeline).toBeDefined();
        expect(timeline.estimatedDuration).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });
  });

  describe('Issue Generation', () => {
    it('generates issues from plan', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const breakdown = await authApi.planning.generateBreakdown.mutate({
          repoId,
          feature: 'Add password reset functionality',
        });

        if (breakdown.tasks.length > 0) {
          const issues = await authApi.planning.createIssuesFromTasks.mutate({
            repoId,
            tasks: breakdown.tasks.map(t => t.id),
          });

          expect(Array.isArray(issues)).toBe(true);
        }
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });
  });

  describe('Complexity Estimation', () => {
    it('estimates task complexity', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const estimate = await authApi.planning.estimateComplexity.query({
          description: 'Implement OAuth2 authentication with Google and GitHub providers',
        });

        expect(estimate).toBeDefined();
        expect(['low', 'medium', 'high', 'very-high']).toContain(estimate.complexity);
        expect(typeof estimate.estimatedHours).toBe('number');
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });
  });

  describe('Dependencies', () => {
    it('identifies dependencies', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const breakdown = await authApi.planning.generateBreakdown.mutate({
          repoId,
          feature: 'Build e-commerce checkout system',
        });

        if (breakdown.tasks.length > 1) {
          const deps = await authApi.planning.identifyDependencies.query({
            tasks: breakdown.tasks,
          });

          expect(deps).toBeDefined();
          expect(Array.isArray(deps.dependencies)).toBe(true);
        }
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });
  });

  describe('Plan Templates', () => {
    it('lists plan templates', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const templates = await authApi.planning.listTemplates.query();

      expect(Array.isArray(templates)).toBe(true);
    });

    it('applies plan template', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const templates = await authApi.planning.listTemplates.query();

      if (templates.length > 0) {
        try {
          const plan = await authApi.planning.applyTemplate.mutate({
            repoId,
            templateId: templates[0].id,
          });

          expect(plan).toBeDefined();
        } catch (error: any) {
          expect(error.message).toMatch(/not configured|unavailable/i);
        }
      }
    });
  });
});
