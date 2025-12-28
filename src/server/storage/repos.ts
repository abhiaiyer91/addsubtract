import * as path from 'path';
import * as fs from 'fs';
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
  private repoCache: Map<string, BareRepository> = new Map();

  constructor(private baseDir: string) {
    // Ensure base directory exists
    mkdirp(this.baseDir);
  }

  /**
   * Get the full path for a repository
   */
  private getRepoPath(owner: string, name: string): string {
    // Normalize name - strip .wit/.git suffix and add .git for internal storage
    let repoName = name;
    if (repoName.endsWith('.wit')) {
      repoName = repoName.slice(0, -4) + '.git';
    } else if (!repoName.endsWith('.git')) {
      repoName = `${repoName}.git`;
    }
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
  initBareRepo(owner: string, name: string): BareRepository {
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

  /**
   * Get file content at a specific ref
   */
  getFileAtRef(ref: string, filePath: string): Buffer | null {
    const hash = this.refs.resolve(ref);
    if (!hash) return null;

    const commit = this.objects.readCommit(hash);
    const blobHash = this.findBlobInTreeByPath(commit.treeHash, filePath.split('/'));

    if (!blobHash) return null;

    const blob = this.objects.readBlob(blobHash);
    return blob.content;
  }

  /**
   * Find a blob in a tree by path
   */
  private findBlobInTreeByPath(treeHash: string, pathParts: string[]): string | null {
    const tree = this.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      if (entry.name === pathParts[0]) {
        if (pathParts.length === 1) {
          return entry.mode === '40000' ? null : entry.hash;
        }
        if (entry.mode === '40000') {
          return this.findBlobInTreeByPath(entry.hash, pathParts.slice(1));
        }
      }
    }

    return null;
  }

  /**
   * Create a worktree for this bare repository
   * Returns the path to the created worktree
   */
  createWorktree(worktreePath: string, branchOrCommit: string): string {
    const fullPath = path.resolve(worktreePath);
    
    // Create worktree directory
    mkdirp(fullPath);
    
    // Resolve the commit hash
    let commitHash = this.refs.resolve(`refs/heads/${branchOrCommit}`);
    if (!commitHash) {
      commitHash = this.refs.resolve(branchOrCommit);
    }
    if (!commitHash) {
      throw new StorageError(`Cannot resolve ref: ${branchOrCommit}`, 'REF_NOT_FOUND');
    }
    
    // Create worktree entry in bare repo
    const worktreeName = path.basename(fullPath).replace(/[^a-zA-Z0-9_-]/g, '_');
    const worktreeEntryDir = path.join(this.gitDir, 'worktrees', worktreeName);
    mkdirp(worktreeEntryDir);
    
    // Create .wit file in worktree pointing to entry
    const worktreeGitFile = path.join(fullPath, '.wit');
    fs.writeFileSync(worktreeGitFile, `gitdir: ${worktreeEntryDir}\n`);
    
    // Create gitdir file pointing back
    fs.writeFileSync(path.join(worktreeEntryDir, 'gitdir'), worktreeGitFile + '\n');
    
    // Create HEAD - check if it's a branch
    const branchHash = this.refs.resolve(`refs/heads/${branchOrCommit}`);
    if (branchHash) {
      fs.writeFileSync(path.join(worktreeEntryDir, 'HEAD'), `ref: refs/heads/${branchOrCommit}\n`);
    } else {
      fs.writeFileSync(path.join(worktreeEntryDir, 'HEAD'), commitHash + '\n');
    }
    
    // Create commondir file
    fs.writeFileSync(path.join(worktreeEntryDir, 'commondir'), '../../\n');
    
    // Checkout files from the commit
    this.checkoutToWorktree(fullPath, commitHash);
    
    return fullPath;
  }

  /**
   * Checkout files from a commit to a worktree directory
   */
  private checkoutToWorktree(worktreePath: string, commitHash: string): void {
    const commit = this.objects.readCommit(commitHash);
    this.checkoutTreeToWorktree(worktreePath, commit.treeHash, '');
  }

  /**
   * Recursively checkout tree entries to worktree
   */
  private checkoutTreeToWorktree(basePath: string, treeHash: string, prefix: string): void {
    const tree = this.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(basePath, relativePath);

      if (entry.mode === '40000') {
        mkdirp(fullPath);
        this.checkoutTreeToWorktree(basePath, entry.hash, relativePath);
      } else {
        const blob = this.objects.readBlob(entry.hash);
        mkdirp(path.dirname(fullPath));
        fs.writeFileSync(fullPath, blob.content);
        
        // Set executable bit if needed
        if (entry.mode === '100755') {
          fs.chmodSync(fullPath, 0o755);
        }
      }
    }
  }

  /**
   * Remove a worktree
   */
  removeWorktree(worktreePath: string): void {
    const fullPath = path.resolve(worktreePath);
    const worktreeName = path.basename(fullPath).replace(/[^a-zA-Z0-9_-]/g, '_');
    const worktreeEntryDir = path.join(this.gitDir, 'worktrees', worktreeName);
    
    // Remove the worktree entry
    if (exists(worktreeEntryDir)) {
      fs.rmSync(worktreeEntryDir, { recursive: true, force: true });
    }
    
    // Remove the worktree directory
    if (exists(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }

  /**
   * Prune stale worktree entries
   */
  pruneWorktrees(): void {
    const worktreesDir = path.join(this.gitDir, 'worktrees');
    if (!exists(worktreesDir)) return;
    
    const entries = fs.readdirSync(worktreesDir);
    for (const name of entries) {
      const entryDir = path.join(worktreesDir, name);
      const stat = fs.statSync(entryDir);
      if (!stat.isDirectory()) continue;
      
      const gitdirPath = path.join(entryDir, 'gitdir');
      if (!exists(gitdirPath)) {
        fs.rmSync(entryDir, { recursive: true, force: true });
        continue;
      }
      
      const gitdirContent = fs.readFileSync(gitdirPath, 'utf-8').trim();
      if (!exists(gitdirContent)) {
        fs.rmSync(entryDir, { recursive: true, force: true });
      }
    }
  }
}

/**
 * Fork a repository on disk using wit's TS API
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
    // Create the target bare repository structure
    mkdirp(targetPath);
    mkdirp(path.join(targetPath, 'objects'));
    mkdirp(path.join(targetPath, 'refs', 'heads'));
    mkdirp(path.join(targetPath, 'refs', 'tags'));
    mkdirp(path.join(targetPath, 'refs', 'remotes', 'upstream'));
    mkdirp(path.join(targetPath, 'info'));

    // Copy all objects from source to target
    const srcObjectsDir = path.join(sourceRepoPath, 'objects');
    const destObjectsDir = path.join(targetPath, 'objects');
    copyObjectsRecursive(srcObjectsDir, destObjectsDir);

    // Open source repo to read refs
    const sourceRepo = new BareRepository(sourceRepoPath);
    const targetRefs = new Refs(targetPath);

    // Copy all branch refs
    const branches = sourceRepo.refs.listBranches();
    for (const branch of branches) {
      const hash = sourceRepo.refs.resolve(`refs/heads/${branch}`);
      if (hash) {
        const branchPath = path.join(targetPath, 'refs', 'heads', branch);
        mkdirp(path.dirname(branchPath));
        fs.writeFileSync(branchPath, hash + '\n');
      }
    }

    // Copy all tag refs
    const tags = sourceRepo.refs.listTags();
    for (const tag of tags) {
      const hash = sourceRepo.refs.resolve(`refs/tags/${tag}`);
      if (hash) {
        const tagPath = path.join(targetPath, 'refs', 'tags', tag);
        mkdirp(path.dirname(tagPath));
        fs.writeFileSync(tagPath, hash + '\n');
      }
    }

    // Copy HEAD
    const headPath = path.join(sourceRepoPath, 'HEAD');
    if (exists(headPath)) {
      fs.copyFileSync(headPath, path.join(targetPath, 'HEAD'));
    } else {
      fs.writeFileSync(path.join(targetPath, 'HEAD'), 'ref: refs/heads/main\n');
    }

    // Get default branch from HEAD
    let defaultBranch = 'main';
    const head = sourceRepo.refs.getHead();
    if (head.isSymbolic) {
      defaultBranch = head.target.replace('refs/heads/', '');
    } else if (branches.includes('main')) {
      defaultBranch = 'main';
    } else if (branches.includes('master')) {
      defaultBranch = 'master';
    } else if (branches.length > 0) {
      defaultBranch = branches[0];
    }

    // Write config for bare repository with upstream remote
    const remoteUrl = parentUrl || sourceRepoPath;
    const config = `[core]
    repositoryformatversion = 0
    filemode = true
    bare = true
[remote "upstream"]
    url = ${remoteUrl}
    fetch = +refs/heads/*:refs/remotes/upstream/*
[receive]
    denyNonFastForwards = true
[core]
    sharedRepository = group
`;
    fs.writeFileSync(path.join(targetPath, 'config'), config);

    // Write description
    fs.writeFileSync(
      path.join(targetPath, 'description'),
      'Forked repository\n'
    );

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
 * Recursively copy objects from source to destination
 */
function copyObjectsRecursive(src: string, dest: string): void {
  if (!exists(src)) return;

  const entries = fs.readdirSync(src);

  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      mkdirp(destPath);
      copyObjectsRecursive(srcPath, destPath);
    } else {
      if (!exists(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
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
 * Get repository information using wit's TS API
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

  const repo = new BareRepository(diskPath);

  // Get branches
  const branches = repo.refs.listBranches();

  // Get tags
  const tags = repo.refs.listTags();

  // Get default branch from HEAD
  let defaultBranch = 'main';
  try {
    const head = repo.refs.getHead();
    if (head.isSymbolic) {
      defaultBranch = head.target.replace('refs/heads/', '');
    }
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
 * Check if repository has any commits using wit's TS API
 */
export function hasCommits(diskPath: string): boolean {
  try {
    const repo = new BareRepository(diskPath);
    const headHash = repo.refs.resolve('HEAD');
    return headHash !== null;
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

/**
 * Initialize a bare repository at the given path
 * Used when a repo exists in the database but not on disk
 */
export function initBareRepository(repoPath: string): BareRepository {
  // Create repository directory structure (bare repo)
  mkdirp(repoPath);
  mkdirp(path.join(repoPath, 'objects'));
  mkdirp(path.join(repoPath, 'refs', 'heads'));
  mkdirp(path.join(repoPath, 'refs', 'tags'));
  mkdirp(path.join(repoPath, 'info'));

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
    'Wit repository\n'
  );

  console.log(`[server] Initialized bare repository at: ${repoPath}`);

  return new BareRepository(repoPath);
}
