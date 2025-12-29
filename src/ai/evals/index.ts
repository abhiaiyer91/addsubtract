/**
 * AI Evaluations Module
 * 
 * Framework for evaluating AI output quality.
 */

// Core evaluator
export {
  Evaluator,
  runEval,
  getRecentEvals,
  getEvalSummary,
  getEvalStore,
} from './evaluator.js';

// Specific evaluators
export {
  CommitMessageEvaluator,
  createCommitMessageEvaluator,
} from './commit-message-eval.js';

// Types
export type {
  EvalType,
  EvalSeverity,
  EvalCriterion,
  EvalResult,
  EvalConfig,
  EvalSummary,
  CommitMessageEvalInput,
  PRReviewEvalInput,
  CodeGenerationEvalInput,
  IssueTriageEvalInput,
} from './types.js';
