/**
 * Database Schema
 * 
 * Drizzle ORM schema definitions for the wit CI/CD system.
 */

import { pgTable, pgEnum, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';

// ============================================================================
// Enums
// ============================================================================

/**
 * Workflow run state enum
 * Tracks the lifecycle state of workflow, job, and step runs
 */
export const workflowRunStateEnum = pgEnum('workflow_run_state', [
  'queued',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);

// ============================================================================
// Base Tables (referenced by workflow tables)
// ============================================================================

/**
 * Users table - represents system users
 * Placeholder for user management system
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Repositories table - represents git repositories
 * Placeholder for repository management
 */
export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// Workflow Run Tables
// ============================================================================

/**
 * Workflow runs table
 * Tracks individual executions of CI/CD workflows
 */
export const workflowRuns = pgTable('workflow_runs', {
  /** Unique identifier for the workflow run */
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Repository this workflow belongs to */
  repoId: uuid('repo_id').notNull().references(() => repositories.id),
  
  /** Path to the workflow file (e.g., .wit/workflows/ci.yml) */
  workflowPath: text('workflow_path').notNull(),
  
  /** Name of the workflow */
  workflowName: text('workflow_name').notNull(),
  
  /** Commit SHA that triggered this workflow */
  commitSha: text('commit_sha').notNull(),
  
  /** Branch name (if applicable) */
  branch: text('branch'),
  
  /** Event that triggered the workflow (push, pull_request, etc.) */
  event: text('event').notNull(),
  
  /** JSON-serialized event payload */
  eventPayload: text('event_payload'),
  
  /** Current state of the workflow run */
  state: workflowRunStateEnum('state').notNull().default('queued'),
  
  /** Final conclusion (success, failure, cancelled) */
  conclusion: text('conclusion'),
  
  /** User who triggered the workflow (if manual) */
  triggeredById: uuid('triggered_by_id').references(() => users.id),
  
  /** When the workflow run was created/queued */
  createdAt: timestamp('created_at').defaultNow().notNull(),
  
  /** When the workflow run started executing */
  startedAt: timestamp('started_at'),
  
  /** When the workflow run completed */
  completedAt: timestamp('completed_at'),
});

/**
 * Job runs table
 * Tracks individual job executions within a workflow run
 */
export const jobRuns = pgTable('job_runs', {
  /** Unique identifier for the job run */
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Parent workflow run */
  workflowRunId: uuid('workflow_run_id')
    .notNull()
    .references(() => workflowRuns.id, { onDelete: 'cascade' }),
  
  /** Name of the job */
  jobName: text('job_name').notNull(),
  
  /** Current state of the job */
  state: workflowRunStateEnum('state').notNull().default('queued'),
  
  /** Final conclusion (success, failure, cancelled) */
  conclusion: text('conclusion'),
  
  /** Runner that executed this job */
  runner: text('runner'),
  
  /** When the job started executing */
  startedAt: timestamp('started_at'),
  
  /** When the job completed */
  completedAt: timestamp('completed_at'),
  
  /** Job execution logs */
  logs: text('logs'),
  
  /** JSON-serialized job outputs */
  outputs: text('outputs'),
});

/**
 * Step runs table
 * Tracks individual step executions within a job run
 */
export const stepRuns = pgTable('step_runs', {
  /** Unique identifier for the step run */
  id: uuid('id').primaryKey().defaultRandom(),
  
  /** Parent job run */
  jobRunId: uuid('job_run_id')
    .notNull()
    .references(() => jobRuns.id, { onDelete: 'cascade' }),
  
  /** Name of the step (optional) */
  stepName: text('step_name'),
  
  /** Step number within the job (1-indexed) */
  stepNumber: integer('step_number').notNull(),
  
  /** Current state of the step */
  state: workflowRunStateEnum('state').notNull().default('queued'),
  
  /** Final conclusion (success, failure, cancelled) */
  conclusion: text('conclusion'),
  
  /** When the step started executing */
  startedAt: timestamp('started_at'),
  
  /** When the step completed */
  completedAt: timestamp('completed_at'),
  
  /** Step execution logs */
  logs: text('logs'),
});

// ============================================================================
// Type Exports
// ============================================================================

/** Workflow run state type */
export type WorkflowRunState = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

/** Workflow run conclusion type */
export type WorkflowRunConclusion = 'success' | 'failure' | 'cancelled';

/** Inferred types from schema */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;

export type JobRun = typeof jobRuns.$inferSelect;
export type NewJobRun = typeof jobRuns.$inferInsert;

export type StepRun = typeof stepRuns.$inferSelect;
export type NewStepRun = typeof stepRuns.$inferInsert;
