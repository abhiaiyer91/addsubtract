/**
 * Milestones Integration Tests
 * 
 * Tests for milestone management including:
 * - Milestone CRUD operations
 * - State management (open/close/reopen)
 * - Issue and PR assignment
 * - Progress tracking
 * - Permission checks
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  startTestServer,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('Milestones Flow', () => {
  let ownerToken: string;
  let collaboratorToken: string;
  let ownerId: string;
  let collaboratorId: string;
  let repoId: string;
  let ownerUsername: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create repo owner
    ownerUsername = uniqueUsername('milestoneowner');
    const ownerResult = await api.auth.register.mutate({
      username: ownerUsername,
      email: uniqueEmail('milestoneowner'),
      password: 'password123',
      name: 'Milestone Owner',
    });
    ownerToken = ownerResult.sessionId;
    ownerId = ownerResult.user.id;

    // Create collaborator
    const collaboratorUsername = uniqueUsername('milestonecollab');
    const collaboratorResult = await api.auth.register.mutate({
      username: collaboratorUsername,
      email: uniqueEmail('milestonecollab'),
      password: 'password123',
      name: 'Milestone Collaborator',
    });
    collaboratorToken = collaboratorResult.sessionId;
    collaboratorId = collaboratorResult.user.id;

    // Create a test repository
    const ownerApi = createAuthenticatedClient(ownerToken);
    const repo = await ownerApi.repos.create.mutate({
      name: uniqueRepoName('milestone-test'),
      description: 'Repo for milestone tests',
      isPrivate: false,
    });
    repoId = repo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Milestone CRUD Operations', () => {
    it('creates a milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: 'v1.0 Release',
        description: 'First major release',
      });

      expect(milestone).toBeDefined();
      expect(milestone.title).toBe('v1.0 Release');
      expect(milestone.description).toBe('First major release');
      expect(milestone.state).toBe('open');
    });

    it('creates milestone with due date', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: 'v2.0 Release',
        description: 'Second major release',
        dueDate,
      });

      expect(milestone.dueDate).toBeDefined();
      expect(new Date(milestone.dueDate!).getTime()).toBeCloseTo(dueDate.getTime(), -3);
    });

    it('lists milestones for repository', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Create a milestone for this specific test
      await authApi.milestones.create.mutate({
        repoId,
        title: `List Test ${Date.now()}`,
      });

      const result = await api.milestones.list.query({ repoId });

      expect(result.milestones).toBeDefined();
      expect(Array.isArray(result.milestones)).toBe(true);
      expect(result.milestones.length).toBeGreaterThan(0);
      expect(result.counts).toBeDefined();
    });

    it('lists milestones filtered by state', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Create and close a milestone
      const closedMilestone = await authApi.milestones.create.mutate({
        repoId,
        title: `Closed ${Date.now()}`,
      });
      await authApi.milestones.close.mutate({ id: closedMilestone.id });

      // Create an open milestone
      await authApi.milestones.create.mutate({
        repoId,
        title: `Open ${Date.now()}`,
      });

      const openResult = await api.milestones.list.query({ repoId, state: 'open' });
      const closedResult = await api.milestones.list.query({ repoId, state: 'closed' });

      expect(openResult.milestones.every(m => m.state === 'open')).toBe(true);
      expect(closedResult.milestones.every(m => m.state === 'closed')).toBe(true);
    });

    it('gets milestone by ID', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const created = await authApi.milestones.create.mutate({
        repoId,
        title: 'Get By ID Test',
        description: 'Test description',
      });

      const milestone = await api.milestones.get.query({ id: created.id });

      expect(milestone).toBeDefined();
      expect(milestone.id).toBe(created.id);
      expect(milestone.title).toBe('Get By ID Test');
    });

    it('updates milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: 'Original Title',
        description: 'Original description',
      });

      const updated = await authApi.milestones.update.mutate({
        id: milestone.id,
        title: 'Updated Title',
        description: 'Updated description',
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.description).toBe('Updated description');
    });

    it('updates milestone due date', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const newDueDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: 'Due Date Update Test',
      });

      const updated = await authApi.milestones.update.mutate({
        id: milestone.id,
        dueDate: newDueDate,
      });

      expect(updated.dueDate).toBeDefined();
      expect(new Date(updated.dueDate!).getTime()).toBeCloseTo(newDueDate.getTime(), -3);
    });

    it('deletes milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: 'To Be Deleted',
      });

      const result = await authApi.milestones.delete.mutate({ id: milestone.id });
      expect(result.success).toBe(true);

      await expect(
        api.milestones.get.query({ id: milestone.id })
      ).rejects.toThrow();
    });
  });

  describe('Milestone State Management', () => {
    it('closes a milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: 'To Be Closed',
      });

      const closed = await authApi.milestones.close.mutate({ id: milestone.id });

      expect(closed.state).toBe('closed');
      expect(closed.closedAt).toBeDefined();
    });

    it('reopens a milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: 'To Be Reopened',
      });

      await authApi.milestones.close.mutate({ id: milestone.id });
      const reopened = await authApi.milestones.reopen.mutate({ id: milestone.id });

      expect(reopened.state).toBe('open');
    });

    it('updates state via update endpoint', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: 'State Update Test',
      });

      const closed = await authApi.milestones.update.mutate({
        id: milestone.id,
        state: 'closed',
      });

      expect(closed.state).toBe('closed');

      const reopened = await authApi.milestones.update.mutate({
        id: milestone.id,
        state: 'open',
      });

      expect(reopened.state).toBe('open');
    });
  });

  describe('Issue Assignment', () => {
    let issueId: string;
    let milestoneId: string;

    beforeEach(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create a milestone
      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: `Issue Test ${Date.now()}`,
      });
      milestoneId = milestone.id;

      // Create an issue
      const issue = await authApi.issues.create.mutate({
        repoId,
        title: `Test Issue ${Date.now()}`,
        body: 'Issue for milestone tests',
      });
      issueId = issue.id;
    });

    it('assigns issue to milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.milestones.assignIssue.mutate({
        issueId,
        milestoneId,
      });

      expect(result.success).toBe(true);
    });

    it('removes issue from milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // First assign
      await authApi.milestones.assignIssue.mutate({
        issueId,
        milestoneId,
      });

      // Then remove by setting milestoneId to null
      const result = await authApi.milestones.assignIssue.mutate({
        issueId,
        milestoneId: null,
      });

      expect(result.success).toBe(true);
    });

    it('lists issues in milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      await authApi.milestones.assignIssue.mutate({
        issueId,
        milestoneId,
      });

      const result = await api.milestones.issues.query({ milestoneId });

      expect(result.milestone).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues.some(i => i.id === issueId)).toBe(true);
    });

    it('filters issues by state', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Create and assign multiple issues
      const openIssue = await authApi.issues.create.mutate({
        repoId,
        title: `Open Issue ${Date.now()}`,
        body: 'Open issue',
      });

      const closedIssue = await authApi.issues.create.mutate({
        repoId,
        title: `Closed Issue ${Date.now()}`,
        body: 'Closed issue',
      });
      await authApi.issues.close.mutate({ issueId: closedIssue.id });

      await authApi.milestones.assignIssue.mutate({
        issueId: openIssue.id,
        milestoneId,
      });
      await authApi.milestones.assignIssue.mutate({
        issueId: closedIssue.id,
        milestoneId,
      });

      const openResult = await api.milestones.issues.query({
        milestoneId,
        state: 'open',
      });
      const closedResult = await api.milestones.issues.query({
        milestoneId,
        state: 'closed',
      });

      expect(openResult.issues.every(i => i.state === 'open')).toBe(true);
      expect(closedResult.issues.every(i => i.state === 'closed')).toBe(true);
    });
  });

  describe('Pull Request Assignment', () => {
    let prId: string;
    let milestoneId: string;

    beforeEach(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create a milestone
      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: `PR Test ${Date.now()}`,
      });
      milestoneId = milestone.id;

      // Create a PR
      const pr = await authApi.pulls.create.mutate({
        repoId,
        title: `Test PR ${Date.now()}`,
        body: 'PR for milestone tests',
        sourceBranch: 'feature',
        targetBranch: 'main',
        headSha: '0'.repeat(64),
        baseSha: '1'.repeat(64),
        isDraft: false,
      });
      prId = pr.id;
    });

    it('assigns pull request to milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.milestones.assignPullRequest.mutate({
        pullRequestId: prId,
        milestoneId,
      });

      expect(result.success).toBe(true);
    });

    it('removes pull request from milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await authApi.milestones.assignPullRequest.mutate({
        pullRequestId: prId,
        milestoneId,
      });

      const result = await authApi.milestones.assignPullRequest.mutate({
        pullRequestId: prId,
        milestoneId: null,
      });

      expect(result.success).toBe(true);
    });

    it('lists pull requests in milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      await authApi.milestones.assignPullRequest.mutate({
        pullRequestId: prId,
        milestoneId,
      });

      const result = await api.milestones.pullRequests.query({ milestoneId });

      expect(result.milestone).toBeDefined();
      expect(Array.isArray(result.pullRequests)).toBe(true);
      expect(result.pullRequests.some(pr => pr.id === prId)).toBe(true);
    });
  });

  describe('Permission Checks', () => {
    it('fails to create milestone without write permission', async () => {
      const collabApi = createAuthenticatedClient(collaboratorToken);

      await expect(
        collabApi.milestones.create.mutate({
          repoId,
          title: 'Unauthorized Milestone',
        })
      ).rejects.toThrow();
    });

    it('allows collaborator with write permission to create milestones', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const collabApi = createAuthenticatedClient(collaboratorToken);

      // Create new repo and add collaborator
      const newRepo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('milestone-collab'),
        description: 'Test repo',
        isPrivate: false,
      });

      await ownerApi.repos.addCollaborator.mutate({
        repoId: newRepo.id,
        userId: collaboratorId,
        permission: 'write',
      });

      const milestone = await collabApi.milestones.create.mutate({
        repoId: newRepo.id,
        title: 'Collaborator Milestone',
      });

      expect(milestone).toBeDefined();
    });

    it('fails to delete milestone without admin permission', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const collabApi = createAuthenticatedClient(collaboratorToken);

      // Create new repo and add collaborator with write only
      const newRepo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('milestone-delete-perm'),
        description: 'Test repo',
        isPrivate: false,
      });

      await ownerApi.repos.addCollaborator.mutate({
        repoId: newRepo.id,
        userId: collaboratorId,
        permission: 'write',
      });

      const milestone = await ownerApi.milestones.create.mutate({
        repoId: newRepo.id,
        title: 'Protected Milestone',
      });

      await expect(
        collabApi.milestones.delete.mutate({ id: milestone.id })
      ).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('fails to get non-existent milestone', async () => {
      const api = createTestClient();

      await expect(
        api.milestones.get.query({ id: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow();
    });

    it('fails to create milestone for non-existent repository', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.milestones.create.mutate({
          repoId: '00000000-0000-0000-0000-000000000000',
          title: 'No Repo Milestone',
        })
      ).rejects.toThrow();
    });

    it('fails to assign non-existent issue to milestone', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const milestone = await authApi.milestones.create.mutate({
        repoId,
        title: `Edge Case ${Date.now()}`,
      });

      await expect(
        authApi.milestones.assignIssue.mutate({
          issueId: '00000000-0000-0000-0000-000000000000',
          milestoneId: milestone.id,
        })
      ).rejects.toThrow();
    });

    it('handles pagination correctly', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Create multiple milestones
      for (let i = 0; i < 5; i++) {
        await authApi.milestones.create.mutate({
          repoId,
          title: `Pagination Test ${i} ${Date.now()}`,
        });
      }

      const page1 = await api.milestones.list.query({
        repoId,
        limit: 2,
        offset: 0,
      });

      const page2 = await api.milestones.list.query({
        repoId,
        limit: 2,
        offset: 2,
      });

      expect(page1.milestones.length).toBe(2);
      expect(page2.milestones.length).toBe(2);
      expect(page1.milestones[0].id).not.toBe(page2.milestones[0].id);
    });
  });
});
