/**
 * CI/CD Mastra Workflows
 * 
 * This module exports Mastra-based workflows for CI/CD execution.
 * The workflows provide observability, retry handling, and streaming
 * capabilities on top of the core CI/CD execution engine.
 */

// Main CI Execution Workflow
export {
  ciExecutionWorkflow,
  type CIExecutionInput,
  type CIExecutionOutput,
  type StepResult,
  type JobResult,
  type ExecutionContext,
} from './ci-execution.workflow.js';

// Re-export schemas for external validation
export {
  CIExecutionInputSchema,
  CIExecutionOutputSchema,
  StepResultSchema,
  JobResultSchema,
} from './ci-execution.workflow.js';
