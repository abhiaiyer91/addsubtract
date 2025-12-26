import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'crypto';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { userModel, sessionModel } from '../../../db/models';

export const authRouter = router({
  /**
   * Get current authenticated user
   */
  me: publicProcedure.query(({ ctx }) => ctx.user),

  /**
   * Register a new user
   */
  register: publicProcedure
    .input(
      z.object({
        username: z
          .string()
          .min(3, 'Username must be at least 3 characters')
          .max(39, 'Username must be at most 39 characters')
          .regex(
            /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
            'Username must start and end with alphanumeric characters and can only contain alphanumeric characters and hyphens'
          ),
        email: z.string().email('Invalid email address'),
        name: z.string().max(255).optional(),
        password: z.string().min(8, 'Password must be at least 8 characters').optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Check if username is available
      if (!(await userModel.isUsernameAvailable(input.username))) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Username is already taken',
        });
      }

      // Check if email is available
      if (!(await userModel.isEmailAvailable(input.email))) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Email is already registered',
        });
      }

      // Create user
      // TODO: Hash password properly with bcrypt or argon2
      const user = await userModel.create({
        username: input.username,
        email: input.email,
        name: input.name,
        passwordHash: input.password, // In production, this should be hashed!
      });

      // Create session
      const sessionId = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await sessionModel.create({
        id: sessionId,
        userId: user.id,
        expiresAt,
      });

      return {
        user,
        sessionId,
      };
    }),

  /**
   * Login with username/email and password
   */
  login: publicProcedure
    .input(
      z.object({
        usernameOrEmail: z.string().min(1, 'Username or email is required'),
        password: z.string().min(1, 'Password is required'),
      })
    )
    .mutation(async ({ input }) => {
      // Find user by username or email
      const user = await userModel.findByUsernameOrEmail(input.usernameOrEmail);

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        });
      }

      // TODO: Properly compare hashed passwords
      if (user.passwordHash !== input.password) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        });
      }

      // Create session
      const sessionId = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await sessionModel.create({
        id: sessionId,
        userId: user.id,
        expiresAt,
      });

      return {
        user,
        sessionId,
      };
    }),

  /**
   * Logout - invalidate current session
   */
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const authHeader = ctx.req.headers.get('Authorization');
    const sessionId = authHeader?.replace('Bearer ', '');

    if (sessionId) {
      await sessionModel.delete(sessionId);
    }

    return { success: true };
  }),

  /**
   * Update current user's profile
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().max(255).optional(),
        bio: z.string().max(256).optional(),
        location: z.string().max(100).optional(),
        website: z.string().url().max(255).optional().or(z.literal('')),
        avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const updates: Record<string, string | undefined> = {};

      if (input.name !== undefined) updates.name = input.name;
      if (input.bio !== undefined) updates.bio = input.bio;
      if (input.location !== undefined) updates.location = input.location;
      if (input.website !== undefined) updates.website = input.website || undefined;
      if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl || undefined;

      const user = await userModel.update(ctx.user.id, updates);
      return user;
    }),

  /**
   * Change password
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify current password
      // TODO: Properly compare hashed passwords
      if (ctx.user.passwordHash !== input.currentPassword) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Current password is incorrect',
        });
      }

      // Update password
      // TODO: Hash password properly
      await userModel.update(ctx.user.id, {
        passwordHash: input.newPassword,
      });

      // Invalidate all other sessions
      await sessionModel.deleteAllForUser(ctx.user.id);

      return { success: true };
    }),

  /**
   * Delete all sessions for current user (logout everywhere)
   */
  logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
    await sessionModel.deleteAllForUser(ctx.user.id);
    return { success: true };
  }),
});
