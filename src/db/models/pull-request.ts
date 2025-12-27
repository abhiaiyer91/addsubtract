import { eq, and, desc, sql, inArray, or, isNull, ne } from 'drizzle-orm';
import { getDb } from '../index';
import {
  pullRequests,
  prReviews,
  prComments,
  prLabels,
  prReviewers,
  labels,
  repositories,
  workflowRuns,
  type PullRequest,
  type NewPullRequest,
  type PrReview,
  type NewPrReview,
  type PrComment,
  type NewPrComment,
  type PrReviewer,
  type NewPrReviewer,
  type Label,
} from '../schema';
import { user } from '../auth-schema';
import { repoModel } from './repository';

// Author type from better-auth user table
type Author = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  avatarUrl: string | null;
};

export const prModel = {
  /**
   * Find a PR by ID
   */
  async findById(id: string): Promise<PullRequest | undefined> {
    const db = getDb();
    const [pr] = await db
      .select()
      .from(pullRequests)
      .where(eq(pullRequests.id, id));
    return pr;
  },

  /**
   * Find a PR by repo and number
   */
  async findByRepoAndNumber(
    repoId: string,
    number: number
  ): Promise<PullRequest | undefined> {
    const db = getDb();
    const [pr] = await db
      .select()
      .from(pullRequests)
      .where(
        and(eq(pullRequests.repoId, repoId), eq(pullRequests.number, number))
      );
    return pr;
  },

  /**
   * Find a PR with author details
   */
  async findWithAuthor(
    id: string
  ): Promise<{ pr: PullRequest; author: Author } | undefined> {
    const db = getDb();
    const result = await db
      .select()
      .from(pullRequests)
      .innerJoin(user, eq(pullRequests.authorId, user.id))
      .where(eq(pullRequests.id, id));

    if (result.length === 0) return undefined;

    return {
      pr: result[0].pull_requests,
      author: {
        id: result[0].user.id,
        name: result[0].user.name,
        email: result[0].user.email,
        username: result[0].user.username,
        image: result[0].user.image,
        avatarUrl: result[0].user.avatarUrl,
      },
    };
  },

  /**
   * Create a new PR
   */
  async create(
    data: Omit<NewPullRequest, 'number'>
  ): Promise<PullRequest> {
    const db = getDb();

    // Get next PR number for this repo
    const [lastPr] = await db
      .select({ number: pullRequests.number })
      .from(pullRequests)
      .where(eq(pullRequests.repoId, data.repoId))
      .orderBy(desc(pullRequests.number))
      .limit(1);

    const number = (lastPr?.number ?? 0) + 1;

    const [pr] = await db
      .insert(pullRequests)
      .values({ ...data, number })
      .returning();

    // Increment open PR count
    await repoModel.incrementCounter(data.repoId, 'openPrsCount', 1);

    return pr;
  },

  /**
   * Update a PR
   */
  async update(
    id: string,
    data: Partial<Omit<NewPullRequest, 'id' | 'repoId' | 'number' | 'createdAt'>>
  ): Promise<PullRequest | undefined> {
    const db = getDb();
    const [pr] = await db
      .update(pullRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(pullRequests.id, id))
      .returning();
    return pr;
  },

  /**
   * List PRs by repo
   */
  async listByRepo(
    repoId: string,
    options: {
      state?: 'open' | 'closed' | 'merged';
      authorId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<PullRequest[]> {
    const db = getDb();
    const conditions = [eq(pullRequests.repoId, repoId)];

    if (options.state) {
      // "closed" includes both "closed" and "merged" PRs for UI purposes
      if (options.state === 'closed') {
        conditions.push(inArray(pullRequests.state, ['closed', 'merged']));
      } else {
        conditions.push(eq(pullRequests.state, options.state));
      }
    }

    if (options.authorId) {
      conditions.push(eq(pullRequests.authorId, options.authorId));
    }

    let query = db
      .select()
      .from(pullRequests)
      .where(and(...conditions))
      .orderBy(desc(pullRequests.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * List PRs authored by a user
   */
  async listByAuthor(
    authorId: string,
    state?: 'open' | 'closed' | 'merged'
  ): Promise<(PullRequest & { repo: { name: string; id: string } })[]> {
    const db = getDb();
    const conditions = [eq(pullRequests.authorId, authorId)];

    if (state) {
      conditions.push(eq(pullRequests.state, state));
    }

    const result = await db
      .select()
      .from(pullRequests)
      .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
      .where(and(...conditions))
      .orderBy(desc(pullRequests.createdAt));

    return result.map((r) => ({
      ...r.pull_requests,
      repo: { name: r.repositories.name, id: r.repositories.id },
    }));
  },

  /**
   * Merge a PR
   */
  async merge(
    id: string,
    mergedById: string,
    mergeSha: string
  ): Promise<PullRequest | undefined> {
    const db = getDb();
    const now = new Date();

    const [pr] = await db
      .update(pullRequests)
      .set({
        state: 'merged',
        mergedAt: now,
        mergedById,
        mergeSha,
        updatedAt: now,
      })
      .where(eq(pullRequests.id, id))
      .returning();

    if (pr) {
      // Decrement open PR count
      await repoModel.incrementCounter(pr.repoId, 'openPrsCount', -1);
    }

    return pr;
  },

  /**
   * Close a PR
   */
  async close(id: string): Promise<PullRequest | undefined> {
    const db = getDb();
    const now = new Date();

    const pr = await this.findById(id);
    if (!pr || pr.state !== 'open') return pr;

    const [updated] = await db
      .update(pullRequests)
      .set({
        state: 'closed',
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(pullRequests.id, id))
      .returning();

    if (updated) {
      // Decrement open PR count
      await repoModel.incrementCounter(updated.repoId, 'openPrsCount', -1);
    }

    return updated;
  },

  /**
   * Reopen a PR
   */
  async reopen(id: string): Promise<PullRequest | undefined> {
    const db = getDb();

    const pr = await this.findById(id);
    if (!pr || pr.state !== 'closed') return pr;

    const [updated] = await db
      .update(pullRequests)
      .set({
        state: 'open',
        closedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(pullRequests.id, id))
      .returning();

    if (updated) {
      // Increment open PR count
      await repoModel.incrementCounter(updated.repoId, 'openPrsCount', 1);
    }

    return updated;
  },

  /**
   * Update head SHA
   */
  async updateHead(id: string, headSha: string): Promise<void> {
    const db = getDb();
    await db
      .update(pullRequests)
      .set({ headSha, updatedAt: new Date() })
      .where(eq(pullRequests.id, id));
  },

  /**
   * Set mergeability status
   */
  async setMergeable(id: string, isMergeable: boolean): Promise<void> {
    const db = getDb();
    await db
      .update(pullRequests)
      .set({ isMergeable })
      .where(eq(pullRequests.id, id));
  },
};

export const prReviewModel = {
  /**
   * Find a review by ID
   */
  async findById(id: string): Promise<PrReview | undefined> {
    const db = getDb();
    const [review] = await db
      .select()
      .from(prReviews)
      .where(eq(prReviews.id, id));
    return review;
  },

  /**
   * List reviews for a PR
   */
  async listByPr(prId: string): Promise<(PrReview & { user: Author })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(prReviews)
      .innerJoin(user, eq(prReviews.userId, user.id))
      .where(eq(prReviews.prId, prId))
      .orderBy(desc(prReviews.createdAt));

    return result.map((r) => ({
      ...r.pr_reviews,
      user: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        username: r.user.username,
        image: r.user.image,
        avatarUrl: r.user.avatarUrl,
      },
    }));
  },

  /**
   * Create a review
   */
  async create(data: NewPrReview): Promise<PrReview> {
    const db = getDb();
    const [review] = await db.insert(prReviews).values(data).returning();
    return review;
  },

  /**
   * Update a review
   */
  async update(
    id: string,
    data: Partial<Omit<NewPrReview, 'id' | 'prId' | 'userId' | 'createdAt'>>
  ): Promise<PrReview | undefined> {
    const db = getDb();
    const [review] = await db
      .update(prReviews)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(prReviews.id, id))
      .returning();
    return review;
  },

  /**
   * Get latest review state for a user
   */
  async getLatestUserReview(
    prId: string,
    userId: string
  ): Promise<PrReview | undefined> {
    const db = getDb();
    const [review] = await db
      .select()
      .from(prReviews)
      .where(and(eq(prReviews.prId, prId), eq(prReviews.userId, userId)))
      .orderBy(desc(prReviews.createdAt))
      .limit(1);
    return review;
  },
};

export const prCommentModel = {
  /**
   * Find a comment by ID
   */
  async findById(id: string): Promise<PrComment | undefined> {
    const db = getDb();
    const [comment] = await db
      .select()
      .from(prComments)
      .where(eq(prComments.id, id));
    return comment;
  },

  /**
   * List comments for a PR
   */
  async listByPr(prId: string): Promise<(PrComment & { user: Author })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(prComments)
      .innerJoin(user, eq(prComments.userId, user.id))
      .where(eq(prComments.prId, prId))
      .orderBy(prComments.createdAt);

    return result.map((r) => ({
      ...r.pr_comments,
      user: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        username: r.user.username,
        image: r.user.image,
        avatarUrl: r.user.avatarUrl,
      },
    }));
  },

  /**
   * List inline comments for a file
   */
  async listByFile(
    prId: string,
    path: string
  ): Promise<(PrComment & { user: Author })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(prComments)
      .innerJoin(user, eq(prComments.userId, user.id))
      .where(and(eq(prComments.prId, prId), eq(prComments.path, path)))
      .orderBy(prComments.line, prComments.createdAt);

    return result.map((r) => ({
      ...r.pr_comments,
      user: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        username: r.user.username,
        image: r.user.image,
        avatarUrl: r.user.avatarUrl,
      },
    }));
  },

  /**
   * Create a comment
   */
  async create(data: NewPrComment): Promise<PrComment> {
    const db = getDb();
    const [comment] = await db.insert(prComments).values(data).returning();
    return comment;
  },

  /**
   * Update a comment
   */
  async update(id: string, body: string): Promise<PrComment | undefined> {
    const db = getDb();
    const [comment] = await db
      .update(prComments)
      .set({ body, updatedAt: new Date() })
      .where(eq(prComments.id, id))
      .returning();
    return comment;
  },

  /**
   * Delete a comment
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(prComments)
      .where(eq(prComments.id, id))
      .returning();
    return result.length > 0;
  },
};

export const prLabelModel = {
  /**
   * Add a label to a PR
   */
  async add(prId: string, labelId: string): Promise<void> {
    const db = getDb();
    await db
      .insert(prLabels)
      .values({ prId, labelId })
      .onConflictDoNothing();
  },

  /**
   * Remove a label from a PR
   */
  async remove(prId: string, labelId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(prLabels)
      .where(and(eq(prLabels.prId, prId), eq(prLabels.labelId, labelId)))
      .returning();
    return result.length > 0;
  },

  /**
   * List labels for a PR
   */
  async listByPr(prId: string): Promise<Label[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(prLabels)
      .innerJoin(labels, eq(prLabels.labelId, labels.id))
      .where(eq(prLabels.prId, prId));

    return result.map((r) => r.labels);
  },

  /**
   * Set labels for a PR (replace all)
   */
  async setLabels(prId: string, labelIds: string[]): Promise<void> {
    const db = getDb();

    // Remove all existing labels
    await db.delete(prLabels).where(eq(prLabels.prId, prId));

    // Add new labels
    if (labelIds.length > 0) {
      await db
        .insert(prLabels)
        .values(labelIds.map((labelId) => ({ prId, labelId })));
    }
  },
};

// ============ PR REVIEWERS MODEL ============

export const prReviewerModel = {
  /**
   * Request a review from a user
   */
  async requestReview(
    prId: string,
    userId: string,
    requestedById: string
  ): Promise<PrReviewer> {
    const db = getDb();
    const [reviewer] = await db
      .insert(prReviewers)
      .values({
        prId,
        userId,
        requestedById,
        state: 'pending',
      })
      .onConflictDoUpdate({
        target: [prReviewers.prId, prReviewers.userId],
        set: {
          state: 'pending',
          requestedById,
          requestedAt: new Date(),
          completedAt: null,
        },
      })
      .returning();
    return reviewer;
  },

  /**
   * Mark a review request as completed
   */
  async completeReview(prId: string, userId: string): Promise<PrReviewer | undefined> {
    const db = getDb();
    const [reviewer] = await db
      .update(prReviewers)
      .set({
        state: 'completed',
        completedAt: new Date(),
      })
      .where(and(eq(prReviewers.prId, prId), eq(prReviewers.userId, userId)))
      .returning();
    return reviewer;
  },

  /**
   * Dismiss a review request
   */
  async dismissReview(prId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .update(prReviewers)
      .set({ state: 'dismissed' })
      .where(and(eq(prReviewers.prId, prId), eq(prReviewers.userId, userId)))
      .returning();
    return result.length > 0;
  },

  /**
   * Remove a reviewer from a PR
   */
  async removeReviewer(prId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(prReviewers)
      .where(and(eq(prReviewers.prId, prId), eq(prReviewers.userId, userId)))
      .returning();
    return result.length > 0;
  },

  /**
   * List reviewers for a PR
   */
  async listByPr(prId: string): Promise<(PrReviewer & { user: Author })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(prReviewers)
      .innerJoin(user, eq(prReviewers.userId, user.id))
      .where(eq(prReviewers.prId, prId))
      .orderBy(prReviewers.requestedAt);

    return result.map((r) => ({
      ...r.pr_reviewers,
      user: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        username: r.user.username,
        image: r.user.image,
        avatarUrl: r.user.avatarUrl,
      },
    }));
  },

  /**
   * Get pending review requests for a user
   */
  async getPendingForUser(userId: string): Promise<PrReviewer[]> {
    const db = getDb();
    return db
      .select()
      .from(prReviewers)
      .where(and(eq(prReviewers.userId, userId), eq(prReviewers.state, 'pending')));
  },

  /**
   * Check if a user has a pending review request for a PR
   */
  async hasPendingReview(prId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .select({ id: prReviewers.id })
      .from(prReviewers)
      .where(
        and(
          eq(prReviewers.prId, prId),
          eq(prReviewers.userId, userId),
          eq(prReviewers.state, 'pending')
        )
      )
      .limit(1);
    return result.length > 0;
  },
};

// ============ INBOX MODEL ============

// Type for inbox PR items with extra context
export type InboxPr = PullRequest & {
  repo: { id: string; name: string; ownerId: string };
  author: Author | null;
  labels: Label[];
  reviewState?: 'pending' | 'approved' | 'changes_requested' | 'commented' | null;
  ciStatus?: 'success' | 'failure' | 'pending' | null;
  reviewRequestedAt?: Date | null;
};

export const inboxModel = {
  /**
   * Get PRs where the user is requested as a reviewer (awaiting my review)
   */
  async getAwaitingReview(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<InboxPr[]> {
    const db = getDb();
    const { limit = 50, offset = 0 } = options;

    // Get PRs where user has pending review request and PR is open
    const result = await db
      .select({
        pr: pullRequests,
        repo: {
          id: repositories.id,
          name: repositories.name,
          ownerId: repositories.ownerId,
        },
        reviewer: prReviewers,
      })
      .from(prReviewers)
      .innerJoin(pullRequests, eq(prReviewers.prId, pullRequests.id))
      .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
      .where(
        and(
          eq(prReviewers.userId, userId),
          eq(prReviewers.state, 'pending'),
          eq(pullRequests.state, 'open')
        )
      )
      .orderBy(desc(prReviewers.requestedAt))
      .limit(limit)
      .offset(offset);

    // Enrich with author, labels, and CI status
    return Promise.all(
      result.map(async (r) => {
        const authorResult = await prModel.findWithAuthor(r.pr.id);
        const labels = await prLabelModel.listByPr(r.pr.id);
        const ciStatus = await getCiStatus(r.pr.repoId, r.pr.headSha);

        return {
          ...r.pr,
          repo: r.repo,
          author: authorResult?.author ?? null,
          labels,
          reviewRequestedAt: r.reviewer.requestedAt,
          ciStatus,
        };
      })
    );
  },

  /**
   * Get PRs authored by the user that are awaiting reviews
   */
  async getMyPrsAwaitingReview(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<InboxPr[]> {
    const db = getDb();
    const { limit = 50, offset = 0 } = options;

    // Get open PRs by the user
    const result = await db
      .select({
        pr: pullRequests,
        repo: {
          id: repositories.id,
          name: repositories.name,
          ownerId: repositories.ownerId,
        },
      })
      .from(pullRequests)
      .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
      .where(and(eq(pullRequests.authorId, userId), eq(pullRequests.state, 'open')))
      .orderBy(desc(pullRequests.updatedAt))
      .limit(limit)
      .offset(offset);

    // Enrich with review status, labels, and CI status
    return Promise.all(
      result.map(async (r) => {
        const authorResult = await prModel.findWithAuthor(r.pr.id);
        const labels = await prLabelModel.listByPr(r.pr.id);
        const reviewState = await getLatestReviewState(r.pr.id);
        const ciStatus = await getCiStatus(r.pr.repoId, r.pr.headSha);

        return {
          ...r.pr,
          repo: r.repo,
          author: authorResult?.author ?? null,
          labels,
          reviewState,
          ciStatus,
        };
      })
    );
  },

  /**
   * Get PRs where the user has participated (commented or reviewed)
   */
  async getParticipated(
    userId: string,
    options: { limit?: number; offset?: number; state?: 'open' | 'closed' | 'all' } = {}
  ): Promise<InboxPr[]> {
    const db = getDb();
    const { limit = 50, offset = 0, state = 'open' } = options;

    // Find PRs where user has reviewed or commented (but isn't the author)
    const reviewedPrIds = db
      .selectDistinct({ prId: prReviews.prId })
      .from(prReviews)
      .where(eq(prReviews.userId, userId));

    const commentedPrIds = db
      .selectDistinct({ prId: prComments.prId })
      .from(prComments)
      .where(eq(prComments.userId, userId));

    // Combine and get PRs
    const conditions = [
      ne(pullRequests.authorId, userId), // Exclude user's own PRs
      or(
        inArray(pullRequests.id, reviewedPrIds),
        inArray(pullRequests.id, commentedPrIds)
      ),
    ];

    if (state !== 'all') {
      conditions.push(eq(pullRequests.state, state));
    }

    const result = await db
      .select({
        pr: pullRequests,
        repo: {
          id: repositories.id,
          name: repositories.name,
          ownerId: repositories.ownerId,
        },
      })
      .from(pullRequests)
      .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
      .where(and(...conditions))
      .orderBy(desc(pullRequests.updatedAt))
      .limit(limit)
      .offset(offset);

    // Enrich with author, labels, and status
    return Promise.all(
      result.map(async (r) => {
        const authorResult = await prModel.findWithAuthor(r.pr.id);
        const labels = await prLabelModel.listByPr(r.pr.id);
        const reviewState = await getLatestReviewState(r.pr.id, userId);
        const ciStatus = await getCiStatus(r.pr.repoId, r.pr.headSha);

        return {
          ...r.pr,
          repo: r.repo,
          author: authorResult?.author ?? null,
          labels,
          reviewState,
          ciStatus,
        };
      })
    );
  },

  /**
   * Get inbox summary counts for a user
   */
  async getSummary(userId: string): Promise<{
    awaitingReview: number;
    myPrsOpen: number;
    participated: number;
  }> {
    const db = getDb();

    // Count PRs awaiting review
    const awaitingReviewResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(prReviewers)
      .innerJoin(pullRequests, eq(prReviewers.prId, pullRequests.id))
      .where(
        and(
          eq(prReviewers.userId, userId),
          eq(prReviewers.state, 'pending'),
          eq(pullRequests.state, 'open')
        )
      );

    // Count user's open PRs
    const myPrsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(pullRequests)
      .where(and(eq(pullRequests.authorId, userId), eq(pullRequests.state, 'open')));

    // Count participated PRs (rough count - PRs where user reviewed)
    const participatedResult = await db
      .select({ count: sql<number>`count(distinct ${prReviews.prId})` })
      .from(prReviews)
      .innerJoin(pullRequests, eq(prReviews.prId, pullRequests.id))
      .where(
        and(
          eq(prReviews.userId, userId),
          eq(pullRequests.state, 'open'),
          ne(pullRequests.authorId, userId)
        )
      );

    return {
      awaitingReview: Number(awaitingReviewResult[0]?.count ?? 0),
      myPrsOpen: Number(myPrsResult[0]?.count ?? 0),
      participated: Number(participatedResult[0]?.count ?? 0),
    };
  },
};

// ============ HELPER FUNCTIONS ============

/**
 * Get the latest review state for a PR
 */
async function getLatestReviewState(
  prId: string,
  userId?: string
): Promise<'approved' | 'changes_requested' | 'commented' | 'pending' | null> {
  const db = getDb();

  const conditions = [eq(prReviews.prId, prId)];
  if (userId) {
    conditions.push(eq(prReviews.userId, userId));
  }

  const reviews = await db
    .select({ state: prReviews.state })
    .from(prReviews)
    .where(and(...conditions))
    .orderBy(desc(prReviews.createdAt));

  if (reviews.length === 0) return null;

  // Return the most significant state (approved > changes_requested > commented)
  const hasApproved = reviews.some((r) => r.state === 'approved');
  const hasChangesRequested = reviews.some((r) => r.state === 'changes_requested');

  if (hasChangesRequested) return 'changes_requested';
  if (hasApproved) return 'approved';
  return 'commented';
}

/**
 * Get CI status for a commit
 */
async function getCiStatus(
  repoId: string,
  commitSha: string
): Promise<'success' | 'failure' | 'pending' | null> {
  const db = getDb();

  const runs = await db
    .select({ state: workflowRuns.state, conclusion: workflowRuns.conclusion })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.repoId, repoId), eq(workflowRuns.commitSha, commitSha)))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(5);

  if (runs.length === 0) return null;

  // Check if any are still running
  const hasPending = runs.some((r) => r.state === 'queued' || r.state === 'in_progress');
  if (hasPending) return 'pending';

  // Check for failures
  const hasFailed = runs.some((r) => r.conclusion === 'failure');
  if (hasFailed) return 'failure';

  // All completed successfully
  return 'success';
}
