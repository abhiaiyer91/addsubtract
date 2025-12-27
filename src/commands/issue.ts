/**
 * Issue Commands
 *
 * Manage issues from the command line.
 *
 * Usage:
 *   wit issue create <title>  Create a new issue
 *   wit issue list            List issues
 *   wit issue view <number>   View issue details
 *   wit issue close <number>  Close an issue
 *   wit issue reopen <number> Reopen an issue
 *   wit issue comment <num>   Add a comment to an issue
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
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export const ISSUE_HELP = `
wit issue - Manage issues

Usage: wit issue <command> [options]

Commands:
  create          Create a new issue
  list            List issues
  view <number>   View issue details
  close <number>  Close an issue
  reopen <number> Reopen an issue
  comment <num>   Add a comment to an issue

Options:
  -h, --help      Show this help message

Examples:
  wit issue create "Bug: Login fails"
  wit issue create -t "Bug" -m "Steps to reproduce..."
  wit issue list
  wit issue list --state closed
  wit issue list --state all
  wit issue view 42
  wit issue close 42
  wit issue reopen 42
  wit issue comment 42 "Fixed in commit abc123"
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
        t: 'title',
        m: 'body',
        s: 'state',
        l: 'labels',
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

  console.log(`Creating issue: ${colors.bold(title)}`);

  const issue = await api.issues.create(owner, repoName, {
    title,
    body,
    labels,
  });

  console.log(colors.green('✓') + ` Created issue #${issue.number}`);
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

  // Parse state filter
  const state = (flags.state as 'open' | 'closed' | 'all') || 'open';

  const issues = await api.issues.list(owner, repoName, {
    state: state === 'all' ? undefined : state,
  });

  if (issues.length === 0) {
    console.log(`No ${state === 'all' ? '' : state + ' '}issues`);
    return;
  }

  const stateLabel = state === 'all' ? 'All' : state.charAt(0).toUpperCase() + state.slice(1);
  console.log(`\n${colors.bold(`${stateLabel} issues:`)}\n`);

  for (const issue of issues) {
    const stateIcon = issue.state === 'open' ? colors.green('●') : colors.red('●');

    console.log(`${stateIcon} #${issue.number} ${issue.title}`);
    console.log(
      `  ${colors.dim(`by ${issue.author?.username || 'unknown'} on ${new Date(issue.createdAt).toLocaleDateString()}`)}`
    );

    if (issue.labels && issue.labels.length > 0) {
      const labelStr = issue.labels.map((l) => l.name).join(', ');
      console.log(`  ${colors.dim(`Labels: ${labelStr}`)}`);
    }
  }
  console.log();
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

  const stateColor = issue.state === 'open' ? colors.green : colors.red;

  console.log();
  console.log(
    `${stateColor(`[${issue.state.toUpperCase()}]`)} ${colors.bold(issue.title)} ${colors.dim(`#${issue.number}`)}`
  );
  console.log(colors.dim('─'.repeat(60)));
  console.log(`Author:  ${issue.author?.username || 'unknown'}`);
  console.log(`Created: ${new Date(issue.createdAt).toLocaleDateString()}`);

  if (issue.closedAt) {
    console.log(`Closed:  ${new Date(issue.closedAt).toLocaleDateString()}`);
  }

  if (issue.labels && issue.labels.length > 0) {
    const labelStr = issue.labels.map((l) => l.name).join(', ');
    console.log(`Labels:  ${labelStr}`);
  }

  if (issue.body) {
    console.log();
    console.log(issue.body);
  }

  console.log();
  console.log(
    colors.dim(`View online: ${getServerUrl()}/${owner}/${repoName}/issues/${issueNumber}`)
  );
  console.log();
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
