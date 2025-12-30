/**
 * Merge Queue Commands
 *
 * Manage the merge queue from the command line.
 *
 * Usage:
 *   wit merge-queue add [<pr-number>]     Add a PR to the merge queue
 *   wit merge-queue remove [<pr-number>]  Remove a PR from the queue
 *   wit merge-queue status                Show queue status
 *   wit merge-queue list                  List PRs in the queue
 *   wit merge-queue config                Configure merge queue settings
 */

import { getApiClient, ApiError } from '../api/client';
import { Repository } from '../core/repository';
import { parseRemoteUrl } from '../core/protocol';
import { TsgitError, ErrorCode } from '../core/errors';
import { colors } from '../utils/colors';

export const MERGE_QUEUE_HELP = `
wit merge-queue - Manage the merge queue

Usage: wit merge-queue <command> [options]

Commands:
  add [<pr>]        Add a PR to the merge queue (defaults to current branch's PR)
  remove [<pr>]     Remove a PR from the queue
  status [<pr>]     Show queue position for a PR
  list              List all PRs in the queue
  stats             Show queue statistics
  config            Configure merge queue settings
  enable            Enable merge queue for the default branch
  disable           Disable merge queue for the default branch

Options:
  -h, --help        Show this help message
  -b, --branch      Target branch (default: main)
  -p, --priority    Set priority (0-100, higher = more urgent)
  --json            Output in JSON format

Examples:
  wit merge-queue add                Add current branch's PR to queue
  wit merge-queue add 123            Add PR #123 to queue
  wit merge-queue add 123 -p 50      Add PR #123 with priority 50
  wit merge-queue remove 123         Remove PR #123 from queue
  wit merge-queue status             Show current PR's queue position
  wit merge-queue list               List all queued PRs
  wit merge-queue stats              Show queue statistics
  wit merge-queue config --strategy adaptive    Set merge strategy
  wit merge-queue enable             Enable merge queue for main
`;

/**
 * Parse owner and repo from remote URL
 */
function parseOwnerRepo(url: string): { owner: string; repo: string } {
  const parsed = parseRemoteUrl(url);

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
 * Format a state with color
 */
function formatState(state: string): string {
  switch (state) {
    case 'pending':
      return colors.yellow('pending');
    case 'preparing':
    case 'testing':
      return colors.cyan('processing');
    case 'ready':
      return colors.green('ready');
    case 'merging':
      return colors.magenta('merging');
    case 'completed':
      return colors.green('merged');
    case 'failed':
      return colors.red('failed');
    case 'cancelled':
      return colors.dim('cancelled');
    default:
      return state;
  }
}

/**
 * Main handler for merge-queue command
 */
export async function handleMergeQueue(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    console.log(MERGE_QUEUE_HELP);
    return;
  }

  try {
    switch (subcommand) {
      case 'add':
        await handleAdd(args.slice(1));
        break;
      case 'remove':
        await handleRemove(args.slice(1));
        break;
      case 'status':
        await handleStatus(args.slice(1));
        break;
      case 'list':
        await handleList(args.slice(1));
        break;
      case 'stats':
        await handleStats(args.slice(1));
        break;
      case 'config':
        await handleConfig(args.slice(1));
        break;
      case 'enable':
        await handleEnable(args.slice(1));
        break;
      case 'disable':
        await handleDisable(args.slice(1));
        break;
      default:
        console.error(`Unknown subcommand: ${subcommand}`);
        console.log(MERGE_QUEUE_HELP);
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(colors.red(`Error: ${error.message}`));
      if (error.status === 401) {
        console.log(colors.dim('Run "wit auth login" to authenticate'));
      }
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Add a PR to the merge queue
 */
async function handleAdd(_args: string[]): Promise<void> {
  // TODO: Implement merge queue add command
  // This requires additional API endpoints to be implemented
  console.log(colors.yellow('Merge queue add command is not yet implemented.'));
  console.log(colors.dim('This feature requires server-side merge queue API support.'));
}

/**
 * Remove a PR from the merge queue
 */
async function handleRemove(_args: string[]): Promise<void> {
  console.log(colors.yellow('Merge queue remove command is not yet implemented.'));
  console.log(colors.dim('This feature requires server-side merge queue API support.'));
}

/**
 * Show queue status for a PR
 */
async function handleStatus(_args: string[]): Promise<void> {
  console.log(colors.yellow('Merge queue status command is not yet implemented.'));
  console.log(colors.dim('This feature requires server-side merge queue API support.'));
}

/**
 * List PRs in the queue
 */
async function handleList(_args: string[]): Promise<void> {
  console.log(colors.yellow('Merge queue list command is not yet implemented.'));
  console.log(colors.dim('This feature requires server-side merge queue API support.'));
}

/**
 * Show queue statistics
 */
async function handleStats(_args: string[]): Promise<void> {
  console.log(colors.yellow('Merge queue stats command is not yet implemented.'));
  console.log(colors.dim('This feature requires server-side merge queue API support.'));
}

/**
 * Configure merge queue settings
 */
async function handleConfig(_args: string[]): Promise<void> {
  console.log(colors.yellow('Merge queue config command is not yet implemented.'));
  console.log(colors.dim('This feature requires server-side merge queue API support.'));
}

/**
 * Enable merge queue for a branch
 */
async function handleEnable(_args: string[]): Promise<void> {
  console.log(colors.yellow('Merge queue enable command is not yet implemented.'));
  console.log(colors.dim('This feature requires server-side merge queue API support.'));
}

/**
 * Disable merge queue for a branch
 */
async function handleDisable(_args: string[]): Promise<void> {
  console.log(colors.yellow('Merge queue disable command is not yet implemented.'));
  console.log(colors.dim('This feature requires server-side merge queue API support.'));
}

// Unused but kept for future implementation
void getRemoteUrl;
void parseOwnerRepo;
void formatState;
void getApiClient;
