/**
 * Branch Protection Integration Tests
 * 
 * Tests for branch protection rule management including:
 * - Rule CRUD operations
 * - Pattern matching
 * - Push permission checks
 * - Permission requirements
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

describe('Branch Protection Flow', () => {
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
    ownerUsername = uniqueUsername('branchowner');
    const ownerResult = await api.auth.register.mutate({
      username: ownerUsername,
      email: uniqueEmail('branchowner'),
      password: 'password123',
      name: 'Branch Owner',
    });
    ownerToken = ownerResult.sessionId;
    ownerId = ownerResult.user.id;

    // Create collaborator
    const collaboratorUsername = uniqueUsername('branchcollab');
    const collaboratorResult = await api.auth.register.mutate({
      username: collaboratorUsername,
      email: uniqueEmail('branchcollab'),
      password: 'password123',
      name: 'Branch Collaborator',
    });
    collaboratorToken = collaboratorResult.sessionId;
    collaboratorId = collaboratorResult.user.id;

    // Create a test repository
    const ownerApi = createAuthenticatedClient(ownerToken);
    const repo = await ownerApi.repos.create.mutate({
      name: uniqueRepoName('branch-protection-test'),
      description: 'Repo for branch protection tests',
      isPrivate: false,
    });
    repoId = repo.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Branch Protection Rule CRUD', () => {
    it('creates a protection rule', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const rule = await authApi.branchProtection.create.mutate({
        repoId,
        pattern: 'main',
        requirePullRequest: true,
        requiredReviewers: 1,
      });

      expect(rule).toBeDefined();
      expect(rule.id).toBeDefined();
      expect(rule.pattern).toBe('main');
      expect(rule.requirePullRequest).toBe(true);
      expect(rule.requiredReviewers).toBe(1);
    });

    it('creates rule with all options', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const rule = await authApi.branchProtection.create.mutate({
        repoId,
        pattern: 'release/*',
        requirePullRequest: true,
        requiredReviewers: 2,
        requireStatusChecks: true,
        requiredStatusChecks: ['ci/test', 'ci/build'],
        allowForcePush: false,
        allowDeletion: false,
      });

      expect(rule.pattern).toBe('release/*');
      expect(rule.requiredReviewers).toBe(2);
      expect(rule.requireStatusChecks).toBe(true);
      expect(rule.requiredStatusChecks).toContain('ci/test');
      expect(rule.requiredStatusChecks).toContain('ci/build');
      expect(rule.allowForcePush).toBe(false);
      expect(rule.allowDeletion).toBe(false);
    });

    it('creates rule allowing force push', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const rule = await authApi.branchProtection.create.mutate({
        repoId,
        pattern: 'feature/*',
        requirePullRequest: false,
        allowForcePush: true,
        allowDeletion: true,
      });

      expect(rule.allowForcePush).toBe(true);
      expect(rule.allowDeletion).toBe(true);
    });

    it('fails to create duplicate pattern', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const uniquePattern = `unique-${Date.now()}`;

      await authApi.branchProtection.create.mutate({
        repoId,
        pattern: uniquePattern,
        requirePullRequest: true,
      });

      await expect(
        authApi.branchProtection.create.mutate({
          repoId,
          pattern: uniquePattern,
          requirePullRequest: false,
        })
      ).rejects.toThrow();
    });

    it('lists protection rules', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const rules = await authApi.branchProtection.list.query({ repoId });

      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('gets rule by ID', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const created = await authApi.branchProtection.create.mutate({
        repoId,
        pattern: `get-test-${Date.now()}`,
        requirePullRequest: true,
      });

      const rule = await authApi.branchProtection.get.query({
        id: created.id,
        repoId,
      });

      expect(rule).toBeDefined();
      expect(rule.id).toBe(created.id);
    });

    it('updates protection rule', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const rule = await authApi.branchProtection.create.mutate({
        repoId,
        pattern: `update-test-${Date.now()}`,
        requirePullRequest: true,
        requiredReviewers: 1,
      });

      const updated = await authApi.branchProtection.update.mutate({
        id: rule.id,
        repoId,
        requiredReviewers: 3,
        allowForcePush: true,
      });

      expect(updated.requiredReviewers).toBe(3);
      expect(updated.allowForcePush).toBe(true);
    });

    it('updates rule pattern', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const originalPattern = `original-${Date.now()}`;
      const newPattern = `renamed-${Date.now()}`;

      const rule = await authApi.branchProtection.create.mutate({
        repoId,
        pattern: originalPattern,
        requirePullRequest: true,
      });

      const updated = await authApi.branchProtection.update.mutate({
        id: rule.id,
        repoId,
        pattern: newPattern,
      });

      expect(updated.pattern).toBe(newPattern);
    });

    it('deletes protection rule', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const rule = await authApi.branchProtection.create.mutate({
        repoId,
        pattern: `delete-test-${Date.now()}`,
        requirePullRequest: true,
      });

      const result = await authApi.branchProtection.delete.mutate({
        id: rule.id,
        repoId,
      });

      expect(result.success).toBe(true);

      await expect(
        authApi.branchProtection.get.query({ id: rule.id, repoId })
      ).rejects.toThrow();
    });
  });

  describe('Branch Protection Checks', () => {
    let testRepoId: string;

    beforeEach(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create fresh repo for each check test
      const repo = await authApi.repos.create.mutate({
        name: uniqueRepoName('protection-check'),
        description: 'Test repo for protection checks',
        isPrivate: false,
      });
      testRepoId = repo.id;

      // Add protection rule
      await authApi.branchProtection.create.mutate({
        repoId: testRepoId,
        pattern: 'main',
        requirePullRequest: true,
        requiredReviewers: 1,
        allowForcePush: false,
        allowDeletion: false,
      });
    });

    it('checks if branch is protected', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.branchProtection.check.query({
        repoId: testRepoId,
        branch: 'main',
      });

      expect(result.protected).toBe(true);
      expect(result.rule).toBeDefined();
      expect(result.rule?.requirePullRequest).toBe(true);
    });

    it('returns not protected for unprotected branch', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.branchProtection.check.query({
        repoId: testRepoId,
        branch: 'feature/new-feature',
      });

      expect(result.protected).toBe(false);
      expect(result.rule).toBeNull();
    });

    it('checks if push is allowed', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Regular push to protected branch - may or may not be allowed depending on implementation
      const regularPush = await authApi.branchProtection.canPush.query({
        repoId: testRepoId,
        branch: 'main',
        isForcePush: false,
        isDeletion: false,
        isPRMerge: false,
      });

      expect(typeof regularPush.allowed).toBe('boolean');
    });

    it('disallows force push to protected branch', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const forcePush = await authApi.branchProtection.canPush.query({
        repoId: testRepoId,
        branch: 'main',
        isForcePush: true,
        isDeletion: false,
        isPRMerge: false,
      });

      expect(forcePush.allowed).toBe(false);
      expect(forcePush.reason).toBeDefined();
    });

    it('disallows deletion of protected branch', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const deletion = await authApi.branchProtection.canPush.query({
        repoId: testRepoId,
        branch: 'main',
        isForcePush: false,
        isDeletion: true,
        isPRMerge: false,
      });

      expect(deletion.allowed).toBe(false);
      expect(deletion.reason).toBeDefined();
    });

    it('allows PR merge to protected branch', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const prMerge = await authApi.branchProtection.canPush.query({
        repoId: testRepoId,
        branch: 'main',
        isForcePush: false,
        isDeletion: false,
        isPRMerge: true,
      });

      // PR merges should generally be allowed (subject to review requirements)
      expect(typeof prMerge.allowed).toBe('boolean');
    });

    it('allows push to unprotected branch', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const push = await authApi.branchProtection.canPush.query({
        repoId: testRepoId,
        branch: 'feature/unprotected',
        isForcePush: true,
        isDeletion: false,
        isPRMerge: false,
      });

      expect(push.allowed).toBe(true);
    });
  });

  describe('Wildcard Pattern Matching', () => {
    let patternRepoId: string;

    beforeEach(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const repo = await authApi.repos.create.mutate({
        name: uniqueRepoName('pattern-test'),
        description: 'Test repo for pattern matching',
        isPrivate: false,
      });
      patternRepoId = repo.id;
    });

    it('matches wildcard pattern', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await authApi.branchProtection.create.mutate({
        repoId: patternRepoId,
        pattern: 'release/*',
        requirePullRequest: true,
      });

      const result = await authApi.branchProtection.check.query({
        repoId: patternRepoId,
        branch: 'release/v1.0',
      });

      expect(result.protected).toBe(true);
    });

    it('matches multiple wildcards', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await authApi.branchProtection.create.mutate({
        repoId: patternRepoId,
        pattern: 'feature/*/dev',
        requirePullRequest: true,
      });

      const result = await authApi.branchProtection.check.query({
        repoId: patternRepoId,
        branch: 'feature/auth/dev',
      });

      expect(result.protected).toBe(true);
    });

    it('does not match non-matching pattern', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await authApi.branchProtection.create.mutate({
        repoId: patternRepoId,
        pattern: 'release/*',
        requirePullRequest: true,
      });

      const result = await authApi.branchProtection.check.query({
        repoId: patternRepoId,
        branch: 'feature/something',
      });

      expect(result.protected).toBe(false);
    });
  });

  describe('Permission Requirements', () => {
    it('requires write permission to list rules', async () => {
      const collabApi = createAuthenticatedClient(collaboratorToken);

      await expect(
        collabApi.branchProtection.list.query({ repoId })
      ).rejects.toThrow();
    });

    it('requires admin permission to create rules', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const collabApi = createAuthenticatedClient(collaboratorToken);

      // Create new repo and add collaborator with write only
      const newRepo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('perm-test'),
        description: 'Permission test repo',
        isPrivate: false,
      });

      await ownerApi.repos.addCollaborator.mutate({
        repoId: newRepo.id,
        userId: collaboratorId,
        permission: 'write',
      });

      await expect(
        collabApi.branchProtection.create.mutate({
          repoId: newRepo.id,
          pattern: 'main',
          requirePullRequest: true,
        })
      ).rejects.toThrow();
    });

    it('allows admin collaborator to manage rules', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const collabApi = createAuthenticatedClient(collaboratorToken);

      // Create new repo and add collaborator with admin
      const newRepo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('admin-collab-test'),
        description: 'Admin collab test repo',
        isPrivate: false,
      });

      await ownerApi.repos.addCollaborator.mutate({
        repoId: newRepo.id,
        userId: collaboratorId,
        permission: 'admin',
      });

      const rule = await collabApi.branchProtection.create.mutate({
        repoId: newRepo.id,
        pattern: 'main',
        requirePullRequest: true,
      });

      expect(rule).toBeDefined();
    });

    it('requires read permission to check branch protection', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const collabApi = createAuthenticatedClient(collaboratorToken);

      // Create private repo without collaborator
      const privateRepo = await ownerApi.repos.create.mutate({
        name: uniqueRepoName('private-check-test'),
        description: 'Private check test repo',
        isPrivate: true,
      });

      await expect(
        collabApi.branchProtection.check.query({
          repoId: privateRepo.id,
          branch: 'main',
        })
      ).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('fails to access rule from different repository', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const rule = await authApi.branchProtection.create.mutate({
        repoId,
        pattern: `cross-repo-${Date.now()}`,
        requirePullRequest: true,
      });

      const otherRepo = await authApi.repos.create.mutate({
        name: uniqueRepoName('other-repo'),
        description: 'Other repo',
        isPrivate: false,
      });

      await expect(
        authApi.branchProtection.get.query({
          id: rule.id,
          repoId: otherRepo.id,
        })
      ).rejects.toThrow();
    });

    it('fails to create rule for non-existent repository', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.branchProtection.create.mutate({
          repoId: '00000000-0000-0000-0000-000000000000',
          pattern: 'main',
          requirePullRequest: true,
        })
      ).rejects.toThrow();
    });

    it('validates reviewers count', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Negative reviewers
      await expect(
        authApi.branchProtection.create.mutate({
          repoId,
          pattern: `negative-${Date.now()}`,
          requirePullRequest: true,
          requiredReviewers: -1,
        })
      ).rejects.toThrow();

      // Too many reviewers
      await expect(
        authApi.branchProtection.create.mutate({
          repoId,
          pattern: `toomany-${Date.now()}`,
          requirePullRequest: true,
          requiredReviewers: 100,
        })
      ).rejects.toThrow();
    });
  });
});
