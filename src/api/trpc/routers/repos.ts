import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  repoModel,
  starModel,
  watchModel,
  collaboratorModel,
  userModel,
  labelModel,
  activityHelpers,
} from '../../../db/models';
import { BareRepository, forkRepository, getRepoDiskPath } from '../../../server/storage/repos';
import { exists } from '../../../utils/fs';

/**
 * Helper to get a BareRepository from disk path
 */
function getRepoFromDisk(diskPath: string): BareRepository | null {
  // diskPath is like /repos/owner/name.git
  // We need to resolve it relative to REPOS_DIR or use absolute path
  const reposDir = process.env.REPOS_DIR || './repos';
  const absolutePath = path.isAbsolute(diskPath) ? diskPath : path.join(process.cwd(), reposDir, diskPath.replace(/^\/repos\//, ''));
  
  if (!exists(absolutePath) || !exists(path.join(absolutePath, 'objects'))) {
    return null;
  }
  
  return new BareRepository(absolutePath);
}

export const reposRouter = router({
  /**
   * List repositories by owner (username)
   */
  list: publicProcedure
    .input(
      z.object({
        owner: z.string().min(1),
        ownerType: z.enum(['user', 'organization']).default('user'),
      })
    )
    .query(async ({ input, ctx }) => {
      // First, find the owner
      const owner = await userModel.findByUsername(input.owner);

      if (!owner) {
        return [];
      }

      // If viewing own repos, show all; otherwise only public
      if (ctx.user?.id === owner.id) {
        return repoModel.listByOwner(owner.id, input.ownerType);
      }

      return repoModel.listPublicByOwner(owner.id, input.ownerType);
    }),

  /**
   * Get a single repository by owner/name path
   */
  get: publicProcedure
    .input(
      z.object({
        owner: z.string().min(1),
        repo: z.string().min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access for private repos
      if (result.repo.isPrivate) {
        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const isOwner = result.repo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this repository',
          });
        }
      }

      return result;
    }),

  /**
   * Get a repository by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.id);

      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access for private repos
      if (repo.isPrivate) {
        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const isOwner = repo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(repo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this repository',
          });
        }
      }

      return repo;
    }),

  /**
   * Create a new repository
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z
          .string()
          .min(1, 'Repository name is required')
          .max(100, 'Repository name must be at most 100 characters')
          .regex(
            /^[a-zA-Z0-9._-]+$/,
            'Repository name can only contain alphanumeric characters, dots, hyphens, and underscores'
          ),
        description: z.string().max(500).optional(),
        isPrivate: z.boolean().default(false),
        defaultBranch: z.string().default('main'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if repo already exists
      const existing = await repoModel.findByOwnerAndName(ctx.user.id, input.name);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Repository already exists',
        });
      }

      const diskPath = `/repos/${ctx.user.username}/${input.name}.git`;

      const repo = await repoModel.create({
        name: input.name,
        description: input.description,
        isPrivate: input.isPrivate,
        ownerId: ctx.user.id,
        ownerType: 'user',
        diskPath,
        defaultBranch: input.defaultBranch,
      });

      // Create default labels
      await labelModel.createDefaults(repo.id);

      // Log activity
      await activityHelpers.logRepoCreated(ctx.user.id, repo.id);

      return repo;
    }),

  /**
   * Update a repository
   */
  update: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/).optional(),
        description: z.string().max(500).optional(),
        isPrivate: z.boolean().optional(),
        defaultBranch: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);

      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Only owner or admin can update
      const isOwner = repo.ownerId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'admin');

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this repository',
        });
      }

      const updates: Record<string, string | boolean | undefined> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.isPrivate !== undefined) updates.isPrivate = input.isPrivate;
      if (input.defaultBranch !== undefined) updates.defaultBranch = input.defaultBranch;

      return repoModel.update(input.repoId, updates);
    }),

  /**
   * Delete a repository
   */
  delete: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);

      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Only owner can delete
      if (repo.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the repository owner can delete it',
        });
      }

      return repoModel.delete(input.repoId);
    }),

  /**
   * Fork a repository
   * 
   * Creates a new repository owned by the current user that is a fork
   * of the specified source repository. Copies all branches, commits,
   * and tags from the parent.
   */
  fork: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get source repository
      const sourceRepo = await repoModel.findById(input.repoId);
      if (!sourceRepo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check read permission on source
      if (sourceRepo.isPrivate) {
        const isOwner = sourceRepo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(sourceRepo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to fork this repository',
          });
        }
      }

      // Determine fork name
      const forkName = input.name || sourceRepo.name;

      // Ensure user has a username (required for forking)
      if (!ctx.user.username) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You must have a username to fork repositories',
        });
      }

      // Check if user already has a repo with this name
      const existingRepo = await repoModel.findByOwnerAndName(ctx.user.id, forkName);
      if (existingRepo) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `You already have a repository named '${forkName}'`,
        });
      }

      // Get target disk path for the fork
      const targetDiskPath = getRepoDiskPath(ctx.user.username, forkName);

      // Create fork on disk
      let storageResult;
      try {
        const reposDir = process.env.REPOS_DIR || './repos';
        const sourceAbsolutePath = path.isAbsolute(sourceRepo.diskPath) 
          ? sourceRepo.diskPath 
          : path.join(process.cwd(), reposDir, sourceRepo.diskPath.replace(/^\/repos\//, ''));

        storageResult = forkRepository(sourceAbsolutePath, targetDiskPath);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fork repository on disk: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }

      // Create fork in database
      const fork = await repoModel.create({
        name: forkName,
        description: sourceRepo.description,
        isPrivate: sourceRepo.isPrivate,
        ownerId: ctx.user.id,
        ownerType: 'user',
        diskPath: targetDiskPath,
        defaultBranch: storageResult.defaultBranch,
        isFork: true,
        forkedFromId: sourceRepo.id,
      });

      // Increment forksCount on parent
      await repoModel.incrementForksCount(sourceRepo.id);

      // Create default labels
      await labelModel.createDefaults(fork.id);

      // Log activity for fork creation
      await activityHelpers.logRepoForked(ctx.user.id, fork.id, sourceRepo.id, sourceRepo.name);

      // Get source owner for response
      const sourceOwner = await userModel.findById(sourceRepo.ownerId);

      return {
        ...fork,
        forkedFrom: {
          id: sourceRepo.id,
          name: sourceRepo.name,
          ownerId: sourceRepo.ownerId,
          owner: sourceOwner ? {
            id: sourceOwner.id,
            username: sourceOwner.username,
          } : null,
        },
        branches: storageResult.branches,
      };
    }),

  /**
   * Check if a fork can be created
   * Useful for UI to show if fork button should be enabled
   */
  canFork: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Check source repo exists
      const sourceRepo = await repoModel.findById(input.repoId);
      if (!sourceRepo) {
        return { canFork: false, reason: 'Repository not found' };
      }

      // Check read permission
      if (sourceRepo.isPrivate) {
        const isOwner = sourceRepo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(sourceRepo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          return { canFork: false, reason: 'You do not have permission to view this repository' };
        }
      }

      // Check for name conflict
      const forkName = input.name || sourceRepo.name;
      const existingRepo = await repoModel.findByOwnerAndName(ctx.user.id, forkName);
      if (existingRepo) {
        return { 
          canFork: false, 
          reason: `You already have a repository named '${forkName}'`,
          suggestedName: `${forkName}-fork`,
        };
      }

      return { canFork: true };
    }),

  /**
   * Star a repository
   */
  star: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);

      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      await starModel.add(input.repoId, ctx.user.id);

      // Log activity
      await activityHelpers.logRepoStarred(ctx.user.id, input.repoId, repo.name);

      return { success: true };
    }),

  /**
   * Unstar a repository
   */
  unstar: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await starModel.remove(input.repoId, ctx.user.id);
      return { success: true };
    }),

  /**
   * Check if current user has starred a repository
   */
  isStarred: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      const starred = await starModel.exists(input.repoId, ctx.user.id);
      return { starred };
    }),

  /**
   * Watch a repository
   */
  watch: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await watchModel.add(input.repoId, ctx.user.id);
      return { success: true };
    }),

  /**
   * Unwatch a repository
   */
  unwatch: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await watchModel.remove(input.repoId, ctx.user.id);
      return { success: true };
    }),

  /**
   * Check if current user is watching a repository
   */
  isWatching: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      const watching = await watchModel.exists(input.repoId, ctx.user.id);
      return { watching };
    }),

  /**
   * Search repositories
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      return repoModel.search(input.query, input.limit);
    }),

  /**
   * List stargazers (users who starred the repo)
   */
  stargazers: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return starModel.listByRepo(input.repoId);
    }),

  /**
   * List watchers
   */
  watchers: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return watchModel.listByRepo(input.repoId);
    }),

  /**
   * List forks of a repository
   */
  forks: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return repoModel.listForks(input.repoId);
    }),

  /**
   * Add a collaborator to a repository
   */
  addCollaborator: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        username: z.string().min(1),
        permission: z.enum(['read', 'write', 'admin']).default('read'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);

      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Only owner or admin can add collaborators
      const isOwner = repo.ownerId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'admin');

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to add collaborators',
        });
      }

      const user = await userModel.findByUsername(input.username);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return collaboratorModel.add({
        repoId: input.repoId,
        userId: user.id,
        permission: input.permission,
      });
    }),

  /**
   * Remove a collaborator from a repository
   */
  removeCollaborator: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);

      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Only owner or admin can remove collaborators
      const isOwner = repo.ownerId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'admin');

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to remove collaborators',
        });
      }

      return collaboratorModel.remove(input.repoId, input.userId);
    }),

  /**
   * List collaborators
   */
  collaborators: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return collaboratorModel.listByRepo(input.repoId);
    }),

  /**
   * Get directory tree for a repository
   */
  getTree: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        ref: z.string().default('HEAD'),
        path: z.string().default(''),
      })
    )
    .query(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access for private repos
      if (result.repo.isPrivate) {
        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const isOwner = result.repo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this repository',
          });
        }
      }

      // Get the bare repository
      const bareRepo = getRepoFromDisk(result.repo.diskPath);
      if (!bareRepo) {
        // Return empty tree if repo doesn't exist on disk yet
        return { entries: [] };
      }

      try {
        // Resolve the ref to a commit
        const commitHash = bareRepo.refs.resolve(input.ref);
        if (!commitHash) {
          return { entries: [] };
        }

        // Read the commit to get the tree
        const commit = bareRepo.objects.readCommit(commitHash);
        
        // Navigate to the path if specified
        let treeHash = commit.treeHash;
        if (input.path) {
          const pathParts = input.path.split('/').filter(Boolean);
          for (const part of pathParts) {
            const tree = bareRepo.objects.readTree(treeHash);
            const entry = tree.entries.find(e => e.name === part);
            if (!entry || entry.mode !== '40000') {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Path not found: ${input.path}`,
              });
            }
            treeHash = entry.hash;
          }
        }

        // Read the tree
        const tree = bareRepo.objects.readTree(treeHash);

        // Convert to response format
        const entries = tree.entries.map(entry => ({
          name: entry.name,
          path: input.path ? `${input.path}/${entry.name}` : entry.name,
          type: entry.mode === '40000' ? 'directory' as const : 'file' as const,
          sha: entry.hash,
          // Size is only available by reading the blob
          size: entry.mode !== '40000' ? (() => {
            try {
              const blob = bareRepo.objects.readBlob(entry.hash);
              return blob.content.length;
            } catch {
              return undefined;
            }
          })() : undefined,
        }));

        // Sort: directories first, then alphabetically
        entries.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        return { entries };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[repos.getTree] Error:', error);
        return { entries: [] };
      }
    }),

  /**
   * Get file content from a repository
   */
  getFile: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        ref: z.string().default('HEAD'),
        path: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access for private repos
      if (result.repo.isPrivate) {
        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const isOwner = result.repo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this repository',
          });
        }
      }

      // Get the bare repository
      const bareRepo = getRepoFromDisk(result.repo.diskPath);
      if (!bareRepo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found on disk',
        });
      }

      try {
        // Resolve the ref to a commit
        const commitHash = bareRepo.refs.resolve(input.ref);
        if (!commitHash) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ref not found',
          });
        }

        // Read the commit to get the tree
        const commit = bareRepo.objects.readCommit(commitHash);
        
        // Navigate to the file
        const pathParts = input.path.split('/').filter(Boolean);
        let currentHash = commit.treeHash;
        
        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          const tree = bareRepo.objects.readTree(currentHash);
          const entry = tree.entries.find(e => e.name === part);
          
          if (!entry) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `File not found: ${input.path}`,
            });
          }

          if (i === pathParts.length - 1) {
            // This is the file
            if (entry.mode === '40000') {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Path is a directory, not a file',
              });
            }
            currentHash = entry.hash;
          } else {
            // This should be a directory
            if (entry.mode !== '40000') {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Path not found: ${input.path}`,
              });
            }
            currentHash = entry.hash;
          }
        }

        // Read the blob
        const blob = bareRepo.objects.readBlob(currentHash);
        
        // Try to decode as UTF-8, fall back to base64
        let content: string;
        let encoding: 'utf-8' | 'base64';
        
        try {
          content = blob.content.toString('utf-8');
          // Check if it's valid UTF-8 by checking for replacement character
          if (content.includes('\uFFFD')) {
            throw new Error('Invalid UTF-8');
          }
          encoding = 'utf-8';
        } catch {
          content = blob.content.toString('base64');
          encoding = 'base64';
        }

        return {
          content,
          sha: currentHash,
          size: blob.content.length,
          encoding,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[repos.getFile] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to read file',
        });
      }
    }),

  /**
   * Get branches for a repository
   */
  getBranches: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access for private repos
      if (result.repo.isPrivate) {
        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const isOwner = result.repo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this repository',
          });
        }
      }

      // Get the bare repository
      const bareRepo = getRepoFromDisk(result.repo.diskPath);
      if (!bareRepo) {
        return [];
      }

      try {
        const branches = bareRepo.refs.listBranches();
        const defaultBranch = result.repo.defaultBranch;

        return branches.map(name => ({
          name,
          sha: bareRepo.refs.resolve(`refs/heads/${name}`) || '',
          isDefault: name === defaultBranch,
        }));
      } catch (error) {
        console.error('[repos.getBranches] Error:', error);
        return [];
      }
    }),

  /**
   * Get commit history for a repository
   */
  getCommits: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        ref: z.string().default('HEAD'),
        limit: z.number().min(1).max(100).default(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access for private repos
      if (result.repo.isPrivate) {
        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const isOwner = result.repo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this repository',
          });
        }
      }

      // Get the bare repository
      const bareRepo = getRepoFromDisk(result.repo.diskPath);
      if (!bareRepo) {
        return [];
      }

      try {
        // Resolve the ref to a commit
        let commitHash = bareRepo.refs.resolve(input.ref);
        if (!commitHash) {
          return [];
        }

        const commits: Array<{
          sha: string;
          message: string;
          author: string;
          authorEmail: string;
          date: Date;
        }> = [];

        // Walk the commit history
        while (commitHash && commits.length < input.limit) {
          try {
            const commit = bareRepo.objects.readCommit(commitHash);
            commits.push({
              sha: commitHash,
              message: commit.message,
              author: commit.author.name,
              authorEmail: commit.author.email,
              date: new Date(commit.author.timestamp * 1000),
            });

            // Move to the first parent
            commitHash = commit.parentHashes[0] || null;
          } catch {
            break;
          }
        }

        return commits;
      } catch (error) {
        console.error('[repos.getCommits] Error:', error);
        return [];
      }
    }),
});
