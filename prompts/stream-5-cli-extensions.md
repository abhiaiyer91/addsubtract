# Stream 5: CLI Extensions

## Mission

Extend the `wit` CLI with platform features: pull requests, issues, and repository management. Users should be able to create PRs, manage issues, and interact with the platform entirely from the command line.

## Context

We have:

- **wit CLI** - Full local git implementation
- **Git Server** (`src/server/`) - Push/pull working
- **tRPC API** (`src/api/trpc/`) - Type-safe API

We need to add commands that talk to the tRPC API for platform features.

## Key Deliverables

### 1. New Commands

```
src/commands/
├── pr.ts          # Pull request commands
├── issue.ts       # Issue commands (already exists, extend it)
└── repo-remote.ts # Remote repository management
```

### 2. API Client

```
src/api/
└── client.ts      # tRPC client for CLI
```

---

## Implementation Guide

### Step 1: Create API Client

```typescript
// src/api/client.ts
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "./trpc/routers";
import { loadGitHubCredentials } from "../core/github";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Get server URL from config or env
function getServerUrl(): string {
  return process.env.WIT_SERVER_URL || "http://localhost:3000";
}

// Get auth token
function getAuthToken(): string | undefined {
  // Check env first
  if (process.env.WIT_TOKEN) {
    return process.env.WIT_TOKEN;
  }

  // Check stored credentials
  const configPath = path.join(
    os.homedir(),
    ".config",
    "wit",
    "credentials.json"
  );
  if (fs.existsSync(configPath)) {
    const creds = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return creds.token;
  }

  return undefined;
}

// Create tRPC client
export function createApiClient() {
  const token = getAuthToken();

  return createTRPCProxyClient<AppRouter>({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: `${getServerUrl()}/trpc`,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    ],
  });
}

// Singleton for convenience
let _client: ReturnType<typeof createApiClient> | null = null;

export function getApiClient() {
  if (!_client) {
    _client = createApiClient();
  }
  return _client;
}
```

### Step 2: Pull Request Commands

```typescript
// src/commands/pr.ts
import { getApiClient } from "../api/client";
import { Repository } from "../core/repository";
import { parseRemoteUrl } from "../core/protocol/url-parser";
import chalk from "chalk";

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
  review <number> Start a review

Options:
  -h, --help      Show this help message

Examples:
  wit pr create                     Create PR from current branch to main
  wit pr create -b develop          Create PR targeting develop branch
  wit pr list                       List open PRs
  wit pr list --state closed        List closed PRs
  wit pr view 123                   View PR #123
  wit pr checkout 123               Fetch and checkout PR #123
  wit pr merge 123                  Merge PR #123
`;

export async function handlePr(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === "-h" || subcommand === "--help") {
    console.log(PR_HELP);
    return;
  }

  switch (subcommand) {
    case "create":
      return handlePrCreate(args.slice(1));
    case "list":
      return handlePrList(args.slice(1));
    case "view":
      return handlePrView(args.slice(1));
    case "checkout":
      return handlePrCheckout(args.slice(1));
    case "merge":
      return handlePrMerge(args.slice(1));
    case "close":
      return handlePrClose(args.slice(1));
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.log(PR_HELP);
      process.exit(1);
  }
}

async function handlePrCreate(args: string[]): Promise<void> {
  const repo = new Repository(process.cwd());
  const api = getApiClient();

  // Get current branch
  const currentBranch = repo.refs.getCurrentBranch();
  if (
    !currentBranch ||
    currentBranch === "main" ||
    currentBranch === "master"
  ) {
    console.error("error: Cannot create PR from main/master branch");
    console.error(
      "hint: Create a feature branch first: wit switch -c my-feature"
    );
    process.exit(1);
  }

  // Parse target branch from args
  let targetBranch = "main";
  const baseIdx = args.indexOf("-b") || args.indexOf("--base");
  if (baseIdx !== -1 && args[baseIdx + 1]) {
    targetBranch = args[baseIdx + 1];
  }

  // Get remote info
  const remoteUrl = repo.config.get("remote.origin.url");
  if (!remoteUrl) {
    console.error("error: No remote origin configured");
    process.exit(1);
  }

  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl);

  // Get head SHA
  const headSha = repo.refs.resolve(currentBranch);
  const baseSha =
    repo.refs.resolve(targetBranch) ||
    repo.refs.resolve(`origin/${targetBranch}`);

  if (!headSha || !baseSha) {
    console.error("error: Could not resolve branch SHAs");
    process.exit(1);
  }

  // Get title from args or prompt
  let title = args.find((a) => !a.startsWith("-"));
  if (!title) {
    // Use last commit message as default title
    const headCommit = repo.objects.readCommit(headSha);
    title = headCommit.message.split("\n")[0];
  }

  console.log(`Creating pull request...`);
  console.log(`  ${currentBranch} → ${targetBranch}`);

  try {
    // Get repo ID first
    const repoData = await api.repos.get.query({ owner, repo: repoName });

    const pr = await api.pulls.create.mutate({
      repoId: repoData.repo.id,
      title,
      sourceBranch: currentBranch,
      targetBranch,
      headSha,
      baseSha,
    });

    console.log(chalk.green(`\n✓ Created pull request #${pr.number}`));
    console.log(`  ${chalk.blue(pr.title)}`);
    console.log(`  ${getServerUrl()}/${owner}/${repoName}/pulls/${pr.number}`);
  } catch (error: any) {
    console.error(`error: Failed to create PR: ${error.message}`);
    process.exit(1);
  }
}

async function handlePrList(args: string[]): Promise<void> {
  const repo = new Repository(process.cwd());
  const api = getApiClient();

  const remoteUrl = repo.config.get("remote.origin.url");
  if (!remoteUrl) {
    console.error("error: No remote origin configured");
    process.exit(1);
  }

  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl);

  // Parse state filter
  let state: "open" | "closed" | "merged" | "all" = "open";
  const stateIdx = args.indexOf("--state");
  if (stateIdx !== -1 && args[stateIdx + 1]) {
    state = args[stateIdx + 1] as any;
  }

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const prs = await api.pulls.list.query({
      repoId: repoData.repo.id,
      state,
    });

    if (prs.length === 0) {
      console.log(`No ${state} pull requests`);
      return;
    }

    console.log(
      `\n${state.charAt(0).toUpperCase() + state.slice(1)} pull requests:\n`
    );

    for (const pr of prs) {
      const stateIcon =
        pr.state === "open"
          ? chalk.green("●")
          : pr.state === "merged"
          ? chalk.magenta("●")
          : chalk.red("●");
      console.log(`${stateIcon} #${pr.number} ${pr.title}`);
      console.log(
        `  ${chalk.dim(
          `${pr.sourceBranch} → ${pr.targetBranch} by ${pr.author.username}`
        )}`
      );
    }
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

async function handlePrView(args: string[]): Promise<void> {
  const prNumber = parseInt(args[0]);
  if (isNaN(prNumber)) {
    console.error("error: PR number required");
    console.error("usage: wit pr view <number>");
    process.exit(1);
  }

  const repo = new Repository(process.cwd());
  const api = getApiClient();

  const remoteUrl = repo.config.get("remote.origin.url");
  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl!);

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const pr = await api.pulls.get.query({
      repoId: repoData.repo.id,
      number: prNumber,
    });

    const stateColor =
      pr.state === "open"
        ? chalk.green
        : pr.state === "merged"
        ? chalk.magenta
        : chalk.red;

    console.log(
      `\n${stateColor(`[${pr.state.toUpperCase()}]`)} ${chalk.bold(
        pr.title
      )} ${chalk.dim(`#${pr.number}`)}`
    );
    console.log(`${chalk.dim("─".repeat(60))}`);
    console.log(`Author:  ${pr.author.username}`);
    console.log(`Branch:  ${pr.sourceBranch} → ${pr.targetBranch}`);
    console.log(`Created: ${new Date(pr.createdAt).toLocaleDateString()}`);

    if (pr.body) {
      console.log(`\n${pr.body}`);
    }

    console.log(
      `\n${chalk.dim(
        `View online: ${getServerUrl()}/${owner}/${repoName}/pulls/${prNumber}`
      )}`
    );
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

async function handlePrCheckout(args: string[]): Promise<void> {
  const prNumber = parseInt(args[0]);
  if (isNaN(prNumber)) {
    console.error("error: PR number required");
    process.exit(1);
  }

  const repo = new Repository(process.cwd());
  const api = getApiClient();

  const remoteUrl = repo.config.get("remote.origin.url");
  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl!);

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const pr = await api.pulls.get.query({
      repoId: repoData.repo.id,
      number: prNumber,
    });

    // Fetch the PR branch
    console.log(`Fetching ${pr.sourceBranch}...`);
    // TODO: Implement fetch of specific branch

    // Create local branch
    const branchName = `pr-${prNumber}`;
    repo.refs.createBranch(branchName, pr.headSha);

    // Switch to it
    // TODO: Implement switch

    console.log(chalk.green(`✓ Checked out PR #${prNumber} as ${branchName}`));
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

async function handlePrMerge(args: string[]): Promise<void> {
  const prNumber = parseInt(args[0]);
  if (isNaN(prNumber)) {
    console.error("error: PR number required");
    process.exit(1);
  }

  const repo = new Repository(process.cwd());
  const api = getApiClient();

  const remoteUrl = repo.config.get("remote.origin.url");
  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl!);

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const pr = await api.pulls.get.query({
      repoId: repoData.repo.id,
      number: prNumber,
    });

    if (pr.state !== "open") {
      console.error(`error: PR #${prNumber} is not open (state: ${pr.state})`);
      process.exit(1);
    }

    console.log(`Merging PR #${prNumber}: ${pr.title}`);

    // TODO: Actually perform merge and get merge SHA
    const mergeSha = "TODO";

    await api.pulls.merge.mutate({
      prId: pr.id,
      mergeSha,
    });

    console.log(chalk.green(`✓ Merged PR #${prNumber}`));
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

async function handlePrClose(args: string[]): Promise<void> {
  const prNumber = parseInt(args[0]);
  if (isNaN(prNumber)) {
    console.error("error: PR number required");
    process.exit(1);
  }

  const api = getApiClient();
  const repo = new Repository(process.cwd());

  const remoteUrl = repo.config.get("remote.origin.url");
  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl!);

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const pr = await api.pulls.get.query({
      repoId: repoData.repo.id,
      number: prNumber,
    });

    await api.pulls.close.mutate({ prId: pr.id });
    console.log(chalk.yellow(`✓ Closed PR #${prNumber}`));
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

function getServerUrl(): string {
  return process.env.WIT_SERVER_URL || "http://localhost:3000";
}
```

### Step 3: Issue Commands

```typescript
// src/commands/issue.ts
import { getApiClient } from "../api/client";
import { Repository } from "../core/repository";
import { parseRemoteUrl } from "../core/protocol/url-parser";
import chalk from "chalk";

export const ISSUE_HELP = `
wit issue - Manage issues

Usage: wit issue <command> [options]

Commands:
  create          Create a new issue
  list            List issues
  view <number>   View issue details
  close <number>  Close an issue
  reopen <number> Reopen an issue
  comment <num>   Add a comment

Options:
  -h, --help      Show this help message

Examples:
  wit issue create "Bug: Login fails"
  wit issue create -t "Bug" -l bug,urgent
  wit issue list
  wit issue list --state closed
  wit issue view 42
  wit issue close 42
  wit issue comment 42 "Fixed in commit abc123"
`;

export async function handleIssue(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === "-h" || subcommand === "--help") {
    console.log(ISSUE_HELP);
    return;
  }

  switch (subcommand) {
    case "create":
      return handleIssueCreate(args.slice(1));
    case "list":
      return handleIssueList(args.slice(1));
    case "view":
      return handleIssueView(args.slice(1));
    case "close":
      return handleIssueClose(args.slice(1));
    case "reopen":
      return handleIssueReopen(args.slice(1));
    case "comment":
      return handleIssueComment(args.slice(1));
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.log(ISSUE_HELP);
      process.exit(1);
  }
}

async function handleIssueCreate(args: string[]): Promise<void> {
  const api = getApiClient();
  const repo = new Repository(process.cwd());

  const remoteUrl = repo.config.get("remote.origin.url");
  if (!remoteUrl) {
    console.error("error: No remote origin configured");
    process.exit(1);
  }

  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl);

  // Get title from args
  const title = args.find((a) => !a.startsWith("-"));
  if (!title) {
    console.error("error: Issue title required");
    console.error('usage: wit issue create "Title here"');
    process.exit(1);
  }

  // Get body from -m flag
  let body: string | undefined;
  const bodyIdx = args.indexOf("-m");
  if (bodyIdx !== -1 && args[bodyIdx + 1]) {
    body = args[bodyIdx + 1];
  }

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });

    const issue = await api.issues.create.mutate({
      repoId: repoData.repo.id,
      title,
      body,
    });

    console.log(chalk.green(`\n✓ Created issue #${issue.number}`));
    console.log(`  ${chalk.blue(issue.title)}`);
    console.log(
      `  ${getServerUrl()}/${owner}/${repoName}/issues/${issue.number}`
    );
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

async function handleIssueList(args: string[]): Promise<void> {
  const api = getApiClient();
  const repo = new Repository(process.cwd());

  const remoteUrl = repo.config.get("remote.origin.url");
  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl!);

  let state: "open" | "closed" | "all" = "open";
  const stateIdx = args.indexOf("--state");
  if (stateIdx !== -1 && args[stateIdx + 1]) {
    state = args[stateIdx + 1] as any;
  }

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const issues = await api.issues.list.query({
      repoId: repoData.repo.id,
      state,
    });

    if (issues.length === 0) {
      console.log(`No ${state} issues`);
      return;
    }

    console.log(
      `\n${state.charAt(0).toUpperCase() + state.slice(1)} issues:\n`
    );

    for (const issue of issues) {
      const stateIcon =
        issue.state === "open" ? chalk.green("●") : chalk.red("●");
      console.log(`${stateIcon} #${issue.number} ${issue.title}`);
      console.log(
        `  ${chalk.dim(
          `by ${issue.author.username} on ${new Date(
            issue.createdAt
          ).toLocaleDateString()}`
        )}`
      );
    }
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

async function handleIssueView(args: string[]): Promise<void> {
  const issueNumber = parseInt(args[0]);
  if (isNaN(issueNumber)) {
    console.error("error: Issue number required");
    process.exit(1);
  }

  const api = getApiClient();
  const repo = new Repository(process.cwd());

  const remoteUrl = repo.config.get("remote.origin.url");
  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl!);

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const issue = await api.issues.get.query({
      repoId: repoData.repo.id,
      number: issueNumber,
    });

    const stateColor = issue.state === "open" ? chalk.green : chalk.red;

    console.log(
      `\n${stateColor(`[${issue.state.toUpperCase()}]`)} ${chalk.bold(
        issue.title
      )} ${chalk.dim(`#${issue.number}`)}`
    );
    console.log(`${chalk.dim("─".repeat(60))}`);
    console.log(`Author:  ${issue.author.username}`);
    console.log(`Created: ${new Date(issue.createdAt).toLocaleDateString()}`);

    if (issue.labels?.length) {
      console.log(
        `Labels:  ${issue.labels.map((l: any) => l.name).join(", ")}`
      );
    }

    if (issue.body) {
      console.log(`\n${issue.body}`);
    }

    console.log(
      `\n${chalk.dim(
        `View online: ${getServerUrl()}/${owner}/${repoName}/issues/${issueNumber}`
      )}`
    );
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

async function handleIssueClose(args: string[]): Promise<void> {
  const issueNumber = parseInt(args[0]);
  if (isNaN(issueNumber)) {
    console.error("error: Issue number required");
    process.exit(1);
  }

  const api = getApiClient();
  const repo = new Repository(process.cwd());

  const remoteUrl = repo.config.get("remote.origin.url");
  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl!);

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const issue = await api.issues.get.query({
      repoId: repoData.repo.id,
      number: issueNumber,
    });

    await api.issues.close.mutate({ issueId: issue.id });
    console.log(chalk.yellow(`✓ Closed issue #${issueNumber}`));
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

async function handleIssueReopen(args: string[]): Promise<void> {
  const issueNumber = parseInt(args[0]);
  if (isNaN(issueNumber)) {
    console.error("error: Issue number required");
    process.exit(1);
  }

  const api = getApiClient();
  const repo = new Repository(process.cwd());

  const remoteUrl = repo.config.get("remote.origin.url");
  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl!);

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const issue = await api.issues.get.query({
      repoId: repoData.repo.id,
      number: issueNumber,
    });

    await api.issues.reopen.mutate({ issueId: issue.id });
    console.log(chalk.green(`✓ Reopened issue #${issueNumber}`));
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

async function handleIssueComment(args: string[]): Promise<void> {
  const issueNumber = parseInt(args[0]);
  const body = args[1];

  if (isNaN(issueNumber) || !body) {
    console.error("error: Issue number and comment body required");
    console.error('usage: wit issue comment <number> "Comment text"');
    process.exit(1);
  }

  const api = getApiClient();
  const repo = new Repository(process.cwd());

  const remoteUrl = repo.config.get("remote.origin.url");
  const { owner, repo: repoName } = parseRemoteUrl(remoteUrl!);

  try {
    const repoData = await api.repos.get.query({ owner, repo: repoName });
    const issue = await api.issues.get.query({
      repoId: repoData.repo.id,
      number: issueNumber,
    });

    await api.issues.addComment.mutate({
      issueId: issue.id,
      body,
    });

    console.log(chalk.green(`✓ Added comment to issue #${issueNumber}`));
  } catch (error: any) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

function getServerUrl(): string {
  return process.env.WIT_SERVER_URL || "http://localhost:3000";
}
```

### Step 4: Wire Up CLI

```typescript
// src/cli.ts (add to existing switch statement)
case 'pr':
  const { handlePr } = await import('./commands/pr');
  await handlePr(args);
  break;

case 'issue':
  const { handleIssue } = await import('./commands/issue');
  await handleIssue(args);
  break;
```

### Step 5: Update Help Text

```typescript
// Add to HELP constant in cli.ts
`
Platform Commands:
  wit pr create            Create pull request from current branch
  wit pr list              List pull requests
  wit pr view <number>     View pull request details
  wit pr merge <number>    Merge a pull request
  
  wit issue create <title> Create new issue
  wit issue list           List issues
  wit issue view <number>  View issue details
  wit issue close <number> Close an issue
`;
```

---

## Success Criteria

- [ ] `wit pr create` creates PR from current branch
- [ ] `wit pr list` shows open PRs
- [ ] `wit pr view <n>` shows PR details
- [ ] `wit pr merge <n>` merges PR
- [ ] `wit issue create` creates issue
- [ ] `wit issue list` shows issues
- [ ] `wit issue view <n>` shows issue details
- [ ] `wit issue close <n>` closes issue
- [ ] `wit issue comment <n> "text"` adds comment
- [ ] All commands work with remote repository
- [ ] Auth token passed correctly to API

## Dependencies

- Stream 3 (tRPC API) - Need API endpoints

## Relevant Existing Code

- `src/cli.ts` - Main CLI entry point
- `src/commands/*.ts` - Existing command patterns
- `src/core/github.ts` - Auth token storage pattern
