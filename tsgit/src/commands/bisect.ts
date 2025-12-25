/**
 * Bisect Command
 * Enhanced bisect tool for finding the commit that introduced a bug
 */

import { Repository } from '../core/repository';
import { BisectManager, BisectStartOptions, formatBisectResult } from '../core/bisect';
import { TsgitError } from '../core/errors';

const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

/**
 * Start a new bisect session
 */
export function bisectStart(
  badCommit: string,
  goodCommit: string,
  options: Partial<BisectStartOptions> = {}
): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  try {
    const session = manager.start({
      badCommit,
      goodCommit,
      ...options,
    });

    console.log(colors.bold('Bisect started'));
    console.log('');
    console.log(manager.visualize());
    
    if (!session.completed) {
      console.log('');
      console.log(`${colors.yellow('Action required:')} Test this commit and run:`);
      console.log(`  ${colors.cyan('tsgit bisect good')}  - if the bug is NOT present`);
      console.log(`  ${colors.cyan('tsgit bisect bad')}   - if the bug IS present`);
      console.log(`  ${colors.cyan('tsgit bisect skip')}  - if you cannot test this commit`);
    } else {
      const result = manager.getResult();
      if (result) {
        console.log('');
        console.log(formatBisectResult(result));
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(colors.red(`error: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * Mark current commit as good
 */
export function bisectGood(commit?: string): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  if (!manager.isInProgress()) {
    console.error(colors.red('error: No bisect session in progress'));
    console.error('hint: Start with `tsgit bisect start <bad> <good>`');
    process.exit(1);
  }

  try {
    manager.markGood(commit);
    
    const session = manager.getSession();
    console.log(colors.green('Marked as good'));
    console.log('');
    console.log(manager.visualize());

    if (session?.completed) {
      const result = manager.getResult();
      if (result) {
        console.log('');
        console.log(formatBisectResult(result));
      }
    } else {
      console.log('');
      console.log(`${colors.yellow('Next:')} Test this commit and mark it.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(colors.red(`error: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * Mark current commit as bad
 */
export function bisectBad(commit?: string): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  if (!manager.isInProgress()) {
    console.error(colors.red('error: No bisect session in progress'));
    console.error('hint: Start with `tsgit bisect start <bad> <good>`');
    process.exit(1);
  }

  try {
    manager.markBad(commit);
    
    const session = manager.getSession();
    console.log(colors.red('Marked as bad'));
    console.log('');
    console.log(manager.visualize());

    if (session?.completed) {
      const result = manager.getResult();
      if (result) {
        console.log('');
        console.log(formatBisectResult(result));
      }
    } else {
      console.log('');
      console.log(`${colors.yellow('Next:')} Test this commit and mark it.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(colors.red(`error: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * Skip current commit
 */
export function bisectSkip(commit?: string): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  if (!manager.isInProgress()) {
    console.error(colors.red('error: No bisect session in progress'));
    console.error('hint: Start with `tsgit bisect start <bad> <good>`');
    process.exit(1);
  }

  try {
    manager.skip(commit);
    
    const session = manager.getSession();
    console.log(colors.dim('Skipped'));
    console.log('');
    console.log(manager.visualize());

    if (session?.completed) {
      const result = manager.getResult();
      if (result) {
        console.log('');
        console.log(formatBisectResult(result));
      }
    } else {
      console.log('');
      console.log(`${colors.yellow('Next:')} Test this commit and mark it.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(colors.red(`error: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * Reset bisect session
 */
export function bisectReset(): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  if (!manager.isInProgress()) {
    console.log('No bisect session in progress');
    return;
  }

  try {
    manager.reset();
    console.log(colors.green('Bisect session reset'));
    console.log('Returned to original HEAD');
  } catch (error) {
    if (error instanceof Error) {
      console.error(colors.red(`error: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * Show bisect status
 */
export function bisectStatus(): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  if (!manager.isInProgress()) {
    console.log('No bisect session in progress');
    console.log('');
    console.log('Start a new session with:');
    console.log(`  ${colors.cyan('tsgit bisect start <bad> <good>')}`);
    return;
  }

  console.log(manager.visualize());

  const session = manager.getSession();
  if (session?.completed) {
    const result = manager.getResult();
    if (result) {
      console.log('');
      console.log(formatBisectResult(result));
    }
  }
}

/**
 * Show bisect log
 */
export function bisectLog(): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  if (!manager.isInProgress()) {
    console.log('No bisect session in progress');
    return;
  }

  console.log(manager.getLog());
}

/**
 * Run automatic bisect with a test command
 */
export function bisectRun(command: string): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  if (!manager.isInProgress()) {
    console.error(colors.red('error: No bisect session in progress'));
    console.error('hint: Start with `tsgit bisect start <bad> <good> --run "<command>"`');
    process.exit(1);
  }

  const session = manager.getSession();
  if (!session) {
    process.exit(1);
  }

  // Update the test command
  session.testCommand = command;

  console.log(colors.bold('Starting automatic bisect...'));
  console.log(`Test command: ${colors.cyan(command)}`);
  console.log('');

  try {
    manager.runAutomatic();

    const result = manager.getResult();
    if (result) {
      console.log('');
      console.log(formatBisectResult(result));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(colors.red(`error: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * Show help
 */
export function bisectHelp(): void {
  console.log(BisectManager.getHelp());
}

/**
 * Save replay to file
 */
export function bisectSaveReplay(filename: string): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  if (!manager.isInProgress()) {
    console.error(colors.red('error: No bisect session in progress'));
    process.exit(1);
  }

  try {
    manager.saveReplay(filename);
    console.log(`Replay saved to ${colors.cyan(filename)}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(colors.red(`error: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * Load and replay a saved session
 */
export function bisectReplay(filename: string): void {
  const repo = Repository.find();
  const manager = new BisectManager(repo);

  try {
    manager.loadReplay(filename);
    console.log(`Replayed session from ${colors.cyan(filename)}`);
    console.log('');
    console.log(manager.visualize());
  } catch (error) {
    if (error instanceof Error) {
      console.error(colors.red(`error: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * CLI handler for bisect command
 */
export function handleBisect(args: string[]): void {
  if (args.length === 0) {
    bisectStatus();
    return;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  // Parse options
  const options: Partial<BisectStartOptions> = {};
  const positional: string[] = [];
  
  for (let i = 0; i < subArgs.length; i++) {
    const arg = subArgs[i];
    
    if (arg === '--focus') {
      if (!options.focusPaths) options.focusPaths = [];
      options.focusPaths.push(subArgs[++i]);
    } else if (arg === '--run') {
      options.testCommand = subArgs[++i];
    } else if (arg === '--auto') {
      options.autoRun = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  switch (subcommand) {
    case 'start':
      if (positional.length < 2) {
        console.error(colors.red('error: bisect start requires <bad> and <good> commits'));
        console.error('');
        console.error('Usage: tsgit bisect start <bad> <good> [options]');
        console.error('');
        console.error('Examples:');
        console.error('  tsgit bisect start HEAD HEAD~20');
        console.error('  tsgit bisect start main feature-branch --focus src/');
        console.error('  tsgit bisect start HEAD v1.0.0 --run "npm test"');
        process.exit(1);
      }
      bisectStart(positional[0], positional[1], options);
      break;

    case 'good':
    case 'old':  // git bisect old is an alias
      bisectGood(positional[0]);
      break;

    case 'bad':
    case 'new':  // git bisect new is an alias
      bisectBad(positional[0]);
      break;

    case 'skip':
      bisectSkip(positional[0]);
      break;

    case 'reset':
      bisectReset();
      break;

    case 'status':
      bisectStatus();
      break;

    case 'log':
      bisectLog();
      break;

    case 'run':
      if (positional.length === 0) {
        console.error(colors.red('error: bisect run requires a command'));
        console.error('Usage: tsgit bisect run <command>');
        process.exit(1);
      }
      bisectRun(positional.join(' '));
      break;

    case 'save-replay':
      if (positional.length === 0) {
        console.error(colors.red('error: bisect save-replay requires a filename'));
        process.exit(1);
      }
      bisectSaveReplay(positional[0]);
      break;

    case 'replay':
      if (positional.length === 0) {
        console.error(colors.red('error: bisect replay requires a filename'));
        process.exit(1);
      }
      bisectReplay(positional[0]);
      break;

    case 'help':
    case '--help':
    case '-h':
      bisectHelp();
      break;

    default:
      console.error(colors.red(`error: Unknown bisect subcommand: ${subcommand}`));
      console.error('');
      console.error('Available subcommands:');
      console.error('  start <bad> <good>   Start bisecting');
      console.error('  good [commit]        Mark as good');
      console.error('  bad [commit]         Mark as bad');
      console.error('  skip [commit]        Skip commit');
      console.error('  reset                Stop bisecting');
      console.error('  status               Show status');
      console.error('  log                  Show log');
      console.error('  run <command>        Auto-run tests');
      console.error('  help                 Show help');
      process.exit(1);
  }
}
