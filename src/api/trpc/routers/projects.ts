import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  projectModel,
  projectUpdateModel,
  repoModel,
  collaboratorModel,
  PROJECT_STATUSES,
  PROJECT_HEALTH,
} from '../../../db/models';
import type { ProjectStatus, ProjectHealth } from '../../../db/schema';

// Zod schemas
const projectStatusSchema = z.enum(['backlog', 'planned', 'in_progress', 'paused', 'completed', 'canceled']);
const projectHealthSchema = z.enum(['on_track', 'at_risk', 'off_track']);

export const projectsRouter = router({
  /**
   * List projects for a repository
   */
  list: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        status: projectStatusSchema.optional(),
        leadId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return projectModel.listByRepo(input.repoId, {
        status: input.status,
        leadId: input.leadId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get a project by ID
   */
  get: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const project = await projectModel.findById(input.projectId);

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      return project;
    }),

  /**
   * Get a project by name
   */
  getByName: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string(),
      })
    )
    .query(async ({ input }) => {
      const project = await projectModel.findByRepoAndName(input.repoId, input.name);

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      return project;
    }),

  /**
   * Create a new project
   */
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string().min(1, 'Name is required').max(100),
        description: z.string().max(1000).optional(),
        icon: z.string().max(50).optional(),
        color: z.string().regex(/^[0-9a-fA-F]{6}$/).optional(),
        status: projectStatusSchema.optional(),
        leadId: z.string().uuid().optional(),
        startDate: z.string().datetime().optional(),
        targetDate: z.string().datetime().optional(),
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
          message: 'You do not have permission to create projects',
        });
      }

      // Check for duplicate name
      const existing = await projectModel.findByRepoAndName(input.repoId, input.name);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A project with this name already exists',
        });
      }

      return projectModel.create({
        repoId: input.repoId,
        name: input.name,
        description: input.description,
        icon: input.icon,
        color: input.color,
        status: input.status,
        leadId: input.leadId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      });
    }),

  /**
   * Update a project
   */
  update: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(1000).optional(),
        icon: z.string().max(50).optional(),
        color: z.string().regex(/^[0-9a-fA-F]{6}$/).optional(),
        status: projectStatusSchema.optional(),
        startDate: z.string().datetime().nullable().optional(),
        targetDate: z.string().datetime().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await projectModel.findById(input.projectId);

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      const repo = await repoModel.findById(project.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(project.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this project',
        });
      }

      const updates: any = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.color !== undefined) updates.color = input.color;
      if (input.status !== undefined) updates.status = input.status;
      if (input.startDate !== undefined) {
        updates.startDate = input.startDate ? new Date(input.startDate) : null;
      }
      if (input.targetDate !== undefined) {
        updates.targetDate = input.targetDate ? new Date(input.targetDate) : null;
      }

      return projectModel.update(input.projectId, updates);
    }),

  /**
   * Delete a project
   */
  delete: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await projectModel.findById(input.projectId);

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      const repo = await repoModel.findById(project.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(project.repoId, ctx.user.id, 'admin');

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this project',
        });
      }

      return projectModel.delete(input.projectId);
    }),

  /**
   * Set project lead
   */
  setLead: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        leadId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await projectModel.findById(input.projectId);

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      const repo = await repoModel.findById(project.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(project.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this project',
        });
      }

      return projectModel.setLead(input.projectId, input.leadId);
    }),

  /**
   * Add a member to a project
   */
  addMember: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.string().default('member'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await projectModel.findById(input.projectId);

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      const repo = await repoModel.findById(project.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(project.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this project',
        });
      }

      return projectModel.addMember(input.projectId, input.userId, input.role);
    }),

  /**
   * Remove a member from a project
   */
  removeMember: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await projectModel.findById(input.projectId);

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      const repo = await repoModel.findById(project.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(project.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this project',
        });
      }

      return projectModel.removeMember(input.projectId, input.userId);
    }),

  /**
   * Get project members
   */
  getMembers: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return projectModel.getMembers(input.projectId);
    }),

  /**
   * Get project progress
   */
  getProgress: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return projectModel.getProgress(input.projectId);
    }),

  /**
   * Get issues in a project
   */
  getIssues: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        state: z.enum(['open', 'closed']).optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      return projectModel.getIssues(input.projectId, {
        state: input.state,
        limit: input.limit,
      });
    }),

  /**
   * Mark project as complete
   */
  complete: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await projectModel.findById(input.projectId);

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      const repo = await repoModel.findById(project.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(project.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this project',
        });
      }

      return projectModel.complete(input.projectId);
    }),

  /**
   * Get available project statuses
   */
  statuses: publicProcedure.query(() => {
    return PROJECT_STATUSES;
  }),

  /**
   * Get available project health values
   */
  healthValues: publicProcedure.query(() => {
    return PROJECT_HEALTH;
  }),

  // ============ PROJECT UPDATES ============

  /**
   * Create a project update
   */
  createUpdate: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        body: z.string().min(1, 'Update body is required'),
        health: projectHealthSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await projectModel.findById(input.projectId);

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      const repo = await repoModel.findById(project.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(project.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this project',
        });
      }

      return projectUpdateModel.create({
        projectId: input.projectId,
        authorId: ctx.user.id,
        body: input.body,
        health: input.health,
      });
    }),

  /**
   * Update a project update
   */
  updateUpdate: protectedProcedure
    .input(
      z.object({
        updateId: z.string().uuid(),
        body: z.string().min(1).optional(),
        health: projectHealthSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const update = await projectUpdateModel.findById(input.updateId);

      if (!update) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Update not found',
        });
      }

      // Only author can update
      if (update.authorId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only edit your own updates',
        });
      }

      const updates: any = {};
      if (input.body !== undefined) updates.body = input.body;
      if (input.health !== undefined) updates.health = input.health;

      return projectUpdateModel.update(input.updateId, updates);
    }),

  /**
   * Delete a project update
   */
  deleteUpdate: protectedProcedure
    .input(
      z.object({
        updateId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const update = await projectUpdateModel.findById(input.updateId);

      if (!update) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Update not found',
        });
      }

      // Only author can delete
      if (update.authorId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own updates',
        });
      }

      return projectUpdateModel.delete(input.updateId);
    }),

  /**
   * List updates for a project
   */
  listUpdates: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ input }) => {
      return projectUpdateModel.listByProject(input.projectId, input.limit);
    }),

  /**
   * Get latest update for a project
   */
  getLatestUpdate: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return projectUpdateModel.getLatest(input.projectId);
    }),
});
