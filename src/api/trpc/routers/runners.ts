/**
 * Runners tRPC Router
 * 
 * API endpoints for CI runner management and job queue operations.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  runnerModel,
  registrationTokenModel,
  jobQueueModel,
  runnerJobHistoryModel,
  repoModel,
  collaboratorModel,
} from '../../../db/models';
import { getJobQueueService } from '../../../ci/runner/queue';
import type { 
  RunnerCapabilities, 
  JobExecutionResult,
  RunnerHeartbeat,
} from '../../../ci/runner/types';

// =============================================================================
// Input Schemas
// =============================================================================

const RunnerCapabilitiesSchema = z.object({
  os: z.enum(['linux', 'macos', 'windows']),
  arch: z.string(),
  cpuCores: z.number().optional(),
  memoryGB: z.number().optional(),
  diskGB: z.number().optional(),
  hasDocker: z.boolean().default(false),
  labels: z.array(z.string()).default([]),
});

const StepExecutionResultSchema = z.object({
  stepNumber: z.number(),
  stepName: z.string(),
  success: z.boolean(),
  exitCode: z.number(),
  outputs: z.record(z.string()),
  durationMs: z.number(),
  skipped: z.boolean().default(false),
});

const JobExecutionResultSchema = z.object({
  id: z.string().uuid(),
  jobRunId: z.string().uuid(),
  success: z.boolean(),
  conclusion: z.enum(['success', 'failure', 'cancelled', 'skipped']),
  steps: z.array(StepExecutionResultSchema),
  outputs: z.record(z.string()),
  durationMs: z.number(),
});

// =============================================================================
// Router
// =============================================================================

export const runnersRouter = router({
  // ===========================================================================
  // Runner Management (Admin)
  // ===========================================================================

  /**
   * List all runners
   */
  list: protectedProcedure
    .input(
      z.object({
        scopeType: z.enum(['global', 'organization', 'repository']).optional(),
        scopeId: z.string().uuid().optional(),
        status: z.enum(['offline', 'online', 'busy', 'draining']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const runners = await runnerModel.list({
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });

      return runners.map(runner => ({
        ...runner,
        labels: JSON.parse(runner.labels || '[]'),
        capabilities: runner.capabilities ? JSON.parse(runner.capabilities) : null,
      }));
    }),

  /**
   * Get a single runner by ID
   */
  get: protectedProcedure
    .input(
      z.object({
        runnerId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const runner = await runnerModel.findById(input.runnerId);

      if (!runner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Runner not found',
        });
      }

      return {
        ...runner,
        labels: JSON.parse(runner.labels || '[]'),
        capabilities: runner.capabilities ? JSON.parse(runner.capabilities) : null,
      };
    }),

  /**
   * Create a registration token for a new runner
   */
  createRegistrationToken: protectedProcedure
    .input(
      z.object({
        scopeType: z.enum(['global', 'organization', 'repository']).default('global'),
        scopeId: z.string().uuid().optional(),
        expiresInHours: z.number().min(1).max(168).default(24), // Max 1 week
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify permissions based on scope
      if (input.scopeType === 'repository' && input.scopeId) {
        const repo = await repoModel.findById(input.scopeId);
        if (!repo) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Repository not found',
          });
        }

        const isOwner = repo.ownerId === ctx.user.id;
        const isAdmin = await collaboratorModel.hasPermission(repo.id, ctx.user.id, 'admin');

        if (!isOwner && !isAdmin) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You must be an admin to create runner tokens for this repository',
          });
        }
      }

      // TODO: Add organization permission check

      const { token, rawToken } = await registrationTokenModel.create({
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        createdById: ctx.user.id,
        expiresInHours: input.expiresInHours,
      });

      return {
        token: rawToken,
        expiresAt: token.expiresAt,
      };
    }),

  /**
   * Register a new runner using a registration token
   */
  register: publicProcedure
    .input(
      z.object({
        registrationToken: z.string(),
        name: z.string().min(1).max(100),
        capabilities: RunnerCapabilitiesSchema,
        maxConcurrentJobs: z.number().min(1).max(10).default(1),
        workDir: z.string().optional(),
        acceptForkJobs: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      // Validate and consume registration token
      const regToken = await registrationTokenModel.consume(input.registrationToken);

      if (!regToken) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired registration token',
        });
      }

      // Create the runner
      const { runner, authToken } = await runnerModel.create({
        name: input.name,
        type: 'self_hosted',
        status: 'offline',
        scopeType: regToken.scopeType,
        scopeId: regToken.scopeId || undefined,
        maxConcurrentJobs: input.maxConcurrentJobs,
        os: input.capabilities.os,
        arch: input.capabilities.arch,
        labels: JSON.stringify(input.capabilities.labels || []),
        capabilities: JSON.stringify(input.capabilities),
        workDir: input.workDir,
        acceptForkJobs: input.acceptForkJobs,
      });

      // Link token to runner
      await registrationTokenModel.linkToRunner(regToken.id, runner.id);

      return {
        runnerId: runner.id,
        authToken,
        name: runner.name,
      };
    }),

  /**
   * Delete a runner
   */
  delete: protectedProcedure
    .input(
      z.object({
        runnerId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const runner = await runnerModel.findById(input.runnerId);

      if (!runner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Runner not found',
        });
      }

      // Check permissions
      if (runner.scopeType === 'repository' && runner.scopeId) {
        const repo = await repoModel.findById(runner.scopeId);
        if (repo) {
          const isOwner = repo.ownerId === ctx.user.id;
          const isAdmin = await collaboratorModel.hasPermission(repo.id, ctx.user.id, 'admin');

          if (!isOwner && !isAdmin) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You must be an admin to delete this runner',
            });
          }
        }
      }

      await runnerModel.delete(input.runnerId);

      return { success: true };
    }),

  /**
   * Update runner settings
   */
  update: protectedProcedure
    .input(
      z.object({
        runnerId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        maxConcurrentJobs: z.number().min(1).max(10).optional(),
        labels: z.array(z.string()).optional(),
        acceptForkJobs: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const runner = await runnerModel.findById(input.runnerId);

      if (!runner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Runner not found',
        });
      }

      // Check permissions
      if (runner.scopeType === 'repository' && runner.scopeId) {
        const repo = await repoModel.findById(runner.scopeId);
        if (repo) {
          const isOwner = repo.ownerId === ctx.user.id;
          const isAdmin = await collaboratorModel.hasPermission(repo.id, ctx.user.id, 'admin');

          if (!isOwner && !isAdmin) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You must be an admin to update this runner',
            });
          }
        }
      }

      const updated = await runnerModel.update(input.runnerId, {
        name: input.name,
        maxConcurrentJobs: input.maxConcurrentJobs,
        labels: input.labels ? JSON.stringify(input.labels) : undefined,
        acceptForkJobs: input.acceptForkJobs,
      });

      return updated;
    }),

  /**
   * Get runner statistics
   */
  getStats: protectedProcedure
    .input(
      z.object({
        scopeType: z.enum(['global', 'organization', 'repository']).optional(),
        scopeId: z.string().uuid().optional(),
      })
    )
    .query(async ({ input }) => {
      const [runnerStats, queueStats] = await Promise.all([
        runnerModel.getStats(input.scopeType, input.scopeId),
        jobQueueModel.getStats(input.scopeId),
      ]);

      return {
        runners: runnerStats,
        queue: queueStats,
      };
    }),

  /**
   * Get runner job history
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        runnerId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const runner = await runnerModel.findById(input.runnerId);

      if (!runner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Runner not found',
        });
      }

      const [history, stats] = await Promise.all([
        runnerJobHistoryModel.listByRunner(input.runnerId, input.limit),
        runnerJobHistoryModel.getRunnerStats(input.runnerId),
      ]);

      return {
        history,
        stats,
      };
    }),

  // ===========================================================================
  // Job Queue (Admin)
  // ===========================================================================

  /**
   * List queued jobs
   */
  listQueuedJobs: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid().optional(),
        status: z.enum(['queued', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return jobQueueModel.list({
        repoId: input.repoId,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Cancel a queued job
   */
  cancelJob: protectedProcedure
    .input(
      z.object({
        queueId: z.string().uuid(),
      })
    )
    .mutation(async ({ input }) => {
      const queueService = getJobQueueService();
      await queueService.cancelJob(input.queueId);
      return { success: true };
    }),

  // ===========================================================================
  // Runner API (Called by Runners)
  // ===========================================================================

  /**
   * Runner heartbeat
   */
  heartbeat: publicProcedure
    .input(
      z.object({
        runnerId: z.string().uuid(),
        authToken: z.string(),
        status: z.enum(['online', 'busy', 'draining']),
        activeJobs: z.array(z.string().uuid()),
        resources: z.object({
          cpuPercent: z.number().optional(),
          memoryPercent: z.number().optional(),
          diskPercent: z.number().optional(),
        }).optional(),
        version: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Verify runner auth
      const runner = await runnerModel.findByToken(input.authToken);

      if (!runner || runner.id !== input.runnerId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid runner credentials',
        });
      }

      // Update heartbeat
      await runnerModel.heartbeat(input.runnerId, {
        status: input.status,
        activeJobCount: input.activeJobs.length,
        version: input.version,
      });

      return { success: true };
    }),

  /**
   * Get next available job for a runner
   */
  getNextJob: publicProcedure
    .input(
      z.object({
        runnerId: z.string().uuid(),
        authToken: z.string(),
        labels: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      // Verify runner auth
      const runner = await runnerModel.findByToken(input.authToken);

      if (!runner || runner.id !== input.runnerId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid runner credentials',
        });
      }

      const queueService = getJobQueueService();
      const job = await queueService.getNextJob(input.runnerId);

      return {
        job: job || null,
        waitSeconds: job ? 0 : 5,
      };
    }),

  /**
   * Report job start
   */
  reportJobStart: publicProcedure
    .input(
      z.object({
        runnerId: z.string().uuid(),
        authToken: z.string(),
        queueId: z.string().uuid(),
      })
    )
    .mutation(async ({ input }) => {
      // Verify runner auth
      const runner = await runnerModel.findByToken(input.authToken);

      if (!runner || runner.id !== input.runnerId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid runner credentials',
        });
      }

      const queueService = getJobQueueService();
      await queueService.startJob(input.queueId);

      return { success: true };
    }),

  /**
   * Report job completion
   */
  reportJobComplete: publicProcedure
    .input(
      z.object({
        runnerId: z.string().uuid(),
        authToken: z.string(),
        result: JobExecutionResultSchema,
      })
    )
    .mutation(async ({ input }) => {
      // Verify runner auth
      const runner = await runnerModel.findByToken(input.authToken);

      if (!runner || runner.id !== input.runnerId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid runner credentials',
        });
      }

      const queueService = getJobQueueService();
      await queueService.completeJob(input.result.id, input.result as JobExecutionResult);

      return { success: true };
    }),

  /**
   * Stream log entry (for real-time log updates)
   */
  streamLog: publicProcedure
    .input(
      z.object({
        runnerId: z.string().uuid(),
        authToken: z.string(),
        jobRunId: z.string().uuid(),
        stepNumber: z.number().optional(),
        level: z.enum(['debug', 'info', 'warn', 'error', 'group', 'endgroup', 'command']),
        message: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Verify runner auth
      const runner = await runnerModel.findByToken(input.authToken);

      if (!runner || runner.id !== input.runnerId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid runner credentials',
        });
      }

      // TODO: Store log and/or broadcast via WebSocket
      // For now, just acknowledge receipt
      console.log(`[Runner ${runner.name}] ${input.level}: ${input.message}`);

      return { success: true };
    }),

  // ===========================================================================
  // Runner Availability for Repository
  // ===========================================================================

  /**
   * List runners available for a repository
   */
  listForRepo: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Get runners available for this repo
      // Check if owner is an organization
      const orgId = repoResult.repo.ownerType === 'organization' ? repoResult.repo.ownerId : undefined;
      const runners = await runnerModel.listForRepo(
        repoResult.repo.id,
        orgId
      );

      return runners.map(runner => ({
        id: runner.id,
        name: runner.name,
        status: runner.status,
        os: runner.os,
        arch: runner.arch,
        labels: JSON.parse(runner.labels || '[]'),
        activeJobCount: runner.activeJobCount,
        maxConcurrentJobs: runner.maxConcurrentJobs,
        lastOnline: runner.lastOnline,
      }));
    }),
});
