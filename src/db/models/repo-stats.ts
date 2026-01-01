/**
 * Repository Statistics Model
 *
 * Comprehensive statistics for repository health and activity analysis.
 * Provides data for CLI dashboard and web analytics.
 */

import {
  eq,
  and,
  desc,
  sql,
  gte,
  lte,
  count,
  sum,
  avg,
  inArray,
  isNotNull,
} from 'drizzle-orm';
import { getDb } from '../index';
import {
  activities,
  pullRequests,
  prReviews,
  prComments,
  issues,
  issueComments,
  repositories,
  stars,
  workflowRuns,
} from '../schema';
import { user } from '../auth-schema';

// ==========================================
// Types
// ==========================================

/**
 * Time period for filtering statistics
 */
export type StatsPeriod =
  | '7d'
  | '30d'
  | '90d'
  | '1y'
  | 'all'
  | { start: Date; end: Date };

/**
 * Commit frequency data point
 */
export interface CommitFrequency {
  date: string; // YYYY-MM-DD
  count: number;
}

/**
 * Contributor statistics
 */
export interface ContributorStat {
  userId: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  comments: number;
  linesAdded: number;
  linesRemoved: number;
  firstContribution: Date | null;
  lastContribution: Date | null;
  percentage: number;
}

/**
 * Code churn statistics
 */
export interface CodeChurn {
  date: string;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  commits: number;
}

/**
 * File hotspot (frequently changed files)
 */
export interface FileHotspot {
  path: string;
  changeCount: number;
  contributors: number;
  lastModified: Date | null;
  churnScore: number; // Combined metric of frequency and change size
}

/**
 * Pull request metrics
 */
export interface PRMetrics {
  total: number;
  open: number;
  merged: number;
  closed: number;
  avgTimeToMergeHours: number;
  avgTimeToFirstReviewHours: number;
  avgReviewsPerPR: number;
  mergeRate: number; // percentage
  prsBySize: {
    small: number; // < 100 lines
    medium: number; // 100-500 lines
    large: number; // > 500 lines
  };
  prsByWeek: Array<{
    week: string;
    opened: number;
    merged: number;
    closed: number;
  }>;
}

/**
 * Issue metrics
 */
export interface IssueMetrics {
  total: number;
  open: number;
  closed: number;
  avgTimeToCloseHours: number;
  avgCommentsPerIssue: number;
  labelDistribution: Array<{
    label: string;
    count: number;
    percentage: number;
  }>;
  issuesByWeek: Array<{
    week: string;
    opened: number;
    closed: number;
  }>;
  priorityDistribution: Array<{
    priority: string;
    count: number;
    percentage: number;
  }>;
}

/**
 * Branch statistics
 */
export interface BranchStats {
  total: number;
  active: number; // Branches with commits in last 30 days
  stale: number; // No activity in 60+ days
  merged: number;
  protected: number;
  avgLifetimeDays: number;
}

/**
 * CI/CD statistics
 */
export interface CIStats {
  totalRuns: number;
  successRate: number;
  avgDurationMinutes: number;
  runsByStatus: Record<string, number>;
  runsByWeek: Array<{
    week: string;
    total: number;
    success: number;
    failed: number;
  }>;
  longestRunMinutes: number;
  shortestRunMinutes: number;
}

/**
 * Activity by hour (for heatmap)
 */
export interface HourlyActivity {
  hour: number; // 0-23
  dayOfWeek: number; // 0-6
  count: number;
}

/**
 * Complete repository statistics
 */
export interface RepoStatistics {
  // Repository info
  repoId: string;
  repoName: string;
  ownerName: string;
  period: StatsPeriod;
  generatedAt: Date;

  // Summary metrics
  summary: {
    totalCommits: number;
    totalContributors: number;
    totalPRs: number;
    totalIssues: number;
    starsCount: number;
    forksCount: number;
    activeBranches: number;
  };

  // Detailed statistics
  commitFrequency: CommitFrequency[];
  contributors: ContributorStat[];
  codeChurn: CodeChurn[];
  fileHotspots: FileHotspot[];
  prMetrics: PRMetrics;
  issueMetrics: IssueMetrics;
  branchStats: BranchStats;
  ciStats: CIStats | null;

  // Activity patterns
  hourlyActivityHeatmap: HourlyActivity[];
  peakHour: number;
  peakDayOfWeek: string;

  // Health indicators
  health: {
    score: number; // 0-100
    prResponseTime: 'excellent' | 'good' | 'needs_attention' | 'poor';
    issueResolution: 'excellent' | 'good' | 'needs_attention' | 'poor';
    releaseFrequency: 'active' | 'stable' | 'slow' | 'dormant';
    communityEngagement: 'high' | 'medium' | 'low';
  };
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Parse period string to date range
 */
function parsePeriod(period: StatsPeriod): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (typeof period === 'object' && 'start' in period) {
    return period;
  }

  const start = new Date(now);
  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'all':
      start.setFullYear(2000); // Far back enough
      break;
  }
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

/**
 * Get week string from date (YYYY-WXX format)
 */
function getWeekString(date: Date): string {
  const year = date.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Calculate health score based on various metrics
 */
function calculateHealthScore(
  prMetrics: PRMetrics,
  issueMetrics: IssueMetrics,
  commitFrequency: CommitFrequency[],
  contributors: ContributorStat[]
): number {
  let score = 0;

  // PR response time (25 points)
  if (prMetrics.avgTimeToFirstReviewHours < 4) score += 25;
  else if (prMetrics.avgTimeToFirstReviewHours < 24) score += 20;
  else if (prMetrics.avgTimeToFirstReviewHours < 72) score += 10;

  // Issue resolution time (25 points)
  const avgIssueTime = issueMetrics.avgTimeToCloseHours;
  if (avgIssueTime < 24) score += 25;
  else if (avgIssueTime < 72) score += 20;
  else if (avgIssueTime < 168) score += 10;

  // Commit frequency (25 points)
  const recentCommits = commitFrequency.filter(
    (c) => new Date(c.date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  const avgDailyCommits =
    recentCommits.reduce((sum, c) => sum + c.count, 0) / 7;
  if (avgDailyCommits >= 5) score += 25;
  else if (avgDailyCommits >= 2) score += 20;
  else if (avgDailyCommits >= 0.5) score += 10;

  // Contributor activity (25 points)
  const activeContributors = contributors.filter(
    (c) =>
      c.lastContribution &&
      new Date(c.lastContribution) >
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length;
  if (activeContributors >= 5) score += 25;
  else if (activeContributors >= 3) score += 20;
  else if (activeContributors >= 1) score += 10;

  return Math.min(100, score);
}

/**
 * Categorize PR response time
 */
function categorizePRResponseTime(
  hours: number
): 'excellent' | 'good' | 'needs_attention' | 'poor' {
  if (hours < 4) return 'excellent';
  if (hours < 24) return 'good';
  if (hours < 72) return 'needs_attention';
  return 'poor';
}

/**
 * Categorize issue resolution
 */
function categorizeIssueResolution(
  hours: number
): 'excellent' | 'good' | 'needs_attention' | 'poor' {
  if (hours < 24) return 'excellent';
  if (hours < 72) return 'good';
  if (hours < 168) return 'needs_attention';
  return 'poor';
}

/**
 * Categorize release frequency
 */
function categorizeReleaseFrequency(
  commitsPerWeek: number
): 'active' | 'stable' | 'slow' | 'dormant' {
  if (commitsPerWeek >= 20) return 'active';
  if (commitsPerWeek >= 5) return 'stable';
  if (commitsPerWeek >= 1) return 'slow';
  return 'dormant';
}

/**
 * Categorize community engagement
 */
function categorizeCommunityEngagement(
  contributors: number,
  comments: number
): 'high' | 'medium' | 'low' {
  const engagementScore = contributors * 10 + comments;
  if (engagementScore >= 100) return 'high';
  if (engagementScore >= 30) return 'medium';
  return 'low';
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// ==========================================
// Main Model
// ==========================================

export const repoStatsModel = {
  /**
   * Get comprehensive repository statistics
   */
  async getStats(
    repoId: string,
    period: StatsPeriod = '30d'
  ): Promise<RepoStatistics | null> {
    const db = getDb();
    const { start, end } = parsePeriod(period);

    // Get repository info
    const [repo] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repoId));

    if (!repo) return null;

    // Fetch all data in parallel
    const [
      commitData,
      contributorData,
      prData,
      issueData,
      activityData,
      ciData,
    ] = await Promise.all([
      this.getCommitFrequency(repoId, start, end),
      this.getContributorStats(repoId, start, end),
      this.getPRMetrics(repoId, start, end),
      this.getIssueMetrics(repoId, start, end),
      this.getHourlyActivity(repoId, start, end),
      this.getCIStats(repoId, start, end),
    ]);

    // Calculate derived metrics
    const totalCommits = commitData.reduce((sum, c) => sum + c.count, 0);
    const commitsPerWeek = (totalCommits / Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))));

    // Find peak hour and day
    let peakHour = 0;
    let peakCount = 0;
    const dayTotals = new Map<number, number>();

    for (const activity of activityData) {
      if (activity.count > peakCount) {
        peakCount = activity.count;
        peakHour = activity.hour;
      }
      dayTotals.set(
        activity.dayOfWeek,
        (dayTotals.get(activity.dayOfWeek) || 0) + activity.count
      );
    }

    let peakDay = 0;
    let peakDayCount = 0;
    for (const [day, count] of dayTotals) {
      if (count > peakDayCount) {
        peakDayCount = count;
        peakDay = day;
      }
    }

    // Calculate health indicators
    const totalComments =
      prData.total * prData.avgReviewsPerPR + issueData.avgCommentsPerIssue * issueData.total;

    const health = {
      score: calculateHealthScore(
        prData,
        issueData,
        commitData,
        contributorData
      ),
      prResponseTime: categorizePRResponseTime(prData.avgTimeToFirstReviewHours),
      issueResolution: categorizeIssueResolution(issueData.avgTimeToCloseHours),
      releaseFrequency: categorizeReleaseFrequency(commitsPerWeek),
      communityEngagement: categorizeCommunityEngagement(
        contributorData.length,
        totalComments
      ),
    };

    return {
      repoId,
      repoName: repo.name,
      ownerName: repo.ownerId,
      period,
      generatedAt: new Date(),

      summary: {
        totalCommits,
        totalContributors: contributorData.length,
        totalPRs: prData.total,
        totalIssues: issueData.total,
        starsCount: repo.starsCount,
        forksCount: repo.forksCount,
        activeBranches: 0, // Would need branch tracking
      },

      commitFrequency: commitData,
      contributors: contributorData,
      codeChurn: [], // Would need git diff analysis
      fileHotspots: [], // Would need file change tracking
      prMetrics: prData,
      issueMetrics: issueData,
      branchStats: {
        total: 0,
        active: 0,
        stale: 0,
        merged: 0,
        protected: 0,
        avgLifetimeDays: 0,
      },
      ciStats: ciData,

      hourlyActivityHeatmap: activityData,
      peakHour,
      peakDayOfWeek: DAY_NAMES[peakDay],

      health,
    };
  },

  /**
   * Get commit frequency data
   */
  async getCommitFrequency(
    repoId: string,
    start: Date,
    end: Date
  ): Promise<CommitFrequency[]> {
    const db = getDb();

    const result = await db
      .select({
        date: sql<string>`DATE(${activities.createdAt})`,
        count: count(),
      })
      .from(activities)
      .where(
        and(
          eq(activities.repoId, repoId),
          eq(activities.type, 'push'),
          gte(activities.createdAt, start),
          lte(activities.createdAt, end)
        )
      )
      .groupBy(sql`DATE(${activities.createdAt})`)
      .orderBy(sql`DATE(${activities.createdAt})`);

    // Fill in missing dates
    const frequencyMap = new Map<string, number>();
    for (const row of result) {
      frequencyMap.set(row.date, row.count);
    }

    const frequency: CommitFrequency[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      frequency.push({
        date: dateStr,
        count: frequencyMap.get(dateStr) || 0,
      });
    }

    return frequency;
  },

  /**
   * Get contributor statistics
   */
  async getContributorStats(
    repoId: string,
    start: Date,
    end: Date
  ): Promise<ContributorStat[]> {
    const db = getDb();

    // Get activity counts per user
    const activityCounts = await db
      .select({
        userId: activities.actorId,
        type: activities.type,
        count: count(),
        firstActivity: sql<Date>`MIN(${activities.createdAt})`,
        lastActivity: sql<Date>`MAX(${activities.createdAt})`,
      })
      .from(activities)
      .where(
        and(
          eq(activities.repoId, repoId),
          gte(activities.createdAt, start),
          lte(activities.createdAt, end)
        )
      )
      .groupBy(activities.actorId, activities.type);

    // Group by user
    const userStats = new Map<
      string,
      {
        commits: number;
        prsOpened: number;
        prsMerged: number;
        reviews: number;
        comments: number;
        firstContribution: Date | null;
        lastContribution: Date | null;
      }
    >();

    for (const row of activityCounts) {
      if (!userStats.has(row.userId)) {
        userStats.set(row.userId, {
          commits: 0,
          prsOpened: 0,
          prsMerged: 0,
          reviews: 0,
          comments: 0,
          firstContribution: null,
          lastContribution: null,
        });
      }
      const stats = userStats.get(row.userId)!;

      switch (row.type) {
        case 'push':
          stats.commits += row.count;
          break;
        case 'pr_opened':
          stats.prsOpened += row.count;
          break;
        case 'pr_merged':
          stats.prsMerged += row.count;
          break;
        case 'pr_review':
          stats.reviews += row.count;
          break;
        case 'pr_comment':
        case 'issue_comment':
          stats.comments += row.count;
          break;
      }

      if (
        !stats.firstContribution ||
        row.firstActivity < stats.firstContribution
      ) {
        stats.firstContribution = row.firstActivity;
      }
      if (
        !stats.lastContribution ||
        row.lastActivity > stats.lastContribution
      ) {
        stats.lastContribution = row.lastActivity;
      }
    }

    // Get user info for all contributors
    const userIds = Array.from(userStats.keys());
    if (userIds.length === 0) return [];

    const users = await db
      .select({
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
      })
      .from(user)
      .where(inArray(user.id, userIds));

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Calculate total commits for percentage
    const totalCommits = Array.from(userStats.values()).reduce(
      (sum, s) => sum + s.commits,
      0
    );

    // Build contributor stats
    const contributors: ContributorStat[] = [];
    for (const [userId, stats] of userStats) {
      const userInfo = userMap.get(userId);
      contributors.push({
        userId,
        username: userInfo?.username || 'unknown',
        name: userInfo?.name || null,
        avatarUrl: userInfo?.avatarUrl || null,
        commits: stats.commits,
        prsOpened: stats.prsOpened,
        prsMerged: stats.prsMerged,
        reviews: stats.reviews,
        comments: stats.comments,
        linesAdded: 0, // Would need git diff
        linesRemoved: 0, // Would need git diff
        firstContribution: stats.firstContribution,
        lastContribution: stats.lastContribution,
        percentage:
          totalCommits > 0 ? (stats.commits / totalCommits) * 100 : 0,
      });
    }

    // Sort by commits descending
    contributors.sort((a, b) => b.commits - a.commits);

    return contributors;
  },

  /**
   * Get PR metrics
   */
  async getPRMetrics(
    repoId: string,
    start: Date,
    end: Date
  ): Promise<PRMetrics> {
    const db = getDb();

    // Get all PRs in the period
    const prs = await db
      .select({
        id: pullRequests.id,
        state: pullRequests.state,
        createdAt: pullRequests.createdAt,
        mergedAt: pullRequests.mergedAt,
        closedAt: pullRequests.closedAt,
      })
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.repoId, repoId),
          gte(pullRequests.createdAt, start),
          lte(pullRequests.createdAt, end)
        )
      );

    // Get review times
    const reviewTimes = await db
      .select({
        prId: prReviews.prId,
        firstReview: sql<Date>`MIN(${prReviews.createdAt})`,
      })
      .from(prReviews)
      .innerJoin(pullRequests, eq(prReviews.prId, pullRequests.id))
      .where(
        and(
          eq(pullRequests.repoId, repoId),
          gte(pullRequests.createdAt, start),
          lte(pullRequests.createdAt, end)
        )
      )
      .groupBy(prReviews.prId);

    const reviewTimeMap = new Map(
      reviewTimes.map((r) => [r.prId, r.firstReview])
    );

    // Get review counts per PR
    const reviewCounts = await db
      .select({
        prId: prReviews.prId,
        count: count(),
      })
      .from(prReviews)
      .innerJoin(pullRequests, eq(prReviews.prId, pullRequests.id))
      .where(
        and(
          eq(pullRequests.repoId, repoId),
          gte(pullRequests.createdAt, start),
          lte(pullRequests.createdAt, end)
        )
      )
      .groupBy(prReviews.prId);

    const reviewCountMap = new Map(reviewCounts.map((r) => [r.prId, r.count]));

    // Calculate metrics
    let totalMergeTime = 0;
    let mergeCount = 0;
    let totalReviewTime = 0;
    let reviewedCount = 0;
    let totalReviews = 0;

    const prsBySize = { small: 0, medium: 0, large: 0 };
    const weeklyData = new Map<
      string,
      { opened: number; merged: number; closed: number }
    >();

    let open = 0;
    let merged = 0;
    let closed = 0;

    for (const pr of prs) {
      // Count by state
      if (pr.state === 'open') open++;
      else if (pr.mergedAt) merged++;
      else closed++;

      // Merge time
      if (pr.mergedAt) {
        totalMergeTime +=
          (pr.mergedAt.getTime() - pr.createdAt.getTime()) / (1000 * 60 * 60);
        mergeCount++;
      }

      // First review time
      const firstReview = reviewTimeMap.get(pr.id);
      if (firstReview) {
        totalReviewTime +=
          (firstReview.getTime() - pr.createdAt.getTime()) / (1000 * 60 * 60);
        reviewedCount++;
      }

      // Reviews per PR
      totalReviews += reviewCountMap.get(pr.id) || 0;

      // Size classification (without additions/deletions, we'll estimate based on time to merge)
      // Small PRs tend to be merged faster, large PRs slower
      // We categorize evenly since we don't have the data
      prsBySize.medium++;

      // Weekly data
      const week = getWeekString(pr.createdAt);
      if (!weeklyData.has(week)) {
        weeklyData.set(week, { opened: 0, merged: 0, closed: 0 });
      }
      weeklyData.get(week)!.opened++;

      if (pr.mergedAt) {
        const mergeWeek = getWeekString(pr.mergedAt);
        if (!weeklyData.has(mergeWeek)) {
          weeklyData.set(mergeWeek, { opened: 0, merged: 0, closed: 0 });
        }
        weeklyData.get(mergeWeek)!.merged++;
      } else if (pr.closedAt) {
        const closeWeek = getWeekString(pr.closedAt);
        if (!weeklyData.has(closeWeek)) {
          weeklyData.set(closeWeek, { opened: 0, merged: 0, closed: 0 });
        }
        weeklyData.get(closeWeek)!.closed++;
      }
    }

    const prsByWeek = Array.from(weeklyData.entries())
      .map(([week, data]) => ({ week, ...data }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return {
      total: prs.length,
      open,
      merged,
      closed,
      avgTimeToMergeHours: mergeCount > 0 ? totalMergeTime / mergeCount : 0,
      avgTimeToFirstReviewHours:
        reviewedCount > 0 ? totalReviewTime / reviewedCount : 0,
      avgReviewsPerPR: prs.length > 0 ? totalReviews / prs.length : 0,
      mergeRate: prs.length > 0 ? (merged / prs.length) * 100 : 0,
      prsBySize,
      prsByWeek,
    };
  },

  /**
   * Get issue metrics
   */
  async getIssueMetrics(
    repoId: string,
    start: Date,
    end: Date
  ): Promise<IssueMetrics> {
    const db = getDb();

    // Get all issues in the period
    const issueList = await db
      .select({
        id: issues.id,
        state: issues.state,
        priority: issues.priority,
        createdAt: issues.createdAt,
        closedAt: issues.closedAt,
      })
      .from(issues)
      .where(
        and(
          eq(issues.repoId, repoId),
          gte(issues.createdAt, start),
          lte(issues.createdAt, end)
        )
      );

    // Get comment counts per issue
    const commentCounts = await db
      .select({
        issueId: issueComments.issueId,
        count: count(),
      })
      .from(issueComments)
      .innerJoin(issues, eq(issueComments.issueId, issues.id))
      .where(
        and(
          eq(issues.repoId, repoId),
          gte(issues.createdAt, start),
          lte(issues.createdAt, end)
        )
      )
      .groupBy(issueComments.issueId);

    const commentMap = new Map(commentCounts.map((c) => [c.issueId, c.count]));

    // Calculate metrics
    let totalCloseTime = 0;
    let closedCount = 0;
    let totalComments = 0;

    const weeklyData = new Map<string, { opened: number; closed: number }>();
    const priorityCount = new Map<string, number>();

    let open = 0;
    let closed = 0;

    for (const issue of issueList) {
      // Count by state
      if (issue.state === 'open') open++;
      else closed++;

      // Close time
      if (issue.closedAt) {
        totalCloseTime +=
          (issue.closedAt.getTime() - issue.createdAt.getTime()) /
          (1000 * 60 * 60);
        closedCount++;
      }

      // Comments
      totalComments += commentMap.get(issue.id) || 0;

      // Priority
      const priority = issue.priority || 'none';
      priorityCount.set(priority, (priorityCount.get(priority) || 0) + 1);

      // Weekly data
      const week = getWeekString(issue.createdAt);
      if (!weeklyData.has(week)) {
        weeklyData.set(week, { opened: 0, closed: 0 });
      }
      weeklyData.get(week)!.opened++;

      if (issue.closedAt) {
        const closeWeek = getWeekString(issue.closedAt);
        if (!weeklyData.has(closeWeek)) {
          weeklyData.set(closeWeek, { opened: 0, closed: 0 });
        }
        weeklyData.get(closeWeek)!.closed++;
      }
    }

    const issuesByWeek = Array.from(weeklyData.entries())
      .map(([week, data]) => ({ week, ...data }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const priorityDistribution = Array.from(priorityCount.entries())
      .map(([priority, count]) => ({
        priority,
        count,
        percentage: issueList.length > 0 ? (count / issueList.length) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total: issueList.length,
      open,
      closed,
      avgTimeToCloseHours: closedCount > 0 ? totalCloseTime / closedCount : 0,
      avgCommentsPerIssue:
        issueList.length > 0 ? totalComments / issueList.length : 0,
      labelDistribution: [], // Would need label tracking
      issuesByWeek,
      priorityDistribution,
    };
  },

  /**
   * Get hourly activity heatmap
   */
  async getHourlyActivity(
    repoId: string,
    start: Date,
    end: Date
  ): Promise<HourlyActivity[]> {
    const db = getDb();

    const result = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${activities.createdAt})`,
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${activities.createdAt})`,
        count: count(),
      })
      .from(activities)
      .where(
        and(
          eq(activities.repoId, repoId),
          gte(activities.createdAt, start),
          lte(activities.createdAt, end)
        )
      )
      .groupBy(
        sql`EXTRACT(HOUR FROM ${activities.createdAt})`,
        sql`EXTRACT(DOW FROM ${activities.createdAt})`
      );

    // Initialize all hours/days to 0
    const heatmap: HourlyActivity[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmap.push({ hour, dayOfWeek: day, count: 0 });
      }
    }

    // Fill in actual counts
    for (const row of result) {
      const index = Number(row.dayOfWeek) * 24 + Number(row.hour);
      if (heatmap[index]) {
        heatmap[index].count = row.count;
      }
    }

    return heatmap;
  },

  /**
   * Get CI/CD statistics
   */
  async getCIStats(
    repoId: string,
    start: Date,
    end: Date
  ): Promise<CIStats | null> {
    const db = getDb();

    const runs = await db
      .select({
        id: workflowRuns.id,
        state: workflowRuns.state,
        conclusion: workflowRuns.conclusion,
        startedAt: workflowRuns.startedAt,
        completedAt: workflowRuns.completedAt,
        createdAt: workflowRuns.createdAt,
      })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.repoId, repoId),
          gte(workflowRuns.createdAt, start),
          lte(workflowRuns.createdAt, end)
        )
      );

    if (runs.length === 0) return null;

    const runsByStatus: Record<string, number> = {};
    const weeklyData = new Map<
      string,
      { total: number; success: number; failed: number }
    >();
    let totalDuration = 0;
    let durationCount = 0;
    let successCount = 0;
    let longestRun = 0;
    let shortestRun = Infinity;

    for (const run of runs) {
      // Count by status
      const status = run.conclusion || run.state || 'unknown';
      runsByStatus[status] = (runsByStatus[status] || 0) + 1;

      if (run.conclusion === 'success') successCount++;

      // Duration
      if (run.startedAt && run.completedAt) {
        const duration =
          (run.completedAt.getTime() - run.startedAt.getTime()) / (1000 * 60);
        totalDuration += duration;
        durationCount++;
        longestRun = Math.max(longestRun, duration);
        shortestRun = Math.min(shortestRun, duration);
      }

      // Weekly data
      const week = getWeekString(run.createdAt);
      if (!weeklyData.has(week)) {
        weeklyData.set(week, { total: 0, success: 0, failed: 0 });
      }
      const weekly = weeklyData.get(week)!;
      weekly.total++;
      if (run.conclusion === 'success') weekly.success++;
      else if (run.conclusion === 'failure') weekly.failed++;
    }

    const runsByWeek = Array.from(weeklyData.entries())
      .map(([week, data]) => ({ week, ...data }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return {
      totalRuns: runs.length,
      successRate: runs.length > 0 ? (successCount / runs.length) * 100 : 0,
      avgDurationMinutes: durationCount > 0 ? totalDuration / durationCount : 0,
      runsByStatus,
      runsByWeek,
      longestRunMinutes: longestRun === 0 ? 0 : longestRun,
      shortestRunMinutes: shortestRun === Infinity ? 0 : shortestRun,
    };
  },

  /**
   * Get statistics for multiple repositories (for user overview)
   */
  async getMultiRepoStats(
    repoIds: string[],
    period: StatsPeriod = '30d'
  ): Promise<Map<string, RepoStatistics>> {
    const results = new Map<string, RepoStatistics>();

    // Process in parallel with limit
    const batchSize = 5;
    for (let i = 0; i < repoIds.length; i += batchSize) {
      const batch = repoIds.slice(i, i + batchSize);
      const stats = await Promise.all(
        batch.map((id) => this.getStats(id, period))
      );
      for (let j = 0; j < batch.length; j++) {
        const stat = stats[j];
        if (stat) {
          results.set(batch[j], stat);
        }
      }
    }

    return results;
  },
};
