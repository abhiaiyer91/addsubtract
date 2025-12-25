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
} from './commands';
import { TsgitError, findSimilar } from './core/errors';
import { launchTUI } from './ui/tui';
import { launchWebUI } from './ui/web';

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

Usage: tsgit <command> [<args>]

Visual Interface:
  ui                    Launch interactive terminal UI (TUI)
  web [--port <n>]      Launch web-based UI in browser

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

Monorepo Support:
  scope                 Show current repository scope
  scope set <path>...   Limit operations to specific paths
  scope use <preset>    Use a preset scope (frontend, backend, docs)
  scope clear           Clear scope restrictions

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
`;

const COMMANDS = [
  'init', 'add', 'commit', 'status', 'log', 'diff',
  'branch', 'switch', 'checkout', 'restore',
  'merge', 'undo', 'history',
  'scope',
  'ui', 'web',
  'cat-file', 'hash-object', 'ls-files', 'ls-tree',
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
        launchWebUI(port);
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
