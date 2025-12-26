/**
 * Database Module
 * 
 * Exports schema definitions and model operations for the wit database.
 */

// Schema exports
export {
  // Enums
  workflowRunStateEnum,
  
  // Tables
  users,
  repositories,
  workflowRuns,
  jobRuns,
  stepRuns,
  
  // Types
  type WorkflowRunState,
  type WorkflowRunConclusion,
  type User,
  type NewUser,
  type Repository,
  type NewRepository,
  type WorkflowRun,
  type NewWorkflowRun,
  type JobRun,
  type NewJobRun,
  type StepRun,
  type NewStepRun,
} from './schema';

// Model exports
export {
  // Types
  type Database,
  type UpdateWorkflowRun,
  type UpdateJobRun,
  type UpdateStepRun,
  type WorkflowRunWithJobs,
  type JobRunWithSteps,
  
  // Workflow run operations
  createWorkflowRun,
  findWorkflowRunById,
  findWorkflowRunByIdWithJobs,
  findWorkflowRunsByRepoId,
  findWorkflowRunsByState,
  updateWorkflowRun,
  updateWorkflowRunState,
  deleteWorkflowRun,
  
  // Job run operations
  createJobRun,
  createJobRuns,
  findJobRunById,
  findJobRunByIdWithSteps,
  findJobRunsByWorkflowRunId,
  findJobRunsByWorkflowAndState,
  updateJobRun,
  updateJobRunState,
  appendJobRunLogs,
  deleteJobRun,
  
  // Step run operations
  createStepRun,
  createStepRuns,
  findStepRunById,
  findStepRunsByJobRunId,
  updateStepRun,
  updateStepRunState,
  appendStepRunLogs,
  deleteStepRun,
  
  // Utility functions
  areAllJobsComplete,
  areAllStepsComplete,
  determineWorkflowConclusion,
  determineJobConclusion,
} from './models/workflow-runs';
