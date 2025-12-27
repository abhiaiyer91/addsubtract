/**
 * Branch Protection tRPC Router
 *
 * Provides API endpoints for managing branch protection rules.
 * Admins can configure which branches require PRs, reviews, etc.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { branchProtectionModel } from '../../../db/models/branch-protection';
import { repoModel, collaboratorModel } from '../../../db/models';

/**
 * Check if user has required permission on a repository
 */
async function assertRepoPermission(
  userId: string,
  repoId: string,
  requiredPermission: 'read' | 'write' | 'admin'
): Promise<void> {
  const repo = await repoModel.findById(repoId);
  if (!repo) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }

  // Owner has all permissions
  if (repo.ownerId === userId) {
    return;
  }

  // Check collaborator permission
  const hasPermission = await collaboratorModel.hasPermission(
    repoId,
    userId,
    requiredPermission
  );

  if (!hasPermission) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `${requiredPermission} permission required for this repository`,
    });
  }
}

export const branchProtectionRouter = router({
  /**
   * List all protection rules for a repository
   * Requires: write permission
   */
  list: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid('Invalid repository ID'),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'write');

      const rules = await branchProtectionModel.findByRepoId(input.repoId);

      return rules.map((rule) => ({
        id: rule.id,
        pattern: rule.pattern,
        requirePullRequest: rule.requirePullRequest,
        requiredReviewers: rule.requiredReviewers,
        requireStatusChecks: rule.requireStatusChecks,
        requiredStatusChecks: branchProtectionModel.getRequiredStatusChecks(rule),
        allowForcePush: rule.allowForcePush,
        allowDeletion: rule.allowDeletion,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      }));
    }),

  /**
   * Get a specific protection rule
   * Requires: write permission
   */
  get: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid rule ID'),
        repoId: z.string().uuid('Invalid repository ID'),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'write');

      const rule = await branchProtectionModel.findById(input.id);

      if (!rule || rule.repoId !== input.repoId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Protection rule not found',
        });
      }

      return {
        id: rule.id,
        pattern: rule.pattern,
        requirePullRequest: rule.requirePullRequest,
        requiredReviewers: rule.requiredReviewers,
        requireStatusChecks: rule.requireStatusChecks,
        requiredStatusChecks: branchProtectionModel.getRequiredStatusChecks(rule),
        allowForcePush: rule.allowForcePush,
        allowDeletion: rule.allowDeletion,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      };
    }),

  /**
   * Create a new protection rule
   * Requires: admin permission
   */
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid('Invalid repository ID'),
        pattern: z
          .string()
          .min(1, 'Pattern is required')
          .max(255, 'Pattern must be 255 characters or less'),
        requirePullRequest: z.boolean().default(true),
        requiredReviewers: z.number().int().min(0).max(10).default(1),
        requireStatusChecks: z.boolean().default(false),
        requiredStatusChecks: z.array(z.string()).optional(),
        allowForcePush: z.boolean().default(false),
        allowDeletion: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      // Check if pattern already exists for this repo
      const existing = await branchProtectionModel.findByRepoId(input.repoId);
      if (existing.some((r) => r.pattern === input.pattern)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A protection rule for pattern '${input.pattern}' already exists`,
        });
      }

      const rule = await branchProtectionModel.create({
        repoId: input.repoId,
        pattern: input.pattern,
        requirePullRequest: input.requirePullRequest,
        requiredReviewers: input.requiredReviewers,
        requireStatusChecks: input.requireStatusChecks,
        requiredStatusChecks: input.requiredStatusChecks
          ? JSON.stringify(input.requiredStatusChecks)
          : null,
        allowForcePush: input.allowForcePush,
        allowDeletion: input.allowDeletion,
      });

      return {
        id: rule.id,
        pattern: rule.pattern,
        requirePullRequest: rule.requirePullRequest,
        requiredReviewers: rule.requiredReviewers,
        requireStatusChecks: rule.requireStatusChecks,
        requiredStatusChecks: branchProtectionModel.getRequiredStatusChecks(rule),
        allowForcePush: rule.allowForcePush,
        allowDeletion: rule.allowDeletion,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      };
    }),

  /**
   * Update a protection rule
   * Requires: admin permission
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid rule ID'),
        repoId: z.string().uuid('Invalid repository ID'),
        pattern: z
          .string()
          .min(1)
          .max(255)
          .optional(),
        requirePullRequest: z.boolean().optional(),
        requiredReviewers: z.number().int().min(0).max(10).optional(),
        requireStatusChecks: z.boolean().optional(),
        requiredStatusChecks: z.array(z.string()).optional(),
        allowForcePush: z.boolean().optional(),
        allowDeletion: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      // Verify rule exists and belongs to repo
      const existing = await branchProtectionModel.findById(input.id);
      if (!existing || existing.repoId !== input.repoId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Protection rule not found',
        });
      }

      // Check for pattern conflict if pattern is being changed
      if (input.pattern && input.pattern !== existing.pattern) {
        const allRules = await branchProtectionModel.findByRepoId(input.repoId);
        if (allRules.some((r) => r.id !== input.id && r.pattern === input.pattern)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A protection rule for pattern '${input.pattern}' already exists`,
          });
        }
      }

      const rule = await branchProtectionModel.update(input.id, {
        pattern: input.pattern,
        requirePullRequest: input.requirePullRequest,
        requiredReviewers: input.requiredReviewers,
        requireStatusChecks: input.requireStatusChecks,
        requiredStatusChecks: input.requiredStatusChecks
          ? JSON.stringify(input.requiredStatusChecks)
          : undefined,
        allowForcePush: input.allowForcePush,
        allowDeletion: input.allowDeletion,
      });

      if (!rule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Protection rule not found',
        });
      }

      return {
        id: rule.id,
        pattern: rule.pattern,
        requirePullRequest: rule.requirePullRequest,
        requiredReviewers: rule.requiredReviewers,
        requireStatusChecks: rule.requireStatusChecks,
        requiredStatusChecks: branchProtectionModel.getRequiredStatusChecks(rule),
        allowForcePush: rule.allowForcePush,
        allowDeletion: rule.allowDeletion,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      };
    }),

  /**
   * Delete a protection rule
   * Requires: admin permission
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid rule ID'),
        repoId: z.string().uuid('Invalid repository ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      // Verify rule exists and belongs to repo
      const existing = await branchProtectionModel.findById(input.id);
      if (!existing || existing.repoId !== input.repoId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Protection rule not found',
        });
      }

      const deleted = await branchProtectionModel.delete(input.id);
      return { success: deleted };
    }),

  /**
   * Check if a branch is protected and get its protection settings
   */
  check: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid('Invalid repository ID'),
        branch: z.string().min(1, 'Branch name is required'),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'read');

      const rule = await branchProtectionModel.findMatchingRule(
        input.repoId,
        input.branch
      );

      if (!rule) {
        return {
          protected: false,
          rule: null,
        };
      }

      return {
        protected: true,
        rule: {
          id: rule.id,
          pattern: rule.pattern,
          requirePullRequest: rule.requirePullRequest,
          requiredReviewers: rule.requiredReviewers,
          requireStatusChecks: rule.requireStatusChecks,
          requiredStatusChecks: branchProtectionModel.getRequiredStatusChecks(rule),
          allowForcePush: rule.allowForcePush,
          allowDeletion: rule.allowDeletion,
        },
      };
    }),

  /**
   * Check if a push operation is allowed
   * Used by the server to enforce protection rules
   */
  canPush: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid('Invalid repository ID'),
        branch: z.string().min(1, 'Branch name is required'),
        isForcePush: z.boolean().default(false),
        isDeletion: z.boolean().default(false),
        isPRMerge: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const result = await branchProtectionModel.canPush(input.repoId, input.branch, {
        isForcePush: input.isForcePush,
        isDeletion: input.isDeletion,
        isPRMerge: input.isPRMerge,
      });

      return {
        allowed: result.allowed,
        reason: result.reason || null,
        ruleId: result.rule?.id || null,
      };
    }),
});
