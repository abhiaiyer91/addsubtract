/**
 * AI Integration for wit using @mastra/core
 * 
 * This module provides AI-powered features for wit including:
 * - Intelligent commit message generation
 * - AI-assisted merge conflict resolution
 * - Natural language git commands
 * - Code review and analysis
 * - Multi-step AI workflows for PR review, issue triage, and code generation
 */

// Mastra configuration and helpers
export { 
  createTsgitMastra, 
  getTsgitMastra,
  getTsgitAgent,
  // Workflow runners
  runPRReviewWorkflow,
  runIssueTriageWorkflow,
  runCodeGenerationWorkflow,
  runPlanningWorkflow,
  runPlanningIterationWorkflow,
  runCIExecutionWorkflow,
  // Workflow streamers
  streamPRReviewWorkflow,
  streamIssueTriageWorkflow,
  streamCodeGenerationWorkflow,
  streamPlanningWorkflow,
  streamPlanningIterationWorkflow,
  streamCIExecutionWorkflow,
} from './mastra.js';

// Tools
export { witTools } from './tools/index.js';

// Agent
export { witAgent } from './agent.js';

// Workflows
export {
  prReviewWorkflow,
  issueTriageWorkflow,
  codeGenerationWorkflow,
  planningWorkflow,
  planningIterationWorkflow,
  type PRReviewInput,
  type PRReviewOutput,
  type IssueTriageInput,
  type IssueTriageOutput,
  type CodeGenerationInput,
  type CodeGenerationOutput,
  type PlanningWorkflowInput,
  type PlanningWorkflowOutput,
  type PlanningIterationInput,
  type PlanningIterationOutput,
} from './workflows/index.js';

// CI/CD Workflow (built on Mastra)
export {
  ciExecutionWorkflow,
  type CIExecutionInput,
  type CIExecutionOutput,
  type StepResult as CIStepResult,
  type JobResult as CIJobResult,
  type ExecutionContext as CIExecutionContext,
} from '../ci/workflows/index.js';

// Types
export type { 
  AIConfig, 
  CommitMessageOptions, 
  ConflictResolutionOptions,
  AgentMode,
  AgentContext,
} from './types.js';
