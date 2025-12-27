import { eq, and, desc, asc, sql, lt, gt, lte, gte, count } from 'drizzle-orm';
import { getDb } from '../index';
import {
  cycles,
  issues,
  type Cycle,
  type NewCycle,
  type Issue,
} from '../schema';

export const cycleModel = {
  /**
   * Find a cycle by ID
   */
  async findById(id: string): Promise<Cycle | undefined> {
    const db = getDb();
    const [cycle] = await db.select().from(cycles).where(eq(cycles.id, id));
    return cycle;
  },

  /**
   * Find a cycle by repo and number
   */
  async findByNumber(repoId: string, number: number): Promise<Cycle | undefined> {
    const db = getDb();
    const [cycle] = await db
      .select()
      .from(cycles)
      .where(and(eq(cycles.repoId, repoId), eq(cycles.number, number)));
    return cycle;
  },

  /**
   * Create a new cycle
   */
  async create(data: Omit<NewCycle, 'number'>): Promise<Cycle> {
    const db = getDb();

    // Get next cycle number for this repo
    const [lastCycle] = await db
      .select({ number: cycles.number })
      .from(cycles)
      .where(eq(cycles.repoId, data.repoId))
      .orderBy(desc(cycles.number))
      .limit(1);

    const number = (lastCycle?.number ?? 0) + 1;

    const [cycle] = await db
      .insert(cycles)
      .values({ ...data, number })
      .returning();

    return cycle;
  },

  /**
   * Update a cycle
   */
  async update(
    id: string,
    data: Partial<Omit<NewCycle, 'id' | 'repoId' | 'number' | 'createdAt'>>
  ): Promise<Cycle | undefined> {
    const db = getDb();
    const [cycle] = await db
      .update(cycles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cycles.id, id))
      .returning();
    return cycle;
  },

  /**
   * Delete a cycle
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();

    // First, remove cycle reference from all issues
    await db
      .update(issues)
      .set({ cycleId: null })
      .where(eq(issues.cycleId, id));

    const result = await db.delete(cycles).where(eq(cycles.id, id)).returning();
    return result.length > 0;
  },

  /**
   * List cycles by repo
   */
  async listByRepo(
    repoId: string,
    options: {
      filter?: 'past' | 'current' | 'upcoming' | 'all';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Cycle[]> {
    const db = getDb();
    const now = new Date();
    const conditions = [eq(cycles.repoId, repoId)];

    switch (options.filter) {
      case 'past':
        conditions.push(lt(cycles.endDate, now));
        break;
      case 'current':
        conditions.push(lte(cycles.startDate, now));
        conditions.push(gte(cycles.endDate, now));
        break;
      case 'upcoming':
        conditions.push(gt(cycles.startDate, now));
        break;
      // 'all' or undefined - no additional filter
    }

    let query = db
      .select()
      .from(cycles)
      .where(and(...conditions))
      .orderBy(desc(cycles.startDate));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * Get the current active cycle
   */
  async getCurrent(repoId: string): Promise<Cycle | undefined> {
    const db = getDb();
    const now = new Date();

    const [cycle] = await db
      .select()
      .from(cycles)
      .where(
        and(
          eq(cycles.repoId, repoId),
          lte(cycles.startDate, now),
          gte(cycles.endDate, now)
        )
      )
      .limit(1);

    return cycle;
  },

  /**
   * Get the next upcoming cycle
   */
  async getUpcoming(repoId: string): Promise<Cycle | undefined> {
    const db = getDb();
    const now = new Date();

    const [cycle] = await db
      .select()
      .from(cycles)
      .where(and(eq(cycles.repoId, repoId), gt(cycles.startDate, now)))
      .orderBy(asc(cycles.startDate))
      .limit(1);

    return cycle;
  },

  /**
   * Get cycle progress
   */
  async getProgress(id: string): Promise<{
    totalIssues: number;
    completedIssues: number;
    percentage: number;
    totalEstimate: number;
    completedEstimate: number;
    daysRemaining: number;
    daysElapsed: number;
    totalDays: number;
  }> {
    const db = getDb();

    // Get cycle details
    const cycle = await this.findById(id);
    if (!cycle) {
      return {
        totalIssues: 0,
        completedIssues: 0,
        percentage: 0,
        totalEstimate: 0,
        completedEstimate: 0,
        daysRemaining: 0,
        daysElapsed: 0,
        totalDays: 0,
      };
    }

    // Calculate time progress
    const now = new Date();
    const startDate = new Date(cycle.startDate);
    const endDate = new Date(cycle.endDate);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysElapsed = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Get issue stats
    const result = await db
      .select({
        total: count(),
        completed: sql<number>`SUM(CASE WHEN ${issues.state} = 'closed' THEN 1 ELSE 0 END)`,
        totalEstimate: sql<number>`COALESCE(SUM(${issues.estimate}), 0)`,
        completedEstimate: sql<number>`COALESCE(SUM(CASE WHEN ${issues.state} = 'closed' THEN ${issues.estimate} ELSE 0 END), 0)`,
      })
      .from(issues)
      .where(eq(issues.cycleId, id));

    const totalIssues = Number(result[0]?.total ?? 0);
    const completedIssues = Number(result[0]?.completed ?? 0);
    const percentage = totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0;

    return {
      totalIssues,
      completedIssues,
      percentage,
      totalEstimate: Number(result[0]?.totalEstimate ?? 0),
      completedEstimate: Number(result[0]?.completedEstimate ?? 0),
      daysRemaining,
      daysElapsed,
      totalDays,
    };
  },

  /**
   * Get issues in a cycle
   */
  async getIssues(
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

  /**
   * Add an issue to a cycle
   */
  async addIssue(cycleId: string, issueId: string): Promise<void> {
    const db = getDb();
    await db
      .update(issues)
      .set({ cycleId, updatedAt: new Date() })
      .where(eq(issues.id, issueId));
  },

  /**
   * Remove an issue from a cycle
   */
  async removeIssue(issueId: string): Promise<void> {
    const db = getDb();
    await db
      .update(issues)
      .set({ cycleId: null, updatedAt: new Date() })
      .where(eq(issues.id, issueId));
  },

  /**
   * Get unfinished issues from a cycle (issues that weren't completed by cycle end)
   */
  async getUnfinishedIssues(cycleId: string): Promise<Issue[]> {
    const db = getDb();
    return db
      .select()
      .from(issues)
      .where(and(eq(issues.cycleId, cycleId), eq(issues.state, 'open')))
      .orderBy(desc(issues.createdAt));
  },

  /**
   * Move unfinished issues to the next cycle
   */
  async moveUnfinishedToNextCycle(
    cycleId: string,
    nextCycleId: string
  ): Promise<number> {
    const db = getDb();
    const result = await db
      .update(issues)
      .set({ cycleId: nextCycleId, updatedAt: new Date() })
      .where(and(eq(issues.cycleId, cycleId), eq(issues.state, 'open')))
      .returning();

    return result.length;
  },

  /**
   * Calculate velocity (avg completed estimate points) over last N cycles
   */
  async getVelocity(
    repoId: string,
    cycleCount: number = 5
  ): Promise<{
    averageCompleted: number;
    averageEstimate: number;
    cycles: Array<{ cycleId: string; name: string; completed: number; estimate: number }>;
  }> {
    const db = getDb();
    const now = new Date();

    // Get past cycles
    const pastCycles = await db
      .select()
      .from(cycles)
      .where(and(eq(cycles.repoId, repoId), lt(cycles.endDate, now)))
      .orderBy(desc(cycles.endDate))
      .limit(cycleCount);

    if (pastCycles.length === 0) {
      return {
        averageCompleted: 0,
        averageEstimate: 0,
        cycles: [],
      };
    }

    // Get stats for each cycle
    const cycleStats: Array<{ cycleId: string; name: string; completed: number; estimate: number }> = [];
    let totalCompleted = 0;
    let totalEstimate = 0;

    for (const cycle of pastCycles) {
      const result = await db
        .select({
          completed: sql<number>`COALESCE(SUM(CASE WHEN ${issues.state} = 'closed' THEN ${issues.estimate} ELSE 0 END), 0)`,
          estimate: sql<number>`COALESCE(SUM(${issues.estimate}), 0)`,
        })
        .from(issues)
        .where(eq(issues.cycleId, cycle.id));

      const completed = Number(result[0]?.completed ?? 0);
      const estimate = Number(result[0]?.estimate ?? 0);

      cycleStats.push({
        cycleId: cycle.id,
        name: cycle.name,
        completed,
        estimate,
      });

      totalCompleted += completed;
      totalEstimate += estimate;
    }

    return {
      averageCompleted: Math.round(totalCompleted / pastCycles.length),
      averageEstimate: Math.round(totalEstimate / pastCycles.length),
      cycles: cycleStats,
    };
  },
};
