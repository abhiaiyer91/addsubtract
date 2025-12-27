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
  ISSUE_PRIORITIES,
} from '../../../db/models';
import { issueRelationModel } from '../../../db/models/issue-relations';
import { issueActivityModel } from '../../../db/models/issue-activity';
import { issueTemplateModel } from '../../../db/models/issue-template';
import { issueViewModel, type ViewFilters, type ViewDisplayOptions } from '../../../db/models/issue-view';
import { eventBus, extractMentions } from '../../../events';
import type { IssueStatus, IssuePriority, IssueRelationType } from '../../../db/schema';

// Zod schemas for issue enums
const issueStatusSchema = z.enum(['triage', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']);
const issuePrioritySchema = z.enum(['none', 'low', 'medium', 'high', 'urgent']);
const issueRelationTypeSchema = z.enum(['blocks', 'blocked_by', 'relates_to', 'duplicates', 'duplicated_by']);

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
        priority: issuePrioritySchema.optional(),
        status: issueStatusSchema.optional(),
        dueDate: z.string().datetime().optional(),
        estimate: z.number().int().min(0).optional(),
        parentId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        cycleId: z.string().uuid().optional(),
        templateId: z.string().uuid().optional(),
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

      // Apply template if provided
      let issueData: any = {
        repoId: input.repoId,
        title: input.title,
        body: input.body,
        authorId: ctx.user.id,
        state: 'open',
        assigneeId: input.assigneeId,
        priority: input.priority,
        status: input.status,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        estimate: input.estimate,
        parentId: input.parentId,
        projectId: input.projectId,
        cycleId: input.cycleId,
      };

      if (input.templateId) {
        const template = await issueTemplateModel.findById(input.templateId);
        if (template) {
          issueData = issueTemplateModel.applyTemplate(template, issueData);
        }
      }

      const issue = await issueModel.create(issueData);

      // Log activity
      await issueActivityModel.logCreated(issue.id, ctx.user.id);

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

  /**
   * Get available issue priorities
   */
  priorities: publicProcedure.query(() => {
    return ISSUE_PRIORITIES;
  }),

  // ============ PRIORITY ENDPOINTS ============

  /**
   * Update issue priority
   */
  updatePriority: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        priority: issuePrioritySchema,
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

      const oldPriority = issue.priority;
      const updatedIssue = await issueModel.updatePriority(input.issueId, input.priority);

      // Log activity
      if (updatedIssue && oldPriority !== input.priority) {
        await issueActivityModel.logPriorityChanged(
          input.issueId,
          ctx.user.id,
          oldPriority,
          input.priority
        );
      }

      return updatedIssue;
    }),

  /**
   * List issues by priority
   */
  listByPriority: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        priority: issuePrioritySchema,
        state: z.enum(['open', 'closed']).optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      return issueModel.listByPriority(input.repoId, input.priority, {
        state: input.state,
        limit: input.limit,
      });
    }),

  // ============ DUE DATE ENDPOINTS ============

  /**
   * Set due date for an issue
   */
  setDueDate: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        dueDate: z.string().datetime(),
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

      const dueDate = new Date(input.dueDate);
      const updatedIssue = await issueModel.setDueDate(input.issueId, dueDate);

      // Log activity
      if (updatedIssue) {
        await issueActivityModel.logDueDateSet(input.issueId, ctx.user.id, dueDate);
      }

      return updatedIssue;
    }),

  /**
   * Clear due date from an issue
   */
  clearDueDate: protectedProcedure
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

      const previousDueDate = issue.dueDate;
      const updatedIssue = await issueModel.clearDueDate(input.issueId);

      // Log activity
      if (updatedIssue && previousDueDate) {
        await issueActivityModel.logDueDateCleared(input.issueId, ctx.user.id, previousDueDate);
      }

      return updatedIssue;
    }),

  /**
   * List overdue issues
   */
  listOverdue: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      return issueModel.listOverdue(input.repoId, input.limit);
    }),

  /**
   * List issues due soon
   */
  listDueSoon: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        days: z.number().min(1).max(30).default(7),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      return issueModel.listDueSoon(input.repoId, input.days, input.limit);
    }),

  // ============ ESTIMATE ENDPOINTS ============

  /**
   * Set estimate for an issue
   */
  setEstimate: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        estimate: z.number().int().min(0),
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

      const oldEstimate = issue.estimate;
      const updatedIssue = await issueModel.setEstimate(input.issueId, input.estimate);

      // Log activity
      if (updatedIssue) {
        await issueActivityModel.logEstimateChanged(
          input.issueId,
          ctx.user.id,
          oldEstimate,
          input.estimate
        );
      }

      return updatedIssue;
    }),

  /**
   * Clear estimate from an issue
   */
  clearEstimate: protectedProcedure
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

      const oldEstimate = issue.estimate;
      const updatedIssue = await issueModel.clearEstimate(input.issueId);

      if (updatedIssue && oldEstimate !== null) {
        await issueActivityModel.logEstimateChanged(
          input.issueId,
          ctx.user.id,
          oldEstimate,
          null
        );
      }

      return updatedIssue;
    }),

  /**
   * Get total estimate for filtered issues
   */
  getTotalEstimate: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        state: z.enum(['open', 'closed']).optional(),
        status: issueStatusSchema.optional(),
        assigneeId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        cycleId: z.string().uuid().optional(),
      })
    )
    .query(async ({ input }) => {
      return issueModel.getTotalEstimate(input.repoId, {
        state: input.state,
        status: input.status,
        assigneeId: input.assigneeId,
        projectId: input.projectId,
        cycleId: input.cycleId,
      });
    }),

  // ============ PARENT/SUB-ISSUE ENDPOINTS ============

  /**
   * Set parent issue (make this a sub-issue)
   */
  setParent: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        parentId: z.string().uuid(),
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

      const parent = await issueModel.findById(input.parentId);
      if (!parent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Parent issue not found',
        });
      }

      // Ensure both issues are in the same repo
      if (issue.repoId !== parent.repoId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Parent and child issues must be in the same repository',
        });
      }

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      try {
        const updatedIssue = await issueModel.setParent(input.issueId, input.parentId);

        if (updatedIssue) {
          await issueActivityModel.logParentSet(
            input.issueId,
            ctx.user.id,
            input.parentId,
            parent.number
          );
        }

        return updatedIssue;
      } catch (error: any) {
        if (error.message?.includes('circular')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot create circular parent-child relationship',
          });
        }
        throw error;
      }
    }),

  /**
   * Remove parent (make this a top-level issue)
   */
  removeParent: protectedProcedure
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

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      const previousParentId = issue.parentId;
      let previousParentNumber: number | undefined;

      if (previousParentId) {
        const previousParent = await issueModel.findById(previousParentId);
        previousParentNumber = previousParent?.number;
      }

      const updatedIssue = await issueModel.removeParent(input.issueId);

      if (updatedIssue && previousParentId) {
        await issueActivityModel.logParentRemoved(
          input.issueId,
          ctx.user.id,
          previousParentId,
          previousParentNumber
        );
      }

      return updatedIssue;
    }),

  /**
   * Get sub-issues of a parent
   */
  getSubIssues: publicProcedure
    .input(
      z.object({
        parentId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return issueModel.getSubIssues(input.parentId);
    }),

  /**
   * Get sub-issue progress
   */
  getSubIssueProgress: publicProcedure
    .input(
      z.object({
        parentId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return issueModel.getSubIssueProgress(input.parentId);
    }),

  /**
   * Create a sub-issue
   */
  createSubIssue: protectedProcedure
    .input(
      z.object({
        parentId: z.string().uuid(),
        title: z.string().min(1, 'Title is required').max(256),
        body: z.string().optional(),
        priority: issuePrioritySchema.optional(),
        assigneeId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const parent = await issueModel.findById(input.parentId);

      if (!parent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Parent issue not found',
        });
      }

      const repo = await repoModel.findById(parent.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Inherit some properties from parent
      const subIssue = await issueModel.create({
        repoId: parent.repoId,
        title: input.title,
        body: input.body,
        authorId: ctx.user.id,
        state: 'open',
        priority: input.priority || parent.priority,
        assigneeId: input.assigneeId,
        parentId: input.parentId,
        projectId: parent.projectId, // Inherit project
        cycleId: parent.cycleId, // Inherit cycle
      });

      // Log activities
      await issueActivityModel.logCreated(subIssue.id, ctx.user.id);
      await issueActivityModel.logParentSet(subIssue.id, ctx.user.id, input.parentId, parent.number);

      return subIssue;
    }),

  // ============ ISSUE RELATIONS ENDPOINTS ============

  /**
   * Add a relation between issues
   */
  addRelation: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        relatedIssueId: z.string().uuid(),
        type: issueRelationTypeSchema,
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

      const relatedIssue = await issueModel.findById(input.relatedIssueId);
      if (!relatedIssue) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Related issue not found',
        });
      }

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      try {
        const relation = await issueRelationModel.addRelation(
          input.issueId,
          input.relatedIssueId,
          input.type,
          ctx.user.id
        );

        // Log activity
        await issueActivityModel.logRelationAdded(
          input.issueId,
          ctx.user.id,
          input.type,
          input.relatedIssueId,
          relatedIssue.number
        );

        return relation;
      } catch (error: any) {
        if (error.message?.includes('self')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot create relation to self',
          });
        }
        throw error;
      }
    }),

  /**
   * Remove a relation between issues
   */
  removeRelation: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        relatedIssueId: z.string().uuid(),
        type: issueRelationTypeSchema,
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

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      const relatedIssue = await issueModel.findById(input.relatedIssueId);
      const removed = await issueRelationModel.removeRelation(
        input.issueId,
        input.relatedIssueId,
        input.type
      );

      if (removed) {
        await issueActivityModel.logRelationRemoved(
          input.issueId,
          ctx.user.id,
          input.type,
          input.relatedIssueId,
          relatedIssue?.number
        );
      }

      return { success: removed };
    }),

  /**
   * Get all relations for an issue
   */
  getRelations: publicProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return issueRelationModel.getRelations(input.issueId);
    }),

  /**
   * Check if an issue is blocked
   */
  isBlocked: publicProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return issueRelationModel.isBlocked(input.issueId);
    }),

  /**
   * Mark an issue as duplicate
   */
  markAsDuplicate: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        canonicalIssueId: z.string().uuid(),
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

      const canonical = await issueModel.findById(input.canonicalIssueId);
      if (!canonical) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Canonical issue not found',
        });
      }

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      const relation = await issueRelationModel.markAsDuplicate(
        input.issueId,
        input.canonicalIssueId,
        ctx.user.id
      );

      await issueActivityModel.logRelationAdded(
        input.issueId,
        ctx.user.id,
        'duplicates',
        input.canonicalIssueId,
        canonical.number
      );

      return relation;
    }),

  // ============ ACTIVITY LOG ENDPOINTS ============

  /**
   * Get activity log for an issue
   */
  getActivity: publicProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return issueActivityModel.listByIssue(input.issueId, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get activity log for a repository
   */
  getRepoActivity: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return issueActivityModel.listByRepo(input.repoId, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  // ============ TRIAGE ENDPOINTS ============

  /**
   * List issues in triage
   */
  listTriage: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      return issueModel.listTriage(input.repoId, input.limit);
    }),

  /**
   * Accept triage item (move to backlog or specified status)
   */
  acceptTriage: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        targetStatus: issueStatusSchema.default('backlog'),
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

      if (issue.status !== 'triage') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Issue is not in triage',
        });
      }

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to triage issues',
        });
      }

      const updatedIssue = await issueModel.acceptTriage(input.issueId, input.targetStatus);

      if (updatedIssue) {
        await issueActivityModel.logStatusChanged(
          input.issueId,
          ctx.user.id,
          'triage',
          input.targetStatus
        );
      }

      return updatedIssue;
    }),

  /**
   * Reject triage item (close as canceled)
   */
  rejectTriage: protectedProcedure
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

      if (issue.status !== 'triage') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Issue is not in triage',
        });
      }

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to triage issues',
        });
      }

      const updatedIssue = await issueModel.rejectTriage(input.issueId, ctx.user.id);

      if (updatedIssue) {
        await issueActivityModel.logStatusChanged(input.issueId, ctx.user.id, 'triage', 'canceled');
        await issueActivityModel.logClosed(input.issueId, ctx.user.id);
      }

      return updatedIssue;
    }),

  // ============ TEMPLATE ENDPOINTS ============

  /**
   * List templates for a repository
   */
  listTemplates: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return issueTemplateModel.listByRepo(input.repoId);
    }),

  /**
   * Get a template by ID
   */
  getTemplate: publicProcedure
    .input(
      z.object({
        templateId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const template = await issueTemplateModel.findById(input.templateId);
      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }
      return template;
    }),

  /**
   * Create a template
   */
  createTemplate: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string().min(1, 'Name is required').max(100),
        description: z.string().max(500).optional(),
        titleTemplate: z.string().max(256).optional(),
        bodyTemplate: z.string().optional(),
        defaultLabels: z.array(z.string().uuid()).optional(),
        defaultAssigneeId: z.string().uuid().optional(),
        defaultPriority: issuePrioritySchema.optional(),
        defaultStatus: issueStatusSchema.optional(),
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
          message: 'You do not have permission to create templates',
        });
      }

      return issueTemplateModel.create({
        repoId: input.repoId,
        name: input.name,
        description: input.description,
        titleTemplate: input.titleTemplate,
        bodyTemplate: input.bodyTemplate,
        defaultLabels: input.defaultLabels ? JSON.stringify(input.defaultLabels) : undefined,
        defaultAssigneeId: input.defaultAssigneeId,
        defaultPriority: input.defaultPriority,
        defaultStatus: input.defaultStatus,
      });
    }),

  /**
   * Update a template
   */
  updateTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        titleTemplate: z.string().max(256).optional(),
        bodyTemplate: z.string().optional(),
        defaultLabels: z.array(z.string().uuid()).optional(),
        defaultAssigneeId: z.string().uuid().nullable().optional(),
        defaultPriority: issuePrioritySchema.optional(),
        defaultStatus: issueStatusSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const template = await issueTemplateModel.findById(input.templateId);

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      const repo = await repoModel.findById(template.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(template.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update templates',
        });
      }

      const updates: any = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.titleTemplate !== undefined) updates.titleTemplate = input.titleTemplate;
      if (input.bodyTemplate !== undefined) updates.bodyTemplate = input.bodyTemplate;
      if (input.defaultLabels !== undefined) updates.defaultLabels = JSON.stringify(input.defaultLabels);
      if (input.defaultAssigneeId !== undefined) updates.defaultAssigneeId = input.defaultAssigneeId;
      if (input.defaultPriority !== undefined) updates.defaultPriority = input.defaultPriority;
      if (input.defaultStatus !== undefined) updates.defaultStatus = input.defaultStatus;

      return issueTemplateModel.update(input.templateId, updates);
    }),

  /**
   * Delete a template
   */
  deleteTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const template = await issueTemplateModel.findById(input.templateId);

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      const repo = await repoModel.findById(template.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(template.repoId, ctx.user.id, 'admin');

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete templates',
        });
      }

      return issueTemplateModel.delete(input.templateId);
    }),

  // ============ VIEW ENDPOINTS ============

  /**
   * List views for a repository
   */
  listViews: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return issueViewModel.listByRepo(input.repoId, input.userId);
    }),

  /**
   * Get a view by ID
   */
  getView: publicProcedure
    .input(
      z.object({
        viewId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const view = await issueViewModel.findById(input.viewId);
      if (!view) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'View not found',
        });
      }
      return {
        ...view,
        filters: issueViewModel.parseFilters(view),
        displayOptions: issueViewModel.parseDisplayOptions(view),
      };
    }),

  /**
   * Create a view
   */
  createView: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string().min(1, 'Name is required').max(100),
        description: z.string().max(500).optional(),
        filters: z.object({
          state: z.enum(['open', 'closed', 'all']).optional(),
          status: z.array(z.string()).optional(),
          priority: z.array(z.string()).optional(),
          assigneeId: z.string().optional(),
          authorId: z.string().optional(),
          projectId: z.string().optional(),
          cycleId: z.string().optional(),
          labels: z.array(z.string()).optional(),
          hasParent: z.boolean().optional(),
          hasDueDate: z.boolean().optional(),
          isOverdue: z.boolean().optional(),
        }),
        displayOptions: z.object({
          viewType: z.enum(['list', 'board', 'timeline']).default('list'),
          groupBy: z.enum(['status', 'priority', 'assignee', 'project', 'cycle', 'none']).optional(),
          sortBy: z.enum(['created', 'updated', 'priority', 'dueDate']).optional(),
          sortOrder: z.enum(['asc', 'desc']).optional(),
          showSubIssues: z.boolean().optional(),
          showCompletedIssues: z.boolean().optional(),
        }).optional(),
        isShared: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return issueViewModel.create({
        repoId: input.repoId,
        creatorId: ctx.user.id,
        name: input.name,
        description: input.description,
        filters: issueViewModel.serializeFilters(input.filters),
        displayOptions: input.displayOptions 
          ? issueViewModel.serializeDisplayOptions(input.displayOptions)
          : undefined,
        isShared: input.isShared,
      });
    }),

  /**
   * Update a view
   */
  updateView: protectedProcedure
    .input(
      z.object({
        viewId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        filters: z.object({
          state: z.enum(['open', 'closed', 'all']).optional(),
          status: z.array(z.string()).optional(),
          priority: z.array(z.string()).optional(),
          assigneeId: z.string().optional(),
          authorId: z.string().optional(),
          projectId: z.string().optional(),
          cycleId: z.string().optional(),
          labels: z.array(z.string()).optional(),
          hasParent: z.boolean().optional(),
          hasDueDate: z.boolean().optional(),
          isOverdue: z.boolean().optional(),
        }).optional(),
        displayOptions: z.object({
          viewType: z.enum(['list', 'board', 'timeline']),
          groupBy: z.enum(['status', 'priority', 'assignee', 'project', 'cycle', 'none']).optional(),
          sortBy: z.enum(['created', 'updated', 'priority', 'dueDate']).optional(),
          sortOrder: z.enum(['asc', 'desc']).optional(),
          showSubIssues: z.boolean().optional(),
          showCompletedIssues: z.boolean().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const view = await issueViewModel.findById(input.viewId);

      if (!view) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'View not found',
        });
      }

      // Only creator can update
      if (view.creatorId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only update your own views',
        });
      }

      const updates: any = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.filters !== undefined) updates.filters = issueViewModel.serializeFilters(input.filters);
      if (input.displayOptions !== undefined) {
        updates.displayOptions = issueViewModel.serializeDisplayOptions(input.displayOptions);
      }

      return issueViewModel.update(input.viewId, updates);
    }),

  /**
   * Delete a view
   */
  deleteView: protectedProcedure
    .input(
      z.object({
        viewId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const view = await issueViewModel.findById(input.viewId);

      if (!view) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'View not found',
        });
      }

      // Only creator can delete
      if (view.creatorId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own views',
        });
      }

      return issueViewModel.delete(input.viewId);
    }),

  /**
   * Share/unshare a view
   */
  shareView: protectedProcedure
    .input(
      z.object({
        viewId: z.string().uuid(),
        isShared: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const view = await issueViewModel.findById(input.viewId);

      if (!view) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'View not found',
        });
      }

      if (view.creatorId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only share your own views',
        });
      }

      return input.isShared 
        ? issueViewModel.share(input.viewId)
        : issueViewModel.unshare(input.viewId);
    }),

  /**
   * Duplicate a view
   */
  duplicateView: protectedProcedure
    .input(
      z.object({
        viewId: z.string().uuid(),
        newName: z.string().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const view = await issueViewModel.findById(input.viewId);

      if (!view) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'View not found',
        });
      }

      return issueViewModel.duplicate(input.viewId, ctx.user.id, input.newName);
    }),

  // ============ PROJECT/CYCLE ASSIGNMENT ============

  /**
   * Assign issue to a project
   */
  assignToProject: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        projectId: z.string().uuid().nullable(),
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

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      const oldProjectId = issue.projectId;
      const updatedIssue = await issueModel.assignToProject(input.issueId, input.projectId);

      if (updatedIssue) {
        await issueActivityModel.logProjectChanged(
          input.issueId,
          ctx.user.id,
          oldProjectId,
          input.projectId
        );
      }

      return updatedIssue;
    }),

  /**
   * Assign issue to a cycle
   */
  assignToCycle: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        cycleId: z.string().uuid().nullable(),
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

      const repo = await repoModel.findById(issue.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(issue.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this issue',
        });
      }

      const oldCycleId = issue.cycleId;
      const updatedIssue = await issueModel.assignToCycle(input.issueId, input.cycleId);

      if (updatedIssue) {
        await issueActivityModel.logCycleChanged(
          input.issueId,
          ctx.user.id,
          oldCycleId,
          input.cycleId
        );
      }

      return updatedIssue;
    }),
});
