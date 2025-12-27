import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../index';
import {
  workflowRuns,
  jobRuns,
  stepRuns,
  type WorkflowRun,
  type NewWorkflowRun,
  type JobRun,
  type NewJobRun,
  type StepRun,
  type NewStepRun,
  type WorkflowRunState,
  type WorkflowRunConclusion,
} from '../schema';

/**
 * Workflow run model - manages CI/CD workflow executions
 */
export const workflowRunModel = {
  /**
   * Find a workflow run by ID
   */
  async findById(id: string): Promise<WorkflowRun | undefined> {
    const db = getDb();
    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id));
    return run;
  },

  /**
   * Create a new workflow run
   */
  async create(data: NewWorkflowRun): Promise<WorkflowRun> {
    const db = getDb();
    const [run] = await db.insert(workflowRuns).values(data).returning();
    return run;
  },

  /**
   * Update a workflow run
   */
  async update(
    id: string,
    data: Partial<Pick<WorkflowRun, 'state' | 'conclusion' | 'startedAt' | 'completedAt'>>
  ): Promise<WorkflowRun | undefined> {
    const db = getDb();
    const [run] = await db
      .update(workflowRuns)
      .set(data)
      .where(eq(workflowRuns.id, id))
      .returning();
    return run;
  },

  /**
   * Start a workflow run
   */
  async start(id: string): Promise<WorkflowRun | undefined> {
    return this.update(id, {
      state: 'in_progress',
      startedAt: new Date(),
    });
  },

  /**
   * Complete a workflow run
   */
  async complete(
    id: string,
    conclusion: WorkflowRunConclusion
  ): Promise<WorkflowRun | undefined> {
    return this.update(id, {
      state: 'completed',
      conclusion,
      completedAt: new Date(),
    });
  },

  /**
   * Fail a workflow run
   */
  async fail(id: string): Promise<WorkflowRun | undefined> {
    return this.update(id, {
      state: 'failed',
      conclusion: 'failure',
      completedAt: new Date(),
    });
  },

  /**
   * Cancel a workflow run
   */
  async cancel(id: string): Promise<WorkflowRun | undefined> {
    return this.update(id, {
      state: 'cancelled',
      conclusion: 'cancelled',
      completedAt: new Date(),
    });
  },

  /**
   * List workflow runs for a repository
   */
  async listByRepo(
    repoId: string,
    options: {
      branch?: string;
      event?: string;
      state?: WorkflowRunState;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<WorkflowRun[]> {
    const db = getDb();
    const conditions = [eq(workflowRuns.repoId, repoId)];

    if (options.branch) {
      conditions.push(eq(workflowRuns.branch, options.branch));
    }
    if (options.event) {
      conditions.push(eq(workflowRuns.event, options.event));
    }
    if (options.state) {
      conditions.push(eq(workflowRuns.state, options.state));
    }

    let query = db
      .select()
      .from(workflowRuns)
      .where(and(...conditions))
      .orderBy(desc(workflowRuns.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * List workflow runs for a specific commit
   */
  async listByCommit(repoId: string, commitSha: string): Promise<WorkflowRun[]> {
    const db = getDb();
    return db
      .select()
      .from(workflowRuns)
      .where(
        and(eq(workflowRuns.repoId, repoId), eq(workflowRuns.commitSha, commitSha))
      )
      .orderBy(desc(workflowRuns.createdAt));
  },

  /**
   * Get the latest run for a workflow
   */
  async getLatestRun(
    repoId: string,
    workflowPath: string
  ): Promise<WorkflowRun | undefined> {
    const db = getDb();
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.repoId, repoId),
          eq(workflowRuns.workflowPath, workflowPath)
        )
      )
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1);
    return run;
  },

  /**
   * Count runs by state for a repo
   */
  async countByState(repoId: string): Promise<Record<WorkflowRunState, number>> {
    const db = getDb();
    const result = await db
      .select({
        state: workflowRuns.state,
        count: sql<number>`count(*)`,
      })
      .from(workflowRuns)
      .where(eq(workflowRuns.repoId, repoId))
      .groupBy(workflowRuns.state);

    const counts: Record<WorkflowRunState, number> = {
      queued: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of result) {
      counts[row.state] = Number(row.count);
    }

    return counts;
  },

  /**
   * Delete old workflow runs (cleanup)
   */
  async deleteOldRuns(repoId: string, keepCount: number = 100): Promise<number> {
    const db = getDb();
    
    // Get IDs of runs to keep
    const runsToKeep = await db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(eq(workflowRuns.repoId, repoId))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(keepCount);

    const keepIds = runsToKeep.map(r => r.id);
    
    if (keepIds.length === 0) {
      return 0;
    }

    // Delete runs not in keep list
    const deleted = await db
      .delete(workflowRuns)
      .where(
        and(
          eq(workflowRuns.repoId, repoId),
          sql`${workflowRuns.id} NOT IN (${sql.join(keepIds.map(id => sql`${id}`), sql`, `)})`
        )
      )
      .returning();

    return deleted.length;
  },
};

/**
 * Job run model - manages individual job executions within a workflow
 */
export const jobRunModel = {
  /**
   * Find a job run by ID
   */
  async findById(id: string): Promise<JobRun | undefined> {
    const db = getDb();
    const [job] = await db.select().from(jobRuns).where(eq(jobRuns.id, id));
    return job;
  },

  /**
   * Create a new job run
   */
  async create(data: NewJobRun): Promise<JobRun> {
    const db = getDb();
    const [job] = await db.insert(jobRuns).values(data).returning();
    return job;
  },

  /**
   * Update a job run
   */
  async update(
    id: string,
    data: Partial<Pick<JobRun, 'state' | 'conclusion' | 'startedAt' | 'completedAt' | 'logs' | 'outputs' | 'runner'>>
  ): Promise<JobRun | undefined> {
    const db = getDb();
    const [job] = await db
      .update(jobRuns)
      .set(data)
      .where(eq(jobRuns.id, id))
      .returning();
    return job;
  },

  /**
   * Start a job run
   */
  async start(id: string, runner?: string): Promise<JobRun | undefined> {
    return this.update(id, {
      state: 'in_progress',
      startedAt: new Date(),
      runner,
    });
  },

  /**
   * Complete a job run
   */
  async complete(
    id: string,
    conclusion: WorkflowRunConclusion,
    outputs?: string
  ): Promise<JobRun | undefined> {
    return this.update(id, {
      state: 'completed',
      conclusion,
      completedAt: new Date(),
      outputs,
    });
  },

  /**
   * Fail a job run
   */
  async fail(id: string, logs?: string): Promise<JobRun | undefined> {
    return this.update(id, {
      state: 'failed',
      conclusion: 'failure',
      completedAt: new Date(),
      logs,
    });
  },

  /**
   * Append logs to a job run
   */
  async appendLogs(id: string, newLogs: string): Promise<JobRun | undefined> {
    const job = await this.findById(id);
    if (!job) return undefined;

    const existingLogs = job.logs || '';
    return this.update(id, {
      logs: existingLogs + newLogs,
    });
  },

  /**
   * List job runs for a workflow run
   */
  async listByWorkflowRun(workflowRunId: string): Promise<JobRun[]> {
    const db = getDb();
    return db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.workflowRunId, workflowRunId))
      .orderBy(jobRuns.jobName);
  },

  /**
   * Get all jobs for a workflow run with their current state
   */
  async getJobStates(workflowRunId: string): Promise<Map<string, JobRun>> {
    const jobs = await this.listByWorkflowRun(workflowRunId);
    const stateMap = new Map<string, JobRun>();
    for (const job of jobs) {
      stateMap.set(job.jobName, job);
    }
    return stateMap;
  },
};

/**
 * Step run model - manages individual step executions within a job
 */
export const stepRunModel = {
  /**
   * Find a step run by ID
   */
  async findById(id: string): Promise<StepRun | undefined> {
    const db = getDb();
    const [step] = await db.select().from(stepRuns).where(eq(stepRuns.id, id));
    return step;
  },

  /**
   * Create a new step run
   */
  async create(data: NewStepRun): Promise<StepRun> {
    const db = getDb();
    const [step] = await db.insert(stepRuns).values(data).returning();
    return step;
  },

  /**
   * Update a step run
   */
  async update(
    id: string,
    data: Partial<Pick<StepRun, 'state' | 'conclusion' | 'startedAt' | 'completedAt' | 'logs'>>
  ): Promise<StepRun | undefined> {
    const db = getDb();
    const [step] = await db
      .update(stepRuns)
      .set(data)
      .where(eq(stepRuns.id, id))
      .returning();
    return step;
  },

  /**
   * Start a step run
   */
  async start(id: string): Promise<StepRun | undefined> {
    return this.update(id, {
      state: 'in_progress',
      startedAt: new Date(),
    });
  },

  /**
   * Complete a step run
   */
  async complete(
    id: string,
    conclusion: WorkflowRunConclusion,
    logs?: string
  ): Promise<StepRun | undefined> {
    return this.update(id, {
      state: 'completed',
      conclusion,
      completedAt: new Date(),
      logs,
    });
  },

  /**
   * Fail a step run
   */
  async fail(id: string, logs?: string): Promise<StepRun | undefined> {
    return this.update(id, {
      state: 'failed',
      conclusion: 'failure',
      completedAt: new Date(),
      logs,
    });
  },

  /**
   * List step runs for a job run
   */
  async listByJobRun(jobRunId: string): Promise<StepRun[]> {
    const db = getDb();
    return db
      .select()
      .from(stepRuns)
      .where(eq(stepRuns.jobRunId, jobRunId))
      .orderBy(stepRuns.stepNumber);
  },

  /**
   * Create all steps for a job
   */
  async createBatch(steps: NewStepRun[]): Promise<StepRun[]> {
    if (steps.length === 0) return [];
    const db = getDb();
    return db.insert(stepRuns).values(steps).returning();
  },
};

/**
 * Helper type for workflow run with jobs
 */
export interface WorkflowRunWithJobs extends WorkflowRun {
  jobs: (JobRun & { steps: StepRun[] })[];
}

/**
 * Get a complete workflow run with all jobs and steps
 */
export async function getWorkflowRunWithDetails(
  runId: string
): Promise<WorkflowRunWithJobs | undefined> {
  const run = await workflowRunModel.findById(runId);
  if (!run) return undefined;

  const jobs = await jobRunModel.listByWorkflowRun(runId);
  const jobsWithSteps = await Promise.all(
    jobs.map(async (job) => {
      const steps = await stepRunModel.listByJobRun(job.id);
      return { ...job, steps };
    })
  );

  return {
    ...run,
    jobs: jobsWithSteps,
  };
}
