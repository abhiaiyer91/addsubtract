/**
 * Wrapped Command
 * Monthly activity insights - your coding Wrapped!
 * 
 * Shows a beautiful summary of your monthly activity including:
 * - Commits, PRs, reviews, issues
 * - Activity patterns (most active hour, day)
 * - Top repositories
 * - Streaks
 * - Personality type based on coding patterns
 */

import { TsgitError, ErrorCode } from '../core/errors';
import { wrappedModel, type WrappedData } from '../db/models/wrapped';
import { createClient } from '../api/trpc';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  bgBlue: (s: string) => `\x1b[44m${s}\x1b[0m`,
  bgMagenta: (s: string) => `\x1b[45m${s}\x1b[0m`,
  bgCyan: (s: string) => `\x1b[46m${s}\x1b[0m`,
};

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Personality type emojis
const PERSONALITY_EMOJIS: Record<string, string> = {
  'Night Owl': '🦉',
  'Early Bird': '🐦',
  'Weekend Warrior': '⚔️',
  'Nine-to-Fiver': '💼',
  'Code Ninja': '🥷',
  'Steady Coder': '⚡',
  'Ghost Developer': '👻',
};

/**
 * Create a horizontal bar
 */
function createBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Create a mini heatmap for daily activity
 */
function createMiniHeatmap(data: WrappedData): string {
  // Group into weeks (7 days each)
  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  
  for (const day of data.dailyActivity) {
    // Determine intensity level (0-4)
    let level = 0;
    if (day.total > 0) level = 1;
    if (day.total >= 3) level = 2;
    if (day.total >= 5) level = 3;
    if (day.total >= 10) level = 4;
    
    const chars = [' ', '░', '▒', '▓', '█'];
    currentWeek.push(chars[level]);
    
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }
  
  // Build heatmap string
  let heatmap = '';
  for (const week of weeks.slice(-5)) { // Last 5 weeks
    heatmap += colors.green(week.join('')) + ' ';
  }
  
  return heatmap.trim();
}

/**
 * Create hourly activity sparkline
 */
function createHourlySparkline(data: WrappedData): string {
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...data.hourlyDistribution.map(h => h.count), 1);
  
  let sparkline = '';
  for (const hour of data.hourlyDistribution) {
    const level = Math.floor((hour.count / max) * 7);
    sparkline += colors.cyan(chars[level]);
  }
  
  return sparkline;
}

/**
 * Format large numbers with K/M suffix
 */
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

/**
 * Print the wrapped summary
 */
function printWrapped(data: WrappedData): void {
  const monthName = MONTH_NAMES[data.period.month - 1];
  const personalityEmoji = PERSONALITY_EMOJIS[data.funStats.personalityType] || '💻';
  
  // Header
  console.log();
  console.log(colors.bold('╔═══════════════════════════════════════════════════════════════╗'));
  console.log(colors.bold(`║   ${colors.bgMagenta(' wit wrapped ')} - ${monthName} ${data.period.year}                         ║`));
  console.log(colors.bold('╚═══════════════════════════════════════════════════════════════╝'));
  console.log();
  
  // User info & personality
  console.log(colors.cyan(`  @${data.username}`) + colors.dim(` - ${data.name || 'Anonymous Coder'}`));
  console.log();
  console.log(colors.bold('  Your coding personality: ') + `${personalityEmoji} ${colors.magenta(data.funStats.personalityType)}`);
  console.log();
  
  // Main stats with big numbers
  console.log(colors.bold('  ══════════════════════════════════════════════════════════'));
  console.log();
  
  // Row 1: Commits & PRs
  console.log(
    `  ${colors.bold(colors.green(formatNumber(data.totalCommits)))} commits` +
    `    ${colors.bold(colors.blue(formatNumber(data.totalPrsOpened)))} PRs opened` +
    `    ${colors.bold(colors.magenta(formatNumber(data.totalPrsMerged)))} merged`
  );
  
  // Row 2: Reviews & Issues  
  console.log(
    `  ${colors.bold(colors.cyan(formatNumber(data.totalReviews)))} reviews` +
    `     ${colors.bold(colors.yellow(formatNumber(data.totalIssuesOpened)))} issues opened` +
    `  ${colors.bold(colors.green(formatNumber(data.totalIssuesClosed)))} closed`
  );
  
  // Row 3: Comments & Stars
  console.log(
    `  ${colors.bold(colors.dim(formatNumber(data.totalComments)))} comments` +
    `   ${colors.bold(colors.yellow('★ ' + formatNumber(data.totalStarsGiven)))} stars given`
  );
  
  console.log();
  
  // Activity heatmap
  console.log(colors.bold('  Activity this month:'));
  console.log(`  ${createMiniHeatmap(data)}`);
  console.log(colors.dim('  ' + 'S M T W T F S '.repeat(Math.min(5, Math.ceil(data.dailyActivity.length / 7)))));
  console.log();
  
  // Hourly distribution
  console.log(colors.bold('  Coding hours (24h):'));
  console.log(`  ${createHourlySparkline(data)}`);
  console.log(colors.dim('  0         6        12        18      23'));
  console.log();
  
  // Streaks
  if (data.streaks.longestStreak > 0) {
    console.log(colors.bold('  Streaks:'));
    console.log(`  🔥 Longest streak: ${colors.yellow(data.streaks.longestStreak.toString())} days`);
    if (data.streaks.currentStreak > 0) {
      console.log(`  📆 Current streak: ${colors.green(data.streaks.currentStreak.toString())} days`);
    }
    console.log();
  }
  
  // Fun stats
  console.log(colors.bold('  Fun facts:'));
  console.log(`  ⏰ Most active at ${colors.cyan(data.funStats.mostActiveHourLabel)}`);
  console.log(`  📅 Favorite day: ${colors.cyan(data.funStats.mostActiveDay)}`);
  
  if (data.funStats.lateNightCommits > 0) {
    console.log(`  🌙 Late night commits: ${colors.magenta(data.funStats.lateNightCommits.toString())} (10pm-4am)`);
  }
  
  if (data.funStats.weekendWarriorCommits > 0) {
    console.log(`  🏠 Weekend commits: ${colors.blue(data.funStats.weekendWarriorCommits.toString())}`);
  }
  
  console.log();
  
  // Top repositories
  if (data.topRepositories.length > 0) {
    console.log(colors.bold('  Top repositories:'));
    for (const repo of data.topRepositories.slice(0, 3)) {
      const bar = createBar((repo.activityCount / data.topRepositories[0].activityCount) * 100, 15);
      console.log(`  ${colors.green(bar)} ${repo.repoName} ${colors.dim(`(${repo.activityCount} activities)`)}`);
    }
    console.log();
  }
  
  // Activity breakdown
  if (data.activityBreakdown.length > 0) {
    console.log(colors.bold('  Activity breakdown:'));
    const typeLabels: Record<string, string> = {
      'push': '📤 Pushes',
      'pr_opened': '🔀 PRs Opened',
      'pr_merged': '✅ PRs Merged',
      'pr_closed': '❌ PRs Closed',
      'pr_review': '👀 Reviews',
      'pr_comment': '💬 PR Comments',
      'issue_opened': '🎫 Issues Opened',
      'issue_closed': '✓ Issues Closed',
      'issue_comment': '💬 Issue Comments',
      'repo_starred': '⭐ Stars Given',
      'repo_created': '📁 Repos Created',
    };
    
    for (const activity of data.activityBreakdown.slice(0, 5)) {
      const label = typeLabels[activity.type] || activity.type;
      const bar = createBar(activity.percentage, 10);
      console.log(`  ${bar} ${label.padEnd(18)} ${colors.dim(`${activity.percentage}%`)}`);
    }
    console.log();
  }
  
  // AI usage if available
  if (data.aiUsage && data.aiUsage.agentSessions > 0) {
    console.log(colors.bold('  AI Assistant usage:'));
    console.log(`  🤖 ${colors.cyan(data.aiUsage.agentSessions.toString())} agent sessions`);
    console.log(`  💬 ${colors.cyan(data.aiUsage.totalMessages.toString())} messages exchanged`);
    console.log(`  🔢 ${colors.dim(formatNumber(data.aiUsage.totalTokens) + ' tokens used')}`);
    console.log();
  }
  
  // CI stats if available
  if (data.ciStats && data.ciStats.totalRuns > 0) {
    console.log(colors.bold('  CI/CD:'));
    const successBar = createBar(data.ciStats.successRate, 10);
    console.log(`  ${colors.green(successBar)} ${data.ciStats.successRate.toFixed(0)}% success rate`);
    console.log(`  🏃 ${colors.cyan(data.ciStats.totalRuns.toString())} workflow runs`);
    if (data.ciStats.failedRuns > 0) {
      console.log(`  💥 ${colors.red(data.ciStats.failedRuns.toString())} failed runs`);
    }
    console.log();
  }
  
  // Summary metrics
  console.log(colors.bold('  ══════════════════════════════════════════════════════════'));
  console.log();
  console.log(`  ${colors.green(data.totalActiveDays.toString())} active days this month`);
  console.log(`  ${colors.cyan(data.avgCommitsPerActiveDay.toString())} avg commits per active day`);
  console.log();
  
  // Footer
  console.log(colors.dim('  ─────────────────────────────────────────────────────────────'));
  console.log(colors.dim(`  Generated by wit wrapped | ${new Date().toLocaleDateString()}`));
  console.log();
}

/**
 * Print list of available periods
 */
function printAvailablePeriods(periods: { year: number; month: number }[]): void {
  console.log();
  console.log(colors.bold('📅 Available Wrapped periods:'));
  console.log();
  
  if (periods.length === 0) {
    console.log(colors.dim('  No activity data found.'));
    console.log(colors.dim('  Start using wit to build your wrapped!'));
  } else {
    // Group by year
    const byYear = new Map<number, number[]>();
    for (const p of periods) {
      if (!byYear.has(p.year)) byYear.set(p.year, []);
      byYear.get(p.year)!.push(p.month);
    }
    
    for (const [year, months] of byYear) {
      console.log(colors.cyan(`  ${year}:`));
      for (const month of months.sort((a, b) => b - a)) {
        console.log(`    ${MONTH_NAMES[month - 1]} ${colors.dim(`(wit wrapped ${year} ${month})`)}`);
      }
    }
  }
  
  console.log();
}

/**
 * CLI handler for wrapped
 */
export async function handleWrapped(args: string[]): Promise<void> {
  // Get user ID from environment or try to detect from auth
  const userId = process.env.WIT_USER_ID;
  
  if (!userId) {
    throw new TsgitError(
      'Not authenticated. Run `wit up` to start the platform and log in.',
      ErrorCode.OPERATION_FAILED,
      ['Run `wit up` to start the platform', 'Log in with `wit token create`']
    );
  }
  
  // Parse arguments
  let year: number | undefined;
  let month: number | undefined;
  let showList = false;
  let showPrevious = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--list' || arg === '-l') {
      showList = true;
    } else if (arg === '--previous' || arg === '-p') {
      showPrevious = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    } else if (!isNaN(parseInt(arg))) {
      const num = parseInt(arg);
      if (num > 12) {
        year = num;
      } else {
        if (year === undefined) {
          // First number could be year or month
          if (num > 2000) {
            year = num;
          } else {
            month = num;
          }
        } else {
          month = num;
        }
      }
    }
  }
  
  try {
    // Show available periods
    if (showList) {
      const periods = await wrappedModel.getAvailablePeriods(userId);
      printAvailablePeriods(periods);
      return;
    }
    
    // Get wrapped data
    let data: WrappedData | null;
    
    if (showPrevious) {
      data = await wrappedModel.getPreviousMonth(userId);
    } else if (year && month) {
      data = await wrappedModel.getForUser(userId, year, month);
    } else if (year && !month) {
      // If only year provided, assume current month of that year
      const now = new Date();
      month = now.getMonth() + 1;
      data = await wrappedModel.getForUser(userId, year, month);
    } else {
      // Default to current month
      data = await wrappedModel.getCurrentMonth(userId);
    }
    
    if (!data) {
      const periodStr = year && month 
        ? `${MONTH_NAMES[month - 1]} ${year}`
        : 'this period';
      
      console.log();
      console.log(colors.yellow(`  No activity data found for ${periodStr}.`));
      console.log();
      console.log(colors.dim('  Tips:'));
      console.log(colors.dim('    - Use wit to track your coding activity'));
      console.log(colors.dim('    - Try `wit wrapped --list` to see available periods'));
      console.log(colors.dim('    - Try `wit wrapped --previous` for last month'));
      console.log();
      return;
    }
    
    printWrapped(data);
    
  } catch (error) {
    if (error instanceof TsgitError) {
      throw error;
    }
    throw new TsgitError(
      `Failed to generate wrapped: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ErrorCode.OPERATION_FAILED
    );
  }
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
${colors.bold('wit wrapped')} - Your monthly coding activity summary

${colors.cyan('USAGE')}
  wit wrapped [options] [year] [month]

${colors.cyan('OPTIONS')}
  -l, --list       List available wrapped periods
  -p, --previous   Show previous month's wrapped
  -h, --help       Show this help message

${colors.cyan('EXAMPLES')}
  wit wrapped                 Show current month's wrapped
  wit wrapped --previous      Show last month's wrapped  
  wit wrapped 2024 11         Show November 2024 wrapped
  wit wrapped --list          List all available periods

${colors.cyan('DESCRIPTION')}
  Wrapped gives you a Spotify Wrapped-style summary of your
  coding activity for any month. It shows:
  
  - Total commits, PRs, reviews, and issues
  - Your coding personality type (Night Owl, Early Bird, etc.)
  - Activity heatmap and hourly patterns
  - Longest and current streaks
  - Top repositories you contributed to
  - Fun stats like late night commits
  - AI assistant usage (if enabled)
  - CI/CD pipeline statistics
`);
}
