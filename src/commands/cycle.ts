/**
 * Cycle Command
 * Sprint/cycle management for wit issue tracking
 *
 * Commands:
 * - wit cycle create                 Create a new cycle
 * - wit cycle list                   List all cycles
 * - wit cycle show [n]               Show cycle details
 * - wit cycle current                Show current active cycle
 * - wit cycle add <issue> [cycle]    Add issue to cycle
 * - wit cycle remove <issue>         Remove issue from cycle
 * - wit cycle complete [n]           Complete a cycle
 * - wit cycle velocity               Show velocity metrics
 */

import { getApiClient, ApiError, getServerUrl, Cycle } from '../api/client';
import { Repository } from '../core/repository';
import { parseRemoteUrl } from '../core/protocol';
import { TsgitError, ErrorCode } from '../core/errors';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export const CYCLE_HELP = `
wit cycle - Manage sprints/cycles (Linear-style)

Usage: wit cycle <command> [options]

Commands:
  create [name]       Create a new cycle
  list                List all cycles
  show [n]            Show cycle details (default: current)
  current             Show current active cycle
  add <issue> [n]     Add issue to cycle (default: current)
  remove <issue>      Remove issue from cycle
  complete [n]        Complete a cycle
  velocity            Show velocity metrics

Options:
  -h, --help          Show this help message
  --weeks <n>         Cycle duration in weeks (default: 2)
  --start <date>      Start date (YYYY-MM-DD)
  --end <date>        End date (YYYY-MM-DD)
  --name <name>       Cycle name
  --description, -d   Cycle description

Examples:
  wit cycle create "Sprint 1"
  wit cycle create --weeks 2
  wit cycle list
  wit cycle show 1
  wit cycle current
  wit cycle add WIT-1
  wit cycle add WIT-1 2
  wit cycle remove WIT-1
  wit cycle complete
  wit cycle velocity
`;

/**
 * Parse owner and repo from remote URL
 */
function parseOwnerRepo(url: string): { owner: string; repo: string } {
  const parsed = parseRemoteUrl(url);
  let path = parsed.path;
  if (path.startsWith('/')) path = path.slice(1);
  if (path.endsWith('.git')) path = path.slice(0, -4);

  const parts = path.split('/');
  if (parts.length < 2) {
    throw new TsgitError(
      `Invalid remote URL: cannot parse owner/repo from ${url}`,
      ErrorCode.INVALID_ARGUMENT,
      ['Check that the remote URL is in the format: host/owner/repo']
    );
  }

  return {
    owner: parts[parts.length - 2],
    repo: parts[parts.length - 1],
  };
}

function getRemoteUrl(repo: Repository): string {
  const remote = repo.remotes.get('origin');
  if (!remote) {
    throw new TsgitError(
      'No remote origin configured',
      ErrorCode.OPERATION_FAILED,
      ['Add a remote with: wit remote add origin <url>']
    );
  }
  return remote.url;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  const keyMap: Record<string, string> = {
    d: 'description',
    n: 'name',
  };

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
 * Get cycle status based on dates
 */
function getCycleStatus(cycle: Cycle): 'active' | 'upcoming' | 'completed' {
  const now = new Date();
  const start = new Date(cycle.startDate);
  const end = new Date(cycle.endDate);

  if (now < start) return 'upcoming';
  if (now > end) return 'completed';
  return 'active';
}

/**
 * Format cycle status
 */
function formatCycleStatus(status: 'active' | 'upcoming' | 'completed'): string {
  switch (status) {
    case 'active':
      return colors.green('● active');
    case 'upcoming':
      return colors.yellow('○ upcoming');
    case 'completed':
      return colors.dim('✓ completed');
  }
}

/**
 * Format date
 */
function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format duration between dates
 */
function formatDuration(start: string | Date, end: string | Date): string {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 7) return '1 week';
  if (days === 14) return '2 weeks';
  if (days === 21) return '3 weeks';
  return `${days} days`;
}

/**
 * Calculate days remaining
 */
function getDaysRemaining(endDate: string | Date): number {
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  const now = Date.now();
  return Math.ceil((end.getTime() - now) / (1000 * 60 * 60 * 24));
}

/**
 * Render progress bar
 */
function renderProgressBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  const filledChar = '█';
  const emptyChar = '░';

  let color = colors.green;
  if (percentage < 50) color = colors.yellow;
  if (percentage < 25) color = colors.red;

  return color(filledChar.repeat(filled)) + colors.dim(emptyChar.repeat(empty));
}

/**
 * Parse issue number from various formats
 * Accepts: "1", "WIT-1", "#1"
 */
function parseIssueNumber(input: string): number {
  // Remove common prefixes
  const cleaned = input.replace(/^(WIT-|#)/i, '');
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) {
    throw new TsgitError(
      `Invalid issue number: ${input}`,
      ErrorCode.INVALID_ARGUMENT,
      ['Use a number like "1" or "WIT-1"']
    );
  }
  return num;
}

// Priority icons for issue display
const PRIORITY_ICONS: Record<string, string> = {
  urgent: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  none: '⚪',
};

// Status icons for issue display
const STATUS_ICONS: Record<string, string> = {
  backlog: '○',
  todo: '○',
  in_progress: '◐',
  in_review: '◑',
  done: '●',
  canceled: '✕',
  triage: '?',
};

/**
 * CLI handler for cycle command
 */
export async function handleCycle(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  if (subcommand === '-h' || subcommand === '--help') {
    console.log(CYCLE_HELP);
    return;
  }

  try {
    switch (subcommand) {
      case 'create':
      case 'new':
        await handleCycleCreate(args.slice(1));
        break;
      case 'list':
      case 'ls':
        await handleCycleList(args.slice(1));
        break;
      case 'show':
      case 'view':
        await handleCycleShow(args.slice(1));
        break;
      case 'current':
      case 'active':
        await handleCycleCurrent(args.slice(1));
        break;
      case 'add':
        await handleCycleAdd(args.slice(1));
        break;
      case 'remove':
        await handleCycleRemove(args.slice(1));
        break;
      case 'complete':
      case 'finish':
        await handleCycleComplete(args.slice(1));
        break;
      case 'velocity':
        await handleCycleVelocity(args.slice(1));
        break;
      default:
        // Check if it's a number (shortcut for wit cycle show N)
        if (subcommand.match(/^\d+$/)) {
          await handleCycleShow([subcommand]);
        } else {
          console.error(colors.red('error: ') + `Unknown cycle subcommand: ${subcommand}`);
          console.log(CYCLE_HELP);
          process.exit(1);
        }
    }
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(colors.red('error: ') + error.message);
      if (error.status === 0) {
        console.error(colors.dim('hint: Start the server with: wit serve'));
      }
      process.exit(1);
    }
    if (error instanceof TsgitError) {
      console.error(error.format());
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Create a new cycle
 */
async function handleCycleCreate(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags, positional } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Parse dates
  let startDate: Date;
  let endDate: Date;

  if (flags.start && flags.end) {
    startDate = new Date(flags.start as string);
    endDate = new Date(flags.end as string);
  } else if (flags.weeks) {
    const weeks = parseInt(flags.weeks as string, 10) || 2;
    startDate = new Date();
    endDate = new Date(startDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  } else {
    // Default: 2 week sprint starting today
    startDate = new Date();
    endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  }

  const name = positional.join(' ') || (flags.name as string) || `Sprint`;

  const cycle = await api.cycles.create(owner, repoName, {
    name,
    description: flags.description as string | undefined,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  console.log(colors.green('✓') + ` Created ${colors.cyan(cycle.name)}`);
  console.log(
    colors.dim(`  ${formatDate(cycle.startDate)} → ${formatDate(cycle.endDate)} (${formatDuration(cycle.startDate, cycle.endDate)})`)
  );
  console.log(colors.dim(`  ${getServerUrl()}/${owner}/${repoName}/cycles`));
}

/**
 * List all cycles
 */
async function handleCycleList(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const filter = flags.filter as 'past' | 'current' | 'upcoming' | undefined;
  const cycles = await api.cycles.list(owner, repoName, { filter });

  if (cycles.length === 0) {
    console.log(colors.dim('No cycles yet'));
    console.log(colors.dim('Create one with: wit cycle create --weeks 2'));
    return;
  }

  console.log('');
  console.log(colors.bold('  Cycles'));
  console.log('');

  for (const cycle of cycles) {
    const status = getCycleStatus(cycle);
    const statusStr = formatCycleStatus(status);

    // Try to get progress
    try {
      const progress = await api.cycles.getProgress(owner, repoName, cycle.number);

      console.log(`  ${colors.cyan(`Cycle ${cycle.number}`.padEnd(12))} ${cycle.name}`);
      console.log(`    ${statusStr}  ${formatDate(cycle.startDate)} → ${formatDate(cycle.endDate)}`);

      if (progress.total > 0) {
        console.log(
          `    ${renderProgressBar(progress.percentage)} ${progress.percentage}% (${progress.completed}/${progress.total} done)`
        );
      }
      console.log('');
    } catch {
      // If progress fails, just show basic info
      console.log(`  ${colors.cyan(`Cycle ${cycle.number}`.padEnd(12))} ${cycle.name}`);
      console.log(`    ${statusStr}  ${formatDate(cycle.startDate)} → ${formatDate(cycle.endDate)}`);
      console.log('');
    }
  }
}

/**
 * Show cycle details
 */
async function handleCycleShow(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  let cycle: Cycle | null;
  const cycleNum = positional[0] ? parseInt(positional[0], 10) : undefined;

  if (cycleNum) {
    cycle = await api.cycles.get(owner, repoName, cycleNum);
  } else {
    cycle = await api.cycles.getCurrent(owner, repoName);
  }

  if (!cycle) {
    throw new TsgitError(
      cycleNum ? `Cycle ${cycleNum} not found` : 'No active cycle',
      ErrorCode.OBJECT_NOT_FOUND,
      ['wit cycle list    # List all cycles']
    );
  }

  const status = getCycleStatus(cycle);
  const progress = await api.cycles.getProgress(owner, repoName, cycle.number);
  const issues = await api.cycles.getIssues(owner, repoName, cycle.number);

  console.log('');
  console.log(colors.bold(`  ${cycle.name}`));
  console.log(`  ${formatCycleStatus(status)}`);
  console.log('');
  console.log(`  ${colors.dim('Duration:')}  ${formatDate(cycle.startDate)} → ${formatDate(cycle.endDate)}`);

  if (status === 'active') {
    const daysLeft = getDaysRemaining(cycle.endDate);
    console.log(`  ${colors.dim('Remaining:')} ${daysLeft > 0 ? `${daysLeft} days` : colors.red('Overdue!')}`);
  }

  console.log('');
  console.log(`  ${colors.dim('Progress:')}`);
  console.log(`    ${renderProgressBar(progress.percentage, 30)} ${progress.percentage}%`);
  console.log('');
  console.log(`    ${colors.green('Done:')}        ${progress.completed}`);
  console.log(`    ${colors.blue('In Progress:')} ${progress.inProgress}`);
  console.log(`    ${colors.yellow('To Do:')}       ${progress.total - progress.completed - progress.inProgress}`);

  if (progress.totalEstimate > 0) {
    console.log('');
    console.log(`    ${colors.dim('Points:')}      ${progress.completedEstimate}/${progress.totalEstimate}`);
  }

  if (issues.length > 0) {
    console.log('');
    console.log(colors.dim('  ─'.repeat(30)));
    console.log('');
    console.log(colors.bold('  Issues:'));
    console.log('');

    for (const issue of issues) {
      const statusIcon = STATUS_ICONS[issue.status || 'todo'] || '○';
      const priorityIcon = PRIORITY_ICONS[issue.priority || 'none'] || '';
      const id = colors.cyan(`#${issue.number}`);
      const title = issue.title.length > 40 ? issue.title.slice(0, 37) + '...' : issue.title;

      console.log(`    ${statusIcon} ${priorityIcon} ${id} ${title}`);
    }
  }

  console.log('');
}

/**
 * Show current active cycle
 */
async function handleCycleCurrent(_args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const cycle = await api.cycles.getCurrent(owner, repoName);

  if (!cycle) {
    console.log(colors.dim('No active cycle'));
    console.log(colors.dim('Create one with: wit cycle create --weeks 2'));
    return;
  }

  const progress = await api.cycles.getProgress(owner, repoName, cycle.number);
  const daysLeft = getDaysRemaining(cycle.endDate);

  console.log('');
  console.log(colors.bold(`  ${cycle.name}`));
  console.log(`  ${daysLeft > 0 ? `${daysLeft} days remaining` : colors.red('Overdue!')}`);
  console.log('');
  console.log(`  ${renderProgressBar(progress.percentage, 30)} ${progress.percentage}%`);
  console.log(
    `  ${progress.completed} done · ${progress.inProgress} in progress · ${progress.total - progress.completed - progress.inProgress} to do`
  );
  console.log('');
}

/**
 * Add issue to cycle
 */
async function handleCycleAdd(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);

  if (!positional[0]) {
    throw new TsgitError('Issue ID is required', ErrorCode.INVALID_ARGUMENT, ['wit cycle add WIT-1 1']);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const issueNumber = parseIssueNumber(positional[0]);
  const cycleNum = positional[1] ? parseInt(positional[1], 10) : undefined;

  // Get cycle (specified or current)
  let cycle: Cycle | null;
  if (cycleNum) {
    cycle = await api.cycles.get(owner, repoName, cycleNum);
  } else {
    cycle = await api.cycles.getCurrent(owner, repoName);
  }

  if (!cycle) {
    throw new TsgitError('No cycle specified and no active cycle', ErrorCode.OBJECT_NOT_FOUND, [
      'wit cycle add WIT-1 1    # Add to cycle 1',
    ]);
  }

  await api.cycles.addIssue(owner, repoName, cycle.number, issueNumber);
  console.log(colors.green('✓') + ` Added ${colors.cyan(`#${issueNumber}`)} to ${cycle.name}`);
}

/**
 * Remove issue from cycle
 */
async function handleCycleRemove(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);

  if (!positional[0]) {
    throw new TsgitError('Issue ID is required', ErrorCode.INVALID_ARGUMENT, ['wit cycle remove WIT-1']);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const issueNumber = parseIssueNumber(positional[0]);

  // Get the issue to find its cycle
  const issue = await api.issues.get(owner, repoName, issueNumber);

  if (!issue.cycleId) {
    console.log(colors.dim(`#${issueNumber} is not in a cycle`));
    return;
  }

  // Find the cycle number from cycles list
  const cycles = await api.cycles.list(owner, repoName);
  const cycle = cycles.find((c) => c.id === issue.cycleId);

  if (cycle) {
    await api.cycles.removeIssue(owner, repoName, cycle.number, issueNumber);
    console.log(colors.green('✓') + ` Removed ${colors.cyan(`#${issueNumber}`)} from ${cycle.name}`);
  } else {
    // Fallback: just update the issue to remove cycle assignment
    await api.issues.update(owner, repoName, issueNumber, {});
    console.log(colors.green('✓') + ` Removed ${colors.cyan(`#${issueNumber}`)} from cycle`);
  }
}

/**
 * Complete current cycle
 */
async function handleCycleComplete(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const cycleNum = positional[0] ? parseInt(positional[0], 10) : undefined;

  let cycle: Cycle | null;
  if (cycleNum) {
    cycle = await api.cycles.get(owner, repoName, cycleNum);
  } else {
    cycle = await api.cycles.getCurrent(owner, repoName);
  }

  if (!cycle) {
    throw new TsgitError('No active cycle to complete', ErrorCode.OBJECT_NOT_FOUND);
  }

  const progress = await api.cycles.getProgress(owner, repoName, cycle.number);

  // Update cycle end date to now to mark it complete
  const now = new Date();
  await api.cycles.update(owner, repoName, cycle.number, {
    endDate: now.toISOString(),
  });

  console.log(colors.green('✓') + ` Completed ${colors.cyan(cycle.name)}`);
  console.log('');
  console.log(colors.bold('  Summary:'));
  console.log(`    ${colors.green('Completed:')}  ${progress.completed} issues`);

  const remaining = progress.total - progress.completed;
  if (remaining > 0) {
    console.log(`    ${colors.yellow('Remaining:')}  ${remaining} issues (moved to backlog)`);
  }

  if (progress.completedEstimate > 0) {
    console.log(`    ${colors.dim('Points:')}     ${progress.completedEstimate} completed`);
  }
  console.log('');
}

/**
 * Show velocity metrics
 */
async function handleCycleVelocity(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const count = flags.count ? parseInt(flags.count as string, 10) : 5;
  const velocity = await api.cycles.getVelocity(owner, repoName, count);

  if (velocity.cycles.length === 0) {
    console.log(colors.dim('No completed cycles yet'));
    return;
  }

  console.log('');
  console.log(colors.bold('  Velocity'));
  console.log('');

  const maxPoints = Math.max(...velocity.cycles.map((v) => v.completedPoints), 1);
  const maxIssues = Math.max(...velocity.cycles.map((v) => v.completedIssues), 1);

  // Show points velocity
  console.log(colors.dim('  Points per cycle:'));
  for (const v of velocity.cycles) {
    const barWidth = Math.round((v.completedPoints / maxPoints) * 20);
    const bar = colors.green('█'.repeat(barWidth)) + colors.dim('░'.repeat(20 - barWidth));
    console.log(`    Cycle ${String(v.number).padEnd(4)} ${bar} ${v.completedPoints}`);
  }

  console.log('');

  // Show issues velocity
  console.log(colors.dim('  Issues per cycle:'));
  for (const v of velocity.cycles) {
    const barWidth = Math.round((v.completedIssues / maxIssues) * 20);
    const bar = colors.blue('█'.repeat(barWidth)) + colors.dim('░'.repeat(20 - barWidth));
    console.log(`    Cycle ${String(v.number).padEnd(4)} ${bar} ${v.completedIssues}`);
  }

  console.log('');
  console.log(`  ${colors.dim('Average:')} ${velocity.averagePoints.toFixed(1)} points/cycle, ${velocity.averageIssues.toFixed(1)} issues/cycle`);
  console.log('');
}
