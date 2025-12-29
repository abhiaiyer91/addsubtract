/**
 * Mastra Workflows for wit
 * 
 * Workflows provide multi-step orchestration for complex AI tasks.
 * Each workflow breaks down a task into discrete steps with proper
 * data flow, error handling, and observability.
 */

// PR Review Workflow
export { 
  prReviewWorkflow,
  type PRReviewInput,
  type PRReviewOutput,
} from './pr-review.workflow.js';

// Issue Triage Workflow
export {
  issueTriageWorkflow,
  type IssueTriageInput,
  type IssueTriageOutput,
} from './issue-triage.workflow.js';

// Code Generation Workflow
export {
  codeGenerationWorkflow,
  type CodeGenerationInput,
  type CodeGenerationOutput,
} from './code-generation.workflow.js';

// Planning Workflow (Multi-Agent Parallel Execution)
export {
  startPlanningSession,
  iteratePlan,
  generateTasks,
  finalizeTasks,
  executeTasks,
  cancelSession,
  getSessionDetails,
  type StartPlanningInput,
  type PlanningIterationInput,
  type FinalizeTasksInput,
  type ExecuteTasksInput,
  type TaskExecutionResult,
  type PlanningSession,
  type AgentTask,
  type TaskGeneration,
} from './planning-workflow.js';
