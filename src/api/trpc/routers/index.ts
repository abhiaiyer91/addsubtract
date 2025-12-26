import { router } from '../index';
import { releasesRouter } from './releases';

/**
 * Main application router
 * Add new routers here as they are created
 */
export const appRouter = router({
  releases: releasesRouter,
});

/**
 * Export type definition of the API
 * This is used on the client side for type-safe API calls
 */
export type AppRouter = typeof appRouter;
