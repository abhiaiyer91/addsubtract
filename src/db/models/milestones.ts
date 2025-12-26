import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../index';
import {
  milestones,
  issues,
  pullRequests,
  type Milestone,
  type NewMilestone,
  type MilestoneState,
  type Issue,
  type PullRequest,
} from '../schema';

// =============================================================================
// Types
// =============================================================================

export interface MilestoneWithProgress extends Milestone {
  openIssuesCount: number;
  closedIssuesCount: number;
  openPullRequestsCount: number;
  closedPullRequestsCount: number;
  progress: number; // Percentage 0-100
}

// =============================================================================
// Milestone Model
// =============================================================================

export const milestoneModel = {
  /**
   * Find a milestone by ID
   */
  async findById(id: string): Promise<Milestone | undefined> {
    const db = getDb();
    const [milestone] = await db
      .select()
      .from(milestones)
      .where(eq(milestones.id, id));
    return milestone;
  },

  /**
   * Find a milestone by ID with progress statistics
   */
  async findByIdWithProgress(id: string): Promise<MilestoneWithProgress | undefined> {
    const milestone = await this.findById(id);
    if (!milestone) return undefined;

    return this.addProgress(milestone);
  },

  /**
   * List milestones for a repository
   */
  async listByRepo(
    repoId: string,
    options: {
      state?: MilestoneState;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Milestone[]> {
    const db = getDb();
    const { state, limit = 50, offset = 0 } = options;

    const conditions = [eq(milestones.repoId, repoId)];

    if (state) {
      conditions.push(eq(milestones.state, state));
    }

    let query = db
      .select()
      .from(milestones)
      .where(and(...conditions))
      .orderBy(milestones.dueDate, milestones.createdAt);

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    if (offset) {
      query = query.offset(offset) as typeof query;
    }

    return query;
  },

  /**
   * List milestones for a repository with progress statistics
   */
  async listByRepoWithProgress(
    repoId: string,
    options: {
      state?: MilestoneState;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<MilestoneWithProgress[]> {
    const milestonesList = await this.listByRepo(repoId, options);
    return Promise.all(milestonesList.map((m) => this.addProgress(m)));
  },

  /**
   * Create a new milestone
   */
  async create(
    data: Omit<NewMilestone, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Milestone> {
    const db = getDb();
    const [milestone] = await db.insert(milestones).values(data).returning();
    return milestone;
  },

  /**
   * Update a milestone
   */
  async update(
    id: string,
    data: Partial<Omit<NewMilestone, 'id' | 'repoId' | 'createdAt'>>
  ): Promise<Milestone | undefined> {
    const db = getDb();

    const updateData: Partial<NewMilestone> & { closedAt?: Date | null } = {
      ...data,
      updatedAt: new Date(),
    };

    // Handle state change
    if (data.state === 'closed') {
      updateData.closedAt = new Date();
    } else if (data.state === 'open') {
      updateData.closedAt = null;
    }

    const [milestone] = await db
      .update(milestones)
      .set(updateData)
      .where(eq(milestones.id, id))
      .returning();

    return milestone;
  },

  /**
   * Close a milestone
   */
  async close(id: string): Promise<Milestone | undefined> {
    return this.update(id, { state: 'closed' });
  },

  /**
   * Reopen a milestone
   */
  async reopen(id: string): Promise<Milestone | undefined> {
    return this.update(id, { state: 'open' });
  },

  /**
   * Delete a milestone
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(milestones)
      .where(eq(milestones.id, id))
      .returning({ id: milestones.id });

    return result.length > 0;
  },

  /**
   * Get issues for a milestone
   */
  async getIssues(
    milestoneId: string,
    options?: { state?: 'open' | 'closed'; limit?: number; offset?: number }
  ): Promise<Issue[]> {
    const db = getDb();
    const { state, limit = 50, offset = 0 } = options ?? {};

    const conditions = [eq(issues.milestoneId, milestoneId)];

    if (state) {
      conditions.push(eq(issues.state, state));
    }

    let query = db
      .select()
      .from(issues)
      .where(and(...conditions))
      .orderBy(desc(issues.createdAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    if (offset) {
      query = query.offset(offset) as typeof query;
    }

    return query;
  },

  /**
   * Get pull requests for a milestone
   */
  async getPullRequests(
    milestoneId: string,
    options?: { state?: 'open' | 'closed' | 'merged'; limit?: number; offset?: number }
  ): Promise<PullRequest[]> {
    const db = getDb();
    const { state, limit = 50, offset = 0 } = options ?? {};

    const conditions = [eq(pullRequests.milestoneId, milestoneId)];

    if (state) {
      conditions.push(eq(pullRequests.state, state));
    }

    let query = db
      .select()
      .from(pullRequests)
      .where(and(...conditions))
      .orderBy(desc(pullRequests.createdAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    if (offset) {
      query = query.offset(offset) as typeof query;
    }

    return query;
  },

  /**
   * Assign an issue to a milestone
   */
  async assignIssue(issueId: string, milestoneId: string | null): Promise<boolean> {
    const db = getDb();
    const result = await db
      .update(issues)
      .set({ milestoneId, updatedAt: new Date() })
      .where(eq(issues.id, issueId))
      .returning({ id: issues.id });

    return result.length > 0;
  },

  /**
   * Assign a pull request to a milestone
   */
  async assignPullRequest(
    pullRequestId: string,
    milestoneId: string | null
  ): Promise<boolean> {
    const db = getDb();
    const result = await db
      .update(pullRequests)
      .set({ milestoneId, updatedAt: new Date() })
      .where(eq(pullRequests.id, pullRequestId))
      .returning({ id: pullRequests.id });

    return result.length > 0;
  },

  /**
   * Get milestone counts for a repository
   */
  async getCounts(repoId: string): Promise<{ open: number; closed: number }> {
    const db = getDb();
    const results = await db
      .select({
        state: milestones.state,
        count: sql<number>`count(*)::int`,
      })
      .from(milestones)
      .where(eq(milestones.repoId, repoId))
      .groupBy(milestones.state);

    const counts = { open: 0, closed: 0 };
    for (const row of results) {
      counts[row.state] = row.count;
    }

    return counts;
  },

  /**
   * Add progress statistics to a milestone
   */
  async addProgress(milestone: Milestone): Promise<MilestoneWithProgress> {
    const db = getDb();

    // Get issue counts
    const issueCounts = await db
      .select({
        state: issues.state,
        count: sql<number>`count(*)::int`,
      })
      .from(issues)
      .where(eq(issues.milestoneId, milestone.id))
      .groupBy(issues.state);

    // Get pull request counts
    const prCounts = await db
      .select({
        state: pullRequests.state,
        count: sql<number>`count(*)::int`,
      })
      .from(pullRequests)
      .where(eq(pullRequests.milestoneId, milestone.id))
      .groupBy(pullRequests.state);

    const openIssuesCount =
      issueCounts.find((c) => c.state === 'open')?.count ?? 0;
    const closedIssuesCount =
      issueCounts.find((c) => c.state === 'closed')?.count ?? 0;
    const openPullRequestsCount =
      prCounts.find((c) => c.state === 'open')?.count ?? 0;
    const closedPullRequestsCount = prCounts
      .filter((c) => c.state === 'closed' || c.state === 'merged')
      .reduce((sum, c) => sum + c.count, 0);

    const totalItems =
      openIssuesCount +
      closedIssuesCount +
      openPullRequestsCount +
      closedPullRequestsCount;
    const closedItems = closedIssuesCount + closedPullRequestsCount;
    const progress =
      totalItems > 0 ? Math.round((closedItems / totalItems) * 100) : 0;

    return {
      ...milestone,
      openIssuesCount,
      closedIssuesCount,
      openPullRequestsCount,
      closedPullRequestsCount,
      progress,
    };
  },
};
