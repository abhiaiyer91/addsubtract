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
  orgModel,
  orgMemberModel,
} from '../../../db/models';
import { BareRepository, forkRepository, getRepoDiskPath } from '../../../server/storage/repos';
import { exists } from '../../../utils/fs';
import { eventBus } from '../../../events';

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
   * Create a new repository for an organization
   */
  createForOrg: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
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
      // Check if user has permission to create repos in this org (admin or owner)
      const hasPermission = await orgMemberModel.hasRole(input.orgId, ctx.user.id, 'admin');
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to create repositories in this organization',
        });
      }

      // Get the organization
      const org = await orgModel.findById(input.orgId);
      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      // Check if repo already exists for this org
      const existing = await repoModel.findByOwnerAndName(input.orgId, input.name);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Repository already exists',
        });
      }

      const diskPath = `/repos/${org.name}/${input.name}.git`;

      const repo = await repoModel.create({
        name: input.name,
        description: input.description,
        isPrivate: input.isPrivate,
        ownerId: input.orgId,
        ownerType: 'organization',
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
      
      // Emit repo.forked event
      const sourceFullName = sourceOwner 
        ? `${sourceOwner.username || sourceOwner.name}/${sourceRepo.name}` 
        : sourceRepo.name;
      await eventBus.emit('repo.forked', ctx.user.id, {
        repoId: fork.id,
        repoFullName: `${ctx.user.username || ctx.user.name}/${forkName}`,
        forkedFromId: sourceRepo.id,
        forkedFromFullName: sourceFullName,
        ownerId: sourceRepo.ownerId,
      });

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

      // Emit repo.starred event
      const owner = await userModel.findById(repo.ownerId);
      const repoFullName = owner ? `${owner.username || owner.name}/${repo.name}` : repo.name;
      await eventBus.emit('repo.starred', ctx.user.id, {
        repoId: repo.id,
        repoFullName,
        ownerId: repo.ownerId,
      });

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
      return starModel.exists(input.repoId, ctx.user.id);
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
      return watchModel.exists(input.repoId, ctx.user.id);
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

  /**
   * Get a single commit with diff
   */
  getCommit: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        sha: z.string(),
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
        const commit = bareRepo.objects.readCommit(input.sha);
        
        // Get the diff between this commit and its parent
        let diff = '';
        const parentHash = commit.parentHashes[0];
        
        if (parentHash) {
          // Diff against parent
          const { execSync } = require('child_process');
          try {
            diff = execSync(`git diff ${parentHash} ${input.sha}`, {
              cwd: result.repo.diskPath,
              encoding: 'utf-8',
              maxBuffer: 10 * 1024 * 1024, // 10MB
            });
          } catch {
            diff = '';
          }
        } else {
          // First commit - show all files as added
          const { execSync } = require('child_process');
          try {
            diff = execSync(`git show ${input.sha} --format=""`, {
              cwd: result.repo.diskPath,
              encoding: 'utf-8',
              maxBuffer: 10 * 1024 * 1024,
            });
          } catch {
            diff = '';
          }
        }

        return {
          sha: input.sha,
          message: commit.message,
          author: {
            name: commit.author.name,
            email: commit.author.email,
            date: new Date(commit.author.timestamp * 1000),
          },
          committer: {
            name: commit.committer.name,
            email: commit.committer.email,
            date: new Date(commit.committer.timestamp * 1000),
          },
          parents: commit.parentHashes,
          tree: commit.treeHash,
          diff,
        };
      } catch (error) {
        console.error('[repos.getCommit] Error:', error);
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Commit not found',
        });
      }
    }),

  /**
   * List collaborators for a repository
   */
  collaborators: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const isOwner = repo.ownerId === ctx.user.id;
      const hasAccess = isOwner || (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'read'));

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Read permission required',
        });
      }

      return collaboratorModel.listByRepo(input.repoId);
    }),

  /**
   * Add a collaborator to a repository
   */
  addCollaborator: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        userId: z.string(),
        permission: z.enum(['read', 'write', 'admin']),
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

      const isOwner = repo.ownerId === ctx.user.id;
      const hasAdmin = isOwner || (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'admin'));

      if (!hasAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin permission required',
        });
      }

      const existing = await collaboratorModel.find(input.repoId, input.userId);
      if (existing) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User is already a collaborator',
        });
      }

      return collaboratorModel.add({
        repoId: input.repoId,
        userId: input.userId,
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
        userId: z.string(),
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

      const isOwner = repo.ownerId === ctx.user.id;
      const hasAdmin = isOwner || (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'admin'));

      if (!hasAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin permission required',
        });
      }

      const removed = await collaboratorModel.remove(input.repoId, input.userId);
      if (!removed) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collaborator not found',
        });
      }

      return { success: true };
    }),

  /**
   * Update/create a file in a repository (creates a commit)
   */
  updateFile: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        ref: z.string().default('main'),
        path: z.string(),
        content: z.string(),
        message: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write access
      const isOwner = result.repo.ownerId === ctx.user.id;
      const hasWriteAccess = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'write'));

      if (!hasWriteAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have write access to this repository',
        });
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
        const { execSync } = require('child_process');
        const fs = require('fs');
        const os = require('os');
        
        // Create a temporary worktree to make the commit
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wit-update-'));
        
        try {
          // Clone the repo to a temp directory
          execSync(`git clone --branch ${input.ref} ${result.repo.diskPath} ${tmpDir}`, {
            encoding: 'utf-8',
          });

          // Write the file
          const filePath = path.join(tmpDir, input.path);
          const fileDir = path.dirname(filePath);
          
          // Create parent directories if needed
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }
          
          fs.writeFileSync(filePath, input.content, 'utf-8');

          // Configure git user
          const user = await userModel.findById(ctx.user.id);
          const authorName = user?.name || user?.username || 'wit user';
          const authorEmail = user?.email || `${ctx.user.id}@wit.local`;
          
          execSync(`git config user.name "${authorName}"`, { cwd: tmpDir });
          execSync(`git config user.email "${authorEmail}"`, { cwd: tmpDir });

          // Stage and commit
          execSync(`git add "${input.path}"`, { cwd: tmpDir });
          execSync(`git commit -m "${input.message.replace(/"/g, '\\"')}"`, { cwd: tmpDir });

          // Push back to the bare repo
          execSync(`git push origin ${input.ref}`, { cwd: tmpDir });

          // Get the new commit SHA
          const newSha = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

          // Record activity
          await activityHelpers.recordActivity({
            type: 'commit',
            userId: ctx.user.id,
            repoId: result.repo.id,
            targetId: newSha,
            targetType: 'commit',
            metadata: {
              message: input.message,
              path: input.path,
            },
          });

          // Emit event
          eventBus.emit('commit.created', {
            repo: result.repo,
            commit: {
              sha: newSha,
              message: input.message,
              author: { name: authorName, email: authorEmail },
            },
            branch: input.ref,
            userId: ctx.user.id,
          });

          return {
            sha: newSha,
            path: input.path,
            branch: input.ref,
          };
        } finally {
          // Cleanup temp directory
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch (error) {
        console.error('[repos.updateFile] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update file',
        });
      }
    }),
});
