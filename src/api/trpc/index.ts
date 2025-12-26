/**
 * tRPC API module
 *
 * This module exports everything needed for the tRPC API:
 * - Server-side: router, context, procedures
 * - Client-side: createClient
 * - Types: AppRouter for end-to-end type safety
 */

// Export router and types
export { appRouter, type AppRouter } from './routers';
export {
  authRouter,
  usersRouter,
  reposRouter,
  pullsRouter,
  issuesRouter,
  commentsRouter,
  activityRouter,
  releasesRouter,
} from './routers';

// Export context
export { createContext, createTestContext, type Context } from './context';

// Export tRPC primitives for extending
export {
  router,
  publicProcedure,
  protectedProcedure,
  middleware,
  mergeRouters,
} from './trpc';

// Export middleware
export {
  isAuthed,
  withRepoPermission,
  isRepoAdmin,
  isRepoMember,
  withOrgRole,
  isOrgAdmin,
  isOrgOwner,
} from './middleware/auth';

// Export client creator
export {
  createClient,
  createClientWithTokenGetter,
  isTRPCClientError,
  TRPCClientError,
} from './client';
