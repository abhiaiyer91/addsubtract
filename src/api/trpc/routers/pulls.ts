import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  prModel,
  prReviewModel,
  prCommentModel,
  prLabelModel,
  repoModel,
  collaboratorModel,
  activityHelpers,
} from '../../../db/models';

export const pullsRouter = router({
  /**
   * List pull requests for a repository
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
      return prModel.listByRepo(input.repoId, {
        state: input.state,
        authorId: input.authorId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get a single pull request by number
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

      return pr;
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
   * Merge a pull request
   */
  merge: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        mergeSha: z.string().min(1, 'Merge SHA is required'),
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
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to merge this pull request',
        });
      }

      const mergedPr = await prModel.merge(input.prId, ctx.user.id, input.mergeSha);

      // Log activity
      if (mergedPr) {
        await activityHelpers.logPrMerged(ctx.user.id, pr.repoId, pr.number, pr.title);
      }

      return mergedPr;
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
});
