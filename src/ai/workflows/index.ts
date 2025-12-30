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

// Marketing Content Workflow
export {
  marketingContentWorkflow,
  runMarketingContentWorkflow,
  type MarketingContentInput,
  type MarketingContentOutput,
} from './marketing-content.workflow.js';

// Multi-Agent Planning Workflow
export {
  multiAgentPlanningWorkflow,
  runMultiAgentPlanningWorkflow,
  streamMultiAgentPlanningWorkflow,
  type MultiAgentPlanningInput,
  type MultiAgentPlanningOutput,
  type ExecutionPlan,
  type Subtask,
  type ParallelGroup,
  type SubtaskResult,
  type GroupResult,
  type ReviewResult,
} from './multi-agent-planning.workflow.js';
