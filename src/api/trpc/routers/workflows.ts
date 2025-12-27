/**
 * Workflows tRPC Router
 * 
 * API endpoints for CI/CD workflow management.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  workflowRunModel,
  jobRunModel,
  stepRunModel,
  getWorkflowRunWithDetails,
  repoModel,
  collaboratorModel,
} from '../../../db/models';
import { CIEngine, validateWorkflowFile } from '../../../ci';
import { createExecutor } from '../../../ci/executor';
import { resolveDiskPath } from '../../../server/storage/repos';

export const workflowsRouter = router({
  /**
   * List workflow runs for a repository
   */
  listRuns: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        branch: z.string().optional(),
        event: z.string().optional(),
        state: z.enum(['queued', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return workflowRunModel.listByRepo(input.repoId, {
        branch: input.branch,
        event: input.event,
        state: input.state,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get a single workflow run with all details (jobs, steps)
   */
  getRun: publicProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const run = await getWorkflowRunWithDetails(input.runId);

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow run not found',
        });
      }

      return run;
    }),

  /**
   * Get logs for a specific job
   */
  getJobLogs: publicProcedure
    .input(
      z.object({
        jobRunId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const job = await jobRunModel.findById(input.jobRunId);

      if (!job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Job run not found',
        });
      }

      // Get all steps for this job
      const steps = await stepRunModel.listByJobRun(input.jobRunId);

      return {
        job,
        steps,
        logs: job.logs || '',
      };
    }),

  /**
   * List available workflows for a repository
   */
  listWorkflows: publicProcedure
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

      const reposDir = process.env.REPOS_DIR || './repos';
      const repoDiskPath = repoResult.repo.diskPath;
      const absoluteDiskPath = path.isAbsolute(repoDiskPath)
        ? repoDiskPath
        : path.join(reposDir, repoDiskPath.replace(/^\/repos\//, ''));

      try {
        const engine = new CIEngine({ repoPath: absoluteDiskPath });
        const workflows = engine.load();

        return workflows.map((w) => ({
          name: w.workflow.name,
          filePath: w.filePath,
          triggers: Object.keys(w.workflow.on || {}),
          jobCount: Object.keys(w.workflow.jobs || {}).length,
        }));
      } catch {
        return [];
      }
    }),

  /**
   * Validate a workflow file
   */
  validateWorkflow: publicProcedure
    .input(
      z.object({
        content: z.string(),
      })
    )
    .query(async ({ input }) => {
      return validateWorkflowFile(input.content);
    }),

  /**
   * Trigger a workflow manually (workflow_dispatch)
   */
  trigger: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        workflowPath: z.string(),
        branch: z.string().default('main'),
        inputs: z.record(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = repoResult.repo.ownerId === ctx.user.id;
      const canWrite =
        isOwner ||
        (await collaboratorModel.hasPermission(repoResult.repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to trigger workflows',
        });
      }

      const reposDir = process.env.REPOS_DIR || './repos';
      const repoDiskPath = repoResult.repo.diskPath;
      const absoluteDiskPath = path.isAbsolute(repoDiskPath)
        ? repoDiskPath
        : path.join(reposDir, repoDiskPath.replace(/^\/repos\//, ''));

      // Load the specific workflow
      const engine = new CIEngine({ repoPath: absoluteDiskPath });
      engine.load();

      const workflow = engine.getWorkflows().find((w) => w.filePath === input.workflowPath);

      if (!workflow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow not found',
        });
      }

      // Check if workflow supports workflow_dispatch
      const triggers = workflow.workflow.on;
      const triggerObj = triggers as Record<string, unknown>;
      if (!('workflow_dispatch' in triggerObj)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This workflow does not support manual triggering',
        });
      }

      // Execute the workflow
      const executor = createExecutor(engine);
      const { runId, result } = await executor.execute(
        workflow.workflow,
        input.workflowPath,
        {
          repoId: repoResult.repo.id,
          repoDiskPath: absoluteDiskPath,
          commitSha: 'HEAD', // TODO: resolve actual HEAD commit
          branch: input.branch,
          event: 'workflow_dispatch',
          eventPayload: {
            inputs: input.inputs || {},
          },
          triggeredById: ctx.user.id,
          inputs: input.inputs,
        }
      );

      return {
        runId,
        success: result.success,
        duration: result.duration,
      };
    }),

  /**
   * Cancel a running workflow
   */
  cancel: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const run = await workflowRunModel.findById(input.runId);

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow run not found',
        });
      }

      // Check permission
      const repo = await repoModel.findById(run.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite =
        isOwner ||
        (await collaboratorModel.hasPermission(repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to cancel workflows',
        });
      }

      // Cancel the workflow
      const cancelled = await workflowRunModel.cancel(input.runId);

      if (!cancelled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Workflow cannot be cancelled (already completed)',
        });
      }

      return { success: true };
    }),

  /**
   * Re-run a failed workflow
   */
  rerun: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const run = await workflowRunModel.findById(input.runId);

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow run not found',
        });
      }

      // Check permission
      const repo = await repoModel.findById(run.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite =
        isOwner ||
        (await collaboratorModel.hasPermission(repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to re-run workflows',
        });
      }

      const absoluteDiskPath = resolveDiskPath(repo.diskPath);

      // Load the workflow
      const engine = new CIEngine({ repoPath: absoluteDiskPath });
      engine.load();

      const workflow = engine.getWorkflows().find((w) => w.filePath === run.workflowPath);

      if (!workflow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow file no longer exists',
        });
      }

      // Execute the workflow
      const executor = createExecutor(engine);
      const eventPayload = run.eventPayload ? JSON.parse(run.eventPayload) : {};

      const { runId, result } = await executor.execute(
        workflow.workflow,
        run.workflowPath,
        {
          repoId: repo.id,
          repoDiskPath: absoluteDiskPath,
          commitSha: run.commitSha,
          branch: run.branch || undefined,
          event: run.event,
          eventPayload,
          triggeredById: ctx.user.id,
        }
      );

      return {
        runId,
        success: result.success,
        duration: result.duration,
      };
    }),

  /**
   * Get workflow run counts by state
   */
  getRunCounts: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return workflowRunModel.countByState(input.repoId);
    }),

  /**
   * Get the latest run for each workflow in a repository
   */
  getLatestRuns: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        return [];
      }

      const reposDir = process.env.REPOS_DIR || './repos';
      const repoDiskPath = repoResult.repo.diskPath;
      const absoluteDiskPath = path.isAbsolute(repoDiskPath)
        ? repoDiskPath
        : path.join(reposDir, repoDiskPath.replace(/^\/repos\//, ''));

      try {
        const engine = new CIEngine({ repoPath: absoluteDiskPath });
        const workflows = engine.load();

        const latestRuns = await Promise.all(
          workflows.map(async (w) => {
            const latestRun = await workflowRunModel.getLatestRun(
              repoResult.repo.id,
              w.filePath
            );
            return {
              workflow: {
                name: w.workflow.name,
                filePath: w.filePath,
              },
              latestRun,
            };
          })
        );

        return latestRuns;
      } catch {
        return [];
      }
    }),
});
