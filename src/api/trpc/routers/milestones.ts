import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { createMilestoneModel } from "../../../db/models/milestones";

// =============================================================================
// Input Schemas
// =============================================================================

const milestoneIdSchema = z.object({
  id: z.string().uuid(),
});

const listMilestonesSchema = z.object({
  repoId: z.string().uuid(),
  state: z.enum(["open", "closed"]).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const createMilestoneSchema = z.object({
  repoId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(65535).nullish(),
  dueDate: z.coerce.date().nullish(),
});

const updateMilestoneSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(65535).nullish(),
  dueDate: z.coerce.date().nullish(),
  state: z.enum(["open", "closed"]).optional(),
});

const listItemsSchema = z.object({
  milestoneId: z.string().uuid(),
  state: z.enum(["open", "closed"]).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const listPullRequestsSchema = z.object({
  milestoneId: z.string().uuid(),
  state: z.enum(["open", "closed", "merged"]).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

// =============================================================================
// Router
// =============================================================================

export const milestonesRouter = router({
  /**
   * List milestones for a repository
   */
  list: publicProcedure.input(listMilestonesSchema).query(async ({ ctx, input }) => {
    const model = createMilestoneModel(ctx.db);

    const milestones = await model.listWithProgress({
      repoId: input.repoId,
      state: input.state,
      limit: input.limit,
      offset: input.offset,
    });

    const counts = await model.getCounts(input.repoId);

    return {
      milestones,
      counts,
    };
  }),

  /**
   * Get a milestone by ID
   */
  get: publicProcedure.input(milestoneIdSchema).query(async ({ ctx, input }) => {
    const model = createMilestoneModel(ctx.db);

    const milestone = await model.getByIdWithProgress(input.id);

    if (!milestone) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Milestone not found",
      });
    }

    return milestone;
  }),

  /**
   * Create a new milestone (requires write permission)
   */
  create: protectedProcedure
    .input(createMilestoneSchema)
    .mutation(async ({ ctx, input }) => {
      // Check write permission
      const hasWritePermission = await ctx.checkPermission(input.repoId, "write");
      if (!hasWritePermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to create milestones in this repository",
        });
      }

      const model = createMilestoneModel(ctx.db);

      const milestone = await model.create({
        repoId: input.repoId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
      });

      return milestone;
    }),

  /**
   * Update a milestone (requires write permission)
   */
  update: protectedProcedure
    .input(updateMilestoneSchema)
    .mutation(async ({ ctx, input }) => {
      const model = createMilestoneModel(ctx.db);

      // Get existing milestone to check permissions
      const existing = await model.getById(input.id);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Milestone not found",
        });
      }

      // Check write permission
      const hasWritePermission = await ctx.checkPermission(existing.repoId, "write");
      if (!hasWritePermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to update milestones in this repository",
        });
      }

      const milestone = await model.update(input.id, {
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        state: input.state,
      });

      if (!milestone) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Milestone not found",
        });
      }

      return milestone;
    }),

  /**
   * Close a milestone (requires write permission)
   */
  close: protectedProcedure
    .input(milestoneIdSchema)
    .mutation(async ({ ctx, input }) => {
      const model = createMilestoneModel(ctx.db);

      // Get existing milestone to check permissions
      const existing = await model.getById(input.id);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Milestone not found",
        });
      }

      // Check write permission
      const hasWritePermission = await ctx.checkPermission(existing.repoId, "write");
      if (!hasWritePermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to close milestones in this repository",
        });
      }

      const milestone = await model.close(input.id);

      if (!milestone) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Milestone not found",
        });
      }

      return milestone;
    }),

  /**
   * Reopen a milestone (requires write permission)
   */
  reopen: protectedProcedure
    .input(milestoneIdSchema)
    .mutation(async ({ ctx, input }) => {
      const model = createMilestoneModel(ctx.db);

      // Get existing milestone to check permissions
      const existing = await model.getById(input.id);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Milestone not found",
        });
      }

      // Check write permission
      const hasWritePermission = await ctx.checkPermission(existing.repoId, "write");
      if (!hasWritePermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to reopen milestones in this repository",
        });
      }

      const milestone = await model.reopen(input.id);

      if (!milestone) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Milestone not found",
        });
      }

      return milestone;
    }),

  /**
   * Delete a milestone (requires admin permission)
   */
  delete: protectedProcedure
    .input(milestoneIdSchema)
    .mutation(async ({ ctx, input }) => {
      const model = createMilestoneModel(ctx.db);

      // Get existing milestone to check permissions
      const existing = await model.getById(input.id);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Milestone not found",
        });
      }

      // Check admin permission
      const hasAdminPermission = await ctx.checkPermission(existing.repoId, "admin");
      if (!hasAdminPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to delete milestones in this repository",
        });
      }

      const deleted = await model.delete(input.id);

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Milestone not found",
        });
      }

      return { success: true };
    }),

  /**
   * List issues in a milestone
   */
  issues: publicProcedure.input(listItemsSchema).query(async ({ ctx, input }) => {
    const model = createMilestoneModel(ctx.db);

    // Verify milestone exists
    const milestone = await model.getById(input.milestoneId);
    if (!milestone) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Milestone not found",
      });
    }

    const issues = await model.getIssues(input.milestoneId, {
      state: input.state,
      limit: input.limit,
      offset: input.offset,
    });

    return {
      milestone,
      issues,
    };
  }),

  /**
   * List pull requests in a milestone
   */
  pullRequests: publicProcedure
    .input(listPullRequestsSchema)
    .query(async ({ ctx, input }) => {
      const model = createMilestoneModel(ctx.db);

      // Verify milestone exists
      const milestone = await model.getById(input.milestoneId);
      if (!milestone) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Milestone not found",
        });
      }

      const pullRequests = await model.getPullRequests(input.milestoneId, {
        state: input.state,
        limit: input.limit,
        offset: input.offset,
      });

      return {
        milestone,
        pullRequests,
      };
    }),

  /**
   * Assign an issue to a milestone (requires write permission)
   */
  assignIssue: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        milestoneId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const model = createMilestoneModel(ctx.db);

      // If assigning to a milestone, verify it exists and check permissions
      if (input.milestoneId) {
        const milestone = await model.getById(input.milestoneId);
        if (!milestone) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Milestone not found",
          });
        }

        const hasWritePermission = await ctx.checkPermission(milestone.repoId, "write");
        if (!hasWritePermission) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to assign issues in this repository",
          });
        }
      }

      const success = await model.assignIssue(input.issueId, input.milestoneId);

      if (!success) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Issue not found",
        });
      }

      return { success: true };
    }),

  /**
   * Assign a pull request to a milestone (requires write permission)
   */
  assignPullRequest: protectedProcedure
    .input(
      z.object({
        pullRequestId: z.string().uuid(),
        milestoneId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const model = createMilestoneModel(ctx.db);

      // If assigning to a milestone, verify it exists and check permissions
      if (input.milestoneId) {
        const milestone = await model.getById(input.milestoneId);
        if (!milestone) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Milestone not found",
          });
        }

        const hasWritePermission = await ctx.checkPermission(milestone.repoId, "write");
        if (!hasWritePermission) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to assign pull requests in this repository",
          });
        }
      }

      const success = await model.assignPullRequest(input.pullRequestId, input.milestoneId);

      if (!success) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not found",
        });
      }

      return { success: true };
    }),
});

export type MilestonesRouter = typeof milestonesRouter;
