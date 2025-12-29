/**
 * AI Evaluator
 * 
 * Core evaluation framework for measuring AI output quality.
 * Uses a combination of rule-based checks and AI judging.
 */

import * as crypto from 'crypto';
import type {
  EvalType,
  EvalResult,
  EvalCriterion,
  EvalConfig,
  EvalSummary,
  EvalSeverity,
} from './types.js';

/**
 * Base class for evaluators
 */
export abstract class Evaluator<TInput> {
  protected type: EvalType;
  protected config: EvalConfig;

  constructor(type: EvalType, config: Partial<EvalConfig> = {}) {
    this.type = type;
    this.config = {
      type,
      passThreshold: 0.7,
      useAIJudge: false,
      ...config,
    };
  }

  /**
   * Run the evaluation
   */
  async evaluate(input: TInput): Promise<EvalResult> {
    const startTime = Date.now();
    
    // Run all criteria evaluations
    const criteria = await this.evaluateCriteria(input);
    
    // Calculate overall score
    const score = criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length;
    
    // Determine pass/fail
    const passed = score >= (this.config.passThreshold || 0.7);
    
    // Determine severity
    const severity = this.determineSeverity(score, criteria);
    
    // Generate summary and suggestions
    const { summary, suggestions } = this.generateFeedback(criteria, score);
    
    return {
      id: crypto.randomUUID(),
      type: this.type,
      score,
      passed,
      severity,
      criteria,
      summary,
      suggestions,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      input: input as Record<string, unknown>,
      output: { criteria },
    };
  }

  /**
   * Evaluate individual criteria (implemented by subclasses)
   */
  protected abstract evaluateCriteria(input: TInput): Promise<EvalCriterion[]>;

  /**
   * Determine severity based on score and criteria
   */
  protected determineSeverity(score: number, criteria: EvalCriterion[]): EvalSeverity {
    // Check for critical failures
    const criticalFailures = criteria.filter(c => 
      !c.passed && c.name.toLowerCase().includes('security')
    );
    
    if (criticalFailures.length > 0) {
      return 'fail';
    }
    
    if (score >= 0.8) return 'pass';
    if (score >= 0.5) return 'warning';
    return 'fail';
  }

  /**
   * Generate summary and suggestions
   */
  protected generateFeedback(
    criteria: EvalCriterion[],
    score: number
  ): { summary: string; suggestions: string[] } {
    const failed = criteria.filter(c => !c.passed);
    const passed = criteria.filter(c => c.passed);
    
    const summary = score >= 0.8
      ? `Excellent! ${passed.length}/${criteria.length} criteria passed.`
      : score >= 0.5
      ? `Needs improvement. ${failed.length} criteria need attention.`
      : `Poor quality. ${failed.length}/${criteria.length} criteria failed.`;
    
    const suggestions = failed
      .map(c => c.feedback || `Improve: ${c.name}`)
      .filter(Boolean);
    
    return { summary, suggestions };
  }
}

/**
 * Store for eval results
 */
class EvalStore {
  private results: EvalResult[] = [];
  private maxSize = 1000;

  add(result: EvalResult): void {
    this.results.push(result);
    
    // Trim if too large
    if (this.results.length > this.maxSize) {
      this.results = this.results.slice(-this.maxSize);
    }
  }

  getRecent(type?: EvalType, limit = 100): EvalResult[] {
    let filtered = this.results;
    
    if (type) {
      filtered = filtered.filter(r => r.type === type);
    }
    
    return filtered.slice(-limit);
  }

  getSummary(type: EvalType, days = 7): EvalSummary {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results = this.results.filter(r => 
      r.type === type && r.timestamp >= cutoff
    );
    
    if (results.length === 0) {
      return {
        type,
        runCount: 0,
        averageScore: 0,
        passRate: 0,
        commonIssues: [],
        period: { start: cutoff, end: new Date() },
      };
    }
    
    const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const passRate = results.filter(r => r.passed).length / results.length;
    
    // Find common issues
    const issueCount = new Map<string, number>();
    for (const result of results) {
      for (const criterion of result.criteria.filter(c => !c.passed)) {
        const count = issueCount.get(criterion.name) || 0;
        issueCount.set(criterion.name, count + 1);
      }
    }
    
    const commonIssues = Array.from(issueCount.entries())
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Calculate trend (compare first half to second half)
    const midpoint = Math.floor(results.length / 2);
    if (midpoint > 0) {
      const firstHalf = results.slice(0, midpoint);
      const secondHalf = results.slice(midpoint);
      const firstAvg = firstHalf.reduce((sum, r) => sum + r.score, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, r) => sum + r.score, 0) / secondHalf.length;
      const trend = secondAvg - firstAvg;
      
      return {
        type,
        runCount: results.length,
        averageScore,
        passRate,
        commonIssues,
        trend,
        period: { start: cutoff, end: new Date() },
      };
    }
    
    return {
      type,
      runCount: results.length,
      averageScore,
      passRate,
      commonIssues,
      period: { start: cutoff, end: new Date() },
    };
  }

  clear(): void {
    this.results = [];
  }
}

// Global eval store
const evalStore = new EvalStore();

/**
 * Get the eval store
 */
export function getEvalStore(): EvalStore {
  return evalStore;
}

/**
 * Run an evaluation and store the result
 */
export async function runEval<TInput>(
  evaluator: Evaluator<TInput>,
  input: TInput
): Promise<EvalResult> {
  const result = await evaluator.evaluate(input);
  evalStore.add(result);
  return result;
}

/**
 * Get recent eval results
 */
export function getRecentEvals(type?: EvalType, limit = 100): EvalResult[] {
  return evalStore.getRecent(type, limit);
}

/**
 * Get eval summary
 */
export function getEvalSummary(type: EvalType, days = 7): EvalSummary {
  return evalStore.getSummary(type, days);
}
