import { eq, and, sql, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  milestones,
  issues,
  pullRequests,
  type Milestone,
  type NewMilestone,
  type MilestoneState,
} from "../schema";

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

export interface CreateMilestoneInput {
  repoId: string;
  title: string;
  description?: string | null;
  dueDate?: Date | null;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  state?: MilestoneState;
}

export interface ListMilestonesOptions {
  repoId: string;
  state?: MilestoneState;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Milestone Model
// =============================================================================

export class MilestoneModel {
  constructor(private db: PostgresJsDatabase) {}

  /**
   * Create a new milestone
   */
  async create(input: CreateMilestoneInput): Promise<Milestone> {
    const [milestone] = await this.db
      .insert(milestones)
      .values({
        repoId: input.repoId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
      })
      .returning();

    return milestone;
  }

  /**
   * Get a milestone by ID
   */
  async getById(id: string): Promise<Milestone | null> {
    const [milestone] = await this.db
      .select()
      .from(milestones)
      .where(eq(milestones.id, id))
      .limit(1);

    return milestone ?? null;
  }

  /**
   * Get a milestone by ID with progress statistics
   */
  async getByIdWithProgress(id: string): Promise<MilestoneWithProgress | null> {
    const milestone = await this.getById(id);
    if (!milestone) return null;

    return this.addProgress(milestone);
  }

  /**
   * List milestones for a repository
   */
  async list(options: ListMilestonesOptions): Promise<Milestone[]> {
    const { repoId, state, limit = 50, offset = 0 } = options;

    const conditions = [eq(milestones.repoId, repoId)];

    if (state) {
      conditions.push(eq(milestones.state, state));
    }

    return this.db
      .select()
      .from(milestones)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(milestones.dueDate, milestones.createdAt);
  }

  /**
   * List milestones for a repository with progress statistics
   */
  async listWithProgress(
    options: ListMilestonesOptions
  ): Promise<MilestoneWithProgress[]> {
    const milestonesList = await this.list(options);
    return Promise.all(milestonesList.map((m) => this.addProgress(m)));
  }

  /**
   * Update a milestone
   */
  async update(id: string, input: UpdateMilestoneInput): Promise<Milestone | null> {
    const updateData: Partial<NewMilestone> & { updatedAt: Date; closedAt?: Date | null } = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) {
      updateData.title = input.title;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.dueDate !== undefined) {
      updateData.dueDate = input.dueDate;
    }
    if (input.state !== undefined) {
      updateData.state = input.state;
      if (input.state === "closed") {
        updateData.closedAt = new Date();
      } else {
        updateData.closedAt = null;
      }
    }

    const [milestone] = await this.db
      .update(milestones)
      .set(updateData)
      .where(eq(milestones.id, id))
      .returning();

    return milestone ?? null;
  }

  /**
   * Close a milestone
   */
  async close(id: string): Promise<Milestone | null> {
    return this.update(id, { state: "closed" });
  }

  /**
   * Reopen a milestone
   */
  async reopen(id: string): Promise<Milestone | null> {
    return this.update(id, { state: "open" });
  }

  /**
   * Delete a milestone
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(milestones)
      .where(eq(milestones.id, id))
      .returning({ id: milestones.id });

    return result.length > 0;
  }

  /**
   * Get issues for a milestone
   */
  async getIssues(
    milestoneId: string,
    options?: { state?: "open" | "closed"; limit?: number; offset?: number }
  ) {
    const { state, limit = 50, offset = 0 } = options ?? {};

    const conditions = [eq(issues.milestoneId, milestoneId)];

    if (state) {
      conditions.push(eq(issues.state, state));
    }

    return this.db
      .select()
      .from(issues)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(issues.createdAt);
  }

  /**
   * Get pull requests for a milestone
   */
  async getPullRequests(
    milestoneId: string,
    options?: { state?: "open" | "closed" | "merged"; limit?: number; offset?: number }
  ) {
    const { state, limit = 50, offset = 0 } = options ?? {};

    const conditions = [eq(pullRequests.milestoneId, milestoneId)];

    if (state) {
      conditions.push(eq(pullRequests.state, state));
    }

    return this.db
      .select()
      .from(pullRequests)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(pullRequests.createdAt);
  }

  /**
   * Assign an issue to a milestone
   */
  async assignIssue(issueId: string, milestoneId: string | null): Promise<boolean> {
    const result = await this.db
      .update(issues)
      .set({ milestoneId, updatedAt: new Date() })
      .where(eq(issues.id, issueId))
      .returning({ id: issues.id });

    return result.length > 0;
  }

  /**
   * Assign a pull request to a milestone
   */
  async assignPullRequest(
    pullRequestId: string,
    milestoneId: string | null
  ): Promise<boolean> {
    const result = await this.db
      .update(pullRequests)
      .set({ milestoneId, updatedAt: new Date() })
      .where(eq(pullRequests.id, pullRequestId))
      .returning({ id: pullRequests.id });

    return result.length > 0;
  }

  /**
   * Get milestone counts for a repository
   */
  async getCounts(repoId: string): Promise<{ open: number; closed: number }> {
    const results = await this.db
      .select({
        state: milestones.state,
        count: count(),
      })
      .from(milestones)
      .where(eq(milestones.repoId, repoId))
      .groupBy(milestones.state);

    const counts = { open: 0, closed: 0 };
    for (const row of results) {
      counts[row.state] = row.count;
    }

    return counts;
  }

  /**
   * Add progress statistics to a milestone
   */
  private async addProgress(milestone: Milestone): Promise<MilestoneWithProgress> {
    // Get issue counts
    const issueCounts = await this.db
      .select({
        state: issues.state,
        count: count(),
      })
      .from(issues)
      .where(eq(issues.milestoneId, milestone.id))
      .groupBy(issues.state);

    // Get pull request counts
    const prCounts = await this.db
      .select({
        state: pullRequests.state,
        count: count(),
      })
      .from(pullRequests)
      .where(eq(pullRequests.milestoneId, milestone.id))
      .groupBy(pullRequests.state);

    const openIssuesCount =
      issueCounts.find((c) => c.state === "open")?.count ?? 0;
    const closedIssuesCount =
      issueCounts.find((c) => c.state === "closed")?.count ?? 0;
    const openPullRequestsCount =
      prCounts.find((c) => c.state === "open")?.count ?? 0;
    const closedPullRequestsCount =
      prCounts.filter((c) => c.state === "closed" || c.state === "merged")
        .reduce((sum, c) => sum + c.count, 0);

    const totalItems =
      openIssuesCount +
      closedIssuesCount +
      openPullRequestsCount +
      closedPullRequestsCount;
    const closedItems = closedIssuesCount + closedPullRequestsCount;
    const progress = totalItems > 0 ? Math.round((closedItems / totalItems) * 100) : 0;

    return {
      ...milestone,
      openIssuesCount,
      closedIssuesCount,
      openPullRequestsCount,
      closedPullRequestsCount,
      progress,
    };
  }
}

// =============================================================================
// Factory function
// =============================================================================

export function createMilestoneModel(db: PostgresJsDatabase): MilestoneModel {
  return new MilestoneModel(db);
}
