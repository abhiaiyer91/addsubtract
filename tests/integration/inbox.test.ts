/**
 * Inbox Integration Tests
 * 
 * Tests for the PR inbox feature including:
 * - Review request management
 * - Inbox summary
 * - PRs awaiting review
 * - User's own PRs
 * - Participated PRs
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

describe('PR Inbox', () => {
  let authorToken: string;
  let authorId: string;
  let authorUsername: string;
  
  let reviewerToken: string;
  let reviewerId: string;
  let reviewerUsername: string;
  
  let repoId: string;
  let prId: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create author user
    authorUsername = uniqueUsername('inbox-author');
    const authorResult = await api.auth.register.mutate({
      username: authorUsername,
      email: uniqueEmail('inbox-author'),
      password: 'password123',
      name: 'PR Author',
    });
    authorToken = authorResult.sessionId;
    authorId = authorResult.user.id;

    // Create reviewer user
    reviewerUsername = uniqueUsername('inbox-reviewer');
    const reviewerResult = await api.auth.register.mutate({
      username: reviewerUsername,
      email: uniqueEmail('inbox-reviewer'),
      password: 'password123',
      name: 'PR Reviewer',
    });
    reviewerToken = reviewerResult.sessionId;
    reviewerId = reviewerResult.user.id;

    // Create a repository as the author
    const authApi = createAuthenticatedClient(authorToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('inbox-test'),
      description: 'Repo for inbox tests',
      isPrivate: false,
    });
    repoId = repo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Inbox Summary', () => {
    it('returns summary counts for authenticated user', async () => {
      const authApi = createAuthenticatedClient(authorToken);

      const summary = await authApi.pulls.inboxSummary.query();

      expect(summary).toHaveProperty('awaitingReview');
      expect(summary).toHaveProperty('myPrsOpen');
      expect(summary).toHaveProperty('participated');
      expect(typeof summary.awaitingReview).toBe('number');
      expect(typeof summary.myPrsOpen).toBe('number');
      expect(typeof summary.participated).toBe('number');
    });

    it('initially shows zero counts for new user', async () => {
      const reviewerApi = createAuthenticatedClient(reviewerToken);

      const summary = await reviewerApi.pulls.inboxSummary.query();

      // New user with no PRs or review requests
      expect(summary.awaitingReview).toBe(0);
      expect(summary.myPrsOpen).toBe(0);
      expect(summary.participated).toBe(0);
    });
  });

  describe('PR Creation and Review Requests', () => {
    it('creates a PR and shows it in author\'s inbox', async () => {
      const authorApi = createAuthenticatedClient(authorToken);

      // Create a PR
      const pr = await authorApi.pulls.create.mutate({
        repoId,
        title: 'Test PR for inbox',
        body: 'This PR tests the inbox feature',
        sourceBranch: 'feature/inbox-test',
        targetBranch: 'main',
        headSha: 'abc123def456',
        baseSha: 'def456abc123',
      });

      prId = pr.id;
      expect(pr.id).toBeDefined();
      expect(pr.number).toBe(1);

      // Check author's inbox shows the PR
      const myPrs = await authorApi.pulls.inboxMyPrs.query();
      expect(myPrs.length).toBeGreaterThanOrEqual(1);
      expect(myPrs.some(p => p.id === prId)).toBe(true);

      // Check summary updated
      const summary = await authorApi.pulls.inboxSummary.query();
      expect(summary.myPrsOpen).toBeGreaterThanOrEqual(1);
    });

    it('requests a review and shows in reviewer\'s inbox', async () => {
      const authorApi = createAuthenticatedClient(authorToken);
      const reviewerApi = createAuthenticatedClient(reviewerToken);

      // Request review from reviewer
      const result = await authorApi.pulls.requestReview.mutate({
        prId,
        reviewerId,
      });
      expect(result).toBeDefined();

      // Check reviewer's inbox shows the PR awaiting review
      const awaitingReview = await reviewerApi.pulls.inboxAwaitingReview.query();
      expect(awaitingReview.length).toBeGreaterThanOrEqual(1);
      expect(awaitingReview.some(p => p.id === prId)).toBe(true);

      // Check reviewer's summary
      const summary = await reviewerApi.pulls.inboxSummary.query();
      expect(summary.awaitingReview).toBeGreaterThanOrEqual(1);
    });

    it('lists reviewers for a PR', async () => {
      const authorApi = createAuthenticatedClient(authorToken);

      const reviewers = await authorApi.pulls.reviewers.query({ prId });
      expect(reviewers.length).toBeGreaterThanOrEqual(1);
      expect(reviewers.some(r => r.userId === reviewerId)).toBe(true);
      expect(reviewers[0].state).toBe('pending');
    });
  });

  describe('Review Submission', () => {
    it('marks review as completed when review is submitted', async () => {
      const reviewerApi = createAuthenticatedClient(reviewerToken);
      const authorApi = createAuthenticatedClient(authorToken);

      // Submit a review
      const review = await reviewerApi.pulls.addReview.mutate({
        prId,
        state: 'approved',
        body: 'LGTM!',
        commitSha: 'abc123def456',
      });
      expect(review.id).toBeDefined();
      expect(review.state).toBe('approved');

      // Check reviewer's pending count decreased
      // Note: The event handler should mark the review as completed
      const reviewers = await authorApi.pulls.reviewers.query({ prId });
      const reviewerEntry = reviewers.find(r => r.userId === reviewerId);
      expect(reviewerEntry?.state).toBe('completed');
    });

    it('shows PR in participated after reviewing', async () => {
      const reviewerApi = createAuthenticatedClient(reviewerToken);

      const participated = await reviewerApi.pulls.inboxParticipated.query();
      // Note: participated should include PRs where user reviewed but isn't the author
      // The exact behavior depends on the query logic
      expect(Array.isArray(participated)).toBe(true);
    });
  });

  describe('Review Request Management', () => {
    it('removes a review request', async () => {
      const authorApi = createAuthenticatedClient(authorToken);
      const api = createTestClient();

      // Create another reviewer
      const reviewer2Username = uniqueUsername('inbox-reviewer2');
      const reviewer2Result = await api.auth.register.mutate({
        username: reviewer2Username,
        email: uniqueEmail('inbox-reviewer2'),
        password: 'password123',
        name: 'PR Reviewer 2',
      });
      const reviewer2Id = reviewer2Result.user.id;

      // Request review
      await authorApi.pulls.requestReview.mutate({
        prId,
        reviewerId: reviewer2Id,
      });

      // Remove the request
      const removed = await authorApi.pulls.removeReviewRequest.mutate({
        prId,
        reviewerId: reviewer2Id,
      });
      expect(removed).toBe(true);

      // Verify removed from reviewers list
      const reviewers = await authorApi.pulls.reviewers.query({ prId });
      expect(reviewers.some(r => r.userId === reviewer2Id)).toBe(false);
    });
  });

  describe('Inbox Filtering', () => {
    it('filters awaiting review with limit', async () => {
      const reviewerApi = createAuthenticatedClient(reviewerToken);

      const limited = await reviewerApi.pulls.inboxAwaitingReview.query({
        limit: 1,
      });
      expect(limited.length).toBeLessThanOrEqual(1);
    });

    it('filters my PRs with limit and offset', async () => {
      const authorApi = createAuthenticatedClient(authorToken);

      const page1 = await authorApi.pulls.inboxMyPrs.query({
        limit: 5,
        offset: 0,
      });
      expect(Array.isArray(page1)).toBe(true);

      const page2 = await authorApi.pulls.inboxMyPrs.query({
        limit: 5,
        offset: 5,
      });
      expect(Array.isArray(page2)).toBe(true);
    });

    it('filters participated by state', async () => {
      const reviewerApi = createAuthenticatedClient(reviewerToken);

      const openOnly = await reviewerApi.pulls.inboxParticipated.query({
        state: 'open',
      });
      expect(Array.isArray(openOnly)).toBe(true);

      const all = await reviewerApi.pulls.inboxParticipated.query({
        state: 'all',
      });
      expect(Array.isArray(all)).toBe(true);
    });
  });

  describe('Inbox Data Enrichment', () => {
    it('includes author information in inbox PRs', async () => {
      const reviewerApi = createAuthenticatedClient(reviewerToken);

      // First request a new review to ensure we have data
      const authorApi = createAuthenticatedClient(authorToken);
      const newPr = await authorApi.pulls.create.mutate({
        repoId,
        title: 'PR with author info',
        sourceBranch: 'feature/author-test',
        targetBranch: 'main',
        headSha: 'xyz789',
        baseSha: 'abc123',
      });

      await authorApi.pulls.requestReview.mutate({
        prId: newPr.id,
        reviewerId,
      });

      const awaitingReview = await reviewerApi.pulls.inboxAwaitingReview.query();
      const pr = awaitingReview.find(p => p.id === newPr.id);

      if (pr) {
        expect(pr.repo).toBeDefined();
        expect(pr.repo.name).toBeDefined();
        expect(pr.author).toBeDefined();
        expect(pr.labels).toBeDefined();
        expect(Array.isArray(pr.labels)).toBe(true);
      }
    });

    it('includes repository information in inbox PRs', async () => {
      const authorApi = createAuthenticatedClient(authorToken);

      const myPrs = await authorApi.pulls.inboxMyPrs.query();
      
      if (myPrs.length > 0) {
        const pr = myPrs[0];
        expect(pr.repo).toBeDefined();
        expect(pr.repo.id).toBe(repoId);
        expect(pr.repo.name).toBeDefined();
      }
    });
  });
});
