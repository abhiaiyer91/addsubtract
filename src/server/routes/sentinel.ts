/**
 * REST API routes for Sentinel code scanning
 * 
 * Provides endpoints for:
 * - Managing sentinel configuration
 * - Triggering and monitoring scans
 * - Viewing and managing findings
 */

import { Hono } from 'hono';
import * as path from 'path';
import * as fs from 'fs';
import { 
  repoModel,
  collaboratorModel,
  issueModel,
  sentinelConfigModel,
  sentinelScanModel,
  sentinelFindingModel,
} from '../../db/models';
import { authMiddleware } from '../middleware/auth';
import { runScan, getRepoScanStatus } from '../../sentinel';
import type { SentinelFindingSeverity, SentinelFindingCategory } from '../../db/schema';

// Helper to resolve disk paths
function resolveDiskPath(storedPath: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  const relativePath = storedPath.replace(/^\/repos\//, '');
  return path.isAbsolute(reposDir)
    ? path.join(reposDir, relativePath)
    : path.join(process.cwd(), reposDir, relativePath);
}

// Helper to check if user has write access
async function hasWriteAccess(repoId: string, userId: string, ownerId: string): Promise<boolean> {
  if (ownerId === userId) return true;
  
  const collab = await collaboratorModel.find(repoId, userId);
  if (!collab) return false;
  
  return collab.permission === 'write' || collab.permission === 'admin';
}

// Helper to get current commit SHA from repo
function getCurrentCommitSha(repoPath: string): string {
  try {
    const headPath = path.join(repoPath, '.git', 'HEAD');
    if (!fs.existsSync(headPath)) {
      // Bare repo
      const bareHeadPath = path.join(repoPath, 'HEAD');
      if (fs.existsSync(bareHeadPath)) {
        const headContent = fs.readFileSync(bareHeadPath, 'utf-8').trim();
        if (headContent.startsWith('ref: ')) {
          const refPath = path.join(repoPath, headContent.slice(5));
          if (fs.existsSync(refPath)) {
            return fs.readFileSync(refPath, 'utf-8').trim().slice(0, 40);
          }
        }
        return headContent.slice(0, 40);
      }
      return 'unknown';
    }
    
    const headContent = fs.readFileSync(headPath, 'utf-8').trim();
    if (headContent.startsWith('ref: ')) {
      const refPath = path.join(repoPath, '.git', headContent.slice(5));
      if (fs.existsSync(refPath)) {
        return fs.readFileSync(refPath, 'utf-8').trim().slice(0, 40);
      }
    }
    return headContent.slice(0, 40);
  } catch {
    return 'unknown';
  }
}

export function createSentinelRoutes(): Hono {
  const app = new Hono();

  // Apply auth middleware
  app.use('*', authMiddleware);

  // =========================================================================
  // Configuration Endpoints
  // =========================================================================

  /**
   * GET /api/repos/:owner/:repo/sentinel/config
   * Get sentinel configuration for a repository
   */
  app.get('/:owner/:repo/sentinel/config', async (c) => {
    const { owner, repo } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Find the repository
    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const config = await sentinelConfigModel.findByRepoId(result.repo.id);
    
    return c.json({
      config: config || {
        enabled: false,
        useCodeRabbit: true,
        useSecurityAnalysis: true,
        useCodeQualityAnalysis: true,
        useDependencyCheck: true,
        autoCreateIssues: false,
        autoCreateIssueSeverity: 'high',
        branchPatterns: ['main'],
        excludePatterns: [],
        scanSchedule: null,
      },
    });
  });

  /**
   * PUT /api/repos/:owner/:repo/sentinel/config
   * Update sentinel configuration
   */
  app.put('/:owner/:repo/sentinel/config', async (c) => {
    const { owner, repo } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Find the repository
    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    // Check write permission
    const canWrite = await hasWriteAccess(result.repo.id, user.id, result.repo.ownerId);
    if (!canWrite) {
      return c.json({ error: 'Write access required' }, 403);
    }

    const body = await c.req.json();
    
    const config = await sentinelConfigModel.upsert(result.repo.id, {
      enabled: body.enabled,
      useCodeRabbit: body.useCodeRabbit,
      useSecurityAnalysis: body.useSecurityAnalysis,
      useCodeQualityAnalysis: body.useCodeQualityAnalysis,
      useDependencyCheck: body.useDependencyCheck,
      autoCreateIssues: body.autoCreateIssues,
      autoCreateIssueSeverity: body.autoCreateIssueSeverity,
      branchPatterns: body.branchPatterns,
      excludePatterns: body.excludePatterns,
      scanSchedule: body.scanSchedule,
      customPrompt: body.customPrompt,
      updatedById: user.id,
    });

    return c.json({ config });
  });

  /**
   * POST /api/repos/:owner/:repo/sentinel/enable
   * Quick enable/disable sentinel
   */
  app.post('/:owner/:repo/sentinel/enable', async (c) => {
    const { owner, repo } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const canWrite = await hasWriteAccess(result.repo.id, user.id, result.repo.ownerId);
    if (!canWrite) {
      return c.json({ error: 'Write access required' }, 403);
    }

    const body = await c.req.json<{ enabled: boolean }>();
    const config = await sentinelConfigModel.setEnabled(
      result.repo.id,
      body.enabled,
      user.id
    );

    return c.json({ enabled: config.enabled });
  });

  // =========================================================================
  // Scan Endpoints
  // =========================================================================

  /**
   * GET /api/repos/:owner/:repo/sentinel/status
   * Get overall sentinel status for a repository
   */
  app.get('/:owner/:repo/sentinel/status', async (c) => {
    const { owner, repo } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const status = await getRepoScanStatus(result.repo.id);
    return c.json(status);
  });

  /**
   * POST /api/repos/:owner/:repo/sentinel/scan
   * Trigger a new scan
   */
  app.post('/:owner/:repo/sentinel/scan', async (c) => {
    const { owner, repo } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    // Check write permission
    const canWrite = await hasWriteAccess(result.repo.id, user.id, result.repo.ownerId);
    if (!canWrite) {
      return c.json({ error: 'Write access required' }, 403);
    }

    let body: { branch?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      // No body provided
    }
    const branch = body.branch || 'main';

    // Get repository path and current commit
    const repoPath = resolveDiskPath(result.repo.diskPath);
    const commitSha = getCurrentCommitSha(repoPath);

    // Run scan
    try {
      const { scanId, result: scanResult } = await runScan({
        repoId: result.repo.id,
        repoPath,
        branch,
        commitSha,
        triggeredById: user.id,
      });
      
      return c.json({
        scanId,
        status: 'completed',
        summary: scanResult.summary,
        healthScore: scanResult.healthScore,
        findings: {
          critical: scanResult.severityCounts.critical,
          high: scanResult.severityCounts.high,
          medium: scanResult.severityCounts.medium,
          low: scanResult.severityCounts.low,
          info: scanResult.severityCounts.info,
          total: scanResult.findings.length,
        },
      });
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : 'Scan failed',
      }, 500);
    }
  });

  /**
   * GET /api/repos/:owner/:repo/sentinel/scans
   * List scans for a repository
   */
  app.get('/:owner/:repo/sentinel/scans', async (c) => {
    const { owner, repo } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');
    const status = c.req.query('status');

    const scans = await sentinelScanModel.listByRepoId(result.repo.id, {
      limit,
      offset,
      status,
    });

    return c.json({
      scans: scans.map(scan => ({
        id: scan.id,
        status: scan.status,
        branch: scan.branch,
        commitSha: scan.commitSha,
        healthScore: scan.healthScore,
        summary: scan.summary,
        findings: {
          critical: scan.criticalCount,
          high: scan.highCount,
          medium: scan.mediumCount,
          low: scan.lowCount,
          info: scan.infoCount,
        },
        filesScanned: scan.filesScanned,
        isScheduled: scan.isScheduled,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
        createdAt: scan.createdAt,
        errorMessage: scan.errorMessage,
      })),
    });
  });

  /**
   * GET /api/repos/:owner/:repo/sentinel/scans/:scanId
   * Get details of a specific scan
   */
  app.get('/:owner/:repo/sentinel/scans/:scanId', async (c) => {
    const { owner, repo, scanId } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const scan = await sentinelScanModel.findById(scanId);
    if (!scan || scan.repoId !== result.repo.id) {
      return c.json({ error: 'Scan not found' }, 404);
    }

    const stats = await sentinelFindingModel.getStatsByScanId(scanId);

    return c.json({
      scan: {
        id: scan.id,
        status: scan.status,
        branch: scan.branch,
        commitSha: scan.commitSha,
        healthScore: scan.healthScore,
        summary: scan.summary,
        findings: {
          critical: scan.criticalCount,
          high: scan.highCount,
          medium: scan.mediumCount,
          low: scan.lowCount,
          info: scan.infoCount,
        },
        filesScanned: scan.filesScanned,
        isScheduled: scan.isScheduled,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
        createdAt: scan.createdAt,
        errorMessage: scan.errorMessage,
        rawOutput: scan.rawOutput,
      },
      stats,
    });
  });

  // =========================================================================
  // Finding Endpoints
  // =========================================================================

  /**
   * GET /api/repos/:owner/:repo/sentinel/findings
   * List findings (from latest scan or specific scan)
   */
  app.get('/:owner/:repo/sentinel/findings', async (c) => {
    const { owner, repo } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const scanId = c.req.query('scanId');
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');
    
    // Parse filters
    const severity = c.req.query('severity')?.split(',') as SentinelFindingSeverity[] | undefined;
    const category = c.req.query('category')?.split(',') as SentinelFindingCategory[] | undefined;
    const analyzer = c.req.query('analyzer');
    const filePath = c.req.query('filePath');
    const isDismissed = c.req.query('isDismissed') === 'true' 
      ? true 
      : c.req.query('isDismissed') === 'false' 
        ? false 
        : undefined;

    let findings;
    
    if (scanId) {
      // Get findings for a specific scan
      const scan = await sentinelScanModel.findById(scanId);
      if (!scan || scan.repoId !== result.repo.id) {
        return c.json({ error: 'Scan not found' }, 404);
      }
      
      findings = await sentinelFindingModel.listByScanId(scanId, {
        limit,
        offset,
        filters: { severity, category, analyzer, filePath, isDismissed },
      });
    } else {
      // Get active findings from latest completed scan
      findings = await sentinelFindingModel.listActiveByRepoId(result.repo.id, {
        limit,
        offset,
      });
    }

    return c.json({
      findings: findings.map(f => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        analyzer: f.analyzer,
        ruleId: f.ruleId,
        filePath: f.filePath,
        line: f.line,
        endLine: f.endLine,
        title: f.title,
        message: f.message,
        suggestion: f.suggestion,
        codeSnippet: f.codeSnippet,
        suggestedFix: f.suggestedFix,
        isDismissed: f.isDismissed,
        dismissedReason: f.dismissedReason,
        linkedIssueId: f.linkedIssueId,
        firstSeenAt: f.firstSeenAt,
        createdAt: f.createdAt,
      })),
    });
  });

  /**
   * POST /api/repos/:owner/:repo/sentinel/findings/:findingId/dismiss
   * Dismiss a finding
   */
  app.post('/:owner/:repo/sentinel/findings/:findingId/dismiss', async (c) => {
    const { owner, repo, findingId } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const canWrite = await hasWriteAccess(result.repo.id, user.id, result.repo.ownerId);
    if (!canWrite) {
      return c.json({ error: 'Write access required' }, 403);
    }

    const finding = await sentinelFindingModel.findById(findingId);
    if (!finding || finding.repoId !== result.repo.id) {
      return c.json({ error: 'Finding not found' }, 404);
    }

    let body: { reason?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      // No body
    }
    
    const updated = await sentinelFindingModel.dismiss(
      findingId,
      user.id,
      body.reason
    );

    return c.json({ finding: updated });
  });

  /**
   * POST /api/repos/:owner/:repo/sentinel/findings/:findingId/undismiss
   * Undismiss a finding
   */
  app.post('/:owner/:repo/sentinel/findings/:findingId/undismiss', async (c) => {
    const { owner, repo, findingId } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const canWrite = await hasWriteAccess(result.repo.id, user.id, result.repo.ownerId);
    if (!canWrite) {
      return c.json({ error: 'Write access required' }, 403);
    }

    const finding = await sentinelFindingModel.findById(findingId);
    if (!finding || finding.repoId !== result.repo.id) {
      return c.json({ error: 'Finding not found' }, 404);
    }

    const updated = await sentinelFindingModel.undismiss(findingId);

    return c.json({ finding: updated });
  });

  /**
   * POST /api/repos/:owner/:repo/sentinel/findings/:findingId/create-issue
   * Create an issue from a finding
   */
  app.post('/:owner/:repo/sentinel/findings/:findingId/create-issue', async (c) => {
    const { owner, repo, findingId } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const canWrite = await hasWriteAccess(result.repo.id, user.id, result.repo.ownerId);
    if (!canWrite) {
      return c.json({ error: 'Write access required' }, 403);
    }

    const finding = await sentinelFindingModel.findById(findingId);
    if (!finding || finding.repoId !== result.repo.id) {
      return c.json({ error: 'Finding not found' }, 404);
    }

    if (finding.linkedIssueId) {
      return c.json({ error: 'Finding already has a linked issue' }, 400);
    }

    // Create issue (number is auto-generated by the model)
    const issue = await issueModel.create({
      repoId: result.repo.id,
      title: `[Sentinel] ${finding.title}`,
      body: formatFindingAsIssueBody(finding),
      authorId: user.id,
    });

    // Link finding to issue
    await sentinelFindingModel.linkToIssue(findingId, issue.id);

    return c.json({
      issue: {
        id: issue.id,
        number: issue.number,
        title: issue.title,
      },
    });
  });

  return app;
}

/**
 * Format a finding as an issue body
 */
function formatFindingAsIssueBody(finding: {
  severity: string;
  category: string;
  analyzer: string;
  filePath: string;
  line?: number | null;
  message: string;
  suggestion?: string | null;
  codeSnippet?: string | null;
}): string {
  const lines: string[] = [];
  
  lines.push(`## ${finding.severity.toUpperCase()} Severity Issue`);
  lines.push('');
  lines.push(`**Category:** ${finding.category}`);
  lines.push(`**Detected by:** ${finding.analyzer}`);
  lines.push(`**File:** \`${finding.filePath}${finding.line ? `:${finding.line}` : ''}\``);
  lines.push('');
  lines.push('### Description');
  lines.push('');
  lines.push(finding.message);
  lines.push('');
  
  if (finding.codeSnippet) {
    lines.push('### Code');
    lines.push('');
    lines.push('```');
    lines.push(finding.codeSnippet);
    lines.push('```');
    lines.push('');
  }
  
  if (finding.suggestion) {
    lines.push('### Suggestion');
    lines.push('');
    lines.push(finding.suggestion);
    lines.push('');
  }
  
  lines.push('---');
  lines.push('*This issue was automatically created by Sentinel code scanning.*');
  
  return lines.join('\n');
}
