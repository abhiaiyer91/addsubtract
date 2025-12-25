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
  // Advanced features
  handleReflog,
  handleGC,
} from './commands';
import { handleHooks } from './core/hooks';
import { handleSubmodule } from './core/submodule';
import { handleWorktree } from './core/worktree';
import { TsgitError, findSimilar } from './core/errors';
import { Repository } from './core/repository';
import { launchTUI } from './ui/tui';
import { launchWebUI } from './ui/web';
import { launchEnhancedWebUI } from './ui/web-enhanced';
import { printGraph } from './ui/graph';

const VERSION = '2.0.0';

const HELP = `
tsgit - A Modern Git Implementation in TypeScript

tsgit improves on Git with:
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

Usage: tsgit <command> [<args>]

Visual Interface:
  ui                    Launch interactive terminal UI (TUI)
  web [--port <n>]      Launch enhanced web UI in browser
  graph                 Show commit graph in terminal

Core Commands:
  init                  Create an empty tsgit repository
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

Tags:
  tag                   List all tags
  tag <name>            Create a lightweight tag
  tag -a <name> -m ""   Create an annotated tag
  tag -d <name>         Delete a tag

Advanced Features:
  hooks                 Manage repository hooks
  submodule             Manage submodules
  worktree              Manage multiple working trees
  reflog                Show reference log
  gc                    Run garbage collection

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

Options:
  -h, --help            Show this help message
  -v, --version         Show version number

Examples:
  tsgit ui                    # Launch terminal UI
  tsgit web                   # Launch web UI
  tsgit init
  tsgit add .
  tsgit commit -m "Initial commit"
  tsgit commit -a -m "Update all tracked files"
  tsgit switch -c feature
  tsgit merge feature
  tsgit undo
  tsgit scope use frontend
  tsgit ai "what files changed?"
  tsgit ai commit -a -x
  tsgit wip -a                # Quick save all changes
  tsgit amend -m "New msg"    # Fix last commit message
  tsgit uncommit              # Undo commit, keep changes
  tsgit cleanup --dry-run     # Preview branch cleanup
  tsgit stats                 # View repo statistics
  tsgit snapshot create       # Create checkpoint
  tsgit blame file.ts         # See who changed what
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
  // New Git-compatible commands
  'stash', 'tag', 'reset',
  // Advanced features
  'hooks', 'submodule', 'worktree', 'reflog', 'gc',
  'help',
];

function parseArgs(args: string[]): { command: string; args: string[]; options: Record<string, boolean | string> } {
  const options: Record<string, boolean | string> = {};
  const positional: string[] = [];
  
  let i = 0;
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
        const mapping: Record<string, string> = {
          'h': 'help',
          'v': 'version',
          'b': 'branch',
          'd': 'delete',
          't': 'type',
          'p': 'print',
          'w': 'write',
          'r': 'recursive',
          's': 'stage',
          'c': 'create',
          'a': 'all',
        };
        options[mapping[key] || key] = true;
        i++;
      }
    } else {
      positional.push(arg);
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

  if (options.help || command === 'help') {
    console.log(HELP);
    return;
  }

  if (options.version) {
    console.log(`tsgit version ${VERSION}`);
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
          console.error('hint: Maybe you wanted to say "tsgit add ."?');
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
        if (options.basic) {
          launchWebUI(port);
        } else {
          launchEnhancedWebUI(port);
        }
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

      // New Git-compatible commands
      case 'stash':
        handleStash(cmdArgs);
        break;

      case 'tag':
        handleTag(cmdArgs);
        break;

      case 'reset':
        handleReset(cmdArgs);
        break;

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

      default: {
        // Provide suggestions for unknown commands
        const similar = findSimilar(command, COMMANDS);
        console.error(`tsgit: '${command}' is not a tsgit command. See 'tsgit --help'.`);
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
