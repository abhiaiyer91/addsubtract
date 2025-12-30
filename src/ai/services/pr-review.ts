/**
 * Automatic AI PR Review Service
 * 
 * Provides automatic AI code review for pull requests using CodeRabbit.
 * Reviews are triggered asynchronously when PRs are created or updated.
 * 
 * CodeRabbit is required for AI reviews - there is no built-in fallback analyzer.
 */

import { prModel, repoModel, repoAiKeyModel } from '../../db/models';
import { resolveDiskPath } from '../../server/storage/repos';
import { exists } from '../../utils/fs';
import {
  reviewRepo as codeRabbitReviewRepo,
  getCodeRabbitStatus,
  type CodeRabbitReviewResult,
} from '../../utils/coderabbit';

/**
 * AI Review result
 */
export interface AIReviewResult {
  summary: string;
  approved: boolean;
  score: number; // 1-10
  issues: AIReviewIssue[];
  suggestions: string[];
  securityConcerns: string[];
}

export interface AIReviewIssue {
  severity: 'info' | 'warning' | 'error';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
  category?: 'bug' | 'security' | 'performance' | 'style' | 'maintainability';
}



/**
 * Convert CodeRabbit result to our AIReviewResult format
 */
function convertCodeRabbitResult(crResult: CodeRabbitReviewResult): AIReviewResult {
  const issues: AIReviewIssue[] = crResult.issues.map(issue => ({
    severity: issue.severity === 'critical' ? 'error' : 
              issue.severity === 'high' ? 'error' :
              issue.severity === 'medium' ? 'warning' : 'info',
    file: issue.file,
    line: issue.line,
    message: issue.message,
    suggestion: issue.suggestion,
    category: issue.category as AIReviewIssue['category'],
  }));

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  
  // Calculate score based on issues
  let score = 10;
  score -= errorCount * 2;
  score -= warningCount * 0.5;
  score = Math.max(1, Math.min(10, Math.round(score)));

  const approved = errorCount === 0 && warningCount <= 2;

  return {
    summary: crResult.summary || 'Review completed',
    approved,
    score,
    issues,
    suggestions: crResult.suggestions.map(s => s.message),
    securityConcerns: issues
      .filter(i => i.category === 'security' || i.message.toLowerCase().includes('security'))
      .map(i => `${i.file}${i.line ? `:${i.line}` : ''}: ${i.message}`),
  };
}

/**
 * Run an AI review on a pull request using CodeRabbit
 * 
 * CodeRabbit CLI must be installed and configured with an API key.
 * Returns null if CodeRabbit is not available.
 */
export async function runAIReview(prId: string): Promise<AIReviewResult | null> {
  try {
    // Get PR details
    const pr = await prModel.findById(prId);
    if (!pr) {
      console.error('[AI Review] PR not found:', prId);
      return null;
    }

    // Get repo details
    const repo = await repoModel.findById(pr.repoId);
    if (!repo) {
      console.error('[AI Review] Repo not found:', pr.repoId);
      return null;
    }

    // Resolve disk path
    const diskPath = resolveDiskPath(repo.diskPath);

    if (!exists(diskPath)) {
      console.error('[AI Review] Repo not found on disk:', diskPath);
      return null;
    }

    // Check for CodeRabbit CLI installation
    const crStatus = await getCodeRabbitStatus();
    if (!crStatus.installed) {
      console.error('[AI Review] CodeRabbit CLI not installed. Install with: curl -fsSL https://cli.coderabbit.ai/install.sh | sh');
      return null;
    }

    // Check for CodeRabbit API key (repo-level or server-level)
    const codeRabbitKey = await repoAiKeyModel.getCodeRabbitKey(pr.repoId);
    if (!codeRabbitKey) {
      console.error('[AI Review] CodeRabbit API key not configured. Set CODERABBIT_API_KEY or configure in repository settings.');
      return null;
    }

    console.log(`[AI Review] Running CodeRabbit review for PR #${pr.number} in ${repo.name}`);

    const crResult = await codeRabbitReviewRepo(diskPath, { 
      apiKey: codeRabbitKey,
      baseCommit: pr.baseSha,
    });
    
    if (!crResult.success) {
      console.error('[AI Review] CodeRabbit review failed:', crResult.error);
      return null;
    }

    const result = convertCodeRabbitResult(crResult);
    console.log(`[AI Review] CodeRabbit found ${result.issues.length} issues, score: ${result.score}/10`);

    return result;
  } catch (error) {
    console.error('[AI Review] Error running review:', error);
    return null;
  }
}

/**
 * Trigger an async AI review for a PR
 * This is fire-and-forget - it doesn't block the caller
 */
export function triggerAsyncReview(prId: string): void {
  // Run in background - don't await
  setImmediate(() => {
    runAIReview(prId).catch(err => {
      console.error('[AI Review] Background review failed:', err);
    });
  });
}
