import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../index';
import {
  issues,
  issueComments,
  issueLabels,
  labels,
  users,
  repositories,
  type Issue,
  type NewIssue,
  type IssueComment,
  type NewIssueComment,
  type Label,
  type NewLabel,
  type User,
} from '../schema';
import { repoModel } from './repository';

export const issueModel = {
  /**
   * Find an issue by ID
   */
  async findById(id: string): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db.select().from(issues).where(eq(issues.id, id));
    return issue;
  },

  /**
   * Find an issue by repo and number
   */
  async findByRepoAndNumber(
    repoId: string,
    number: number
  ): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .select()
      .from(issues)
      .where(and(eq(issues.repoId, repoId), eq(issues.number, number)));
    return issue;
  },

  /**
   * Find an issue with author details
   */
  async findWithAuthor(
    id: string
  ): Promise<{ issue: Issue; author: User } | undefined> {
    const db = getDb();
    const result = await db
      .select()
      .from(issues)
      .innerJoin(users, eq(issues.authorId, users.id))
      .where(eq(issues.id, id));

    if (result.length === 0) return undefined;

    return {
      issue: result[0].issues,
      author: result[0].users,
    };
  },

  /**
   * Create a new issue
   */
  async create(data: Omit<NewIssue, 'number'>): Promise<Issue> {
    const db = getDb();

    // Get next issue number for this repo
    const [lastIssue] = await db
      .select({ number: issues.number })
      .from(issues)
      .where(eq(issues.repoId, data.repoId))
      .orderBy(desc(issues.number))
      .limit(1);

    const number = (lastIssue?.number ?? 0) + 1;

    const [issue] = await db
      .insert(issues)
      .values({ ...data, number })
      .returning();

    // Increment open issues count
    await repoModel.incrementCounter(data.repoId, 'openIssuesCount', 1);

    return issue;
  },

  /**
   * Update an issue
   */
  async update(
    id: string,
    data: Partial<Omit<NewIssue, 'id' | 'repoId' | 'number' | 'createdAt'>>
  ): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .returning();
    return issue;
  },

  /**
   * List issues by repo
   */
  async listByRepo(
    repoId: string,
    options: {
      state?: 'open' | 'closed';
      authorId?: string;
      assigneeId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Issue[]> {
    const db = getDb();
    const conditions = [eq(issues.repoId, repoId)];

    if (options.state) {
      conditions.push(eq(issues.state, options.state));
    }

    if (options.authorId) {
      conditions.push(eq(issues.authorId, options.authorId));
    }

    if (options.assigneeId) {
      conditions.push(eq(issues.assigneeId, options.assigneeId));
    }

    let query = db
      .select()
      .from(issues)
      .where(and(...conditions))
      .orderBy(desc(issues.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * List issues authored by a user
   */
  async listByAuthor(
    authorId: string,
    state?: 'open' | 'closed'
  ): Promise<(Issue & { repo: { name: string; id: string } })[]> {
    const db = getDb();
    const conditions = [eq(issues.authorId, authorId)];

    if (state) {
      conditions.push(eq(issues.state, state));
    }

    const result = await db
      .select()
      .from(issues)
      .innerJoin(repositories, eq(issues.repoId, repositories.id))
      .where(and(...conditions))
      .orderBy(desc(issues.createdAt));

    return result.map((r) => ({
      ...r.issues,
      repo: { name: r.repositories.name, id: r.repositories.id },
    }));
  },

  /**
   * List issues assigned to a user
   */
  async listByAssignee(
    assigneeId: string,
    state?: 'open' | 'closed'
  ): Promise<(Issue & { repo: { name: string; id: string } })[]> {
    const db = getDb();
    const conditions = [eq(issues.assigneeId, assigneeId)];

    if (state) {
      conditions.push(eq(issues.state, state));
    }

    const result = await db
      .select()
      .from(issues)
      .innerJoin(repositories, eq(issues.repoId, repositories.id))
      .where(and(...conditions))
      .orderBy(desc(issues.createdAt));

    return result.map((r) => ({
      ...r.issues,
      repo: { name: r.repositories.name, id: r.repositories.id },
    }));
  },

  /**
   * Close an issue
   */
  async close(id: string, closedById: string): Promise<Issue | undefined> {
    const db = getDb();
    const now = new Date();

    const issue = await this.findById(id);
    if (!issue || issue.state !== 'open') return issue;

    const [updated] = await db
      .update(issues)
      .set({
        state: 'closed',
        closedAt: now,
        closedById,
        updatedAt: now,
      })
      .where(eq(issues.id, id))
      .returning();

    if (updated) {
      // Decrement open issues count
      await repoModel.incrementCounter(updated.repoId, 'openIssuesCount', -1);
    }

    return updated;
  },

  /**
   * Reopen an issue
   */
  async reopen(id: string): Promise<Issue | undefined> {
    const db = getDb();

    const issue = await this.findById(id);
    if (!issue || issue.state !== 'closed') return issue;

    const [updated] = await db
      .update(issues)
      .set({
        state: 'open',
        closedAt: null,
        closedById: null,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, id))
      .returning();

    if (updated) {
      // Increment open issues count
      await repoModel.incrementCounter(updated.repoId, 'openIssuesCount', 1);
    }

    return updated;
  },

  /**
   * Assign a user to an issue
   */
  async assign(id: string, assigneeId: string): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ assigneeId, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .returning();
    return issue;
  },

  /**
   * Unassign an issue
   */
  async unassign(id: string): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ assigneeId: null, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .returning();
    return issue;
  },
};

export const issueCommentModel = {
  /**
   * Find a comment by ID
   */
  async findById(id: string): Promise<IssueComment | undefined> {
    const db = getDb();
    const [comment] = await db
      .select()
      .from(issueComments)
      .where(eq(issueComments.id, id));
    return comment;
  },

  /**
   * List comments for an issue
   */
  async listByIssue(
    issueId: string
  ): Promise<(IssueComment & { user: User })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(issueComments)
      .innerJoin(users, eq(issueComments.userId, users.id))
      .where(eq(issueComments.issueId, issueId))
      .orderBy(issueComments.createdAt);

    return result.map((r) => ({
      ...r.issue_comments,
      user: r.users,
    }));
  },

  /**
   * Create a comment
   */
  async create(data: NewIssueComment): Promise<IssueComment> {
    const db = getDb();
    const [comment] = await db.insert(issueComments).values(data).returning();

    // Update issue's updatedAt timestamp
    await db
      .update(issues)
      .set({ updatedAt: new Date() })
      .where(eq(issues.id, data.issueId));

    return comment;
  },

  /**
   * Update a comment
   */
  async update(id: string, body: string): Promise<IssueComment | undefined> {
    const db = getDb();
    const [comment] = await db
      .update(issueComments)
      .set({ body, updatedAt: new Date() })
      .where(eq(issueComments.id, id))
      .returning();
    return comment;
  },

  /**
   * Delete a comment
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(issueComments)
      .where(eq(issueComments.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Count comments for an issue
   */
  async countByIssue(issueId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(issueComments)
      .where(eq(issueComments.issueId, issueId));
    return Number(result[0]?.count ?? 0);
  },
};

export const labelModel = {
  /**
   * Find a label by ID
   */
  async findById(id: string): Promise<Label | undefined> {
    const db = getDb();
    const [label] = await db.select().from(labels).where(eq(labels.id, id));
    return label;
  },

  /**
   * Find a label by name in a repo
   */
  async findByName(
    repoId: string,
    name: string
  ): Promise<Label | undefined> {
    const db = getDb();
    const [label] = await db
      .select()
      .from(labels)
      .where(and(eq(labels.repoId, repoId), eq(labels.name, name)));
    return label;
  },

  /**
   * List labels for a repo
   */
  async listByRepo(repoId: string): Promise<Label[]> {
    const db = getDb();
    return db
      .select()
      .from(labels)
      .where(eq(labels.repoId, repoId))
      .orderBy(labels.name);
  },

  /**
   * Create a label
   */
  async create(data: NewLabel): Promise<Label> {
    const db = getDb();
    const [label] = await db.insert(labels).values(data).returning();
    return label;
  },

  /**
   * Update a label
   */
  async update(
    id: string,
    data: Partial<Omit<NewLabel, 'id' | 'repoId' | 'createdAt'>>
  ): Promise<Label | undefined> {
    const db = getDb();
    const [label] = await db
      .update(labels)
      .set(data)
      .where(eq(labels.id, id))
      .returning();
    return label;
  },

  /**
   * Delete a label
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(labels).where(eq(labels.id, id)).returning();
    return result.length > 0;
  },

  /**
   * Create default labels for a repo
   */
  async createDefaults(repoId: string): Promise<Label[]> {
    const db = getDb();
    const defaultLabels = [
      { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
      { name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
      { name: 'documentation', color: '0075ca', description: 'Improvements or additions to documentation' },
      { name: 'good first issue', color: '7057ff', description: 'Good for newcomers' },
      { name: 'help wanted', color: '008672', description: 'Extra attention is needed' },
      { name: 'question', color: 'd876e3', description: 'Further information is requested' },
      { name: 'wontfix', color: 'ffffff', description: 'This will not be worked on' },
      { name: 'duplicate', color: 'cfd3d7', description: 'This issue or pull request already exists' },
      { name: 'invalid', color: 'e4e669', description: "This doesn't seem right" },
    ];

    const created: Label[] = [];
    for (const label of defaultLabels) {
      const [l] = await db
        .insert(labels)
        .values({ ...label, repoId })
        .returning();
      created.push(l);
    }

    return created;
  },
};

export const issueLabelModel = {
  /**
   * Add a label to an issue
   */
  async add(issueId: string, labelId: string): Promise<void> {
    const db = getDb();
    await db
      .insert(issueLabels)
      .values({ issueId, labelId })
      .onConflictDoNothing();
  },

  /**
   * Remove a label from an issue
   */
  async remove(issueId: string, labelId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(issueLabels)
      .where(
        and(eq(issueLabels.issueId, issueId), eq(issueLabels.labelId, labelId))
      )
      .returning();
    return result.length > 0;
  },

  /**
   * List labels for an issue
   */
  async listByIssue(issueId: string): Promise<Label[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(issueLabels)
      .innerJoin(labels, eq(issueLabels.labelId, labels.id))
      .where(eq(issueLabels.issueId, issueId));

    return result.map((r) => r.labels);
  },

  /**
   * Set labels for an issue (replace all)
   */
  async setLabels(issueId: string, labelIds: string[]): Promise<void> {
    const db = getDb();

    // Remove all existing labels
    await db.delete(issueLabels).where(eq(issueLabels.issueId, issueId));

    // Add new labels
    if (labelIds.length > 0) {
      await db
        .insert(issueLabels)
        .values(labelIds.map((labelId) => ({ issueId, labelId })));
    }
  },

  /**
   * List issues with a specific label
   */
  async listIssuesByLabel(labelId: string): Promise<Issue[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(issueLabels)
      .innerJoin(issues, eq(issueLabels.issueId, issues.id))
      .where(eq(issueLabels.labelId, labelId))
      .orderBy(desc(issues.createdAt));

    return result.map((r) => r.issues);
  },
};
