/**
 * Repository Model
 * Database operations for repositories
 */

import { randomUUID } from 'crypto';
import { db, Repository, User, Activity, CreateRepositoryInput } from '../index';

export interface ForkResult {
  fork: Repository;
  parent: Repository;
}

export class RepoNotFoundError extends Error {
  constructor(repoId: string) {
    super(`Repository not found: ${repoId}`);
    this.name = 'RepoNotFoundError';
  }
}

export class DuplicateRepoError extends Error {
  constructor(name: string, username: string) {
    super(`Repository '${username}/${name}' already exists`);
    this.name = 'DuplicateRepoError';
  }
}

export class PermissionDeniedError extends Error {
  constructor(action: string, resource: string) {
    super(`Permission denied: cannot ${action} ${resource}`);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Repository model operations
 */
export const repos = {
  /**
   * Get a repository by ID
   */
  getById(id: string): Repository | undefined {
    return db.getRepository(id);
  },

  /**
   * Get a repository by owner and name
   */
  getByOwnerAndName(ownerId: string, name: string): Repository | undefined {
    return db.getRepositoryByOwnerAndName(ownerId, name);
  },

  /**
   * Get repositories owned by a user
   */
  getByOwner(ownerId: string): Repository[] {
    return db.getRepositoriesByOwner(ownerId);
  },

  /**
   * Get all forks of a repository
   */
  getForks(repoId: string): Repository[] {
    return db.getForksByParent(repoId);
  },

  /**
   * Check if a user can read a repository
   */
  canRead(repo: Repository, userId: string | null): boolean {
    // Public repos are readable by everyone
    if (repo.visibility === 'public') {
      return true;
    }
    // Private/internal repos require ownership (simplified - would check collaborators in production)
    return userId !== null && repo.ownerId === userId;
  },

  /**
   * Create a new repository
   */
  create(input: CreateRepositoryInput, ownerId: string, diskPath: string): Repository {
    // Check for duplicate
    const existing = db.getRepositoryByOwnerAndName(ownerId, input.name);
    if (existing) {
      const owner = db.getUser(ownerId);
      throw new DuplicateRepoError(input.name, owner?.username || 'unknown');
    }

    const now = new Date();
    const repo: Repository = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      ownerId,
      visibility: input.visibility || 'private',
      defaultBranch: input.defaultBranch || 'main',
      diskPath,
      isFork: false,
      forkedFromId: null,
      forksCount: 0,
      starsCount: 0,
      watchersCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    return db.createRepository(repo);
  },

  /**
   * Fork a repository
   * 
   * Creates a new repository owned by the specified user that is a fork
   * of the source repository. Copies all metadata and marks the new repo
   * as a fork with a reference to the parent.
   * 
   * @param repoId - ID of the repository to fork
   * @param userId - ID of the user who will own the fork
   * @param name - Optional name for the fork (defaults to original repo name)
   * @returns ForkResult containing the new fork and updated parent
   * @throws RepoNotFoundError if the source repository doesn't exist
   * @throws DuplicateRepoError if the user already has a repo with that name
   * @throws PermissionDeniedError if the user cannot read the source repo
   */
  fork(repoId: string, userId: string, name?: string): ForkResult {
    // Get the source repository
    const sourceRepo = db.getRepository(repoId);
    if (!sourceRepo) {
      throw new RepoNotFoundError(repoId);
    }

    // Check read permission
    if (!this.canRead(sourceRepo, userId)) {
      throw new PermissionDeniedError('fork', `repository ${repoId}`);
    }

    // Determine fork name (use original name if not specified)
    const forkName = name || sourceRepo.name;

    // Check if user already has a repo with this name
    const existing = db.getRepositoryByOwnerAndName(userId, forkName);
    if (existing) {
      const owner = db.getUser(userId);
      throw new DuplicateRepoError(forkName, owner?.username || 'unknown');
    }

    // Create the fork repository record
    const now = new Date();
    const fork: Repository = {
      id: randomUUID(),
      name: forkName,
      description: sourceRepo.description,
      ownerId: userId,
      visibility: sourceRepo.visibility === 'public' ? 'public' : 'private',
      defaultBranch: sourceRepo.defaultBranch,
      diskPath: '', // Will be set by storage layer
      isFork: true,
      forkedFromId: sourceRepo.id,
      forksCount: 0,
      starsCount: 0,
      watchersCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Save the fork
    const savedFork = db.createRepository(fork);

    // Increment forksCount on parent
    const updatedParent = db.updateRepository(sourceRepo.id, {
      forksCount: sourceRepo.forksCount + 1,
    });

    if (!updatedParent) {
      throw new Error('Failed to update parent repository');
    }

    return {
      fork: savedFork,
      parent: updatedParent,
    };
  },

  /**
   * Update the disk path for a repository
   */
  updateDiskPath(repoId: string, diskPath: string): Repository | undefined {
    return db.updateRepository(repoId, { diskPath });
  },

  /**
   * Update repository metadata
   */
  update(repoId: string, updates: Partial<Pick<Repository, 'name' | 'description' | 'visibility' | 'defaultBranch'>>): Repository | undefined {
    return db.updateRepository(repoId, updates);
  },

  /**
   * Delete a repository
   */
  delete(repoId: string): boolean {
    return db.deleteRepository(repoId);
  },

  /**
   * Record a push to the repository
   */
  recordPush(repoId: string): Repository | undefined {
    return db.updateRepository(repoId, { pushedAt: new Date() });
  },
};

/**
 * Activity logging for repositories
 */
export const activities = {
  /**
   * Log an activity
   */
  log(userId: string, repoId: string, action: Activity['action'], metadata?: Record<string, unknown>): Activity {
    const activity: Activity = {
      id: randomUUID(),
      userId,
      repoId,
      action,
      metadata,
      createdAt: new Date(),
    };
    return db.logActivity(activity);
  },

  /**
   * Get recent activities for a user
   */
  getByUser(userId: string, limit = 50): Activity[] {
    return db.getActivitiesByUser(userId, limit);
  },

  /**
   * Get recent activities for a repository
   */
  getByRepo(repoId: string, limit = 50): Activity[] {
    return db.getActivitiesByRepo(repoId, limit);
  },
};
