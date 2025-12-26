/**
 * Repositories Router
 * tRPC router for repository operations including forking
 */

import { z } from 'zod';
import { 
  repos, 
  activities, 
  RepoNotFoundError, 
  DuplicateRepoError, 
  PermissionDeniedError 
} from '../../../db/models/repos';
import { db, ForkRepositoryInputSchema, RepositorySchema } from '../../../db';
import { 
  forkRepository, 
  getRepoDiskPath, 
  getRepoUrl,
  StorageError 
} from '../../../server/storage/repos';
import { Context, isAuthenticated } from '../context';

/**
 * TRPCError-like class for consistent error handling
 */
export class TRPCError extends Error {
  constructor(
    public readonly code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'INTERNAL_SERVER_ERROR' | 'BAD_REQUEST',
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TRPCError';
  }
}

/**
 * Procedure helpers
 */
function requireAuth(ctx: Context): asserts ctx is Context & { user: NonNullable<Context['user']>; userId: string } {
  if (!isAuthenticated(ctx)) {
    throw new TRPCError('UNAUTHORIZED', 'Authentication required');
  }
}

/**
 * Repository router procedures
 */
export const reposRouter = {
  /**
   * Get a repository by ID
   */
  getById: async (input: { id: string }, ctx: Context) => {
    const repo = repos.getById(input.id);
    if (!repo) {
      throw new TRPCError('NOT_FOUND', `Repository not found: ${input.id}`);
    }

    // Check read permission
    if (!repos.canRead(repo, ctx.userId)) {
      throw new TRPCError('FORBIDDEN', 'You do not have permission to view this repository');
    }

    // Get owner info
    const owner = db.getUser(repo.ownerId);

    // Get forked from info if applicable
    let forkedFrom = null;
    if (repo.forkedFromId) {
      const parentRepo = repos.getById(repo.forkedFromId);
      if (parentRepo) {
        const parentOwner = db.getUser(parentRepo.ownerId);
        forkedFrom = {
          id: parentRepo.id,
          name: parentRepo.name,
          ownerId: parentRepo.ownerId,
          owner: parentOwner ? {
            id: parentOwner.id,
            username: parentOwner.username,
          } : null,
        };
      }
    }

    return {
      ...repo,
      owner,
      forkedFrom,
    };
  },

  /**
   * List repositories for a user
   */
  listByOwner: async (input: { ownerId: string }, ctx: Context) => {
    const repositories = repos.getByOwner(input.ownerId);
    
    // Filter based on visibility
    return repositories.filter(repo => repos.canRead(repo, ctx.userId));
  },

  /**
   * List forks of a repository
   */
  listForks: async (input: { repoId: string }, ctx: Context) => {
    // Check source repo exists and is readable
    const sourceRepo = repos.getById(input.repoId);
    if (!sourceRepo) {
      throw new TRPCError('NOT_FOUND', `Repository not found: ${input.repoId}`);
    }

    if (!repos.canRead(sourceRepo, ctx.userId)) {
      throw new TRPCError('FORBIDDEN', 'You do not have permission to view this repository');
    }

    const forks = repos.getForks(input.repoId);
    
    // Filter and enrich with owner info
    return forks
      .filter(fork => repos.canRead(fork, ctx.userId))
      .map(fork => {
        const owner = db.getUser(fork.ownerId);
        return { ...fork, owner };
      });
  },

  /**
   * Fork a repository
   * 
   * Creates a new repository owned by the current user that is a fork
   * of the specified source repository. Copies all branches, commits,
   * and tags from the parent.
   * 
   * Input:
   *   - repoId: ID of the repository to fork
   *   - name: Optional name for the fork (defaults to original repo name)
   * 
   * Returns:
   *   - The newly created fork with owner and parent info
   * 
   * Errors:
   *   - UNAUTHORIZED: User is not authenticated
   *   - NOT_FOUND: Source repository doesn't exist
   *   - FORBIDDEN: User cannot read the source repository
   *   - CONFLICT: User already has a repository with the same name
   */
  fork: async (input: z.infer<typeof ForkRepositoryInputSchema>, ctx: Context) => {
    // Require authentication
    requireAuth(ctx);

    const { repoId, name } = input;

    // Get source repository
    const sourceRepo = repos.getById(repoId);
    if (!sourceRepo) {
      throw new TRPCError('NOT_FOUND', `Repository not found: ${repoId}`);
    }

    // Check read permission on source
    if (!repos.canRead(sourceRepo, ctx.userId)) {
      throw new TRPCError('FORBIDDEN', 'You do not have permission to fork this repository');
    }

    // Determine fork name
    const forkName = name || sourceRepo.name;

    // Check if user already has a repo with this name
    const existingRepo = repos.getByOwnerAndName(ctx.userId, forkName);
    if (existingRepo) {
      throw new TRPCError(
        'CONFLICT', 
        `You already have a repository named '${forkName}'`
      );
    }

    try {
      // Create fork in database first
      const { fork, parent } = repos.fork(repoId, ctx.userId, name);

      // Get target disk path for the fork
      const targetDiskPath = getRepoDiskPath(ctx.userId, forkName);

      // Create fork on disk
      const serverBaseUrl = process.env.SERVER_BASE_URL || 'https://localhost';
      const parentUrl = getRepoUrl(sourceRepo.diskPath, serverBaseUrl);
      
      const storageResult = forkRepository(
        sourceRepo.diskPath,
        targetDiskPath,
        parentUrl
      );

      // Update fork with disk path
      const updatedFork = repos.updateDiskPath(fork.id, storageResult.diskPath);
      if (!updatedFork) {
        throw new Error('Failed to update fork disk path');
      }

      // Log activity
      const sourceOwner = db.getUser(sourceRepo.ownerId);
      activities.log(ctx.userId, fork.id, 'fork', {
        forkedFrom: {
          id: sourceRepo.id,
          name: sourceRepo.name,
          owner: sourceOwner?.username,
        },
      });

      // Also log on parent (for activity feed)
      activities.log(ctx.userId, sourceRepo.id, 'fork', {
        forkId: fork.id,
        forkName: forkName,
      });

      // Build response with full info
      const forkOwner = db.getUser(ctx.userId);
      
      return {
        ...updatedFork,
        owner: forkOwner,
        forkedFrom: {
          id: parent.id,
          name: parent.name,
          ownerId: parent.ownerId,
          owner: sourceOwner ? {
            id: sourceOwner.id,
            username: sourceOwner.username,
          } : null,
        },
        branches: storageResult.branches,
        defaultBranch: storageResult.defaultBranch,
      };
    } catch (error) {
      // Handle known errors
      if (error instanceof RepoNotFoundError) {
        throw new TRPCError('NOT_FOUND', error.message, error);
      }
      if (error instanceof DuplicateRepoError) {
        throw new TRPCError('CONFLICT', error.message, error);
      }
      if (error instanceof PermissionDeniedError) {
        throw new TRPCError('FORBIDDEN', error.message, error);
      }
      if (error instanceof StorageError) {
        throw new TRPCError('INTERNAL_SERVER_ERROR', `Storage error: ${error.message}`, error);
      }
      if (error instanceof TRPCError) {
        throw error;
      }

      // Unknown error
      throw new TRPCError(
        'INTERNAL_SERVER_ERROR',
        `Failed to fork repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  },

  /**
   * Check if a fork can be created
   * Useful for UI to show if fork button should be enabled
   */
  canFork: async (input: { repoId: string; name?: string }, ctx: Context) => {
    // Must be authenticated
    if (!isAuthenticated(ctx)) {
      return { canFork: false, reason: 'Authentication required' };
    }

    // Check source repo exists
    const sourceRepo = repos.getById(input.repoId);
    if (!sourceRepo) {
      return { canFork: false, reason: 'Repository not found' };
    }

    // Check read permission
    if (!repos.canRead(sourceRepo, ctx.userId)) {
      return { canFork: false, reason: 'You do not have permission to view this repository' };
    }

    // Check for name conflict
    const forkName = input.name || sourceRepo.name;
    const existingRepo = repos.getByOwnerAndName(ctx.userId, forkName);
    if (existingRepo) {
      return { 
        canFork: false, 
        reason: `You already have a repository named '${forkName}'`,
        suggestedName: `${forkName}-fork`,
      };
    }

    return { canFork: true };
  },
};

// Type definitions for the router
export type ReposRouter = typeof reposRouter;
