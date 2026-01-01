/**
 * Workflows Integration Tests
 * 
 * Tests for CI/CD workflow functionality including:
 * - Workflow configuration
 * - Workflow runs
 * - Job execution status
 * - Workflow triggers
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

// TODO: Tests expect list/get/create/listRepoRuns/getRunJobs/getJobSteps/triggers
// The workflows router has listWorkflows/getRun/getJobLogs instead
describe.skip('Workflows', () => {
  setupIntegrationTest();

  let userToken: string;
  let userId: string;
  let repoId: string;
  let workflowId: string;

  beforeAll(async () => {

    const api = createTestClient();

    // Create test user
    const result = await api.auth.register.mutate({
      username: uniqueUsername('workflows-test'),
      email: uniqueEmail('workflows-test'),
      password: 'password123',
      name: 'Workflows Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create a repository
    const authApi = createAuthenticatedClient(userToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('workflows-repo'),
      description: 'Repository for workflow tests',
      isPrivate: false,
    });
    repoId = repo.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Workflow Configuration', () => {
    it('lists workflows for repository', async () => {
      const api = createTestClient();

      const workflows = await api.workflows.list.query({ repoId });

      expect(Array.isArray(workflows)).toBe(true);
    });

    it('creates a workflow', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const workflow = await authApi.workflows.create.mutate({
        repoId,
        name: 'Test CI',
        path: '.wit/workflows/test.yml',
        config: {
          name: 'Test CI',
          on: { push: { branches: ['main'] } },
          jobs: {
            test: {
              'runs-on': 'ubuntu-latest',
              steps: [
                { name: 'Checkout', uses: 'actions/checkout@v4' },
                { name: 'Test', run: 'echo "Running tests"' },
              ],
            },
          },
        },
      });

      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('Test CI');
      workflowId = workflow.id;
    });

    it('gets workflow by ID', async () => {
      const api = createTestClient();

      if (!workflowId) return;

      const workflow = await api.workflows.get.query({ workflowId });

      expect(workflow).toBeDefined();
      expect(workflow.id).toBe(workflowId);
    });

    it('updates workflow', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!workflowId) return;

      const updated = await authApi.workflows.update.mutate({
        workflowId,
        name: 'Updated CI',
      });

      expect(updated.name).toBe('Updated CI');
    });

    it('enables/disables workflow', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!workflowId) return;

      // Disable
      const disabled = await authApi.workflows.setEnabled.mutate({
        workflowId,
        enabled: false,
      });
      expect(disabled.enabled).toBe(false);

      // Re-enable
      const enabled = await authApi.workflows.setEnabled.mutate({
        workflowId,
        enabled: true,
      });
      expect(enabled.enabled).toBe(true);
    });
  });

  describe('Workflow Runs', () => {
    let runId: string;

    it('triggers workflow run', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!workflowId) return;

      try {
        const run = await authApi.workflows.trigger.mutate({
          workflowId,
          ref: 'main',
          inputs: {},
        });

        expect(run).toBeDefined();
        expect(run.id).toBeDefined();
        expect(['queued', 'pending', 'running']).toContain(run.status);
        runId = run.id;
      } catch (error: any) {
        // Workflow execution may not be available
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });

    it('lists workflow runs', async () => {
      const api = createTestClient();

      if (!workflowId) return;

      const runs = await api.workflows.listRuns.query({
        workflowId,
        limit: 10,
      });

      expect(Array.isArray(runs)).toBe(true);
    });

    it('lists runs for repository', async () => {
      const api = createTestClient();

      const runs = await api.workflows.listRepoRuns.query({
        repoId,
        limit: 10,
      });

      expect(Array.isArray(runs)).toBe(true);
    });

    it('gets run details', async () => {
      const api = createTestClient();

      if (!runId) return;

      const run = await api.workflows.getRun.query({ runId });

      expect(run).toBeDefined();
      expect(run.id).toBe(runId);
      expect(run.workflowId).toBe(workflowId);
    });

    it('gets run jobs', async () => {
      const api = createTestClient();

      if (!runId) return;

      const jobs = await api.workflows.getRunJobs.query({ runId });

      expect(Array.isArray(jobs)).toBe(true);
    });

    it('cancels running workflow', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!runId) return;

      try {
        const result = await authApi.workflows.cancelRun.mutate({ runId });

        expect(result.success).toBe(true);
      } catch (error: any) {
        // May not be cancellable if already completed
        expect(error.message).toMatch(/cannot cancel|not running/i);
      }
    });

    it('reruns workflow', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!runId) return;

      try {
        const newRun = await authApi.workflows.rerun.mutate({ runId });

        expect(newRun).toBeDefined();
        expect(newRun.id).not.toBe(runId);
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });
  });

  describe('Job Details', () => {
    it('gets job logs', async () => {
      const api = createTestClient();

      // Get a completed run's jobs
      const runs = await api.workflows.listRepoRuns.query({
        repoId,
        status: 'completed',
        limit: 1,
      });

      if (runs.length === 0) return;

      const jobs = await api.workflows.getRunJobs.query({
        runId: runs[0].id,
      });

      if (jobs.length === 0) return;

      const logs = await api.workflows.getJobLogs.query({
        jobId: jobs[0].id,
      });

      expect(logs).toBeDefined();
      expect(typeof logs.content).toBe('string');
    });

    it('gets job steps', async () => {
      const api = createTestClient();

      const runs = await api.workflows.listRepoRuns.query({
        repoId,
        limit: 1,
      });

      if (runs.length === 0) return;

      const jobs = await api.workflows.getRunJobs.query({
        runId: runs[0].id,
      });

      if (jobs.length === 0) return;

      const steps = await api.workflows.getJobSteps.query({
        jobId: jobs[0].id,
      });

      expect(Array.isArray(steps)).toBe(true);
    });
  });

  describe('Workflow Triggers', () => {
    it('lists available triggers', async () => {
      const api = createTestClient();

      const triggers = await api.workflows.triggers.query();

      expect(Array.isArray(triggers)).toBe(true);
      expect(triggers).toContain('push');
      expect(triggers).toContain('pull_request');
    });

    it('filters runs by trigger', async () => {
      const api = createTestClient();

      const runs = await api.workflows.listRepoRuns.query({
        repoId,
        event: 'push',
      });

      expect(Array.isArray(runs)).toBe(true);
      expect(runs.every((r: any) => r.event === 'push')).toBe(true);
    });

    it('filters runs by status', async () => {
      const api = createTestClient();

      const runs = await api.workflows.listRepoRuns.query({
        repoId,
        status: 'completed',
      });

      expect(Array.isArray(runs)).toBe(true);
      expect(runs.every((r: any) => r.status === 'completed')).toBe(true);
    });

    it('filters runs by branch', async () => {
      const api = createTestClient();

      const runs = await api.workflows.listRepoRuns.query({
        repoId,
        branch: 'main',
      });

      expect(Array.isArray(runs)).toBe(true);
    });
  });

  describe('Workflow Deletion', () => {
    it('deletes a workflow', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Create a workflow to delete
      const workflow = await authApi.workflows.create.mutate({
        repoId,
        name: 'Workflow to Delete',
        path: '.wit/workflows/delete.yml',
        config: {
          name: 'Delete Me',
          on: { push: {} },
          jobs: { test: { 'runs-on': 'ubuntu-latest', steps: [] } },
        },
      });

      const result = await authApi.workflows.delete.mutate({
        workflowId: workflow.id,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Workflow Permissions', () => {
    it('requires write access to create workflow', async () => {
      const api = createTestClient();

      await expect(
        api.workflows.create.mutate({
          repoId,
          name: 'Unauthorized',
          path: '.wit/workflows/unauth.yml',
          config: { name: 'Test', on: {}, jobs: {} },
        })
      ).rejects.toThrow();
    });

    it('allows read access to list workflows', async () => {
      const api = createTestClient();

      const workflows = await api.workflows.list.query({ repoId });

      expect(Array.isArray(workflows)).toBe(true);
    });
  });
});
