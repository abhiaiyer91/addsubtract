import { eq, and, or } from 'drizzle-orm';
import { getDb } from '../index';
import {
  issueViews,
  type IssueView,
  type NewIssueView,
} from '../schema';

// Filter configuration type
export interface ViewFilters {
  state?: 'open' | 'closed' | 'all';
  status?: string[];
  priority?: string[];
  assigneeId?: string;
  authorId?: string;
  projectId?: string;
  cycleId?: string;
  labels?: string[];
  hasParent?: boolean;
  hasDueDate?: boolean;
  isOverdue?: boolean;
}

// Display options type
export interface ViewDisplayOptions {
  viewType: 'list' | 'board' | 'timeline';
  groupBy?: 'status' | 'priority' | 'assignee' | 'project' | 'cycle' | 'none';
  sortBy?: 'created' | 'updated' | 'priority' | 'dueDate';
  sortOrder?: 'asc' | 'desc';
  showSubIssues?: boolean;
  showCompletedIssues?: boolean;
}

export const issueViewModel = {
  /**
   * Find a view by ID
   */
  async findById(id: string): Promise<IssueView | undefined> {
    const db = getDb();
    const [view] = await db.select().from(issueViews).where(eq(issueViews.id, id));
    return view;
  },

  /**
   * Create a view
   */
  async create(data: NewIssueView): Promise<IssueView> {
    const db = getDb();
    const [view] = await db.insert(issueViews).values(data).returning();
    return view;
  },

  /**
   * Update a view
   */
  async update(
    id: string,
    data: Partial<Omit<NewIssueView, 'id' | 'repoId' | 'creatorId' | 'createdAt'>>
  ): Promise<IssueView | undefined> {
    const db = getDb();
    const [view] = await db
      .update(issueViews)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(issueViews.id, id))
      .returning();
    return view;
  },

  /**
   * Delete a view
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(issueViews).where(eq(issueViews.id, id)).returning();
    return result.length > 0;
  },

  /**
   * List views for a repo (shared views + user's private views)
   */
  async listByRepo(repoId: string, userId: string): Promise<IssueView[]> {
    const db = getDb();
    return db
      .select()
      .from(issueViews)
      .where(
        and(
          eq(issueViews.repoId, repoId),
          or(eq(issueViews.isShared, true), eq(issueViews.creatorId, userId))
        )
      )
      .orderBy(issueViews.name);
  },

  /**
   * List views created by a user
   */
  async listByUser(userId: string, repoId?: string): Promise<IssueView[]> {
    const db = getDb();
    const conditions = [eq(issueViews.creatorId, userId)];

    if (repoId) {
      conditions.push(eq(issueViews.repoId, repoId));
    }

    return db
      .select()
      .from(issueViews)
      .where(and(...conditions))
      .orderBy(issueViews.name);
  },

  /**
   * Share a view (make it visible to all repo members)
   */
  async share(id: string): Promise<IssueView | undefined> {
    const db = getDb();
    const [view] = await db
      .update(issueViews)
      .set({ isShared: true, updatedAt: new Date() })
      .where(eq(issueViews.id, id))
      .returning();
    return view;
  },

  /**
   * Unshare a view (make it private)
   */
  async unshare(id: string): Promise<IssueView | undefined> {
    const db = getDb();
    const [view] = await db
      .update(issueViews)
      .set({ isShared: false, updatedAt: new Date() })
      .where(eq(issueViews.id, id))
      .returning();
    return view;
  },

  /**
   * Duplicate a view
   */
  async duplicate(id: string, userId: string, newName?: string): Promise<IssueView | undefined> {
    const original = await this.findById(id);
    if (!original) return undefined;

    const db = getDb();
    const [view] = await db
      .insert(issueViews)
      .values({
        repoId: original.repoId,
        creatorId: userId,
        name: newName || `${original.name} (copy)`,
        description: original.description,
        filters: original.filters,
        displayOptions: original.displayOptions,
        isShared: false, // Duplicated views start as private
      })
      .returning();

    return view;
  },

  /**
   * Parse filters from JSON string
   */
  parseFilters(view: IssueView): ViewFilters {
    try {
      return JSON.parse(view.filters) as ViewFilters;
    } catch {
      return {};
    }
  },

  /**
   * Parse display options from JSON string
   */
  parseDisplayOptions(view: IssueView): ViewDisplayOptions {
    try {
      return JSON.parse(view.displayOptions || '{}') as ViewDisplayOptions;
    } catch {
      return { viewType: 'list' };
    }
  },

  /**
   * Serialize filters to JSON string
   */
  serializeFilters(filters: ViewFilters): string {
    return JSON.stringify(filters);
  },

  /**
   * Serialize display options to JSON string
   */
  serializeDisplayOptions(options: ViewDisplayOptions): string {
    return JSON.stringify(options);
  },

  /**
   * Create some default views for a repo
   */
  async createDefaults(repoId: string, creatorId: string): Promise<IssueView[]> {
    const db = getDb();
    const defaultViews = [
      {
        name: 'My Issues',
        description: 'Issues assigned to me',
        filters: JSON.stringify({ assigneeId: '__CURRENT_USER__', state: 'open' }),
        displayOptions: JSON.stringify({ viewType: 'list', sortBy: 'updated', sortOrder: 'desc' }),
        isShared: true,
      },
      {
        name: 'Urgent & High Priority',
        description: 'All urgent and high priority issues',
        filters: JSON.stringify({ priority: ['urgent', 'high'], state: 'open' }),
        displayOptions: JSON.stringify({ viewType: 'list', sortBy: 'priority', sortOrder: 'asc' }),
        isShared: true,
      },
      {
        name: 'Overdue',
        description: 'Issues past their due date',
        filters: JSON.stringify({ isOverdue: true }),
        displayOptions: JSON.stringify({ viewType: 'list', sortBy: 'dueDate', sortOrder: 'asc' }),
        isShared: true,
      },
      {
        name: 'In Progress',
        description: 'All issues currently being worked on',
        filters: JSON.stringify({ status: ['in_progress', 'in_review'], state: 'open' }),
        displayOptions: JSON.stringify({ viewType: 'board', groupBy: 'assignee' }),
        isShared: true,
      },
      {
        name: 'Triage',
        description: 'Issues awaiting triage',
        filters: JSON.stringify({ status: ['triage'] }),
        displayOptions: JSON.stringify({ viewType: 'list', sortBy: 'created', sortOrder: 'desc' }),
        isShared: true,
      },
    ];

    const created: IssueView[] = [];
    for (const view of defaultViews) {
      const [v] = await db
        .insert(issueViews)
        .values({ ...view, repoId, creatorId })
        .returning();
      created.push(v);
    }

    return created;
  },
};
