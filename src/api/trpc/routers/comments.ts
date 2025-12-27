import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  prCommentModel,
  issueCommentModel,
  prModel,
  issueModel,
} from '../../../db/models';

/**
 * Comments router - handles both PR and Issue comments
 * This provides a unified interface for comment operations
 */
export const commentsRouter = router({
  /**
   * Get a PR comment by ID
   */
  getPrComment: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const comment = await prCommentModel.findById(input.id);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      return comment;
    }),

  /**
   * Get an issue comment by ID
   */
  getIssueComment: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const comment = await issueCommentModel.findById(input.id);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      return comment;
    }),

  /**
   * Create a PR comment
   */
  createPrComment: protectedProcedure
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
   * Create an issue comment
   */
  createIssueComment: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        body: z.string().min(1, 'Comment body is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const issue = await issueModel.findById(input.issueId);

      if (!issue) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Issue not found',
        });
      }

      return issueCommentModel.create({
        issueId: input.issueId,
        userId: ctx.user.id,
        body: input.body,
      });
    }),

  /**
   * Update a PR comment
   */
  updatePrComment: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        body: z.string().min(1, 'Comment body is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await prCommentModel.findById(input.id);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only edit your own comments',
        });
      }

      return prCommentModel.update(input.id, input.body);
    }),

  /**
   * Update an issue comment
   */
  updateIssueComment: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        body: z.string().min(1, 'Comment body is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await issueCommentModel.findById(input.id);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only edit your own comments',
        });
      }

      return issueCommentModel.update(input.id, input.body);
    }),

  /**
   * Delete a PR comment
   */
  deletePrComment: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await prCommentModel.findById(input.id);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own comments',
        });
      }

      return prCommentModel.delete(input.id);
    }),

  /**
   * Delete an issue comment
   */
  deleteIssueComment: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await issueCommentModel.findById(input.id);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own comments',
        });
      }

      return issueCommentModel.delete(input.id);
    }),

  /**
   * List PR comments
   */
  listPrComments: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return prCommentModel.listByPr(input.prId);
    }),

  /**
   * List issue comments
   */
  listIssueComments: publicProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return issueCommentModel.listByIssue(input.issueId);
    }),

  /**
   * List inline comments for a file in a PR
   */
  listPrFileComments: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        path: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      if (input.path) {
        return prCommentModel.listByFile(input.prId, input.path);
      }
      // List all file comments (comments with path defined)
      return prCommentModel.listFileComments(input.prId);
    }),
});
