import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';

/**
 * Initialize tRPC with context and superjson transformer for date serialization
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

/**
 * Export router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;

/**
 * Auth middleware - ensures user is authenticated
 */
const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      // Narrow the user type to be non-null
      user: ctx.user,
    },
  });
});

/**
 * Protected procedure - requires authentication
 */
export const protectedProcedure = t.procedure.use(isAuthed);
