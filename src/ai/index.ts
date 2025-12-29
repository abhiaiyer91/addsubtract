/**
 * AI Integration for wit using @mastra/core
 * 
 * This module provides AI-powered features for wit including:
 * - Intelligent commit message generation
 * - AI-assisted merge conflict resolution
 * - Natural language git commands
 * - Code review and analysis
 * - Multi-step AI workflows for PR review, issue triage, and code generation
 * - RAG-powered knowledge base for codebase understanding
 * - Multi-agent orchestration for complex tasks
 * - AI quality evaluations
 */

// =============================================================================
// Mastra Configuration
// =============================================================================

export { 
  createTsgitMastra, 
  getTsgitMastra,
  getTsgitAgent,
  // Workflow runners
  runPRReviewWorkflow,
  runIssueTriageWorkflow,
  runCodeGenerationWorkflow,
  // Workflow streamers
  streamPRReviewWorkflow,
  streamIssueTriageWorkflow,
  streamCodeGenerationWorkflow,
} from './mastra.js';

// =============================================================================
// Tools
// =============================================================================

export { witTools, virtualTools } from './tools/index.js';

// =============================================================================
// Agents
// =============================================================================

// Main agent
export { witAgent } from './agent.js';

// Specialized agents
export {
  createOrchestratorAgent,
  createCodeAgent,
  createPMAgent,
  createReviewAgent,
  createSearchAgent,
  createTriageAgent,
  runTriageAgent,
  createAgentForMode,
  getDefaultMode,
  // Instructions (for customization)
  ORCHESTRATOR_INSTRUCTIONS,
  CODE_AGENT_INSTRUCTIONS,
  PM_AGENT_INSTRUCTIONS,
  REVIEW_AGENT_INSTRUCTIONS,
  SEARCH_AGENT_INSTRUCTIONS,
  TRIAGE_AGENT_INSTRUCTIONS,
  // Types
  type TriageContext,
  type TriageResult,
} from './agents/index.js';

// =============================================================================
// Knowledge Base (RAG)
// =============================================================================

export {
  // Core
  KnowledgeBase,
  getKnowledgeBase,
  clearKnowledgeBaseCache,
  // Context building
  buildContext,
  buildContextWithBudget,
  formatContextForPrompt,
  summarizeContext,
  estimateContextTokens,
  // Indexing
  IncrementalIndexer,
  createIndexer,
  // Types
  type KnowledgeChunk,
  type KnowledgeType,
  type KnowledgeMetadata,
  type KnowledgeQueryOptions,
  type KnowledgeQueryResult,
  type KnowledgeStats,
  type IndexOptions,
  type IndexResult,
  type AIContext,
  type ContextBuildOptions,
} from './knowledge/index.js';

// =============================================================================
// Evaluations
// =============================================================================

export {
  // Core
  Evaluator,
  runEval,
  getRecentEvals,
  getEvalSummary,
  getEvalStore,
  // Evaluators
  CommitMessageEvaluator,
  createCommitMessageEvaluator,
  // Types
  type EvalType,
  type EvalSeverity,
  type EvalCriterion,
  type EvalResult,
  type EvalConfig,
  type EvalSummary,
  type CommitMessageEvalInput,
  type PRReviewEvalInput,
  type CodeGenerationEvalInput,
  type IssueTriageEvalInput,
} from './evals/index.js';

// =============================================================================
// Workflows
// =============================================================================

export {
  prReviewWorkflow,
  issueTriageWorkflow,
  codeGenerationWorkflow,
  type PRReviewInput,
  type PRReviewOutput,
  type IssueTriageInput,
  type IssueTriageOutput,
  type CodeGenerationInput,
  type CodeGenerationOutput,
} from './workflows/index.js';

// =============================================================================
// Types
// =============================================================================

export type { 
  AIConfig, 
  CommitMessageOptions, 
  ConflictResolutionOptions,
  AgentMode,
  AgentContext,
} from './types.js';
