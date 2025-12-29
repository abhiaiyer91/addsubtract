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
import { BareRepository, forkRepository, getRepoDiskPath, RepoManager, resolveDiskPath, initBareRepository } from '../../../server/storage/repos';
import { exists, mkdirp } from '../../../utils/fs';
import { eventBus } from '../../../events';
import { getGlobalEmailService } from '../../../core/email';
import { getDb } from '../../../db';
import { user } from '../../../db/auth-schema';
import { eq } from 'drizzle-orm';
import { 
  calculateLanguageStats, 
  shouldIgnorePath, 
  type LanguageStats 
} from '../../../core/language-detection';

/**
 * Helper to get a BareRepository from disk path, auto-creating if needed
 */
function getRepoFromDisk(diskPath: string, autoCreate: boolean = false): BareRepository | null {
  // diskPath is stored as /repos/owner/name.git in the database
  // We need to resolve it relative to REPOS_DIR
  const reposDir = process.env.REPOS_DIR || './repos';
  
  // Strip the /repos/ prefix if present, then join with actual REPOS_DIR
  const relativePath = diskPath.replace(/^\/repos\//, '');
  const absolutePath = path.isAbsolute(reposDir) 
    ? path.join(reposDir, relativePath)
    : path.join(process.cwd(), reposDir, relativePath);
  
  console.log('[getRepoFromDisk] diskPath:', diskPath, 'reposDir:', reposDir, 'cwd:', process.cwd(), 'absolutePath:', absolutePath, 'exists:', exists(absolutePath));
  
  if (!exists(absolutePath) || !exists(path.join(absolutePath, 'objects'))) {
    if (autoCreate) {
      // Auto-create the bare repository on disk
      console.log('[getRepoFromDisk] Auto-creating repository at:', absolutePath);
      mkdirp(absolutePath);
      return initBareRepository(absolutePath);
    }
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

      const username = ctx.user.username || ctx.user.id;
      const diskPath = `/repos/${username}/${input.name}.git`;

      // Create the bare repository on disk
      const reposDir = process.env.REPOS_DIR || './repos';
      const repoManager = new RepoManager(reposDir);
      try {
        repoManager.initBareRepo(username, input.name);
      } catch (error) {
        // If the repo already exists on disk, that's fine
        if (error instanceof Error && !error.message.includes('already exists')) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create repository on disk',
          });
        }
      }

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

      // Create the bare repository on disk
      const reposDir = process.env.REPOS_DIR || './repos';
      const repoManager = new RepoManager(reposDir);
      try {
        repoManager.initBareRepo(org.name, input.name);
      } catch (error) {
        // If the repo already exists on disk, that's fine
        if (error instanceof Error && !error.message.includes('already exists')) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create repository on disk',
          });
        }
      }

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
        const sourceAbsolutePath = resolveDiskPath(sourceRepo.diskPath);

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
   * Get language statistics for a repository (GitHub-style)
   */
  getLanguages: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        ref: z.string().default('HEAD'),
      })
    )
    .query(async ({ input, ctx }): Promise<LanguageStats[]> => {
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
        const commitHash = bareRepo.refs.resolve(input.ref);
        if (!commitHash) {
          return [];
        }

        // Read the commit to get the tree
        const commit = bareRepo.objects.readCommit(commitHash);
        
        // Recursively collect all files with their sizes
        const files: Array<{ path: string; size: number }> = [];
        
        const collectFiles = (treeHash: string, prefix: string = ''): void => {
          try {
            const tree = bareRepo.objects.readTree(treeHash);
            
            for (const entry of tree.entries) {
              const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
              
              if (entry.mode === '40000') {
                // Directory - check if should be ignored
                if (!shouldIgnorePath(entry.name)) {
                  collectFiles(entry.hash, fullPath);
                }
              } else {
                // File - get its size
                try {
                  const blob = bareRepo.objects.readBlob(entry.hash);
                  files.push({
                    path: fullPath,
                    size: blob.content.length,
                  });
                } catch {
                  // Skip files we can't read
                }
              }
            }
          } catch {
            // Skip trees we can't read
          }
        };
        
        collectFiles(commit.treeHash);
        
        // Calculate language statistics
        return calculateLanguageStats(files);
      } catch (error) {
        console.error('[repos.getLanguages] Error:', error);
        return [];
      }
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
        // Repository doesn't exist on disk - this can happen if import failed
        console.warn(`[repos.getTree] Repository not found on disk: ${result.repo.diskPath}`);
        return { entries: [], error: 'Repository data not available. The repository may not have been fully imported.' };
      }

      try {
        // Resolve the ref to a commit
        const commitHash = bareRepo.refs.resolve(input.ref);
        if (!commitHash) {
          // Ref not found - try to get available branches to suggest alternatives
          const branches = bareRepo.refs.listBranches();
          console.warn(`[repos.getTree] Ref not found: ${input.ref}, available branches: ${branches.join(', ')}`);
          return { 
            entries: [], 
            error: `Branch '${input.ref}' not found.${branches.length > 0 ? ` Available branches: ${branches.join(', ')}` : ' The repository may be empty or have no branches.'}` 
          };
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
        return { entries: [], error: 'Failed to read repository tree. Please try again.' };
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
   * Create a new branch in a repository
   */
  createBranch: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._\/-]+$/, 'Invalid branch name'),
        fromRef: z.string().default('HEAD'),
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
        // Check if branch already exists
        const existingBranches = bareRepo.refs.listBranches();
        if (existingBranches.includes(input.name)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Branch '${input.name}' already exists`,
          });
        }

        // Resolve the source ref to get the commit hash
        const commitHash = bareRepo.refs.resolve(input.fromRef);
        if (!commitHash) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot create branch: ref '${input.fromRef}' not found`,
          });
        }

        // Create the branch
        bareRepo.refs.createBranch(input.name, commitHash);

        return {
          name: input.name,
          sha: commitHash,
          fromRef: input.fromRef,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[repos.createBranch] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create branch',
        });
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
        const { formatUnifiedDiff, diff: computeDiff, createHunks } = await import('../../../core/diff');
        
        // Get the diff between this commit and its parent
        let diffText = '';
        const parentHash = commit.parentHashes[0];
        
        try {
          if (parentHash) {
            // Get parent tree
            const parentCommit = bareRepo.objects.readCommit(parentHash);
            const parentTree = bareRepo.objects.readTree(parentCommit.treeHash);
            const currentTree = bareRepo.objects.readTree(commit.treeHash);
            
            // Build file maps for comparison
            const getFilesFromTree = (tree: any, prefix = ''): Map<string, string> => {
              const files = new Map<string, string>();
              for (const entry of tree.entries) {
                const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (entry.mode === '40000') {
                  // Directory - recurse
                  const subTree = bareRepo.objects.readTree(entry.hash);
                  const subFiles = getFilesFromTree(subTree, fullPath);
                  subFiles.forEach((hash, path) => files.set(path, hash));
                } else {
                  files.set(fullPath, entry.hash);
                }
              }
              return files;
            };
            
            const parentFiles = getFilesFromTree(parentTree);
            const currentFiles = getFilesFromTree(currentTree);
            
            // Generate diff for changed files
            const diffParts: string[] = [];
            const allPaths = new Set([...parentFiles.keys(), ...currentFiles.keys()]);
            
            for (const filePath of allPaths) {
              const oldHash = parentFiles.get(filePath);
              const newHash = currentFiles.get(filePath);
              
              if (oldHash === newHash) continue;
              
              const oldContent = oldHash ? bareRepo.objects.readBlob(oldHash).toString() : '';
              const newContent = newHash ? bareRepo.objects.readBlob(newHash).toString() : '';
              
              const diffLines = computeDiff(oldContent, newContent);
              const hunks = createHunks(diffLines);
              if (hunks.length > 0) {
                const fileDiff = {
                  oldPath: filePath,
                  newPath: filePath,
                  hunks,
                  isBinary: false,
                  isNew: !oldHash,
                  isDeleted: !newHash,
                  isRename: false,
                };
                diffParts.push(formatUnifiedDiff(fileDiff));
              }
            }
            
            diffText = diffParts.join('\n');
          } else {
            // First commit - show all files as added
            const currentTree = bareRepo.objects.readTree(commit.treeHash);
            const diffParts: string[] = [];
            
            const showTreeFiles = (tree: any, prefix = ''): void => {
              for (const entry of tree.entries) {
                const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (entry.mode === '40000') {
                  const subTree = bareRepo.objects.readTree(entry.hash);
                  showTreeFiles(subTree, fullPath);
                } else {
                  const content = bareRepo.objects.readBlob(entry.hash).toString();
                  const diffLines = computeDiff('', content);
                  const hunks = createHunks(diffLines);
                  if (hunks.length > 0) {
                    const fileDiff = {
                      oldPath: fullPath,
                      newPath: fullPath,
                      hunks,
                      isBinary: false,
                      isNew: true,
                      isDeleted: false,
                      isRename: false,
                    };
                    diffParts.push(formatUnifiedDiff(fileDiff));
                  }
                }
              }
            };
            
            showTreeFiles(currentTree);
            diffText = diffParts.join('\n');
          }
          
          console.log('[repos.getCommit] Generated diff for', input.sha, 'text length:', diffText.length, 'has parent:', !!parentHash);
        } catch (diffError) {
          // If diff computation fails, log the error and return empty diff
          console.error('[repos.getCommit] Diff computation error:', diffError);
          diffText = '';
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
          diff: diffText,
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

      const collab = await collaboratorModel.add({
        repoId: input.repoId,
        userId: input.userId,
        permission: input.permission,
      });

      // Send email notification to the new collaborator
      const emailService = getGlobalEmailService();
      if (emailService.isConfigured()) {
        try {
          const db = getDb();
          const [collaboratorUser] = await db.select().from(user).where(eq(user.id, input.userId)).limit(1);
          const [inviterUser] = await db.select().from(user).where(eq(user.id, ctx.user.id)).limit(1);
          
          if (collaboratorUser && repo) {
            const roleText = input.permission === 'admin' ? 'Administrator' : 
                           input.permission === 'write' ? 'Contributor' : 'Viewer';
            
            await emailService.sendNotificationEmail({
              email: collaboratorUser.email,
              name: collaboratorUser.name || undefined,
              notifications: [{
                type: 'collaborator_added',
                title: `You've been added as a collaborator`,
                body: `You now have ${roleText} access to ${repo.name}`,
                url: `/${repo.ownerId}/${repo.name}`,
                actorName: inviterUser?.name || inviterUser?.username || undefined,
              }],
            });
          }
        } catch (error) {
          console.error('[Repos] Failed to send collaborator invitation email:', error);
        }
      }

      return collab;
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

      // Get user info before removal for notification
      const db = getDb();
      const [collaboratorUser] = await db.select().from(user).where(eq(user.id, input.userId)).limit(1);
      const [removedByUser] = await db.select().from(user).where(eq(user.id, ctx.user.id)).limit(1);

      const removed = await collaboratorModel.remove(input.repoId, input.userId);
      if (!removed) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collaborator not found',
        });
      }

      // Send removal email notification
      const emailService = getGlobalEmailService();
      if (emailService.isConfigured() && collaboratorUser) {
        try {
          await emailService.sendNotificationEmail({
            email: collaboratorUser.email,
            name: collaboratorUser.name || undefined,
            notifications: [{
              type: 'collaborator_removed',
              title: `You've been removed from a repository`,
              body: `Your access to ${repo.name} has been revoked`,
              actorName: removedByUser?.name || removedByUser?.username || undefined,
            }],
          });
        } catch (error) {
          console.error('[Repos] Failed to send removal email:', error);
        }
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

      // Get the bare repository (auto-create if missing on disk)
      const bareRepo = getRepoFromDisk(result.repo.diskPath, true);
      if (!bareRepo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found on disk',
        });
      }

      try {
        // Import wit core classes
        const { Blob, Tree, Commit } = await import('../../../core/object');

        // Get user info for commit author
        const user = await userModel.findById(ctx.user.id);
        const authorName = user?.name || user?.username || 'wit user';
        const authorEmail = user?.email || `${ctx.user.id}@wit.local`;

        // Resolve the branch ref to get the current commit
        const branchRef = `refs/heads/${input.ref}`;
        const currentCommitHash = bareRepo.refs.resolve(branchRef);
        
        // Get the current tree (or start fresh if no commits yet)
        let currentTreeEntries: Array<{ mode: string; name: string; hash: string }> = [];
        if (currentCommitHash) {
          const currentCommit = bareRepo.objects.readCommit(currentCommitHash);
          const currentTree = bareRepo.objects.readTree(currentCommit.treeHash);
          currentTreeEntries = [...currentTree.entries];
        }

        // Write the new file content as a blob
        const contentBuffer = Buffer.from(input.content, 'utf-8');
        const blobHash = bareRepo.objects.writeBlob(contentBuffer);

        // Build the new tree with the updated file
        // Handle nested paths by building tree hierarchy
        const pathParts = input.path.split('/').filter(Boolean);
        
        if (pathParts.length === 1) {
          // Simple case: file in root directory
          const fileName = pathParts[0];
          // Remove existing entry if present
          currentTreeEntries = currentTreeEntries.filter(e => e.name !== fileName);
          // Add the new/updated file
          currentTreeEntries.push({
            mode: '100644',
            name: fileName,
            hash: blobHash,
          });
        } else {
          // Complex case: nested path - need to build subtrees
          // For now, use a simpler approach: rebuild the tree hierarchy
          const updateTree = (
            entries: Array<{ mode: string; name: string; hash: string }>,
            parts: string[],
            fileHash: string
          ): Array<{ mode: string; name: string; hash: string }> => {
            const [current, ...rest] = parts;
            
            if (rest.length === 0) {
              // This is the file - update or add it
              const newEntries = entries.filter(e => e.name !== current);
              newEntries.push({ mode: '100644', name: current, hash: fileHash });
              return newEntries;
            }
            
            // This is a directory - find or create it
            const existingDir = entries.find(e => e.name === current && e.mode === '40000');
            let subEntries: Array<{ mode: string; name: string; hash: string }> = [];
            
            if (existingDir) {
              const subTree = bareRepo.objects.readTree(existingDir.hash);
              subEntries = [...subTree.entries];
            }
            
            // Recursively update the subtree
            const updatedSubEntries = updateTree(subEntries, rest, fileHash);
            
            // Write the updated subtree
            const newSubTree = new Tree(updatedSubEntries);
            const subTreeHash = bareRepo.objects.writeObject(newSubTree);
            
            // Update the parent entries
            const newEntries = entries.filter(e => e.name !== current);
            newEntries.push({ mode: '40000', name: current, hash: subTreeHash });
            return newEntries;
          };
          
          currentTreeEntries = updateTree(currentTreeEntries, pathParts, blobHash);
        }

        // Write the new root tree
        const newTree = new Tree(currentTreeEntries);
        const newTreeHash = bareRepo.objects.writeObject(newTree);

        // Create the commit
        const timestamp = Math.floor(Date.now() / 1000);
        const timezone = '+0000';
        const author = {
          name: authorName,
          email: authorEmail,
          timestamp,
          timezone,
        };

        const parentHashes = currentCommitHash ? [currentCommitHash] : [];
        const commit = new Commit(newTreeHash, parentHashes, author, author, input.message);
        const newSha = bareRepo.objects.writeObject(commit);

        // Update the branch ref to point to the new commit
        bareRepo.refs.updateBranch(input.ref, newSha);

        // Record activity
        await activityHelpers.logPush(ctx.user.id, result.repo.id, input.ref, [
          { sha: newSha, message: input.message },
        ]);

        // Emit event
        eventBus.emit('repo.pushed', ctx.user.id, {
          repoId: result.repo.id,
          repoFullName: `${ctx.user.username || ctx.user.id}/${result.repo.name}`,
          ref: `refs/heads/${input.ref}`,
          beforeSha: currentCommitHash || null,
          afterSha: newSha,
          commits: [{
            sha: newSha,
            message: input.message,
            author: authorName,
          }],
        });

        return {
          sha: newSha,
          path: input.path,
          branch: input.ref,
        };
      } catch (error) {
        console.error('[repos.updateFile] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update file',
        });
      }
    }),

  /**
   * Get leaderboard of repos by commit count in last 7 days
   */
  leaderboard: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
      }).optional()
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 20;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // Get all public repositories
      const publicRepos = await repoModel.listAllPublic();
      
      // For each repo, count commits in the last 7 days
      const reposWithCommits: Array<{
        id: string;
        name: string;
        ownerName: string;
        ownerType: 'user' | 'organization';
        description: string | null;
        commitCount: number;
        starsCount: number;
      }> = [];
      
      for (const repo of publicRepos) {
        try {
          const bareRepo = getRepoFromDisk(repo.diskPath);
          if (!bareRepo) continue;
          
          // Resolve HEAD to get the default branch commit
          let commitHash = bareRepo.refs.resolve('HEAD');
          if (!commitHash) continue;
          
          let commitCount = 0;
          const maxWalk = 500; // Limit how many commits we walk
          let walked = 0;
          
          // Walk commit history and count commits in last 7 days
          while (commitHash && walked < maxWalk) {
            try {
              const commit = bareRepo.objects.readCommit(commitHash);
              const commitDate = new Date(commit.author.timestamp * 1000);
              
              // If commit is older than 7 days, stop walking
              if (commitDate < sevenDaysAgo) {
                break;
              }
              
              commitCount++;
              walked++;
              
              // Move to parent
              commitHash = commit.parentHashes[0] || null;
            } catch {
              break;
            }
          }
          
          if (commitCount > 0) {
            // Get owner name
            let ownerName = '';
            if (repo.ownerType === 'user') {
              const user = await userModel.findById(repo.ownerId);
              ownerName = user?.username || user?.name || 'unknown';
            } else {
              const org = await orgModel.findById(repo.ownerId);
              ownerName = org?.name || 'unknown';
            }
            
            reposWithCommits.push({
              id: repo.id,
              name: repo.name,
              ownerName,
              ownerType: repo.ownerType,
              description: repo.description,
              commitCount,
              starsCount: repo.starsCount,
            });
          }
        } catch (error) {
          // Skip repos that fail
          console.error(`[repos.leaderboard] Error processing repo ${repo.id}:`, error);
        }
      }
      
      // Sort by commit count descending
      reposWithCommits.sort((a, b) => b.commitCount - a.commitCount);
      
      // Return top N
      return reposWithCommits.slice(0, limit);
    }),

  /**
   * Get tags for a repository
   * Returns list of tags with commit info for release notes generation
   */
  getTags: publicProcedure
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
        const tagNames = bareRepo.refs.listTags();
        const tags: Array<{
          name: string;
          sha: string;
          targetSha: string;
          isAnnotated: boolean;
          message?: string;
          tagger?: { name: string; email: string };
          date?: Date;
        }> = [];

        for (const name of tagNames) {
          try {
            const sha = bareRepo.refs.resolve(name);
            if (!sha) continue;

            // Try to read as tag object (annotated) or fall back to commit (lightweight)
            let targetSha = sha;
            let isAnnotated = false;
            let message: string | undefined;
            let tagger: { name: string; email: string } | undefined;
            let date: Date | undefined;

            try {
              const obj = bareRepo.objects.readObject(sha);
              if (obj.type === 'tag') {
                // Annotated tag
                isAnnotated = true;
                const content = obj.serialize().toString('utf-8');
                
                // Parse tag object
                const objectMatch = content.match(/^object ([a-f0-9]+)/m);
                if (objectMatch) {
                  targetSha = objectMatch[1];
                }
                
                const taggerMatch = content.match(/^tagger (.+) <(.+)> (\d+)/m);
                if (taggerMatch) {
                  tagger = { name: taggerMatch[1], email: taggerMatch[2] };
                  date = new Date(parseInt(taggerMatch[3], 10) * 1000);
                }
                
                // Message is after the blank line
                const blankIndex = content.indexOf('\n\n');
                if (blankIndex !== -1) {
                  message = content.slice(blankIndex + 2).trim();
                }
              }
            } catch {
              // Lightweight tag - targetSha is the same as sha
            }

            tags.push({
              name,
              sha,
              targetSha,
              isAnnotated,
              message,
              tagger,
              date,
            });
          } catch {
            // Skip invalid tags
          }
        }

        // Sort by semver if possible, then by date
        tags.sort((a, b) => {
          // Try semver comparison
          const aMatch = a.name.match(/v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?/);
          const bMatch = b.name.match(/v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?/);
          
          if (aMatch && bMatch) {
            const aMajor = parseInt(aMatch[1], 10);
            const bMajor = parseInt(bMatch[1], 10);
            if (aMajor !== bMajor) return bMajor - aMajor;
            
            const aMinor = parseInt(aMatch[2], 10);
            const bMinor = parseInt(bMatch[2], 10);
            if (aMinor !== bMinor) return bMinor - aMinor;
            
            const aPatch = parseInt(aMatch[3], 10);
            const bPatch = parseInt(bMatch[3], 10);
            if (aPatch !== bPatch) return bPatch - aPatch;
            
            // Pre-release versions come after release
            if (aMatch[4] && !bMatch[4]) return 1;
            if (!aMatch[4] && bMatch[4]) return -1;
          }
          
          // Fall back to date comparison
          if (a.date && b.date) {
            return b.date.getTime() - a.date.getTime();
          }
          
          return b.name.localeCompare(a.name);
        });

        return tags;
      } catch (error) {
        console.error('[repos.getTags] Error:', error);
        return [];
      }
    }),

  /**
   * Get commits between two refs (for release notes generation)
   * Returns commits from 'toRef' back to (but not including) 'fromRef'
   */
  getCommitsBetween: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        fromRef: z.string().optional().describe('Starting ref (exclusive) - e.g., previous tag'),
        toRef: z.string().default('HEAD').describe('Ending ref (inclusive) - e.g., new tag or HEAD'),
        limit: z.number().min(1).max(500).default(200),
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
        return { commits: [], stats: { totalCommits: 0 } };
      }

      try {
        // Resolve the refs
        let toHash = bareRepo.refs.resolve(input.toRef);
        if (!toHash) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Cannot resolve ref '${input.toRef}'`,
          });
        }

        // Handle tag objects (dereference to commit)
        try {
          const toObj = bareRepo.objects.readObject(toHash);
          if (toObj.type === 'tag') {
            const content = toObj.serialize().toString('utf-8');
            const objectMatch = content.match(/^object ([a-f0-9]+)/m);
            if (objectMatch) {
              toHash = objectMatch[1];
            }
          }
        } catch {
          // Not a tag object, use as-is
        }

        let fromHash: string | null = null;
        if (input.fromRef) {
          fromHash = bareRepo.refs.resolve(input.fromRef);
          if (fromHash) {
            // Handle tag objects
            try {
              const fromObj = bareRepo.objects.readObject(fromHash);
              if (fromObj.type === 'tag') {
                const content = fromObj.serialize().toString('utf-8');
                const objectMatch = content.match(/^object ([a-f0-9]+)/m);
                if (objectMatch) {
                  fromHash = objectMatch[1];
                }
              }
            } catch {
              // Not a tag object, use as-is
            }
          }
        }

        const commits: Array<{
          sha: string;
          shortSha: string;
          message: string;
          author: string;
          email: string;
          date: string;
        }> = [];

        const visited = new Set<string>();
        const queue: string[] = [toHash];

        // Walk commit history from toRef back to fromRef
        while (queue.length > 0 && commits.length < input.limit) {
          const hash = queue.shift()!;

          // Stop if we reached the from commit
          if (fromHash && hash === fromHash) {
            continue;
          }

          if (visited.has(hash)) {
            continue;
          }
          visited.add(hash);

          try {
            const commit = bareRepo.objects.readCommit(hash);
            
            commits.push({
              sha: hash,
              shortSha: hash.slice(0, 7),
              message: commit.message,
              author: commit.author.name,
              email: commit.author.email,
              date: new Date(commit.author.timestamp * 1000).toISOString(),
            });

            // Add parents to queue
            for (const parent of commit.parentHashes) {
              if (!visited.has(parent) && parent !== fromHash) {
                queue.push(parent);
              }
            }
          } catch {
            // Skip invalid commits
          }
        }

        // Sort by date (newest first)
        commits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
          commits,
          stats: {
            totalCommits: commits.length,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[repos.getCommitsBetween] Error:', error);
        return { commits: [], stats: { totalCommits: 0 } };
      }
    }),
});
