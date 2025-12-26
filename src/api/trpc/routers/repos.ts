import { z } from 'zod';
import { TRPCError } from '@trpc/server';
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
});
