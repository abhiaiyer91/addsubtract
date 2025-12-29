/**
 * Planning Workflow Models
 * 
 * Handles database operations for the agent planning workflow system.
 * This includes:
 * - Planning sessions (iterative planning with AI)
 * - Planning messages (conversation during planning)
 * - Agent tasks (parallel coding tasks spawned from a plan)
 */

import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm';
import { getDb } from '../index';
import {
  planningSessions,
  planningMessages,
  agentTasks,
  type PlanningSession,
  type NewPlanningSession,
  type PlanningMessage,
  type NewPlanningMessage,
  type AgentTask,
  type NewAgentTask,
  type PlanningSessionStatus,
  type AgentTaskStatus,
} from '../schema';

// ============ PLANNING SESSION MODEL ============

export const planningSessionModel = {
  /**
   * Create a new planning session
   */
  async create(data: NewPlanningSession): Promise<PlanningSession> {
    const db = getDb();
    const [session] = await db
      .insert(planningSessions)
      .values(data)
      .returning();
    return session;
  },

  /**
   * Find a session by ID
   */
  async findById(id: string): Promise<PlanningSession | undefined> {
    const db = getDb();
    const [session] = await db
      .select()
      .from(planningSessions)
      .where(eq(planningSessions.id, id));
    return session;
  },

  /**
   * Find a session by ID and verify ownership
   */
  async findByIdForUser(id: string, userId: string): Promise<PlanningSession | undefined> {
    const db = getDb();
    const [session] = await db
      .select()
      .from(planningSessions)
      .where(and(eq(planningSessions.id, id), eq(planningSessions.userId, userId)));
    return session;
  },

  /**
   * List sessions for a user
   */
  async listByUser(
    userId: string,
    options: {
      repoId?: string;
      status?: PlanningSessionStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<PlanningSession[]> {
    const db = getDb();
    const { repoId, status, limit = 50, offset = 0 } = options;

    const conditions = [eq(planningSessions.userId, userId)];
    
    if (repoId) {
      conditions.push(eq(planningSessions.repoId, repoId));
    }
    
    if (status) {
      conditions.push(eq(planningSessions.status, status));
    }

    return db
      .select()
      .from(planningSessions)
      .where(and(...conditions))
      .orderBy(desc(planningSessions.updatedAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * List sessions for a repository
   */
  async listByRepo(
    repoId: string,
    options: {
      status?: PlanningSessionStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<PlanningSession[]> {
    const db = getDb();
    const { status, limit = 50, offset = 0 } = options;

    const conditions = [eq(planningSessions.repoId, repoId)];
    
    if (status) {
      conditions.push(eq(planningSessions.status, status));
    }

    return db
      .select()
      .from(planningSessions)
      .where(and(...conditions))
      .orderBy(desc(planningSessions.updatedAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Update a session
   */
  async update(
    id: string,
    data: Partial<Pick<PlanningSession, 
      'title' | 'currentPlan' | 'status' | 'iterationCount' | 
      'executionSummary' | 'startedAt' | 'completedAt' | 'maxConcurrency'
    >>
  ): Promise<PlanningSession | undefined> {
    const db = getDb();
    const [session] = await db
      .update(planningSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(planningSessions.id, id))
      .returning();
    return session;
  },

  /**
   * Increment iteration count
   */
  async incrementIteration(id: string): Promise<PlanningSession | undefined> {
    const db = getDb();
    const session = await this.findById(id);
    if (!session) return undefined;
    
    return this.update(id, {
      iterationCount: session.iterationCount + 1,
    });
  },

  /**
   * Start execution (move from 'ready' to 'executing')
   */
  async startExecution(id: string): Promise<PlanningSession | undefined> {
    return this.update(id, {
      status: 'executing',
      startedAt: new Date(),
    });
  },

  /**
   * Complete execution
   */
  async complete(id: string, summary?: string): Promise<PlanningSession | undefined> {
    return this.update(id, {
      status: 'completed',
      executionSummary: summary,
      completedAt: new Date(),
    });
  },

  /**
   * Fail execution
   */
  async fail(id: string, summary?: string): Promise<PlanningSession | undefined> {
    return this.update(id, {
      status: 'failed',
      executionSummary: summary,
      completedAt: new Date(),
    });
  },

  /**
   * Cancel a session
   */
  async cancel(id: string): Promise<PlanningSession | undefined> {
    return this.update(id, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  },

  /**
   * Delete a session (cascades to messages and tasks)
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(planningSessions)
      .where(eq(planningSessions.id, id))
      .returning();
    return result.length > 0;
  },
};

// ============ PLANNING MESSAGE MODEL ============

export const planningMessageModel = {
  /**
   * Create a new message
   */
  async create(data: NewPlanningMessage): Promise<PlanningMessage> {
    const db = getDb();
    const [message] = await db
      .insert(planningMessages)
      .values(data)
      .returning();

    // Update session timestamp
    await planningSessionModel.update(data.sessionId, {});

    return message;
  },

  /**
   * List messages for a session
   */
  async listBySession(
    sessionId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<PlanningMessage[]> {
    const db = getDb();
    const { limit = 100, offset = 0 } = options;

    return db
      .select()
      .from(planningMessages)
      .where(eq(planningMessages.sessionId, sessionId))
      .orderBy(asc(planningMessages.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get messages for a specific iteration
   */
  async listByIteration(
    sessionId: string,
    iteration: number
  ): Promise<PlanningMessage[]> {
    const db = getDb();
    return db
      .select()
      .from(planningMessages)
      .where(
        and(
          eq(planningMessages.sessionId, sessionId),
          eq(planningMessages.iteration, iteration)
        )
      )
      .orderBy(asc(planningMessages.createdAt));
  },

  /**
   * Get the most recent messages for context
   */
  async getRecentMessages(
    sessionId: string,
    count: number = 20
  ): Promise<PlanningMessage[]> {
    const db = getDb();
    
    const messages = await db
      .select()
      .from(planningMessages)
      .where(eq(planningMessages.sessionId, sessionId))
      .orderBy(desc(planningMessages.createdAt))
      .limit(count);

    // Reverse to get chronological order
    return messages.reverse();
  },

  /**
   * Delete messages for a session
   */
  async deleteBySession(sessionId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(planningMessages)
      .where(eq(planningMessages.sessionId, sessionId))
      .returning();
    return result.length;
  },
};

// ============ AGENT TASK MODEL ============

export const agentTaskModel = {
  /**
   * Create a new task
   */
  async create(data: NewAgentTask): Promise<AgentTask> {
    const db = getDb();
    const [task] = await db
      .insert(agentTasks)
      .values(data)
      .returning();
    return task;
  },

  /**
   * Create multiple tasks at once
   */
  async createBatch(tasks: NewAgentTask[]): Promise<AgentTask[]> {
    if (tasks.length === 0) return [];
    const db = getDb();
    return db.insert(agentTasks).values(tasks).returning();
  },

  /**
   * Find a task by ID
   */
  async findById(id: string): Promise<AgentTask | undefined> {
    const db = getDb();
    const [task] = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, id));
    return task;
  },

  /**
   * List tasks for a session
   */
  async listBySession(
    sessionId: string,
    options: {
      status?: AgentTaskStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AgentTask[]> {
    const db = getDb();
    const { status, limit = 100, offset = 0 } = options;

    const conditions = [eq(agentTasks.sessionId, sessionId)];
    
    if (status) {
      conditions.push(eq(agentTasks.status, status));
    }

    return db
      .select()
      .from(agentTasks)
      .where(and(...conditions))
      .orderBy(asc(agentTasks.taskNumber))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get tasks ready to run (pending with all dependencies met)
   */
  async getReadyTasks(sessionId: string): Promise<AgentTask[]> {
    const db = getDb();
    
    // Get all tasks for the session
    const allTasks = await this.listBySession(sessionId);
    
    // Filter to pending tasks
    const pendingTasks = allTasks.filter(t => t.status === 'pending');
    
    // Get completed task IDs
    const completedIds = new Set(
      allTasks.filter(t => t.status === 'completed').map(t => t.id)
    );
    
    // Filter to tasks with all dependencies met
    return pendingTasks.filter(task => {
      if (!task.dependsOn) return true;
      
      const deps: string[] = JSON.parse(task.dependsOn);
      return deps.every(depId => completedIds.has(depId));
    });
  },

  /**
   * Get running tasks
   */
  async getRunningTasks(sessionId: string): Promise<AgentTask[]> {
    const db = getDb();
    return db
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.sessionId, sessionId),
          eq(agentTasks.status, 'running')
        )
      );
  },

  /**
   * Count tasks by status for a session
   */
  async countByStatus(sessionId: string): Promise<Record<AgentTaskStatus, number>> {
    const db = getDb();
    const result = await db
      .select({
        status: agentTasks.status,
        count: sql<number>`count(*)`,
      })
      .from(agentTasks)
      .where(eq(agentTasks.sessionId, sessionId))
      .groupBy(agentTasks.status);

    const counts: Record<AgentTaskStatus, number> = {
      pending: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of result) {
      counts[row.status] = Number(row.count);
    }

    return counts;
  },

  /**
   * Update a task
   */
  async update(
    id: string,
    data: Partial<Pick<AgentTask,
      'status' | 'branchName' | 'agentSessionId' | 'resultSummary' |
      'filesChanged' | 'commitSha' | 'errorMessage' | 'startedAt' | 'completedAt'
    >>
  ): Promise<AgentTask | undefined> {
    const db = getDb();
    const [task] = await db
      .update(agentTasks)
      .set(data)
      .where(eq(agentTasks.id, id))
      .returning();
    return task;
  },

  /**
   * Start a task (queue it for execution)
   */
  async queue(id: string): Promise<AgentTask | undefined> {
    return this.update(id, {
      status: 'queued',
    });
  },

  /**
   * Start running a task
   */
  async start(id: string, agentSessionId?: string, branchName?: string): Promise<AgentTask | undefined> {
    return this.update(id, {
      status: 'running',
      agentSessionId,
      branchName,
      startedAt: new Date(),
    });
  },

  /**
   * Complete a task
   */
  async complete(
    id: string,
    result: {
      summary?: string;
      filesChanged?: Array<{ path: string; action: string }>;
      commitSha?: string;
    } = {}
  ): Promise<AgentTask | undefined> {
    return this.update(id, {
      status: 'completed',
      resultSummary: result.summary,
      filesChanged: result.filesChanged ? JSON.stringify(result.filesChanged) : undefined,
      commitSha: result.commitSha,
      completedAt: new Date(),
    });
  },

  /**
   * Fail a task
   */
  async fail(id: string, errorMessage?: string): Promise<AgentTask | undefined> {
    return this.update(id, {
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    });
  },

  /**
   * Cancel a task
   */
  async cancel(id: string): Promise<AgentTask | undefined> {
    return this.update(id, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  },

  /**
   * Cancel all pending/queued tasks for a session
   */
  async cancelAllPending(sessionId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .update(agentTasks)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(
        and(
          eq(agentTasks.sessionId, sessionId),
          inArray(agentTasks.status, ['pending', 'queued'])
        )
      )
      .returning();
    return result.length;
  },

  /**
   * Delete tasks for a session
   */
  async deleteBySession(sessionId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(agentTasks)
      .where(eq(agentTasks.sessionId, sessionId))
      .returning();
    return result.length;
  },
};

// ============ COMPOSITE TYPES ============

export interface PlanningSessionWithTasks extends PlanningSession {
  tasks: AgentTask[];
}

export interface PlanningSessionWithMessages extends PlanningSession {
  messages: PlanningMessage[];
}

export interface PlanningSessionFull extends PlanningSession {
  messages: PlanningMessage[];
  tasks: AgentTask[];
  taskCounts: Record<AgentTaskStatus, number>;
}

/**
 * Get a full planning session with messages and tasks
 */
export async function getPlanningSessionFull(
  sessionId: string
): Promise<PlanningSessionFull | undefined> {
  const session = await planningSessionModel.findById(sessionId);
  if (!session) return undefined;

  const [messages, tasks, taskCounts] = await Promise.all([
    planningMessageModel.listBySession(sessionId),
    agentTaskModel.listBySession(sessionId),
    agentTaskModel.countByStatus(sessionId),
  ]);

  return {
    ...session,
    messages,
    tasks,
    taskCounts,
  };
}
