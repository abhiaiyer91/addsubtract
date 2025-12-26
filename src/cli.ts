#!/usr/bin/env node

import {
  init,
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
  // Server command
  handleServe,
  // Command help
  printCommandHelp,
  hasHelpFlag,
} from './commands';
import { handleHooks } from './core/hooks';
import { handleSubmodule } from './core/submodule';
import { handleWorktree } from './core/worktree';
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
  reflog                Show reference log
  gc                    Run garbage collection

Server:
  serve                 Start Git HTTP server for hosting repos
  serve --port <n>      Start server on specified port
  serve --repos <path>  Set repository storage directory

Quality of Life:
  amend                 Quickly fix the last commit
  wip                   Quick WIP commit with auto-generated message
  fixup <commit>        Create fixup commit to squash later
  cleanup               Find and delete merged/stale branches
  blame <file>          Show who changed each line
  stats                 Repository statistics dashboard
  snapshot              Create/restore quick checkpoints

Monorepo Support:
  scope                 Show current repository scope
  scope set <path>...   Limit operations to specific paths
  scope use <preset>    Use a preset scope (frontend, backend, docs)
  scope clear           Clear scope restrictions

AI-Powered Features:
  ai <query>            Natural language git commands
  ai commit [-a] [-x]   Generate commit message from changes
  ai review             AI code review of changes
  ai explain [ref]      Explain a commit
  ai resolve [file]     AI-assisted conflict resolution
  ai status             Show AI configuration

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
`;

const COMMANDS = [
  'init', 'add', 'commit', 'status', 'log', 'diff',
  'branch', 'switch', 'checkout', 'restore',
  'merge', 'undo', 'history', 'uncommit',
  'amend', 'wip', 'fixup', 'cleanup', 'blame', 'stats', 'snapshot',
  'scope', 'graph',
  'ui', 'web',
  'ai',
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
  'hooks', 'submodule', 'worktree', 'reflog', 'gc',
  // Server
  'serve',
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
    console.log(HELP);
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
      case 'init':
        init(cmdArgs[0] || '.');
        break;

      case 'add':
        if (cmdArgs.length === 0) {
          console.error('Nothing specified, nothing added.');
          console.error('hint: Maybe you wanted to say "wit add ."?');
          process.exit(1);
        }
        add(cmdArgs);
        break;

      case 'commit':
        // Use new commit handler for full options
        if (options.all || cmdArgs.length > 0) {
          handleCommit([...cmdArgs, ...(options.message ? ['-m', options.message as string] : []), ...(options.all ? ['-a'] : [])]);
        } else {
          const message = options.message as string;
          if (!message) {
            console.error('error: switch `m\' requires a value');
            process.exit(1);
          }
          commit(message);
        }
        break;

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
        ));
        break;

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

      case 'reflog':
        handleReflog(cmdArgs);
        break;

      case 'gc':
        handleGC(cmdArgs);
        break;

      case 'serve':
        handleServe(args.slice(args.indexOf('serve') + 1));
        break;

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
