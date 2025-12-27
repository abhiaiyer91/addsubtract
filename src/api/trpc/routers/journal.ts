import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  journalPageModel,
  journalCommentModel,
  journalPageHistoryModel,
  repoModel,
  collaboratorModel,
  JOURNAL_PAGE_STATUSES,
} from '../../../db/models';
import type { JournalPageStatus } from '../../../db/schema';

// Zod schemas
const journalPageStatusSchema = z.enum(['draft', 'published', 'archived']);

export const journalRouter = router({
  // ============ PAGE OPERATIONS ============

  /**
   * List journal pages for a repository
   */
  list: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        parentId: z.string().uuid().nullable().optional(),
        status: journalPageStatusSchema.optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return journalPageModel.listByRepo(input.repoId, {
        parentId: input.parentId ?? undefined,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get page tree (hierarchical structure)
   */
  tree: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        status: journalPageStatusSchema.optional(),
      })
    )
    .query(async ({ input }) => {
      return journalPageModel.getTree(input.repoId, { status: input.status });
    }),

  /**
   * Get a page by ID
   */
  get: publicProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const page = await journalPageModel.getWithAuthor(input.pageId);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      return page;
    }),

  /**
   * Get a page by slug
   */
  getBySlug: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        slug: z.string(),
      })
    )
    .query(async ({ input }) => {
      const page = await journalPageModel.findByRepoAndSlug(input.repoId, input.slug);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      return page;
    }),

  /**
   * Create a new page
   */
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        title: z.string().min(1, 'Title is required').max(200),
        slug: z.string().max(100).optional(),
        content: z.string().optional(),
        icon: z.string().max(50).optional(),
        coverImage: z.string().url().optional(),
        parentId: z.string().uuid().optional(),
        status: journalPageStatusSchema.optional(),
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

      // Check write permission
      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to create pages in this repository',
        });
      }

      // Verify parent exists if provided
      if (input.parentId) {
        const parent = await journalPageModel.findById(input.parentId);
        if (!parent || parent.repoId !== input.repoId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Parent page not found or belongs to different repository',
          });
        }
      }

      return journalPageModel.create({
        repoId: input.repoId,
        title: input.title,
        slug: input.slug,
        content: input.content,
        icon: input.icon,
        coverImage: input.coverImage,
        parentId: input.parentId,
        status: input.status,
        authorId: ctx.user.id,
      });
    }),

  /**
   * Update a page
   */
  update: protectedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().optional(),
        icon: z.string().max(50).nullable().optional(),
        coverImage: z.string().url().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const page = await journalPageModel.findById(input.pageId);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this page',
        });
      }

      const updates: any = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.content !== undefined) updates.content = input.content;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.coverImage !== undefined) updates.coverImage = input.coverImage;

      return journalPageModel.update(input.pageId, updates, {
        createHistory: true,
        userId: ctx.user.id,
      });
    }),

  /**
   * Delete a page
   */
  delete: protectedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const page = await journalPageModel.findById(input.pageId);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'admin');

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this page',
        });
      }

      return journalPageModel.delete(input.pageId);
    }),

  /**
   * Move a page (change parent or reorder)
   */
  move: protectedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        newParentId: z.string().uuid().nullable(),
        newPosition: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const page = await journalPageModel.findById(input.pageId);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to move this page',
        });
      }

      try {
        return journalPageModel.move(input.pageId, input.newParentId, input.newPosition);
      } catch (error) {
        if (error instanceof Error && error.message.includes('descendant')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Reorder pages within a parent
   */
  reorder: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        parentId: z.string().uuid().nullable(),
        orderedIds: z.array(z.string().uuid()),
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

      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to reorder pages',
        });
      }

      await journalPageModel.reorder(input.repoId, input.parentId, input.orderedIds);
      return { success: true };
    }),

  /**
   * Publish a page
   */
  publish: protectedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const page = await journalPageModel.findById(input.pageId);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to publish this page',
        });
      }

      return journalPageModel.publish(input.pageId);
    }),

  /**
   * Unpublish a page (back to draft)
   */
  unpublish: protectedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const page = await journalPageModel.findById(input.pageId);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to unpublish this page',
        });
      }

      return journalPageModel.unpublish(input.pageId);
    }),

  /**
   * Archive a page
   */
  archive: protectedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const page = await journalPageModel.findById(input.pageId);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to archive this page',
        });
      }

      return journalPageModel.archive(input.pageId);
    }),

  /**
   * Search pages
   */
  search: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        query: z.string().min(1),
        status: journalPageStatusSchema.optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      return journalPageModel.search(input.repoId, input.query, {
        status: input.status,
        limit: input.limit,
      });
    }),

  /**
   * Get page count
   */
  count: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        status: journalPageStatusSchema.optional(),
      })
    )
    .query(async ({ input }) => {
      return journalPageModel.count(input.repoId, { status: input.status });
    }),

  /**
   * Get available statuses
   */
  statuses: publicProcedure.query(() => {
    return JOURNAL_PAGE_STATUSES;
  }),

  // ============ COMMENT OPERATIONS ============

  /**
   * List comments for a page
   */
  listComments: publicProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return journalCommentModel.listByPage(input.pageId);
    }),

  /**
   * Create a comment
   */
  createComment: protectedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        body: z.string().min(1, 'Comment body is required'),
        blockId: z.string().optional(),
        replyToId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const page = await journalPageModel.findById(input.pageId);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      // Anyone with read access can comment
      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const hasAccess = isOwner || 
        !repo?.isPrivate || 
        (await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'read'));

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to comment on this page',
        });
      }

      return journalCommentModel.create({
        pageId: input.pageId,
        userId: ctx.user.id,
        body: input.body,
        blockId: input.blockId,
        replyToId: input.replyToId,
      });
    }),

  /**
   * Update a comment
   */
  updateComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
        body: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await journalCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      // Only author can update
      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only edit your own comments',
        });
      }

      return journalCommentModel.update(input.commentId, { body: input.body });
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
      const comment = await journalCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      // Only author can delete
      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own comments',
        });
      }

      return journalCommentModel.delete(input.commentId);
    }),

  /**
   * Resolve a comment
   */
  resolveComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await journalCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      const page = await journalPageModel.findById(comment.pageId);
      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      // Author or page author can resolve
      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'write'));

      if (!canWrite && comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to resolve this comment',
        });
      }

      return journalCommentModel.resolve(input.commentId, ctx.user.id);
    }),

  /**
   * Unresolve a comment
   */
  unresolveComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await journalCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      const page = await journalPageModel.findById(comment.pageId);
      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to unresolve this comment',
        });
      }

      return journalCommentModel.unresolve(input.commentId);
    }),

  // ============ HISTORY OPERATIONS ============

  /**
   * List page history
   */
  listHistory: publicProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      return journalPageHistoryModel.listByPage(input.pageId, input.limit);
    }),

  /**
   * Get a specific version
   */
  getVersion: publicProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        version: z.number().min(1),
      })
    )
    .query(async ({ input }) => {
      const entry = await journalPageHistoryModel.getVersion(input.pageId, input.version);

      if (!entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Version not found',
        });
      }

      return entry;
    }),

  /**
   * Restore a page to a specific version
   */
  restoreVersion: protectedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        version: z.number().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const page = await journalPageModel.findById(input.pageId);

      if (!page) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Page not found',
        });
      }

      const repo = await repoModel.findById(page.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(page.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to restore this page',
        });
      }

      const restored = await journalPageHistoryModel.restoreVersion(
        input.pageId,
        input.version,
        ctx.user.id
      );

      if (!restored) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Version not found',
        });
      }

      return restored;
    }),
});
