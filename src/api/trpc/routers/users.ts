import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { userModel, repoModel, starModel, watchModel, orgMemberModel } from '../../../db/models';

export const usersRouter = router({
  /**
   * Get current authenticated user's full profile
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await userModel.findById(ctx.user.id);

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      location: user.location,
      website: user.website,
      createdAt: user.createdAt,
    };
  }),

  /**
   * Get a user by username
   */
  get: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const user = await userModel.findByUsername(input.username);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Return public user info (exclude passwordHash)
      return {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        location: user.location,
        website: user.website,
        createdAt: user.createdAt,
      };
    }),

  /**
   * Get a user by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const user = await userModel.findById(input.id);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Return public user info
      return {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        location: user.location,
        website: user.website,
        createdAt: user.createdAt,
      };
    }),

  /**
   * Search users by username or name
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const users = await userModel.search(input.query, input.limit);

      // Return public info only
      return users.map((user) => ({
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
      }));
    }),

  /**
   * Get a user's public repositories
   */
  repos: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      const user = await userModel.findByUsername(input.username);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // If viewing own repos, show all; otherwise only public
      if (ctx.user?.id === user.id) {
        return repoModel.listByOwner(user.id, 'user');
      }

      return repoModel.listPublicByOwner(user.id, 'user');
    }),

  /**
   * Get a user's starred repositories
   */
  stars: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const user = await userModel.findByUsername(input.username);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return starModel.listByUser(user.id);
    }),

  /**
   * Get a user's watched repositories
   */
  watched: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const user = await userModel.findByUsername(input.username);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return watchModel.listByUser(user.id);
    }),

  /**
   * Get organizations a user belongs to
   */
  orgs: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const user = await userModel.findByUsername(input.username);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const memberships = await orgMemberModel.listByUser(user.id);
      return memberships.map((m) => m.org);
    }),

  /**
   * Update current user's profile (alias for auth.updateProfile)
   */
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().max(255).optional(),
        bio: z.string().max(500).nullable().optional(),
        location: z.string().max(100).nullable().optional(),
        website: z.string().url().max(255).nullable().optional().or(z.literal('')),
        avatarUrl: z.string().url().max(500).nullable().optional().or(z.literal('')),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const updates: Record<string, string | null | undefined> = {};

      if (input.name !== undefined) updates.name = input.name;
      if (input.bio !== undefined) updates.bio = input.bio;
      if (input.location !== undefined) updates.location = input.location;
      if (input.website !== undefined) updates.website = input.website || null;
      if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl || null;

      const user = await userModel.update(ctx.user.id, updates);
      return user;
    }),

  /**
   * Check if a username is available
   */
  checkUsername: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const available = await userModel.isUsernameAvailable(input.username);
      return { available };
    }),
});
