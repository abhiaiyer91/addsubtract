import { initTRPC, TRPCError } from "@trpc/server";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import superjson from "superjson";

// =============================================================================
// Context Types
// =============================================================================

export type PermissionLevel = "read" | "write" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Context {
  db: PostgresJsDatabase;
  user: User | null;
  checkPermission: (repoId: string, level: PermissionLevel) => Promise<boolean>;
}

// =============================================================================
// tRPC Initialization
// =============================================================================

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

// =============================================================================
// Middleware
// =============================================================================

const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// =============================================================================
// Exports
// =============================================================================

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthenticated);
export const createCallerFactory = t.createCallerFactory;
