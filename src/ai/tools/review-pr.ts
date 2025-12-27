/**
 * Review PR Tool
 * AI-powered code review for pull requests
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { CodeReviewResult, CodeReviewIssue } from '../types.js';

/**
 * Prompt template for code review (for future AI model integration)
 */
export const CODE_REVIEW_PROMPT = `You are an expert code reviewer. Review this pull request diff and provide constructive feedback.

Focus on:
1. Bugs and logic errors
2. Security vulnerabilities (injection, auth issues, data leaks)
3. Performance problems (N+1 queries, memory leaks, inefficient algorithms)
4. Code quality (readability, maintainability, DRY violations)
5. Best practices for the language/framework

For each issue found, provide:
- File path and line number
- Severity (suggestion/warning/error)
- Category (bug/security/performance/style/maintainability)
- Clear explanation and suggested fix

Be constructive and specific. Avoid vague feedback.
`;

/**
 * Severity icons for formatting
 */
const SEVERITY_ICONS = {
  info: 'info',
  warning: 'warning',
  error: 'error',
} as const;

/**
 * Categories for code review issues (exported for external use)
 */
export type ReviewCategory = 'bug' | 'security' | 'performance' | 'style' | 'maintainability';

export const reviewPRTool = createTool({
  id: 'wit-review-pr',
  description: 'Perform an AI-powered code review on a pull request. Analyzes diff for bugs, security issues, performance problems, and code quality. Returns detailed feedback with file paths, line numbers, and suggested fixes.',
  inputSchema: z.object({
    diff: z.string().describe('The diff content to review'),
    files: z.array(z.object({
      path: z.string(),
      content: z.string(),
      language: z.string().optional(),
    })).optional().describe('Full file contents for deeper analysis'),
    context: z.object({
      repoDescription: z.string().optional(),
      styleguide: z.string().optional(),
      previousReviews: z.array(z.string()).optional(),
    }).optional().describe('Additional context for the review'),
  }),
  outputSchema: z.object({
    summary: z.string(),
    issues: z.array(z.object({
      severity: z.enum(['info', 'warning', 'error']),
      file: z.string(),
      line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional(),
      category: z.string().optional(),
    })),
    suggestions: z.array(z.string()),
    securityConcerns: z.array(z.string()),
    overallScore: z.number(),
    approved: z.boolean(),
  }),
  execute: async ({ diff, files, context }): Promise<CodeReviewResult & { approved: boolean }> => {
    // Parse the diff to understand the changes
    const diffAnalysis = parseDiff(diff);
    
    // Analyze for various issue types
    const issues: CodeReviewIssue[] = [];
    const suggestions: string[] = [];
    const securityConcerns: string[] = [];
    
    // Analyze each changed file
    for (const file of diffAnalysis.files) {
      // Check for common issues
      const fileIssues = analyzeFile(file, files, context);
      issues.push(...fileIssues.issues);
      suggestions.push(...fileIssues.suggestions);
      securityConcerns.push(...fileIssues.securityConcerns);
    }
    
    // Generate overall summary
    const summary = generateReviewSummary(diffAnalysis, issues);
    
    // Calculate score (1-10)
    const overallScore = calculateScore(issues);
    
    // Determine if approved (no errors, few warnings)
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const approved = errorCount === 0 && warningCount <= 2;
    
    return {
      summary,
      issues,
      suggestions: [...new Set(suggestions)], // Deduplicate
      securityConcerns: [...new Set(securityConcerns)],
      overallScore,
      approved,
    };
  },
});

/**
 * Parse diff into structured data
 */
interface ParsedDiff {
  files: ParsedFile[];
  totalAdditions: number;
  totalDeletions: number;
}

interface ParsedFile {
  path: string;
  additions: ParsedLine[];
  deletions: ParsedLine[];
  hunks: ParsedHunk[];
}

interface ParsedLine {
  lineNumber: number;
  content: string;
}

interface ParsedHunk {
  startLine: number;
  endLine: number;
  lines: string[];
}

function parseDiff(diff: string): ParsedDiff {
  const files: ParsedFile[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;
  
  const lines = diff.split('\n');
  let currentFile: ParsedFile | null = null;
  let currentHunk: ParsedHunk | null = null;
  let lineNumber = 0;
  
  for (const line of lines) {
    // New file
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        files.push(currentFile);
      }
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      currentFile = {
        path: match?.[2] || '',
        additions: [],
        deletions: [],
        hunks: [],
      };
      currentHunk = null;
    }
    
    // Hunk header
    else if (line.startsWith('@@') && currentFile) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      lineNumber = match ? parseInt(match[1], 10) : 0;
      currentHunk = {
        startLine: lineNumber,
        endLine: lineNumber,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
    }
    
    // Addition
    else if (line.startsWith('+') && !line.startsWith('+++') && currentFile && currentHunk) {
      currentFile.additions.push({ lineNumber, content: line.slice(1) });
      currentHunk.lines.push(line);
      currentHunk.endLine = lineNumber;
      totalAdditions++;
      lineNumber++;
    }
    
    // Deletion
    else if (line.startsWith('-') && !line.startsWith('---') && currentFile && currentHunk) {
      currentFile.deletions.push({ lineNumber, content: line.slice(1) });
      currentHunk.lines.push(line);
      totalDeletions++;
      // Don't increment lineNumber for deletions
    }
    
    // Context line
    else if (line.startsWith(' ') && currentHunk) {
      currentHunk.lines.push(line);
      currentHunk.endLine = lineNumber;
      lineNumber++;
    }
  }
  
  if (currentFile) {
    files.push(currentFile);
  }
  
  return { files, totalAdditions, totalDeletions };
}

/**
 * Analyze a file for issues
 */
interface FileAnalysis {
  issues: CodeReviewIssue[];
  suggestions: string[];
  securityConcerns: string[];
}

function analyzeFile(
  file: ParsedFile,
  _fullFiles?: { path: string; content: string; language?: string }[],
  _context?: { repoDescription?: string; styleguide?: string; previousReviews?: string[] }
): FileAnalysis {
  const issues: CodeReviewIssue[] = [];
  const suggestions: string[] = [];
  const securityConcerns: string[] = [];
  
  const ext = file.path.split('.').pop()?.toLowerCase() || '';
  
  // Analyze additions
  for (const addition of file.additions) {
    const content = addition.content;
    const line = addition.lineNumber;
    
    // Security checks
    checkSecurityIssues(content, file.path, line, ext, issues, securityConcerns);
    
    // Code quality checks
    checkCodeQuality(content, file.path, line, ext, issues);
    
    // Performance checks
    checkPerformance(content, file.path, line, ext, issues);
    
    // Style checks
    checkStyle(content, file.path, line, ext, issues);
  }
  
  // Check for common patterns
  checkPatterns(file, issues, suggestions);
  
  return { issues, suggestions, securityConcerns };
}

/**
 * Check for security issues
 */
function checkSecurityIssues(
  content: string,
  path: string,
  line: number,
  _ext: string,
  issues: CodeReviewIssue[],
  securityConcerns: string[]
): void {
  // SQL injection
  if (/(execute|query|raw)\s*\(.*\+/.test(content) || /\$\{.*\}/.test(content) && /sql|query/i.test(content)) {
    issues.push({
      severity: 'error',
      file: path,
      line,
      message: 'Potential SQL injection vulnerability. Use parameterized queries instead of string concatenation.',
      suggestion: 'Use prepared statements or parameterized queries',
    });
    securityConcerns.push(`SQL injection risk in ${path}:${line}`);
  }
  
  // Hardcoded secrets
  if (/(password|secret|api_key|apikey|token|private_key)\s*[=:]\s*['"][^'"]+['"]/i.test(content)) {
    issues.push({
      severity: 'error',
      file: path,
      line,
      message: 'Hardcoded secret detected. Use environment variables or a secrets manager.',
      suggestion: 'Move sensitive values to environment variables',
    });
    securityConcerns.push(`Hardcoded secret in ${path}:${line}`);
  }
  
  // Eval usage
  if (/\beval\s*\(/.test(content)) {
    issues.push({
      severity: 'error',
      file: path,
      line,
      message: 'Use of eval() is a security risk. Consider safer alternatives.',
      suggestion: 'Replace eval with safer parsing methods',
    });
    securityConcerns.push(`Dangerous eval() usage in ${path}:${line}`);
  }
  
  // XSS in React/HTML
  if (/dangerouslySetInnerHTML|innerHTML\s*=/.test(content)) {
    issues.push({
      severity: 'warning',
      file: path,
      line,
      message: 'Direct HTML insertion can lead to XSS vulnerabilities. Ensure content is sanitized.',
      suggestion: 'Sanitize HTML content before insertion',
    });
    securityConcerns.push(`Potential XSS in ${path}:${line}`);
  }
  
  // Insecure HTTP
  if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(content) && !content.includes('// http')) {
    issues.push({
      severity: 'warning',
      file: path,
      line,
      message: 'Use HTTPS instead of HTTP for secure communication.',
      suggestion: 'Change http:// to https://',
    });
  }
}

/**
 * Check for code quality issues
 */
function checkCodeQuality(
  content: string,
  path: string,
  line: number,
  ext: string,
  issues: CodeReviewIssue[]
): void {
  // Console.log in production code
  if (/console\.(log|debug|info)\(/.test(content) && !path.includes('test') && !path.includes('spec')) {
    issues.push({
      severity: 'info',
      file: path,
      line,
      message: 'Consider removing console.log statements in production code.',
      suggestion: 'Use a proper logging library or remove debug statements',
    });
  }
  
  // TODO/FIXME comments
  if (/\b(TODO|FIXME|HACK|XXX)\b/.test(content)) {
    issues.push({
      severity: 'info',
      file: path,
      line,
      message: 'Found TODO/FIXME comment. Consider addressing it or creating an issue.',
    });
  }
  
  // Empty catch blocks
  if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content)) {
    issues.push({
      severity: 'warning',
      file: path,
      line,
      message: 'Empty catch block swallows errors silently.',
      suggestion: 'At minimum, log the error or add a comment explaining why it\'s ignored',
    });
  }
  
  // Magic numbers
  if (['ts', 'js', 'tsx', 'jsx'].includes(ext)) {
    const magicNumberMatch = content.match(/[^a-zA-Z0-9_](\d{3,})[^a-zA-Z0-9_]/);
    if (magicNumberMatch && !content.includes('const') && !content.includes('let')) {
      issues.push({
        severity: 'info',
        file: path,
        line,
        message: `Magic number ${magicNumberMatch[1]} should be extracted to a named constant.`,
        suggestion: 'Define a named constant for better readability',
      });
    }
  }
  
  // Very long lines
  if (content.length > 120) {
    issues.push({
      severity: 'info',
      file: path,
      line,
      message: 'Line exceeds 120 characters. Consider breaking it up.',
    });
  }
}

/**
 * Check for performance issues
 */
function checkPerformance(
  content: string,
  path: string,
  line: number,
  _ext: string,
  issues: CodeReviewIssue[]
): void {
  // Synchronous file operations
  if (/\b(readFileSync|writeFileSync|existsSync)\b/.test(content) && !path.includes('cli') && !path.includes('config')) {
    issues.push({
      severity: 'warning',
      file: path,
      line,
      message: 'Synchronous file operations can block the event loop.',
      suggestion: 'Consider using async/await versions: readFile, writeFile, etc.',
    });
  }
  
  // Array operations in loops
  if (/for\s*\([^)]+\).*\.(push|splice|unshift)\(/.test(content)) {
    issues.push({
      severity: 'info',
      file: path,
      line,
      message: 'Array modification in a loop may have performance implications for large arrays.',
    });
  }
  
  // Nested awaits
  if (/await\s+.*await/.test(content)) {
    issues.push({
      severity: 'info',
      file: path,
      line,
      message: 'Nested awaits detected. Consider using Promise.all for parallel execution.',
      suggestion: 'Use Promise.all([...]) for independent async operations',
    });
  }
  
  // Creating regex in loops
  if (/for\s*\([^)]+\).*new\s+RegExp/.test(content)) {
    issues.push({
      severity: 'info',
      file: path,
      line,
      message: 'Creating RegExp inside a loop is inefficient.',
      suggestion: 'Move regex creation outside the loop',
    });
  }
}

/**
 * Check for style issues
 */
function checkStyle(
  content: string,
  path: string,
  line: number,
  ext: string,
  issues: CodeReviewIssue[]
): void {
  // Inconsistent quotes (mixed in same line)
  if (/['"][^'"]*['"].*['"][^'"]*['"]/.test(content)) {
    const hasDouble = /"/.test(content);
    const hasSingle = /'/.test(content);
    if (hasDouble && hasSingle && !content.includes('`')) {
      // Only flag if not template literal context
      issues.push({
        severity: 'info',
        file: path,
        line,
        message: 'Mixed quote styles detected. Consider using consistent quotes.',
      });
    }
  }
  
  // Trailing whitespace
  if (/\s+$/.test(content)) {
    issues.push({
      severity: 'info',
      file: path,
      line,
      message: 'Trailing whitespace detected.',
    });
  }
  
  // var usage in modern JS/TS
  if (['ts', 'js', 'tsx', 'jsx'].includes(ext) && /\bvar\s+/.test(content)) {
    issues.push({
      severity: 'warning',
      file: path,
      line,
      message: 'Use const or let instead of var for better scoping.',
      suggestion: 'Replace var with const (if not reassigned) or let',
    });
  }
}

/**
 * Check for common patterns across the file
 */
function checkPatterns(
  file: ParsedFile,
  _issues: CodeReviewIssue[],
  suggestions: string[]
): void {
  void _issues; // Available for future pattern-based issue detection
  // Large file change
  if (file.additions.length > 300) {
    suggestions.push(`Consider breaking up large changes in ${file.path} into smaller commits`);
  }
  
  // Check for missing tests for new files
  if (!file.path.includes('test') && !file.path.includes('spec') && file.additions.length > 50) {
    const isNewFile = file.deletions.length === 0;
    if (isNewFile) {
      suggestions.push(`Consider adding tests for new file: ${file.path}`);
    }
  }
  
  // Check for changes to critical files
  if (file.path.includes('package.json') || file.path.includes('package-lock.json')) {
    suggestions.push('Dependency changes detected. Verify new packages are from trusted sources.');
  }
  
  if (file.path.includes('.env') || file.path.includes('config')) {
    suggestions.push('Configuration changes detected. Ensure sensitive values are not committed.');
  }
}

/**
 * Generate a summary of the review
 */
function generateReviewSummary(diff: ParsedDiff, issues: CodeReviewIssue[]): string {
  const parts: string[] = [];
  
  parts.push(`Reviewed ${diff.files.length} file(s) with ${diff.totalAdditions} additions and ${diff.totalDeletions} deletions.`);
  
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;
  
  if (errorCount > 0) {
    parts.push(`Found ${errorCount} error(s) that should be addressed.`);
  }
  if (warningCount > 0) {
    parts.push(`Found ${warningCount} warning(s) to consider.`);
  }
  if (infoCount > 0) {
    parts.push(`Found ${infoCount} suggestion(s) for improvement.`);
  }
  
  if (issues.length === 0) {
    parts.push('No issues found. Code looks good!');
  }
  
  return parts.join(' ');
}

/**
 * Calculate an overall score (1-10)
 */
function calculateScore(issues: CodeReviewIssue[]): number {
  let score = 10;
  
  for (const issue of issues) {
    switch (issue.severity) {
      case 'error':
        score -= 2;
        break;
      case 'warning':
        score -= 1;
        break;
      case 'info':
        score -= 0.25;
        break;
    }
  }
  
  return Math.max(1, Math.min(10, Math.round(score)));
}

/**
 * Format a review comment with appropriate icon
 */
export function formatReviewComment(issue: CodeReviewIssue): string {
  const icon = SEVERITY_ICONS[issue.severity];
  const category = issue.suggestion ? ` [${issue.suggestion}]` : '';
  return `${icon}: ${issue.message}${category}`;
}
