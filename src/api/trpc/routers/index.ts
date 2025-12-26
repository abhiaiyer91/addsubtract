import { router } from "../trpc";
import { milestonesRouter } from "./milestones";

export const appRouter = router({
  milestones: milestonesRouter,
});

export type AppRouter = typeof appRouter;

// Re-export individual routers
export { milestonesRouter } from "./milestones";
