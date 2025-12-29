/**
 * AI Evaluation Types
 * 
 * Types for the evaluation framework that measures AI output quality.
 */

import { z } from 'zod';

/**
 * Types of evaluations we can run
 */
export type EvalType = 
  | 'commit-message'    // Quality of generated commit messages
  | 'pr-review'         // Quality of PR reviews
  | 'code-generation'   // Quality of generated code
  | 'issue-triage'      // Accuracy of issue categorization
  | 'search-relevance'  // Relevance of search results
  | 'agent-response';   // Overall agent response quality

/**
 * Severity of eval findings
 */
export type EvalSeverity = 'pass' | 'warning' | 'fail';

/**
 * A single evaluation criterion
 */
export interface EvalCriterion {
  /** Criterion name */
  name: string;
  /** Description of what's being evaluated */
  description: string;
  /** Score (0-1) */
  score: number;
  /** Whether this passed */
  passed: boolean;
  /** Feedback about this criterion */
  feedback?: string;
}

/**
 * Result of running an evaluation
 */
export interface EvalResult {
  /** Unique ID for this eval run */
  id: string;
  /** Type of evaluation */
  type: EvalType;
  /** Overall score (0-1) */
  score: number;
  /** Overall passed/failed */
  passed: boolean;
  /** Severity level */
  severity: EvalSeverity;
  /** Individual criteria results */
  criteria: EvalCriterion[];
  /** Summary of the evaluation */
  summary: string;
  /** Suggestions for improvement */
  suggestions?: string[];
  /** Timestamp */
  timestamp: Date;
  /** Duration in ms */
  duration: number;
  /** The input that was evaluated */
  input: Record<string, unknown>;
  /** The output that was evaluated */
  output: Record<string, unknown>;
}

/**
 * Configuration for an evaluation
 */
export interface EvalConfig {
  /** Evaluation type */
  type: EvalType;
  /** Minimum score to pass */
  passThreshold?: number;
  /** Criteria to evaluate */
  criteria?: string[];
  /** Use AI judge for evaluation */
  useAIJudge?: boolean;
  /** AI model to use for judging */
  judgeModel?: string;
}

/**
 * Summary of multiple eval runs
 */
export interface EvalSummary {
  /** Evaluation type */
  type: EvalType;
  /** Number of runs */
  runCount: number;
  /** Average score */
  averageScore: number;
  /** Pass rate (0-1) */
  passRate: number;
  /** Most common issues */
  commonIssues: Array<{ issue: string; count: number }>;
  /** Score trend (positive = improving) */
  trend?: number;
  /** Time period */
  period: { start: Date; end: Date };
}

/**
 * Input for commit message evaluation
 */
export interface CommitMessageEvalInput {
  /** The git diff */
  diff: string;
  /** The generated commit message */
  message: string;
  /** File paths changed */
  files?: string[];
}

/**
 * Input for PR review evaluation
 */
export interface PRReviewEvalInput {
  /** The PR diff */
  diff: string;
  /** The generated review */
  review: string;
  /** Issues found */
  issues?: Array<{ severity: string; message: string }>;
  /** Whether approved */
  approved?: boolean;
}

/**
 * Input for code generation evaluation
 */
export interface CodeGenerationEvalInput {
  /** The prompt/request */
  prompt: string;
  /** The generated code */
  code: string;
  /** Language */
  language?: string;
  /** Whether it compiles/parses */
  syntaxValid?: boolean;
  /** Whether tests pass */
  testsPass?: boolean;
}

/**
 * Input for issue triage evaluation
 */
export interface IssueTriageEvalInput {
  /** Issue title */
  title: string;
  /** Issue body */
  body: string;
  /** Assigned labels */
  assignedLabels: string[];
  /** Assigned priority */
  assignedPriority: string;
  /** Expected labels (for evaluation) */
  expectedLabels?: string[];
  /** Expected priority (for evaluation) */
  expectedPriority?: string;
}

/**
 * Zod schemas
 */
export const EvalTypeSchema = z.enum([
  'commit-message',
  'pr-review',
  'code-generation',
  'issue-triage',
  'search-relevance',
  'agent-response',
]);

export const EvalCriterionSchema = z.object({
  name: z.string(),
  description: z.string(),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  feedback: z.string().optional(),
});

export const EvalResultSchema = z.object({
  id: z.string(),
  type: EvalTypeSchema,
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  severity: z.enum(['pass', 'warning', 'fail']),
  criteria: z.array(EvalCriterionSchema),
  summary: z.string(),
  suggestions: z.array(z.string()).optional(),
  timestamp: z.date(),
  duration: z.number(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
});
