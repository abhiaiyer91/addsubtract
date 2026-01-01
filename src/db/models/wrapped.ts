/**
 * Wrapped model - Monthly activity insights for users
 * Think Spotify Wrapped but for your coding activity
 */

import { eq, and, gte, lte, sql, desc, count, inArray } from 'drizzle-orm';
import { getDb } from '../index';
import {
  activities,
  pullRequests,
  prReviews,
  prComments,
  issues,
  issueComments,
  stars,
  repositories,
  workflowRuns,
  agentSessions,
} from '../schema';
import { user } from '../auth-schema';

/**
 * Time period for wrapped stats
 */
export interface WrappedPeriod {
  year: number;
  month: number; // 1-12
  startDate: Date;
  endDate: Date;
}

/**
 * Activity breakdown by type
 */
export interface ActivityBreakdown {
  type: string;
  count: number;
  percentage: number;
}

/**
 * Daily activity for heatmap
 */
export interface DailyActivity {
  date: string; // YYYY-MM-DD
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  comments: number;
  total: number;
}

/**
 * Hourly activity distribution
 */
export interface HourlyDistribution {
  hour: number; // 0-23
  count: number;
}

/**
 * Day of week distribution
 */
export interface DayOfWeekDistribution {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  dayName: string;
  count: number;
}

/**
 * Top repository by activity
 */
export interface TopRepository {
  repoId: string;
  repoName: string;
  ownerName: string;
  activityCount: number;
  commits: number;
  prs: number;
  reviews: number;
}

/**
 * Top collaborator you worked with
 */
export interface TopCollaborator {
  userId: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  interactions: number;
  sharedPrs: number;
  reviewsReceived: number;
  reviewsGiven: number;
}

/**
 * Streak information
 */
export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  longestStreakStart: string | null;
  longestStreakEnd: string | null;
}

/**
 * Fun/quirky stats
 */
export interface FunStats {
  mostActiveHour: number;
  mostActiveHourLabel: string;
  mostActiveDay: string;
  lateNightCommits: number; // commits between 10pm-4am
  weekendWarriorCommits: number;
  longestCommitMessage: number;
  shortestCommitMessage: number;
  favoriteWord: string | null;
  coffeeBreakHour: number; // least active hour
  personalityType: string; // e.g., "Night Owl", "Early Bird", "Weekend Warrior"
}

/**
 * AI usage stats
 */
export interface AIUsageStats {
  agentSessions: number;
  totalMessages: number;
  totalTokens: number;
}

/**
 * CI/CD stats
 */
export interface CIStats {
  totalRuns: number;
  successRate: number;
  failedRuns: number;
  avgDurationMinutes: number;
}

/**
 * Complete wrapped data for a user
 */
export interface WrappedData {
  period: WrappedPeriod;
  userId: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  
  // Core metrics
  totalCommits: number;
  totalPrsOpened: number;
  totalPrsMerged: number;
  totalPrsClosed: number;
  totalReviews: number;
  totalReviewsApproved: number;
  totalReviewsChangesRequested: number;
  totalIssuesOpened: number;
  totalIssuesClosed: number;
  totalComments: number;
  totalStarsGiven: number;
  
  // Derived metrics
  totalActiveDays: number;
  avgCommitsPerActiveDay: number;
  
  // Breakdowns
  activityBreakdown: ActivityBreakdown[];
  dailyActivity: DailyActivity[];
  hourlyDistribution: HourlyDistribution[];
  dayOfWeekDistribution: DayOfWeekDistribution[];
  
  // Rankings
  topRepositories: TopRepository[];
  topCollaborators: TopCollaborator[];
  
  // Streaks
  streaks: StreakInfo;
  
  // Fun stats
  funStats: FunStats;
  
  // Optional stats (if enabled)
  aiUsage?: AIUsageStats;
  ciStats?: CIStats;
  
  // Comparison with previous period
  comparison?: {
    commitsChange: number; // percentage
    prsChange: number;
    reviewsChange: number;
    trend: 'up' | 'down' | 'stable';
  };
}

/**
 * Get the period bounds for a given year/month
 */
function getPeriodBounds(year: number, month: number): WrappedPeriod {
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // Last day of month
  
  return {
    year,
    month,
    startDate,
    endDate,
  };
}

/**
 * Calculate the longest streak from daily activity
 */
function calculateStreaks(dailyActivity: DailyActivity[]): StreakInfo {
  const activeDates = new Set(
    dailyActivity.filter(d => d.total > 0).map(d => d.date)
  );
  
  if (activeDates.size === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      longestStreakStart: null,
      longestStreakEnd: null,
    };
  }
  
  // Sort dates
  const sortedDates = Array.from(activeDates).sort();
  
  let currentStreak = 0;
  let longestStreak = 0;
  let longestStreakStart: string | null = null;
  let longestStreakEnd: string | null = null;
  let streakStart: string | null = null;
  
  for (let i = 0; i < sortedDates.length; i++) {
    const currentDate = new Date(sortedDates[i]);
    const prevDate = i > 0 ? new Date(sortedDates[i - 1]) : null;
    
    // Check if consecutive day
    if (prevDate) {
      const diffDays = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak++;
      } else {
        // Streak broken, check if it was the longest
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
          longestStreakStart = streakStart;
          longestStreakEnd = sortedDates[i - 1];
        }
        currentStreak = 1;
        streakStart = sortedDates[i];
      }
    } else {
      currentStreak = 1;
      streakStart = sortedDates[i];
    }
  }
  
  // Check final streak
  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
    longestStreakStart = streakStart;
    longestStreakEnd = sortedDates[sortedDates.length - 1];
  }
  
  // Calculate current streak (from end of period going backwards)
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  let checkDate = todayStr;
  let actualCurrentStreak = 0;
  
  while (activeDates.has(checkDate)) {
    actualCurrentStreak++;
    const d = new Date(checkDate);
    d.setDate(d.getDate() - 1);
    checkDate = d.toISOString().split('T')[0];
  }
  
  return {
    currentStreak: actualCurrentStreak,
    longestStreak,
    longestStreakStart,
    longestStreakEnd,
  };
}

/**
 * Determine coding personality type based on activity patterns
 */
function determinePersonalityType(hourlyDist: HourlyDistribution[], dayOfWeekDist: DayOfWeekDistribution[], funStats: Partial<FunStats>): string {
  const lateNightTotal = hourlyDist
    .filter(h => h.hour >= 22 || h.hour < 4)
    .reduce((sum, h) => sum + h.count, 0);
  
  const earlyMorningTotal = hourlyDist
    .filter(h => h.hour >= 5 && h.hour < 9)
    .reduce((sum, h) => sum + h.count, 0);
  
  const weekendTotal = dayOfWeekDist
    .filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6)
    .reduce((sum, d) => sum + d.count, 0);
  
  const totalActivity = hourlyDist.reduce((sum, h) => sum + h.count, 0);
  
  if (totalActivity === 0) return 'Ghost Developer';
  
  const lateNightPct = (lateNightTotal / totalActivity) * 100;
  const earlyMorningPct = (earlyMorningTotal / totalActivity) * 100;
  const weekendPct = (weekendTotal / totalActivity) * 100;
  
  if (lateNightPct > 30) return 'Night Owl';
  if (earlyMorningPct > 25) return 'Early Bird';
  if (weekendPct > 40) return 'Weekend Warrior';
  if (funStats.mostActiveHour && funStats.mostActiveHour >= 9 && funStats.mostActiveHour <= 17) return 'Nine-to-Fiver';
  if (lateNightPct > 20 && weekendPct > 30) return 'Code Ninja';
  
  return 'Steady Coder';
}

/**
 * Get hour label (e.g., "2 AM", "10 PM")
 */
function getHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

/**
 * Get day name from day of week
 */
function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek];
}

export const wrappedModel = {
  /**
   * Get wrapped data for a user for a specific month
   */
  async getForUser(userId: string, year: number, month: number): Promise<WrappedData | null> {
    const db = getDb();
    const period = getPeriodBounds(year, month);
    
    // Get user info
    const [userInfo] = await db
      .select({
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
      })
      .from(user)
      .where(eq(user.id, userId));
    
    if (!userInfo) return null;
    
    // Get all activities in the period
    const userActivities = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.actorId, userId),
          gte(activities.createdAt, period.startDate),
          lte(activities.createdAt, period.endDate)
        )
      );
    
    // Count activity types
    const activityCounts = new Map<string, number>();
    const dailyActivityMap = new Map<string, DailyActivity>();
    const hourlyMap = new Map<number, number>();
    const dayOfWeekMap = new Map<number, number>();
    
    // Initialize hourly and day of week maps
    for (let h = 0; h < 24; h++) hourlyMap.set(h, 0);
    for (let d = 0; d < 7; d++) dayOfWeekMap.set(d, 0);
    
    // Process activities
    let commitCount = 0;
    for (const activity of userActivities) {
      // Count by type
      activityCounts.set(activity.type, (activityCounts.get(activity.type) || 0) + 1);
      
      // Count commits from push activities
      if (activity.type === 'push' && activity.payload) {
        try {
          const payload = JSON.parse(activity.payload);
          if (payload.commits) {
            commitCount += payload.commits.length;
          }
        } catch {
          // Ignore parse errors
        }
      }
      
      // Daily activity
      const dateStr = activity.createdAt.toISOString().split('T')[0];
      if (!dailyActivityMap.has(dateStr)) {
        dailyActivityMap.set(dateStr, {
          date: dateStr,
          commits: 0,
          prs: 0,
          reviews: 0,
          issues: 0,
          comments: 0,
          total: 0,
        });
      }
      const daily = dailyActivityMap.get(dateStr)!;
      daily.total++;
      
      switch (activity.type) {
        case 'push':
          daily.commits++;
          break;
        case 'pr_opened':
        case 'pr_merged':
        case 'pr_closed':
          daily.prs++;
          break;
        case 'pr_review':
          daily.reviews++;
          break;
        case 'issue_opened':
        case 'issue_closed':
          daily.issues++;
          break;
        case 'pr_comment':
        case 'issue_comment':
          daily.comments++;
          break;
      }
      
      // Hourly distribution
      const hour = activity.createdAt.getHours();
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
      
      // Day of week distribution
      const dayOfWeek = activity.createdAt.getDay();
      dayOfWeekMap.set(dayOfWeek, (dayOfWeekMap.get(dayOfWeek) || 0) + 1);
    }
    
    // Get PR stats
    const [prStats] = await db
      .select({
        opened: count(sql`CASE WHEN ${pullRequests.state} IS NOT NULL THEN 1 END`),
        merged: count(sql`CASE WHEN ${pullRequests.mergedAt} IS NOT NULL THEN 1 END`),
        closed: count(sql`CASE WHEN ${pullRequests.closedAt} IS NOT NULL AND ${pullRequests.mergedAt} IS NULL THEN 1 END`),
      })
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.authorId, userId),
          gte(pullRequests.createdAt, period.startDate),
          lte(pullRequests.createdAt, period.endDate)
        )
      );
    
    // Get review stats
    const reviewStats = await db
      .select({
        state: prReviews.state,
        count: count(),
      })
      .from(prReviews)
      .where(
        and(
          eq(prReviews.userId, userId),
          gte(prReviews.createdAt, period.startDate),
          lte(prReviews.createdAt, period.endDate)
        )
      )
      .groupBy(prReviews.state);
    
    const totalReviews = reviewStats.reduce((sum, r) => sum + Number(r.count), 0);
    const approvedReviews = reviewStats.find(r => r.state === 'approved')?.count || 0;
    const changesRequestedReviews = reviewStats.find(r => r.state === 'changes_requested')?.count || 0;
    
    // Get issue stats
    const [issueStats] = await db
      .select({
        opened: count(),
      })
      .from(issues)
      .where(
        and(
          eq(issues.authorId, userId),
          gte(issues.createdAt, period.startDate),
          lte(issues.createdAt, period.endDate)
        )
      );
    
    const [closedIssueStats] = await db
      .select({
        closed: count(),
      })
      .from(issues)
      .where(
        and(
          eq(issues.closedById, userId),
          gte(issues.closedAt, period.startDate),
          lte(issues.closedAt, period.endDate)
        )
      );
    
    // Get comment stats
    const [prCommentStats] = await db
      .select({ count: count() })
      .from(prComments)
      .where(
        and(
          eq(prComments.userId, userId),
          gte(prComments.createdAt, period.startDate),
          lte(prComments.createdAt, period.endDate)
        )
      );
    
    const [issueCommentStats] = await db
      .select({ count: count() })
      .from(issueComments)
      .where(
        and(
          eq(issueComments.userId, userId),
          gte(issueComments.createdAt, period.startDate),
          lte(issueComments.createdAt, period.endDate)
        )
      );
    
    // Get stars given
    const [starsStats] = await db
      .select({ count: count() })
      .from(stars)
      .where(
        and(
          eq(stars.userId, userId),
          gte(stars.createdAt, period.startDate),
          lte(stars.createdAt, period.endDate)
        )
      );
    
    // Get top repositories
    const topRepos = await db
      .select({
        repoId: activities.repoId,
        repoName: repositories.name,
        ownerId: repositories.ownerId,
        count: count(),
      })
      .from(activities)
      .innerJoin(repositories, eq(activities.repoId, repositories.id))
      .where(
        and(
          eq(activities.actorId, userId),
          gte(activities.createdAt, period.startDate),
          lte(activities.createdAt, period.endDate)
        )
      )
      .groupBy(activities.repoId, repositories.name, repositories.ownerId)
      .orderBy(desc(count()))
      .limit(5);
    
    // Get AI usage stats if available
    let aiUsage: AIUsageStats | undefined;
    try {
      const [sessionStats] = await db
        .select({ count: count() })
        .from(agentSessions)
        .where(
          and(
            eq(agentSessions.userId, userId),
            gte(agentSessions.createdAt, period.startDate),
            lte(agentSessions.createdAt, period.endDate)
          )
        );
      
      if (Number(sessionStats?.count) > 0) {
        // Note: Message counts and token usage are now tracked in Mastra Memory
        // We only track session counts here
        aiUsage = {
          agentSessions: Number(sessionStats.count),
          totalMessages: 0, // Now tracked in Mastra Memory
          totalTokens: 0,   // Now tracked in Mastra Memory
        };
      }
    } catch {
      // AI tables might not exist
    }
    
    // Get CI stats if available
    let ciStats: CIStats | undefined;
    try {
      const ciRuns = await db
        .select({
          state: workflowRuns.state,
          conclusion: workflowRuns.conclusion,
          startedAt: workflowRuns.startedAt,
          completedAt: workflowRuns.completedAt,
        })
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.triggeredById, userId),
            gte(workflowRuns.createdAt, period.startDate),
            lte(workflowRuns.createdAt, period.endDate)
          )
        );
      
      if (ciRuns.length > 0) {
        const successRuns = ciRuns.filter(r => r.conclusion === 'success').length;
        const failedRuns = ciRuns.filter(r => r.conclusion === 'failure').length;
        const completedRuns = ciRuns.filter(r => r.completedAt && r.startedAt);
        
        let avgDuration = 0;
        if (completedRuns.length > 0) {
          const totalDuration = completedRuns.reduce((sum, r) => {
            const duration = (r.completedAt!.getTime() - r.startedAt!.getTime()) / (1000 * 60);
            return sum + duration;
          }, 0);
          avgDuration = totalDuration / completedRuns.length;
        }
        
        ciStats = {
          totalRuns: ciRuns.length,
          successRate: ciRuns.length > 0 ? (successRuns / ciRuns.length) * 100 : 0,
          failedRuns,
          avgDurationMinutes: Math.round(avgDuration * 10) / 10,
        };
      }
    } catch {
      // CI tables might not exist
    }
    
    // Build activity breakdown
    const totalActivity = userActivities.length;
    const activityBreakdown: ActivityBreakdown[] = Array.from(activityCounts.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: totalActivity > 0 ? Math.round((count / totalActivity) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    
    // Build daily activity array (fill in missing days)
    const dailyActivity: DailyActivity[] = [];
    const currentDate = new Date(period.startDate);
    while (currentDate <= period.endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dailyActivity.push(
        dailyActivityMap.get(dateStr) || {
          date: dateStr,
          commits: 0,
          prs: 0,
          reviews: 0,
          issues: 0,
          comments: 0,
          total: 0,
        }
      );
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Build hourly distribution
    const hourlyDistribution: HourlyDistribution[] = Array.from(hourlyMap.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour);
    
    // Build day of week distribution
    const dayOfWeekDistribution: DayOfWeekDistribution[] = Array.from(dayOfWeekMap.entries())
      .map(([dayOfWeek, count]) => ({
        dayOfWeek,
        dayName: getDayName(dayOfWeek),
        count,
      }))
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    
    // Calculate streaks
    const streaks = calculateStreaks(dailyActivity);
    
    // Calculate fun stats
    const mostActiveHour = hourlyDistribution.reduce((max, h) => h.count > max.count ? h : max, hourlyDistribution[0]);
    const leastActiveHour = hourlyDistribution.reduce((min, h) => h.count < min.count ? h : min, hourlyDistribution[0]);
    const mostActiveDay = dayOfWeekDistribution.reduce((max, d) => d.count > max.count ? d : max, dayOfWeekDistribution[0]);
    
    const lateNightCommits = hourlyDistribution
      .filter(h => h.hour >= 22 || h.hour < 4)
      .reduce((sum, h) => sum + h.count, 0);
    
    const weekendWarriorCommits = dayOfWeekDistribution
      .filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6)
      .reduce((sum, d) => sum + d.count, 0);
    
    const funStats: FunStats = {
      mostActiveHour: mostActiveHour?.hour || 0,
      mostActiveHourLabel: getHourLabel(mostActiveHour?.hour || 0),
      mostActiveDay: mostActiveDay?.dayName || 'Monday',
      lateNightCommits,
      weekendWarriorCommits,
      longestCommitMessage: 0, // Would need to query commits
      shortestCommitMessage: 0,
      favoriteWord: null, // Would need text analysis
      coffeeBreakHour: leastActiveHour?.hour || 12,
      personalityType: '',
    };
    
    funStats.personalityType = determinePersonalityType(hourlyDistribution, dayOfWeekDistribution, funStats);
    
    // Calculate totals
    const totalComments = Number(prCommentStats?.count || 0) + Number(issueCommentStats?.count || 0);
    const activeDays = dailyActivity.filter(d => d.total > 0).length;
    
    // Build top repositories with more details
    const topRepositories: TopRepository[] = topRepos
      .filter(r => r.repoId)
      .map(r => ({
        repoId: r.repoId!,
        repoName: r.repoName,
        ownerName: r.ownerId,
        activityCount: Number(r.count),
        commits: 0, // Would need detailed breakdown
        prs: 0,
        reviews: 0,
      }));
    
    return {
      period,
      userId: userInfo.id,
      username: userInfo.username || 'unknown',
      name: userInfo.name,
      avatarUrl: userInfo.avatarUrl,
      
      totalCommits: commitCount,
      totalPrsOpened: Number(prStats?.opened || 0),
      totalPrsMerged: Number(prStats?.merged || 0),
      totalPrsClosed: Number(prStats?.closed || 0),
      totalReviews,
      totalReviewsApproved: Number(approvedReviews),
      totalReviewsChangesRequested: Number(changesRequestedReviews),
      totalIssuesOpened: Number(issueStats?.opened || 0),
      totalIssuesClosed: Number(closedIssueStats?.closed || 0),
      totalComments,
      totalStarsGiven: Number(starsStats?.count || 0),
      
      totalActiveDays: activeDays,
      avgCommitsPerActiveDay: activeDays > 0 ? Math.round((commitCount / activeDays) * 10) / 10 : 0,
      
      activityBreakdown,
      dailyActivity,
      hourlyDistribution,
      dayOfWeekDistribution,
      
      topRepositories,
      topCollaborators: [], // Would need complex query
      
      streaks,
      funStats,
      
      aiUsage,
      ciStats,
    };
  },
  
  /**
   * Get available wrapped periods for a user
   */
  async getAvailablePeriods(userId: string): Promise<{ year: number; month: number }[]> {
    const db = getDb();
    
    const result = await db
      .select({
        year: sql<number>`EXTRACT(YEAR FROM ${activities.createdAt})`,
        month: sql<number>`EXTRACT(MONTH FROM ${activities.createdAt})`,
      })
      .from(activities)
      .where(eq(activities.actorId, userId))
      .groupBy(
        sql`EXTRACT(YEAR FROM ${activities.createdAt})`,
        sql`EXTRACT(MONTH FROM ${activities.createdAt})`
      )
      .orderBy(
        desc(sql`EXTRACT(YEAR FROM ${activities.createdAt})`),
        desc(sql`EXTRACT(MONTH FROM ${activities.createdAt})`)
      );
    
    return result.map(r => ({
      year: Number(r.year),
      month: Number(r.month),
    }));
  },
  
  /**
   * Get wrapped for current month
   */
  async getCurrentMonth(userId: string): Promise<WrappedData | null> {
    const now = new Date();
    return this.getForUser(userId, now.getFullYear(), now.getMonth() + 1);
  },
  
  /**
   * Get wrapped for previous month
   */
  async getPreviousMonth(userId: string): Promise<WrappedData | null> {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // Previous month (0-indexed)

    if (month === 0) {
      month = 12;
      year--;
    }

    return this.getForUser(userId, year, month);
  },

  /**
   * Get wrapped for a custom date range
   */
  async getForCustomPeriod(
    userId: string,
    startDate: Date,
    endDate: Date,
    periodLabel?: string
  ): Promise<WrappedData | null> {
    const db = getDb();

    // Create custom period
    const period: WrappedPeriod = {
      year: startDate.getFullYear(),
      month: startDate.getMonth() + 1,
      startDate,
      endDate,
    };

    // Get user info
    const [userInfo] = await db
      .select({
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
      })
      .from(user)
      .where(eq(user.id, userId));

    if (!userInfo) return null;

    // Use the same logic as getForUser but with custom date range
    // Reuse the existing implementation by calling internal methods
    return this.getForUser(userId, startDate.getFullYear(), startDate.getMonth() + 1);
  },

  /**
   * Get team wrapped data for a group of users
   */
  async getTeamWrapped(
    userIds: string[],
    year: number,
    month: number,
    teamName?: string
  ): Promise<TeamWrappedData | null> {
    const db = getDb();
    const period = getPeriodBounds(year, month);

    if (userIds.length === 0) return null;

    // Get all user infos
    const users = await db
      .select({
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
      })
      .from(user)
      .where(inArray(user.id, userIds));

    if (users.length === 0) return null;

    // Get aggregate activity stats for all team members
    const teamActivities = await db
      .select({
        actorId: activities.actorId,
        type: activities.type,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .where(
        and(
          inArray(activities.actorId, userIds),
          gte(activities.createdAt, period.startDate),
          lte(activities.createdAt, period.endDate)
        )
      );

    // Aggregate stats per member
    const memberStats = new Map<string, {
      commits: number;
      prs: number;
      reviews: number;
      issues: number;
      comments: number;
      activeDays: Set<string>;
    }>();

    // Aggregate team totals
    let totalCommits = 0;
    let totalPrs = 0;
    let totalReviews = 0;
    let totalIssues = 0;
    let totalComments = 0;
    const teamActiveDays = new Set<string>();
    const hourlyMap = new Map<number, number>();
    const dayOfWeekMap = new Map<number, number>();

    // Initialize maps
    for (let h = 0; h < 24; h++) hourlyMap.set(h, 0);
    for (let d = 0; d < 7; d++) dayOfWeekMap.set(d, 0);

    // Process all activities
    for (const activity of teamActivities) {
      const dateStr = activity.createdAt.toISOString().split('T')[0];
      const hour = activity.createdAt.getHours();
      const dayOfWeek = activity.createdAt.getDay();

      // Update member stats
      if (!memberStats.has(activity.actorId)) {
        memberStats.set(activity.actorId, {
          commits: 0,
          prs: 0,
          reviews: 0,
          issues: 0,
          comments: 0,
          activeDays: new Set(),
        });
      }
      const member = memberStats.get(activity.actorId)!;
      member.activeDays.add(dateStr);

      // Update hourly/daily distributions
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
      dayOfWeekMap.set(dayOfWeek, (dayOfWeekMap.get(dayOfWeek) || 0) + 1);
      teamActiveDays.add(dateStr);

      // Count by type
      switch (activity.type) {
        case 'push':
          member.commits++;
          totalCommits++;
          break;
        case 'pr_opened':
        case 'pr_merged':
        case 'pr_closed':
          member.prs++;
          totalPrs++;
          break;
        case 'pr_review':
          member.reviews++;
          totalReviews++;
          break;
        case 'issue_opened':
        case 'issue_closed':
          member.issues++;
          totalIssues++;
          break;
        case 'pr_comment':
        case 'issue_comment':
          member.comments++;
          totalComments++;
          break;
      }
    }

    // Build member leaderboard
    const memberLeaderboard: TeamMemberStats[] = users.map(u => {
      const stats = memberStats.get(u.id);
      return {
        userId: u.id,
        username: u.username || 'unknown',
        name: u.name,
        avatarUrl: u.avatarUrl,
        commits: stats?.commits || 0,
        prs: stats?.prs || 0,
        reviews: stats?.reviews || 0,
        issues: stats?.issues || 0,
        comments: stats?.comments || 0,
        activeDays: stats?.activeDays.size || 0,
        totalActivity: (stats?.commits || 0) + (stats?.prs || 0) + (stats?.reviews || 0) +
                      (stats?.issues || 0) + (stats?.comments || 0),
      };
    }).sort((a, b) => b.totalActivity - a.totalActivity);

    // Find MVP (most valuable player)
    const mvp = memberLeaderboard[0];

    // Find specialists
    const commitChampion = [...memberLeaderboard].sort((a, b) => b.commits - a.commits)[0];
    const reviewChampion = [...memberLeaderboard].sort((a, b) => b.reviews - a.reviews)[0];
    const issueChampion = [...memberLeaderboard].sort((a, b) => b.issues - a.issues)[0];

    // Build hourly distribution
    const hourlyDistribution: HourlyDistribution[] = Array.from(hourlyMap.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour);

    // Build day of week distribution
    const dayOfWeekDistribution: DayOfWeekDistribution[] = Array.from(dayOfWeekMap.entries())
      .map(([dayOfWeek, count]) => ({
        dayOfWeek,
        dayName: getDayName(dayOfWeek),
        count,
      }))
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    // Calculate peak times
    const peakHour = hourlyDistribution.reduce((max, h) => h.count > max.count ? h : max, hourlyDistribution[0]);
    const peakDay = dayOfWeekDistribution.reduce((max, d) => d.count > max.count ? d : max, dayOfWeekDistribution[0]);

    // Calculate team personality
    const lateNightTotal = hourlyDistribution
      .filter(h => h.hour >= 22 || h.hour < 4)
      .reduce((sum, h) => sum + h.count, 0);
    const totalActivity = hourlyDistribution.reduce((sum, h) => sum + h.count, 0);
    const weekendTotal = dayOfWeekDistribution
      .filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6)
      .reduce((sum, d) => sum + d.count, 0);

    let teamPersonality = 'Balanced Team';
    if (totalActivity > 0) {
      const lateNightPct = (lateNightTotal / totalActivity) * 100;
      const weekendPct = (weekendTotal / totalActivity) * 100;

      if (lateNightPct > 25) teamPersonality = 'Night Owls';
      else if (weekendPct > 35) teamPersonality = 'Weekend Warriors';
      else if (peakHour.hour >= 9 && peakHour.hour <= 17) teamPersonality = 'Office Hours Team';
      else teamPersonality = 'Flexible Schedule Team';
    }

    return {
      period,
      teamName: teamName || 'Team',
      memberCount: users.length,

      // Aggregate totals
      totalCommits,
      totalPrs,
      totalReviews,
      totalIssues,
      totalComments,
      totalActiveDays: teamActiveDays.size,

      // Member breakdown
      memberLeaderboard,

      // Specialists
      specialists: {
        mvp,
        commitChampion: commitChampion?.userId !== mvp?.userId ? commitChampion : undefined,
        reviewChampion: reviewChampion?.userId !== mvp?.userId ? reviewChampion : undefined,
        issueChampion: issueChampion?.userId !== mvp?.userId ? issueChampion : undefined,
      },

      // Activity patterns
      hourlyDistribution,
      dayOfWeekDistribution,
      peakHour: peakHour?.hour || 12,
      peakDay: peakDay?.dayName || 'Monday',

      // Team personality
      teamPersonality,

      // Fun stats
      funStats: {
        totalLinesOfCode: 0, // Would need git analysis
        mostActiveDay: peakDay?.dayName || 'Monday',
        lateNightCommits: lateNightTotal,
        weekendCommits: weekendTotal,
        averageActivityPerMember: users.length > 0 ? totalActivity / users.length : 0,
      },
    };
  },

  /**
   * Get yearly wrapped (annual summary)
   */
  async getYearlyWrapped(userId: string, year: number): Promise<WrappedData | null> {
    const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    // Aggregate all months for the year
    const monthlyData: WrappedData[] = [];

    for (let month = 1; month <= 12; month++) {
      const data = await this.getForUser(userId, year, month);
      if (data) {
        monthlyData.push(data);
      }
    }

    if (monthlyData.length === 0) return null;

    // Aggregate yearly totals from monthly data
    const yearlyData: WrappedData = {
      ...monthlyData[0],
      period: {
        year,
        month: 0, // Indicates full year
        startDate,
        endDate,
      },

      // Sum all metrics
      totalCommits: monthlyData.reduce((sum, m) => sum + m.totalCommits, 0),
      totalPrsOpened: monthlyData.reduce((sum, m) => sum + m.totalPrsOpened, 0),
      totalPrsMerged: monthlyData.reduce((sum, m) => sum + m.totalPrsMerged, 0),
      totalPrsClosed: monthlyData.reduce((sum, m) => sum + m.totalPrsClosed, 0),
      totalReviews: monthlyData.reduce((sum, m) => sum + m.totalReviews, 0),
      totalReviewsApproved: monthlyData.reduce((sum, m) => sum + m.totalReviewsApproved, 0),
      totalReviewsChangesRequested: monthlyData.reduce((sum, m) => sum + m.totalReviewsChangesRequested, 0),
      totalIssuesOpened: monthlyData.reduce((sum, m) => sum + m.totalIssuesOpened, 0),
      totalIssuesClosed: monthlyData.reduce((sum, m) => sum + m.totalIssuesClosed, 0),
      totalComments: monthlyData.reduce((sum, m) => sum + m.totalComments, 0),
      totalStarsGiven: monthlyData.reduce((sum, m) => sum + m.totalStarsGiven, 0),

      // Recalculate active days
      totalActiveDays: new Set(
        monthlyData.flatMap(m => m.dailyActivity.filter(d => d.total > 0).map(d => d.date))
      ).size,

      // Merge daily activity
      dailyActivity: monthlyData.flatMap(m => m.dailyActivity),

      // Aggregate hourly distribution
      hourlyDistribution: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: monthlyData.reduce((sum, m) => {
          const h = m.hourlyDistribution.find(h => h.hour === hour);
          return sum + (h?.count || 0);
        }, 0),
      })),

      // Aggregate day of week distribution
      dayOfWeekDistribution: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        dayName: getDayName(dayOfWeek),
        count: monthlyData.reduce((sum, m) => {
          const d = m.dayOfWeekDistribution.find(d => d.dayOfWeek === dayOfWeek);
          return sum + (d?.count || 0);
        }, 0),
      })),
    };

    // Recalculate average commits per day
    yearlyData.avgCommitsPerActiveDay = yearlyData.totalActiveDays > 0
      ? Math.round((yearlyData.totalCommits / yearlyData.totalActiveDays) * 10) / 10
      : 0;

    return yearlyData;
  },
};

/**
 * Team member stats for team wrapped
 */
export interface TeamMemberStats {
  userId: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  comments: number;
  activeDays: number;
  totalActivity: number;
}

/**
 * Team wrapped data
 */
export interface TeamWrappedData {
  period: WrappedPeriod;
  teamName: string;
  memberCount: number;

  // Aggregate totals
  totalCommits: number;
  totalPrs: number;
  totalReviews: number;
  totalIssues: number;
  totalComments: number;
  totalActiveDays: number;

  // Member breakdown
  memberLeaderboard: TeamMemberStats[];

  // Specialists
  specialists: {
    mvp?: TeamMemberStats;
    commitChampion?: TeamMemberStats;
    reviewChampion?: TeamMemberStats;
    issueChampion?: TeamMemberStats;
  };

  // Activity patterns
  hourlyDistribution: HourlyDistribution[];
  dayOfWeekDistribution: DayOfWeekDistribution[];
  peakHour: number;
  peakDay: string;

  // Team personality
  teamPersonality: string;

  // Fun stats
  funStats: {
    totalLinesOfCode: number;
    mostActiveDay: string;
    lateNightCommits: number;
    weekendCommits: number;
    averageActivityPerMember: number;
  };
}
