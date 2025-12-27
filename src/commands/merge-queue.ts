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
    throw new TRPCError(
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
async function handleAdd(args: string[]): Promise<void> {
  const repo = await Repository.discover(process.cwd());
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);
  const client = await getApiClient();

  // Parse arguments
  let prNumber: number | undefined;
  let priority = 0;
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (arg === '-p' || arg === '--priority') {
      priority = parseInt(args[i + 1] || '0', 10);
      i += 2;
    } else if (!arg.startsWith('-') && !prNumber) {
      prNumber = parseInt(arg, 10);
      i++;
    } else {
      i++;
    }
  }

  // If no PR number, find PR for current branch
  if (!prNumber) {
    const currentBranch = repo.refs.getCurrentBranch();
    if (!currentBranch) {
      throw new TsgitError(
        'Not on a branch',
        ErrorCode.DETACHED_HEAD,
        ['Checkout a branch first: wit checkout <branch>']
      );
    }

    // Find repo ID first
    const repoInfo = await client.repos.getByOwnerAndName.query({
      owner,
      name: repoName,
    });

    // List open PRs for this branch
    const prs = await client.pulls.list.query({
      repoId: repoInfo.id,
      state: 'open',
    });

    const pr = prs.find(p => p.sourceBranch === currentBranch);
    if (!pr) {
      throw new TsgitError(
        `No open PR found for branch "${currentBranch}"`,
        ErrorCode.NOT_FOUND,
        ['Create a PR first: wit pr create']
      );
    }
    prNumber = pr.number;
  }

  // Get repo and PR info
  const repoInfo = await client.repos.getByOwnerAndName.query({
    owner,
    name: repoName,
  });

  const pr = await client.pulls.getByNumber.query({
    repoId: repoInfo.id,
    number: prNumber,
  });

  // Add to queue
  const result = await client.mergeQueue.addToQueue.mutate({
    prId: pr.id,
    priority,
  });

  console.log(colors.green(`✓ ${result.message}`));
  if (priority > 0) {
    console.log(colors.dim(`  Priority: ${priority}`));
  }
}

/**
 * Remove a PR from the merge queue
 */
async function handleRemove(args: string[]): Promise<void> {
  const repo = await Repository.discover(process.cwd());
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);
  const client = await getApiClient();

  // Parse PR number
  let prNumber: number | undefined;
  for (const arg of args) {
    if (!arg.startsWith('-')) {
      prNumber = parseInt(arg, 10);
      break;
    }
  }

  if (!prNumber) {
    // Find PR for current branch
    const currentBranch = repo.refs.getCurrentBranch();
    if (!currentBranch) {
      throw new TsgitError('Not on a branch', ErrorCode.DETACHED_HEAD);
    }

    const repoInfo = await client.repos.getByOwnerAndName.query({
      owner,
      name: repoName,
    });

    const prs = await client.pulls.list.query({
      repoId: repoInfo.id,
      state: 'open',
    });

    const pr = prs.find(p => p.sourceBranch === currentBranch);
    if (!pr) {
      throw new TsgitError(`No open PR found for branch "${currentBranch}"`, ErrorCode.NOT_FOUND);
    }
    prNumber = pr.number;
  }

  // Get repo and PR info
  const repoInfo = await client.repos.getByOwnerAndName.query({
    owner,
    name: repoName,
  });

  const pr = await client.pulls.getByNumber.query({
    repoId: repoInfo.id,
    number: prNumber,
  });

  // Remove from queue
  const result = await client.mergeQueue.removeFromQueue.mutate({
    prId: pr.id,
  });

  console.log(colors.green(`✓ ${result.message}`));
}

/**
 * Show queue status for a PR
 */
async function handleStatus(args: string[]): Promise<void> {
  const repo = await Repository.discover(process.cwd());
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);
  const client = await getApiClient();

  const isJson = args.includes('--json');

  // Parse PR number
  let prNumber: number | undefined;
  for (const arg of args) {
    if (!arg.startsWith('-')) {
      prNumber = parseInt(arg, 10);
      break;
    }
  }

  if (!prNumber) {
    // Find PR for current branch
    const currentBranch = repo.refs.getCurrentBranch();
    if (!currentBranch) {
      throw new TsgitError('Not on a branch', ErrorCode.DETACHED_HEAD);
    }

    const repoInfo = await client.repos.getByOwnerAndName.query({
      owner,
      name: repoName,
    });

    const prs = await client.pulls.list.query({
      repoId: repoInfo.id,
      state: 'open',
    });

    const pr = prs.find(p => p.sourceBranch === currentBranch);
    if (!pr) {
      throw new TsgitError(`No open PR found for branch "${currentBranch}"`, ErrorCode.NOT_FOUND);
    }
    prNumber = pr.number;
  }

  // Get repo and PR info
  const repoInfo = await client.repos.getByOwnerAndName.query({
    owner,
    name: repoName,
  });

  const pr = await client.pulls.getByNumber.query({
    repoId: repoInfo.id,
    number: prNumber,
  });

  // Get queue position
  const position = await client.mergeQueue.getQueuePosition.query({
    prId: pr.id,
  });

  if (isJson) {
    console.log(JSON.stringify(position, null, 2));
    return;
  }

  if (!position.inQueue) {
    console.log(`PR #${prNumber} is not in the merge queue`);
    console.log(colors.dim('Add it with: wit merge-queue add'));
    return;
  }

  console.log(colors.bold(`Merge Queue Status for PR #${prNumber}`));
  console.log();
  console.log(`  Position: ${colors.cyan(`${position.position + 1}`)} of ${position.totalInQueue}`);
  console.log(`  Estimated wait: ${colors.yellow(`~${position.estimatedWaitMinutes} minutes`)}`);
}

/**
 * List PRs in the queue
 */
async function handleList(args: string[]): Promise<void> {
  const repo = await Repository.discover(process.cwd());
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);
  const client = await getApiClient();

  const isJson = args.includes('--json');
  const includeCompleted = args.includes('--all');

  // Parse target branch
  let targetBranch = 'main';
  const branchIdx = args.findIndex(a => a === '-b' || a === '--branch');
  if (branchIdx !== -1 && args[branchIdx + 1]) {
    targetBranch = args[branchIdx + 1];
  }

  // Get repo info
  const repoInfo = await client.repos.getByOwnerAndName.query({
    owner,
    name: repoName,
  });

  // Get queue
  const entries = await client.mergeQueue.listQueue.query({
    repoId: repoInfo.id,
    targetBranch,
    includeCompleted,
  });

  if (isJson) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log('No PRs in the merge queue');
    console.log(colors.dim(`Add one with: wit merge-queue add <pr-number>`));
    return;
  }

  console.log(colors.bold(`Merge Queue for ${repoName}:${targetBranch}`));
  console.log();

  for (const entry of entries) {
    const position = `#${entry.position + 1}`;
    const prNum = colors.cyan(`#${entry.pr.number}`);
    const title = entry.pr.title.length > 50
      ? entry.pr.title.slice(0, 47) + '...'
      : entry.pr.title;
    const state = formatState(entry.state);

    console.log(`  ${position.padEnd(4)} ${prNum.padEnd(10)} ${state.padEnd(15)} ${title}`);

    if (entry.errorMessage) {
      console.log(colors.red(`        Error: ${entry.errorMessage}`));
    }
  }
  console.log();
}

/**
 * Show queue statistics
 */
async function handleStats(args: string[]): Promise<void> {
  const repo = await Repository.discover(process.cwd());
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);
  const client = await getApiClient();

  const isJson = args.includes('--json');

  // Parse target branch
  let targetBranch = 'main';
  const branchIdx = args.findIndex(a => a === '-b' || a === '--branch');
  if (branchIdx !== -1 && args[branchIdx + 1]) {
    targetBranch = args[branchIdx + 1];
  }

  // Get repo info
  const repoInfo = await client.repos.getByOwnerAndName.query({
    owner,
    name: repoName,
  });

  // Get stats
  const stats = await client.mergeQueue.getStats.query({
    repoId: repoInfo.id,
    targetBranch,
  });

  if (isJson) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(colors.bold(`Merge Queue Statistics for ${repoName}:${targetBranch}`));
  console.log();
  console.log(`  Pending:           ${colors.yellow(stats.pending.toString())}`);
  console.log(`  Processing:        ${colors.cyan(stats.processing.toString())}`);
  console.log(`  Merged today:      ${colors.green(stats.completedToday.toString())}`);
  console.log(`  Failed today:      ${colors.red(stats.failedToday.toString())}`);
  console.log(`  Avg merge time:    ${stats.avgMergeTimeMinutes} minutes`);
  console.log();
}

/**
 * Configure merge queue settings
 */
async function handleConfig(args: string[]): Promise<void> {
  const repo = await Repository.discover(process.cwd());
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);
  const client = await getApiClient();

  // Parse target branch
  let targetBranch = 'main';
  const branchIdx = args.findIndex(a => a === '-b' || a === '--branch');
  if (branchIdx !== -1 && args[branchIdx + 1]) {
    targetBranch = args[branchIdx + 1];
  }

  // Get repo info
  const repoInfo = await client.repos.getByOwnerAndName.query({
    owner,
    name: repoName,
  });

  // Parse config options
  const updates: Record<string, any> = {};

  const strategyIdx = args.findIndex(a => a === '--strategy');
  if (strategyIdx !== -1 && args[strategyIdx + 1]) {
    updates.strategy = args[strategyIdx + 1];
  }

  const batchIdx = args.findIndex(a => a === '--batch-size');
  if (batchIdx !== -1 && args[batchIdx + 1]) {
    updates.maxBatchSize = parseInt(args[batchIdx + 1], 10);
  }

  const waitIdx = args.findIndex(a => a === '--min-wait');
  if (waitIdx !== -1 && args[waitIdx + 1]) {
    updates.minWaitSeconds = parseInt(args[waitIdx + 1], 10);
  }

  if (args.includes('--auto-rebase')) {
    updates.autoRebase = true;
  }
  if (args.includes('--no-auto-rebase')) {
    updates.autoRebase = false;
  }

  if (args.includes('--delete-branch')) {
    updates.deleteBranchAfterMerge = true;
  }
  if (args.includes('--no-delete-branch')) {
    updates.deleteBranchAfterMerge = false;
  }

  if (Object.keys(updates).length === 0) {
    // Show current config
    const config = await client.mergeQueue.getConfig.query({
      repoId: repoInfo.id,
      targetBranch,
    });

    console.log(colors.bold(`Merge Queue Configuration for ${repoName}:${targetBranch}`));
    console.log();
    console.log(`  Enabled:           ${config.enabled ? colors.green('yes') : colors.red('no')}`);
    console.log(`  Strategy:          ${config.strategy}`);
    console.log(`  Max batch size:    ${config.maxBatchSize}`);
    console.log(`  Min wait (sec):    ${config.minWaitSeconds}`);
    console.log(`  Auto rebase:       ${config.autoRebase ? 'yes' : 'no'}`);
    console.log(`  Delete branches:   ${config.deleteBranchAfterMerge ? 'yes' : 'no'}`);
    if (config.requiredChecks?.length > 0) {
      console.log(`  Required checks:   ${config.requiredChecks.join(', ')}`);
    }
    console.log();
    console.log(colors.dim('Update with: wit merge-queue config --strategy <strategy>'));
    return;
  }

  // Update config
  await client.mergeQueue.updateConfig.mutate({
    repoId: repoInfo.id,
    targetBranch,
    ...updates,
  });

  console.log(colors.green('✓ Merge queue configuration updated'));
}

/**
 * Enable merge queue for a branch
 */
async function handleEnable(args: string[]): Promise<void> {
  const repo = await Repository.discover(process.cwd());
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);
  const client = await getApiClient();

  // Parse target branch
  let targetBranch = 'main';
  const branchIdx = args.findIndex(a => a === '-b' || a === '--branch');
  if (branchIdx !== -1 && args[branchIdx + 1]) {
    targetBranch = args[branchIdx + 1];
  }

  // Get repo info
  const repoInfo = await client.repos.getByOwnerAndName.query({
    owner,
    name: repoName,
  });

  // Enable merge queue
  await client.mergeQueue.updateConfig.mutate({
    repoId: repoInfo.id,
    targetBranch,
    enabled: true,
  });

  console.log(colors.green(`✓ Merge queue enabled for ${targetBranch}`));
}

/**
 * Disable merge queue for a branch
 */
async function handleDisable(args: string[]): Promise<void> {
  const repo = await Repository.discover(process.cwd());
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);
  const client = await getApiClient();

  // Parse target branch
  let targetBranch = 'main';
  const branchIdx = args.findIndex(a => a === '-b' || a === '--branch');
  if (branchIdx !== -1 && args[branchIdx + 1]) {
    targetBranch = args[branchIdx + 1];
  }

  // Get repo info
  const repoInfo = await client.repos.getByOwnerAndName.query({
    owner,
    name: repoName,
  });

  // Disable merge queue
  await client.mergeQueue.updateConfig.mutate({
    repoId: repoInfo.id,
    targetBranch,
    enabled: false,
  });

  console.log(colors.yellow(`✓ Merge queue disabled for ${targetBranch}`));
}

// Fix the error import
class TRPCError extends TsgitError {
  constructor(message: string, code: ErrorCode, suggestions?: string[]) {
    super(message, code, suggestions);
  }
}
