/**
 * Remote Command
 * Manage remote repositories
 * 
 * Usage:
 *   wit remote                    # List remotes
 *   wit remote -v                 # List with URLs
 *   wit remote add <name> <url>   # Add remote
 *   wit remote remove <name>      # Remove remote
 *   wit remote rename <old> <new> # Rename remote
 *   wit remote get-url <name>     # Show URL
 *   wit remote set-url <name> <url> # Change URL
 */

import { Repository } from '../core/repository';
import { RemoteManager } from '../core/remote';
import { TsgitError, ErrorCode } from '../core/errors';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * List remotes
 */
export function listRemotes(verbose: boolean = false): void {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);
  const remotes = remoteManager.list();

  if (remotes.length === 0) {
    // No output for empty list (matches Git behavior)
    return;
  }

  for (const remote of remotes) {
    if (verbose) {
      console.log(`${remote.name}\t${remote.url} (fetch)`);
      console.log(`${remote.name}\t${remote.pushUrl || remote.url} (push)`);
    } else {
      console.log(remote.name);
    }
  }
}

/**
 * Add a remote
 */
export function addRemote(name: string, url: string): void {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);
  remoteManager.init();
  
  remoteManager.add(name, url);
  console.log(colors.green('✓') + ` Added remote '${name}' at ${url}`);
}

/**
 * Remove a remote
 */
export function removeRemote(name: string): void {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);
  
  remoteManager.remove(name);
  console.log(colors.green('✓') + ` Removed remote '${name}'`);
}

/**
 * Rename a remote
 */
export function renameRemote(oldName: string, newName: string): void {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);
  
  remoteManager.rename(oldName, newName);
  console.log(colors.green('✓') + ` Renamed remote '${oldName}' to '${newName}'`);
}

/**
 * Get remote URL
 */
export function getRemoteUrl(name: string, push: boolean = false): void {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);
  
  const url = remoteManager.getUrl(name, push);
  console.log(url);
}

/**
 * Set remote URL
 */
export function setRemoteUrl(name: string, url: string, push: boolean = false): void {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);
  
  remoteManager.setUrl(name, url, { push });
  console.log(colors.green('✓') + ` Updated URL for remote '${name}'`);
}

/**
 * Show remote details
 */
export function showRemote(name: string): void {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);
  
  const remote = remoteManager.get(name);
  if (!remote) {
    throw new TsgitError(
      `No such remote: '${name}'`,
      ErrorCode.REF_NOT_FOUND
    );
  }

  console.log(colors.bold(`* remote ${name}`));
  console.log(`  Fetch URL: ${remote.url}`);
  console.log(`  Push  URL: ${remote.pushUrl || remote.url}`);
  
  // Show tracking branches
  const trackingBranches = remoteManager.getTrackingBranches(name);
  if (trackingBranches.length > 0) {
    console.log(`  Remote branches:`);
    for (const branch of trackingBranches) {
      console.log(`    ${branch.branch}`);
    }
  }
}

/**
 * Prune stale remote tracking branches
 */
export function pruneRemote(name: string): void {
  const repo = Repository.find();
  const remoteManager = new RemoteManager(repo.gitDir);
  
  if (!remoteManager.exists(name)) {
    throw new TsgitError(
      `No such remote: '${name}'`,
      ErrorCode.REF_NOT_FOUND
    );
  }

  // In a real implementation, this would compare with the remote
  // For now, just report what would be pruned
  console.log(colors.yellow('!') + ` Pruning would require connecting to remote '${name}'`);
  console.log(colors.dim('  This feature requires network access to the remote repository'));
}

/**
 * CLI handler for remote command
 */
export function handleRemote(args: string[]): void {
  // Parse options
  const options: Record<string, boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--push') {
      options.push = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const subcommand = positional[0];

  try {
    switch (subcommand) {
      case undefined:
        // List remotes
        listRemotes(options.verbose);
        break;

      case 'add': {
        const name = positional[1];
        const url = positional[2];
        
        if (!name || !url) {
          console.error(colors.red('error: ') + 'usage: wit remote add <name> <url>');
          process.exit(1);
        }
        
        addRemote(name, url);
        break;
      }

      case 'remove':
      case 'rm': {
        const name = positional[1];
        
        if (!name) {
          console.error(colors.red('error: ') + 'usage: wit remote remove <name>');
          process.exit(1);
        }
        
        removeRemote(name);
        break;
      }

      case 'rename': {
        const oldName = positional[1];
        const newName = positional[2];
        
        if (!oldName || !newName) {
          console.error(colors.red('error: ') + 'usage: wit remote rename <old> <new>');
          process.exit(1);
        }
        
        renameRemote(oldName, newName);
        break;
      }

      case 'get-url': {
        const name = positional[1];
        
        if (!name) {
          console.error(colors.red('error: ') + 'usage: wit remote get-url <name>');
          process.exit(1);
        }
        
        getRemoteUrl(name, options.push);
        break;
      }

      case 'set-url': {
        const name = positional[1];
        const url = positional[2];
        
        if (!name || !url) {
          console.error(colors.red('error: ') + 'usage: wit remote set-url <name> <url>');
          process.exit(1);
        }
        
        setRemoteUrl(name, url, options.push);
        break;
      }

      case 'show': {
        const name = positional[1];
        
        if (!name) {
          // Show all remotes with verbose info
          listRemotes(true);
        } else {
          showRemote(name);
        }
        break;
      }

      case 'prune': {
        const name = positional[1];
        
        if (!name) {
          console.error(colors.red('error: ') + 'usage: wit remote prune <name>');
          process.exit(1);
        }
        
        pruneRemote(name);
        break;
      }

      default: {
        // Check if it might be a remote name for 'show'
        const repo = Repository.find();
        const remoteManager = new RemoteManager(repo.gitDir);
        
        if (remoteManager.exists(subcommand)) {
          showRemote(subcommand);
        } else {
          console.error(colors.red('error: ') + `Unknown subcommand: ${subcommand}`);
          console.error('\nUsage:');
          console.error('  wit remote                      List remotes');
          console.error('  wit remote -v                   List with URLs');
          console.error('  wit remote add <name> <url>     Add remote');
          console.error('  wit remote remove <name>        Remove remote');
          console.error('  wit remote rename <old> <new>   Rename remote');
          console.error('  wit remote get-url <name>       Show URL');
          console.error('  wit remote set-url <name> <url> Change URL');
          console.error('  wit remote show <name>          Show remote details');
          process.exit(1);
        }
      }
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
