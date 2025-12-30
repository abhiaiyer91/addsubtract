/**
 * Dashboard Command
 *
 * A unified user dashboard for managing PRs, issues, repositories,
 * and viewing contribution stats. Combines inbox functionality with
 * a comprehensive overview of user activity.
 *
 * Usage:
 *   wit dashboard              Show full dashboard
 *   wit dashboard prs          Show PRs (awaiting review, mine, participated)
 *   wit dashboard issues       Show issues (assigned, created)
 *   wit dashboard repos        Show your repositories
 *   wit dashboard activity     Show recent activity
 *   wit dashboard stats        Show contribution statistics
 *   wit dashboard summary      Show quick summary
 */

import {
  getApiClient,
  ApiError,
  type InboxPullRequest,
  type DashboardRepo,
  type ActivityFeedItem,
  type DashboardSummary,
  type ContributionStats,
} from '../api/client';
import { colors } from '../utils/colors';

export const DASHBOARD_HELP = `
wit dashboard - Your Personal Dashboard

A unified view of your PRs, issues, repositories, and contribution activity.

Usage: wit dashboard [command] [options]

Commands:
  (none)        Show full dashboard overview
  prs           Show pull requests (review, mine, participated)
  issues        Show issues (assigned, created)
  repos         Show your repositories
  activity      Show recent activity feed
  stats         Show contribution statistics
  summary       Show quick counts summary

Options:
  -h, --help    Show this help message
  --limit <n>   Limit number of results (default: 10)
  --all         Show all results (no limit)
  --json        Output as JSON

Sections:
  ${colors.yellow('Review Requested')}  PRs awaiting your review
  ${colors.cyan('Your PRs')}           Your open pull requests
  ${colors.magenta('Assigned Issues')}    Issues assigned to you
  ${colors.blue('Repositories')}       Your repositories
  ${colors.green('Activity')}           Recent contribution activity

Examples:
  wit dashboard                  Show full dashboard
  wit dashboard prs              Show all PR sections
  wit dashboard issues           Show issue sections
  wit dashboard repos            Show your repositories
  wit dashboard stats            Show contribution stats
  wit dashboard --json           Get dashboard as JSON
`;

/**
 * Parse arguments for dashboard command
 */
function parseArgs(args: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const keyMap: Record<string, string> = {
        h: 'help',
        n: 'limit',
        a: 'all',
      };
      const mappedKey = keyMap[key] || key;
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[mappedKey] = args[i + 1];
        i += 2;
      } else {
        flags[mappedKey] = true;
        i++;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { flags, positional };
}

/**
 * Format a relative time string
 */
function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return then.toLocaleDateString();
}

/**
 * Get CI status icon
 */
function getCiStatusIcon(status: string | null | undefined): string {
  switch (status) {
    case 'success':
      return colors.green('✓');
    case 'failure':
      return colors.red('✗');
    case 'pending':
      return colors.yellow('○');
    default:
      return colors.dim('·');
  }
}

/**
 * Get review status icon
 */
function getReviewStatusIcon(state: string | null | undefined): string {
  switch (state) {
    case 'approved':
      return colors.green('✓');
    case 'changes_requested':
      return colors.red('!');
    case 'commented':
      return colors.yellow('●');
    case 'pending':
      return colors.dim('○');
    default:
      return colors.dim('·');
  }
}

/**
 * Format a single PR for display
 */
function formatPr(pr: InboxPullRequest, showRepo: boolean = true): string {
  const stateIcon =
    pr.state === 'open'
      ? colors.green('●')
      : pr.state === 'merged'
        ? colors.magenta('●')
        : colors.red('●');

  const ciIcon = getCiStatusIcon(pr.ciStatus);
  const reviewIcon = getReviewStatusIcon(pr.reviewState);

  const repoName = showRepo ? colors.dim(`${pr.repo.name}`) : '';
  const authorName = pr.author?.username || pr.author?.name || 'unknown';
  const time = formatRelativeTime(pr.updatedAt);

  const labelStr = pr.labels?.length
    ? ' ' + pr.labels.map((l) => colors.cyan(`[${l.name}]`)).join(' ')
    : '';

  const draftStr = pr.isDraft ? colors.dim(' (draft)') : '';

  return `${stateIcon} ${ciIcon} ${reviewIcon} #${pr.number} ${pr.title}${draftStr}${labelStr}
   ${repoName ? repoName + ' · ' : ''}${colors.dim(authorName)} · ${colors.dim(time)}`;
}

/**
 * Format a repository for display
 */
function formatRepo(repo: DashboardRepo): string {
  const privateIcon = repo.isPrivate ? colors.yellow('🔒') : '';
  const stars = repo.starsCount > 0 ? colors.yellow(`★${repo.starsCount}`) : '';
  const time = formatRelativeTime(repo.pushedAt || repo.updatedAt);
  const prs = repo.openPrs ? colors.cyan(`${repo.openPrs} PRs`) : '';
  const issues = repo.openIssues ? colors.magenta(`${repo.openIssues} issues`) : '';

  const stats = [stars, prs, issues].filter(Boolean).join('  ');

  return `${privateIcon} ${colors.bold(repo.name)} ${stats}
   ${repo.description ? colors.dim(repo.description.slice(0, 60)) : colors.dim('No description')} · ${colors.dim(time)}`;
}

/**
 * Format activity item for display
 */
function formatActivity(activity: ActivityFeedItem): string {
  const time = formatRelativeTime(activity.createdAt);
  const repoName = activity.repoName ? colors.dim(activity.repoName) : '';
  const payload = activity.payload as Record<string, unknown> | null;

  let icon = colors.dim('●');
  let description = '';

  switch (activity.type) {
    case 'push':
      icon = colors.green('↑');
      const commits = (payload?.commits as Array<{ message: string }>) || [];
      const branch = (payload?.branch as string) || 'unknown';
      description = `Pushed ${commits.length} commit${commits.length !== 1 ? 's' : ''} to ${branch}`;
      break;
    case 'pr_opened':
      icon = colors.green('+');
      description = `Opened PR #${payload?.number}: ${payload?.title}`;
      break;
    case 'pr_merged':
      icon = colors.magenta('⇌');
      description = `Merged PR #${payload?.number}: ${payload?.title}`;
      break;
    case 'pr_closed':
      icon = colors.red('✗');
      description = `Closed PR #${payload?.number}`;
      break;
    case 'pr_review':
      icon = colors.yellow('◉');
      description = `Reviewed PR #${payload?.number}`;
      break;
    case 'pr_comment':
      icon = colors.cyan('💬');
      description = `Commented on PR #${payload?.number}`;
      break;
    case 'issue_opened':
      icon = colors.green('+');
      description = `Opened issue #${payload?.number}: ${payload?.title}`;
      break;
    case 'issue_closed':
      icon = colors.red('✓');
      description = `Closed issue #${payload?.number}`;
      break;
    case 'issue_comment':
      icon = colors.cyan('💬');
      description = `Commented on issue #${payload?.number}`;
      break;
    case 'repo_created':
      icon = colors.green('✦');
      description = 'Created repository';
      break;
    case 'repo_forked':
      icon = colors.blue('⑂');
      description = `Forked from ${payload?.forkedFromName}`;
      break;
    case 'repo_starred':
      icon = colors.yellow('★');
      description = `Starred ${payload?.repoName}`;
      break;
    default:
      description = activity.type.replace(/_/g, ' ');
  }

  return `${icon} ${description}
   ${repoName ? repoName + ' · ' : ''}${colors.dim(time)}`;
}

/**
 * Render contribution heatmap in terminal
 */
function renderHeatmap(stats: ContributionStats): void {
  console.log();
  console.log(colors.bold('  Contribution Activity'));
  console.log(colors.dim('  ' + '─'.repeat(50)));
  console.log();

  // Get last 20 weeks for terminal display
  const calendar = stats.contributionCalendar.slice(-140); // Last 20 weeks
  const weeks: string[][] = [];
  
  for (let i = 0; i < calendar.length; i += 7) {
    const week = calendar.slice(i, i + 7);
    weeks.push(week.map(d => {
      switch (d.level) {
        case 0: return colors.dim('░');
        case 1: return colors.green('░');
        case 2: return colors.green('▒');
        case 3: return colors.green('▓');
        case 4: return colors.green('█');
        default: return colors.dim('░');
      }
    }));
  }

  // Render rows (days of week)
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  for (let d = 0; d < 7; d++) {
    let row = `  ${colors.dim(days[d])} `;
    for (const week of weeks) {
      row += week[d] || ' ';
    }
    console.log(row);
  }

  console.log();
  console.log(`  ${colors.dim('░')} Less  ${colors.green('░')}${colors.green('▒')}${colors.green('▓')}${colors.green('█')} More`);
  console.log();

  // Stats summary
  const streakIcon = stats.streak.current > 0 ? colors.green('🔥') : '';
  console.log(`  ${colors.bold(stats.totalCommits.toString())} commits  ·  ${colors.bold(stats.totalPullRequestsMerged.toString())} PRs merged  ·  ${streakIcon} ${stats.streak.current}-day streak`);
  console.log();
}

/**
 * Main handler for dashboard command
 */
export async function handleDashboard(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);

  if (flags.help) {
    console.log(DASHBOARD_HELP);
    return;
  }

  const subcommand = positional[0];
  const limit = flags.all ? 100 : parseInt(flags.limit as string, 10) || 10;

  try {
    const api = getApiClient();

    switch (subcommand) {
      case 'prs':
        await showPrs(api, { limit, json: !!flags.json });
        break;
      case 'issues':
        await showIssues(api, { limit, json: !!flags.json });
        break;
      case 'repos':
        await showRepos(api, { limit, json: !!flags.json });
        break;
      case 'activity':
        await showActivity(api, { limit, json: !!flags.json });
        break;
      case 'stats':
        await showStats(api, { json: !!flags.json });
        break;
      case 'summary':
        await showSummary(api, { json: !!flags.json });
        break;
      default:
        // Show full dashboard
        await showFullDashboard(api, { limit, json: !!flags.json });
    }
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(colors.red('error: ') + error.message);
      if (error.status === 0) {
        console.error(colors.dim('hint: Start the server with: wit serve'));
        console.error(colors.dim('      Or authenticate with: wit github login'));
      }
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Show full dashboard
 */
async function showFullDashboard(
  api: ReturnType<typeof getApiClient>,
  options: { limit: number; json: boolean }
): Promise<void> {
  // Fetch dashboard data
  const data = await api.dashboard.getData({
    includeCalendar: true,
    repoLimit: 5,
    activityLimit: 5,
  });

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Header
  console.log();
  console.log(colors.bold('  Dashboard'));
  console.log(colors.dim('  ─'.repeat(30)));
  console.log();

  // Summary badges
  const { inbox } = data.summary;
  const reviewBadge =
    inbox.prsAwaitingReview > 0
      ? colors.yellow(` ${inbox.prsAwaitingReview} `)
      : colors.dim(' 0 ');
  const myPrsBadge =
    inbox.myOpenPrs > 0
      ? colors.cyan(` ${inbox.myOpenPrs} `)
      : colors.dim(' 0 ');
  const issuesBadge =
    inbox.issuesAssigned > 0
      ? colors.magenta(` ${inbox.issuesAssigned} `)
      : colors.dim(' 0 ');

  console.log(
    `  ${colors.yellow('Review')}${reviewBadge}  ${colors.cyan('PRs')}${myPrsBadge}  ${colors.magenta('Issues')}${issuesBadge}  ${colors.blue('Repos')} ${colors.dim(data.repos.length.toString())}`
  );

  // Trend indicator
  const trendIcon =
    data.summary.contributionTrend === 'up'
      ? colors.green('↑')
      : data.summary.contributionTrend === 'down'
        ? colors.red('↓')
        : colors.dim('→');
  console.log(
    colors.dim(`  ${data.summary.thisWeekContributions} contributions this week ${trendIcon}`)
  );
  console.log();

  // Contribution heatmap (if available)
  if (data.contributionStats) {
    renderHeatmap(data.contributionStats);
  }

  // PRs awaiting review
  const awaitingReview = await api.dashboard.getPrsAwaitingReview({ limit: 3 });
  if (awaitingReview.length > 0) {
    console.log(
      colors.yellow(colors.bold(`  Review Requested (${inbox.prsAwaitingReview})`))
    );
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const pr of awaitingReview) {
      console.log('  ' + formatPr(pr).split('\n').join('\n  '));
    }
    if (inbox.prsAwaitingReview > 3) {
      console.log(
        colors.dim(`  ... and ${inbox.prsAwaitingReview - 3} more (wit dashboard prs)`)
      );
    }
    console.log();
  }

  // Your PRs
  const myPrs = await api.dashboard.getMyOpenPrs({ limit: 3 });
  if (myPrs.length > 0) {
    console.log(colors.cyan(colors.bold(`  Your PRs (${inbox.myOpenPrs})`)));
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const pr of myPrs) {
      console.log('  ' + formatPr(pr, false).split('\n').join('\n  '));
    }
    if (inbox.myOpenPrs > 3) {
      console.log(
        colors.dim(`  ... and ${inbox.myOpenPrs - 3} more (wit dashboard prs)`)
      );
    }
    console.log();
  }

  // Repositories
  if (data.repos.length > 0) {
    console.log(colors.blue(colors.bold(`  Your Repositories`)));
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const repo of data.repos.slice(0, 3)) {
      console.log('  ' + formatRepo(repo).split('\n').join('\n  '));
    }
    if (data.repos.length > 3) {
      console.log(
        colors.dim(`  ... and more (wit dashboard repos)`)
      );
    }
    console.log();
  }

  // Recent Activity
  if (data.activity.length > 0) {
    console.log(colors.green(colors.bold(`  Recent Activity`)));
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const activity of data.activity.slice(0, 3)) {
      console.log('  ' + formatActivity(activity).split('\n').join('\n  '));
    }
    if (data.activity.length > 3) {
      console.log(
        colors.dim(`  ... and more (wit dashboard activity)`)
      );
    }
    console.log();
  }

  // Footer
  console.log(colors.dim('  ─'.repeat(30)));
  console.log(
    colors.dim('  Tip: Use ') +
      'wit dashboard prs' +
      colors.dim(' to see all PR sections')
  );
  console.log();
}

/**
 * Show PR sections
 */
async function showPrs(
  api: ReturnType<typeof getApiClient>,
  options: { limit: number; json: boolean }
): Promise<void> {
  const [summary, awaitingReview, myPrs, participated] = await Promise.all([
    api.dashboard.getSummary(),
    api.dashboard.getPrsAwaitingReview({ limit: options.limit }),
    api.dashboard.getMyOpenPrs({ limit: options.limit }),
    api.inbox.participated({ limit: options.limit }),
  ]);

  if (options.json) {
    console.log(JSON.stringify({ summary: summary.inbox, awaitingReview, myPrs, participated }, null, 2));
    return;
  }

  console.log();
  console.log(colors.bold('  Pull Requests'));
  console.log(colors.dim('  ─'.repeat(30)));
  console.log();

  // Review Requested
  if (awaitingReview.length > 0) {
    console.log(
      colors.yellow(colors.bold(`  Review Requested (${summary.inbox.prsAwaitingReview})`))
    );
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const pr of awaitingReview) {
      console.log('  ' + formatPr(pr).split('\n').join('\n  '));
      console.log();
    }
  }

  // Your PRs
  if (myPrs.length > 0) {
    console.log(colors.cyan(colors.bold(`  Your PRs (${summary.inbox.myOpenPrs})`)));
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const pr of myPrs) {
      console.log('  ' + formatPr(pr, false).split('\n').join('\n  '));
      console.log();
    }
  }

  // Participated
  if (participated.length > 0) {
    console.log(colors.magenta(colors.bold(`  Participated (${summary.inbox.prsParticipated})`)));
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const pr of participated) {
      console.log('  ' + formatPr(pr).split('\n').join('\n  '));
      console.log();
    }
  }

  if (awaitingReview.length === 0 && myPrs.length === 0 && participated.length === 0) {
    console.log(colors.dim('  No pull requests to show.'));
    console.log(colors.dim('  Create a PR with: wit pr create'));
    console.log();
  }
}

/**
 * Show issue sections
 */
async function showIssues(
  api: ReturnType<typeof getApiClient>,
  options: { limit: number; json: boolean }
): Promise<void> {
  const [summary, assigned] = await Promise.all([
    api.dashboard.getSummary(),
    api.dashboard.getAssignedIssues({ limit: options.limit }),
  ]);

  if (options.json) {
    console.log(JSON.stringify({ summary: summary.inbox, assigned }, null, 2));
    return;
  }

  console.log();
  console.log(colors.bold('  Issues'));
  console.log(colors.dim('  ─'.repeat(30)));
  console.log();

  // Assigned issues
  if (assigned.length > 0) {
    console.log(
      colors.magenta(colors.bold(`  Assigned to You (${summary.inbox.issuesAssigned})`))
    );
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const issue of assigned) {
      const priorityIcon = getPriorityIcon(issue.priority);
      const time = formatRelativeTime(issue.updatedAt);
      console.log(
        `  ${colors.green('●')} ${priorityIcon} #${issue.number} ${issue.title}`
      );
      console.log(`   ${colors.dim(issue.repoName || '')} · ${colors.dim(time)}`);
      console.log();
    }
  } else {
    console.log(colors.dim('  No issues assigned to you.'));
    console.log();
  }

  // Summary counts
  console.log(
    `  ${colors.cyan('●')} Issues you created: ${colors.bold(summary.inbox.issuesCreated.toString())}`
  );
  console.log(
    `  ${colors.yellow('●')} Issues you participated in: ${colors.bold(summary.inbox.issuesParticipated.toString())}`
  );
  console.log();
}

/**
 * Get priority icon
 */
function getPriorityIcon(priority?: string): string {
  switch (priority) {
    case 'urgent':
      return colors.red('⚡');
    case 'high':
      return colors.yellow('↑');
    case 'medium':
      return colors.blue('●');
    case 'low':
      return colors.dim('↓');
    default:
      return colors.dim('·');
  }
}

/**
 * Show repositories
 */
async function showRepos(
  api: ReturnType<typeof getApiClient>,
  options: { limit: number; json: boolean }
): Promise<void> {
  const repos = await api.dashboard.getRepositories(options.limit);

  if (options.json) {
    console.log(JSON.stringify(repos, null, 2));
    return;
  }

  console.log();
  console.log(colors.bold('  Your Repositories'));
  console.log(colors.dim('  ─'.repeat(30)));
  console.log();

  if (repos.length === 0) {
    console.log(colors.dim('  No repositories found.'));
    console.log(colors.dim('  Create one with: wit init'));
    console.log();
    return;
  }

  for (const repo of repos) {
    console.log('  ' + formatRepo(repo).split('\n').join('\n  '));
    console.log();
  }
}

/**
 * Show activity feed
 */
async function showActivity(
  api: ReturnType<typeof getApiClient>,
  options: { limit: number; json: boolean }
): Promise<void> {
  const activity = await api.dashboard.getActivityFeed(options.limit);

  if (options.json) {
    console.log(JSON.stringify(activity, null, 2));
    return;
  }

  console.log();
  console.log(colors.bold('  Recent Activity'));
  console.log(colors.dim('  ─'.repeat(30)));
  console.log();

  if (activity.length === 0) {
    console.log(colors.dim('  No recent activity.'));
    console.log();
    return;
  }

  for (const item of activity) {
    console.log('  ' + formatActivity(item).split('\n').join('\n  '));
    console.log();
  }
}

/**
 * Show contribution statistics
 */
async function showStats(
  api: ReturnType<typeof getApiClient>,
  options: { json: boolean }
): Promise<void> {
  const stats = await api.dashboard.getContributionStats();

  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log();
  console.log(colors.bold('  Contribution Statistics'));
  console.log(colors.dim('  ─'.repeat(30)));
  console.log();

  // Render heatmap
  renderHeatmap(stats);

  // Detailed stats
  console.log(colors.bold('  Overview'));
  console.log(colors.dim('  ' + '─'.repeat(40)));
  console.log(`  ${colors.cyan('Commits:')}          ${colors.bold(stats.totalCommits.toString())}`);
  console.log(`  ${colors.green('Pull Requests:')}   ${colors.bold(stats.totalPullRequests.toString())} (${stats.totalPullRequestsMerged} merged)`);
  console.log(`  ${colors.magenta('Issues:')}          ${colors.bold(stats.totalIssues.toString())} (${stats.totalIssuesClosed} closed)`);
  console.log(`  ${colors.yellow('Reviews:')}         ${colors.bold(stats.totalReviews.toString())}`);
  console.log(`  ${colors.blue('Comments:')}        ${colors.bold(stats.totalComments.toString())}`);
  console.log();

  // Streak info
  console.log(colors.bold('  Streaks'));
  console.log(colors.dim('  ' + '─'.repeat(40)));
  console.log(`  ${colors.green('Current streak:')}  ${colors.bold(stats.streak.current.toString())} days`);
  console.log(`  ${colors.yellow('Longest streak:')} ${colors.bold(stats.streak.longest.toString())} days`);
  if (stats.streak.lastContributionDate) {
    console.log(`  ${colors.dim('Last activity:')}   ${stats.streak.lastContributionDate}`);
  }
  console.log();

  // Day of week breakdown
  console.log(colors.bold('  Activity by Day'));
  console.log(colors.dim('  ' + '─'.repeat(40)));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxDayActivity = Math.max(...stats.contributionsByDayOfWeek);
  for (let i = 0; i < 7; i++) {
    const count = stats.contributionsByDayOfWeek[i];
    const barLen = maxDayActivity > 0 ? Math.round((count / maxDayActivity) * 20) : 0;
    const bar = colors.green('█'.repeat(barLen)) + colors.dim('░'.repeat(20 - barLen));
    console.log(`  ${days[i]}  ${bar}  ${count}`);
  }
  console.log();
}

/**
 * Show summary counts
 */
async function showSummary(
  api: ReturnType<typeof getApiClient>,
  options: { json: boolean }
): Promise<void> {
  const summary = await api.dashboard.getSummary();

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log();
  console.log(colors.bold('  Dashboard Summary'));
  console.log(colors.dim('  ─'.repeat(30)));
  console.log();

  // PR counts
  console.log(
    `  ${colors.yellow('●')} PRs awaiting review:  ${colors.bold(summary.inbox.prsAwaitingReview.toString())}`
  );
  console.log(
    `  ${colors.cyan('●')} Your open PRs:        ${colors.bold(summary.inbox.myOpenPrs.toString())}`
  );
  console.log(
    `  ${colors.magenta('●')} PRs participated:     ${colors.bold(summary.inbox.prsParticipated.toString())}`
  );
  console.log();

  // Issue counts
  console.log(
    `  ${colors.red('●')} Issues assigned:      ${colors.bold(summary.inbox.issuesAssigned.toString())}`
  );
  console.log(
    `  ${colors.blue('●')} Issues created:       ${colors.bold(summary.inbox.issuesCreated.toString())}`
  );
  console.log();

  // Activity stats
  console.log(
    `  ${colors.green('●')} Recent activity:      ${colors.bold(summary.recentActivity.toString())} (7 days)`
  );
  console.log(
    `  ${colors.dim('●')} Active repos:         ${colors.bold(summary.activeRepos.toString())} (30 days)`
  );
  console.log();

  // Trend
  const trendIcon =
    summary.contributionTrend === 'up'
      ? colors.green('↑ Up')
      : summary.contributionTrend === 'down'
        ? colors.red('↓ Down')
        : colors.dim('→ Stable');
  console.log(
    `  This week: ${summary.thisWeekContributions}  Last week: ${summary.lastWeekContributions}  Trend: ${trendIcon}`
  );
  console.log();

  // Action suggestion
  if (summary.inbox.prsAwaitingReview > 0) {
    console.log(
      colors.dim('  ') +
        colors.yellow('→') +
        ` ${summary.inbox.prsAwaitingReview} PRs awaiting your review`
    );
  } else {
    console.log(colors.dim('  ') + colors.green('✓') + ' No pending reviews');
  }
  console.log();
}
