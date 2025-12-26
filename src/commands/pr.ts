/**
 * Pull Request Commands
 *
 * Manage pull requests from the command line.
 *
 * Usage:
 *   wit pr create           Create a pull request from current branch
 *   wit pr list             List pull requests
 *   wit pr view <number>    View pull request details
 *   wit pr checkout <num>   Checkout a pull request locally
 *   wit pr merge <number>   Merge a pull request
 *   wit pr close <number>   Close a pull request
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

export const PR_HELP = `
wit pr - Manage pull requests

Usage: wit pr <command> [options]

Commands:
  create          Create a pull request from current branch
  list            List pull requests
  view <number>   View pull request details
  checkout <num>  Checkout a pull request locally
  merge <number>  Merge a pull request
  close <number>  Close a pull request
  reopen <number> Reopen a closed pull request

Options:
  -h, --help      Show this help message

Examples:
  wit pr create                     Create PR from current branch to main
  wit pr create -b develop          Create PR targeting develop branch
  wit pr create -t "Add feature"    Create PR with title
  wit pr list                       List open PRs
  wit pr list --state closed        List closed PRs
  wit pr list --state all           List all PRs
  wit pr view 123                   View PR #123
  wit pr checkout 123               Fetch and checkout PR #123
  wit pr merge 123                  Merge PR #123
  wit pr close 123                  Close PR #123
  wit pr reopen 123                 Reopen PR #123
`;

/**
 * Parse owner and repo from remote URL
 */
function parseOwnerRepo(url: string): { owner: string; repo: string } {
  const parsed = parseRemoteUrl(url);

  // Extract owner/repo from path
  // Path could be: /user/repo.git, user/repo.git, /user/repo, user/repo
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
 * Main handler for pr command
 */
export async function handlePr(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    console.log(PR_HELP);
    return;
  }

  try {
    switch (subcommand) {
      case 'create':
        await handlePrCreate(args.slice(1));
        break;
      case 'list':
        await handlePrList(args.slice(1));
        break;
      case 'view':
        await handlePrView(args.slice(1));
        break;
      case 'checkout':
        await handlePrCheckout(args.slice(1));
        break;
      case 'merge':
        await handlePrMerge(args.slice(1));
        break;
      case 'close':
        await handlePrClose(args.slice(1));
        break;
      case 'reopen':
        await handlePrReopen(args.slice(1));
        break;
      default:
        console.error(colors.red('error: ') + `Unknown subcommand: '${subcommand}'`);
        console.log(PR_HELP);
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
        b: 'base',
        t: 'title',
        m: 'body',
        s: 'state',
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
 * Create a new pull request
 */
async function handlePrCreate(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags, positional } = parseArgs(args);

  // Get current branch
  const currentBranch = repo.refs.getCurrentBranch();
  if (!currentBranch) {
    throw new TsgitError(
      'Not on a branch (detached HEAD)',
      ErrorCode.DETACHED_HEAD,
      ['Switch to a branch with: wit switch <branch>']
    );
  }

  if (currentBranch === 'main' || currentBranch === 'master') {
    throw new TsgitError(
      `Cannot create PR from ${currentBranch} branch`,
      ErrorCode.INVALID_ARGUMENT,
      ['Create a feature branch first: wit switch -c my-feature']
    );
  }

  // Get remote info
  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Determine target branch
  const targetBranch = (flags.base as string) || 'main';

  // Get SHA values
  const headRef = repo.refs.resolve(currentBranch);
  const baseRef =
    repo.refs.resolve(targetBranch) ||
    repo.refs.resolve(`origin/${targetBranch}`) ||
    repo.refs.resolve(`refs/remotes/origin/${targetBranch}`);

  if (!headRef) {
    throw new TsgitError(
      `Cannot resolve current branch: ${currentBranch}`,
      ErrorCode.REF_NOT_FOUND
    );
  }

  if (!baseRef) {
    throw new TsgitError(
      `Cannot resolve target branch: ${targetBranch}`,
      ErrorCode.REF_NOT_FOUND,
      [
        `Make sure ${targetBranch} exists locally or fetch it: wit fetch origin ${targetBranch}`,
        `Or specify a different base branch: wit pr create -b <branch>`,
      ]
    );
  }

  // Get title from args or last commit message
  let title = (flags.title as string) || positional[0];
  if (!title) {
    const headCommit = repo.objects.readCommit(headRef);
    title = headCommit.message.split('\n')[0];
  }

  // Get body if provided
  const body = flags.body as string | undefined;

  console.log(`Creating pull request...`);
  console.log(`  ${colors.cyan(currentBranch)} → ${colors.cyan(targetBranch)}`);
  console.log(`  ${colors.bold(title)}`);
  console.log();

  const pr = await api.pulls.create(owner, repoName, {
    title,
    body,
    sourceBranch: currentBranch,
    targetBranch,
    headSha: headRef,
    baseSha: baseRef,
  });

  console.log(colors.green('✓') + ` Created pull request #${pr.number}`);
  console.log(`  ${colors.dim(`${getServerUrl()}/${owner}/${repoName}/pulls/${pr.number}`)}`);
}

/**
 * List pull requests
 */
async function handlePrList(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Parse state filter
  const state = (flags.state as 'open' | 'closed' | 'merged' | 'all') || 'open';

  const prs = await api.pulls.list(owner, repoName, { state: state === 'all' ? undefined : state });

  if (prs.length === 0) {
    console.log(`No ${state === 'all' ? '' : state + ' '}pull requests`);
    return;
  }

  const stateLabel = state === 'all' ? 'All' : state.charAt(0).toUpperCase() + state.slice(1);
  console.log(`\n${colors.bold(`${stateLabel} pull requests:`)}\n`);

  for (const pr of prs) {
    const stateIcon =
      pr.state === 'open'
        ? colors.green('●')
        : pr.state === 'merged'
          ? colors.magenta('●')
          : colors.red('●');

    console.log(`${stateIcon} #${pr.number} ${pr.title}`);
    console.log(
      `  ${colors.dim(`${pr.sourceBranch} → ${pr.targetBranch} by ${pr.author?.username || 'unknown'}`)}`
    );
  }
  console.log();
}

/**
 * View pull request details
 */
async function handlePrView(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const prNumber = parseInt(positional[0], 10);

  if (isNaN(prNumber)) {
    console.error(colors.red('error: ') + 'PR number required');
    console.error('usage: wit pr view <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const pr = await api.pulls.get(owner, repoName, prNumber);

  const stateColor =
    pr.state === 'open' ? colors.green : pr.state === 'merged' ? colors.magenta : colors.red;

  console.log();
  console.log(
    `${stateColor(`[${pr.state.toUpperCase()}]`)} ${colors.bold(pr.title)} ${colors.dim(`#${pr.number}`)}`
  );
  console.log(colors.dim('─'.repeat(60)));
  console.log(`Author:  ${pr.author?.username || 'unknown'}`);
  console.log(`Branch:  ${pr.sourceBranch} → ${pr.targetBranch}`);
  console.log(`Created: ${new Date(pr.createdAt).toLocaleDateString()}`);

  if (pr.mergedAt) {
    console.log(`Merged:  ${new Date(pr.mergedAt).toLocaleDateString()}`);
  }
  if (pr.closedAt && pr.state === 'closed') {
    console.log(`Closed:  ${new Date(pr.closedAt).toLocaleDateString()}`);
  }

  if (pr.body) {
    console.log();
    console.log(pr.body);
  }

  console.log();
  console.log(colors.dim(`View online: ${getServerUrl()}/${owner}/${repoName}/pulls/${prNumber}`));
  console.log();
}

/**
 * Checkout a pull request locally
 */
async function handlePrCheckout(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const prNumber = parseInt(positional[0], 10);

  if (isNaN(prNumber)) {
    console.error(colors.red('error: ') + 'PR number required');
    console.error('usage: wit pr checkout <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const pr = await api.pulls.get(owner, repoName, prNumber);

  // Create local branch for the PR
  const branchName = `pr-${prNumber}`;

  console.log(`Fetching PR #${prNumber}: ${pr.title}`);
  console.log(`  ${colors.dim(`${pr.sourceBranch} → ${pr.targetBranch}`)}`);

  // Check if we have the commit locally
  if (!repo.objects.hasObject(pr.headSha)) {
    console.log(`  Fetching commit ${pr.headSha.slice(0, 8)}...`);
    // In a real implementation, we would fetch from remote here
    console.log(
      colors.yellow('!') +
        ` Commit not found locally. Run: wit fetch origin ${pr.sourceBranch}`
    );
    process.exit(1);
  }

  // Create branch pointing to PR head
  try {
    repo.refs.createBranch(branchName, pr.headSha);
    console.log(colors.green('✓') + ` Created branch ${branchName}`);
  } catch {
    // Branch might already exist
    console.log(colors.yellow('!') + ` Branch ${branchName} already exists`);
  }

  // Switch to the branch
  repo.refs.setHeadSymbolic(`refs/heads/${branchName}`);
  console.log(colors.green('✓') + ` Switched to branch ${branchName}`);
}

/**
 * Merge a pull request
 */
async function handlePrMerge(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const prNumber = parseInt(positional[0], 10);

  if (isNaN(prNumber)) {
    console.error(colors.red('error: ') + 'PR number required');
    console.error('usage: wit pr merge <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Get PR to check state
  const pr = await api.pulls.get(owner, repoName, prNumber);

  if (pr.state !== 'open') {
    throw new TsgitError(
      `PR #${prNumber} is not open (state: ${pr.state})`,
      ErrorCode.OPERATION_FAILED,
      pr.state === 'merged' ? [] : ['Reopen the PR first: wit pr reopen ' + prNumber]
    );
  }

  console.log(`Merging PR #${prNumber}: ${pr.title}`);

  const mergeMethod = (flags.method as 'merge' | 'squash' | 'rebase') || 'merge';
  const result = await api.pulls.merge(owner, repoName, prNumber, { mergeMethod });

  if (result.merged) {
    console.log(colors.green('✓') + ` Merged PR #${prNumber}`);
    console.log(`  Merge commit: ${result.sha.slice(0, 8)}`);
  } else {
    console.error(colors.red('error: ') + 'Failed to merge PR');
    process.exit(1);
  }
}

/**
 * Close a pull request
 */
async function handlePrClose(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const prNumber = parseInt(positional[0], 10);

  if (isNaN(prNumber)) {
    console.error(colors.red('error: ') + 'PR number required');
    console.error('usage: wit pr close <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.pulls.close(owner, repoName, prNumber);
  console.log(colors.yellow('✓') + ` Closed PR #${prNumber}`);
}

/**
 * Reopen a pull request
 */
async function handlePrReopen(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const prNumber = parseInt(positional[0], 10);

  if (isNaN(prNumber)) {
    console.error(colors.red('error: ') + 'PR number required');
    console.error('usage: wit pr reopen <number>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  await api.pulls.reopen(owner, repoName, prNumber);
  console.log(colors.green('✓') + ` Reopened PR #${prNumber}`);
}
