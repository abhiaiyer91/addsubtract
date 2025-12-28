/**
 * PR Review Workflow
 * 
 * A multi-step workflow that performs comprehensive AI-powered code review
 * for pull requests. The workflow:
 * 
 * 1. Parses the diff and identifies changed files
 * 2. Categorizes files (security-critical, API, UI, tests, etc.)
 * 3. Runs parallel analysis (security, code quality, performance)
 * 4. Aggregates results and generates comprehensive review
 * 5. Applies labels and sets review state
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// =============================================================================
// Input/Output Schemas
// =============================================================================

export const PRReviewInputSchema = z.object({
  prId: z.string().describe('Pull request ID'),
  repoId: z.string().describe('Repository ID'),
  repoPath: z.string().describe('Path to repository on disk'),
  baseSha: z.string().describe('Base commit SHA'),
  headSha: z.string().describe('Head commit SHA'),
  prTitle: z.string().describe('PR title'),
  prBody: z.string().optional().describe('PR description'),
  authorId: z.string().describe('PR author user ID'),
});

export type PRReviewInput = z.infer<typeof PRReviewInputSchema>;

export const PRReviewOutputSchema = z.object({
  success: z.boolean(),
  summary: z.string().describe('Review summary'),
  approved: z.boolean().describe('Whether the PR is approved'),
  score: z.number().min(1).max(10).describe('Overall score 1-10'),
  issues: z.array(z.object({
    severity: z.enum(['info', 'warning', 'error']),
    file: z.string(),
    line: z.number().optional(),
    message: z.string(),
    suggestion: z.string().optional(),
    category: z.enum(['bug', 'security', 'performance', 'style', 'maintainability']).optional(),
  })),
  suggestions: z.array(z.string()),
  securityConcerns: z.array(z.string()),
  appliedLabels: z.array(z.string()).optional(),
  reviewId: z.string().optional(),
  error: z.string().optional(),
});

export type PRReviewOutput = z.infer<typeof PRReviewOutputSchema>;

// =============================================================================
// Step 1: Parse Diff and Identify Changed Files
// =============================================================================

const parseDiffStep = createStep({
  id: 'parse-diff',
  inputSchema: PRReviewInputSchema,
  outputSchema: z.object({
    prId: z.string(),
    repoId: z.string(),
    repoPath: z.string(),
    baseSha: z.string(),
    headSha: z.string(),
    prTitle: z.string(),
    prBody: z.string().optional(),
    authorId: z.string(),
    diff: z.string(),
    changedFiles: z.array(z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
      extension: z.string(),
    })),
    totalAdditions: z.number(),
    totalDeletions: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { getCommitDiff } = await import('./utils.js');
    
    let diff = '';
    let changedFiles: Array<{ path: string; additions: number; deletions: number; extension: string }> = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    
    try {
      // Get the diff using wit's native APIs
      const commitDiff = getCommitDiff(inputData.repoPath, inputData.baseSha, inputData.headSha);
      
      diff = commitDiff.unifiedDiff;
      totalAdditions = commitDiff.totalAdditions;
      totalDeletions = commitDiff.totalDeletions;
      
      changedFiles = commitDiff.files.map(file => ({
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        extension: file.path.split('.').pop()?.toLowerCase() || '',
      }));
    } catch (error) {
      console.error('[PR Review] Failed to get diff:', error);
    }
    
    return {
      ...inputData,
      diff,
      changedFiles,
      totalAdditions,
      totalDeletions,
    };
  },
});

// =============================================================================
// Step 2: Categorize Files
// =============================================================================

const FileCategory = z.enum([
  'security-critical',
  'api',
  'database',
  'ui',
  'tests',
  'config',
  'documentation',
  'other',
]);

const categorizeFilesStep = createStep({
  id: 'categorize-files',
  inputSchema: z.object({
    prId: z.string(),
    repoId: z.string(),
    repoPath: z.string(),
    baseSha: z.string(),
    headSha: z.string(),
    prTitle: z.string(),
    prBody: z.string().optional(),
    authorId: z.string(),
    diff: z.string(),
    changedFiles: z.array(z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
      extension: z.string(),
    })),
    totalAdditions: z.number(),
    totalDeletions: z.number(),
  }),
  outputSchema: z.object({
    prId: z.string(),
    repoId: z.string(),
    repoPath: z.string(),
    baseSha: z.string(),
    headSha: z.string(),
    prTitle: z.string(),
    prBody: z.string().optional(),
    authorId: z.string(),
    diff: z.string(),
    changedFiles: z.array(z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
      extension: z.string(),
    })),
    totalAdditions: z.number(),
    totalDeletions: z.number(),
    categorizedFiles: z.record(FileCategory, z.array(z.string())),
    requiresSecurityReview: z.boolean(),
    requiresAPIReview: z.boolean(),
    requiresDatabaseReview: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const categorizedFiles: Record<z.infer<typeof FileCategory>, string[]> = {
      'security-critical': [],
      'api': [],
      'database': [],
      'ui': [],
      'tests': [],
      'config': [],
      'documentation': [],
      'other': [],
    };
    
    for (const file of inputData.changedFiles) {
      const path = file.path.toLowerCase();
      
      // Security-critical files
      if (
        path.includes('auth') ||
        path.includes('security') ||
        path.includes('password') ||
        path.includes('token') ||
        path.includes('secret') ||
        path.includes('crypto') ||
        path.includes('.env')
      ) {
        categorizedFiles['security-critical'].push(file.path);
      }
      // API files
      else if (
        path.includes('/api/') ||
        path.includes('/routes/') ||
        path.includes('/endpoints/') ||
        path.includes('controller') ||
        path.includes('handler')
      ) {
        categorizedFiles['api'].push(file.path);
      }
      // Database files
      else if (
        path.includes('/db/') ||
        path.includes('/database/') ||
        path.includes('schema') ||
        path.includes('migration') ||
        path.includes('model') ||
        path.includes('.sql')
      ) {
        categorizedFiles['database'].push(file.path);
      }
      // UI files
      else if (
        path.includes('/ui/') ||
        path.includes('/components/') ||
        path.includes('/pages/') ||
        path.includes('/views/') ||
        file.extension === 'tsx' ||
        file.extension === 'jsx' ||
        file.extension === 'css' ||
        file.extension === 'scss'
      ) {
        categorizedFiles['ui'].push(file.path);
      }
      // Test files
      else if (
        path.includes('test') ||
        path.includes('spec') ||
        path.includes('__tests__')
      ) {
        categorizedFiles['tests'].push(file.path);
      }
      // Config files
      else if (
        path.includes('config') ||
        file.extension === 'json' ||
        file.extension === 'yaml' ||
        file.extension === 'yml' ||
        file.extension === 'toml'
      ) {
        categorizedFiles['config'].push(file.path);
      }
      // Documentation
      else if (
        file.extension === 'md' ||
        file.extension === 'mdx' ||
        path.includes('/docs/')
      ) {
        categorizedFiles['documentation'].push(file.path);
      }
      // Other
      else {
        categorizedFiles['other'].push(file.path);
      }
    }
    
    return {
      ...inputData,
      categorizedFiles,
      requiresSecurityReview: categorizedFiles['security-critical'].length > 0,
      requiresAPIReview: categorizedFiles['api'].length > 0,
      requiresDatabaseReview: categorizedFiles['database'].length > 0,
    };
  },
});

// =============================================================================
// Step 3a: Security Analysis
// =============================================================================

const securityAnalysisStep = createStep({
  id: 'security-analysis',
  inputSchema: z.object({
    prId: z.string(),
    repoId: z.string(),
    diff: z.string(),
    categorizedFiles: z.record(FileCategory, z.array(z.string())),
    requiresSecurityReview: z.boolean(),
  }),
  outputSchema: z.object({
    securityIssues: z.array(z.object({
      severity: z.enum(['info', 'warning', 'error']),
      file: z.string(),
      line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional(),
    })),
    securityScore: z.number(),
    securityConcerns: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const issues: Array<{
      severity: 'info' | 'warning' | 'error';
      file: string;
      line?: number;
      message: string;
      suggestion?: string;
    }> = [];
    const concerns: string[] = [];
    
    const lines = inputData.diff.split('\n');
    let currentFile = '';
    let lineNumber = 0;
    
    for (const line of lines) {
      // Track current file
      if (line.startsWith('diff --git')) {
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        currentFile = match?.[2] || '';
        lineNumber = 0;
        continue;
      }
      
      // Track line numbers
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
        lineNumber = match ? parseInt(match[1], 10) : 0;
        continue;
      }
      
      // Only analyze additions
      if (!line.startsWith('+') || line.startsWith('+++')) {
        if (!line.startsWith('-')) lineNumber++;
        continue;
      }
      
      const content = line.slice(1);
      
      // Check for hardcoded secrets
      if (/password\s*=\s*['"][^'"]+['"]/.test(content) ||
          /api[_-]?key\s*=\s*['"][^'"]+['"]/.test(content) ||
          /secret\s*=\s*['"][^'"]+['"]/.test(content) ||
          /token\s*=\s*['"][^'"]+['"]/.test(content)) {
        issues.push({
          severity: 'error',
          file: currentFile,
          line: lineNumber,
          message: 'Possible hardcoded secret or credential detected',
          suggestion: 'Use environment variables or a secrets manager',
        });
        concerns.push(`Hardcoded credential in ${currentFile}:${lineNumber}`);
      }
      
      // SQL injection
      if (/\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/i.test(content) ||
          /['"].*\+.*['"].*(?:SELECT|INSERT|UPDATE|DELETE)/i.test(content)) {
        issues.push({
          severity: 'error',
          file: currentFile,
          line: lineNumber,
          message: 'Possible SQL injection vulnerability',
          suggestion: 'Use parameterized queries or an ORM',
        });
        concerns.push(`SQL injection risk in ${currentFile}:${lineNumber}`);
      }
      
      // Eval usage
      if (/\beval\s*\(/.test(content)) {
        issues.push({
          severity: 'error',
          file: currentFile,
          line: lineNumber,
          message: 'Usage of eval() is a security risk',
          suggestion: 'Avoid eval() - use safer alternatives',
        });
        concerns.push(`eval() usage in ${currentFile}:${lineNumber}`);
      }
      
      // Dangerous innerHTML
      if (/\.innerHTML\s*=/.test(content) || /dangerouslySetInnerHTML/.test(content)) {
        issues.push({
          severity: 'warning',
          file: currentFile,
          line: lineNumber,
          message: 'Direct HTML injection may lead to XSS vulnerabilities',
          suggestion: 'Sanitize HTML or use safe rendering methods',
        });
      }
      
      lineNumber++;
    }
    
    // Calculate security score
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    let securityScore = 10;
    securityScore -= errorCount * 3;
    securityScore -= warningCount * 1;
    securityScore = Math.max(1, Math.min(10, securityScore));
    
    return {
      securityIssues: issues,
      securityScore,
      securityConcerns: [...new Set(concerns)],
    };
  },
});

// =============================================================================
// Step 3b: Code Quality Analysis
// =============================================================================

const codeQualityStep = createStep({
  id: 'code-quality',
  inputSchema: z.object({
    prId: z.string(),
    repoId: z.string(),
    diff: z.string(),
    changedFiles: z.array(z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
      extension: z.string(),
    })),
  }),
  outputSchema: z.object({
    qualityIssues: z.array(z.object({
      severity: z.enum(['info', 'warning', 'error']),
      file: z.string(),
      line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional(),
    })),
    qualityScore: z.number(),
    suggestions: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const issues: Array<{
      severity: 'info' | 'warning' | 'error';
      file: string;
      line?: number;
      message: string;
      suggestion?: string;
    }> = [];
    const suggestions: string[] = [];
    
    const lines = inputData.diff.split('\n');
    let currentFile = '';
    let lineNumber = 0;
    let currentFileExt = '';
    
    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        currentFile = match?.[2] || '';
        currentFileExt = currentFile.split('.').pop()?.toLowerCase() || '';
        lineNumber = 0;
        continue;
      }
      
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
        lineNumber = match ? parseInt(match[1], 10) : 0;
        continue;
      }
      
      if (!line.startsWith('+') || line.startsWith('+++')) {
        if (!line.startsWith('-')) lineNumber++;
        continue;
      }
      
      const content = line.slice(1);
      
      // Console statements
      if (['ts', 'tsx', 'js', 'jsx'].includes(currentFileExt) &&
          /console\.(log|debug|info)\(/.test(content) &&
          !currentFile.includes('test') && !currentFile.includes('spec')) {
        issues.push({
          severity: 'info',
          file: currentFile,
          line: lineNumber,
          message: 'Console statement found - consider removing before production',
          suggestion: 'Use a proper logging library or remove debug statements',
        });
      }
      
      // TODO/FIXME comments
      if (/\/\/\s*(TODO|FIXME|XXX|HACK):/i.test(content)) {
        issues.push({
          severity: 'info',
          file: currentFile,
          line: lineNumber,
          message: 'TODO/FIXME comment found - ensure this is tracked',
        });
      }
      
      // Empty catch blocks
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content)) {
        issues.push({
          severity: 'warning',
          file: currentFile,
          line: lineNumber,
          message: 'Empty catch block - errors are being silently swallowed',
          suggestion: 'Log the error or handle it appropriately',
        });
      }
      
      // Any type in TypeScript
      if (['ts', 'tsx'].includes(currentFileExt) && /:\s*any\b/.test(content)) {
        issues.push({
          severity: 'info',
          file: currentFile,
          line: lineNumber,
          message: 'Usage of "any" type reduces type safety',
          suggestion: 'Consider using a more specific type or "unknown"',
        });
      }
      
      // Magic numbers
      if (['ts', 'tsx', 'js', 'jsx'].includes(currentFileExt) &&
          /[^a-zA-Z0-9_]([2-9]\d{2,}|[1-9]\d{3,})[^a-zA-Z0-9_]/.test(content) &&
          !/const|let|var|=/.test(content.split(/[2-9]\d{2,}|[1-9]\d{3,}/)[0])) {
        issues.push({
          severity: 'info',
          file: currentFile,
          line: lineNumber,
          message: 'Consider extracting magic number into a named constant',
        });
      }
      
      lineNumber++;
    }
    
    // Add general suggestions based on changed files
    if (inputData.changedFiles.some(f => f.extension === 'ts' || f.extension === 'tsx')) {
      if (!inputData.changedFiles.some(f => f.path.includes('test') || f.path.includes('spec'))) {
        suggestions.push('Consider adding tests for the new code');
      }
    }
    
    if (inputData.changedFiles.length > 20) {
      suggestions.push('This PR touches many files - consider breaking it into smaller PRs for easier review');
    }
    
    if (inputData.changedFiles.some(f => f.path.includes('package.json'))) {
      suggestions.push('Dependencies changed - ensure package-lock.json is also updated');
    }
    
    // Calculate quality score
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;
    let qualityScore = 10;
    qualityScore -= warningCount * 0.5;
    qualityScore -= infoCount * 0.1;
    qualityScore = Math.max(1, Math.min(10, Math.round(qualityScore * 10) / 10));
    
    return {
      qualityIssues: issues,
      qualityScore,
      suggestions: [...new Set(suggestions)],
    };
  },
});

// =============================================================================
// Step 3c: Performance Analysis
// =============================================================================

const performanceAnalysisStep = createStep({
  id: 'performance-analysis',
  inputSchema: z.object({
    prId: z.string(),
    repoId: z.string(),
    diff: z.string(),
    changedFiles: z.array(z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
      extension: z.string(),
    })),
  }),
  outputSchema: z.object({
    performanceIssues: z.array(z.object({
      severity: z.enum(['info', 'warning', 'error']),
      file: z.string(),
      line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional(),
    })),
    performanceScore: z.number(),
  }),
  execute: async ({ inputData }) => {
    const issues: Array<{
      severity: 'info' | 'warning' | 'error';
      file: string;
      line?: number;
      message: string;
      suggestion?: string;
    }> = [];
    
    const lines = inputData.diff.split('\n');
    let currentFile = '';
    let lineNumber = 0;
    let currentFileExt = '';
    
    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        currentFile = match?.[2] || '';
        currentFileExt = currentFile.split('.').pop()?.toLowerCase() || '';
        lineNumber = 0;
        continue;
      }
      
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
        lineNumber = match ? parseInt(match[1], 10) : 0;
        continue;
      }
      
      if (!line.startsWith('+') || line.startsWith('+++')) {
        if (!line.startsWith('-')) lineNumber++;
        continue;
      }
      
      const content = line.slice(1);
      
      // Sync file operations
      if (/(?:readFileSync|writeFileSync|appendFileSync|existsSync)\(/.test(content) &&
          !currentFile.includes('test') && !currentFile.includes('cli')) {
        issues.push({
          severity: 'warning',
          file: currentFile,
          line: lineNumber,
          message: 'Synchronous file operation may block the event loop',
          suggestion: 'Consider using async alternatives in server code',
        });
      }
      
      // N+1 query patterns
      if (/\.forEach\s*\(\s*async/.test(content) || /\.map\s*\(\s*async/.test(content)) {
        issues.push({
          severity: 'info',
          file: currentFile,
          line: lineNumber,
          message: 'Async operation in loop may cause performance issues',
          suggestion: 'Consider using Promise.all() or batch operations',
        });
      }
      
      // Large bundle imports
      if (/import\s+\*\s+as/.test(content) && !/test|spec/.test(currentFile)) {
        issues.push({
          severity: 'info',
          file: currentFile,
          line: lineNumber,
          message: 'Namespace import may increase bundle size',
          suggestion: 'Consider importing only what you need',
        });
      }
      
      // useEffect without deps in React
      if (['tsx', 'jsx'].includes(currentFileExt) &&
          /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{/.test(content) &&
          !/\[\]/.test(content)) {
        issues.push({
          severity: 'warning',
          file: currentFile,
          line: lineNumber,
          message: 'useEffect may be missing dependency array',
          suggestion: 'Add dependency array to prevent unnecessary re-renders',
        });
      }
      
      lineNumber++;
    }
    
    // Calculate performance score
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;
    let performanceScore = 10;
    performanceScore -= warningCount * 1;
    performanceScore -= infoCount * 0.2;
    performanceScore = Math.max(1, Math.min(10, Math.round(performanceScore * 10) / 10));
    
    return {
      performanceIssues: issues,
      performanceScore,
    };
  },
});

// =============================================================================
// Step 4: Aggregate Results
// =============================================================================

const aggregateResultsStep = createStep({
  id: 'aggregate-results',
  inputSchema: z.object({
    'security-analysis': z.object({
      securityIssues: z.array(z.object({
        severity: z.enum(['info', 'warning', 'error']),
        file: z.string(),
        line: z.number().optional(),
        message: z.string(),
        suggestion: z.string().optional(),
      })),
      securityScore: z.number(),
      securityConcerns: z.array(z.string()),
    }),
    'code-quality': z.object({
      qualityIssues: z.array(z.object({
        severity: z.enum(['info', 'warning', 'error']),
        file: z.string(),
        line: z.number().optional(),
        message: z.string(),
        suggestion: z.string().optional(),
      })),
      qualityScore: z.number(),
      suggestions: z.array(z.string()),
    }),
    'performance-analysis': z.object({
      performanceIssues: z.array(z.object({
        severity: z.enum(['info', 'warning', 'error']),
        file: z.string(),
        line: z.number().optional(),
        message: z.string(),
        suggestion: z.string().optional(),
      })),
      performanceScore: z.number(),
    }),
  }),
  outputSchema: PRReviewOutputSchema,
  execute: async ({ inputData }) => {
    const securityData = inputData['security-analysis'];
    const qualityData = inputData['code-quality'];
    const performanceData = inputData['performance-analysis'];
    
    // Combine all issues
    const allIssues = [
      ...securityData.securityIssues.map(i => ({ ...i, category: 'security' as const })),
      ...qualityData.qualityIssues.map(i => ({ ...i, category: 'maintainability' as const })),
      ...performanceData.performanceIssues.map(i => ({ ...i, category: 'performance' as const })),
    ];
    
    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      (securityData.securityScore * 0.4 +
       qualityData.qualityScore * 0.35 +
       performanceData.performanceScore * 0.25) * 10
    ) / 10;
    
    // Determine approval
    const errorCount = allIssues.filter(i => i.severity === 'error').length;
    const warningCount = allIssues.filter(i => i.severity === 'warning').length;
    const approved = errorCount === 0 && warningCount <= 2;
    
    // Generate summary
    let summary = '';
    if (allIssues.length === 0) {
      summary = 'Excellent! No issues found in this PR. The code looks clean and follows best practices.';
    } else {
      const parts = [];
      if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
      if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
      const infoCount = allIssues.filter(i => i.severity === 'info').length;
      if (infoCount > 0) parts.push(`${infoCount} suggestion${infoCount > 1 ? 's' : ''}`);
      summary = `Found ${parts.join(', ')} in this PR.`;
      
      if (securityData.securityConcerns.length > 0) {
        summary += ' **Security concerns require immediate attention.**';
      }
    }
    
    return {
      success: true,
      summary,
      approved,
      score: overallScore,
      issues: allIssues,
      suggestions: qualityData.suggestions,
      securityConcerns: securityData.securityConcerns,
    };
  },
});

// =============================================================================
// Step 5: Create Review and Apply Labels
// =============================================================================

const createReviewStep = createStep({
  id: 'create-review',
  inputSchema: z.object({
    prId: z.string(),
    repoId: z.string(),
    authorId: z.string(),
    success: z.boolean(),
    summary: z.string(),
    approved: z.boolean(),
    score: z.number(),
    issues: z.array(z.object({
      severity: z.enum(['info', 'warning', 'error']),
      file: z.string(),
      line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional(),
      category: z.enum(['bug', 'security', 'performance', 'style', 'maintainability']).optional(),
    })),
    suggestions: z.array(z.string()),
    securityConcerns: z.array(z.string()),
    headSha: z.string(),
  }),
  outputSchema: PRReviewOutputSchema,
  execute: async ({ inputData }) => {
    let reviewId: string | undefined;
    const appliedLabels: string[] = [];
    
    try {
      const { prReviewModel, prCommentModel, userModel, labelModel, prLabelModel } = 
        await import('../../db/models/index.js');
      
      // Format review as markdown
      const reviewBody = formatReviewAsMarkdown(inputData);
      
      // Get or create bot user
      const botUser = await userModel.getOrCreateBotUser();
      
      // Create as a proper PR review
      const reviewState = inputData.approved ? 'approved' : 'changes_requested';
      const review = await prReviewModel.create({
        prId: inputData.prId,
        userId: botUser.id,
        state: reviewState as 'approved' | 'changes_requested' | 'commented',
        body: reviewBody,
        commitSha: inputData.headSha,
      });
      reviewId = review.id;
      
      // Apply labels based on review findings
      if (inputData.securityConcerns.length > 0) {
        const securityLabel = await labelModel.findByName(inputData.repoId, 'security');
        if (securityLabel) {
          await prLabelModel.add(inputData.prId, securityLabel.id);
          appliedLabels.push('security');
        }
      }
      
      if (inputData.issues.some(i => i.category === 'performance')) {
        const perfLabel = await labelModel.findByName(inputData.repoId, 'performance');
        if (perfLabel) {
          await prLabelModel.add(inputData.prId, perfLabel.id);
          appliedLabels.push('performance');
        }
      }
      
      // Label based on approval status
      if (inputData.approved) {
        const approvedLabel = await labelModel.findByName(inputData.repoId, 'approved');
        if (approvedLabel) {
          await prLabelModel.add(inputData.prId, approvedLabel.id);
          appliedLabels.push('approved');
        }
      } else {
        const changesLabel = await labelModel.findByName(inputData.repoId, 'needs-changes');
        if (changesLabel) {
          await prLabelModel.add(inputData.prId, changesLabel.id);
          appliedLabels.push('needs-changes');
        }
      }
    } catch (error) {
      console.error('[PR Review Workflow] Failed to create review:', error);
    }
    
    return {
      ...inputData,
      reviewId,
      appliedLabels: appliedLabels.length > 0 ? appliedLabels : undefined,
    };
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

function formatReviewAsMarkdown(result: {
  summary: string;
  approved: boolean;
  score: number;
  issues: Array<{
    severity: 'info' | 'warning' | 'error';
    file: string;
    line?: number;
    message: string;
    suggestion?: string;
    category?: string;
  }>;
  suggestions: string[];
  securityConcerns: string[];
}): string {
  const lines: string[] = [];
  
  // Header
  if (result.approved) {
    lines.push('## AI Review: Approved');
  } else {
    lines.push('## AI Review: Changes Requested');
  }
  
  lines.push('');
  lines.push(result.summary);
  lines.push('');
  lines.push(`**Score:** ${result.score}/10`);
  lines.push('');
  
  // Security concerns
  if (result.securityConcerns.length > 0) {
    lines.push('### Security Concerns');
    lines.push('');
    for (const concern of result.securityConcerns) {
      lines.push(`- ${concern}`);
    }
    lines.push('');
  }
  
  // Group issues by severity
  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');
  
  if (errors.length > 0) {
    lines.push('### Errors');
    lines.push('');
    for (const issue of errors) {
      lines.push(`- **${issue.file}${issue.line ? `:${issue.line}` : ''}**: ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`  - *Suggestion:* ${issue.suggestion}`);
      }
    }
    lines.push('');
  }
  
  if (warnings.length > 0) {
    lines.push('### Warnings');
    lines.push('');
    for (const issue of warnings) {
      lines.push(`- **${issue.file}${issue.line ? `:${issue.line}` : ''}**: ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`  - *Suggestion:* ${issue.suggestion}`);
      }
    }
    lines.push('');
  }
  
  if (infos.length > 0) {
    lines.push('### Suggestions');
    lines.push('');
    for (const issue of infos) {
      lines.push(`- **${issue.file}${issue.line ? `:${issue.line}` : ''}**: ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`  - *Suggestion:* ${issue.suggestion}`);
      }
    }
    lines.push('');
  }
  
  // General suggestions
  if (result.suggestions.length > 0) {
    lines.push('### General Recommendations');
    lines.push('');
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push('');
  }
  
  lines.push('---');
  lines.push('*This review was generated by wit AI PR Review Workflow.*');
  
  return lines.join('\n');
}

// =============================================================================
// Workflow Definition
// =============================================================================

export const prReviewWorkflow = createWorkflow({
  id: 'pr-review',
  inputSchema: PRReviewInputSchema,
  outputSchema: PRReviewOutputSchema,
})
  // Step 1: Parse diff
  .then(parseDiffStep)
  // Step 2: Categorize files
  .then(categorizeFilesStep)
  // Step 3: Run parallel analysis
  .map(async ({ inputData }) => ({
    prId: inputData.prId,
    repoId: inputData.repoId,
    diff: inputData.diff,
    changedFiles: inputData.changedFiles,
    categorizedFiles: inputData.categorizedFiles,
    requiresSecurityReview: inputData.requiresSecurityReview,
  }))
  .parallel([securityAnalysisStep, codeQualityStep, performanceAnalysisStep])
  // Step 4: Aggregate results
  .then(aggregateResultsStep)
  // Step 5: Create review - need to map context back
  .map(async ({ inputData, getInitData }) => {
    const initData = getInitData() as PRReviewInput;
    return {
      ...inputData,
      prId: initData.prId,
      repoId: initData.repoId,
      authorId: initData.authorId,
      headSha: initData.headSha,
    };
  })
  .then(createReviewStep)
  .commit();
