/**
 * CI Runner Database Model
 * 
 * Manages CI runners and the job queue for distributing work to runners.
 */

import { eq, and, or, desc, asc, sql, lt, gt, isNull } from 'drizzle-orm';
import { getDb } from '../index';
import {
  ciRunners,
  runnerRegistrationTokens,
  jobQueue,
  runnerJobHistory,
  type CIRunner,
  type NewCIRunner,
  type RunnerRegistrationToken,
  type NewRunnerRegistrationToken,
  type JobQueueEntry,
  type NewJobQueueEntry,
  type RunnerJobHistoryEntry,
  type NewRunnerJobHistoryEntry,
  type RunnerStatus,
  type RunnerScopeType,
  type QueuedJobStatus,
} from '../schema';
import * as crypto from 'crypto';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Hash a token for storage
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Parse JSON labels safely
 */
function parseLabels(labelsJson: string): string[] {
  try {
    return JSON.parse(labelsJson);
  } catch {
    return [];
  }
}

// =============================================================================
// Runner Model
// =============================================================================

export const runnerModel = {
  /**
   * Find a runner by ID
   */
  async findById(id: string): Promise<CIRunner | undefined> {
    const db = getDb();
    const [runner] = await db.select().from(ciRunners).where(eq(ciRunners.id, id));
    return runner;
  },

  /**
   * Find a runner by token hash
   */
  async findByToken(token: string): Promise<CIRunner | undefined> {
    const db = getDb();
    const tokenHash = hashToken(token);
    const [runner] = await db.select().from(ciRunners).where(eq(ciRunners.tokenHash, tokenHash));
    return runner;
  },

  /**
   * Create a new runner (returns the auth token - store securely!)
   */
  async create(data: Omit<NewCIRunner, 'tokenHash'>): Promise<{ runner: CIRunner; authToken: string }> {
    const db = getDb();
    const authToken = generateToken();
    const tokenHash = hashToken(authToken);
    
    const [runner] = await db.insert(ciRunners).values({
      ...data,
      tokenHash,
    }).returning();
    
    return { runner, authToken };
  },

  /**
   * Update a runner
   */
  async update(
    id: string,
    data: Partial<Pick<CIRunner, 
      'name' | 'status' | 'maxConcurrentJobs' | 'activeJobCount' | 
      'labels' | 'capabilities' | 'workDir' | 'acceptForkJobs' | 
      'version' | 'lastHeartbeat' | 'lastOnline' | 'ipAddress'
    >>
  ): Promise<CIRunner | undefined> {
    const db = getDb();
    const [runner] = await db
      .update(ciRunners)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ciRunners.id, id))
      .returning();
    return runner;
  },

  /**
   * Update runner status
   */
  async updateStatus(id: string, status: RunnerStatus): Promise<CIRunner | undefined> {
    return this.update(id, { 
      status,
      lastOnline: status !== 'offline' ? new Date() : undefined,
    });
  },

  /**
   * Record a heartbeat from a runner
   */
  async heartbeat(id: string, data: {
    status: RunnerStatus;
    activeJobCount?: number;
    version?: string;
    ipAddress?: string;
  }): Promise<CIRunner | undefined> {
    return this.update(id, {
      ...data,
      lastHeartbeat: new Date(),
      lastOnline: data.status !== 'offline' ? new Date() : undefined,
    });
  },

  /**
   * Increment active job count
   */
  async incrementActiveJobs(id: string): Promise<CIRunner | undefined> {
    const db = getDb();
    const [runner] = await db
      .update(ciRunners)
      .set({ 
        activeJobCount: sql`${ciRunners.activeJobCount} + 1`,
        status: 'busy',
        updatedAt: new Date(),
      })
      .where(eq(ciRunners.id, id))
      .returning();
    return runner;
  },

  /**
   * Decrement active job count
   */
  async decrementActiveJobs(id: string): Promise<CIRunner | undefined> {
    const db = getDb();
    const [runner] = await db
      .update(ciRunners)
      .set({ 
        activeJobCount: sql`GREATEST(${ciRunners.activeJobCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(ciRunners.id, id))
      .returning();
    
    // Update status if no more active jobs
    if (runner && runner.activeJobCount === 0 && runner.status === 'busy') {
      return this.updateStatus(id, 'online');
    }
    
    return runner;
  },

  /**
   * Delete a runner
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(ciRunners).where(eq(ciRunners.id, id)).returning();
    return result.length > 0;
  },

  /**
   * List runners with optional filters
   */
  async list(options: {
    scopeType?: RunnerScopeType;
    scopeId?: string;
    status?: RunnerStatus;
    type?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<CIRunner[]> {
    const db = getDb();
    const conditions = [];

    if (options.scopeType) {
      conditions.push(eq(ciRunners.scopeType, options.scopeType));
    }
    if (options.scopeId) {
      conditions.push(eq(ciRunners.scopeId, options.scopeId));
    }
    if (options.status) {
      conditions.push(eq(ciRunners.status, options.status));
    }
    if (options.type) {
      conditions.push(eq(ciRunners.type, options.type as any));
    }

    let query = db
      .select()
      .from(ciRunners)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ciRunners.lastOnline));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * List runners for a repository (includes global and org-level runners)
   */
  async listForRepo(repoId: string, orgId?: string): Promise<CIRunner[]> {
    const db = getDb();
    const conditions = [
      eq(ciRunners.scopeType, 'global'),
      and(eq(ciRunners.scopeType, 'repository'), eq(ciRunners.scopeId, repoId)),
    ];
    
    if (orgId) {
      conditions.push(and(eq(ciRunners.scopeType, 'organization'), eq(ciRunners.scopeId, orgId)));
    }

    return db
      .select()
      .from(ciRunners)
      .where(or(...conditions))
      .orderBy(desc(ciRunners.lastOnline));
  },

  /**
   * Find an available runner for a job
   */
  async findAvailableRunner(requiredLabels: string[], repoId: string, orgId?: string): Promise<CIRunner | undefined> {
    const db = getDb();
    
    // Get all potential runners
    const runners = await this.listForRepo(repoId, orgId);
    
    // Filter by availability and labels
    for (const runner of runners) {
      // Check if runner is available
      if (runner.status !== 'online' && runner.status !== 'busy') {
        continue;
      }
      
      // Check capacity
      if (runner.activeJobCount >= runner.maxConcurrentJobs) {
        continue;
      }
      
      // Check labels
      const runnerLabels = parseLabels(runner.labels);
      const hasAllLabels = requiredLabels.every(label => {
        // Special handling for runs-on labels
        if (label === 'ubuntu-latest' || label === 'linux') {
          return runner.os === 'linux';
        }
        if (label === 'macos-latest' || label === 'macos') {
          return runner.os === 'macos';
        }
        if (label === 'windows-latest' || label === 'windows') {
          return runner.os === 'windows';
        }
        if (label === 'self-hosted') {
          return runner.type === 'self_hosted';
        }
        return runnerLabels.includes(label);
      });
      
      if (hasAllLabels) {
        return runner;
      }
    }
    
    return undefined;
  },

  /**
   * Mark stale runners as offline
   */
  async markStaleAsOffline(staleDurationMinutes: number = 5): Promise<number> {
    const db = getDb();
    const staleTime = new Date(Date.now() - staleDurationMinutes * 60 * 1000);
    
    const result = await db
      .update(ciRunners)
      .set({ status: 'offline', updatedAt: new Date() })
      .where(
        and(
          lt(ciRunners.lastHeartbeat, staleTime),
          or(
            eq(ciRunners.status, 'online'),
            eq(ciRunners.status, 'busy')
          )
        )
      )
      .returning();
    
    return result.length;
  },

  /**
   * Get runner statistics
   */
  async getStats(scopeType?: RunnerScopeType, scopeId?: string): Promise<{
    total: number;
    online: number;
    busy: number;
    offline: number;
    draining: number;
  }> {
    const db = getDb();
    const conditions = [];
    
    if (scopeType) {
      conditions.push(eq(ciRunners.scopeType, scopeType));
    }
    if (scopeId) {
      conditions.push(eq(ciRunners.scopeId, scopeId));
    }

    const result = await db
      .select({
        status: ciRunners.status,
        count: sql<number>`count(*)`,
      })
      .from(ciRunners)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(ciRunners.status);

    const stats = {
      total: 0,
      online: 0,
      busy: 0,
      offline: 0,
      draining: 0,
    };

    for (const row of result) {
      const count = Number(row.count);
      stats.total += count;
      stats[row.status as keyof typeof stats] = count;
    }

    return stats;
  },
};

// =============================================================================
// Registration Token Model
// =============================================================================

export const registrationTokenModel = {
  /**
   * Create a registration token (returns the token - show to user once!)
   */
  async create(data: {
    scopeType: RunnerScopeType;
    scopeId?: string;
    createdById: string;
    expiresInHours?: number;
  }): Promise<{ token: RunnerRegistrationToken; rawToken: string }> {
    const db = getDb();
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + (data.expiresInHours || 24) * 60 * 60 * 1000);
    
    const [token] = await db.insert(runnerRegistrationTokens).values({
      tokenHash,
      scopeType: data.scopeType,
      scopeId: data.scopeId,
      createdById: data.createdById,
      expiresAt,
    }).returning();
    
    return { token, rawToken };
  },

  /**
   * Validate and consume a registration token
   */
  async consume(rawToken: string): Promise<RunnerRegistrationToken | null> {
    const db = getDb();
    const tokenHash = hashToken(rawToken);
    
    const [token] = await db
      .select()
      .from(runnerRegistrationTokens)
      .where(
        and(
          eq(runnerRegistrationTokens.tokenHash, tokenHash),
          eq(runnerRegistrationTokens.used, false),
          gt(runnerRegistrationTokens.expiresAt, new Date())
        )
      );
    
    if (!token) {
      return null;
    }
    
    // Mark as used
    await db
      .update(runnerRegistrationTokens)
      .set({ used: true, usedAt: new Date() })
      .where(eq(runnerRegistrationTokens.id, token.id));
    
    return token;
  },

  /**
   * Link a registration token to the runner it created
   */
  async linkToRunner(tokenId: string, runnerId: string): Promise<void> {
    const db = getDb();
    await db
      .update(runnerRegistrationTokens)
      .set({ runnerId })
      .where(eq(runnerRegistrationTokens.id, tokenId));
  },

  /**
   * Clean up expired tokens
   */
  async cleanupExpired(): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(runnerRegistrationTokens)
      .where(lt(runnerRegistrationTokens.expiresAt, new Date()))
      .returning();
    return result.length;
  },
};

// =============================================================================
// Job Queue Model
// =============================================================================

export const jobQueueModel = {
  /**
   * Find a queued job by ID
   */
  async findById(id: string): Promise<JobQueueEntry | undefined> {
    const db = getDb();
    const [job] = await db.select().from(jobQueue).where(eq(jobQueue.id, id));
    return job;
  },

  /**
   * Find a queued job by job run ID
   */
  async findByJobRunId(jobRunId: string): Promise<JobQueueEntry | undefined> {
    const db = getDb();
    const [job] = await db.select().from(jobQueue).where(eq(jobQueue.jobRunId, jobRunId));
    return job;
  },

  /**
   * Add a job to the queue
   */
  async enqueue(data: NewJobQueueEntry): Promise<JobQueueEntry> {
    const db = getDb();
    const [job] = await db.insert(jobQueue).values(data).returning();
    return job;
  },

  /**
   * Update a queued job
   */
  async update(
    id: string,
    data: Partial<Pick<JobQueueEntry, 
      'status' | 'runnerId' | 'assignedAt' | 'startedAt' | 
      'completedAt' | 'retryCount' | 'errorMessage'
    >>
  ): Promise<JobQueueEntry | undefined> {
    const db = getDb();
    const [job] = await db
      .update(jobQueue)
      .set(data)
      .where(eq(jobQueue.id, id))
      .returning();
    return job;
  },

  /**
   * Assign a job to a runner
   */
  async assign(id: string, runnerId: string): Promise<JobQueueEntry | undefined> {
    return this.update(id, {
      status: 'assigned',
      runnerId,
      assignedAt: new Date(),
    });
  },

  /**
   * Mark a job as in progress
   */
  async start(id: string): Promise<JobQueueEntry | undefined> {
    return this.update(id, {
      status: 'in_progress',
      startedAt: new Date(),
    });
  },

  /**
   * Complete a job
   */
  async complete(id: string, success: boolean): Promise<JobQueueEntry | undefined> {
    return this.update(id, {
      status: success ? 'completed' : 'failed',
      completedAt: new Date(),
    });
  },

  /**
   * Fail a job with an error message
   */
  async fail(id: string, errorMessage: string): Promise<JobQueueEntry | undefined> {
    return this.update(id, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage,
    });
  },

  /**
   * Cancel a job
   */
  async cancel(id: string): Promise<JobQueueEntry | undefined> {
    return this.update(id, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  },

  /**
   * Get the next available job for a runner
   */
  async getNextJob(runnerId: string, runnerLabels: string[], repoId?: string): Promise<JobQueueEntry | undefined> {
    const db = getDb();
    
    // Get queued jobs ordered by priority and queue time
    const conditions = [eq(jobQueue.status, 'queued')];
    
    if (repoId) {
      conditions.push(eq(jobQueue.repoId, repoId));
    }
    
    const jobs = await db
      .select()
      .from(jobQueue)
      .where(and(...conditions))
      .orderBy(asc(jobQueue.priority), asc(jobQueue.queuedAt))
      .limit(10);
    
    // Find a job that matches the runner's labels
    for (const job of jobs) {
      const requiredLabels = parseLabels(job.labels);
      const hasAllLabels = requiredLabels.every(label => runnerLabels.includes(label));
      
      if (hasAllLabels) {
        // Try to assign the job (atomic update)
        const assigned = await this.assign(job.id, runnerId);
        if (assigned) {
          return assigned;
        }
      }
    }
    
    return undefined;
  },

  /**
   * List queued jobs
   */
  async list(options: {
    repoId?: string;
    workflowRunId?: string;
    status?: QueuedJobStatus;
    runnerId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<JobQueueEntry[]> {
    const db = getDb();
    const conditions = [];

    if (options.repoId) {
      conditions.push(eq(jobQueue.repoId, options.repoId));
    }
    if (options.workflowRunId) {
      conditions.push(eq(jobQueue.workflowRunId, options.workflowRunId));
    }
    if (options.status) {
      conditions.push(eq(jobQueue.status, options.status));
    }
    if (options.runnerId) {
      conditions.push(eq(jobQueue.runnerId, options.runnerId));
    }

    let query = db
      .select()
      .from(jobQueue)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(jobQueue.priority), asc(jobQueue.queuedAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * Get queue statistics
   */
  async getStats(repoId?: string): Promise<{
    queued: number;
    assigned: number;
    inProgress: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const db = getDb();
    const conditions = repoId ? [eq(jobQueue.repoId, repoId)] : [];

    const result = await db
      .select({
        status: jobQueue.status,
        count: sql<number>`count(*)`,
      })
      .from(jobQueue)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(jobQueue.status);

    const stats = {
      queued: 0,
      assigned: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of result) {
      const count = Number(row.count);
      const key = row.status === 'in_progress' ? 'inProgress' : row.status;
      stats[key as keyof typeof stats] = count;
    }

    return stats;
  },

  /**
   * Clean up old completed/failed jobs
   */
  async cleanupOld(olderThanDays: number = 30): Promise<number> {
    const db = getDb();
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    const result = await db
      .delete(jobQueue)
      .where(
        and(
          lt(jobQueue.completedAt, cutoff),
          or(
            eq(jobQueue.status, 'completed'),
            eq(jobQueue.status, 'failed'),
            eq(jobQueue.status, 'cancelled')
          )
        )
      )
      .returning();
    
    return result.length;
  },

  /**
   * Reset stuck jobs (assigned or in_progress but no heartbeat from runner)
   */
  async resetStuckJobs(staleDurationMinutes: number = 30): Promise<number> {
    const db = getDb();
    const staleTime = new Date(Date.now() - staleDurationMinutes * 60 * 1000);
    
    // Find jobs that are assigned/in_progress but haven't been updated
    const result = await db
      .update(jobQueue)
      .set({ 
        status: 'queued',
        runnerId: null,
        assignedAt: null,
        startedAt: null,
        retryCount: sql`${jobQueue.retryCount} + 1`,
      })
      .where(
        and(
          or(
            eq(jobQueue.status, 'assigned'),
            eq(jobQueue.status, 'in_progress')
          ),
          or(
            lt(jobQueue.assignedAt, staleTime),
            and(isNull(jobQueue.startedAt), lt(jobQueue.assignedAt, staleTime))
          )
        )
      )
      .returning();
    
    return result.length;
  },
};

// =============================================================================
// Runner Job History Model
// =============================================================================

export const runnerJobHistoryModel = {
  /**
   * Record a job execution
   */
  async record(data: NewRunnerJobHistoryEntry): Promise<RunnerJobHistoryEntry> {
    const db = getDb();
    const [entry] = await db.insert(runnerJobHistory).values(data).returning();
    return entry;
  },

  /**
   * Complete a job history entry
   */
  async complete(id: string, success: boolean, conclusion: string, durationMs: number): Promise<RunnerJobHistoryEntry | undefined> {
    const db = getDb();
    const [entry] = await db
      .update(runnerJobHistory)
      .set({
        completedAt: new Date(),
        success,
        conclusion,
        durationMs,
      })
      .where(eq(runnerJobHistory.id, id))
      .returning();
    return entry;
  },

  /**
   * Get job history for a runner
   */
  async listByRunner(runnerId: string, limit: number = 50): Promise<RunnerJobHistoryEntry[]> {
    const db = getDb();
    return db
      .select()
      .from(runnerJobHistory)
      .where(eq(runnerJobHistory.runnerId, runnerId))
      .orderBy(desc(runnerJobHistory.startedAt))
      .limit(limit);
  },

  /**
   * Get runner performance stats
   */
  async getRunnerStats(runnerId: string): Promise<{
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
    avgDurationMs: number;
  }> {
    const db = getDb();
    const [result] = await db
      .select({
        totalJobs: sql<number>`count(*)`,
        successfulJobs: sql<number>`count(*) filter (where ${runnerJobHistory.success} = true)`,
        failedJobs: sql<number>`count(*) filter (where ${runnerJobHistory.success} = false)`,
        avgDurationMs: sql<number>`avg(${runnerJobHistory.durationMs})`,
      })
      .from(runnerJobHistory)
      .where(eq(runnerJobHistory.runnerId, runnerId));

    return {
      totalJobs: Number(result?.totalJobs || 0),
      successfulJobs: Number(result?.successfulJobs || 0),
      failedJobs: Number(result?.failedJobs || 0),
      avgDurationMs: Number(result?.avgDurationMs || 0),
    };
  },
};
