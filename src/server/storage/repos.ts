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
