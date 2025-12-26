import { router } from '../trpc';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { reposRouter } from './repos';
import { pullsRouter } from './pulls';
import { issuesRouter } from './issues';
import { commentsRouter } from './comments';
import { activityRouter } from './activity';
import { webhooksRouter } from './webhooks';
import { milestonesRouter } from './milestones';

/**
 * Main application router
 * This combines all sub-routers into a single router
 */
export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
  repos: reposRouter,
  pulls: pullsRouter,
  issues: issuesRouter,
  comments: commentsRouter,
  activity: activityRouter,
  webhooks: webhooksRouter,
  milestones: milestonesRouter,
});

/**
 * Export type definition for end-to-end type safety
 */
export type AppRouter = typeof appRouter;

// Re-export individual routers for testing
export {
  authRouter,
  usersRouter,
  reposRouter,
  pullsRouter,
  issuesRouter,
  commentsRouter,
  activityRouter,
  webhooksRouter,
  milestonesRouter,
};
