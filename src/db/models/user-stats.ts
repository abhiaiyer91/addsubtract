/**
 * User Statistics Model
 *
 * Provides contribution stats, activity summaries, and dashboard data
 * for users. Aggregates data from activities, PRs, issues, and repositories.
 */

import { eq, and, desc, sql, gte, lte, count, inArray } from 'drizzle-orm';
import { getDb } from '../index';
import {
  activities,
  pullRequests,
  issues,
  repositories,
  prReviews,
  issueComments,
  prComments,
  type Repository,
} from '../schema';
import { user } from '../auth-schema';

/**
 * Contribution calendar entry (for heatmap)
 */
export interface ContributionDay {
  date: string; // YYYY-MM-DD
  count: number;
  level: 0 | 1 | 2 | 3 | 4; // Intensity level for heatmap
}

/**
 * Contribution streak information
 */
export interface ContributionStreak {
  current: number;
  longest: number;
  lastContributionDate: string | null;
}

/**
 * User contribution statistics
 */
export interface UserContributionStats {
  // Counts
  totalCommits: number;
  totalPullRequests: number;
  totalPullRequestsMerged: number;
  totalIssues: number;
  totalIssuesClosed: number;
  totalReviews: number;
  totalComments: number;

  // Streaks
  streak: ContributionStreak;

  // Contribution calendar (last 52 weeks)
  contributionCalendar: ContributionDay[];

  // Weekly breakdown
  contributionsByDayOfWeek: number[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
}

/**
 * Dashboard summary combining inbox and stats
 */
export interface DashboardSummary {
  // Inbox counts
  prsAwaitingReview: number;
  myOpenPrs: number;
  prsParticipated: number;
  issuesAssigned: number;
  issuesCreated: number;

  // Quick stats
  recentActivity: number; // Last 7 days
  activeRepos: number; // Repos contributed to in last 30 days

  // Contribution overview
  thisWeekContributions: number;
  lastWeekContributions: number;
  contributionTrend: 'up' | 'down' | 'stable';
}

/**
 * Repository with recent activity info for dashboard
 */
export interface DashboardRepo {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  description: string | null;
  starsCount: number;
  isPrivate: boolean;
  updatedAt: Date;
  pushedAt: Date | null;
  recentCommits?: number;
  openPrs?: number;
  openIssues?: number;
}

/**
 * Recent activity item for activity feed
 */
export interface ActivityFeedItem {
  id: string;
  type: string;
  actorId: string;
  actorName?: string;
  actorUsername?: string;
  repoId: string | null;
  repoName?: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export const userStatsModel = {
  /**
   * Get user contribution statistics
   */
  async getContributionStats(
    userId: string,
    year?: number
  ): Promise<UserContributionStats> {
    const db = getDb();
    const targetYear = year || new Date().getFullYear();
    const startDate = new Date(`${targetYear}-01-01`);
    const endDate = new Date(`${targetYear}-12-31T23:59:59`);

    // Fetch all activity counts in parallel
    const [
      commitCount,
      prStats,
      issueStats,
      reviewCount,
      commentCount,
      dailyActivity,
    ] = await Promise.all([
      // Count commits (push activities)
      db
        .select({ count: count() })
        .from(activities)
        .where(
          and(
            eq(activities.actorId, userId),
            eq(activities.type, 'push'),
            gte(activities.createdAt, startDate),
            lte(activities.createdAt, endDate)
          )
        )
        .then((r) => r[0]?.count || 0),

      // PR stats
      db
        .select({
          total: count(),
          merged: sql<number>`COUNT(*) FILTER (WHERE ${pullRequests.state} = 'merged')`,
        })
        .from(pullRequests)
        .where(
          and(
            eq(pullRequests.authorId, userId),
            gte(pullRequests.createdAt, startDate),
            lte(pullRequests.createdAt, endDate)
          )
        )
        .then((r) => ({
          total: r[0]?.total || 0,
          merged: Number(r[0]?.merged) || 0,
        })),

      // Issue stats
      db
        .select({
          total: count(),
          closed: sql<number>`COUNT(*) FILTER (WHERE ${issues.state} = 'closed')`,
        })
        .from(issues)
        .where(
          and(
            eq(issues.authorId, userId),
            gte(issues.createdAt, startDate),
            lte(issues.createdAt, endDate)
          )
        )
        .then((r) => ({
          total: r[0]?.total || 0,
          closed: Number(r[0]?.closed) || 0,
        })),

      // Review count
      db
        .select({ count: count() })
        .from(prReviews)
        .where(
          and(
            eq(prReviews.authorId, userId),
            gte(prReviews.createdAt, startDate),
            lte(prReviews.createdAt, endDate)
          )
        )
        .then((r) => r[0]?.count || 0),

      // Comment count (PR + Issue comments)
      Promise.all([
        db
          .select({ count: count() })
          .from(prComments)
          .where(
            and(
              eq(prComments.authorId, userId),
              gte(prComments.createdAt, startDate),
              lte(prComments.createdAt, endDate)
            )
          ),
        db
          .select({ count: count() })
          .from(issueComments)
          .where(
            and(
              eq(issueComments.authorId, userId),
              gte(issueComments.createdAt, startDate),
              lte(issueComments.createdAt, endDate)
            )
          ),
      ]).then(([prC, issueC]) => (prC[0]?.count || 0) + (issueC[0]?.count || 0)),

      // Daily activity for contribution calendar
      this.getDailyActivity(userId, startDate, endDate),
    ]);

    // Calculate contribution calendar with levels
    const contributionCalendar = this.buildContributionCalendar(dailyActivity);

    // Calculate streaks
    const streak = this.calculateStreaks(dailyActivity);

    // Calculate day of week breakdown
    const contributionsByDayOfWeek = this.calculateDayOfWeekBreakdown(dailyActivity);

    return {
      totalCommits: commitCount,
      totalPullRequests: prStats.total,
      totalPullRequestsMerged: prStats.merged,
      totalIssues: issueStats.total,
      totalIssuesClosed: issueStats.closed,
      totalReviews: reviewCount,
      totalComments: commentCount,
      streak,
      contributionCalendar,
      contributionsByDayOfWeek,
    };
  },

  /**
   * Get dashboard summary for quick stats bar
   */
  async getDashboardSummary(userId: string): Promise<DashboardSummary> {
    const db = getDb();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      prsAwaitingReview,
      myOpenPrs,
      prsParticipated,
      issuesAssigned,
      issuesCreated,
      recentActivity,
      lastWeekActivity,
      activeRepos,
    ] = await Promise.all([
      // PRs awaiting user's review
      db
        .select({ count: count() })
        .from(pullRequests)
        .innerJoin(
          sql`pr_reviewers`,
          sql`pr_reviewers.pr_id = ${pullRequests.id}`
        )
        .where(
          and(
            sql`pr_reviewers.reviewer_id = ${userId}`,
            sql`pr_reviewers.state = 'pending'`,
            eq(pullRequests.state, 'open')
          )
        )
        .then((r) => r[0]?.count || 0)
        .catch(() => 0), // Handle if pr_reviewers doesn't exist

      // User's open PRs
      db
        .select({ count: count() })
        .from(pullRequests)
        .where(
          and(eq(pullRequests.authorId, userId), eq(pullRequests.state, 'open'))
        )
        .then((r) => r[0]?.count || 0),

      // PRs user participated in (reviewed/commented)
      db
        .select({ count: sql<number>`COUNT(DISTINCT ${pullRequests.id})` })
        .from(pullRequests)
        .leftJoin(prReviews, eq(prReviews.prId, pullRequests.id))
        .leftJoin(prComments, eq(prComments.prId, pullRequests.id))
        .where(
          and(
            eq(pullRequests.state, 'open'),
            sql`(${prReviews.authorId} = ${userId} OR ${prComments.authorId} = ${userId})`,
            sql`${pullRequests.authorId} != ${userId}`
          )
        )
        .then((r) => Number(r[0]?.count) || 0)
        .catch(() => 0),

      // Issues assigned to user
      db
        .select({ count: count() })
        .from(issues)
        .where(
          and(eq(issues.assigneeId, userId), eq(issues.state, 'open'))
        )
        .then((r) => r[0]?.count || 0),

      // Issues created by user (open)
      db
        .select({ count: count() })
        .from(issues)
        .where(
          and(eq(issues.authorId, userId), eq(issues.state, 'open'))
        )
        .then((r) => r[0]?.count || 0),

      // Recent activity (last 7 days)
      db
        .select({ count: count() })
        .from(activities)
        .where(
          and(
            eq(activities.actorId, userId),
            gte(activities.createdAt, sevenDaysAgo)
          )
        )
        .then((r) => r[0]?.count || 0),

      // Last week activity (7-14 days ago) for trend comparison
      db
        .select({ count: count() })
        .from(activities)
        .where(
          and(
            eq(activities.actorId, userId),
            gte(activities.createdAt, fourteenDaysAgo),
            lte(activities.createdAt, sevenDaysAgo)
          )
        )
        .then((r) => r[0]?.count || 0),

      // Active repos in last 30 days
      db
        .select({ count: sql<number>`COUNT(DISTINCT ${activities.repoId})` })
        .from(activities)
        .where(
          and(
            eq(activities.actorId, userId),
            gte(activities.createdAt, thirtyDaysAgo),
            sql`${activities.repoId} IS NOT NULL`
          )
        )
        .then((r) => Number(r[0]?.count) || 0),
    ]);

    // Calculate trend
    let contributionTrend: 'up' | 'down' | 'stable' = 'stable';
    if (recentActivity > lastWeekActivity * 1.1) {
      contributionTrend = 'up';
    } else if (recentActivity < lastWeekActivity * 0.9) {
      contributionTrend = 'down';
    }

    return {
      prsAwaitingReview,
      myOpenPrs,
      prsParticipated,
      issuesAssigned,
      issuesCreated,
      recentActivity,
      activeRepos,
      thisWeekContributions: recentActivity,
      lastWeekContributions: lastWeekActivity,
      contributionTrend,
    };
  },

  /**
   * Get user's repositories for dashboard
   */
  async getUserRepositories(
    userId: string,
    limit = 10
  ): Promise<DashboardRepo[]> {
    const db = getDb();

    const repos = await db
      .select()
      .from(repositories)
      .where(eq(repositories.ownerId, userId))
      .orderBy(desc(repositories.pushedAt), desc(repositories.updatedAt))
      .limit(limit);

    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      ownerId: repo.ownerId,
      description: repo.description,
      starsCount: repo.starsCount,
      isPrivate: repo.isPrivate,
      updatedAt: repo.updatedAt,
      pushedAt: repo.pushedAt,
      openPrs: repo.openPrsCount,
      openIssues: repo.openIssuesCount,
    }));
  },

  /**
   * Get recent activity feed for user
   */
  async getActivityFeed(
    userId: string,
    limit = 20
  ): Promise<ActivityFeedItem[]> {
    const db = getDb();

    const result = await db
      .select({
        activity: activities,
        repo: {
          name: repositories.name,
        },
        actor: {
          name: user.name,
          username: user.username,
        },
      })
      .from(activities)
      .leftJoin(repositories, eq(activities.repoId, repositories.id))
      .leftJoin(user, eq(activities.actorId, user.id))
      .where(eq(activities.actorId, userId))
      .orderBy(desc(activities.createdAt))
      .limit(limit);

    return result.map((r) => ({
      id: r.activity.id,
      type: r.activity.type,
      actorId: r.activity.actorId,
      actorName: r.actor?.name ?? undefined,
      actorUsername: r.actor?.username ?? undefined,
      repoId: r.activity.repoId,
      repoName: r.repo?.name ?? undefined,
      payload: r.activity.payload ? JSON.parse(r.activity.payload) : null,
      createdAt: r.activity.createdAt,
    }));
  },

  /**
   * Get daily activity counts for a date range
   */
  async getDailyActivity(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, number>> {
    const db = getDb();

    const result = await db
      .select({
        date: sql<string>`DATE(${activities.createdAt})`,
        count: count(),
      })
      .from(activities)
      .where(
        and(
          eq(activities.actorId, userId),
          gte(activities.createdAt, startDate),
          lte(activities.createdAt, endDate)
        )
      )
      .groupBy(sql`DATE(${activities.createdAt})`);

    const map = new Map<string, number>();
    for (const row of result) {
      map.set(row.date, row.count);
    }
    return map;
  },

  /**
   * Build contribution calendar from daily activity
   */
  buildContributionCalendar(
    dailyActivity: Map<string, number>
  ): ContributionDay[] {
    const calendar: ContributionDay[] = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 365);

    // Find max for level calculation
    const maxCount = Math.max(1, ...Array.from(dailyActivity.values()));

    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const count = dailyActivity.get(dateStr) || 0;

      // Calculate level (0-4)
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (count > 0) {
        const ratio = count / maxCount;
        if (ratio >= 0.75) level = 4;
        else if (ratio >= 0.5) level = 3;
        else if (ratio >= 0.25) level = 2;
        else level = 1;
      }

      calendar.push({ date: dateStr, count, level });
    }

    return calendar;
  },

  /**
   * Calculate contribution streaks
   */
  calculateStreaks(dailyActivity: Map<string, number>): ContributionStreak {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get sorted dates with activity
    const activeDates = Array.from(dailyActivity.keys())
      .filter((d) => dailyActivity.get(d)! > 0)
      .sort()
      .reverse();

    if (activeDates.length === 0) {
      return { current: 0, longest: 0, lastContributionDate: null };
    }

    const lastContributionDate = activeDates[0];

    // Calculate current streak
    let currentStreak = 0;
    const currentDate = new Date(today);

    // Check if there's a contribution today or yesterday (allow 1 day gap)
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (dailyActivity.has(todayStr) || dailyActivity.has(yesterdayStr)) {
      // Count backwards from the most recent day with activity
      const startDate = dailyActivity.has(todayStr) ? today : yesterday;
      for (
        let d = new Date(startDate);
        dailyActivity.has(d.toISOString().split('T')[0]);
        d.setDate(d.getDate() - 1)
      ) {
        currentStreak++;
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;

    for (const dateStr of [...activeDates].reverse()) {
      const date = new Date(dateStr);
      if (prevDate) {
        const diff = (date.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000);
        if (diff === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      prevDate = date;
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return {
      current: currentStreak,
      longest: longestStreak,
      lastContributionDate,
    };
  },

  /**
   * Calculate contributions by day of week
   */
  calculateDayOfWeekBreakdown(dailyActivity: Map<string, number>): number[] {
    const breakdown = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat

    for (const [dateStr, count] of dailyActivity) {
      const date = new Date(dateStr);
      breakdown[date.getDay()] += count;
    }

    return breakdown;
  },
};
