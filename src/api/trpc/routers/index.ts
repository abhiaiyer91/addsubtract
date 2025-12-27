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
import { releasesRouter } from './releases';
import { organizationsRouter } from './organizations';
import { sshKeysRouter } from './ssh-keys';
import { tokensRouter } from './tokens';
import { branchProtectionRouter } from './branch-protection';
import { notificationsRouter } from './notifications';
import { stacksRouter } from './stacks';
import { workflowsRouter } from './workflows';
import { aiRouter } from './ai';
import { searchRouter } from './search';

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
  releases: releasesRouter,
  organizations: organizationsRouter,
  sshKeys: sshKeysRouter,
  tokens: tokensRouter,
  branchProtection: branchProtectionRouter,
  notifications: notificationsRouter,
  stacks: stacksRouter,
  workflows: workflowsRouter,
  ai: aiRouter,
  search: searchRouter,
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
  releasesRouter,
  organizationsRouter,
  sshKeysRouter,
  tokensRouter,
  branchProtectionRouter,
  notificationsRouter,
  stacksRouter,
  aiRouter,
  searchRouter,
};
