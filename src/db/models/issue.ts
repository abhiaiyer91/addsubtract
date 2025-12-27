import { eq, and, desc, asc, sql, inArray, lt, gt, gte, lte, isNull, isNotNull, count, ne, or } from 'drizzle-orm';
import { getDb } from '../index';
import {
  issues,
  issueComments,
  issueLabels,
  labels,
  repositories,
  type Issue,
  type NewIssue,
  type IssueComment,
  type NewIssueComment,
  type Label,
  type NewLabel,
  type IssueStatus,
  type IssuePriority,
} from '../schema';
import { user } from '../auth-schema';
import { repoModel } from './repository';

// Issue status values for Kanban board (includes triage)
export const ISSUE_STATUSES: IssueStatus[] = [
  'triage',
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
];

// Issue priority values (Linear-style)
export const ISSUE_PRIORITIES: IssuePriority[] = [
  'none',
  'low',
  'medium',
  'high',
  'urgent',
];

// Priority display configuration
export const PRIORITY_CONFIG: Record<IssuePriority, { label: string; color: string; icon: string }> = {
  none: { label: 'No priority', color: '6b7280', icon: '○' },
  low: { label: 'Low', color: '3b82f6', icon: '◔' },
  medium: { label: 'Medium', color: 'eab308', icon: '◑' },
  high: { label: 'High', color: 'f97316', icon: '◕' },
  urgent: { label: 'Urgent', color: 'ef4444', icon: '●' },
};

// Author type from better-auth user table
type Author = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  avatarUrl: string | null;
};

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
  ): Promise<{ issue: Issue; author: Author } | undefined> {
    const db = getDb();
    const result = await db
      .select()
      .from(issues)
      .innerJoin(user, eq(issues.authorId, user.id))
      .where(eq(issues.id, id));

    if (result.length === 0) return undefined;

    return {
      issue: result[0].issues,
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
   * List issues by repo with comprehensive filtering
   */
  async listByRepo(
    repoId: string,
    options: {
      state?: 'open' | 'closed';
      status?: IssueStatus;
      priority?: IssuePriority;
      authorId?: string;
      assigneeId?: string;
      projectId?: string;
      cycleId?: string;
      parentId?: string;
      hasParent?: boolean;
      hasDueDate?: boolean;
      isOverdue?: boolean;
      limit?: number;
      offset?: number;
      sortBy?: 'created' | 'updated' | 'priority' | 'dueDate';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<Issue[]> {
    const db = getDb();
    const conditions = [eq(issues.repoId, repoId)];

    if (options.state) {
      conditions.push(eq(issues.state, options.state));
    }

    if (options.status) {
      conditions.push(eq(issues.status, options.status));
    }

    if (options.priority) {
      conditions.push(eq(issues.priority, options.priority));
    }

    if (options.authorId) {
      conditions.push(eq(issues.authorId, options.authorId));
    }

    if (options.assigneeId) {
      conditions.push(eq(issues.assigneeId, options.assigneeId));
    }

    if (options.projectId) {
      conditions.push(eq(issues.projectId, options.projectId));
    }

    if (options.cycleId) {
      conditions.push(eq(issues.cycleId, options.cycleId));
    }

    if (options.parentId) {
      conditions.push(eq(issues.parentId, options.parentId));
    }

    if (options.hasParent === true) {
      conditions.push(isNotNull(issues.parentId));
    } else if (options.hasParent === false) {
      conditions.push(isNull(issues.parentId));
    }

    if (options.hasDueDate === true) {
      conditions.push(isNotNull(issues.dueDate));
    } else if (options.hasDueDate === false) {
      conditions.push(isNull(issues.dueDate));
    }

    if (options.isOverdue) {
      conditions.push(isNotNull(issues.dueDate));
      conditions.push(lt(issues.dueDate, new Date()));
      conditions.push(eq(issues.state, 'open'));
    }

    // Determine sort order
    const sortOrder = options.sortOrder === 'asc' ? asc : desc;
    let orderByColumn;
    switch (options.sortBy) {
      case 'updated':
        orderByColumn = sortOrder(issues.updatedAt);
        break;
      case 'priority':
        // Custom priority ordering: urgent > high > medium > low > none
        orderByColumn = sql`CASE ${issues.priority} 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
          ELSE 5 END ${options.sortOrder === 'desc' ? sql`DESC` : sql`ASC`}`;
        break;
      case 'dueDate':
        orderByColumn = sortOrder(issues.dueDate);
        break;
      default:
        orderByColumn = sortOrder(issues.createdAt);
    }

    let query = db
      .select()
      .from(issues)
      .where(and(...conditions))
      .orderBy(orderByColumn);

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * List issues with authors for Kanban board (optimized single query)
   */
  async listByRepoWithAuthors(
    repoId: string,
    options: {
      state?: 'open' | 'closed';
      authorId?: string;
      assigneeId?: string;
      projectId?: string;
      cycleId?: string;
      limit?: number;
    } = {}
  ): Promise<Array<Issue & { author: Author | null }>> {
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
    if (options.projectId) {
      conditions.push(eq(issues.projectId, options.projectId));
    }
    if (options.cycleId) {
      conditions.push(eq(issues.cycleId, options.cycleId));
    }

    const result = await db
      .select()
      .from(issues)
      .leftJoin(user, eq(issues.authorId, user.id))
      .where(and(...conditions))
      .orderBy(desc(issues.createdAt))
      .limit(options.limit || 500);

    return result.map((r) => ({
      ...r.issues,
      author: r.user ? {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        username: r.user.username,
        image: r.user.image,
        avatarUrl: r.user.avatarUrl,
      } : null,
    }));
  },

  /**
   * List issues grouped by status (for Kanban board)
   */
  async listByRepoGroupedByStatus(
    repoId: string,
    options: {
      state?: 'open' | 'closed';
      authorId?: string;
      assigneeId?: string;
    } = {}
  ): Promise<Record<IssueStatus, Issue[]>> {
    const allIssues = await this.listByRepo(repoId, {
      ...options,
      limit: 500, // Get all for Kanban view
    });

    // Group by status (default to 'backlog' for issues without status)
    const grouped: Record<IssueStatus, Issue[]> = {
      triage: [],
      backlog: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
      canceled: [],
    };

    for (const issue of allIssues) {
      // Handle null/undefined status (for existing issues before migration)
      // Also map closed issues without explicit status to 'done'
      let status: IssueStatus = (issue.status as IssueStatus) || 'backlog';
      
      // If issue is closed but has no status or backlog status, move to 'done'
      if (issue.state === 'closed' && (!issue.status || issue.status === 'backlog')) {
        status = 'done';
      }
      
      grouped[status].push(issue);
    }

    return grouped;
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
   * Update issue status (for Kanban board)
   */
  async updateStatus(id: string, status: IssueStatus): Promise<Issue | undefined> {
    const db = getDb();
    
    // When moving to 'done' or 'canceled', also close the issue
    const shouldClose = status === 'done' || status === 'canceled';
    
    const updates: Partial<Issue> = {
      status,
      updatedAt: new Date(),
    };
    
    if (shouldClose) {
      updates.state = 'closed';
      updates.closedAt = new Date();
    } else if (status === 'backlog' || status === 'todo' || status === 'in_progress' || status === 'in_review') {
      // Reopen if moving back to active status
      const existing = await this.findById(id);
      if (existing?.state === 'closed') {
        updates.state = 'open';
        updates.closedAt = null;
      }
    }
    
    const [issue] = await db
      .update(issues)
      .set(updates)
      .where(eq(issues.id, id))
      .returning();
    return issue;
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

  // ============ PRIORITY METHODS ============

  /**
   * Update issue priority
   */
  async updatePriority(id: string, priority: IssuePriority): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ priority, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .returning();
    return issue;
  },

  /**
   * List issues by priority
   */
  async listByPriority(
    repoId: string,
    priority: IssuePriority,
    options: { state?: 'open' | 'closed'; limit?: number } = {}
  ): Promise<Issue[]> {
    const db = getDb();
    const conditions = [eq(issues.repoId, repoId), eq(issues.priority, priority)];
    
    if (options.state) {
      conditions.push(eq(issues.state, options.state));
    }

    let query = db
      .select()
      .from(issues)
      .where(and(...conditions))
      .orderBy(desc(issues.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    return query;
  },

  // ============ DUE DATE METHODS ============

  /**
   * Set due date for an issue
   */
  async setDueDate(id: string, dueDate: Date): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ dueDate, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .returning();
    return issue;
  },

  /**
   * Clear due date from an issue
   */
  async clearDueDate(id: string): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ dueDate: null, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .returning();
    return issue;
  },

  /**
   * List overdue issues (due date in the past, still open)
   */
  async listOverdue(repoId: string, limit?: number): Promise<Issue[]> {
    const db = getDb();
    const now = new Date();

    let query = db
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.repoId, repoId),
          eq(issues.state, 'open'),
          isNotNull(issues.dueDate),
          lt(issues.dueDate, now)
        )
      )
      .orderBy(asc(issues.dueDate));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    return query;
  },

  /**
   * List issues due within N days
   */
  async listDueSoon(repoId: string, days: number = 7, limit?: number): Promise<Issue[]> {
    const db = getDb();
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    let query = db
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.repoId, repoId),
          eq(issues.state, 'open'),
          isNotNull(issues.dueDate),
          gte(issues.dueDate, now),
          lte(issues.dueDate, futureDate)
        )
      )
      .orderBy(asc(issues.dueDate));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    return query;
  },

  // ============ ESTIMATE METHODS ============

  /**
   * Set estimate for an issue
   */
  async setEstimate(id: string, estimate: number): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ estimate, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .returning();
    return issue;
  },

  /**
   * Clear estimate from an issue
   */
  async clearEstimate(id: string): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ estimate: null, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .returning();
    return issue;
  },

  /**
   * Get total estimate for filtered issues
   */
  async getTotalEstimate(
    repoId: string,
    options: {
      state?: 'open' | 'closed';
      status?: IssueStatus;
      assigneeId?: string;
      projectId?: string;
      cycleId?: string;
    } = {}
  ): Promise<number> {
    const db = getDb();
    const conditions = [eq(issues.repoId, repoId), isNotNull(issues.estimate)];

    if (options.state) {
      conditions.push(eq(issues.state, options.state));
    }
    if (options.status) {
      conditions.push(eq(issues.status, options.status));
    }
    if (options.assigneeId) {
      conditions.push(eq(issues.assigneeId, options.assigneeId));
    }
    if (options.projectId) {
      conditions.push(eq(issues.projectId, options.projectId));
    }
    if (options.cycleId) {
      conditions.push(eq(issues.cycleId, options.cycleId));
    }

    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${issues.estimate}), 0)` })
      .from(issues)
      .where(and(...conditions));

    return Number(result[0]?.total ?? 0);
  },

  // ============ PARENT/SUB-ISSUE METHODS ============

  /**
   * Set parent issue (makes this a sub-issue)
   */
  async setParent(issueId: string, parentId: string): Promise<Issue | undefined> {
    const db = getDb();
    
    // Prevent circular references
    const parent = await this.findById(parentId);
    if (parent?.parentId === issueId) {
      throw new Error('Cannot create circular parent-child relationship');
    }

    const [issue] = await db
      .update(issues)
      .set({ parentId, updatedAt: new Date() })
      .where(eq(issues.id, issueId))
      .returning();
    return issue;
  },

  /**
   * Remove parent (makes this a top-level issue)
   */
  async removeParent(issueId: string): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ parentId: null, updatedAt: new Date() })
      .where(eq(issues.id, issueId))
      .returning();
    return issue;
  },

  /**
   * Get sub-issues of a parent
   */
  async getSubIssues(parentId: string): Promise<Issue[]> {
    const db = getDb();
    return db
      .select()
      .from(issues)
      .where(eq(issues.parentId, parentId))
      .orderBy(desc(issues.createdAt));
  },

  /**
   * Get parent issue
   */
  async getParent(issueId: string): Promise<Issue | undefined> {
    const issue = await this.findById(issueId);
    if (!issue?.parentId) return undefined;
    return this.findById(issue.parentId);
  },

  /**
   * Get sub-issue count
   */
  async getSubIssueCount(parentId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .select({ count: count() })
      .from(issues)
      .where(eq(issues.parentId, parentId));
    return Number(result[0]?.count ?? 0);
  },

  /**
   * Get sub-issue progress
   */
  async getSubIssueProgress(parentId: string): Promise<{ total: number; completed: number; percentage: number }> {
    const db = getDb();
    
    const subIssues = await this.getSubIssues(parentId);
    const total = subIssues.length;
    const completed = subIssues.filter(i => i.state === 'closed').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, percentage };
  },

  /**
   * Check if all sub-issues are complete
   */
  async areAllSubIssuesComplete(parentId: string): Promise<boolean> {
    const { total, completed } = await this.getSubIssueProgress(parentId);
    return total > 0 && total === completed;
  },

  /**
   * Close all sub-issues when parent is closed
   */
  async closeSubIssues(parentId: string, closedById: string): Promise<number> {
    const db = getDb();
    const now = new Date();

    const result = await db
      .update(issues)
      .set({
        state: 'closed',
        status: 'done',
        closedAt: now,
        closedById,
        updatedAt: now,
      })
      .where(and(eq(issues.parentId, parentId), eq(issues.state, 'open')))
      .returning();

    return result.length;
  },

  // ============ PROJECT/CYCLE ASSIGNMENT ============

  /**
   * Assign issue to a project
   */
  async assignToProject(issueId: string, projectId: string | null): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ projectId, updatedAt: new Date() })
      .where(eq(issues.id, issueId))
      .returning();
    return issue;
  },

  /**
   * Assign issue to a cycle
   */
  async assignToCycle(issueId: string, cycleId: string | null): Promise<Issue | undefined> {
    const db = getDb();
    const [issue] = await db
      .update(issues)
      .set({ cycleId, updatedAt: new Date() })
      .where(eq(issues.id, issueId))
      .returning();
    return issue;
  },

  /**
   * List issues by project
   */
  async listByProject(
    projectId: string,
    options: { state?: 'open' | 'closed'; limit?: number } = {}
  ): Promise<Issue[]> {
    const db = getDb();
    const conditions = [eq(issues.projectId, projectId)];

    if (options.state) {
      conditions.push(eq(issues.state, options.state));
    }

    let query = db
      .select()
      .from(issues)
      .where(and(...conditions))
      .orderBy(desc(issues.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    return query;
  },

  /**
   * List issues by cycle
   */
  async listByCycle(
    cycleId: string,
    options: { state?: 'open' | 'closed'; limit?: number } = {}
  ): Promise<Issue[]> {
    const db = getDb();
    const conditions = [eq(issues.cycleId, cycleId)];

    if (options.state) {
      conditions.push(eq(issues.state, options.state));
    }

    let query = db
      .select()
      .from(issues)
      .where(and(...conditions))
      .orderBy(desc(issues.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    return query;
  },

  // ============ TRIAGE METHODS ============

  /**
   * List issues in triage
   */
  async listTriage(repoId: string, limit?: number): Promise<Issue[]> {
    const db = getDb();
    
    let query = db
      .select()
      .from(issues)
      .where(and(eq(issues.repoId, repoId), eq(issues.status, 'triage')))
      .orderBy(desc(issues.createdAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    return query;
  },

  /**
   * Accept triage item (move to backlog or specified status)
   */
  async acceptTriage(id: string, targetStatus: IssueStatus = 'backlog'): Promise<Issue | undefined> {
    return this.updateStatus(id, targetStatus);
  },

  /**
   * Reject triage item (close as canceled)
   */
  async rejectTriage(id: string, closedById: string): Promise<Issue | undefined> {
    const db = getDb();
    const now = new Date();

    const [issue] = await db
      .update(issues)
      .set({
        status: 'canceled',
        state: 'closed',
        closedAt: now,
        closedById,
        updatedAt: now,
      })
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
  ): Promise<(IssueComment & { user: Author })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(issueComments)
      .innerJoin(user, eq(issueComments.userId, user.id))
      .where(eq(issueComments.issueId, issueId))
      .orderBy(issueComments.createdAt);

    return result.map((r) => ({
      ...r.issue_comments,
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
  async create(data: NewIssueComment): Promise<IssueComment> {
    const db = getDb();
    const [comment] = await db.insert(issueComments).values(data).returning();

    // Update issue's updatedAt timestamp
    await db
      .update(issues)
      .set({ updatedAt: new Date() })
      .where(eq(issues.id, data.issueId));

    // Return comment with authorId alias
    return { ...comment, authorId: comment.userId };
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
   * List labels for multiple issues (batch query)
   */
  async listByIssuesBatch(issueIds: string[]): Promise<Map<string, Label[]>> {
    if (issueIds.length === 0) {
      return new Map();
    }
    
    const db = getDb();
    const result = await db
      .select({
        issueId: issueLabels.issueId,
        label: labels,
      })
      .from(issueLabels)
      .innerJoin(labels, eq(issueLabels.labelId, labels.id))
      .where(inArray(issueLabels.issueId, issueIds));

    const labelsMap = new Map<string, Label[]>();
    
    // Initialize all issue IDs with empty arrays
    for (const id of issueIds) {
      labelsMap.set(id, []);
    }
    
    // Populate with actual labels
    for (const r of result) {
      const existing = labelsMap.get(r.issueId) || [];
      existing.push(r.label);
      labelsMap.set(r.issueId, existing);
    }

    return labelsMap;
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

// ============ ISSUE INBOX MODEL ============

type InboxIssue = Issue & {
  repo: { id: string; name: string; ownerId: string };
  author: { id: string; name: string; username: string | null; avatarUrl: string | null } | null;
  repoOwner?: string;
  repoName?: string;
};

export const issueInboxModel = {
  /**
   * Get issues assigned to the user
   */
  async getAssignedToMe(
    userId: string,
    options: { limit?: number; offset?: number; repoId?: string; state?: 'open' | 'closed' | 'all' } = {}
  ): Promise<InboxIssue[]> {
    const db = getDb();
    const { limit = 50, offset = 0, repoId, state = 'open' } = options;

    const conditions = [eq(issues.assigneeId, userId)];
    
    if (state !== 'all') {
      conditions.push(eq(issues.state, state));
    }
    if (repoId !== undefined) {
      conditions.push(eq(issues.repoId, repoId));
    }

    const result = await db
      .select({
        issue: issues,
        repo: {
          id: repositories.id,
          name: repositories.name,
          ownerId: repositories.ownerId,
        },
        author: {
          id: user.id,
          name: user.name,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
        repoOwner: user.username,
      })
      .from(issues)
      .innerJoin(repositories, eq(issues.repoId, repositories.id))
      .leftJoin(user, eq(issues.authorId, user.id))
      .where(and(...conditions))
      .orderBy(desc(issues.updatedAt))
      .limit(limit)
      .offset(offset);

    // Get repo owner usernames
    const enriched = await Promise.all(
      result.map(async (r) => {
        const ownerResult = await db
          .select({ username: user.username })
          .from(user)
          .where(eq(user.id, r.repo.ownerId))
          .limit(1);

        return {
          ...r.issue,
          repo: r.repo,
          author: r.author,
          repoOwner: ownerResult[0]?.username || '',
          repoName: r.repo.name,
        };
      })
    );

    return enriched;
  },

  /**
   * Get issues created by the user
   */
  async getCreatedByMe(
    userId: string,
    options: { limit?: number; offset?: number; repoId?: string; state?: 'open' | 'closed' | 'all' } = {}
  ): Promise<InboxIssue[]> {
    const db = getDb();
    const { limit = 50, offset = 0, repoId, state = 'open' } = options;

    const conditions = [eq(issues.authorId, userId)];
    
    if (state !== 'all') {
      conditions.push(eq(issues.state, state));
    }
    if (repoId !== undefined) {
      conditions.push(eq(issues.repoId, repoId));
    }

    const result = await db
      .select({
        issue: issues,
        repo: {
          id: repositories.id,
          name: repositories.name,
          ownerId: repositories.ownerId,
        },
      })
      .from(issues)
      .innerJoin(repositories, eq(issues.repoId, repositories.id))
      .where(and(...conditions))
      .orderBy(desc(issues.updatedAt))
      .limit(limit)
      .offset(offset);

    // Enrich with owner username
    const enriched = await Promise.all(
      result.map(async (r) => {
        const ownerResult = await db
          .select({ username: user.username })
          .from(user)
          .where(eq(user.id, r.repo.ownerId))
          .limit(1);

        const authorResult = await db
          .select({ id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);

        return {
          ...r.issue,
          repo: r.repo,
          author: authorResult[0] || null,
          repoOwner: ownerResult[0]?.username || '',
          repoName: r.repo.name,
        };
      })
    );

    return enriched;
  },

  /**
   * Get issues where the user has commented (participated)
   */
  async getParticipated(
    userId: string,
    options: { limit?: number; offset?: number; repoId?: string; state?: 'open' | 'closed' | 'all' } = {}
  ): Promise<InboxIssue[]> {
    const db = getDb();
    const { limit = 50, offset = 0, repoId, state = 'open' } = options;

    // Get issues where user commented but isn't the author
    const commentedIssueIds = db
      .selectDistinct({ issueId: issueComments.issueId })
      .from(issueComments)
      .where(eq(issueComments.userId, userId));

    const conditions = [
      ne(issues.authorId, userId),
      inArray(issues.id, commentedIssueIds),
    ];

    if (state !== 'all') {
      conditions.push(eq(issues.state, state));
    }
    if (repoId !== undefined) {
      conditions.push(eq(issues.repoId, repoId));
    }

    const result = await db
      .select({
        issue: issues,
        repo: {
          id: repositories.id,
          name: repositories.name,
          ownerId: repositories.ownerId,
        },
        author: {
          id: user.id,
          name: user.name,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
      })
      .from(issues)
      .innerJoin(repositories, eq(issues.repoId, repositories.id))
      .leftJoin(user, eq(issues.authorId, user.id))
      .where(and(...conditions))
      .orderBy(desc(issues.updatedAt))
      .limit(limit)
      .offset(offset);

    // Enrich with owner username
    const enriched = await Promise.all(
      result.map(async (r) => {
        const ownerResult = await db
          .select({ username: user.username })
          .from(user)
          .where(eq(user.id, r.repo.ownerId))
          .limit(1);

        return {
          ...r.issue,
          repo: r.repo,
          author: r.author,
          repoOwner: ownerResult[0]?.username || '',
          repoName: r.repo.name,
        };
      })
    );

    return enriched;
  },

  /**
   * Get inbox summary counts
   */
  async getSummary(userId: string, repoId?: string): Promise<{
    assignedToMe: number;
    createdByMe: number;
    participated: number;
  }> {
    const db = getDb();

    // Build conditions for assigned
    const assignedConditions = [
      eq(issues.assigneeId, userId),
      eq(issues.state, 'open'),
    ];
    if (repoId !== undefined) {
      assignedConditions.push(eq(issues.repoId, repoId));
    }

    const assignedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(issues)
      .where(and(...assignedConditions));

    // Build conditions for created
    const createdConditions = [
      eq(issues.authorId, userId),
      eq(issues.state, 'open'),
    ];
    if (repoId !== undefined) {
      createdConditions.push(eq(issues.repoId, repoId));
    }

    const createdResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(issues)
      .where(and(...createdConditions));

    // Build conditions for participated
    const commentedIssueIds = db
      .selectDistinct({ issueId: issueComments.issueId })
      .from(issueComments)
      .where(eq(issueComments.userId, userId));

    const participatedConditions = [
      ne(issues.authorId, userId),
      eq(issues.state, 'open'),
      inArray(issues.id, commentedIssueIds),
    ];
    if (repoId !== undefined) {
      participatedConditions.push(eq(issues.repoId, repoId));
    }

    const participatedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(issues)
      .where(and(...participatedConditions));

    return {
      assignedToMe: Number(assignedResult[0]?.count ?? 0),
      createdByMe: Number(createdResult[0]?.count ?? 0),
      participated: Number(participatedResult[0]?.count ?? 0),
    };
  },
};
