/**
 * Comments Integration Tests
 * 
 * Tests for comment management on issues and pull requests including:
 * - Comment CRUD operations
 * - Issue comments
 * - PR comments
 * - File-level PR comments
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

describe('Comments Flow', () => {
  let ownerToken: string;
  let userToken: string;
  let ownerId: string;
  let userId: string;
  let ownerUsername: string;
  let repoId: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create repo owner
    ownerUsername = uniqueUsername('commentowner');
    const ownerResult = await api.auth.register.mutate({
      username: ownerUsername,
      email: uniqueEmail('commentowner'),
      password: 'password123',
      name: 'Comment Owner',
    });
    ownerToken = ownerResult.sessionId;
    ownerId = ownerResult.user.id;

    // Create another user
    const userResult = await api.auth.register.mutate({
      username: uniqueUsername('commentuser'),
      email: uniqueEmail('commentuser'),
      password: 'password123',
      name: 'Comment User',
    });
    userToken = userResult.sessionId;
    userId = userResult.user.id;

    // Create a test repository
    const ownerApi = createAuthenticatedClient(ownerToken);
    const repo = await ownerApi.repos.create.mutate({
      name: uniqueRepoName('comment-test'),
      description: 'Repo for comment tests',
      isPrivate: false,
    });
    repoId = repo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Issue Comments', () => {
    let issueId: string;

    beforeEach(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const issue = await authApi.issues.create.mutate({
        repoId,
        title: `Comment Test Issue ${Date.now()}`,
        body: 'Issue for comment testing',
      });
      issueId = issue.id;
    });

    it('creates issue comment', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const comment = await authApi.comments.createIssueComment.mutate({
        issueId,
        body: 'This is a test comment on an issue',
      });

      expect(comment).toBeDefined();
      expect(comment.body).toBe('This is a test comment on an issue');
      expect(comment.userId).toBe(ownerId);
    });

    it('lists issue comments', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Add some comments
      await authApi.comments.createIssueComment.mutate({
        issueId,
        body: 'First comment',
      });
      await authApi.comments.createIssueComment.mutate({
        issueId,
        body: 'Second comment',
      });

      const comments = await api.comments.listIssueComments.query({ issueId });

      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBe(2);
    });

    it('gets issue comment by ID', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const created = await authApi.comments.createIssueComment.mutate({
        issueId,
        body: 'Get by ID test',
      });

      const comment = await api.comments.getIssueComment.query({ id: created.id });

      expect(comment).toBeDefined();
      expect(comment.id).toBe(created.id);
      expect(comment.body).toBe('Get by ID test');
    });

    it('updates issue comment', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const comment = await authApi.comments.createIssueComment.mutate({
        issueId,
        body: 'Original comment',
      });

      const updated = await authApi.comments.updateIssueComment.mutate({
        id: comment.id,
        body: 'Updated comment',
      });

      expect(updated.body).toBe('Updated comment');
    });

    it('fails to update other users comment', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const userApi = createAuthenticatedClient(userToken);

      const comment = await ownerApi.comments.createIssueComment.mutate({
        issueId,
        body: 'Owner comment',
      });

      await expect(
        userApi.comments.updateIssueComment.mutate({
          id: comment.id,
          body: 'Hacked comment',
        })
      ).rejects.toThrow();
    });

    it('deletes issue comment', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const comment = await authApi.comments.createIssueComment.mutate({
        issueId,
        body: 'To be deleted',
      });

      await authApi.comments.deleteIssueComment.mutate({ id: comment.id });

      await expect(
        api.comments.getIssueComment.query({ id: comment.id })
      ).rejects.toThrow();
    });

    it('fails to delete other users comment', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const userApi = createAuthenticatedClient(userToken);

      const comment = await ownerApi.comments.createIssueComment.mutate({
        issueId,
        body: 'Protected comment',
      });

      await expect(
        userApi.comments.deleteIssueComment.mutate({ id: comment.id })
      ).rejects.toThrow();
    });
  });

  describe('Pull Request Comments', () => {
    let prId: string;

    beforeEach(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const pr = await authApi.pulls.create.mutate({
        repoId,
        title: `Comment Test PR ${Date.now()}`,
        body: 'PR for comment testing',
        sourceBranch: 'feature',
        targetBranch: 'main',
        headSha: '0'.repeat(64),
        baseSha: '1'.repeat(64),
        isDraft: false,
      });
      prId = pr.id;
    });

    it('creates PR comment', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const comment = await authApi.comments.createPrComment.mutate({
        prId,
        body: 'This is a test comment on a PR',
      });

      expect(comment).toBeDefined();
      expect(comment.body).toBe('This is a test comment on a PR');
      expect(comment.userId).toBe(ownerId);
    });

    it('lists PR comments', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      await authApi.comments.createPrComment.mutate({
        prId,
        body: 'First PR comment',
      });
      await authApi.comments.createPrComment.mutate({
        prId,
        body: 'Second PR comment',
      });

      const comments = await api.comments.listPrComments.query({ prId });

      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBe(2);
    });

    it('gets PR comment by ID', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const created = await authApi.comments.createPrComment.mutate({
        prId,
        body: 'Get by ID PR comment',
      });

      const comment = await api.comments.getPrComment.query({ id: created.id });

      expect(comment).toBeDefined();
      expect(comment.id).toBe(created.id);
    });

    it('updates PR comment', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const comment = await authApi.comments.createPrComment.mutate({
        prId,
        body: 'Original PR comment',
      });

      const updated = await authApi.comments.updatePrComment.mutate({
        id: comment.id,
        body: 'Updated PR comment',
      });

      expect(updated.body).toBe('Updated PR comment');
    });

    it('deletes PR comment', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const comment = await authApi.comments.createPrComment.mutate({
        prId,
        body: 'PR comment to delete',
      });

      await authApi.comments.deletePrComment.mutate({ id: comment.id });

      await expect(
        api.comments.getPrComment.query({ id: comment.id })
      ).rejects.toThrow();
    });

    it('creates file-level PR comment', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const comment = await authApi.comments.createPrComment.mutate({
        prId,
        body: 'Comment on specific file',
        path: 'src/index.ts',
        line: 42,
      });

      expect(comment.path).toBe('src/index.ts');
      expect(comment.line).toBe(42);
    });

    it('lists file comments for PR', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Regular comment
      await authApi.comments.createPrComment.mutate({
        prId,
        body: 'Regular comment',
      });

      // File comment
      await authApi.comments.createPrComment.mutate({
        prId,
        body: 'File comment',
        path: 'src/file.ts',
        line: 10,
      });

      const fileComments = await api.comments.listPrFileComments.query({ prId });

      expect(Array.isArray(fileComments)).toBe(true);
      // File comments should have path and line
      fileComments.forEach(c => {
        expect(c.path).toBeDefined();
      });
    });
  });

  describe('Comment Formatting', () => {
    let issueId: string;

    beforeEach(async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const issue = await authApi.issues.create.mutate({
        repoId,
        title: `Format Test Issue ${Date.now()}`,
        body: 'Issue for format testing',
      });
      issueId = issue.id;
    });

    it('preserves markdown in comments', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const markdown = `
# Header
- List item 1
- List item 2

\`\`\`javascript
const code = 'example';
\`\`\`
      `.trim();

      const comment = await authApi.comments.createIssueComment.mutate({
        issueId,
        body: markdown,
      });

      expect(comment.body).toBe(markdown);
    });

    it('handles unicode in comments', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const unicodeText = 'Hello 世界! 🎉 émojis and áccents';

      const comment = await authApi.comments.createIssueComment.mutate({
        issueId,
        body: unicodeText,
      });

      expect(comment.body).toBe(unicodeText);
    });

    it('handles long comments', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const longText = 'A'.repeat(10000);

      const comment = await authApi.comments.createIssueComment.mutate({
        issueId,
        body: longText,
      });

      expect(comment.body.length).toBe(10000);
    });
  });

  describe('Comment Authentication', () => {
    let issueId: string;
    let prId: string;

    beforeEach(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const issue = await authApi.issues.create.mutate({
        repoId,
        title: `Auth Test Issue ${Date.now()}`,
        body: 'Issue for auth testing',
      });
      issueId = issue.id;

      const pr = await authApi.pulls.create.mutate({
        repoId,
        title: `Auth Test PR ${Date.now()}`,
        body: 'PR for auth testing',
        sourceBranch: 'feature',
        targetBranch: 'main',
        headSha: '0'.repeat(64),
        baseSha: '1'.repeat(64),
        isDraft: false,
      });
      prId = pr.id;
    });

    it('requires auth to create issue comment', async () => {
      const api = createTestClient();

      await expect(
        api.comments.createIssueComment.mutate({
          issueId,
          body: 'Unauthorized comment',
        })
      ).rejects.toThrow();
    });

    it('requires auth to create PR comment', async () => {
      const api = createTestClient();

      await expect(
        api.comments.createPrComment.mutate({
          prId,
          body: 'Unauthorized PR comment',
        })
      ).rejects.toThrow();
    });

    it('allows reading comments without auth', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      await authApi.comments.createIssueComment.mutate({
        issueId,
        body: 'Public comment',
      });

      const comments = await api.comments.listIssueComments.query({ issueId });

      expect(comments.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('fails to comment on non-existent issue', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.comments.createIssueComment.mutate({
          issueId: '00000000-0000-0000-0000-000000000000',
          body: 'Comment on nothing',
        })
      ).rejects.toThrow();
    });

    it('fails to comment on non-existent PR', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.comments.createPrComment.mutate({
          prId: '00000000-0000-0000-0000-000000000000',
          body: 'Comment on nothing',
        })
      ).rejects.toThrow();
    });

    it('fails to get non-existent comment', async () => {
      const api = createTestClient();

      await expect(
        api.comments.getIssueComment.query({
          id: '00000000-0000-0000-0000-000000000000',
        })
      ).rejects.toThrow();
    });

    it('handles empty body validation', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const issue = await authApi.issues.create.mutate({
        repoId,
        title: `Empty Body Test ${Date.now()}`,
        body: 'Test issue',
      });

      await expect(
        authApi.comments.createIssueComment.mutate({
          issueId: issue.id,
          body: '',
        })
      ).rejects.toThrow();
    });
  });
});
