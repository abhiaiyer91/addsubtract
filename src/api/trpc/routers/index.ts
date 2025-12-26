/**
 * Main tRPC Router
 * Combines all sub-routers into a single application router
 */

import { webhooksRouter } from './webhooks';
import { Context } from '../context';

/**
 * Application router combining all sub-routers
 */
export const appRouter = {
  webhooks: webhooksRouter,
};

/**
 * Type export for the complete router
 */
export type AppRouter = typeof appRouter;

/**
 * Re-export context types
 */
export type { Context } from '../context';

/**
 * Re-export sub-routers for direct access if needed
 */
export { webhooksRouter } from './webhooks';
