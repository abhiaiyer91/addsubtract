/**
 * Clone Command
 * Clone a repository
 * 
 * Usage:
 *   wit clone <url> [<dir>]       # Clone repository
 *   wit clone --depth <n> <url>   # Shallow clone
 *   wit clone --branch <b> <url>  # Clone specific branch
 *   wit clone --bare <url>        # Bare clone
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { RemoteManager } from '../core/remote';
import { Refs } from '../core/refs';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, mkdirp } from '../utils/fs';
import {
  SmartHttpClient,
  normalizeRepoUrl,
  parsePackfile,
  resolveHead,
  getBranches,
  getTags,
} from '../core/protocol';
import { colors } from '../utils/colors';

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

  // Handle file paths - keep the original path, only extract name without .git
  const name = path.basename(url).replace(/\.git$/, '');
  return {
    protocol: 'file',
    host: '',
    path: url, // Keep original path including .git suffix
    name,
  };
}

/**
 * Clone a local repository (file:// protocol)
 * Supports both regular repos (with .wit directory) and bare repos
 */
function cloneLocal(sourcePath: string, destPath: string, options: CloneOptions): Repository {
  // Check for source repository - support both .wit and bare repos
  let sourceGitDir = path.join(sourcePath, '.wit');
  // isBareSource detection handled inline
  
  if (!exists(sourceGitDir)) {
    // Check if it's a bare repository (objects dir directly in path)
    if (exists(path.join(sourcePath, 'objects'))) {
      sourceGitDir = sourcePath;
      // isBareSource = true; // detected but not currently used
    } else {
      throw new TsgitError(
        `repository '${sourcePath}' does not exist`,
        ErrorCode.NOT_A_REPOSITORY,
        ['Check the path and try again']
      );
    }
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

  // Create refs from source - for bare repos, read refs directly
  const sourceRefs = new Refs(sourceGitDir);
  const branches = sourceRefs.listBranches();
  
  // Set up remote tracking branches
  console.log(colors.dim('Setting up remote tracking branches...'));
  for (const branch of branches) {
    const hash = sourceRefs.resolve(branch);
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
    const hash = sourceRefs.resolve(defaultBranch);
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
 * Clone a remote repository using Smart HTTP protocol
 */
async function cloneRemoteAsync(url: string, destPath: string, options: CloneOptions): Promise<Repository> {
  console.log(colors.dim(`Cloning into '${destPath}'...`));
  
  // Normalize URL for HTTP client
  const httpUrl = normalizeRepoUrl(url);
  
  // Create HTTP client first to discover remote's capabilities
  const client = new SmartHttpClient(httpUrl);
  
  // Initialize repository (defaults to SHA-1 for Git interoperability)
  const repo = Repository.init(destPath);
  const remoteManager = new RemoteManager(repo.gitDir);
  remoteManager.init();

  const originName = options.origin || 'origin';

  // Add origin remote
  remoteManager.add(originName, url);

  try {
    // Step 1: Discover refs from remote
    if (options.progress) {
      console.log(colors.dim('Discovering refs...'));
    }
    
    const advertisement = await client.discoverRefs('upload-pack');
    
    if (advertisement.refs.length === 0) {
      console.log(colors.yellow('!') + ' Remote repository appears to be empty');
      return repo;
    }

    // Determine what to fetch
    const branches = getBranches(advertisement);
    const tags = getTags(advertisement);
    
    if (options.progress) {
      console.log(colors.dim(`Found ${branches.length} branches, ${tags.length} tags`));
    }

    // Get refs to fetch based on options
    let wantRefs = branches.map(r => r.hash);
    
    // Add tags
    for (const tag of tags) {
      if (!wantRefs.includes(tag.hash)) {
        wantRefs.push(tag.hash);
      }
      // Also get peeled refs for annotated tags
      if (tag.peeled && !wantRefs.includes(tag.peeled)) {
        wantRefs.push(tag.peeled);
      }
    }

    // If specific branch requested, filter to just that
    if (options.branch) {
      const targetBranch = branches.find(
        b => b.name === `refs/heads/${options.branch}` || b.name === options.branch
      );
      if (targetBranch) {
        wantRefs = [targetBranch.hash];
      } else {
        throw new TsgitError(
          `Remote branch '${options.branch}' not found`,
          ErrorCode.REF_NOT_FOUND,
          branches.map(b => `  ${b.name.replace('refs/heads/', '')}`)
        );
      }
    }

    // Remove duplicates
    wantRefs = [...new Set(wantRefs)];

    if (wantRefs.length === 0) {
      console.log(colors.yellow('!') + ' No refs to fetch');
      return repo;
    }

    // Step 2: Fetch pack file
    if (options.progress) {
      console.log(colors.dim(`Fetching ${wantRefs.length} refs...`));
    }

    const fetchOptions = options.depth ? { depth: options.depth } : undefined;
    const packData = await client.fetchPack(wantRefs, [], fetchOptions);

    if (options.progress) {
      console.log(colors.dim(`Received ${packData.length} bytes`));
    }

    // Step 3: Parse pack file and store objects
    if (options.progress) {
      console.log(colors.dim('Unpacking objects...'));
    }

    const parsedPack = parsePackfile(packData, options.progress ? (info) => {
      process.stdout.write(`\r${colors.dim(`${info.phase}: ${info.current}/${info.total}`)}`);
    } : undefined);

    if (options.progress) {
      console.log(); // New line after progress
    }

    // Store all objects
    let objectsStored = 0;
    for (const obj of parsedPack.objects) {
      repo.objects.writeRawObject(obj.type, obj.data, obj.hash);
      objectsStored++;
    }

    if (options.progress) {
      console.log(colors.dim(`Stored ${objectsStored} objects`));
    }

    // Step 4: Set up refs
    // Update remote tracking branches
    for (const branch of branches) {
      const branchName = branch.name.replace('refs/heads/', '');
      remoteManager.updateTrackingBranch(originName, branchName, branch.hash);
    }

    // Create tags
    for (const tag of tags) {
      const tagName = tag.name.replace('refs/tags/', '');
      try {
        repo.refs.createTag(tagName, tag.hash);
      } catch {
        // Tag may already exist
      }
    }

    // Step 5: Determine default branch and checkout
    let defaultBranch = options.branch;
    
    if (!defaultBranch) {
      // Try to determine from HEAD symref
      const headTarget = resolveHead(advertisement);
      if (headTarget) {
        defaultBranch = headTarget.replace('refs/heads/', '');
      } else {
        // Fall back to main or master
        if (branches.find(b => b.name === 'refs/heads/main')) {
          defaultBranch = 'main';
        } else if (branches.find(b => b.name === 'refs/heads/master')) {
          defaultBranch = 'master';
        } else if (branches.length > 0) {
          defaultBranch = branches[0].name.replace('refs/heads/', '');
        }
      }
    }

    // Create local branch and checkout
    if (defaultBranch && !options.bare && !options.noCheckout) {
      const branchRef = branches.find(
        b => b.name === `refs/heads/${defaultBranch}` || b.name === defaultBranch
      );
      
      if (branchRef) {
        // Create local branch pointing to the same commit
        repo.refs.createBranch(defaultBranch, branchRef.hash);
        repo.refs.setHeadSymbolic(`refs/heads/${defaultBranch}`);
        
        // Set up tracking
        remoteManager.setTrackingBranch(defaultBranch, originName, defaultBranch);
        
        // Checkout the tree
        if (options.progress) {
          console.log(colors.dim(`Checking out '${defaultBranch}'...`));
        }
        repo.checkout(defaultBranch);
      }
    }

    // Configure shallow clone if requested
    if (options.depth) {
      repo.partialClone.enable(url, {
        type: 'tree:depth',
        depth: options.depth,
      });
    }

    return repo;
  } catch (error) {
    // Clean up on failure
    if (exists(destPath)) {
      try {
        fs.rmSync(destPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Clone a repository (async version for remote repos)
 */
export async function cloneAsync(url: string, directory?: string, options: CloneOptions = {}): Promise<Repository> {
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
          `wit clone ${url} ${destPath}-new    # Use a different name`,
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
    // Remote clone using Smart HTTP
    repo = await cloneRemoteAsync(url, absoluteDest, options);
  }

  // Handle bare repository
  if (options.bare) {
    console.log(colors.dim('Note: Bare repository created'));
  }

  return repo;
}

/**
 * Clone a repository (sync version, only works for local repos)
 */
export function clone(url: string, directory?: string, options: CloneOptions = {}): Repository {
  const parsed = parseRepoUrl(url);
  
  if (parsed.protocol !== 'file') {
    throw new TsgitError(
      'Synchronous clone only works for local repositories. Use cloneAsync() for remote repositories.',
      ErrorCode.OPERATION_FAILED,
      ['Use: await cloneAsync(url, directory, options)']
    );
  }
  
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
          `wit clone ${url} ${destPath}-new    # Use a different name`,
        ]
      );
    }
  }

  // Create destination directory
  mkdirp(absoluteDest);

  const sourcePath = path.resolve(parsed.path);
  const repo = cloneLocal(sourcePath, absoluteDest, options);

  if (options.bare) {
    console.log(colors.dim('Note: Bare repository created'));
  }

  return repo;
}

/**
 * CLI handler for clone command (async)
 */
export async function handleCloneAsync(args: string[]): Promise<void> {
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
    console.error('  wit clone <repository> [<directory>]');
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
    const repo = await cloneAsync(url, directory, options);
    
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

/**
 * CLI handler for clone command (sync wrapper)
 */
export function handleClone(args: string[]): void {
  handleCloneAsync(args).catch(error => {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  });
}
