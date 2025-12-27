import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Repository } from '../../core/repository';
import { ObjectStore } from '../../core/object-store';
import { Index } from '../../core/index';
import { Refs } from '../../core/refs';
import { exists, mkdirp } from '../../utils/fs';

/**
 * Repository information
 */
export interface RepoInfo {
  owner: string;
  name: string;
  path: string;
  bare: boolean;
}

/**
 * Storage error class
 */
export class StorageError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Execute a shell command and return output
 */
function exec(command: string, cwd?: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error instanceof Error && 'stderr' in error) {
      throw new StorageError(
        (error as any).stderr || error.message,
        'EXEC_FAILED'
      );
    }
    throw error;
  }
}

/**
 * Generate disk path for a repository
 */
export function getRepoDiskPath(
  ownerUsername: string,
  repoName: string,
  baseDir?: string
): string {
  const reposDir = baseDir || process.env.REPOS_DIR || './repos';
  return path.join(reposDir, ownerUsername, `${repoName}.git`);
}

/**
 * Resolve a stored diskPath to an absolute filesystem path.
 * 
 * Database stores paths like "/repos/owner/name.git" which need to be
 * resolved relative to REPOS_DIR (e.g., "./repos" or "~/.wit/repos").
 * 
 * @param storedPath - The diskPath from the database (e.g., "/repos/owner/name.git")
 * @returns The absolute filesystem path
 */
export function resolveDiskPath(storedPath: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  
  // Strip the /repos/ prefix if present, then join with actual REPOS_DIR
  const relativePath = storedPath.replace(/^\/repos\//, '');
  
  return path.isAbsolute(reposDir) 
    ? path.join(reposDir, relativePath)
    : path.join(process.cwd(), reposDir, relativePath);
}

/**
 * Repository manager for server-side repository storage
 * Manages bare repositories organized by owner/repo structure
 */
export class RepoManager {
  private repoCache: Map<string, Repository> = new Map();

  constructor(private baseDir: string) {
    // Ensure base directory exists
    mkdirp(this.baseDir);
  }

  /**
   * Get the full path for a repository
   */
  private getRepoPath(owner: string, name: string): string {
    // Normalize name - add .git suffix if not present
    const repoName = name.endsWith('.git') ? name : `${name}.git`;
    return path.join(this.baseDir, owner, repoName);
  }

  /**
   * Get or create a repository
   * Creates a bare repository if it doesn't exist
   */
  getRepo(owner: string, name: string, autoCreate: boolean = true): BareRepository | null {
    const repoPath = this.getRepoPath(owner, name);
    const cacheKey = `${owner}/${name}`;

    // Check cache first
    if (this.repoCache.has(cacheKey)) {
      return this.repoCache.get(cacheKey) as BareRepository;
    }

    // Check if repo exists - for bare repos, check objects/ directly in repo path
    if (exists(repoPath) && exists(path.join(repoPath, 'objects'))) {
      const repo = new BareRepository(repoPath);
      if (repo.isValid()) {
        this.repoCache.set(cacheKey, repo);
        return repo;
      }
    }

    // Auto-create if enabled
    if (autoCreate) {
      const repo = this.initBareRepo(owner, name);
      this.repoCache.set(cacheKey, repo);
      return repo;
    }

    return null;
  }

  /**
   * Initialize a new bare repository
   */
  initBareRepo(owner: string, name: string): Repository {
    const repoPath = this.getRepoPath(owner, name);

    if (exists(repoPath)) {
      throw new Error(`Repository already exists: ${owner}/${name}`);
    }

    // Create owner directory
    const ownerDir = path.join(this.baseDir, owner);
    mkdirp(ownerDir);

    // Create repository directory structure (bare repo)
    mkdirp(repoPath);
    mkdirp(path.join(repoPath, 'objects'));
    mkdirp(path.join(repoPath, 'refs', 'heads'));
    mkdirp(path.join(repoPath, 'refs', 'tags'));
    mkdirp(path.join(repoPath, 'info'));

    // For a bare repository, the git dir IS the repo path
    // Write HEAD pointing to main branch
    fs.writeFileSync(path.join(repoPath, 'HEAD'), 'ref: refs/heads/main\n');

    // Write config for bare repository
    const config = `[core]
    repositoryformatversion = 0
    filemode = true
    bare = true
[wit]
    hashAlgorithm = sha1
`;
    fs.writeFileSync(path.join(repoPath, 'config'), config);

    // Write description
    fs.writeFileSync(
      path.join(repoPath, 'description'),
      `${owner}/${name} repository\n`
    );

    console.log(`[server] Initialized bare repository: ${owner}/${name}`);

    // Create a repository object - for bare repos, workDir is the gitDir
    return new BareRepository(repoPath);
  }

  /**
   * Check if a repository exists
   */
  exists(owner: string, name: string): boolean {
    const repoPath = this.getRepoPath(owner, name);
    return exists(repoPath) && exists(path.join(repoPath, 'objects'));
  }

  /**
   * List all repositories
   */
  listRepos(): RepoInfo[] {
    const repos: RepoInfo[] = [];

    if (!exists(this.baseDir)) {
      return repos;
    }

    // List owner directories
    const owners = fs.readdirSync(this.baseDir).filter(f => {
      const fullPath = path.join(this.baseDir, f);
      return fs.statSync(fullPath).isDirectory();
    });

    for (const owner of owners) {
      const ownerDir = path.join(this.baseDir, owner);
      const repoNames = fs.readdirSync(ownerDir).filter(f => {
        const fullPath = path.join(ownerDir, f);
        return fs.statSync(fullPath).isDirectory() && f.endsWith('.git');
      });

      for (const repoName of repoNames) {
        const repoPath = path.join(ownerDir, repoName);
        // Check if it's a valid repository
        if (exists(path.join(repoPath, 'objects'))) {
          repos.push({
            owner,
            name: repoName.replace(/\.git$/, ''),
            path: repoPath,
            bare: true,
          });
        }
      }
    }

    return repos;
  }

  /**
   * Delete a repository
   */
  deleteRepo(owner: string, name: string): void {
    const repoPath = this.getRepoPath(owner, name);
    const cacheKey = `${owner}/${name}`;

    if (!exists(repoPath)) {
      throw new Error(`Repository not found: ${owner}/${name}`);
    }

    // Remove from cache
    this.repoCache.delete(cacheKey);

    // Delete the repository directory
    fs.rmSync(repoPath, { recursive: true, force: true });

    console.log(`[server] Deleted repository: ${owner}/${name}`);
  }

  /**
   * Clear the repository cache
   */
  clearCache(): void {
    this.repoCache.clear();
  }
}

/**
 * Bare repository class - a repository without a working directory
 * The git directory IS the repository directory
 */
export class BareRepository extends Repository {
  constructor(repoPath: string) {
    // For bare repos, we need to trick the Repository constructor
    // The parent expects workDir/.wit to be gitDir
    // But for bare repos, workDir IS gitDir
    super(repoPath, { hashAlgorithm: 'sha1' });

    // Override the gitDir to be the repoPath itself (not repoPath/.wit)
    (this as any).gitDir = repoPath;
    (this as any).workDir = repoPath;

    // Reinitialize components with the correct gitDir
    (this as any).objects = new ObjectStore(repoPath);
    (this as any).index = new Index(repoPath);
    (this as any).refs = new Refs(repoPath);
  }

  /**
   * Check if this is a valid bare repository
   */
  isValid(): boolean {
    return exists(path.join(this.gitDir, 'objects'));
  }
}

/**
 * Fork a repository on disk using git clone --bare
 * 
 * Creates a bare clone of the source repository at the target path,
 * preserving all branches, tags, and commit history. Sets up the
 * upstream remote pointing to the parent repository.
 * 
 * @param sourceRepoPath - Path to the source bare repository
 * @param targetPath - Path where the fork will be created
 * @param parentUrl - URL of the parent repository (for remote setup)
 * @returns Object containing fork information
 * @throws StorageError if the operation fails
 */
export function forkRepository(
  sourceRepoPath: string,
  targetPath: string,
  parentUrl?: string
): { diskPath: string; branches: string[]; defaultBranch: string } {
  // Validate source exists
  if (!exists(sourceRepoPath)) {
    throw new StorageError(
      `Source repository not found: ${sourceRepoPath}`,
      'SOURCE_NOT_FOUND'
    );
  }

  // Check if target already exists
  if (exists(targetPath)) {
    throw new StorageError(
      `Target path already exists: ${targetPath}`,
      'TARGET_EXISTS'
    );
  }

  // Create parent directory
  const parentDir = path.dirname(targetPath);
  mkdirp(parentDir);

  try {
    // Clone the repository as bare
    // --bare: Create a bare repository
    // --no-hardlinks: Don't use hardlinks (safer for separate storage)
    exec(`git clone --bare --no-hardlinks "${sourceRepoPath}" "${targetPath}"`);

    // Remove the origin remote that points to the local source
    exec('git remote remove origin', targetPath);

    // Set up upstream remote pointing to parent repository
    // This allows fetching upstream changes
    const remoteUrl = parentUrl || sourceRepoPath;
    exec(`git remote add upstream "${remoteUrl}"`, targetPath);

    // Configure fetch specs for upstream
    exec('git config remote.upstream.fetch "+refs/heads/*:refs/remotes/upstream/*"', targetPath);

    // Get list of branches
    const branchOutput = exec('git branch', targetPath);
    const branches = branchOutput
      .split('\n')
      .map(b => b.replace(/^\*?\s+/, '').trim())
      .filter(b => b.length > 0);

    // Get default branch (HEAD reference)
    let defaultBranch = 'main';
    try {
      const headRef = exec('git symbolic-ref HEAD', targetPath).trim();
      defaultBranch = headRef.replace('refs/heads/', '');
    } catch {
      // If HEAD is detached or doesn't exist, default to main
      if (branches.includes('main')) {
        defaultBranch = 'main';
      } else if (branches.includes('master')) {
        defaultBranch = 'master';
      } else if (branches.length > 0) {
        defaultBranch = branches[0];
      }
    }

    // Configure repository settings
    exec('git config receive.denyNonFastForwards true', targetPath);
    exec('git config core.sharedRepository group', targetPath);

    // Update server info for dumb HTTP protocol compatibility
    exec('git update-server-info', targetPath);

    return {
      diskPath: targetPath,
      branches,
      defaultBranch,
    };
  } catch (error) {
    // Clean up on failure
    if (exists(targetPath)) {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Failed to fork repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'FORK_FAILED'
    );
  }
}

/**
 * Delete a repository from disk
 */
export function deleteRepository(diskPath: string): void {
  if (!exists(diskPath)) {
    return; // Already deleted
  }

  try {
    fs.rmSync(diskPath, { recursive: true, force: true });
  } catch (error) {
    throw new StorageError(
      `Failed to delete repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DELETE_FAILED'
    );
  }
}

/**
 * Get repository information
 */
export function getRepositoryInfo(diskPath: string): {
  branches: string[];
  tags: string[];
  defaultBranch: string;
  isEmpty: boolean;
} {
  if (!exists(diskPath)) {
    throw new StorageError(
      `Repository not found: ${diskPath}`,
      'NOT_FOUND'
    );
  }

  // Get branches
  let branches: string[] = [];
  try {
    const branchOutput = exec('git branch', diskPath);
    branches = branchOutput
      .split('\n')
      .map(b => b.replace(/^\*?\s+/, '').trim())
      .filter(b => b.length > 0);
  } catch {
    // Empty repo has no branches
  }

  // Get tags
  let tags: string[] = [];
  try {
    const tagOutput = exec('git tag', diskPath);
    tags = tagOutput.split('\n').filter(t => t.length > 0);
  } catch {
    // No tags
  }

  // Get default branch
  let defaultBranch = 'main';
  try {
    const headRef = exec('git symbolic-ref HEAD', diskPath).trim();
    defaultBranch = headRef.replace('refs/heads/', '');
  } catch {
    // Use main as default
  }

  return {
    branches,
    tags,
    defaultBranch,
    isEmpty: branches.length === 0,
  };
}

/**
 * Check if repository has any commits
 */
export function hasCommits(diskPath: string): boolean {
  try {
    exec('git rev-parse HEAD', diskPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the URL for a repository (for remote references)
 */
export function getRepoUrl(diskPath: string, serverBaseUrl: string): string {
  // Convert disk path to URL path
  const parts = diskPath.split(path.sep);
  const repoWithExt = parts[parts.length - 1]; // myrepo.git
  const owner = parts[parts.length - 2]; // owner username
  
  return `${serverBaseUrl}/${owner}/${repoWithExt}`;
}
