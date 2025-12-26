/**
 * Repository Storage
 * Handles on-disk repository operations including fork creation
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { exists, mkdirp } from '../../utils/fs';

/**
 * Storage configuration
 */
export interface StorageConfig {
  basePath: string; // Base path for all repositories
  useGit: boolean;  // Use native git commands (true) or wit (false)
}

const defaultConfig: StorageConfig = {
  basePath: process.env.REPO_STORAGE_PATH || '/var/repos',
  useGit: true, // Use native git for reliability
};

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
  ownerId: string,
  repoName: string,
  config: StorageConfig = defaultConfig
): string {
  // Use first 2 chars of owner ID for sharding
  const shard = ownerId.substring(0, 2);
  return path.join(config.basePath, shard, ownerId, `${repoName}.git`);
}

/**
 * Initialize a new bare repository on disk
 */
export function initBareRepository(
  diskPath: string,
  defaultBranch = 'main'
): void {
  // Create directory
  mkdirp(diskPath);

  // Initialize bare repo
  exec(`git init --bare --initial-branch=${defaultBranch}`, diskPath);

  // Configure the repository
  exec('git config receive.denyNonFastForwards true', diskPath);
  exec('git config core.sharedRepository group', diskPath);
}

/**
 * Fork a repository on disk using git clone --bare
 * 
 * Creates a bare clone of the source repository at the target path,
 * preserving all branches, tags, and commit history. Sets up the
 * origin remote pointing to the parent repository.
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

    // Set up origin remote pointing to parent repository
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
 * Copy a file or directory
 */
export function copyPath(src: string, dest: string): void {
  if (!exists(src)) {
    throw new StorageError(`Source path not found: ${src}`, 'NOT_FOUND');
  }

  const stats = fs.statSync(src);
  
  if (stats.isDirectory()) {
    mkdirp(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      copyPath(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else {
    mkdirp(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
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
  // e.g., /var/repos/ab/abc123/myrepo.git -> https://server.com/abc123/myrepo.git
  const parts = diskPath.split(path.sep);
  const repoWithExt = parts[parts.length - 1]; // myrepo.git
  const ownerId = parts[parts.length - 2]; // owner ID
  
  return `${serverBaseUrl}/${ownerId}/${repoWithExt}`;
}
