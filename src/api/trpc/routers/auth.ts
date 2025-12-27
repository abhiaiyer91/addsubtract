import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { userModel } from '../../../db/models';
import { createAuth } from '../../../lib/auth';

export const authRouter = router({
  /**
   * Register a new user
   */
  register: publicProcedure
    .input(
      z.object({
        username: z.string().min(3).max(39),
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const auth = createAuth();
      
      // Register the user
      const result = await auth.api.signUpEmail({
        body: {
          email: input.email,
          password: input.password,
          name: input.name || input.username,
        },
      });

      if (!result || !result.user) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration failed',
        });
      }

      // Update username (better-auth doesn't have username field by default)
      const user = await userModel.update(result.user.id, {
        username: input.username,
      });

      // Create a session manually by signing in
      // We need to create a proper Request object for better-auth
      const signInRequest = new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
        }),
      });

      const signInResponse = await auth.handler(signInRequest);
      const signInData = await signInResponse.json();

      console.log('[auth.register] Sign-in response:', {
        status: signInResponse.status,
        hasToken: !!signInData.token,
        hasSession: !!signInData.session,
      });

      // Extract session token from response
      const sessionToken = signInData.token || signInData.session?.token || '';

      return {
        user,
        sessionId: sessionToken,
      };
    }),

  /**
   * Login with email and password
   */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const auth = createAuth();
      
      const result = await auth.api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
        },
      });

      if (!result || !result.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        });
      }

      const user = await userModel.findById(result.user.id);
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return {
        user,
        sessionId: result.session?.token || '',
      };
    }),

  /**
   * Get current authenticated user
   * This uses the session from context (already validated by better-auth)
   */
  me: publicProcedure.query(({ ctx }) => ctx.user),

  /**
   * Check if username is available
   */
  checkUsername: publicProcedure
    .input(z.object({ username: z.string().min(3).max(39) }))
    .query(async ({ input }) => {
      const available = await userModel.isUsernameAvailable(input.username);
      return { available };
    }),

  /**
   * Check if email is available
   */
  checkEmail: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ input }) => {
      const available = await userModel.isEmailAvailable(input.email);
      return { available };
    }),

  /**
   * Update current user's profile
   * Note: This updates fields in the better-auth user table
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
   * Change password using better-auth
   * Note: This requires the client to call better-auth's changePassword endpoint directly
   * This endpoint just validates that the user is authenticated
   */
  canChangePassword: protectedProcedure.query(() => {
    // User is authenticated, they can use better-auth's changePassword endpoint
    return { canChange: true };
  }),

  /**
   * Revoke all sessions for current user
   * Uses better-auth's session revocation
   */
  logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const auth = createAuth();
      await auth.api.revokeOtherSessions({
        headers: ctx.req.headers,
      });
      return { success: true };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to revoke sessions',
      });
    }
  }),
});
