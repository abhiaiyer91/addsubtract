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
} from './commands';

const VERSION = '1.0.0';

const HELP = `
tsgit - A Git implementation in TypeScript

Usage: tsgit <command> [<args>]

Commands:
  init                  Create an empty tsgit repository
  add <file>...         Add file contents to the index
  commit -m <message>   Record changes to the repository
  status                Show the working tree status
  log [--oneline]       Show commit logs
  diff [--staged]       Show changes between commits, index, and working tree
  branch [<name>]       List, create, or delete branches
  checkout <branch>     Switch branches or restore working tree files
  
Plumbing commands:
  cat-file <hash>       Provide content or type info for repository objects
  hash-object <file>    Compute object ID and optionally create a blob
  ls-files              Show information about files in the index
  ls-tree <tree>        List the contents of a tree object

Options:
  -h, --help            Show this help message
  -v, --version         Show version number

Examples:
  tsgit init
  tsgit add .
  tsgit commit -m "Initial commit"
  tsgit log --oneline
  tsgit branch feature
  tsgit checkout feature
`;

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
          's': 'stage',  // For ls-files -s
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
      const message = options.message as string;
      if (!message) {
        console.error('error: switch `m\' requires a value');
        process.exit(1);
      }
      commit(message);
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

    case 'checkout':
      if (cmdArgs.length === 0) {
        console.error('error: you must specify a branch or commit');
        process.exit(1);
      }
      checkout(cmdArgs[0], { createBranch: !!options.branch || !!options.b });
      break;

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

    default:
      console.error(`tsgit: '${command}' is not a tsgit command. See 'tsgit --help'.`);
      process.exit(1);
  }
}

main();
