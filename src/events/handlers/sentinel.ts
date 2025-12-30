/**
 * Sentinel Event Handler
 * 
 * Handles scheduled scans and automatic issue creation for findings.
 * Runs on a configurable schedule per repository.
 */

import { eventBus } from '../bus';
import type { 
  SentinelScheduledScanEvent, 
  SentinelScanCompletedEvent,
  RepoPushedEvent,
} from '../types';
import { 
  sentinelConfigModel, 
  sentinelScanModel,
  sentinelFindingModel,
  repoModel,
  issueModel,
  labelModel,
  issueLabelModel,
} from '../../db/models';
import { runScan } from '../../sentinel';
import { resolveDiskPath } from '../../server/storage/repos';

// Sentinel label for auto-created issues
const SENTINEL_LABEL = 'sentinel';

// Store for scheduled scan intervals
const scheduledScans = new Map<string, NodeJS.Timeout>();

/**
 * Register sentinel event handlers
 */
export function registerSentinelHandlers(): void {
  // Handle scheduled scan events
  eventBus.on('sentinel.scheduled_scan', handleScheduledScan);
  
  // Handle scan completion for auto-issue creation
  eventBus.on('sentinel.scan_completed', handleScanCompleted);
  
  // Optionally scan on push to main branch
  eventBus.on('repo.pushed', handleRepoPushed);
  
  console.log('[EventBus] Sentinel handlers registered');
  
  // Start the scheduler
  startScheduler();
}

/**
 * Start the scheduler that checks for repos needing scans
 */
async function startScheduler(): Promise<void> {
  console.log('[Sentinel] Starting scheduler...');
  
  // Check every minute for repos that need scanning
  setInterval(async () => {
    try {
      await checkScheduledScans();
    } catch (error) {
      console.error('[Sentinel] Scheduler error:', error);
    }
  }, 60 * 1000); // Check every minute
  
  // Also run immediately on startup
  setTimeout(() => checkScheduledScans(), 5000);
}

/**
 * Check for repositories that need scheduled scans
 */
async function checkScheduledScans(): Promise<void> {
  try {
    // Get all repos with sentinel enabled and a schedule
    const configs = await sentinelConfigModel.findScheduledRepos();
    
    for (const config of configs) {
      if (!config.scanSchedule) continue;
      
      // Parse the schedule and check if it's time to scan
      const shouldScan = checkScheduleMatch(config.scanSchedule);
      
      if (shouldScan) {
        // Check if we already scanned recently (within the last hour)
        const latestScan = await sentinelScanModel.getLatestByRepoId(config.repoId);
        if (latestScan) {
          const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
          if (latestScan.createdAt > hourAgo) {
            continue; // Already scanned recently
          }
        }
        
        // Get repo info
        const repo = await repoModel.findById(config.repoId);
        if (!repo) continue;
        
        const repoResult = await repoModel.findByIdWithOwner(config.repoId);
        if (!repoResult) continue;
        
        const ownerName = 'username' in repoResult.owner 
          ? repoResult.owner.username || repoResult.owner.name
          : repoResult.owner.name;
        
        console.log(`[Sentinel] Triggering scheduled scan for ${ownerName}/${repo.name}`);
        
        // Emit event to trigger scan
        await eventBus.emit('sentinel.scheduled_scan', 'system', {
          repoId: config.repoId,
          repoFullName: `${ownerName}/${repo.name}`,
          branch: config.branchPatterns[0] || 'main',
        });
      }
    }
  } catch (error) {
    console.error('[Sentinel] Error checking scheduled scans:', error);
  }
}

/**
 * Check if a cron-like schedule matches the current time
 * Supports simple formats: "daily", "weekly", "hourly", or cron expressions
 */
function checkScheduleMatch(schedule: string): boolean {
  const now = new Date();
  const minute = now.getMinutes();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  
  // Simple schedule keywords
  switch (schedule.toLowerCase()) {
    case 'hourly':
      // Run at the start of each hour
      return minute === 0;
    case 'daily':
      // Run at midnight
      return hour === 0 && minute === 0;
    case 'weekly':
      // Run on Sunday at midnight
      return dayOfWeek === 0 && hour === 0 && minute === 0;
    case 'twice-daily':
      // Run at 6am and 6pm
      return (hour === 6 || hour === 18) && minute === 0;
    default: {
      // Try to parse as cron expression (simplified: "minute hour")
      const parts = schedule.split(' ');
      if (parts.length >= 2) {
        const cronMinute = parts[0];
        const cronHour = parts[1];
        
        const minuteMatch = cronMinute === '*' || parseInt(cronMinute) === minute;
        const hourMatch = cronHour === '*' || parseInt(cronHour) === hour;
        
        return minuteMatch && hourMatch;
      }
      return false;
    }
  }
}

/**
 * Handle scheduled scan event
 */
async function handleScheduledScan(event: SentinelScheduledScanEvent): Promise<void> {
  const { repoId, repoFullName, branch } = event.payload;
  
  console.log(`[Sentinel] Running scheduled scan for ${repoFullName}`);
  
  try {
    const repo = await repoModel.findById(repoId);
    if (!repo) {
      console.error(`[Sentinel] Repository ${repoId} not found`);
      return;
    }
    
    const repoPath = resolveDiskPath(repo.diskPath);
    
    // Get current commit
    const commitSha = await getCurrentCommitSha(repoPath);
    
    // Run the scan
    const { scanId, result } = await runScan({
      repoId,
      repoPath,
      branch,
      commitSha,
      isScheduled: true,
    });
    
    console.log(`[Sentinel] Scan completed for ${repoFullName}: ${result.summary}`);
    
    // Emit completion event
    await eventBus.emit('sentinel.scan_completed', 'system', {
      scanId,
      repoId,
      repoFullName,
      healthScore: result.healthScore,
      findingsCount: result.findings.length,
      criticalCount: result.severityCounts.critical,
      highCount: result.severityCounts.high,
    });
    
  } catch (error) {
    console.error(`[Sentinel] Failed to run scheduled scan for ${repoFullName}:`, error);
  }
}

/**
 * Handle scan completion - create issues for findings
 */
async function handleScanCompleted(event: SentinelScanCompletedEvent): Promise<void> {
  const { scanId, repoId, repoFullName } = event.payload;
  
  console.log(`[Sentinel] Processing scan completion for ${repoFullName}`);
  
  try {
    // Get config to check if auto-issue creation is enabled
    const config = await sentinelConfigModel.findByRepoId(repoId);
    
    if (!config?.autoCreateIssues) {
      console.log(`[Sentinel] Auto-issue creation not enabled for ${repoFullName}`);
      return;
    }
    
    // Get findings that need issues
    const minSeverity = config.autoCreateIssueSeverity || 'high';
    const findings = await sentinelFindingModel.findForAutoIssueCreation(
      scanId,
      minSeverity as 'critical' | 'high' | 'medium' | 'low' | 'info'
    );
    
    if (findings.length === 0) {
      console.log(`[Sentinel] No findings requiring issues for ${repoFullName}`);
      return;
    }
    
    console.log(`[Sentinel] Creating ${findings.length} issues for ${repoFullName}`);
    
    // Ensure sentinel label exists
    let sentinelLabel = await labelModel.findByName(repoId, SENTINEL_LABEL);
    if (!sentinelLabel) {
      sentinelLabel = await labelModel.create({
        repoId,
        name: SENTINEL_LABEL,
        color: 'e11d48', // Red color
        description: 'Automatically created by Sentinel code scanning',
      });
    }
    
    // Get or create severity labels
    const severityLabels = await ensureSeverityLabels(repoId);
    
    // Create issues for each finding
    for (const finding of findings) {
      try {
        // Check if issue already exists (by searching for the fingerprint in title/body)
        const searchQuery = `[Sentinel] ${finding.title}`;
        const existingIssues = await issueModel.search(searchQuery, {
          repoId,
          state: 'open',
          limit: 1,
        });
        
        if (existingIssues.length > 0) {
          // Link finding to existing issue
          await sentinelFindingModel.linkToIssue(finding.id, existingIssues[0].id);
          console.log(`[Sentinel] Linked finding to existing issue #${existingIssues[0].number}`);
          continue;
        }
        
        // Create the issue
        const issue = await issueModel.create({
          repoId,
          title: `[Sentinel] ${finding.title}`,
          body: formatFindingAsIssueBody(finding),
          authorId: 'system', // System-created issue
          priority: mapSeverityToPriority(finding.severity),
        });
        
        // Add labels
        await issueLabelModel.add(issue.id, sentinelLabel.id);
        
        const severityLabel = severityLabels[finding.severity];
        if (severityLabel) {
          await issueLabelModel.add(issue.id, severityLabel.id);
        }
        
        // Link finding to issue
        await sentinelFindingModel.linkToIssue(finding.id, issue.id);
        
        console.log(`[Sentinel] Created issue #${issue.number}: ${issue.title}`);
        
      } catch (error) {
        console.error(`[Sentinel] Failed to create issue for finding ${finding.id}:`, error);
      }
    }
    
  } catch (error) {
    console.error(`[Sentinel] Error processing scan completion:`, error);
  }
}

/**
 * Handle repo push - optionally trigger scan on push to main
 */
async function handleRepoPushed(event: RepoPushedEvent): Promise<void> {
  const { repoId, repoFullName, ref } = event.payload;
  
  // Only trigger on pushes to main/master branches
  if (!ref.endsWith('/main') && !ref.endsWith('/master')) {
    return;
  }
  
  // Check if sentinel is enabled with scan-on-push
  const config = await sentinelConfigModel.findByRepoId(repoId);
  if (!config?.enabled) {
    return;
  }
  
  // Check if the push branch matches configured patterns
  const branch = ref.split('/').pop() || 'main';
  const matchesPattern = config.branchPatterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(branch);
    }
    return pattern === branch;
  });
  
  if (!matchesPattern) {
    return;
  }
  
  // Check if we scanned recently (within last 5 minutes) to avoid spam
  const latestScan = await sentinelScanModel.getLatestByRepoId(repoId);
  if (latestScan) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (latestScan.createdAt > fiveMinutesAgo) {
      return; // Scanned too recently
    }
  }
  
  console.log(`[Sentinel] Triggering scan on push to ${repoFullName}:${branch}`);
  
  // Emit scheduled scan event (reusing the same handler)
  await eventBus.emit('sentinel.scheduled_scan', event.actorId, {
    repoId,
    repoFullName,
    branch,
  });
}

/**
 * Ensure severity labels exist
 */
async function ensureSeverityLabels(repoId: string): Promise<Record<string, { id: string; name: string } | null>> {
  const severities = {
    critical: { color: 'dc2626', description: 'Critical severity security/reliability issue' },
    high: { color: 'ea580c', description: 'High severity issue' },
    medium: { color: 'ca8a04', description: 'Medium severity issue' },
    low: { color: '65a30d', description: 'Low severity issue' },
    info: { color: '0284c7', description: 'Informational finding' },
  };
  
  const labels: Record<string, { id: string; name: string } | null> = {};
  
  for (const [severity, config] of Object.entries(severities)) {
    const labelName = `severity:${severity}`;
    let label = await labelModel.findByName(repoId, labelName);
    
    if (!label) {
      label = await labelModel.create({
        repoId,
        name: labelName,
        color: config.color,
        description: config.description,
      });
    }
    
    labels[severity] = label ? { id: label.id, name: label.name } : null;
  }
  
  return labels;
}

/**
 * Map severity to issue priority
 */
function mapSeverityToPriority(severity: string): 'urgent' | 'high' | 'medium' | 'low' | 'none' {
  switch (severity) {
    case 'critical':
      return 'urgent';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'none';
  }
}

/**
 * Format a finding as an issue body
 */
function formatFindingAsIssueBody(finding: {
  severity: string;
  category: string;
  analyzer: string;
  ruleId?: string | null;
  filePath: string;
  line?: number | null;
  endLine?: number | null;
  message: string;
  suggestion?: string | null;
  codeSnippet?: string | null;
  suggestedFix?: string | null;
  fingerprint: string;
}): string {
  const lines: string[] = [];
  
  // Severity badge
  const severityEmoji = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
    info: '🔵',
  }[finding.severity] || '⚪';
  
  lines.push(`## ${severityEmoji} ${finding.severity.toUpperCase()} Severity Issue`);
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  lines.push(`| **Category** | ${finding.category} |`);
  lines.push(`| **Analyzer** | ${finding.analyzer} |`);
  if (finding.ruleId) {
    lines.push(`| **Rule** | ${finding.ruleId} |`);
  }
  lines.push(`| **File** | \`${finding.filePath}\` |`);
  if (finding.line) {
    lines.push(`| **Line** | ${finding.line}${finding.endLine ? `-${finding.endLine}` : ''} |`);
  }
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
    lines.push('### Recommendation');
    lines.push('');
    lines.push(finding.suggestion);
    lines.push('');
  }
  
  if (finding.suggestedFix) {
    lines.push('### Suggested Fix');
    lines.push('');
    lines.push('```');
    lines.push(finding.suggestedFix);
    lines.push('```');
    lines.push('');
  }
  
  lines.push('---');
  lines.push(`<sub>🔍 Finding ID: \`${finding.fingerprint}\`</sub>`);
  lines.push('');
  lines.push('*This issue was automatically created by [Sentinel](https://wit.dev/docs/sentinel) code scanning.*');
  
  return lines.join('\n');
}

/**
 * Get current commit SHA from repo path
 */
async function getCurrentCommitSha(repoPath: string): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    const headPath = path.join(repoPath, 'HEAD');
    if (!fs.existsSync(headPath)) {
      return 'unknown';
    }
    
    const headContent = fs.readFileSync(headPath, 'utf-8').trim();
    if (headContent.startsWith('ref: ')) {
      const refPath = path.join(repoPath, headContent.slice(5));
      if (fs.existsSync(refPath)) {
        return fs.readFileSync(refPath, 'utf-8').trim().slice(0, 40);
      }
    }
    return headContent.slice(0, 40);
  } catch {
    return 'unknown';
  }
}

/**
 * Stop scheduled scans for a repository
 */
export function stopScheduledScan(repoId: string): void {
  const timeout = scheduledScans.get(repoId);
  if (timeout) {
    clearInterval(timeout);
    scheduledScans.delete(repoId);
    console.log(`[Sentinel] Stopped scheduled scans for repo ${repoId}`);
  }
}

/**
 * Manually trigger a sentinel scan for a repository
 */
export async function triggerSentinelScan(
  repoId: string,
  branch: string = 'main',
  actorId: string = 'system'
): Promise<void> {
  const repo = await repoModel.findById(repoId);
  if (!repo) {
    throw new Error(`Repository ${repoId} not found`);
  }
  
  const repoResult = await repoModel.findByIdWithOwner(repoId);
  if (!repoResult) {
    throw new Error(`Could not get owner for repository ${repoId}`);
  }
  
  const ownerName = 'username' in repoResult.owner 
    ? repoResult.owner.username || repoResult.owner.name
    : repoResult.owner.name;
  
  await eventBus.emit('sentinel.scheduled_scan', actorId, {
    repoId,
    repoFullName: `${ownerName}/${repo.name}`,
    branch,
  });
}
