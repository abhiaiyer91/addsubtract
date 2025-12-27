import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  issueModel,
  issueCommentModel,
  issueLabelModel,
  labelModel,
  repoModel,
  collaboratorModel,
  activityHelpers,
  ISSUE_STATUSES,
} from '../../../db/models';
import { eventBus, extractMentions } from '../../../events';
import type { IssueStatus } from '../../../db/schema';

// Zod schema for issue status
const issueStatusSchema = z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']);

export const issuesRouter = router({
  /**
   * List issues for a repository (with author and labels)
   */
  list: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        state: z.enum(['open', 'closed']).optional(),
        status: issueStatusSchema.optional(),
        authorId: z.string().uuid().optional(),
        assigneeId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const issues = await issueModel.listByRepo(input.repoId, {
        state: input.state,
        status: input.status,
        authorId: input.authorId,
        assigneeId: input.assigneeId,
        limit: input.limit,
        offset: input.offset,
      });

      // Fetch authors and labels for each issue
      const issuesWithDetails = await Promise.all(
        issues.map(async (issue) => {
          const result = await issueModel.findWithAuthor(issue.id);
          const labels = await issueLabelModel.listByIssue(issue.id);
          return {
            ...issue,
            author: result?.author ?? null,
            labels,
          };
        })
      );

      return issuesWithDetails;
    }),

  /**
   * Get a single issue by number (with author, labels, assignee)
   */
  get: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        number: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      const issue = await issueModel.findByRepoAndNumber(input.repoId, input.number);

      if (!issue) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Issue not found',
        });
      }

      // Get author
      const authorResult = await issueModel.findWithAuthor(issue.id);
      const author = authorResult?.author ?? null;

      // Get labels
      const labels = await issueLabelModel.listByIssue(issue.id);

      // Get assignee if assigned
      let assignee: Awaited<ReturnType<typeof import('../../../db/models').userModel.findById>> | null = null;
      if (issue.assigneeId) {
        const { userModel } = await import('../../../db/models');
        assignee = await userModel.findById(issue.assigneeId) ?? null;
      }

      return {
        ...issue,
        author,
        labels,
        assignee,
      };
    }),

  /**
   * Get an issue by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const issue = await issueModel.findById(input.id);

      if (!issue) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Issue not found',
        });
      }

      return issue;
    }),

  /**
   * Get an issue with author details
   */
  getWithAuthor: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const result = await issueModel.findWithAuthor(input.id);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Issue not found',
        });
      }

      return result;
    }),

  /**
   * Create a new issue
   */
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        title: z.string().min(1, 'Title is required').max(256),
        body: z.string().optional(),
        labelIds: z.array(z.string().uuid()).optional(),
        assigneeId: z.string().uuid().optional(),
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

      const issue = await issueModel.create({
        repoId: input.repoId,
        title: input.title,
        body: input.body,
        authorId: ctx.user.id,
        state: 'open',
        assigneeId: input.assigneeId,
      });

      // Add labels if provided
      if (input.labelIds && input.labelIds.length > 0) {
        await issueLabelModel.setLabels(issue.id, input.labelIds);
      }

      // Log activity
      await activityHelpers.logIssueOpened(ctx.user.id, input.repoId, issue.number, issue.title);

      // Emit issue.created event
      const repoFullName = `${ctx.user.username || ctx.user.name}/${repo.name}`;
      await eventBus.emit('issue.created', ctx.user.id, {
        issueId: issue.id,
        issueNumber: issue.number,
        issueTitle: issue.title,
        repoId: input.repoId,
        repoFullName,
      });

      // If assigned, emit issue.assigned event
      if (input.assigneeId) {
        await eventBus.emit('issue.assigned', ctx.user.id, {
          issueId: issue.id,
          issueNumber: issue.number,
          issueTitle: issue.title,
          repoId: input.repoId,
          repoFullName,
          assigneeId: input.assigneeId,
        });
      }

      return issue;
    }),

  /**
   * Update an issue
   */
  update: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        title: z.string().min(1).max(256).optional(),
        body: z.string().optional(),
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

      // Only author or repo admin can update
      const isAuthor = issue.authorId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'admin');

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      const updates: Record<string, string | undefined> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.body !== undefined) updates.body = input.body;

      return issueModel.update(input.issueId, updates);
    }),

  /**
   * Close an issue
   */
  close: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
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

      // Only author or write permission can close
      const isAuthor = issue.authorId === ctx.user.id;
      const canWrite = await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write');
      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;

      if (!isAuthor && !canWrite && !isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to close this issue',
        });
      }

      const closedIssue = await issueModel.close(input.issueId, ctx.user.id);

      // Log activity
      if (closedIssue && repo) {
        await activityHelpers.logIssueClosed(ctx.user.id, issue.repoId, issue.number, issue.title);

        // Emit issue.closed event
        await eventBus.emit('issue.closed', ctx.user.id, {
          issueId: issue.id,
          issueNumber: issue.number,
          issueTitle: issue.title,
          repoId: issue.repoId,
          repoFullName: `${ctx.user.username || ctx.user.name}/${repo.name}`,
          authorId: issue.authorId,
        });
      }

      return closedIssue;
    }),

  /**
   * Reopen an issue
   */
  reopen: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
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

      if (issue.state !== 'closed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Issue is not closed',
        });
      }

      // Only author or write permission can reopen
      const isAuthor = issue.authorId === ctx.user.id;
      const canWrite = await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write');
      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;

      if (!isAuthor && !canWrite && !isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to reopen this issue',
        });
      }

      return issueModel.reopen(input.issueId);
    }),

  /**
   * Assign a user to an issue
   */
  assign: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        assigneeId: z.string().uuid(),
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

      // Check write permission
      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to assign this issue',
        });
      }

      const assignedIssue = await issueModel.assign(input.issueId, input.assigneeId);

      // Emit issue.assigned event
      if (assignedIssue && repo) {
        await eventBus.emit('issue.assigned', ctx.user.id, {
          issueId: issue.id,
          issueNumber: issue.number,
          issueTitle: issue.title,
          repoId: issue.repoId,
          repoFullName: `${ctx.user.username || ctx.user.name}/${repo.name}`,
          assigneeId: input.assigneeId,
        });
      }

      return assignedIssue;
    }),

  /**
   * Unassign an issue
   */
  unassign: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
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

      // Check write permission
      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to unassign this issue',
        });
      }

      return issueModel.unassign(input.issueId);
    }),

  /**
   * Add a comment to an issue
   */
  addComment: protectedProcedure
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

      const comment = await issueCommentModel.create({
        issueId: input.issueId,
        userId: ctx.user.id,
        body: input.body,
      });

      // Emit issue.commented event
      const repo = await repoModel.findById(issue.repoId);
      if (repo) {
        const mentionedUsernames = extractMentions(input.body);

        await eventBus.emit('issue.commented', ctx.user.id, {
          issueId: issue.id,
          issueNumber: issue.number,
          issueTitle: issue.title,
          repoId: issue.repoId,
          repoFullName: `${ctx.user.username || ctx.user.name}/${repo.name}`,
          authorId: issue.authorId,
          commentId: comment.id,
          commentBody: input.body,
          mentionedUserIds: [], // TODO: resolve usernames to IDs
        });
      }

      return comment;
    }),

  /**
   * List comments for an issue
   */
  comments: publicProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return issueCommentModel.listByIssue(input.issueId);
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
      const comment = await issueCommentModel.findById(input.commentId);

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

      return issueCommentModel.update(input.commentId, input.body);
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
      const comment = await issueCommentModel.findById(input.commentId);

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

      return issueCommentModel.delete(input.commentId);
    }),

  /**
   * Get labels for an issue
   */
  labels: publicProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return issueLabelModel.listByIssue(input.issueId);
    }),

  /**
   * Add a label to an issue
   */
  addLabel: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        labelId: z.string().uuid(),
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

      // Check write permission
      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to add labels',
        });
      }

      await issueLabelModel.add(input.issueId, input.labelId);
      return { success: true };
    }),

  /**
   * Remove a label from an issue
   */
  removeLabel: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        labelId: z.string().uuid(),
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

      // Check write permission
      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to remove labels',
        });
      }

      return issueLabelModel.remove(input.issueId, input.labelId);
    }),

  /**
   * List issues by author
   */
  listByAuthor: publicProcedure
    .input(
      z.object({
        authorId: z.string().uuid(),
        state: z.enum(['open', 'closed']).optional(),
      })
    )
    .query(async ({ input }) => {
      return issueModel.listByAuthor(input.authorId, input.state);
    }),

  /**
   * List issues assigned to a user
   */
  listByAssignee: publicProcedure
    .input(
      z.object({
        assigneeId: z.string().uuid(),
        state: z.enum(['open', 'closed']).optional(),
      })
    )
    .query(async ({ input }) => {
      return issueModel.listByAssignee(input.assigneeId, input.state);
    }),

  /**
   * List labels for a repository
   */
  listLabels: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return labelModel.listByRepo(input.repoId);
    }),

  /**
   * Create a label
   */
  createLabel: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string().min(1, 'Label name is required').max(50),
        color: z.string().regex(/^[0-9a-fA-F]{6}$/, 'Invalid hex color'),
        description: z.string().max(200).optional(),
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
          message: 'You do not have permission to create labels',
        });
      }

      // Check if label already exists
      const existing = await labelModel.findByName(input.repoId, input.name);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Label already exists',
        });
      }

      return labelModel.create({
        repoId: input.repoId,
        name: input.name,
        color: input.color,
        description: input.description,
      });
    }),

  /**
   * Update a label
   */
  updateLabel: protectedProcedure
    .input(
      z.object({
        labelId: z.string().uuid(),
        name: z.string().min(1).max(50).optional(),
        color: z.string().regex(/^[0-9a-fA-F]{6}$/).optional(),
        description: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const label = await labelModel.findById(input.labelId);

      if (!label) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Label not found',
        });
      }

      const repo = await repoModel.findById(label.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(label.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update labels',
        });
      }

      const updates: Record<string, string | undefined> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.color !== undefined) updates.color = input.color;
      if (input.description !== undefined) updates.description = input.description;

      return labelModel.update(input.labelId, updates);
    }),

  /**
   * Delete a label
   */
  deleteLabel: protectedProcedure
    .input(
      z.object({
        labelId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const label = await labelModel.findById(input.labelId);

      if (!label) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Label not found',
        });
      }

      const repo = await repoModel.findById(label.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(label.repoId, ctx.user.id, 'admin');

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete labels',
        });
      }

      return labelModel.delete(input.labelId);
    }),

  /**
   * List issues grouped by status (for Kanban board)
   * Optimized to use only 2 queries: one for issues+authors, one for labels
   */
  listGroupedByStatus: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        state: z.enum(['open', 'closed']).optional(),
        authorId: z.string().uuid().optional(),
        assigneeId: z.string().uuid().optional(),
      })
    )
    .query(async ({ input }) => {
      // Single query to get all issues with authors (using JOIN)
      const issuesWithAuthors = await issueModel.listByRepoWithAuthors(input.repoId, {
        state: input.state,
        authorId: input.authorId,
        assigneeId: input.assigneeId,
        limit: 500,
      });

      // Collect issue IDs for batch label fetch
      const issueIds = issuesWithAuthors.map(i => i.id);
      
      // Single query to get all labels for all issues
      const labelsMap = await issueLabelModel.listByIssuesBatch(issueIds);

      // Build result grouped by status
      const result: Record<string, Array<{
        id: string;
        number: number;
        title: string;
        state: string;
        status: string;
        createdAt: Date;
        author: { username?: string | null; avatarUrl?: string | null } | null;
        labels: Array<{ id: string; name: string; color: string }>;
        assignee?: { username?: string | null; avatarUrl?: string | null } | null;
      }>> = {
        backlog: [],
        todo: [],
        in_progress: [],
        in_review: [],
        done: [],
        canceled: [],
      };

      for (const issue of issuesWithAuthors) {
        // Determine status (handle null/undefined for existing issues)
        let status = issue.status || 'backlog';
        
        // If issue is closed but has no status or backlog status, move to 'done'
        if (issue.state === 'closed' && (!issue.status || issue.status === 'backlog')) {
          status = 'done';
        }

        const labels = labelsMap.get(issue.id) ?? [];

        result[status].push({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          state: issue.state,
          status,
          createdAt: issue.createdAt,
          author: issue.author ? { 
            username: issue.author.username, 
            avatarUrl: issue.author.avatarUrl 
          } : null,
          labels,
          assignee: null, // Skip assignee for now to keep it fast
        });
      }

      return result;
    }),

  /**
   * Update issue status (for Kanban board drag-and-drop)
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        status: issueStatusSchema,
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

      // Check write permission
      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));
      const isAuthor = issue.authorId === ctx.user.id;

      if (!canWrite && !isAuthor) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      const updatedIssue = await issueModel.updateStatus(input.issueId, input.status);

      // If status changed to done/canceled (closed), emit event
      if (updatedIssue && repo && (input.status === 'done' || input.status === 'canceled')) {
        await eventBus.emit('issue.closed', ctx.user.id, {
          issueId: issue.id,
          issueNumber: issue.number,
          issueTitle: issue.title,
          repoId: issue.repoId,
          repoFullName: `${ctx.user.username || ctx.user.name}/${repo.name}`,
          authorId: issue.authorId,
        });
      }

      return updatedIssue;
    }),

  /**
   * Get available issue statuses
   */
  statuses: publicProcedure.query(() => {
    return ISSUE_STATUSES;
  }),
});
