import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  prModel,
  prReviewModel,
  prCommentModel,
  prLabelModel,
  repoModel,
  collaboratorModel,
  activityHelpers,
  userModel,
} from '../../../db/models';
import { mergePullRequest, checkMergeability, getDefaultMergeMessage } from '../../../server/storage/merge';
import { triggerAsyncReview } from '../../../ai/services/pr-review';
import { exists } from '../../../utils/fs';

export const pullsRouter = router({
  /**
   * List pull requests for a repository (with author and labels)
   */
  list: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        state: z.enum(['open', 'closed', 'merged']).optional(),
        authorId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const prs = await prModel.listByRepo(input.repoId, {
        state: input.state,
        authorId: input.authorId,
        limit: input.limit,
        offset: input.offset,
      });

      // Fetch authors and labels for each PR
      const prsWithDetails = await Promise.all(
        prs.map(async (pr) => {
          const result = await prModel.findWithAuthor(pr.id);
          const labels = await prLabelModel.listByPr(pr.id);
          return {
            ...pr,
            author: result?.author ?? null,
            labels,
          };
        })
      );

      return prsWithDetails;
    }),

  /**
   * Get a single pull request by number (with author and labels)
   */
  get: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        number: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findByRepoAndNumber(input.repoId, input.number);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Get author
      const authorResult = await prModel.findWithAuthor(pr.id);
      const author = authorResult?.author ?? null;

      // Get labels
      const labels = await prLabelModel.listByPr(pr.id);

      return {
        ...pr,
        author,
        labels,
      };
    }),

  /**
   * Get a pull request by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findById(input.id);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      return pr;
    }),

  /**
   * Get a pull request with author details
   */
  getWithAuthor: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const result = await prModel.findWithAuthor(input.id);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      return result;
    }),

  /**
   * Create a new pull request
   */
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        title: z.string().min(1, 'Title is required').max(256),
        body: z.string().optional(),
        sourceBranch: z.string().min(1, 'Source branch is required'),
        targetBranch: z.string().min(1, 'Target branch is required'),
        headSha: z.string().min(1, 'Head SHA is required'),
        baseSha: z.string().min(1, 'Base SHA is required'),
        isDraft: z.boolean().default(false),
        sourceRepoId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);

      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const pr = await prModel.create({
        repoId: input.repoId,
        title: input.title,
        body: input.body,
        sourceBranch: input.sourceBranch,
        targetBranch: input.targetBranch,
        headSha: input.headSha,
        baseSha: input.baseSha,
        authorId: ctx.user.id,
        isDraft: input.isDraft,
        sourceRepoId: input.sourceRepoId,
        state: 'open',
      });

      // Log activity
      await activityHelpers.logPrOpened(ctx.user.id, input.repoId, pr.number, pr.title);

      // Trigger async AI review (fire-and-forget, doesn't block PR creation)
      if (!input.isDraft) {
        triggerAsyncReview(pr.id);
      }

      return pr;
    }),

  /**
   * Update a pull request
   */
  update: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        title: z.string().min(1).max(256).optional(),
        body: z.string().optional(),
        isDraft: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Only author or repo admin can update
      const isAuthor = pr.authorId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'admin');

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this pull request',
        });
      }

      const updates: Record<string, string | boolean | undefined> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.body !== undefined) updates.body = input.body;
      if (input.isDraft !== undefined) updates.isDraft = input.isDraft;

      return prModel.update(input.prId, updates);
    }),

  /**
   * Check if a pull request can be merged (no conflicts)
   */
  checkMergeability: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Resolve disk path
      const reposDir = process.env.REPOS_DIR || './repos';
      const diskPath = path.isAbsolute(repo.diskPath) 
        ? repo.diskPath 
        : path.join(process.cwd(), reposDir, repo.diskPath.replace(/^\/repos\//, ''));

      if (!exists(diskPath)) {
        return { 
          canMerge: false, 
          conflicts: [], 
          behindBy: 0, 
          aheadBy: 0,
          error: 'Repository not found on disk' 
        };
      }

      try {
        const result = checkMergeability(diskPath, pr.sourceBranch, pr.targetBranch);
        return result;
      } catch (error) {
        return { 
          canMerge: false, 
          conflicts: [], 
          behindBy: 0, 
          aheadBy: 0,
          error: error instanceof Error ? error.message : 'Failed to check mergeability' 
        };
      }
    }),

  /**
   * Merge a pull request
   * 
   * This actually performs the Git merge operation on the bare repository,
   * then updates the database to reflect the merged state.
   */
  merge: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        strategy: z.enum(['merge', 'squash', 'rebase']).default('merge'),
        message: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      if (pr.state !== 'open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Pull request is not open',
        });
      }

      // Check if user has write permission
      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to merge this pull request',
        });
      }

      // Get user info for commit author
      const user = await userModel.findById(ctx.user.id);
      if (!user) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'User not found',
        });
      }

      // Resolve disk path
      const reposDir = process.env.REPOS_DIR || './repos';
      const diskPath = path.isAbsolute(repo.diskPath) 
        ? repo.diskPath 
        : path.join(process.cwd(), reposDir, repo.diskPath.replace(/^\/repos\//, ''));

      if (!exists(diskPath)) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Repository not found on disk',
        });
      }

      // Generate merge message if not provided
      const mergeMessage = input.message || getDefaultMergeMessage(
        pr.number,
        pr.title,
        pr.sourceBranch,
        pr.targetBranch,
        input.strategy
      );

      // Actually perform the Git merge
      const mergeResult = await mergePullRequest(
        diskPath,
        pr.sourceBranch,
        pr.targetBranch,
        {
          authorName: user.name || user.username,
          authorEmail: user.email,
          message: mergeMessage,
          strategy: input.strategy,
        }
      );

      if (!mergeResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: mergeResult.error || 'Merge failed',
          cause: mergeResult.conflicts,
        });
      }

      // Update database with merge info
      const mergedPr = await prModel.merge(input.prId, ctx.user.id, mergeResult.mergeSha!);

      // Log activity
      if (mergedPr) {
        await activityHelpers.logPrMerged(ctx.user.id, pr.repoId, pr.number, pr.title);
      }

      return {
        ...mergedPr,
        mergeSha: mergeResult.mergeSha,
      };
    }),

  /**
   * Close a pull request
   */
  close: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Only author or repo admin can close
      const isAuthor = pr.authorId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'admin');

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to close this pull request',
        });
      }

      const closedPr = await prModel.close(input.prId);

      // Log activity
      if (closedPr) {
        await activityHelpers.logPrClosed(ctx.user.id, pr.repoId, pr.number, pr.title);
      }

      return closedPr;
    }),

  /**
   * Reopen a pull request
   */
  reopen: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      if (pr.state !== 'closed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Pull request is not closed',
        });
      }

      // Only author or repo admin can reopen
      const isAuthor = pr.authorId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'admin');

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to reopen this pull request',
        });
      }

      return prModel.reopen(input.prId);
    }),

  /**
   * Add a review to a pull request
   */
  addReview: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        state: z.enum(['approved', 'changes_requested', 'commented']),
        body: z.string().optional(),
        commitSha: z.string().min(1, 'Commit SHA is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      return prReviewModel.create({
        prId: input.prId,
        userId: ctx.user.id,
        state: input.state,
        body: input.body,
        commitSha: input.commitSha,
      });
    }),

  /**
   * List reviews for a pull request
   */
  reviews: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return prReviewModel.listByPr(input.prId);
    }),

  /**
   * Add a comment to a pull request
   */
  addComment: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        body: z.string().min(1, 'Comment body is required'),
        path: z.string().optional(),
        line: z.number().int().positive().optional(),
        side: z.enum(['LEFT', 'RIGHT']).optional(),
        commitSha: z.string().optional(),
        reviewId: z.string().uuid().optional(),
        replyToId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      return prCommentModel.create({
        prId: input.prId,
        userId: ctx.user.id,
        body: input.body,
        path: input.path,
        line: input.line,
        side: input.side,
        commitSha: input.commitSha,
        reviewId: input.reviewId,
        replyToId: input.replyToId,
      });
    }),

  /**
   * List comments for a pull request
   */
  comments: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return prCommentModel.listByPr(input.prId);
    }),

  /**
   * Update a comment
   */
  updateComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
        body: z.string().min(1, 'Comment body is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await prCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      // Only the comment author can update
      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only edit your own comments',
        });
      }

      return prCommentModel.update(input.commentId, input.body);
    }),

  /**
   * Delete a comment
   */
  deleteComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await prCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      // Only the comment author can delete
      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own comments',
        });
      }

      return prCommentModel.delete(input.commentId);
    }),

  /**
   * Get labels for a pull request
   */
  labels: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return prLabelModel.listByPr(input.prId);
    }),

  /**
   * Add a label to a pull request
   */
  addLabel: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        labelId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Check write permission
      const repo = await repoModel.findById(pr.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to add labels',
        });
      }

      await prLabelModel.add(input.prId, input.labelId);
      return { success: true };
    }),

  /**
   * Remove a label from a pull request
   */
  removeLabel: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        labelId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Check write permission
      const repo = await repoModel.findById(pr.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to remove labels',
        });
      }

      return prLabelModel.remove(input.prId, input.labelId);
    }),

  /**
   * List pull requests by author
   */
  listByAuthor: publicProcedure
    .input(
      z.object({
        authorId: z.string().uuid(),
        state: z.enum(['open', 'closed', 'merged']).optional(),
      })
    )
    .query(async ({ input }) => {
      return prModel.listByAuthor(input.authorId, input.state);
    }),

  /**
   * Trigger an AI review for a pull request
   * Can be used to re-run review or run review on draft PRs
   */
  triggerAIReview: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Check if user has at least read access
      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const isOwner = repo.ownerId === ctx.user.id;
      const isAuthor = pr.authorId === ctx.user.id;
      const hasAccess = isOwner || isAuthor || 
        (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'read'));

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this pull request',
        });
      }

      // Trigger the review asynchronously
      triggerAsyncReview(pr.id);

      return { triggered: true, prId: pr.id, prNumber: pr.number };
    }),
});
