/**
 * Issue Commands
 *
 * Manage issues from the command line with Linear-style features.
 *
 * Usage:
 *   wit issue create <title>     Create a new issue
 *   wit issue list               List issues
 *   wit issue view <number>      View issue details
 *   wit issue close <number>     Close an issue
 *   wit issue reopen <number>    Reopen an issue
 *   wit issue comment <num>      Add a comment to an issue
 *   wit issue priority <num> <p> Set issue priority
 *   wit issue due <num> <date>   Set due date
 *   wit issue estimate <num> <n> Set estimate (story points)
 *   wit issue parent <num> <p>   Set parent issue
 *   wit issue subs <number>      List sub-issues
 *   wit issue block <a> <b>      Mark issue A as blocking issue B
 *   wit issue relate <a> <b>     Mark issues as related
 *   wit issue duplicate <a> <b>  Mark issue A as duplicate of B
 *   wit issue triage             List triage items
 *   wit issue accept <number>    Accept triage item
 *   wit issue reject <number>    Reject triage item
 *   wit issue activity [number]  View activity log
 */

import { getApiClient, ApiError, getServerUrl } from '../api/client';
import { Repository } from '../core/repository';
import { parseRemoteUrl } from '../core/protocol';
import { TsgitError, ErrorCode } from '../core/errors';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  orange: (s: string) => `\x1b[38;5;208m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// Priority display configuration
const PRIORITY_DISPLAY: Record<string, { icon: string; color: (s: string) => string }> = {
  urgent: { icon: '🔴', color: colors.red },
  high: { icon: '🟠', color: colors.orange },
  medium: { icon: '🟡', color: colors.yellow },
  low: { icon: '🔵', color: colors.blue },
  none: { icon: '⚪', color: colors.dim },
};

export const ISSUE_HELP = `
wit issue - Manage issues (Linear-style)

Usage: wit issue <command> [options]

Commands:
  create              Create a new issue
  list                List issues
  view <number>       View issue details
  close <number>      Close an issue
  reopen <number>     Reopen an issue
  comment <num>       Add a comment to an issue

  ${colors.bold('Priority & Estimates:')}
  priority <num> <p>  Set issue priority (urgent/high/medium/low/none)
  due <num> <date>    Set due date (YYYY-MM-DD or relative like "tomorrow", "next week")
  due <num> --clear   Clear due date
  estimate <num> <n>  Set estimate in story points

  ${colors.bold('Hierarchy:')}
  parent <num> <p>    Set parent issue (creates sub-issue relationship)
  parent <num> --rm   Remove parent (make standalone issue)
  subs <number>       List sub-issues of an issue
  sub <parent>        Create new sub-issue under parent

  ${colors.bold('Relations:')}
  block <a> <b>       Mark issue A as blocking issue B
  unblock <a> <b>     Remove blocking relationship
  relate <a> <b>      Mark issues as related
  unrelate <a> <b>    Remove related relationship
  duplicate <a> <b>   Mark issue A as duplicate of B (closes A)

  ${colors.bold('Triage:')}
  triage              List issues in triage
  accept <number>     Accept triage item (moves to backlog)
  reject <number>     Reject triage item (closes with reason)

  ${colors.bold('Activity:')}
  activity [number]   View activity log (repo-wide or for specific issue)

  ${colors.bold('Workflow Stages:')}
  stages              List custom workflow stages
  stages add <key>    Add a new custom stage
  stages remove <key> Remove a custom stage (non-system only)
  stages reorder      Reorder stages interactively
  stage <num> <key>   Move issue to a specific stage

Options:
  -h, --help          Show this help message

Create Options:
  -t, --title <text>  Issue title
  -m, --body <text>   Issue body/description
  -l, --labels <l,l>  Comma-separated labels
  -p, --priority <p>  Priority (urgent/high/medium/low/none)
  -d, --due <date>    Due date
  -e, --estimate <n>  Estimate in story points
  -P, --parent <num>  Parent issue number (creates as sub-issue)
  --project <name>    Assign to project
  --cycle <num>       Assign to cycle

List Options:
  --state <s>         Filter by state (open/closed/all)
  --priority <p>      Filter by priority
  --overdue           Show only overdue issues
  --due-soon          Show issues due within 7 days
  --assignee <user>   Filter by assignee
  --project <name>    Filter by project
  --cycle <num>       Filter by cycle
  --triage            Show only triage items

Examples:
  wit issue create "Bug: Login fails" -p high -d tomorrow
  wit issue create -t "Implement feature" -e 5 -P 42
  wit issue list --priority urgent
  wit issue list --overdue
  wit issue priority 42 urgent
  wit issue due 42 "2024-12-31"
  wit issue parent 43 42          # Make #43 a sub-issue of #42
  wit issue block 41 42           # #41 blocks #42
  wit issue triage
  wit issue accept 45
  wit issue activity 42
  wit issue stages                # List all workflow stages
  wit issue stages add qa_review "QA Review" --icon "🔍" --color "f59e0b"
  wit issue stage 42 qa_review    # Move issue #42 to QA Review stage
`;

/**
 * Parse owner and repo from remote URL
 */
function parseOwnerRepo(url: string): { owner: string; repo: string } {
  const parsed = parseRemoteUrl(url);

  // Extract owner/repo from path
  let path = parsed.path;
  if (path.startsWith('/')) {
    path = path.slice(1);
  }
  if (path.endsWith('.git')) {
    path = path.slice(0, -4);
  }

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

/**
 * Get the remote origin URL from the repository
 */
function getRemoteUrl(repo: Repository): string {
  const remote = repo.remotes.get('origin');
  if (!remote) {
    throw new TsgitError(
      'No remote origin configured',
      ErrorCode.OPERATION_FAILED,
      [
        'Add a remote with: wit remote add origin <url>',
        'Or clone from a remote repository',
      ]
    );
  }
  return remote.url;
}

/**
 * Main handler for issue command
 */
export async function handleIssue(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    console.log(ISSUE_HELP);
    return;
  }

  try {
    switch (subcommand) {
      case 'create':
        await handleIssueCreate(args.slice(1));
        break;
      case 'list':
        await handleIssueList(args.slice(1));
        break;
      case 'view':
        await handleIssueView(args.slice(1));
        break;
      case 'close':
        await handleIssueClose(args.slice(1));
        break;
      case 'reopen':
        await handleIssueReopen(args.slice(1));
        break;
      case 'comment':
        await handleIssueComment(args.slice(1));
        break;
      // Priority & Estimates
      case 'priority':
        await handleIssuePriority(args.slice(1));
        break;
      case 'due':
        await handleIssueDue(args.slice(1));
        break;
      case 'estimate':
        await handleIssueEstimate(args.slice(1));
        break;
      // Hierarchy
      case 'parent':
        await handleIssueParent(args.slice(1));
        break;
      case 'subs':
        await handleIssueSubs(args.slice(1));
        break;
      case 'sub':
        await handleIssueSubCreate(args.slice(1));
        break;
      // Relations
      case 'block':
        await handleIssueBlock(args.slice(1));
        break;
      case 'unblock':
        await handleIssueUnblock(args.slice(1));
        break;
      case 'relate':
        await handleIssueRelate(args.slice(1));
        break;
      case 'unrelate':
        await handleIssueUnrelate(args.slice(1));
        break;
      case 'duplicate':
        await handleIssueDuplicate(args.slice(1));
        break;
      // Triage
      case 'triage':
        await handleIssueTriage(args.slice(1));
        break;
      case 'accept':
        await handleIssueAccept(args.slice(1));
        break;
      case 'reject':
        await handleIssueReject(args.slice(1));
        break;
      // Activity
      case 'activity':
        await handleIssueActivity(args.slice(1));
        break;
      // Stages (custom workflow)
      case 'stages':
        await handleIssueStages(args.slice(1));
        break;
      case 'stage':
        await handleIssueStage(args.slice(1));
        break;
      default:
        console.error(colors.red('error: ') + `Unknown subcommand: '${subcommand}'`);
        console.log(ISSUE_HELP);
        process.exit(1);
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
 * Parse arguments for common flags
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
      // Handle special cases like --rm, --clear that are boolean flags
      if (key === 'rm' || key === 'clear' || key === 'overdue' || key === 'due-soon' || key === 'triage') {
        flags[key] = true;
        i++;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const keyMap: Record<string, string> = {
        t: 'title',
        m: 'body',
        s: 'state',
        l: 'labels',
        p: 'priority',
        d: 'due',
        e: 'estimate',
        P: 'parent',
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
 * Parse a date string (supports ISO dates and relative dates)
 */
function parseDate(dateStr: string): Date {
  // Try ISO date first
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Handle relative dates
  const now = new Date();
  const lower = dateStr.toLowerCase().trim();

  if (lower === 'today') {
    return now;
  }
  if (lower === 'tomorrow') {
    now.setDate(now.getDate() + 1);
    return now;
  }
  if (lower === 'next week' || lower === 'nextweek') {
    now.setDate(now.getDate() + 7);
    return now;
  }
  if (lower === 'next month' || lower === 'nextmonth') {
    now.setMonth(now.getMonth() + 1);
    return now;
  }

  // Handle "+Nd" format (e.g., +3d for 3 days)
  const daysMatch = lower.match(/^\+?(\d+)d$/);
  if (daysMatch) {
    now.setDate(now.getDate() + parseInt(daysMatch[1], 10));
    return now;
  }

  // Handle "+Nw" format (e.g., +2w for 2 weeks)
  const weeksMatch = lower.match(/^\+?(\d+)w$/);
  if (weeksMatch) {
    now.setDate(now.getDate() + parseInt(weeksMatch[1], 10) * 7);
    return now;
  }

  throw new TsgitError(
    `Invalid date format: ${dateStr}`,
    ErrorCode.INVALID_ARGUMENT,
    ['Use ISO format (YYYY-MM-DD) or relative dates (today, tomorrow, next week, +3d, +2w)']
  );
}

/**
 * Format a date for display
 */
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return colors.dim('none');
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  if (diffDays < 0) {
    return colors.red(`${dateStr} (${Math.abs(diffDays)}d overdue)`);
  } else if (diffDays === 0) {
    return colors.yellow(`${dateStr} (today)`);
  } else if (diffDays === 1) {
    return colors.yellow(`${dateStr} (tomorrow)`);
  } else if (diffDays <= 7) {
    return colors.yellow(`${dateStr} (${diffDays}d)`);
  }
  return dateStr;
}

/**
 * Format priority for display
 */
function formatPriority(priority: string): string {
  const config = PRIORITY_DISPLAY[priority] || PRIORITY_DISPLAY.none;
  return `${config.icon} ${config.color(priority)}`;
}

/**
 * Create a new issue
 */
async function handleIssueCreate(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags, positional } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Get title from flag or positional
  const title = (flags.title as string) || positional[0];
  if (!title) {
    console.error(colors.red('error: ') + 'Issue title required');
    console.error('usage: wit issue create "Title here"');
    console.error('   or: wit issue create -t "Title here"');
    process.exit(1);
  }

  // Get body if provided
  const body = flags.body as string | undefined;

  // Get labels if provided
  const labelsStr = flags.labels as string | undefined;
  const labels = labelsStr ? labelsStr.split(',').map((l) => l.trim()) : undefined;

  // Get Linear-style fields
  const priority = flags.priority as string | undefined;
  const dueStr = flags.due as string | undefined;
  const dueDate = dueStr ? parseDate(dueStr).toISOString() : undefined;
  const estimate = flags.estimate ? parseInt(flags.estimate as string, 10) : undefined;
  const parentNumber = flags.parent ? parseInt(flags.parent as string, 10) : undefined;
  const project = flags.project as string | undefined;
  const cycle = flags.cycle ? parseInt(flags.cycle as string, 10) : undefined;

  console.log(`Creating issue: ${colors.bold(title)}`);
  if (priority) console.log(`  Priority: ${formatPriority(priority)}`);
  if (dueDate) console.log(`  Due: ${formatDate(dueDate)}`);
  if (estimate) console.log(`  Estimate: ${estimate} points`);
  if (parentNumber) console.log(`  Parent: #${parentNumber}`);

  const issue = await api.issues.create(owner, repoName, {
    title,
    body,
    labels,
    priority,
    dueDate,
    estimate,
    parentNumber,
    project,
    cycle,
  });

  console.log(colors.green('✓') + ` Created issue #${issue.number}`);
  if (parentNumber) {
    console.log(`  ${colors.dim(`Sub-issue of #${parentNumber}`)}`);
  }
  console.log(`  ${colors.dim(`${getServerUrl()}/${owner}/${repoName}/issues/${issue.number}`)}`);
}

/**
 * List issues
 */
async function handleIssueList(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Parse filters
  const state = (flags.state as 'open' | 'closed' | 'all') || 'open';
  const priority = flags.priority as string | undefined;
  const overdue = flags.overdue as boolean;
  const dueSoon = flags['due-soon'] as boolean;
  const assignee = flags.assignee as string | undefined;
  const project = flags.project as string | undefined;
  const cycle = flags.cycle ? parseInt(flags.cycle as string, 10) : undefined;
  const triageOnly = flags.triage as boolean;

  const issues = await api.issues.list(owner, repoName, {
    state: state === 'all' ? undefined : state,
    priority,
    overdue,
    dueSoon,
    assignee,
    project,
    cycle,
    status: triageOnly ? 'triage' : undefined,
  });

  if (issues.length === 0) {
    const filterDesc = triageOnly ? 'triage' : overdue ? 'overdue' : dueSoon ? 'due soon' : state === 'all' ? '' : state;
    console.log(`No ${filterDesc} issues`);
    return;
  }

  // Build header
  let header = triageOnly ? 'Triage' : state === 'all' ? 'All' : state.charAt(0).toUpperCase() + state.slice(1);
  if (priority) header += ` ${priority}-priority`;
  if (overdue) header += ' overdue';
  if (dueSoon) header += ' due soon';
  if (project) header += ` in ${project}`;
  if (cycle) header += ` in cycle ${cycle}`;
  
  console.log(`\n${colors.bold(`${header} issues:`)}\n`);

  for (const issue of issues) {
    const stateIcon = issue.state === 'open' ? colors.green('●') : colors.red('●');
    const priorityStr = (issue as IssueWithExtras).priority ? formatPriority((issue as IssueWithExtras).priority!) : '';

    // Build the main line
    let line = `${stateIcon} #${issue.number} ${issue.title}`;
    if (priorityStr) line += ` ${priorityStr}`;
    console.log(line);

    // Build metadata line
    const meta: string[] = [];
    meta.push(`by ${issue.author?.username || 'unknown'}`);
    
    const extras = issue as IssueWithExtras;
    if (extras.dueDate) {
      meta.push(`due ${formatDate(extras.dueDate)}`);
    }
    if (extras.estimate) {
      meta.push(`${extras.estimate}pts`);
    }
    if (extras.parentNumber) {
      meta.push(`sub of #${extras.parentNumber}`);
    }
    if (extras.subIssueCount && extras.subIssueCount > 0) {
      const progress = extras.subIssueProgress || 0;
      meta.push(`${extras.subIssueCount} subs (${progress}%)`);
    }
    
    console.log(`  ${colors.dim(meta.join(' · '))}`);

    if (issue.labels && issue.labels.length > 0) {
      const labelStr = issue.labels.map((l) => l.name).join(', ');
      console.log(`  ${colors.dim(`Labels: ${labelStr}`)}`);
    }
  }
  console.log();
}

// Extended issue type with Linear-style fields
interface IssueWithExtras {
  priority?: string;
  dueDate?: string;
  estimate?: number;
  parentNumber?: number;
  subIssueCount?: number;
  subIssueProgress?: number;
  projectName?: string;
  cycleNumber?: number;
}

/**
 * View issue details
 */
async function handleIssueView(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue view <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const issue = await api.issues.get(owner, repoName, issueNumber);
  const extras = issue as unknown as IssueWithExtras;

  const stateColor = issue.state === 'open' ? colors.green : colors.red;

  console.log();
  console.log(
    `${stateColor(`[${issue.state.toUpperCase()}]`)} ${colors.bold(issue.title)} ${colors.dim(`#${issue.number}`)}`
  );
  console.log(colors.dim('─'.repeat(60)));
  
  // Basic info
  console.log(`Author:   ${issue.author?.username || 'unknown'}`);
  console.log(`Created:  ${new Date(issue.createdAt).toLocaleDateString()}`);

  if (issue.closedAt) {
    console.log(`Closed:   ${new Date(issue.closedAt).toLocaleDateString()}`);
  }

  // Linear-style fields
  if (extras.priority && extras.priority !== 'none') {
    console.log(`Priority: ${formatPriority(extras.priority)}`);
  }
  if (extras.dueDate) {
    console.log(`Due:      ${formatDate(extras.dueDate)}`);
  }
  if (extras.estimate) {
    console.log(`Estimate: ${extras.estimate} points`);
  }
  if (issue.assigneeId) {
    console.log(`Assignee: @${issue.assigneeId}`);
  }

  // Hierarchy
  if (extras.parentNumber) {
    console.log(`Parent:   #${extras.parentNumber}`);
  }
  if (extras.subIssueCount && extras.subIssueCount > 0) {
    console.log(`Sub-issues: ${extras.subIssueCount} (${extras.subIssueProgress || 0}% complete)`);
  }

  // Project & Cycle
  if (extras.projectName) {
    console.log(`Project:  ${extras.projectName}`);
  }
  if (extras.cycleNumber) {
    console.log(`Cycle:    ${extras.cycleNumber}`);
  }

  if (issue.labels && issue.labels.length > 0) {
    const labelStr = issue.labels.map((l) => l.name).join(', ');
    console.log(`Labels:   ${labelStr}`);
  }

  if (issue.body) {
    console.log();
    console.log(colors.bold('Description:'));
    console.log(issue.body);
  }

  // Show relations if available
  const issueWithRelations = issue as unknown as IssueWithRelations;
  if (issueWithRelations.relations) {
    const { blocking, blockedBy, related, duplicates, duplicatedBy } = issueWithRelations.relations;
    if (blocking?.length || blockedBy?.length || related?.length || duplicates?.length || duplicatedBy?.length) {
      console.log();
      console.log(colors.bold('Relations:'));
      if (blockedBy?.length) {
        console.log(`  ${colors.red('Blocked by:')} ${blockedBy.map((n: number) => `#${n}`).join(', ')}`);
      }
      if (blocking?.length) {
        console.log(`  ${colors.yellow('Blocking:')} ${blocking.map((n: number) => `#${n}`).join(', ')}`);
      }
      if (related?.length) {
        console.log(`  ${colors.cyan('Related:')} ${related.map((n: number) => `#${n}`).join(', ')}`);
      }
      if (duplicates?.length) {
        console.log(`  ${colors.dim('Duplicates:')} ${duplicates.map((n: number) => `#${n}`).join(', ')}`);
      }
      if (duplicatedBy?.length) {
        console.log(`  ${colors.dim('Duplicated by:')} ${duplicatedBy.map((n: number) => `#${n}`).join(', ')}`);
      }
    }
  }

  console.log();
  console.log(
    colors.dim(`View online: ${getServerUrl()}/${owner}/${repoName}/issues/${issueNumber}`)
  );
  console.log();
}

interface IssueWithRelations {
  relations?: {
    blocking?: number[];
    blockedBy?: number[];
    related?: number[];
    duplicates?: number[];
    duplicatedBy?: number[];
  };
}

/**
 * Close an issue
 */
async function handleIssueClose(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue close <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.close(owner, repoName, issueNumber);
  console.log(colors.yellow('✓') + ` Closed issue #${issueNumber}`);
}

/**
 * Reopen an issue
 */
async function handleIssueReopen(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue reopen <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.reopen(owner, repoName, issueNumber);
  console.log(colors.green('✓') + ` Reopened issue #${issueNumber}`);
}

/**
 * Add a comment to an issue
 */
async function handleIssueComment(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);
  const body = positional.slice(1).join(' ');

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue comment <number> "Comment text"');
    process.exit(1);
  }

  if (!body) {
    console.error(colors.red('error: ') + 'Comment body required');
    console.error('usage: wit issue comment <number> "Comment text"');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.addComment(owner, repoName, issueNumber, body);
  console.log(colors.green('✓') + ` Added comment to issue #${issueNumber}`);
}

// ============================================================================
// Priority & Estimates Commands
// ============================================================================

/**
 * Set issue priority
 */
async function handleIssuePriority(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);
  const priority = positional[1];

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue priority <number> <priority>');
    process.exit(1);
  }

  const validPriorities = ['urgent', 'high', 'medium', 'low', 'none'];
  if (!priority || !validPriorities.includes(priority)) {
    console.error(colors.red('error: ') + 'Valid priority required');
    console.error(`Valid priorities: ${validPriorities.join(', ')}`);
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.updatePriority(owner, repoName, issueNumber, priority);
  console.log(colors.green('✓') + ` Set issue #${issueNumber} priority to ${formatPriority(priority)}`);
}

/**
 * Set issue due date
 */
async function handleIssueDue(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue due <number> <date>');
    console.error('   or: wit issue due <number> --clear');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  if (flags.clear) {
    await api.issues.clearDueDate(owner, repoName, issueNumber);
    console.log(colors.green('✓') + ` Cleared due date for issue #${issueNumber}`);
  } else {
    const dateStr = positional[1];
    if (!dateStr) {
      console.error(colors.red('error: ') + 'Date required');
      console.error('usage: wit issue due <number> <date>');
      process.exit(1);
    }

    const dueDate = parseDate(dateStr);
    await api.issues.setDueDate(owner, repoName, issueNumber, dueDate.toISOString());
    console.log(colors.green('✓') + ` Set due date for issue #${issueNumber} to ${formatDate(dueDate)}`);
  }
}

/**
 * Set issue estimate
 */
async function handleIssueEstimate(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);
  const estimate = parseInt(positional[1], 10);

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue estimate <number> <points>');
    process.exit(1);
  }

  if (isNaN(estimate) || estimate < 0) {
    console.error(colors.red('error: ') + 'Valid estimate (non-negative integer) required');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.setEstimate(owner, repoName, issueNumber, estimate);
  console.log(colors.green('✓') + ` Set estimate for issue #${issueNumber} to ${estimate} points`);
}

// ============================================================================
// Hierarchy Commands
// ============================================================================

/**
 * Set or remove parent issue
 */
async function handleIssueParent(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue parent <number> <parent-number>');
    console.error('   or: wit issue parent <number> --rm');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  if (flags.rm) {
    await api.issues.removeParent(owner, repoName, issueNumber);
    console.log(colors.green('✓') + ` Removed parent from issue #${issueNumber}`);
  } else {
    const parentNumber = parseInt(positional[1], 10);
    if (isNaN(parentNumber)) {
      console.error(colors.red('error: ') + 'Parent issue number required');
      process.exit(1);
    }

    await api.issues.setParent(owner, repoName, issueNumber, parentNumber);
    console.log(colors.green('✓') + ` Set issue #${issueNumber} as sub-issue of #${parentNumber}`);
  }
}

/**
 * List sub-issues
 */
async function handleIssueSubs(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue subs <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const subIssues = await api.issues.getSubIssues(owner, repoName, issueNumber);

  if (subIssues.length === 0) {
    console.log(`No sub-issues for #${issueNumber}`);
    return;
  }

  console.log(`\n${colors.bold(`Sub-issues of #${issueNumber}:`)} (${subIssues.length})\n`);

  let completed = 0;
  for (const issue of subIssues) {
    const stateIcon = issue.state === 'open' ? colors.yellow('○') : colors.green('●');
    if (issue.state === 'closed') completed++;
    const extras = issue as unknown as IssueWithExtras;
    const priorityStr = extras.priority ? ` ${formatPriority(extras.priority)}` : '';
    console.log(`  ${stateIcon} #${issue.number} ${issue.title}${priorityStr}`);
  }

  const percentage = Math.round((completed / subIssues.length) * 100);
  console.log();
  console.log(colors.dim(`Progress: ${completed}/${subIssues.length} (${percentage}%)`));
}

/**
 * Create a sub-issue
 */
async function handleIssueSubCreate(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const parentNumber = parseInt(positional[0], 10);

  if (isNaN(parentNumber)) {
    console.error(colors.red('error: ') + 'Parent issue number required');
    console.error('usage: wit issue sub <parent-number> -t "Title"');
    process.exit(1);
  }

  const title = (flags.title as string) || positional[1];
  if (!title) {
    console.error(colors.red('error: ') + 'Title required');
    console.error('usage: wit issue sub <parent-number> -t "Title"');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const issue = await api.issues.create(owner, repoName, {
    title,
    body: flags.body as string | undefined,
    parentNumber,
    priority: flags.priority as string | undefined,
  });

  console.log(colors.green('✓') + ` Created sub-issue #${issue.number} under #${parentNumber}`);
}

// ============================================================================
// Relations Commands
// ============================================================================

/**
 * Mark issue as blocking another
 */
async function handleIssueBlock(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const blockingNumber = parseInt(positional[0], 10);
  const blockedNumber = parseInt(positional[1], 10);

  if (isNaN(blockingNumber) || isNaN(blockedNumber)) {
    console.error(colors.red('error: ') + 'Two issue numbers required');
    console.error('usage: wit issue block <blocking-issue> <blocked-issue>');
    console.error('  This marks the first issue as blocking the second issue');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.addRelation(owner, repoName, blockingNumber, blockedNumber, 'blocks');
  console.log(colors.green('✓') + ` Issue #${blockingNumber} now blocks #${blockedNumber}`);
}

/**
 * Remove blocking relationship
 */
async function handleIssueUnblock(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const blockingNumber = parseInt(positional[0], 10);
  const blockedNumber = parseInt(positional[1], 10);

  if (isNaN(blockingNumber) || isNaN(blockedNumber)) {
    console.error(colors.red('error: ') + 'Two issue numbers required');
    console.error('usage: wit issue unblock <blocking-issue> <blocked-issue>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.removeRelation(owner, repoName, blockingNumber, blockedNumber, 'blocks');
  console.log(colors.green('✓') + ` Removed blocking relationship between #${blockingNumber} and #${blockedNumber}`);
}

/**
 * Mark issues as related
 */
async function handleIssueRelate(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueA = parseInt(positional[0], 10);
  const issueB = parseInt(positional[1], 10);

  if (isNaN(issueA) || isNaN(issueB)) {
    console.error(colors.red('error: ') + 'Two issue numbers required');
    console.error('usage: wit issue relate <issue-a> <issue-b>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.addRelation(owner, repoName, issueA, issueB, 'relates_to');
  console.log(colors.green('✓') + ` Issues #${issueA} and #${issueB} are now related`);
}

/**
 * Remove related relationship
 */
async function handleIssueUnrelate(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueA = parseInt(positional[0], 10);
  const issueB = parseInt(positional[1], 10);

  if (isNaN(issueA) || isNaN(issueB)) {
    console.error(colors.red('error: ') + 'Two issue numbers required');
    console.error('usage: wit issue unrelate <issue-a> <issue-b>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.removeRelation(owner, repoName, issueA, issueB, 'relates_to');
  console.log(colors.green('✓') + ` Removed related relationship between #${issueA} and #${issueB}`);
}

/**
 * Mark issue as duplicate
 */
async function handleIssueDuplicate(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const duplicateNumber = parseInt(positional[0], 10);
  const canonicalNumber = parseInt(positional[1], 10);

  if (isNaN(duplicateNumber) || isNaN(canonicalNumber)) {
    console.error(colors.red('error: ') + 'Two issue numbers required');
    console.error('usage: wit issue duplicate <duplicate-issue> <canonical-issue>');
    console.error('  This marks the first issue as a duplicate of the second and closes it');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.markDuplicate(owner, repoName, duplicateNumber, canonicalNumber);
  console.log(colors.green('✓') + ` Issue #${duplicateNumber} marked as duplicate of #${canonicalNumber} and closed`);
}

// ============================================================================
// Triage Commands
// ============================================================================

/**
 * List triage items
 */
async function handleIssueTriage(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const issues = await api.issues.listTriage(owner, repoName);

  if (issues.length === 0) {
    console.log(colors.green('✓') + ' No issues in triage');
    return;
  }

  console.log(`\n${colors.bold('Triage Queue:')} ${issues.length} items\n`);

  for (const issue of issues) {
    const extras = issue as unknown as IssueWithExtras;
    console.log(`${colors.yellow('◇')} #${issue.number} ${issue.title}`);
    console.log(`  ${colors.dim(`by ${issue.author?.username || 'unknown'} on ${new Date(issue.createdAt).toLocaleDateString()}`)}`);
    if (extras.priority && extras.priority !== 'none') {
      console.log(`  ${colors.dim(`Suggested priority: ${formatPriority(extras.priority)}`)}`);
    }
  }

  console.log();
  console.log(colors.dim('Use `wit issue accept <number>` to move to backlog'));
  console.log(colors.dim('Use `wit issue reject <number> [reason]` to close'));
}

/**
 * Accept triage item
 */
async function handleIssueAccept(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue accept <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Allow setting priority and status when accepting
  const targetStatus = (flags.status as string) || 'backlog';
  const priority = flags.priority as string | undefined;

  await api.issues.acceptTriage(owner, repoName, issueNumber, targetStatus, priority);
  console.log(colors.green('✓') + ` Accepted issue #${issueNumber} and moved to ${targetStatus}`);
}

/**
 * Reject triage item
 */
async function handleIssueReject(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);
  const reason = positional.slice(1).join(' ') || 'Rejected during triage';

  if (isNaN(issueNumber)) {
    console.error(colors.red('error: ') + 'Issue number required');
    console.error('usage: wit issue reject <number> [reason]');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.issues.rejectTriage(owner, repoName, issueNumber, reason);
  console.log(colors.yellow('✓') + ` Rejected issue #${issueNumber}: ${reason}`);
}

// ============================================================================
// Activity Commands
// ============================================================================

/**
 * View activity log
 */
async function handleIssueActivity(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const issueNumber = positional[0] ? parseInt(positional[0], 10) : undefined;
  const limit = flags.limit ? parseInt(flags.limit as string, 10) : 20;

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  let activities: ActivityEntry[];
  
  if (issueNumber && !isNaN(issueNumber)) {
    activities = await api.issues.getActivity(owner, repoName, issueNumber, limit);
    console.log(`\n${colors.bold(`Activity for issue #${issueNumber}:`)}\n`);
  } else {
    activities = await api.issues.getRepoActivity(owner, repoName, limit);
    console.log(`\n${colors.bold('Recent activity:')}\n`);
  }

  if (activities.length === 0) {
    console.log(colors.dim('No activity found'));
    return;
  }

  for (const activity of activities) {
    const time = new Date(activity.createdAt).toLocaleString();
    const actor = activity.actor || 'unknown';
    
    let description = '';
    switch (activity.action) {
      case 'created':
        description = `created issue`;
        break;
      case 'status_changed':
        description = `changed status from ${activity.oldValue} to ${colors.cyan(activity.newValue || '')}`;
        break;
      case 'priority_changed':
        description = `changed priority to ${formatPriority(activity.newValue || 'none')}`;
        break;
      case 'assigned':
        description = `assigned to @${activity.newValue}`;
        break;
      case 'unassigned':
        description = `unassigned from @${activity.oldValue}`;
        break;
      case 'labeled':
        description = `added label ${activity.newValue}`;
        break;
      case 'unlabeled':
        description = `removed label ${activity.oldValue}`;
        break;
      case 'due_date_set':
        description = `set due date to ${formatDate(activity.newValue)}`;
        break;
      case 'due_date_cleared':
        description = `cleared due date`;
        break;
      case 'estimate_set':
        description = `set estimate to ${activity.newValue} points`;
        break;
      case 'parent_set':
        description = `set parent to #${activity.newValue}`;
        break;
      case 'parent_removed':
        description = `removed parent #${activity.oldValue}`;
        break;
      case 'relation_added':
        description = `added ${activity.field} relation with #${activity.newValue}`;
        break;
      case 'relation_removed':
        description = `removed ${activity.field} relation with #${activity.oldValue}`;
        break;
      case 'commented':
        description = `commented`;
        break;
      default:
        description = activity.action;
    }

    const issueRef = activity.issueNumber ? `#${activity.issueNumber}` : '';
    console.log(`${colors.dim(time)} ${colors.bold(actor)} ${description} ${issueRef}`);
  }

  console.log();
}

interface ActivityEntry {
  id: string;
  issueNumber?: number;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  actor?: string;
  createdAt: string;
}

// ============================================================================
// Stage Commands (Custom Workflow)
// ============================================================================

interface IssueStage {
  id: string;
  key: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  position: number;
  isClosedState: boolean;
  isTriageState: boolean;
  isDefault: boolean;
  isSystem: boolean;
}

/**
 * List and manage workflow stages
 */
async function handleIssueStages(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const subcommand = positional[0];

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // No subcommand - list stages
  if (!subcommand || subcommand === 'list') {
    const stages = await api.stages.list(owner, repoName) as IssueStage[];

    console.log(`\n${colors.bold('Workflow Stages:')}\n`);

    for (const stage of stages) {
      const badges: string[] = [];
      if (stage.isDefault) badges.push(colors.green('default'));
      if (stage.isClosedState) badges.push(colors.red('closes'));
      if (stage.isTriageState) badges.push(colors.yellow('triage'));
      if (stage.isSystem) badges.push(colors.dim('system'));

      const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';
      const colorHex = `#${stage.color}`;
      
      console.log(`  ${stage.icon} ${colors.bold(stage.name)} ${colors.dim(`(${stage.key})`)}${badgeStr}`);
      if (stage.description) {
        console.log(`    ${colors.dim(stage.description)}`);
      }
    }

    console.log();
    console.log(colors.dim('Use `wit issue stages add <key> <name>` to add a custom stage'));
    console.log(colors.dim('Use `wit issue stage <num> <key>` to move an issue to a stage'));
    return;
  }

  // Add a new stage
  if (subcommand === 'add') {
    const key = positional[1];
    const name = positional[2] || positional[1]; // Use key as name if not provided

    if (!key) {
      console.error(colors.red('error: ') + 'Stage key required');
      console.error('usage: wit issue stages add <key> [name] [--icon <emoji>] [--color <hex>] [--closes]');
      process.exit(1);
    }

    const icon = (flags.icon as string) || '○';
    const color = (flags.color as string) || '6b7280';
    const isClosedState = !!flags.closes;
    const isDefault = !!flags.default;

    const stage = await api.stages.create(owner, repoName, {
      key,
      name,
      icon,
      color,
      isClosedState,
      isDefault,
    }) as IssueStage;

    console.log(colors.green('✓') + ` Created stage "${stage.name}" (${stage.key})`);
    return;
  }

  // Remove a stage
  if (subcommand === 'remove' || subcommand === 'rm' || subcommand === 'delete') {
    const key = positional[1];

    if (!key) {
      console.error(colors.red('error: ') + 'Stage key required');
      console.error('usage: wit issue stages remove <key>');
      process.exit(1);
    }

    await api.stages.delete(owner, repoName, key);
    console.log(colors.green('✓') + ` Removed stage "${key}"`);
    return;
  }

  // Update a stage
  if (subcommand === 'update') {
    const key = positional[1];

    if (!key) {
      console.error(colors.red('error: ') + 'Stage key required');
      console.error('usage: wit issue stages update <key> [--name <name>] [--icon <emoji>] [--color <hex>] [--closes] [--default]');
      process.exit(1);
    }

    const updates: Record<string, string | boolean> = {};
    if (flags.name) updates.name = flags.name as string;
    if (flags.icon) updates.icon = flags.icon as string;
    if (flags.color) updates.color = flags.color as string;
    if (flags.closes !== undefined) updates.isClosedState = !!flags.closes;
    if (flags.default !== undefined) updates.isDefault = !!flags.default;

    const stage = await api.stages.update(owner, repoName, key, updates) as IssueStage;
    console.log(colors.green('✓') + ` Updated stage "${stage.name}"`);
    return;
  }

  console.error(colors.red('error: ') + `Unknown stages subcommand: ${subcommand}`);
  console.error('usage: wit issue stages [list|add|remove|update]');
  process.exit(1);
}

/**
 * Move an issue to a specific stage
 */
async function handleIssueStage(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const issueNumber = parseInt(positional[0], 10);
  const stageKey = positional[1];

  if (isNaN(issueNumber) || !stageKey) {
    console.error(colors.red('error: ') + 'Issue number and stage key required');
    console.error('usage: wit issue stage <number> <stage-key>');
    console.error('  Use `wit issue stages` to see available stages');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const issue = await api.issues.updateStage(owner, repoName, issueNumber, stageKey);
  console.log(colors.green('✓') + ` Moved issue #${issueNumber} to stage "${stageKey}"`);
}
