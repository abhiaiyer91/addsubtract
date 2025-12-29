/**
 * Automatic AI PR Review Service
 * 
 * Provides automatic AI code review for pull requests.
 * Reviews are triggered asynchronously when PRs are created or updated.
 */

import { prModel, prReviewModel, prCommentModel, repoModel, userModel } from '../../db/models';
import { resolveDiskPath, BareRepository } from '../../server/storage/repos';
import { exists } from '../../utils/fs';
import { diff, createHunks, formatUnifiedDiff, FileDiff } from '../../core/diff';

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
 * Get diff between two commits in a bare repository using wit's TS API
 */
function getDiff(repoPath: string, baseSha: string, headSha: string): string {
  try {
    const repo = new BareRepository(repoPath);
    const fileDiffs: FileDiff[] = [];
    
    // Get trees for both commits
    const baseCommit = repo.objects.readCommit(baseSha);
    const headCommit = repo.objects.readCommit(headSha);
    
    // Flatten trees to get file->hash mappings
    const baseFiles = flattenTree(repo, baseCommit.treeHash, '');
    const headFiles = flattenTree(repo, headCommit.treeHash, '');
    
    // Find all file paths
    const allPaths = new Set([...baseFiles.keys(), ...headFiles.keys()]);
    
    for (const filePath of allPaths) {
      const baseHash = baseFiles.get(filePath);
      const headHash = headFiles.get(filePath);
      
      if (baseHash === headHash) continue; // No change
      
      let oldContent = '';
      let newContent = '';
      
      if (baseHash) {
        const blob = repo.objects.readBlob(baseHash);
        oldContent = blob.content.toString('utf-8');
      }
      
      if (headHash) {
        const blob = repo.objects.readBlob(headHash);
        newContent = blob.content.toString('utf-8');
      }
      
      const diffLines = diff(oldContent, newContent);
      const hunks = createHunks(diffLines);
      
      fileDiffs.push({
        oldPath: filePath,
        newPath: filePath,
        hunks,
        isBinary: false,
        isNew: !baseHash,
        isDeleted: !headHash,
        isRename: false,
      });
    }
    
    // Format as unified diff
    return fileDiffs.map(formatUnifiedDiff).join('\n');
  } catch (error) {
    console.error('[AI Review] Failed to get diff:', error);
    return '';
  }
}

/**
 * Flatten a tree into a map of path -> blob hash
 */
function flattenTree(repo: BareRepository, treeHash: string, prefix: string): Map<string, string> {
  const result = new Map<string, string>();
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.mode === '40000') {
      const subTree = flattenTree(repo, entry.hash, fullPath);
      for (const [path, hash] of subTree) {
        result.set(path, hash);
      }
    } else {
      result.set(fullPath, entry.hash);
    }
  }
  
  return result;
}

/**
 * Get changed files between two commits using wit's TS API
 */
function getChangedFiles(repoPath: string, baseSha: string, headSha: string): string[] {
  try {
    const repo = new BareRepository(repoPath);
    
    const baseCommit = repo.objects.readCommit(baseSha);
    const headCommit = repo.objects.readCommit(headSha);
    
    const baseFiles = flattenTree(repo, baseCommit.treeHash, '');
    const headFiles = flattenTree(repo, headCommit.treeHash, '');
    
    const changedFiles: string[] = [];
    const allPaths = new Set([...baseFiles.keys(), ...headFiles.keys()]);
    
    for (const filePath of allPaths) {
      const baseHash = baseFiles.get(filePath);
      const headHash = headFiles.get(filePath);
      
      if (baseHash !== headHash) {
        changedFiles.push(filePath);
      }
    }
    
    return changedFiles;
  } catch {
    return [];
  }
}

/**
 * Analyze diff for code issues using pattern matching
 * 
 * This is a rule-based analyzer. For full AI-powered review,
 * integrate with the Mastra agent and AI models.
 */
function analyzeDiff(diff: string, files: string[]): AIReviewResult {
  const issues: AIReviewIssue[] = [];
  const suggestions: string[] = [];
  const securityConcerns: string[] = [];

  const lines = diff.split('\n');
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

    // Track line numbers from hunk headers
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
    const ext = currentFile.split('.').pop()?.toLowerCase() || '';

    // Security checks
    if (/password\s*=\s*['"][^'"]+['"]/.test(content) || 
        /api[_-]?key\s*=\s*['"][^'"]+['"]/.test(content) ||
        /secret\s*=\s*['"][^'"]+['"]/.test(content)) {
      issues.push({
        severity: 'error',
        file: currentFile,
        line: lineNumber,
        message: 'Possible hardcoded secret or credential detected',
        suggestion: 'Use environment variables or a secrets manager',
        category: 'security',
      });
      securityConcerns.push(`Hardcoded credential in ${currentFile}:${lineNumber}`);
    }

    // SQL injection check
    if (/\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/i.test(content) ||
        /['"].*\+.*['"].*(?:SELECT|INSERT|UPDATE|DELETE)/i.test(content)) {
      issues.push({
        severity: 'error',
        file: currentFile,
        line: lineNumber,
        message: 'Possible SQL injection vulnerability',
        suggestion: 'Use parameterized queries or an ORM',
        category: 'security',
      });
      securityConcerns.push(`SQL injection risk in ${currentFile}:${lineNumber}`);
    }

    // Console.log in production code
    if (['ts', 'tsx', 'js', 'jsx'].includes(ext) && 
        /console\.(log|debug|info)\(/.test(content) &&
        !currentFile.includes('test') && !currentFile.includes('spec')) {
      issues.push({
        severity: 'info',
        file: currentFile,
        line: lineNumber,
        message: 'Console statement found - consider removing before production',
        suggestion: 'Use a proper logging library or remove debug statements',
        category: 'style',
      });
    }

    // TODO/FIXME comments
    if (/\/\/\s*(TODO|FIXME|XXX|HACK):/i.test(content)) {
      issues.push({
        severity: 'info',
        file: currentFile,
        line: lineNumber,
        message: 'TODO/FIXME comment found - ensure this is tracked',
        category: 'maintainability',
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
        category: 'bug',
      });
    }

    // Any type usage in TypeScript
    if (['ts', 'tsx'].includes(ext) && /:\s*any\b/.test(content)) {
      issues.push({
        severity: 'info',
        file: currentFile,
        line: lineNumber,
        message: 'Usage of "any" type reduces type safety',
        suggestion: 'Consider using a more specific type or "unknown"',
        category: 'style',
      });
    }

    // Synchronous file operations
    if (/(?:readFileSync|writeFileSync|appendFileSync|existsSync)\(/.test(content) &&
        !currentFile.includes('test') && !currentFile.includes('cli')) {
      issues.push({
        severity: 'info',
        file: currentFile,
        line: lineNumber,
        message: 'Synchronous file operation may block the event loop',
        suggestion: 'Consider using async alternatives in server code',
        category: 'performance',
      });
    }

    // Large function detection (rough heuristic)
    if (/^function\s+\w+|^(?:async\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/.test(content.trim())) {
      // This is a function definition - we'd need more context to check size
    }

    lineNumber++;
  }

  // Generate suggestions based on files changed
  if (files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
    if (!files.some(f => f.includes('test') || f.includes('spec'))) {
      suggestions.push('Consider adding tests for the new code');
    }
  }

  if (files.length > 20) {
    suggestions.push('This PR touches many files - consider breaking it into smaller PRs for easier review');
  }

  if (files.some(f => f.includes('package.json'))) {
    suggestions.push('Dependencies changed - ensure package-lock.json is also updated');
  }

  // Calculate score
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  let score = 10;
  score -= errorCount * 2;
  score -= warningCount * 0.5;
  score -= infoCount * 0.1;
  score = Math.max(1, Math.min(10, Math.round(score)));

  // Generate summary
  const approved = errorCount === 0 && warningCount <= 2;
  let summary = '';

  if (issues.length === 0) {
    summary = 'Looks good! No issues found in this PR.';
  } else {
    const parts = [];
    if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
    if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    if (infoCount > 0) parts.push(`${infoCount} suggestion${infoCount > 1 ? 's' : ''}`);
    summary = `Found ${parts.join(', ')} in this PR.`;
  }

  if (securityConcerns.length > 0) {
    summary += ' **Security concerns require attention.**';
  }

  return {
    summary,
    approved,
    score,
    issues,
    suggestions: [...new Set(suggestions)],
    securityConcerns: [...new Set(securityConcerns)],
  };
}

/**
 * Format review result as markdown for PR comment
 */
function formatReviewAsMarkdown(result: AIReviewResult): string {
  const lines: string[] = [];

  // Header with approval status
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

  // Security concerns (most important)
  if (result.securityConcerns.length > 0) {
    lines.push('### Security Concerns');
    lines.push('');
    for (const concern of result.securityConcerns) {
      lines.push(`- ${concern}`);
    }
    lines.push('');
  }

  // Issues grouped by severity
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
  lines.push('*This review was generated automatically by wit AI.*');

  return lines.join('\n');
}

/**
 * Get or create the AI bot user
 * Returns null if no bot user exists and we can't create reviews
 */
async function getAIBotUser(): Promise<{ id: string } | null> {
  // Try to find existing bot user
  const botUser = await userModel.findByUsername('wit-bot');
  if (botUser) {
    return { id: botUser.id };
  }

  // For now, return null - the bot user should be created during setup/seeding
  // In production, you'd want to auto-create this user
  console.warn('[AI Review] No wit-bot user found. AI reviews will be stored as comments instead.');
  return null;
}

/**
 * Run an AI review on a pull request
 * 
 * This function:
 * 1. Gets the diff between base and head
 * 2. Analyzes the diff for issues
 * 3. Creates a PR review with the findings
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

    console.log(`[AI Review] Running review for PR #${pr.number} in ${repo.name}`);

    // Get diff
    const diff = getDiff(diskPath, pr.baseSha, pr.headSha);
    if (!diff) {
      console.log('[AI Review] No diff found');
      return null;
    }

    // Get changed files
    const files = getChangedFiles(diskPath, pr.baseSha, pr.headSha);

    // Analyze
    const result = analyzeDiff(diff, files);

    console.log(`[AI Review] Found ${result.issues.length} issues, score: ${result.score}/10`);

    // Try to create a PR review
    const botUser = await getAIBotUser();
    
    if (botUser) {
      // Create as a proper PR review
      const reviewState = result.approved ? 'approved' : 'changes_requested';
      
      await prReviewModel.create({
        prId: pr.id,
        userId: botUser.id,
        state: reviewState as 'approved' | 'changes_requested' | 'commented',
        body: formatReviewAsMarkdown(result),
        commitSha: pr.headSha,
      });

      console.log(`[AI Review] Created review for PR #${pr.number}`);
    } else {
      // Fall back to creating a comment
      // We need a user to create a comment, so we'll use the PR author
      // This isn't ideal but works as a fallback
      await prCommentModel.create({
        prId: pr.id,
        userId: pr.authorId, // Use author as fallback - not ideal
        body: formatReviewAsMarkdown(result),
      });

      console.log(`[AI Review] Created comment for PR #${pr.number} (no bot user)`);
    }

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
