/**
 * Sentinel Scanner Service
 * 
 * Orchestrates code scanning across multiple analyzers.
 * Handles running scans, aggregating results, and persisting findings.
 */

import { 
  sentinelConfigModel, 
  sentinelScanModel, 
  sentinelFindingModel,
} from '../db/models/sentinel';
import { issueModel } from '../db/models';
import { 
  SecurityAnalyzer,
  CodeQualityAnalyzer,
  CodeRabbitAnalyzer,
  DependencyAnalyzer,
} from './analyzers';
import type { 
  Analyzer, 
  AnalyzerResult, 
  AnalyzerFinding, 
  ScanOptions, 
  ScanResult,
} from './types';
import { generateFindingFingerprint } from './types';
import type { 
  SentinelConfig, 
  SentinelFindingSeverity, 
  NewSentinelFinding 
} from '../db/schema';

/**
 * Calculate health score from findings
 */
function calculateHealthScore(severityCounts: ScanResult['severityCounts']): number {
  // Weighted scoring - each severity level has different impact
  const weights = {
    critical: 25,
    high: 15,
    medium: 5,
    low: 2,
    info: 0.5,
  };
  
  let penalty = 0;
  penalty += severityCounts.critical * weights.critical;
  penalty += severityCounts.high * weights.high;
  penalty += severityCounts.medium * weights.medium;
  penalty += severityCounts.low * weights.low;
  penalty += severityCounts.info * weights.info;
  
  // Cap at 0
  const score = Math.max(0, Math.round(100 - penalty));
  return score;
}

/**
 * Generate a summary from scan results
 */
function generateSummary(result: ScanResult): string {
  const { severityCounts, findings, healthScore } = result;
  const total = findings.length;
  
  if (total === 0) {
    return 'No issues found. Your code looks great!';
  }
  
  const parts: string[] = [];
  
  if (severityCounts.critical > 0) {
    parts.push(`${severityCounts.critical} critical`);
  }
  if (severityCounts.high > 0) {
    parts.push(`${severityCounts.high} high`);
  }
  if (severityCounts.medium > 0) {
    parts.push(`${severityCounts.medium} medium`);
  }
  if (severityCounts.low > 0) {
    parts.push(`${severityCounts.low} low`);
  }
  if (severityCounts.info > 0) {
    parts.push(`${severityCounts.info} info`);
  }
  
  let summary = `Found ${total} issue${total === 1 ? '' : 's'}: ${parts.join(', ')}.`;
  
  if (healthScore >= 80) {
    summary += ' Overall code health is good.';
  } else if (healthScore >= 60) {
    summary += ' Code health needs attention.';
  } else if (healthScore >= 40) {
    summary += ' Code health requires significant improvements.';
  } else {
    summary += ' Code health is critical and needs immediate attention.';
  }
  
  return summary;
}

/**
 * Generate actionable recommendations based on findings
 */
function generateRecommendations(
  findings: AnalyzerFinding[],
  severityCounts: ScanResult['severityCounts']
): string[] {
  const recommendations: string[] = [];
  
  // Group findings by category
  const categoryGroups = new Map<string, number>();
  const analyzerGroups = new Map<string, number>();
  
  for (const finding of findings) {
    categoryGroups.set(
      finding.category,
      (categoryGroups.get(finding.category) || 0) + 1
    );
    analyzerGroups.set(
      finding.analyzer,
      (analyzerGroups.get(finding.analyzer) || 0) + 1
    );
  }
  
  // Priority-based recommendations
  if (severityCounts.critical > 0) {
    recommendations.push(
      `🚨 Address ${severityCounts.critical} critical issue(s) immediately - these pose significant security or reliability risks.`
    );
  }
  
  if (severityCounts.high > 0) {
    recommendations.push(
      `⚠️ Review and fix ${severityCounts.high} high-priority issue(s) in the next sprint.`
    );
  }
  
  // Category-based recommendations
  const securityCount = categoryGroups.get('security') || 0;
  if (securityCount > 0) {
    recommendations.push(
      `🔒 Found ${securityCount} security issue(s). Consider implementing a security review process for code changes.`
    );
  }
  
  const maintainabilityCount = categoryGroups.get('maintainability') || 0;
  if (maintainabilityCount > 3) {
    recommendations.push(
      `🔧 Code complexity is high in ${maintainabilityCount} places. Consider refactoring for better maintainability.`
    );
  }
  
  const dependencyCount = categoryGroups.get('dependency') || 0;
  if (dependencyCount > 0) {
    recommendations.push(
      `📦 Found ${dependencyCount} dependency issue(s). Run \`npm audit fix\` to address known vulnerabilities.`
    );
  }
  
  const performanceCount = categoryGroups.get('performance') || 0;
  if (performanceCount > 0) {
    recommendations.push(
      `⚡ Found ${performanceCount} performance issue(s). Review async operations and consider optimization.`
    );
  }
  
  // Analyzer-specific recommendations
  if (analyzerGroups.get('coderabbit') && (analyzerGroups.get('coderabbit') || 0) > 0) {
    recommendations.push(
      `🐰 CodeRabbit identified ${analyzerGroups.get('coderabbit')} issue(s). Review the AI-generated suggestions for improvements.`
    );
  }
  
  // General recommendations based on health score
  if (findings.length === 0) {
    recommendations.push(
      '✅ Great job! No significant issues found. Continue following best practices.'
    );
  } else if (severityCounts.critical === 0 && severityCounts.high === 0) {
    recommendations.push(
      '💡 No critical or high-severity issues found. Address medium/low issues when convenient to maintain code quality.'
    );
  }
  
  // Suggest enabling CodeRabbit if not used
  if (!analyzerGroups.has('coderabbit') && findings.length > 0) {
    recommendations.push(
      '🐰 Consider enabling CodeRabbit for AI-powered code review. Install with: curl -fsSL https://cli.coderabbit.ai/install.sh | sh'
    );
  }
  
  return recommendations;
}

/**
 * Scanner options
 */
export interface ScannerOptions {
  /** Repository ID */
  repoId: string;
  /** Path to repository on disk */
  repoPath: string;
  /** Branch to scan */
  branch: string;
  /** Commit SHA */
  commitSha: string;
  /** User who triggered the scan (null for scheduled) */
  triggeredById?: string;
  /** Whether this is a scheduled scan */
  isScheduled?: boolean;
}

/**
 * Run a full scan on a repository
 */
export async function runScan(options: ScannerOptions): Promise<{
  scanId: string;
  result: ScanResult;
}> {
  // Get or create config
  const config = await sentinelConfigModel.findByRepoId(options.repoId);
  
  // Create scan record
  const scan = await sentinelScanModel.create({
    repoId: options.repoId,
    branch: options.branch,
    commitSha: options.commitSha,
    triggeredById: options.triggeredById,
    isScheduled: options.isScheduled ?? false,
  });
  
  // Mark as running
  await sentinelScanModel.markRunning(scan.id);
  
  const startTime = Date.now();
  
  try {
    // Determine which analyzers to run
    const analyzers = getAnalyzersFromConfig(config);
    
    // Build scan options
    const scanOptions: ScanOptions = {
      repoPath: options.repoPath,
      branch: options.branch,
      commitSha: options.commitSha,
      excludePatterns: config?.excludePatterns || [],
      customPrompt: config?.customPrompt || undefined,
    };
    
    // Run all analyzers in parallel
    const analyzerPromises = analyzers.map(async (analyzer) => {
      try {
        return await analyzer.analyze(scanOptions);
      } catch (error) {
        return {
          analyzer: analyzer.name,
          success: false,
          findings: [],
          filesAnalyzed: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: 0,
        } as AnalyzerResult;
      }
    });
    
    const analyzerResults = await Promise.all(analyzerPromises);
    
    // Aggregate findings
    const allFindings: AnalyzerFinding[] = [];
    let totalFilesScanned = 0;
    
    for (const result of analyzerResults) {
      allFindings.push(...result.findings);
      totalFilesScanned = Math.max(totalFilesScanned, result.filesAnalyzed);
    }
    
    // Count by severity
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    
    for (const finding of allFindings) {
      severityCounts[finding.severity]++;
    }
    
    const healthScore = calculateHealthScore(severityCounts);
    
    // Generate recommendations based on findings
    const recommendations = generateRecommendations(allFindings, severityCounts);
    
    const result: ScanResult = {
      success: true,
      findings: allFindings,
      analyzerResults,
      filesScanned: totalFilesScanned,
      severityCounts,
      healthScore,
      summary: '',
      recommendations,
      durationMs: Date.now() - startTime,
    };
    
    result.summary = generateSummary(result);
    
    // Get existing findings for deduplication
    const fingerprints = allFindings.map(f => generateFindingFingerprint(f));
    const existingFindings = await sentinelFindingModel.findByFingerprints(
      options.repoId,
      fingerprints
    );
    
    // Persist findings
    const newFindings: NewSentinelFinding[] = allFindings.map((finding) => {
      const fingerprint = generateFindingFingerprint(finding);
      const existing = existingFindings.get(fingerprint);
      
      return {
        scanId: scan.id,
        repoId: options.repoId,
        severity: finding.severity,
        category: finding.category,
        analyzer: finding.analyzer,
        ruleId: finding.ruleId,
        filePath: finding.filePath,
        line: finding.line,
        endLine: finding.endLine,
        column: finding.column,
        title: finding.title,
        message: finding.message,
        suggestion: finding.suggestion,
        codeSnippet: finding.codeSnippet,
        suggestedFix: finding.suggestedFix,
        fingerprint,
        firstSeenCommit: existing?.firstSeenCommit || options.commitSha,
        firstSeenAt: existing?.firstSeenAt || new Date(),
        // Preserve dismissal status from previous findings
        isDismissed: existing?.isDismissed || false,
        dismissedById: existing?.dismissedById,
        dismissedReason: existing?.dismissedReason,
        dismissedAt: existing?.dismissedAt,
      };
    });
    
    if (newFindings.length > 0) {
      await sentinelFindingModel.createMany(newFindings);
    }
    
    // Mark scan as completed
    await sentinelScanModel.markCompleted(scan.id, {
      filesScanned: totalFilesScanned,
      criticalCount: severityCounts.critical,
      highCount: severityCounts.high,
      mediumCount: severityCounts.medium,
      lowCount: severityCounts.low,
      infoCount: severityCounts.info,
      healthScore,
      summary: result.summary,
      recommendations,
      rawOutput: analyzerResults.map(r => ({
        analyzer: r.analyzer,
        success: r.success,
        filesAnalyzed: r.filesAnalyzed,
        findingsCount: r.findings.length,
        error: r.error,
        durationMs: r.durationMs,
      })),
    });
    
    // Auto-create issues if configured
    if (config?.autoCreateIssues) {
      await createIssuesForFindings(
        scan.id,
        options.repoId,
        config.autoCreateIssueSeverity as SentinelFindingSeverity
      );
    }
    
    return { scanId: scan.id, result };
  } catch (error) {
    // Mark scan as failed
    await sentinelScanModel.markFailed(
      scan.id,
      error instanceof Error ? error.message : 'Unknown error'
    );
    
    throw error;
  }
}

/**
 * Get analyzers based on config
 */
function getAnalyzersFromConfig(config: SentinelConfig | undefined): Analyzer[] {
  // If no config, use all analyzers except CodeRabbit (requires setup)
  if (!config) {
    return [
      new SecurityAnalyzer(),
      new CodeQualityAnalyzer(),
      new DependencyAnalyzer(),
    ];
  }
  
  const analyzers: Analyzer[] = [];
  
  if (config.useSecurityAnalysis) {
    analyzers.push(new SecurityAnalyzer());
  }
  
  if (config.useCodeQualityAnalysis) {
    analyzers.push(new CodeQualityAnalyzer());
  }
  
  if (config.useCodeRabbit) {
    analyzers.push(new CodeRabbitAnalyzer());
  }
  
  if (config.useDependencyCheck) {
    analyzers.push(new DependencyAnalyzer());
  }
  
  return analyzers;
}

/**
 * Create issues for high-severity findings
 */
async function createIssuesForFindings(
  scanId: string,
  repoId: string,
  minSeverity: SentinelFindingSeverity
): Promise<void> {
  const findings = await sentinelFindingModel.findForAutoIssueCreation(scanId, minSeverity);
  
  for (const finding of findings) {
    try {
      // Search for existing issue with similar title
      const issueTitle = `[Sentinel] ${finding.title}`;
      const existingIssues = await issueModel.search(issueTitle, { 
        repoId, 
        limit: 1 
      });
      
      if (existingIssues.length > 0) {
        // Link the finding to the existing issue
        await sentinelFindingModel.linkToIssue(finding.id, existingIssues[0].id);
        continue;
      }
      
      // Create a new issue (number is auto-generated)
      const issue = await issueModel.create({
        repoId,
        title: issueTitle,
        body: formatFindingAsIssueBody(finding),
        authorId: finding.dismissedById || 'system', // Use the dismisser or system
      });
      
      // Link the finding to the issue
      await sentinelFindingModel.linkToIssue(finding.id, issue.id);
    } catch (err) {
      // Continue with other findings if one fails
      console.error(`[Sentinel] Failed to create issue for finding ${finding.id}:`, err);
    }
  }
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

/**
 * Get scan status summary for a repository
 */
export async function getRepoScanStatus(repoId: string): Promise<{
  enabled: boolean;
  lastScan?: {
    id: string;
    status: string;
    healthScore?: number;
    summary?: string;
    createdAt: Date;
  };
  totalScans: number;
  activeFindings: number;
}> {
  const config = await sentinelConfigModel.findByRepoId(repoId);
  const lastScan = await sentinelScanModel.getLatestByRepoId(repoId);
  const totalScans = await sentinelScanModel.countByRepoId(repoId);
  
  let activeFindings = 0;
  if (lastScan && lastScan.status === 'completed') {
    const findings = await sentinelFindingModel.listActiveByRepoId(repoId);
    activeFindings = findings.length;
  }
  
  return {
    enabled: config?.enabled ?? false,
    lastScan: lastScan ? {
      id: lastScan.id,
      status: lastScan.status,
      healthScore: lastScan.healthScore ?? undefined,
      summary: lastScan.summary ?? undefined,
      createdAt: lastScan.createdAt,
    } : undefined,
    totalScans,
    activeFindings,
  };
}
