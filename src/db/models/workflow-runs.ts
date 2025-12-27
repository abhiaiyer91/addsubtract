/**
 * Workflow Runs Model
 * 
 * CRUD operations for workflow, job, and step runs.
 */

import { eq, and, desc, asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
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
import type * as schema from '../schema';

// ============================================================================
// Types
// ============================================================================

/** Database instance type */
export type Database = NodePgDatabase<typeof schema>;

/** Update payload for workflow runs */
export interface UpdateWorkflowRun {
  state?: WorkflowRunState;
  conclusion?: WorkflowRunConclusion;
  startedAt?: Date;
  completedAt?: Date;
}

/** Update payload for job runs */
export interface UpdateJobRun {
  state?: WorkflowRunState;
  conclusion?: WorkflowRunConclusion;
  runner?: string;
  startedAt?: Date;
  completedAt?: Date;
  logs?: string;
  outputs?: string;
}

/** Update payload for step runs */
export interface UpdateStepRun {
  state?: WorkflowRunState;
  conclusion?: WorkflowRunConclusion;
  startedAt?: Date;
  completedAt?: Date;
  logs?: string;
}

/** Workflow run with related jobs */
export interface WorkflowRunWithJobs extends WorkflowRun {
  jobs: JobRunWithSteps[];
}

/** Job run with related steps */
export interface JobRunWithSteps extends JobRun {
  steps: StepRun[];
}

// ============================================================================
// Workflow Runs
// ============================================================================

/**
 * Create a new workflow run
 */
export async function createWorkflowRun(
  db: Database,
  data: NewWorkflowRun
): Promise<WorkflowRun> {
  const [result] = await db.insert(workflowRuns).values(data).returning();
  return result;
}

/**
 * Find a workflow run by ID
 */
export async function findWorkflowRunById(
  db: Database,
  id: string
): Promise<WorkflowRun | undefined> {
  const [result] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, id))
    .limit(1);
  return result;
}

/**
 * Find a workflow run by ID with all jobs and steps
 */
export async function findWorkflowRunByIdWithJobs(
  db: Database,
  id: string
): Promise<WorkflowRunWithJobs | undefined> {
  const workflowRun = await findWorkflowRunById(db, id);
  if (!workflowRun) return undefined;

  const jobs = await findJobRunsByWorkflowRunId(db, id);
  const jobsWithSteps: JobRunWithSteps[] = await Promise.all(
    jobs.map(async (job) => ({
      ...job,
      steps: await findStepRunsByJobRunId(db, job.id),
    }))
  );

  return {
    ...workflowRun,
    jobs: jobsWithSteps,
  };
}

/**
 * Find workflow runs by repository ID
 */
export async function findWorkflowRunsByRepoId(
  db: Database,
  repoId: string,
  options?: { limit?: number; offset?: number }
): Promise<WorkflowRun[]> {
  let query = db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.repoId, repoId))
    .orderBy(desc(workflowRuns.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as typeof query;
  }

  return query;
}

/**
 * Find workflow runs by state
 */
export async function findWorkflowRunsByState(
  db: Database,
  state: WorkflowRunState,
  options?: { limit?: number }
): Promise<WorkflowRun[]> {
  let query = db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.state, state))
    .orderBy(asc(workflowRuns.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  return query;
}

/**
 * Update a workflow run
 */
export async function updateWorkflowRun(
  db: Database,
  id: string,
  data: UpdateWorkflowRun
): Promise<WorkflowRun | undefined> {
  const [result] = await db
    .update(workflowRuns)
    .set(data)
    .where(eq(workflowRuns.id, id))
    .returning();
  return result;
}

/**
 * Update workflow run state with automatic timestamps
 */
export async function updateWorkflowRunState(
  db: Database,
  id: string,
  state: WorkflowRunState,
  conclusion?: WorkflowRunConclusion
): Promise<WorkflowRun | undefined> {
  const updates: UpdateWorkflowRun = { state };

  if (state === 'in_progress') {
    updates.startedAt = new Date();
  }

  if (state === 'completed' || state === 'failed' || state === 'cancelled') {
    updates.completedAt = new Date();
    if (conclusion) {
      updates.conclusion = conclusion;
    }
  }

  return updateWorkflowRun(db, id, updates);
}

/**
 * Delete a workflow run (cascades to jobs and steps)
 */
export async function deleteWorkflowRun(
  db: Database,
  id: string
): Promise<boolean> {
  const result = await db
    .delete(workflowRuns)
    .where(eq(workflowRuns.id, id))
    .returning({ id: workflowRuns.id });
  return result.length > 0;
}

// ============================================================================
// Job Runs
// ============================================================================

/**
 * Create a new job run
 */
export async function createJobRun(
  db: Database,
  data: NewJobRun
): Promise<JobRun> {
  const [result] = await db.insert(jobRuns).values(data).returning();
  return result;
}

/**
 * Create multiple job runs at once
 */
export async function createJobRuns(
  db: Database,
  data: NewJobRun[]
): Promise<JobRun[]> {
  if (data.length === 0) return [];
  return db.insert(jobRuns).values(data).returning();
}

/**
 * Find a job run by ID
 */
export async function findJobRunById(
  db: Database,
  id: string
): Promise<JobRun | undefined> {
  const [result] = await db
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.id, id))
    .limit(1);
  return result;
}

/**
 * Find a job run by ID with all steps
 */
export async function findJobRunByIdWithSteps(
  db: Database,
  id: string
): Promise<JobRunWithSteps | undefined> {
  const jobRun = await findJobRunById(db, id);
  if (!jobRun) return undefined;

  const steps = await findStepRunsByJobRunId(db, id);
  return {
    ...jobRun,
    steps,
  };
}

/**
 * Find job runs by workflow run ID
 */
export async function findJobRunsByWorkflowRunId(
  db: Database,
  workflowRunId: string
): Promise<JobRun[]> {
  return db
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.workflowRunId, workflowRunId));
}

/**
 * Find job runs by state within a workflow run
 */
export async function findJobRunsByWorkflowAndState(
  db: Database,
  workflowRunId: string,
  state: WorkflowRunState
): Promise<JobRun[]> {
  return db
    .select()
    .from(jobRuns)
    .where(
      and(
        eq(jobRuns.workflowRunId, workflowRunId),
        eq(jobRuns.state, state)
      )
    );
}

/**
 * Update a job run
 */
export async function updateJobRun(
  db: Database,
  id: string,
  data: UpdateJobRun
): Promise<JobRun | undefined> {
  const [result] = await db
    .update(jobRuns)
    .set(data)
    .where(eq(jobRuns.id, id))
    .returning();
  return result;
}

/**
 * Update job run state with automatic timestamps
 */
export async function updateJobRunState(
  db: Database,
  id: string,
  state: WorkflowRunState,
  conclusion?: WorkflowRunConclusion
): Promise<JobRun | undefined> {
  const updates: UpdateJobRun = { state };

  if (state === 'in_progress') {
    updates.startedAt = new Date();
  }

  if (state === 'completed' || state === 'failed' || state === 'cancelled') {
    updates.completedAt = new Date();
    if (conclusion) {
      updates.conclusion = conclusion;
    }
  }

  return updateJobRun(db, id, updates);
}

/**
 * Append logs to a job run
 */
export async function appendJobRunLogs(
  db: Database,
  id: string,
  logs: string
): Promise<JobRun | undefined> {
  const jobRun = await findJobRunById(db, id);
  if (!jobRun) return undefined;

  const existingLogs = jobRun.logs || '';
  const newLogs = existingLogs + logs;

  return updateJobRun(db, id, { logs: newLogs });
}

/**
 * Delete a job run (cascades to steps)
 */
export async function deleteJobRun(
  db: Database,
  id: string
): Promise<boolean> {
  const result = await db
    .delete(jobRuns)
    .where(eq(jobRuns.id, id))
    .returning({ id: jobRuns.id });
  return result.length > 0;
}

// ============================================================================
// Step Runs
// ============================================================================

/**
 * Create a new step run
 */
export async function createStepRun(
  db: Database,
  data: NewStepRun
): Promise<StepRun> {
  const [result] = await db.insert(stepRuns).values(data).returning();
  return result;
}

/**
 * Create multiple step runs at once
 */
export async function createStepRuns(
  db: Database,
  data: NewStepRun[]
): Promise<StepRun[]> {
  if (data.length === 0) return [];
  return db.insert(stepRuns).values(data).returning();
}

/**
 * Find a step run by ID
 */
export async function findStepRunById(
  db: Database,
  id: string
): Promise<StepRun | undefined> {
  const [result] = await db
    .select()
    .from(stepRuns)
    .where(eq(stepRuns.id, id))
    .limit(1);
  return result;
}

/**
 * Find step runs by job run ID (ordered by step number)
 */
export async function findStepRunsByJobRunId(
  db: Database,
  jobRunId: string
): Promise<StepRun[]> {
  return db
    .select()
    .from(stepRuns)
    .where(eq(stepRuns.jobRunId, jobRunId))
    .orderBy(asc(stepRuns.stepNumber));
}

/**
 * Update a step run
 */
export async function updateStepRun(
  db: Database,
  id: string,
  data: UpdateStepRun
): Promise<StepRun | undefined> {
  const [result] = await db
    .update(stepRuns)
    .set(data)
    .where(eq(stepRuns.id, id))
    .returning();
  return result;
}

/**
 * Update step run state with automatic timestamps
 */
export async function updateStepRunState(
  db: Database,
  id: string,
  state: WorkflowRunState,
  conclusion?: WorkflowRunConclusion
): Promise<StepRun | undefined> {
  const updates: UpdateStepRun = { state };

  if (state === 'in_progress') {
    updates.startedAt = new Date();
  }

  if (state === 'completed' || state === 'failed' || state === 'cancelled') {
    updates.completedAt = new Date();
    if (conclusion) {
      updates.conclusion = conclusion;
    }
  }

  return updateStepRun(db, id, updates);
}

/**
 * Append logs to a step run
 */
export async function appendStepRunLogs(
  db: Database,
  id: string,
  logs: string
): Promise<StepRun | undefined> {
  const stepRun = await findStepRunById(db, id);
  if (!stepRun) return undefined;

  const existingLogs = stepRun.logs || '';
  const newLogs = existingLogs + logs;

  return updateStepRun(db, id, { logs: newLogs });
}

/**
 * Delete a step run
 */
export async function deleteStepRun(
  db: Database,
  id: string
): Promise<boolean> {
  const result = await db
    .delete(stepRuns)
    .where(eq(stepRuns.id, id))
    .returning({ id: stepRuns.id });
  return result.length > 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if all jobs in a workflow run are complete
 */
export async function areAllJobsComplete(
  db: Database,
  workflowRunId: string
): Promise<boolean> {
  const jobs = await findJobRunsByWorkflowRunId(db, workflowRunId);
  return jobs.every(
    (job) =>
      job.state === 'completed' ||
      job.state === 'failed' ||
      job.state === 'cancelled'
  );
}

/**
 * Check if all steps in a job run are complete
 */
export async function areAllStepsComplete(
  db: Database,
  jobRunId: string
): Promise<boolean> {
  const steps = await findStepRunsByJobRunId(db, jobRunId);
  return steps.every(
    (step) =>
      step.state === 'completed' ||
      step.state === 'failed' ||
      step.state === 'cancelled'
  );
}

/**
 * Determine workflow conclusion based on job conclusions
 */
export async function determineWorkflowConclusion(
  db: Database,
  workflowRunId: string
): Promise<WorkflowRunConclusion> {
  const jobs = await findJobRunsByWorkflowRunId(db, workflowRunId);

  if (jobs.some((job) => job.conclusion === 'cancelled')) {
    return 'cancelled';
  }

  if (jobs.some((job) => job.conclusion === 'failure')) {
    return 'failure';
  }

  return 'success';
}

/**
 * Determine job conclusion based on step conclusions
 */
export async function determineJobConclusion(
  db: Database,
  jobRunId: string
): Promise<WorkflowRunConclusion> {
  const steps = await findStepRunsByJobRunId(db, jobRunId);

  if (steps.some((step) => step.conclusion === 'cancelled')) {
    return 'cancelled';
  }

  if (steps.some((step) => step.conclusion === 'failure')) {
    return 'failure';
  }

  return 'success';
}
