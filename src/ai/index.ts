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
  runCIExecutionWorkflow,
  runMultiAgentPlanningWorkflow,
  // Workflow streamers
  streamPRReviewWorkflow,
  streamIssueTriageWorkflow,
  streamCodeGenerationWorkflow,
  streamCIExecutionWorkflow,
  streamMultiAgentPlanningWorkflow,
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
  multiAgentPlanningWorkflow,
  type PRReviewInput,
  type PRReviewOutput,
  type IssueTriageInput,
  type IssueTriageOutput,
  type CodeGenerationInput,
  type CodeGenerationOutput,
  type MultiAgentPlanningInput,
  type MultiAgentPlanningOutput,
  type ExecutionPlan,
  type Subtask,
  type ParallelGroup,
  type SubtaskResult,
  type GroupResult,
  type ReviewResult,
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
