/**
 * CodeRabbit Analyzer
 * 
 * Integrates with CodeRabbit CLI for AI-powered code analysis.
 * Provides comprehensive reviews including:
 * - Code quality issues
 * - Security vulnerabilities
 * - Performance problems
 * - Best practices violations
 */

import type { Analyzer, AnalyzerResult, AnalyzerFinding, ScanOptions } from '../types';
import { 
  reviewRepo, 
  getCodeRabbitStatus,
  type CodeRabbitReviewResult,
  type CodeRabbitIssue,
} from '../../utils/coderabbit';

/**
 * Map CodeRabbit severity to Sentinel severity
 */
function mapSeverity(crSeverity: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  switch (crSeverity.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
    case 'error':
      return 'high';
    case 'medium':
    case 'warning':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

/**
 * Map CodeRabbit category to Sentinel category
 */
function mapCategory(
  crCategory: string
): 'security' | 'performance' | 'maintainability' | 'reliability' | 'best_practice' | 'code_style' | 'other' {
  const lower = crCategory.toLowerCase();
  
  if (lower.includes('security') || lower.includes('vuln')) {
    return 'security';
  }
  if (lower.includes('performance') || lower.includes('perf')) {
    return 'performance';
  }
  if (lower.includes('maintain') || lower.includes('complex')) {
    return 'maintainability';
  }
  if (lower.includes('reliable') || lower.includes('error') || lower.includes('bug')) {
    return 'reliability';
  }
  if (lower.includes('style') || lower.includes('format')) {
    return 'code_style';
  }
  if (lower.includes('best') || lower.includes('practice')) {
    return 'best_practice';
  }
  
  return 'other';
}

/**
 * Convert CodeRabbit issue to Sentinel finding
 */
function convertIssue(issue: CodeRabbitIssue): AnalyzerFinding {
  return {
    severity: mapSeverity(issue.severity),
    category: mapCategory(issue.category),
    analyzer: 'coderabbit',
    filePath: issue.file || 'unknown',
    line: issue.line,
    endLine: issue.endLine,
    title: issue.category || 'CodeRabbit Finding',
    message: issue.message,
    suggestion: issue.suggestion,
  };
}

export class CodeRabbitAnalyzer implements Analyzer {
  name = 'coderabbit';

  async analyze(options: ScanOptions): Promise<AnalyzerResult> {
    const startTime = Date.now();
    const findings: AnalyzerFinding[] = [];

    try {
      // Check if CodeRabbit is available
      const status = await getCodeRabbitStatus();
      
      if (!status.installed) {
        return {
          analyzer: this.name,
          success: false,
          findings: [],
          filesAnalyzed: 0,
          error: 'CodeRabbit CLI is not installed. Install with: curl -fsSL https://cli.coderabbit.ai/install.sh | sh',
          durationMs: Date.now() - startTime,
        };
      }

      if (!status.apiKeyConfigured) {
        return {
          analyzer: this.name,
          success: false,
          findings: [],
          filesAnalyzed: 0,
          error: 'CodeRabbit API key not configured. Set CODERABBIT_API_KEY environment variable or run: coderabbit auth login',
          durationMs: Date.now() - startTime,
        };
      }

      // Run CodeRabbit review
      const result: CodeRabbitReviewResult = await reviewRepo(options.repoPath, {
        cwd: options.repoPath,
        baseBranch: options.branch === 'main' ? undefined : 'main', // Compare to main if not on main
        plain: true,
      });

      if (!result.success) {
        return {
          analyzer: this.name,
          success: false,
          findings: [],
          filesAnalyzed: 0,
          error: result.error || 'CodeRabbit review failed',
          durationMs: Date.now() - startTime,
          rawOutput: result.rawOutput,
        };
      }

      // Convert issues to findings
      for (const issue of result.issues) {
        findings.push(convertIssue(issue));
      }

      // Also add suggestions as info-level findings
      for (const suggestion of result.suggestions) {
        findings.push({
          severity: 'info',
          category: 'best_practice',
          analyzer: this.name,
          filePath: suggestion.file || 'general',
          line: suggestion.line,
          title: 'Suggestion',
          message: suggestion.message,
          suggestedFix: suggestion.code,
        });
      }

      return {
        analyzer: this.name,
        success: true,
        findings,
        filesAnalyzed: result.stats?.filesReviewed || 0,
        durationMs: Date.now() - startTime,
        rawOutput: result.rawOutput,
      };
    } catch (error) {
      return {
        analyzer: this.name,
        success: false,
        findings,
        filesAnalyzed: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }
}
