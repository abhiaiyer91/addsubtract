#!/usr/bin/env node

// Load environment variables from .env file
import 'dotenv/config';

import {
  init,
  parseInitArgs,
  add,
  commit,
  status,
  log,
  branch,
  checkout,
  diffCommand,
  catFile,
  hashObjectCommand,
  lsFiles,
  lsTree,
  // New commands
  handleSwitch,
  handleRestore,
  handleUndo,
  handleHistory,
  handleMerge,
  handleCommit,
  handleScope,
  // AI commands
  handleAI,
  handleAgent,
  // Quality of Life commands
  handleAmend,
  handleWip,
  handleUncommit,
  handleCleanup,
  handleBlame,
  handleStats,
  handleFixup,
  handleSnapshot,
  // New Git-compatible commands
  handleStash,
  handleTag,
  handleReset,
  handleBisect,
  handleClean,
  handleShow,
  // History rewriting commands
  handleCherryPick,
  handleRebase,
  handleRevert,
  // Remote commands
  handleRemote,
  handleClone,
  handleFetch,
  handlePull,
  handlePush,
  // GitHub integration
  handleGitHub,
  // Plumbing commands
  handleRevParse,
  handleUpdateRef,
  handleSymbolicRef,
  handleForEachRef,
  handleShowRef,
  handleFsck,
  // Advanced features
  handleReflog,
  handleGC,
  // Stacked diffs
  handleStack,
  // Collaborator management
  handleCollaborator,
  // Server command
  handleServe,
  // Command help
  printCommandHelp,
  hasHelpFlag,
  // Platform commands
  handlePr,
  handleIssue,
  handleDashboard,
  // Issue tracking (Linear-inspired) - also exports handleCycle
  handleCycle,
  // Project management (Linear-inspired)
  handleProject,
  // Platform management
  handleUp,
  handleDown,
  handlePlatformStatus,
  // Smart status
  handleSmartStatus,
  // Semantic search
  handleSearch,
  // Personal access tokens
  handleToken,
  // CodeRabbit review
  handleCodeReview,
  // CI/CD
  handleCI,
  // Merge Queue
  handleMergeQueue,
  // Journal (Notion-like docs)
  handleJournal,
  // Wrapped (Monthly activity insights)
  handleWrapped,
} from './commands';
import { handleHooks } from './core/hooks';
import { handleSubmodule } from './core/submodule';
import { handleWorktree } from './core/worktree';
import { handleProtect } from './core/branch-protection';
import { TsgitError, findSimilar } from './core/errors';
import { Repository } from './core/repository';
import { launchTUI } from './ui/tui';
import { launchPremiumWebUI } from './ui/web-premium';
import { printGraph } from './ui/graph';

const VERSION = '2.0.0';

const HELP = `
wit - A Modern Git Implementation in TypeScript

wit improves on Git with:
  • SHA-256 hashing (more secure than SHA-1)
  • Large file chunking (better binary file handling)
  • Operation undo/history (easily undo mistakes)
  • Structured merge conflicts (easier resolution)
  • Branch state management (auto-stash on switch)
  • Monorepo scopes (work with subsets of large repos)
  • Better error messages (with suggestions)
  • Built-in visual UI (terminal and web)
  • AI-powered features (commit messages, code review, conflict resolution)
  • Quality of life commands (amend, wip, uncommit, etc.)

Usage: wit <command> [<args>]

Visual Interface:
  ui                    Launch interactive terminal UI (TUI)
  web [--port <n>]      Launch web UI in browser
  graph                 Show commit graph in terminal

Core Commands:
  init                  Create an empty wit repository
  add <file>...         Add file contents to the index
  commit -m <message>   Record changes to the repository
  status                Show the working tree status
  log [--oneline]       Show commit logs
  diff [--staged]       Show changes between commits/index/working tree

Branch & Navigation:
  branch [<name>]       List, create, or delete branches
  switch <branch>       Switch branches (dedicated command)
  checkout <branch>     Switch branches or restore working tree files
  restore <file>...     Restore file contents (dedicated command)

Merge & Conflict Resolution:
  merge <branch>        Merge a branch into current branch
  merge --abort         Abort current merge
  merge --continue      Continue after resolving conflicts
  merge --conflicts     Show current conflicts

Undo & History:
  undo                  Undo the last operation
  history               Show operation history
  uncommit              Undo last commit, keep changes staged
  reset [--soft|--hard] Reset HEAD to a specific state
  stash                 Save working directory changes temporarily

Debugging & Inspection:
  show <commit>         Show commit details and diff
  show <commit>:<file>  Show file at specific commit
  bisect start          Start binary search for bug
  bisect good/bad       Mark commits during bisect
  clean -n              Preview untracked files to delete
  clean -f              Delete untracked files

Tags:
  tag                   List all tags
  tag <name>            Create a lightweight tag
  tag -a <name> -m ""   Create an annotated tag
  tag -d <name>         Delete a tag

History Rewriting:
  cherry-pick <commit>  Apply changes from specific commits
  cherry-pick --continue Continue after conflict resolution
  cherry-pick --abort   Abort the operation
  rebase <branch>       Rebase current branch onto another
  rebase --onto <new>   Rebase onto specific base
  rebase --continue     Continue after conflict resolution
  rebase --abort        Abort the rebase
  revert <commit>       Create commit that undoes changes
  revert -n <commit>    Revert without committing
  revert --continue     Continue after conflict resolution

Remote Operations:
  remote                List configured remotes
  remote add <n> <url>  Add a new remote
  remote remove <name>  Remove a remote
  clone <url> [<dir>]   Clone a repository
  fetch [<remote>]      Download objects and refs from remote
  pull [<remote>]       Fetch and integrate with local branch
  push [<remote>]       Update remote refs and objects

GitHub Integration:
  github login          Authenticate with GitHub (device flow)
  github logout         Remove stored GitHub credentials
  github status         Show authentication status
  github token          Print access token (for scripting)

Advanced Features:
  hooks                 Manage repository hooks
  submodule             Manage submodules
  worktree              Manage multiple working trees
  protect               Manage branch protection rules
  reflog                Show reference log
  gc                    Run garbage collection

Stacked Diffs:
  stack create <name>   Start a new stack from current branch
  stack push [name]     Create a new branch on top of the stack
  stack list            Show all stacks
  stack show            Show current stack visualization
  stack sync            Rebase entire stack when base changes
  stack submit          Push all stack branches for review
  stack up/down         Navigate the stack
  stack pop             Remove top branch from stack

Branch Protection:
  protect               List all protection rules
  protect add <pattern> Add protection rule (main, release/*, etc.)
  protect remove <pat>  Remove a protection rule
  protect check <br>    Check if operation is allowed on branch
  protect status <br>   Show protection status for a branch

Collaborator Management:
  collaborator          List collaborators
  collaborator add      Invite a collaborator (email, role)
  collaborator remove   Remove a collaborator
  collaborator update   Update collaborator role
  collaborator accept   Accept invitation (token)
  collaborator team     Manage teams

Server:
  serve                 Start Git HTTP server for hosting repos
  serve --port <n>      Start server on specified port
  serve --repos <path>  Set repository storage directory

Platform Commands:
  dashboard             Your personal dashboard (PRs, issues, repos, stats)
  dashboard prs         View all PR sections (awaiting review, yours, participated)
  dashboard issues      View assigned/created issues
  dashboard repos       View your repositories
  dashboard activity    View recent activity feed
  dashboard stats       View contribution statistics
  dashboard summary     Quick counts summary
  
  pr create             Create pull request from current branch
  pr list               List pull requests
  pr view <number>      View pull request details
  pr merge <number>     Merge a pull request
  pr close <number>     Close a pull request
  pr review [<number>]  AI code review using CodeRabbit
  pr review-status      Check CodeRabbit configuration
  
  issue create <title>  Create new issue
  issue list            List issues
  issue view <number>   View issue details
  issue close <number>  Close an issue
  issue comment <n>     Add comment to issue

Self-Hosting (run your own GitHub):
  up                    Start the wit platform (database + server + web UI)
  down                  Stop all wit services
  platform-status       Show status of running services

Authentication:
  token create <name>   Create a personal access token
  token list            List your tokens
  token revoke <id>     Revoke a token
  token scopes          List available scopes

CI/CD:
  ci list               List available workflows
  ci run [workflow]     Run a workflow locally
  ci validate [file]    Validate workflow YAML
  ci runs               Show recent workflow runs (requires server)
  ci view <run-id>      View workflow run details (requires server)

Merge Queue:
  merge-queue add       Add PR to merge queue (auto-queued merging)
  merge-queue remove    Remove PR from queue
  merge-queue status    Show queue position
  merge-queue list      List PRs in queue
  merge-queue stats     Show queue statistics
  merge-queue enable    Enable merge queue for branch
  merge-queue config    Configure queue settings

Quality of Life:
  amend                 Quickly fix the last commit
  wip                   Quick WIP commit with auto-generated message
  fixup <commit>        Create fixup commit to squash later
  cleanup               Find and delete merged/stale branches
  blame <file>          Show who changed each line
  stats                 Repository statistics dashboard
  snapshot              Create/restore quick checkpoints
  wrapped               Monthly activity insights (your coding Wrapped!)

Issue Tracking (Linear-inspired):
  issue create "Title"  Create a new issue
  issue list            List issues (--status, --priority, --assignee)
  issue show <id>       Show issue details (e.g., WIT-123)
  issue start <id>      Start working on an issue
  issue close <id>      Close an issue
  issue board           Show kanban board view
  issue stats           Show issue statistics
  issue priority <n> <p> Set issue priority (urgent/high/medium/low/none)
  issue due <n> <date>  Set due date
  issue block <a> <b>   Mark issue A as blocking issue B
  
  project create "Name" Create a new project
  project list          List projects
  project view "Name"   View project details
  project issues "Name" List issues in a project
  project progress "N"  Show project progress
  project complete "N"  Mark project as complete
  
  cycle create          Create a new sprint/cycle
  cycle current         Show active cycle progress
  cycle add <issue>     Add issue to current cycle

Documentation (Notion-like journal):
  journal               List journal pages
  journal create <title> Create a new page
  journal view <slug>   View page content
  journal edit <slug>   Update a page
  journal tree          Show page hierarchy
  journal search <q>    Search pages
  journal publish       Publish a draft page
  journal history       View page version history

Monorepo Support:
  scope                 Show current repository scope
  scope set <path>...   Limit operations to specific paths
  scope use <preset>    Use a preset scope (frontend, backend, docs)
  scope clear           Clear scope restrictions

AI-Powered Features:
  agent                 Interactive coding assistant (the killer feature!)
  agent ask <query>     One-shot question to the coding agent
  agent status          Show agent configuration
  
  search <query>        Semantic code search
  search index          Index repo for semantic search
  search status         Show index health
  search -i             Interactive search mode
  
  review                Pre-push code review (powered by CodeRabbit)
  review --staged       Review only staged changes
  review --branch       Review changes since branching from main
  review --configure    Set up CodeRabbit API key
  
  ai <query>            Natural language git commands
  ai commit [-a] [-x]   Generate commit message from changes
  ai explain [ref]      Explain a commit
  ai resolve [file]     AI-assisted conflict resolution
  ai status             Show AI configuration
  
  pr review [<number>]  AI PR review using CodeRabbit

Plumbing Commands:
  cat-file <hash>       Provide content or type info for objects
  hash-object <file>    Compute object ID and create a blob
  ls-files              Show information about files in the index
  ls-tree <tree>        List the contents of a tree object
  rev-parse <ref>       Parse revision to hash
  update-ref <ref> <h>  Update ref to new hash
  symbolic-ref <name>   Read/write symbolic refs
  for-each-ref          Iterate over refs
  show-ref              List refs with hashes
  fsck                  Verify object database

Options:
  -h, --help            Show this help message
  -v, --version         Show version number

Environment Variables:
  GITHUB_TOKEN          GitHub personal access token (recommended)
  GH_TOKEN              Alternative to GITHUB_TOKEN
  WIT_GITHUB_CLIENT_ID  OAuth App client ID (for device flow login)
  WIT_TOKEN             Generic wit authentication token
  GIT_TOKEN             Generic git authentication token

Examples:
  wit ui                    # Launch terminal UI
  wit web                   # Launch web UI
  wit agent                 # Start interactive coding agent
  wit agent "add tests"     # One-shot agent query
  wit init
  wit add .
  wit commit -m "Initial commit"
  wit commit -a -m "Update all tracked files"
  wit switch -c feature
  wit merge feature
  wit undo
  wit scope use frontend
  wit ai "what files changed?"
  wit ai commit -a -x
  wit wip -a                # Quick save all changes
  wit amend -m "New msg"    # Fix last commit message
  wit uncommit              # Undo commit, keep changes
  wit cleanup --dry-run     # Preview branch cleanup
  wit stats                 # View repo statistics
  wit snapshot create       # Create checkpoint
  wit blame file.ts         # See who changed what
  wit remote add origin /path/to/repo  # Add remote
  wit clone ./source ./dest  # Clone a repository
  wit fetch origin           # Fetch from origin
  wit pull                   # Pull current branch
  wit push -u origin main    # Push and set upstream
  wit github login           # Login to GitHub
  wit github status          # Check GitHub auth status
  wit serve --port 3000      # Start Git server
  wit review                 # AI code review before push
  wit review --branch        # Review all branch changes

Issue Tracking:
  wit issue create "Fix login bug"    # Create issue
  wit issue list                      # List open issues
  wit issue start WIT-1               # Start working on issue
  wit issue board                     # Kanban board view
  wit commit -m "Fix bug" --closes WIT-1  # Close issue on commit
  wit cycle create --weeks 2          # Create 2-week sprint
  wit cycle add WIT-1                 # Add issue to sprint
`;

const COMMANDS = [
  'init', 'add', 'commit', 'status', 'log', 'diff',
  'branch', 'switch', 'checkout', 'restore',
  'merge', 'undo', 'history', 'uncommit',
  'amend', 'wip', 'fixup', 'cleanup', 'blame', 'stats', 'snapshot',
  'scope', 'graph',
  'ui', 'web',
  'ai', 'agent', 'search', 'review',
  // Issue tracking
  'issue', 'cycle', 'project',
  // Journal (Notion-like docs)
  'journal',
  'cat-file', 'hash-object', 'ls-files', 'ls-tree',
  // Plumbing commands
  'rev-parse', 'update-ref', 'symbolic-ref', 'for-each-ref', 'show-ref', 'fsck',
  // New Git-compatible commands
  'stash', 'tag', 'reset', 'bisect', 'clean', 'show',
  // History rewriting commands
  'cherry-pick', 'rebase', 'revert',
  // Remote commands
  'remote', 'clone', 'fetch', 'pull', 'push',
  // GitHub integration
  'github',
  // Advanced features
  'hooks', 'submodule', 'worktree', 'protect', 'reflog', 'gc',
  // Stacked diffs
  'stack',
  // Collaborator management
  'collaborator',
  // Server
  'serve',
  // Platform commands
  'pr', 'issue', 'dashboard',
  // Platform management
  'up', 'down', 'platform-status',
  // Authentication
  'token',
  // CI/CD
  'ci',
  // Merge Queue
  'merge-queue',
  // Wrapped
  'wrapped',
  'help',
];

function parseArgs(args: string[]): { command: string; args: string[]; options: Record<string, boolean | string> } {
  const options: Record<string, boolean | string> = {};
  const positional: string[] = [];

  let i = 0;
  let foundCommand = false;

  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Check if next arg is a value (not starting with -)
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options[key] = args[i + 1];
        i += 2;
      } else {
        options[key] = true;
        i++;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      // Handle -m "message" style
      if (key === 'm' && i + 1 < args.length) {
        options['message'] = args[i + 1];
        i += 2;
      } else if (key === 'n' && i + 1 < args.length) {
        options['n'] = args[i + 1];
        i += 2;
      } else {
        // Map short flags to long names
        // Only map -v to version if no command found yet
        const mapping: Record<string, string> = {
          'h': 'help',
          'v': foundCommand ? 'verbose' : 'version',
          'b': 'branch',
          'd': 'delete',
          't': 'type',
          'p': 'print',
          'w': 'write',
          'r': 'recursive',
          's': 'stage',
          'c': 'create',
          'a': 'all',
          'f': 'force',
          'u': 'set-upstream',
        };
        options[mapping[key] || key] = true;
        i++;
      }
    } else {
      positional.push(arg);
      // Mark that we found a command
      if (!foundCommand && COMMANDS.includes(arg)) {
        foundCommand = true;
      }
      i++;
    }
  }

  return {
    command: positional[0] || '',
    args: positional.slice(1),
    options,
  };
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    handleSmartStatus([]).catch((error: Error) => {
      console.error(`error: ${error.message}`);
      process.exit(1);
    });
    return;
  }

  const { command, args: cmdArgs, options } = parseArgs(args);

  // For commands that do their own argument parsing, use raw args after command
  const rawArgs = args.slice(1);

  // Check for --help or -h flag on a specific command first
  // This handles: wit add --help, wit commit -h, etc.
  if (command && COMMANDS.includes(command) && command !== 'help' && (options.help || hasHelpFlag(rawArgs))) {
    if (printCommandHelp(command)) {
      return;
    }
  }

  // Check for general help: wit --help, wit help, wit help <command>
  if (options.help || command === 'help') {
    // Check if help is requested for a specific command
    if (command === 'help' && cmdArgs.length > 0) {
      if (printCommandHelp(cmdArgs[0])) {
        return;
      }
    }
    console.log(HELP);
    return;
  }

  if (options.version) {
    console.log(`wit version ${VERSION}`);
    return;
  }

  try {
    switch (command) {
      case 'init': {
        const { directory, options: initOptions } = parseInitArgs(rawArgs);
        init(directory, initOptions);
        return; // init is now async
      }

      case 'add':
        if (cmdArgs.length === 0) {
          console.error('Nothing specified, nothing added.');
          console.error('hint: Maybe you wanted to say "wit add ."?');
          process.exit(1);
        }
        add(cmdArgs);
        break;

      case 'commit':
        // Use new commit handler for full options (now async for hooks)
        handleCommit([
          ...cmdArgs,
          ...(options.message ? ['-m', options.message as string] : []),
          ...(options.all ? ['-a'] : []),
        ]).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      case 'status':
        status();
        break;

      case 'log':
        log(cmdArgs[0] || 'HEAD', {
          oneline: !!options.oneline,
          n: options.n ? parseInt(options.n as string, 10) : undefined,
        });
        break;

      case 'diff':
        diffCommand({
          staged: !!options.staged,
          cached: !!options.cached,
        });
        break;

      case 'branch':
        if (options.delete) {
          branch(cmdArgs[0], { delete: true });
        } else if (cmdArgs.length > 0) {
          branch(cmdArgs[0]);
        } else {
          branch(undefined, { list: true });
        }
        break;

      case 'switch':
        handleSwitch(cmdArgs.concat(
          options.create ? ['-c'] : [],
          options.force ? ['-f'] : []
        ));
        break;

      case 'checkout':
        if (cmdArgs.length === 0) {
          console.error('error: you must specify a branch or commit');
          process.exit(1);
        }
        checkout(cmdArgs[0], { createBranch: !!options.branch || !!options.b || !!options.create });
        break;

      case 'restore':
        handleRestore(cmdArgs.concat(
          options.staged ? ['--staged'] : [],
          options.source ? ['--source', options.source as string] : []
        ));
        break;

      case 'merge':
        handleMerge(cmdArgs.concat(
          options.abort ? ['--abort'] : [],
          options.continue ? ['--continue'] : [],
          options.conflicts ? ['--conflicts'] : [],
          options.message ? ['-m', options.message as string] : []
        )).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      case 'undo':
        handleUndo(cmdArgs.concat(
          options.steps ? ['-n', options.steps as string] : [],
          options['dry-run'] ? ['--dry-run'] : []
        ));
        break;

      case 'history':
        handleHistory(cmdArgs.concat(
          options.limit ? ['-n', options.limit as string] : []
        ));
        break;

      case 'scope':
        handleScope(cmdArgs);
        break;

      case 'ui':
        launchTUI();
        break;

      case 'web': {
        const port = options.port ? parseInt(options.port as string, 10) : 3847;
        launchPremiumWebUI(port);
        break;
      }

      case 'graph': {
        const repo = Repository.find();
        printGraph(repo, {
          useColors: true,
          maxCommits: options.n ? parseInt(options.n as string, 10) : 20
        });
        break;
      }

      case 'cat-file':
        if (cmdArgs.length === 0) {
          console.error('error: you must specify an object hash');
          process.exit(1);
        }
        catFile(cmdArgs[0], {
          type: !!options.type || !!options.t,
          showSize: !!options.size,
          print: !!options.print || !!options.p,
        });
        break;

      case 'hash-object':
        if (cmdArgs.length === 0 && !options.stdin) {
          console.error('error: you must specify a file');
          process.exit(1);
        }
        hashObjectCommand(cmdArgs[0], {
          write: !!options.write || !!options.w,
          stdin: !!options.stdin,
        });
        break;

      case 'ls-files':
        lsFiles({
          stage: !!options.stage || !!options.s,
        });
        break;

      case 'ls-tree':
        if (cmdArgs.length === 0) {
          console.error('error: you must specify a tree-ish');
          process.exit(1);
        }
        lsTree(cmdArgs[0], {
          recursive: !!options.recursive || !!options.r,
          nameOnly: !!options['name-only'],
        });
        break;

      // Plumbing commands - pass raw args since they handle their own parsing
      case 'rev-parse':
        handleRevParse(args.slice(1));
        break;

      case 'update-ref':
        handleUpdateRef(args.slice(1));
        break;

      case 'symbolic-ref':
        handleSymbolicRef(args.slice(1));
        break;

      case 'for-each-ref':
        handleForEachRef(args.slice(1));
        break;

      case 'show-ref':
        handleShowRef(args.slice(1));
        break;

      case 'fsck':
        handleFsck(args.slice(1));
        break;

      case 'ai':
        // AI commands are async, so we need to handle them specially
        handleAI(cmdArgs).catch((error: Error) => {
          console.error(`error: ${error.message}`);
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      case 'agent':
        // Interactive coding agent
        handleAgent(rawArgs).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      case 'search':
        // Semantic search - the "holy shit" feature
        handleSearch(rawArgs).catch((error: Error) => {
          console.error(`error: ${error.message}`);
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      case 'review':
        // CodeRabbit-powered code review
        handleCodeReview(rawArgs).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      // Quality of Life commands
      case 'amend':
        handleAmend(cmdArgs.concat(
          options.message ? ['-m', options.message as string] : [],
          options.all ? ['-a'] : []
        ));
        break;

      case 'wip':
        handleWip(cmdArgs.concat(
          options.all ? ['-a'] : [],
          options.message ? ['-m', options.message as string] : []
        ));
        break;

      case 'uncommit':
        handleUncommit(cmdArgs.concat(
          options.hard ? ['--hard'] : []
        ));
        break;

      case 'cleanup':
        handleCleanup(cmdArgs.concat(
          options['dry-run'] ? ['--dry-run'] : [],
          options.force ? ['--force'] : [],
          options.merged ? ['--merged'] : [],
          options.stale ? ['--stale'] : [],
          options.all ? ['--all'] : []
        ));
        break;

      case 'blame':
        handleBlame(cmdArgs);
        break;

      case 'stats':
        handleStats(cmdArgs.concat(
          options.all ? ['--all'] : []
        ));
        break;

      case 'fixup':
        handleFixup(cmdArgs.concat(
          options.all ? ['-a'] : [],
          options.amend ? ['--amend'] : []
        ));
        break;

      case 'snapshot':
        handleSnapshot(cmdArgs);
        break;

      // New Git-compatible commands (these parse their own arguments)
      case 'stash':
        handleStash(rawArgs);
        break;

      case 'tag':
        handleTag(rawArgs);
        break;

      case 'reset':
        handleReset(rawArgs);
        break;

      case 'bisect':
        handleBisect(rawArgs);
        break;

      case 'clean':
        handleClean(rawArgs);
        break;

      case 'show':
        handleShow(rawArgs);
        break;

      // History rewriting commands
      case 'cherry-pick':
        handleCherryPick(cmdArgs.concat(
          options.continue ? ['--continue'] : [],
          options.abort ? ['--abort'] : [],
          options.skip ? ['--skip'] : [],
          options['no-commit'] ? ['--no-commit'] : []
        ));
        break;

      case 'rebase':
        handleRebase(cmdArgs.concat(
          options.continue ? ['--continue'] : [],
          options.abort ? ['--abort'] : [],
          options.skip ? ['--skip'] : [],
          options.onto ? ['--onto', options.onto as string] : []
        ));
        break;

      case 'revert':
        handleRevert(cmdArgs.concat(
          options.continue ? ['--continue'] : [],
          options.abort ? ['--abort'] : [],
          options['no-commit'] ? ['--no-commit'] : [],
          options.mainline ? ['-m', options.mainline as string] : []
        ));
      // Remote commands
      case 'remote':
        // Pass through all remaining args including -v for verbose
        handleRemote(args.slice(args.indexOf('remote') + 1));
        break;

      case 'clone':
        // Pass through all remaining args
        handleClone(args.slice(args.indexOf('clone') + 1));
        break;

      case 'fetch':
        // Pass through all remaining args
        handleFetch(args.slice(args.indexOf('fetch') + 1));
        break;

      case 'pull':
        // Pass through all remaining args
        handlePull(args.slice(args.indexOf('pull') + 1));
        break;

      case 'push':
        // Pass through all remaining args
        handlePush(args.slice(args.indexOf('push') + 1));
        break;

      // GitHub integration
      case 'github':
        handleGitHub(args.slice(args.indexOf('github') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      // Advanced features
      case 'hooks':
        handleHooks(cmdArgs);
        break;

      case 'submodule':
        handleSubmodule(cmdArgs).catch((error: Error) => {
          console.error(`error: ${error.message}`);
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      case 'worktree':
        handleWorktree(cmdArgs);
        break;

      case 'protect':
        handleProtect(rawArgs);
        break;

      case 'reflog':
        handleReflog(cmdArgs);
        break;

      case 'gc':
        handleGC(cmdArgs);
        break;

      case 'stack':
        handleStack(rawArgs);
        break;

      // Collaborator management
      case 'collaborator':
        // Collaborator commands are async due to email sending
        handleCollaborator(args.slice(args.indexOf('collaborator') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      case 'serve':
        handleServe(args.slice(args.indexOf('serve') + 1));
        break;

      // Platform commands
      case 'pr':
        handlePr(args.slice(args.indexOf('pr') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      case 'issue':
        handleIssue(args.slice(args.indexOf('issue') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      case 'dashboard':
        handleDashboard(args.slice(args.indexOf('dashboard') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      // Issue tracking - cycle commands (Linear-inspired sprints)
      case 'cycle':
        handleCycle(rawArgs).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      // Project management (Linear-inspired)
      case 'project':
        handleProject(args.slice(args.indexOf('project') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return; // Exit main() to let async handle complete

      // Platform management commands
      case 'up':
        handleUp(args.slice(args.indexOf('up') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return;

      case 'down':
        handleDown(args.slice(args.indexOf('down') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return;

      case 'platform-status':
        handlePlatformStatus(args.slice(args.indexOf('platform-status') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return;

      // Personal access tokens
      case 'token':
        handleToken(args.slice(args.indexOf('token') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return;

      // CI/CD commands
      case 'ci':
        handleCI(args.slice(args.indexOf('ci') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return;

      // Merge Queue commands
      case 'merge-queue':
        handleMergeQueue(args.slice(args.indexOf('merge-queue') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return;

      // Journal (Notion-like docs)
      case 'journal':
        handleJournal(args.slice(args.indexOf('journal') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return;

      // Wrapped (Monthly activity insights)
      case 'wrapped':
        handleWrapped(args.slice(args.indexOf('wrapped') + 1)).catch((error: Error) => {
          if (error instanceof TsgitError) {
            console.error((error as TsgitError).format());
          } else {
            console.error(`error: ${error.message}`);
          }
          process.exit(1);
        });
        return;

      default: {
        // Provide suggestions for unknown commands
        const similar = findSimilar(command, COMMANDS);
        console.error(`wit: '${command}' is not a wit command. See 'wit --help'.`);
        if (similar.length > 0) {
          console.error('\nDid you mean one of these?');
          for (const cmd of similar) {
            console.error(`  ${cmd}`);
          }
        }
        process.exit(1);
      }
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();
