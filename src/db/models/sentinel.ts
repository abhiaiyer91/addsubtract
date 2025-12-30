/**
 * Sentinel Model
 * 
 * Database operations for the Sentinel code scanning feature.
 * Manages scan configurations, scan runs, and findings.
 */

import { eq, and, desc, count, sql, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../index';
import {
  sentinelConfig,
  sentinelScans,
  sentinelFindings,
  type SentinelConfig,
  type NewSentinelConfig,
  type SentinelScan,
  type NewSentinelScan,
  type SentinelFinding,
  type NewSentinelFinding,
  type SentinelFindingSeverity,
  type SentinelFindingCategory,
} from '../schema';

// ============================================================================
// Sentinel Config Model
// ============================================================================

export const sentinelConfigModel = {
  /**
   * Get sentinel configuration for a repository
   */
  async findByRepoId(repoId: string): Promise<SentinelConfig | undefined> {
    const db = getDb();
    const [config] = await db
      .select()
      .from(sentinelConfig)
      .where(eq(sentinelConfig.repoId, repoId));
    return config;
  },

  /**
   * Create or update sentinel configuration
   */
  async upsert(
    repoId: string,
    data: Partial<Omit<NewSentinelConfig, 'id' | 'repoId' | 'createdAt'>>
  ): Promise<SentinelConfig> {
    const db = getDb();
    
    const existing = await this.findByRepoId(repoId);
    
    if (existing) {
      const [updated] = await db
        .update(sentinelConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(sentinelConfig.repoId, repoId))
        .returning();
      return updated;
    }
    
    const [created] = await db
      .insert(sentinelConfig)
      .values({
        repoId,
        ...data,
      } as NewSentinelConfig)
      .returning();
    return created;
  },

  /**
   * Enable/disable sentinel for a repository
   */
  async setEnabled(repoId: string, enabled: boolean, updatedById: string): Promise<SentinelConfig> {
    return this.upsert(repoId, { enabled, updatedById });
  },

  /**
   * Check if sentinel is enabled for a repository
   */
  async isEnabled(repoId: string): Promise<boolean> {
    const config = await this.findByRepoId(repoId);
    return config?.enabled ?? false;
  },

  /**
   * Delete sentinel configuration
   */
  async delete(repoId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(sentinelConfig)
      .where(eq(sentinelConfig.repoId, repoId))
      .returning();
    return result.length > 0;
  },

  /**
   * Get all repositories with sentinel enabled and a scan schedule
   */
  async findScheduledRepos(): Promise<SentinelConfig[]> {
    const db = getDb();
    return db
      .select()
      .from(sentinelConfig)
      .where(and(
        eq(sentinelConfig.enabled, true),
        sql`${sentinelConfig.scanSchedule} IS NOT NULL`
      ));
  },
};

// ============================================================================
// Sentinel Scan Model
// ============================================================================

export interface ScanWithStats extends SentinelScan {
  totalFindings: number;
}

export const sentinelScanModel = {
  /**
   * Create a new scan
   */
  async create(data: NewSentinelScan): Promise<SentinelScan> {
    const db = getDb();
    const [scan] = await db
      .insert(sentinelScans)
      .values(data)
      .returning();
    return scan;
  },

  /**
   * Find a scan by ID
   */
  async findById(id: string): Promise<SentinelScan | undefined> {
    const db = getDb();
    const [scan] = await db
      .select()
      .from(sentinelScans)
      .where(eq(sentinelScans.id, id));
    return scan;
  },

  /**
   * Update a scan
   */
  async update(
    id: string,
    data: Partial<Omit<SentinelScan, 'id' | 'createdAt'>>
  ): Promise<SentinelScan | undefined> {
    const db = getDb();
    const [updated] = await db
      .update(sentinelScans)
      .set(data)
      .where(eq(sentinelScans.id, id))
      .returning();
    return updated;
  },

  /**
   * Mark scan as running
   */
  async markRunning(id: string): Promise<SentinelScan | undefined> {
    return this.update(id, {
      status: 'running',
      startedAt: new Date(),
    });
  },

  /**
   * Mark scan as completed
   */
  async markCompleted(
    id: string,
    data: {
      filesScanned: number;
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      lowCount: number;
      infoCount: number;
      healthScore: number;
      summary: string;
      recommendations?: string[];
      rawOutput?: unknown;
    }
  ): Promise<SentinelScan | undefined> {
    return this.update(id, {
      status: 'completed',
      completedAt: new Date(),
      ...data,
    });
  },

  /**
   * Mark scan as failed
   */
  async markFailed(id: string, errorMessage: string): Promise<SentinelScan | undefined> {
    return this.update(id, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage,
    });
  },

  /**
   * List scans for a repository
   */
  async listByRepoId(
    repoId: string,
    options: { limit?: number; offset?: number; status?: string } = {}
  ): Promise<SentinelScan[]> {
    const { limit = 20, offset = 0, status } = options;
    const db = getDb();
    
    let query = db
      .select()
      .from(sentinelScans)
      .where(eq(sentinelScans.repoId, repoId));
    
    if (status) {
      query = db
        .select()
        .from(sentinelScans)
        .where(and(
          eq(sentinelScans.repoId, repoId),
          eq(sentinelScans.status, status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled')
        ));
    }
    
    return query
      .orderBy(desc(sentinelScans.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get the latest scan for a repository
   */
  async getLatestByRepoId(repoId: string): Promise<SentinelScan | undefined> {
    const db = getDb();
    const [scan] = await db
      .select()
      .from(sentinelScans)
      .where(eq(sentinelScans.repoId, repoId))
      .orderBy(desc(sentinelScans.createdAt))
      .limit(1);
    return scan;
  },

  /**
   * Get latest completed scan for a repository
   */
  async getLatestCompletedByRepoId(repoId: string): Promise<SentinelScan | undefined> {
    const db = getDb();
    const [scan] = await db
      .select()
      .from(sentinelScans)
      .where(and(
        eq(sentinelScans.repoId, repoId),
        eq(sentinelScans.status, 'completed')
      ))
      .orderBy(desc(sentinelScans.createdAt))
      .limit(1);
    return scan;
  },

  /**
   * Delete a scan and its findings
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(sentinelScans)
      .where(eq(sentinelScans.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Count scans for a repository
   */
  async countByRepoId(repoId: string): Promise<number> {
    const db = getDb();
    const [result] = await db
      .select({ count: count() })
      .from(sentinelScans)
      .where(eq(sentinelScans.repoId, repoId));
    return result?.count ?? 0;
  },
};

// ============================================================================
// Sentinel Finding Model
// ============================================================================

export interface FindingFilters {
  severity?: SentinelFindingSeverity[];
  category?: SentinelFindingCategory[];
  analyzer?: string;
  filePath?: string;
  isDismissed?: boolean;
}

export interface FindingStats {
  total: number;
  bySeverity: Record<SentinelFindingSeverity, number>;
  byCategory: Record<SentinelFindingCategory, number>;
  byAnalyzer: Record<string, number>;
}

export const sentinelFindingModel = {
  /**
   * Create multiple findings
   */
  async createMany(findings: NewSentinelFinding[]): Promise<SentinelFinding[]> {
    if (findings.length === 0) return [];
    const db = getDb();
    return db
      .insert(sentinelFindings)
      .values(findings)
      .returning();
  },

  /**
   * Find a finding by ID
   */
  async findById(id: string): Promise<SentinelFinding | undefined> {
    const db = getDb();
    const [finding] = await db
      .select()
      .from(sentinelFindings)
      .where(eq(sentinelFindings.id, id));
    return finding;
  },

  /**
   * List findings for a scan
   */
  async listByScanId(
    scanId: string,
    options: { limit?: number; offset?: number; filters?: FindingFilters } = {}
  ): Promise<SentinelFinding[]> {
    const { limit = 100, offset = 0, filters } = options;
    const db = getDb();
    
    const conditions = [eq(sentinelFindings.scanId, scanId)];
    
    if (filters?.severity?.length) {
      conditions.push(inArray(sentinelFindings.severity, filters.severity));
    }
    if (filters?.category?.length) {
      conditions.push(inArray(sentinelFindings.category, filters.category));
    }
    if (filters?.analyzer) {
      conditions.push(eq(sentinelFindings.analyzer, filters.analyzer));
    }
    if (filters?.filePath) {
      conditions.push(eq(sentinelFindings.filePath, filters.filePath));
    }
    if (filters?.isDismissed !== undefined) {
      conditions.push(eq(sentinelFindings.isDismissed, filters.isDismissed));
    }
    
    return db
      .select()
      .from(sentinelFindings)
      .where(and(...conditions))
      .orderBy(
        sql`CASE 
          WHEN ${sentinelFindings.severity} = 'critical' THEN 1
          WHEN ${sentinelFindings.severity} = 'high' THEN 2
          WHEN ${sentinelFindings.severity} = 'medium' THEN 3
          WHEN ${sentinelFindings.severity} = 'low' THEN 4
          ELSE 5 END`,
        sentinelFindings.filePath
      )
      .limit(limit)
      .offset(offset);
  },

  /**
   * List active (non-dismissed) findings for a repository
   */
  async listActiveByRepoId(
    repoId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<SentinelFinding[]> {
    const { limit = 100, offset = 0 } = options;
    
    // Get findings from the latest completed scan
    const latestScan = await sentinelScanModel.getLatestCompletedByRepoId(repoId);
    if (!latestScan) return [];
    
    return this.listByScanId(latestScan.id, { 
      limit, 
      offset, 
      filters: { isDismissed: false } 
    });
  },

  /**
   * Dismiss a finding
   */
  async dismiss(
    id: string,
    dismissedById: string,
    reason?: string
  ): Promise<SentinelFinding | undefined> {
    const db = getDb();
    const [updated] = await db
      .update(sentinelFindings)
      .set({
        isDismissed: true,
        dismissedById,
        dismissedReason: reason,
        dismissedAt: new Date(),
      })
      .where(eq(sentinelFindings.id, id))
      .returning();
    return updated;
  },

  /**
   * Undismiss a finding
   */
  async undismiss(id: string): Promise<SentinelFinding | undefined> {
    const db = getDb();
    const [updated] = await db
      .update(sentinelFindings)
      .set({
        isDismissed: false,
        dismissedById: null,
        dismissedReason: null,
        dismissedAt: null,
      })
      .where(eq(sentinelFindings.id, id))
      .returning();
    return updated;
  },

  /**
   * Link a finding to an issue
   */
  async linkToIssue(id: string, issueId: string): Promise<SentinelFinding | undefined> {
    const db = getDb();
    const [updated] = await db
      .update(sentinelFindings)
      .set({ linkedIssueId: issueId })
      .where(eq(sentinelFindings.id, id))
      .returning();
    return updated;
  },

  /**
   * Get stats for a scan's findings
   */
  async getStatsByScanId(scanId: string): Promise<FindingStats> {
    const db = getDb();
    
    const findings = await db
      .select({
        severity: sentinelFindings.severity,
        category: sentinelFindings.category,
        analyzer: sentinelFindings.analyzer,
      })
      .from(sentinelFindings)
      .where(eq(sentinelFindings.scanId, scanId));
    
    const stats: FindingStats = {
      total: findings.length,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      byCategory: {
        security: 0,
        performance: 0,
        maintainability: 0,
        reliability: 0,
        accessibility: 0,
        best_practice: 0,
        code_style: 0,
        documentation: 0,
        dependency: 0,
        other: 0,
      },
      byAnalyzer: {},
    };
    
    for (const finding of findings) {
      stats.bySeverity[finding.severity]++;
      stats.byCategory[finding.category]++;
      stats.byAnalyzer[finding.analyzer] = (stats.byAnalyzer[finding.analyzer] || 0) + 1;
    }
    
    return stats;
  },

  /**
   * Find existing findings by fingerprint (for deduplication)
   */
  async findByFingerprints(
    repoId: string,
    fingerprints: string[]
  ): Promise<Map<string, SentinelFinding>> {
    if (fingerprints.length === 0) return new Map();
    
    const db = getDb();
    const findings = await db
      .select()
      .from(sentinelFindings)
      .where(and(
        eq(sentinelFindings.repoId, repoId),
        inArray(sentinelFindings.fingerprint, fingerprints)
      ));
    
    return new Map(findings.map(f => [f.fingerprint, f]));
  },

  /**
   * Get findings that need to have issues created
   */
  async findForAutoIssueCreation(
    scanId: string,
    minSeverity: SentinelFindingSeverity
  ): Promise<SentinelFinding[]> {
    const db = getDb();
    
    const severityOrder: Record<SentinelFindingSeverity, number> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
      info: 5,
    };
    
    const minOrder = severityOrder[minSeverity];
    const validSeverities = (Object.entries(severityOrder) as [SentinelFindingSeverity, number][])
      .filter(([, order]) => order <= minOrder)
      .map(([sev]) => sev);
    
    return db
      .select()
      .from(sentinelFindings)
      .where(and(
        eq(sentinelFindings.scanId, scanId),
        eq(sentinelFindings.isDismissed, false),
        isNull(sentinelFindings.linkedIssueId),
        inArray(sentinelFindings.severity, validSeverities)
      ))
      .orderBy(
        sql`CASE 
          WHEN ${sentinelFindings.severity} = 'critical' THEN 1
          WHEN ${sentinelFindings.severity} = 'high' THEN 2
          WHEN ${sentinelFindings.severity} = 'medium' THEN 3
          WHEN ${sentinelFindings.severity} = 'low' THEN 4
          ELSE 5 END`
      );
  },
};
