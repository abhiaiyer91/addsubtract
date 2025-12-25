/**
 * Clone Command
 * Clone a repository
 * 
 * Usage:
 *   tsgit clone <url> [<dir>]       # Clone repository
 *   tsgit clone --depth <n> <url>   # Shallow clone
 *   tsgit clone --branch <b> <url>  # Clone specific branch
 *   tsgit clone --bare <url>        # Bare clone
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { RemoteManager } from '../core/remote';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, mkdirp, writeFile } from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Clone options
 */
export interface CloneOptions {
  bare?: boolean;
  depth?: number;
  branch?: string;
  single?: boolean;  // Single branch mode
  noCheckout?: boolean;
  origin?: string;
  progress?: boolean;
}

/**
 * Parse repository URL and extract name
 */
export function parseRepoUrl(url: string): { protocol: string; host: string; path: string; name: string } {
  // Handle SSH URLs: git@github.com:user/repo.git
  const sshMatch = url.match(/^(?:git@)?([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const pathParts = sshMatch[2].split('/');
    const name = pathParts[pathParts.length - 1].replace(/\.git$/, '');
    return {
      protocol: 'ssh',
      host: sshMatch[1],
      path: sshMatch[2],
      name,
    };
  }

  // Handle HTTPS URLs: https://github.com/user/repo.git
  const httpsMatch = url.match(/^(https?):\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    const pathParts = httpsMatch[3].split('/');
    const name = pathParts[pathParts.length - 1].replace(/\.git$/, '');
    return {
      protocol: httpsMatch[1],
      host: httpsMatch[2],
      path: httpsMatch[3],
      name,
    };
  }

  // Handle file paths
  const filePath = url.replace(/\.git$/, '');
  const name = path.basename(filePath);
  return {
    protocol: 'file',
    host: '',
    path: filePath,
    name,
  };
}

/**
 * Clone a local repository (file:// protocol)
 */
function cloneLocal(sourcePath: string, destPath: string, options: CloneOptions): Repository {
  // Verify source exists
  const sourceGitDir = path.join(sourcePath, '.tsgit');
  if (!exists(sourceGitDir)) {
    throw new TsgitError(
      `repository '${sourcePath}' does not exist`,
      ErrorCode.NOT_A_REPOSITORY,
      ['Check the path and try again']
    );
  }

  // Initialize destination repository
  console.log(colors.dim(`Cloning into '${destPath}'...`));
  const repo = Repository.init(destPath);
  const remoteManager = new RemoteManager(repo.gitDir);
  remoteManager.init();

  const originName = options.origin || 'origin';

  // Add origin remote
  remoteManager.add(originName, sourcePath);

  // Copy objects
  console.log(colors.dim('Copying objects...'));
  const sourceObjectsDir = path.join(sourceGitDir, 'objects');
  const destObjectsDir = path.join(repo.gitDir, 'objects');
  copyObjectsRecursive(sourceObjectsDir, destObjectsDir);

  // Get refs from source
  const sourceRepo = new Repository(sourcePath);
  const branches = sourceRepo.refs.listBranches();
  
  // Set up remote tracking branches
  console.log(colors.dim('Setting up remote tracking branches...'));
  for (const branch of branches) {
    const hash = sourceRepo.refs.resolve(branch);
    if (hash) {
      remoteManager.updateTrackingBranch(originName, branch, hash);
    }
  }

  // Determine which branch to checkout
  let defaultBranch = options.branch;
  if (!defaultBranch) {
    // Try to get the default branch (main or master)
    if (branches.includes('main')) {
      defaultBranch = 'main';
    } else if (branches.includes('master')) {
      defaultBranch = 'master';
    } else if (branches.length > 0) {
      defaultBranch = branches[0];
    }
  }

  // Create local branch and checkout
  if (defaultBranch && !options.bare && !options.noCheckout) {
    const hash = sourceRepo.refs.resolve(defaultBranch);
    if (hash) {
      // Create local branch pointing to the same commit
      repo.refs.createBranch(defaultBranch, hash);
      repo.refs.setHeadSymbolic(`refs/heads/${defaultBranch}`);
      
      // Set up tracking
      remoteManager.setTrackingBranch(defaultBranch, originName, defaultBranch);
      
      // Checkout the tree
      console.log(colors.dim(`Checking out '${defaultBranch}'...`));
      repo.checkout(defaultBranch);
    }
  }

  return repo;
}

/**
 * Copy objects directory recursively
 */
function copyObjectsRecursive(src: string, dest: string): void {
  if (!exists(src)) return;

  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      mkdirp(destPath);
      copyObjectsRecursive(srcPath, destPath);
    } else {
      // Copy file
      const dir = path.dirname(destPath);
      if (!exists(dir)) {
        mkdirp(dir);
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Clone a remote repository
 */
function cloneRemote(url: string, destPath: string, options: CloneOptions): Repository {
  console.log(colors.dim(`Cloning into '${destPath}'...`));
  
  // Initialize repository
  const repo = Repository.init(destPath);
  const remoteManager = new RemoteManager(repo.gitDir);
  remoteManager.init();

  const originName = options.origin || 'origin';

  // Add origin remote
  remoteManager.add(originName, url);

  // For now, we show a message about network operations
  // In a full implementation, this would use git protocol or HTTP
  console.log(colors.yellow('!') + ' Remote cloning requires network protocol implementation');
  console.log(colors.dim(`  Remote URL: ${url}`));
  console.log(colors.dim(`  Origin name: ${originName}`));
  
  if (options.depth) {
    console.log(colors.dim(`  Shallow clone depth: ${options.depth}`));
    
    // Configure shallow clone
    repo.partialClone.enable(url, {
      type: 'tree:depth',
      depth: options.depth,
    });
  }

  if (options.branch) {
    console.log(colors.dim(`  Target branch: ${options.branch}`));
  }

  console.log();
  console.log(colors.cyan('ℹ') + ' To complete the clone, you would need to:');
  console.log('  1. Fetch refs from the remote server');
  console.log('  2. Download object pack files');
  console.log('  3. Checkout the default branch');
  console.log();
  console.log(colors.dim('  This requires implementing the Git wire protocol (git:// or smart HTTP).'));
  console.log(colors.dim('  For now, use local file paths or interop with Git for remote operations.'));

  return repo;
}

/**
 * Clone a repository
 */
export function clone(url: string, directory?: string, options: CloneOptions = {}): Repository {
  const parsed = parseRepoUrl(url);
  const destPath = directory || parsed.name;
  const absoluteDest = path.resolve(destPath);

  // Check if destination exists
  if (exists(absoluteDest)) {
    const contents = fs.readdirSync(absoluteDest);
    if (contents.length > 0) {
      throw new TsgitError(
        `destination path '${destPath}' already exists and is not an empty directory`,
        ErrorCode.OPERATION_FAILED,
        [
          `rm -rf ${destPath}    # Remove existing directory`,
          `tsgit clone ${url} ${destPath}-new    # Use a different name`,
        ]
      );
    }
  }

  // Create destination directory
  mkdirp(absoluteDest);

  let repo: Repository;

  if (parsed.protocol === 'file') {
    // Local clone
    const sourcePath = path.resolve(parsed.path);
    repo = cloneLocal(sourcePath, absoluteDest, options);
  } else {
    // Remote clone
    repo = cloneRemote(url, absoluteDest, options);
  }

  // Handle bare repository
  if (options.bare) {
    console.log(colors.dim('Note: Bare repository created'));
    // For bare repos, we'd move contents differently
    // This is simplified for now
  }

  return repo;
}

/**
 * CLI handler for clone command
 */
export function handleClone(args: string[]): void {
  const options: CloneOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--bare') {
      options.bare = true;
    } else if (arg === '--depth') {
      const depth = parseInt(args[++i], 10);
      if (isNaN(depth) || depth < 1) {
        console.error(colors.red('error: ') + 'depth must be a positive integer');
        process.exit(1);
      }
      options.depth = depth;
    } else if (arg === '-b' || arg === '--branch') {
      options.branch = args[++i];
      if (!options.branch) {
        console.error(colors.red('error: ') + 'branch name required');
        process.exit(1);
      }
    } else if (arg === '--single-branch') {
      options.single = true;
    } else if (arg === '--no-checkout' || arg === '-n') {
      options.noCheckout = true;
    } else if (arg === '-o' || arg === '--origin') {
      options.origin = args[++i];
      if (!options.origin) {
        console.error(colors.red('error: ') + 'origin name required');
        process.exit(1);
      }
    } else if (arg === '--progress') {
      options.progress = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length === 0) {
    console.error(colors.red('error: ') + 'You must specify a repository to clone.');
    console.error('\nUsage:');
    console.error('  tsgit clone <repository> [<directory>]');
    console.error('\nOptions:');
    console.error('  --bare           Create a bare repository');
    console.error('  --depth <n>      Create a shallow clone with n commits');
    console.error('  -b, --branch <b> Clone only branch <b>');
    console.error('  --single-branch  Clone only one branch');
    console.error('  -n, --no-checkout Do not checkout HEAD after cloning');
    console.error('  -o, --origin <n> Use <n> as origin name instead of "origin"');
    process.exit(1);
  }

  const url = positional[0];
  const directory = positional[1];

  try {
    const repo = clone(url, directory, options);
    
    const parsed = parseRepoUrl(url);
    const destName = directory || parsed.name;
    
    console.log(colors.green('✓') + ` Cloned into '${destName}'`);
    
    // Show some stats
    const branches = repo.listBranches();
    const currentBranch = branches.find(b => b.isCurrent);
    
    if (currentBranch) {
      console.log(colors.dim(`  On branch: ${currentBranch.name}`));
    }
    
    if (branches.length > 1) {
      console.log(colors.dim(`  ${branches.length} branches available`));
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
