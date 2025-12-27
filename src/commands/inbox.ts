/**
 * Inbox Command
 *
 * A Graphite-style PR inbox for staying on top of code reviews.
 * Shows PRs awaiting your review, your open PRs, and PRs you've participated in.
 *
 * Usage:
 *   wit inbox              Show inbox summary and quick view
 *   wit inbox review       Show PRs awaiting your review
 *   wit inbox mine         Show your open PRs
 *   wit inbox participated Show PRs you've commented/reviewed
 *   wit inbox summary      Show counts for each section
 */

import { getApiClient, ApiError, getServerUrl, type InboxPullRequest } from '../api/client';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41m${s}\x1b[0m`,
  bgGreen: (s: string) => `\x1b[42m${s}\x1b[0m`,
  bgYellow: (s: string) => `\x1b[43m${s}\x1b[0m`,
};

export const INBOX_HELP = `
wit inbox - PR Inbox (Graphite-style)

Stay on top of every PR and review request in one unified inbox.

Usage: wit inbox [command] [options]

Commands:
  (none)        Show full inbox with all sections
  review        Show PRs awaiting your review
  mine          Show your open PRs
  participated  Show PRs you've participated in
  summary       Show counts for each section

Options:
  -h, --help    Show this help message
  --limit <n>   Limit number of results (default: 10)
  --all         Show all results (no limit)
  --json        Output as JSON

Sections:
  ${colors.yellow('Review Requested')}  PRs where you've been asked to review
  ${colors.cyan('Your PRs')}           Your open PRs (awaiting reviews or ready to merge)
  ${colors.magenta('Participated')}       PRs you've commented on or reviewed

Examples:
  wit inbox                  Show full inbox
  wit inbox review           Show PRs needing your review
  wit inbox mine             Show your open PRs
  wit inbox summary          Quick count of each section
  wit inbox --json           Get inbox as JSON
`;

/**
 * Parse arguments for inbox command
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

  // Build labels string
  const labelStr = pr.labels?.length
    ? ' ' + pr.labels.map((l) => colors.cyan(`[${l.name}]`)).join(' ')
    : '';

  // Draft indicator
  const draftStr = pr.isDraft ? colors.dim(' (draft)') : '';

  return `${stateIcon} ${ciIcon} ${reviewIcon} #${pr.number} ${pr.title}${draftStr}${labelStr}
   ${repoName ? repoName + ' · ' : ''}${colors.dim(authorName)} · ${colors.dim(time)}`;
}

/**
 * Main handler for inbox command
 */
export async function handleInbox(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);

  if (flags.help) {
    console.log(INBOX_HELP);
    return;
  }

  const subcommand = positional[0];
  const limit = flags.all ? 100 : parseInt(flags.limit as string, 10) || 10;

  try {
    const api = getApiClient();

    switch (subcommand) {
      case 'review':
        await showAwaitingReview(api, { limit, json: !!flags.json });
        break;
      case 'mine':
        await showMyPrs(api, { limit, json: !!flags.json });
        break;
      case 'participated':
        await showParticipated(api, { limit, json: !!flags.json });
        break;
      case 'summary':
        await showSummary(api, { json: !!flags.json });
        break;
      default:
        // Show full inbox
        await showFullInbox(api, { limit, json: !!flags.json });
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
 * Show full inbox with all sections
 */
async function showFullInbox(
  api: ReturnType<typeof getApiClient>,
  options: { limit: number; json: boolean }
): Promise<void> {
  // Fetch all sections in parallel
  const [summary, awaitingReview, myPrs, participated] = await Promise.all([
    api.inbox.summary(),
    api.inbox.awaitingReview({ limit: options.limit }),
    api.inbox.myPrs({ limit: options.limit }),
    api.inbox.participated({ limit: options.limit }),
  ]);

  if (options.json) {
    console.log(
      JSON.stringify({ summary, awaitingReview, myPrs, participated }, null, 2)
    );
    return;
  }

  // Header
  console.log();
  console.log(colors.bold('  PR Inbox'));
  console.log(colors.dim('  ─'.repeat(30)));
  console.log();

  // Summary bar
  const reviewBadge =
    summary.awaitingReview > 0
      ? colors.yellow(` ${summary.awaitingReview} `)
      : colors.dim(' 0 ');
  const myPrsBadge =
    summary.myPrsOpen > 0
      ? colors.cyan(` ${summary.myPrsOpen} `)
      : colors.dim(' 0 ');
  const participatedBadge =
    summary.participated > 0
      ? colors.magenta(` ${summary.participated} `)
      : colors.dim(' 0 ');

  console.log(
    `  ${colors.yellow('Review')}${reviewBadge}  ${colors.cyan('Mine')}${myPrsBadge}  ${colors.magenta('Participated')}${participatedBadge}`
  );
  console.log();

  // Review Requested section
  if (awaitingReview.length > 0) {
    console.log(
      colors.yellow(colors.bold(`  Review Requested (${summary.awaitingReview})`))
    );
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const pr of awaitingReview.slice(0, 5)) {
      console.log('  ' + formatPr(pr).split('\n').join('\n  '));
    }
    if (summary.awaitingReview > 5) {
      console.log(
        colors.dim(`  ... and ${summary.awaitingReview - 5} more (wit inbox review)`)
      );
    }
    console.log();
  }

  // Your PRs section
  if (myPrs.length > 0) {
    console.log(colors.cyan(colors.bold(`  Your PRs (${summary.myPrsOpen})`)));
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const pr of myPrs.slice(0, 5)) {
      console.log('  ' + formatPr(pr, false).split('\n').join('\n  '));
    }
    if (summary.myPrsOpen > 5) {
      console.log(
        colors.dim(`  ... and ${summary.myPrsOpen - 5} more (wit inbox mine)`)
      );
    }
    console.log();
  }

  // Participated section
  if (participated.length > 0) {
    console.log(colors.magenta(colors.bold(`  Participated (${summary.participated})`)));
    console.log(colors.dim('  ' + '─'.repeat(40)));
    for (const pr of participated.slice(0, 5)) {
      console.log('  ' + formatPr(pr).split('\n').join('\n  '));
    }
    if (summary.participated > 5) {
      console.log(
        colors.dim(`  ... and ${summary.participated - 5} more (wit inbox participated)`)
      );
    }
    console.log();
  }

  // Empty state
  if (
    awaitingReview.length === 0 &&
    myPrs.length === 0 &&
    participated.length === 0
  ) {
    console.log(colors.dim('  No pull requests to show.'));
    console.log(colors.dim('  Create a PR with: wit pr create'));
    console.log();
  }

  // Footer with tips
  console.log(colors.dim('  ─'.repeat(30)));
  console.log(
    colors.dim('  Tip: Use ') +
      'wit inbox review' +
      colors.dim(' to focus on PRs needing your review')
  );
  console.log();
}

/**
 * Show PRs awaiting review
 */
async function showAwaitingReview(
  api: ReturnType<typeof getApiClient>,
  options: { limit: number; json: boolean }
): Promise<void> {
  const prs = await api.inbox.awaitingReview({ limit: options.limit });

  if (options.json) {
    console.log(JSON.stringify(prs, null, 2));
    return;
  }

  console.log();
  console.log(colors.yellow(colors.bold('  Review Requested')));
  console.log(colors.dim('  PRs waiting for your review'));
  console.log(colors.dim('  ' + '─'.repeat(40)));
  console.log();

  if (prs.length === 0) {
    console.log(colors.green('  ✓ No PRs waiting for your review!'));
    console.log(colors.dim('  You\'re all caught up.'));
    console.log();
    return;
  }

  for (const pr of prs) {
    console.log('  ' + formatPr(pr).split('\n').join('\n  '));
    console.log();
  }

  console.log(colors.dim('  ─'.repeat(40)));
  console.log(
    colors.dim('  Review a PR: ') + 'wit pr view <number>' + colors.dim(' or ') + 'wit pr checkout <number>'
  );
  console.log();
}

/**
 * Show user's own PRs
 */
async function showMyPrs(
  api: ReturnType<typeof getApiClient>,
  options: { limit: number; json: boolean }
): Promise<void> {
  const prs = await api.inbox.myPrs({ limit: options.limit });

  if (options.json) {
    console.log(JSON.stringify(prs, null, 2));
    return;
  }

  console.log();
  console.log(colors.cyan(colors.bold('  Your Pull Requests')));
  console.log(colors.dim('  Open PRs you\'ve created'));
  console.log(colors.dim('  ' + '─'.repeat(40)));
  console.log();

  if (prs.length === 0) {
    console.log(colors.dim('  No open PRs.'));
    console.log(colors.dim('  Create one with: wit pr create'));
    console.log();
    return;
  }

  for (const pr of prs) {
    // Show review summary for your PRs
    const reviewSummary = getReviewSummary(pr);
    console.log('  ' + formatPr(pr, false).split('\n').join('\n  '));
    if (reviewSummary) {
      console.log('   ' + reviewSummary);
    }
    console.log();
  }

  console.log(colors.dim('  ─'.repeat(40)));
  console.log(colors.dim('  Icons: ') + colors.green('✓') + ' CI passed  ' + colors.red('✗') + ' CI failed  ' + colors.yellow('○') + ' Pending');
  console.log();
}

/**
 * Show PRs user has participated in
 */
async function showParticipated(
  api: ReturnType<typeof getApiClient>,
  options: { limit: number; json: boolean }
): Promise<void> {
  const prs = await api.inbox.participated({ limit: options.limit });

  if (options.json) {
    console.log(JSON.stringify(prs, null, 2));
    return;
  }

  console.log();
  console.log(colors.magenta(colors.bold('  Participated')));
  console.log(colors.dim('  PRs you\'ve reviewed or commented on'));
  console.log(colors.dim('  ' + '─'.repeat(40)));
  console.log();

  if (prs.length === 0) {
    console.log(colors.dim('  No participated PRs.'));
    console.log(colors.dim('  Review a PR to see it here.'));
    console.log();
    return;
  }

  for (const pr of prs) {
    console.log('  ' + formatPr(pr).split('\n').join('\n  '));
    console.log();
  }
}

/**
 * Show summary counts
 */
async function showSummary(
  api: ReturnType<typeof getApiClient>,
  options: { json: boolean }
): Promise<void> {
  const summary = await api.inbox.summary();

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log();
  console.log(colors.bold('  Inbox Summary'));
  console.log(colors.dim('  ' + '─'.repeat(30)));
  console.log();

  const reviewLabel = summary.awaitingReview === 1 ? 'PR' : 'PRs';
  const myLabel = summary.myPrsOpen === 1 ? 'PR' : 'PRs';
  const partLabel = summary.participated === 1 ? 'PR' : 'PRs';

  console.log(
    `  ${colors.yellow('●')} Review Requested:  ${colors.bold(summary.awaitingReview.toString())} ${reviewLabel}`
  );
  console.log(
    `  ${colors.cyan('●')} Your Open PRs:     ${colors.bold(summary.myPrsOpen.toString())} ${myLabel}`
  );
  console.log(
    `  ${colors.magenta('●')} Participated:      ${colors.bold(summary.participated.toString())} ${partLabel}`
  );
  console.log();

  // Action suggestion
  if (summary.awaitingReview > 0) {
    console.log(
      colors.dim('  ') +
        colors.yellow('→') +
        ` ${summary.awaitingReview} ${reviewLabel} awaiting your review`
    );
  } else {
    console.log(colors.dim('  ') + colors.green('✓') + ' No pending reviews');
  }
  console.log();
}

/**
 * Get a review summary string for a PR
 */
function getReviewSummary(pr: InboxPullRequest): string | null {
  if (!pr.reviewState) return null;

  switch (pr.reviewState) {
    case 'approved':
      return colors.green('✓ Approved - ready to merge');
    case 'changes_requested':
      return colors.red('! Changes requested');
    case 'commented':
      return colors.yellow('● Feedback received');
    case 'pending':
      return colors.dim('○ Awaiting review');
    default:
      return null;
  }
}
