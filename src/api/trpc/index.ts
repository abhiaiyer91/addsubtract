import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

/**
 * Context for tRPC procedures
 */
export interface Context {
  userId?: string;
  isAuthenticated: boolean;
}

/**
 * Create context for each request
 */
export const createContext = (opts?: { userId?: string }): Context => {
  return {
    userId: opts?.userId,
    isAuthenticated: !!opts?.userId,
  };
};

/**
 * Initialize tRPC instance
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof z.ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/**
 * Middleware to check if user is authenticated
 */
const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.isAuthenticated || !ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

/**
 * Protected procedure - requires authentication
 */
export const protectedProcedure = publicProcedure.use(isAuthed);
