import { eq, and, desc, sql, count } from 'drizzle-orm';
import { getDb } from '../index';
import {
  projects,
  projectMembers,
  projectUpdates,
  issues,
  type Project,
  type NewProject,
  type ProjectMember,
  type ProjectUpdate,
  type NewProjectUpdate,
  type ProjectStatus,
  type ProjectHealth,
  type Issue,
} from '../schema';
import { user } from '../auth-schema';

// Project status values
export const PROJECT_STATUSES: ProjectStatus[] = [
  'backlog',
  'planned',
  'in_progress',
  'paused',
  'completed',
  'canceled',
];

// Project health values
export const PROJECT_HEALTH: ProjectHealth[] = ['on_track', 'at_risk', 'off_track'];

// Status display configuration
export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  backlog: { label: 'Backlog', color: '6b7280' },
  planned: { label: 'Planned', color: '8b5cf6' },
  in_progress: { label: 'In Progress', color: '3b82f6' },
  paused: { label: 'Paused', color: 'f59e0b' },
  completed: { label: 'Completed', color: '22c55e' },
  canceled: { label: 'Canceled', color: 'ef4444' },
};

export const projectModel = {
  /**
   * Find a project by ID
   */
  async findById(id: string): Promise<Project | undefined> {
    const db = getDb();
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  },

  /**
   * Find a project by repo and name
   */
  async findByRepoAndName(repoId: string, name: string): Promise<Project | undefined> {
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.repoId, repoId), eq(projects.name, name)));
    return project;
  },

  /**
   * Create a new project
   */
  async create(data: NewProject): Promise<Project> {
    const db = getDb();
    const [project] = await db.insert(projects).values(data).returning();

    // If a lead is specified, add them as a member with 'lead' role
    if (data.leadId) {
      await this.addMember(project.id, data.leadId, 'lead');
    }

    return project;
  },

  /**
   * Update a project
   */
  async update(
    id: string,
    data: Partial<Omit<NewProject, 'id' | 'repoId' | 'createdAt'>>
  ): Promise<Project | undefined> {
    const db = getDb();
    const [project] = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  },

  /**
   * Delete a project
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    
    // First, remove project reference from all issues
    await db
      .update(issues)
      .set({ projectId: null })
      .where(eq(issues.projectId, id));

    const result = await db.delete(projects).where(eq(projects.id, id)).returning();
    return result.length > 0;
  },

  /**
   * List projects by repo
   */
  async listByRepo(
    repoId: string,
    options: {
      status?: ProjectStatus;
      leadId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Project[]> {
    const db = getDb();
    const conditions = [eq(projects.repoId, repoId)];

    if (options.status) {
      conditions.push(eq(projects.status, options.status));
    }

    if (options.leadId) {
      conditions.push(eq(projects.leadId, options.leadId));
    }

    let query = db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * Get project progress based on issues
   */
  async getProgress(id: string): Promise<{
    totalIssues: number;
    completedIssues: number;
    percentage: number;
    totalEstimate: number;
    completedEstimate: number;
  }> {
    const db = getDb();

    const result = await db
      .select({
        total: count(),
        completed: sql<number>`SUM(CASE WHEN ${issues.state} = 'closed' THEN 1 ELSE 0 END)`,
        totalEstimate: sql<number>`COALESCE(SUM(${issues.estimate}), 0)`,
        completedEstimate: sql<number>`COALESCE(SUM(CASE WHEN ${issues.state} = 'closed' THEN ${issues.estimate} ELSE 0 END), 0)`,
      })
      .from(issues)
      .where(eq(issues.projectId, id));

    const totalIssues = Number(result[0]?.total ?? 0);
    const completedIssues = Number(result[0]?.completed ?? 0);
    const percentage = totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0;

    return {
      totalIssues,
      completedIssues,
      percentage,
      totalEstimate: Number(result[0]?.totalEstimate ?? 0),
      completedEstimate: Number(result[0]?.completedEstimate ?? 0),
    };
  },

  /**
   * Set project lead
   */
  async setLead(id: string, leadId: string): Promise<Project | undefined> {
    const db = getDb();

    // Update project lead
    const [project] = await db
      .update(projects)
      .set({ leadId, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();

    // Add/update as member with 'lead' role
    if (project) {
      await db
        .insert(projectMembers)
        .values({ projectId: id, userId: leadId, role: 'lead' })
        .onConflictDoUpdate({
          target: [projectMembers.projectId, projectMembers.userId],
          set: { role: 'lead' },
        });
    }

    return project;
  },

  /**
   * Add a member to a project
   */
  async addMember(
    projectId: string,
    userId: string,
    role: string = 'member'
  ): Promise<ProjectMember> {
    const db = getDb();
    const [member] = await db
      .insert(projectMembers)
      .values({ projectId, userId, role })
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role },
      })
      .returning();
    return member;
  },

  /**
   * Remove a member from a project
   */
  async removeMember(projectId: string, userId: string): Promise<boolean> {
    const db = getDb();

    // Check if this is the lead
    const project = await this.findById(projectId);
    if (project?.leadId === userId) {
      // Remove lead assignment
      await db
        .update(projects)
        .set({ leadId: null, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    }

    const result = await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  },

  /**
   * Get project members with user details
   */
  async getMembers(projectId: string): Promise<
    Array<{
      userId: string;
      role: string | null;
      user: { id: string; name: string; email: string; username: string | null; image: string | null };
    }>
  > {
    const db = getDb();

    const result = await db
      .select({
        member: projectMembers,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          image: user.image,
        },
      })
      .from(projectMembers)
      .innerJoin(user, eq(projectMembers.userId, user.id))
      .where(eq(projectMembers.projectId, projectId));

    return result.map((r) => ({
      userId: r.member.userId,
      role: r.member.role,
      user: r.user,
    }));
  },

  /**
   * Mark project as complete
   */
  async complete(id: string): Promise<Project | undefined> {
    const db = getDb();
    const now = new Date();

    const [project] = await db
      .update(projects)
      .set({
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(projects.id, id))
      .returning();

    return project;
  },

  /**
   * Get issues in a project
   */
  async getIssues(
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
   * Add an issue to a project
   */
  async addIssue(issueId: string, projectId: string): Promise<void> {
    const db = getDb();
    await db
      .update(issues)
      .set({ projectId, updatedAt: new Date() })
      .where(eq(issues.id, issueId));
  },

  /**
   * Remove an issue from a project
   */
  async removeIssue(issueId: string): Promise<void> {
    const db = getDb();
    await db
      .update(issues)
      .set({ projectId: null, updatedAt: new Date() })
      .where(eq(issues.id, issueId));
  },
};

export const projectUpdateModel = {
  /**
   * Find an update by ID
   */
  async findById(id: string): Promise<ProjectUpdate | undefined> {
    const db = getDb();
    const [update] = await db
      .select()
      .from(projectUpdates)
      .where(eq(projectUpdates.id, id));
    return update;
  },

  /**
   * Create a project update
   */
  async create(data: NewProjectUpdate): Promise<ProjectUpdate> {
    const db = getDb();
    const [update] = await db.insert(projectUpdates).values(data).returning();

    // Update project's updatedAt
    await db
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(eq(projects.id, data.projectId));

    return update;
  },

  /**
   * Update a project update
   */
  async update(
    id: string,
    data: Partial<Pick<NewProjectUpdate, 'body' | 'health'>>
  ): Promise<ProjectUpdate | undefined> {
    const db = getDb();
    const [update] = await db
      .update(projectUpdates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectUpdates.id, id))
      .returning();
    return update;
  },

  /**
   * Delete a project update
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(projectUpdates)
      .where(eq(projectUpdates.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * List updates for a project
   */
  async listByProject(
    projectId: string,
    limit: number = 10
  ): Promise<Array<ProjectUpdate & { author: { id: string; name: string; image: string | null } }>> {
    const db = getDb();

    const result = await db
      .select({
        update: projectUpdates,
        author: {
          id: user.id,
          name: user.name,
          image: user.image,
        },
      })
      .from(projectUpdates)
      .innerJoin(user, eq(projectUpdates.authorId, user.id))
      .where(eq(projectUpdates.projectId, projectId))
      .orderBy(desc(projectUpdates.createdAt))
      .limit(limit);

    return result.map((r) => ({
      ...r.update,
      author: r.author,
    }));
  },

  /**
   * Get the latest update for a project
   */
  async getLatest(
    projectId: string
  ): Promise<(ProjectUpdate & { author: { id: string; name: string; image: string | null } }) | undefined> {
    const updates = await this.listByProject(projectId, 1);
    return updates[0];
  },
};
