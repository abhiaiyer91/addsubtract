/**
 * Planning Router
 * 
 * API endpoints for the multi-agent planning workflow.
 * Enables complex task planning with parallel subtask execution.
 */

import { z } from 'zod';
import * as path from 'path';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { router, protectedProcedure } from '../trpc';
import { repoModel, repoAiKeyModel } from '../../../db/models';
import { isAIAvailable, getAIInfo } from '../../../ai/mastra';
import { runMultiAgentPlanningWorkflow, streamMultiAgentPlanningWorkflow } from '../../../ai/mastra';
import type { 
  MultiAgentPlanningInput, 
  MultiAgentPlanningOutput,
  ExecutionPlan,
  GroupResult,
  ReviewResult,
} from '../../../ai/workflows/multi-agent-planning.workflow';

/**
 * Generate disk path for a repository
 */
function getRepoDiskPath(ownerUsername: string, repoName: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  return path.join(reposDir, ownerUsername, `${repoName}.git`);
}

/**
 * Planning workflow status types
 */
const PlanningStatusSchema = z.enum(['pending', 'planning', 'executing', 'reviewing', 'completed', 'failed']);
type PlanningStatus = z.infer<typeof PlanningStatusSchema>;

/**
 * Planning workflow run record (in-memory for now, could be persisted)
 */
interface PlanningRun {
  id: string;
  repoId: string;
  userId: string;
  task: string;
  status: PlanningStatus;
  plan?: ExecutionPlan;
  groupResults?: GroupResult[];
  review?: ReviewResult;
  output?: MultiAgentPlanningOutput;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

// In-memory store for planning runs (could be moved to database)
const planningRuns = new Map<string, PlanningRun>();

/**
 * Planning router for multi-agent task planning
 */
export const planningRouter = router({
  /**
   * Check if planning is available for a repository
   */
  status: protectedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input }) => {
      const info = getAIInfo();
      
      // Check for available API keys
      let hasKeys = false;
      let source: 'server' | 'repository' | null = null;
      
      // Check server keys first
      if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
        hasKeys = true;
        source = 'server';
      }
      
      // Check repo keys
      if (!hasKeys) {
        const repoKeys = await repoAiKeyModel.listKeys(input.repoId);
        if (repoKeys.length > 0) {
          hasKeys = true;
          source = 'repository';
        }
      }
      
      return {
        available: hasKeys,
        model: info.model,
        provider: info.provider,
        source,
        capabilities: {
          parallelExecution: true,
          iterativePlanning: true,
          maxIterations: 3,
          maxParallelTasks: 5,
        },
      };
    }),

  /**
   * Start a new planning workflow run
   */
  start: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      task: z.string().min(10).max(5000),
      context: z.string().max(10000).optional(),
      maxIterations: z.number().min(1).max(5).default(3),
      maxParallelTasks: z.number().min(1).max(10).default(5),
      dryRun: z.boolean().default(false),
      createBranch: z.boolean().default(true),
      branchName: z.string().optional(),
      autoCommit: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check AI availability
      if (!isAIAvailable()) {
        // Check repo-level keys
        const repoKey = await repoAiKeyModel.getAnyKey(input.repoId);
        if (!repoKey) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'AI is not configured. Add an API key in repository settings.',
          });
        }
        
        // Set the key temporarily
        if (repoKey.provider === 'anthropic') {
          process.env.ANTHROPIC_API_KEY = repoKey.key;
        } else {
          process.env.OPENAI_API_KEY = repoKey.key;
        }
      }

      // Get repository details
      const repo = await repoModel.findByIdWithOwner(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Get owner username
      const ownerInfo = repo.owner as { username?: string; name?: string };
      const ownerUsername = ownerInfo.username || ownerInfo.name || 'unknown';

      // Create run ID
      const runId = crypto.randomUUID();

      // Create run record
      const run: PlanningRun = {
        id: runId,
        repoId: input.repoId,
        userId: ctx.user.id,
        task: input.task,
        status: 'pending',
        startedAt: new Date(),
      };
      planningRuns.set(runId, run);

      // Build workflow input
      const workflowInput: MultiAgentPlanningInput = {
        repoId: input.repoId,
        repoPath: getRepoDiskPath(ownerUsername, repo.repo.name),
        owner: ownerUsername,
        repoName: repo.repo.name,
        userId: ctx.user.id,
        task: input.task,
        context: input.context,
        maxIterations: input.maxIterations,
        maxParallelTasks: input.maxParallelTasks,
        dryRun: input.dryRun,
        verbose: false,
        createBranch: input.createBranch,
        branchName: input.branchName,
        autoCommit: input.autoCommit,
      };

      // Start workflow asynchronously
      (async () => {
        try {
          run.status = 'planning';
          
          const result = await runMultiAgentPlanningWorkflow(workflowInput);
          
          run.status = result.success ? 'completed' : 'failed';
          run.plan = result.finalPlan;
          run.groupResults = result.groupResults;
          run.review = result.review;
          run.output = result;
          run.completedAt = new Date();
          
          if (!result.success) {
            run.error = result.error || result.summary;
          }
        } catch (error) {
          run.status = 'failed';
          run.error = error instanceof Error ? error.message : 'Unknown error';
          run.completedAt = new Date();
        }
      })();

      return {
        runId,
        status: 'pending' as PlanningStatus,
        message: 'Planning workflow started',
      };
    }),

  /**
   * Get the status of a planning run
   */
  getRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const run = planningRuns.get(input.runId);
      
      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning run not found',
        });
      }

      // Verify ownership
      if (run.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to view this run',
        });
      }

      return {
        id: run.id,
        repoId: run.repoId,
        task: run.task,
        status: run.status,
        plan: run.plan,
        groupResults: run.groupResults,
        review: run.review,
        error: run.error,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        duration: run.completedAt 
          ? run.completedAt.getTime() - run.startedAt.getTime()
          : Date.now() - run.startedAt.getTime(),
      };
    }),

  /**
   * List planning runs for a repository
   */
  listRuns: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input, ctx }) => {
      const runs: PlanningRun[] = [];
      
      for (const run of planningRuns.values()) {
        if (run.repoId === input.repoId && run.userId === ctx.user.id) {
          runs.push(run);
        }
      }

      // Sort by start time descending
      runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

      return runs.slice(0, input.limit).map(run => ({
        id: run.id,
        task: run.task,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        error: run.error,
      }));
    }),

  /**
   * Stream planning workflow execution (real-time updates)
   */
  stream: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      task: z.string().min(10).max(5000),
      context: z.string().max(10000).optional(),
      maxIterations: z.number().min(1).max(5).default(3),
      maxParallelTasks: z.number().min(1).max(10).default(5),
      dryRun: z.boolean().default(false),
      createBranch: z.boolean().default(true),
      branchName: z.string().optional(),
      autoCommit: z.boolean().default(true),
    }))
    .subscription(({ input, ctx }) => {
      return observable<{
        type: 'status' | 'plan' | 'group_start' | 'task_complete' | 'review' | 'done' | 'error';
        data: unknown;
      }>((emit) => {
        (async () => {
          try {
            // Check AI availability
            if (!isAIAvailable()) {
              const repoKey = await repoAiKeyModel.getAnyKey(input.repoId);
              if (!repoKey) {
                emit.next({ type: 'error', data: { message: 'AI is not configured' } });
                emit.complete();
                return;
              }
              
              if (repoKey.provider === 'anthropic') {
                process.env.ANTHROPIC_API_KEY = repoKey.key;
              } else {
                process.env.OPENAI_API_KEY = repoKey.key;
              }
            }

            // Get repository
            const repo = await repoModel.findByIdWithOwner(input.repoId);
            if (!repo) {
              emit.next({ type: 'error', data: { message: 'Repository not found' } });
              emit.complete();
              return;
            }

            const ownerInfo = repo.owner as { username?: string; name?: string };
            const ownerUsername = ownerInfo.username || ownerInfo.name || 'unknown';

            // Build workflow input
            const workflowInput: MultiAgentPlanningInput = {
              repoId: input.repoId,
              repoPath: getRepoDiskPath(ownerUsername, repo.repo.name),
              owner: ownerUsername,
              repoName: repo.repo.name,
              userId: ctx.user.id,
              task: input.task,
              context: input.context,
              maxIterations: input.maxIterations,
              maxParallelTasks: input.maxParallelTasks,
              dryRun: input.dryRun,
              verbose: true,
              createBranch: input.createBranch,
              branchName: input.branchName,
              autoCommit: input.autoCommit,
            };

            emit.next({ type: 'status', data: { status: 'starting', message: 'Starting planning workflow...' } });

            // Stream workflow events
            for await (const event of streamMultiAgentPlanningWorkflow(workflowInput)) {
              const eventData = event as any;
              
              if (eventData.type === 'step-start') {
                emit.next({ 
                  type: 'status', 
                  data: { 
                    status: eventData.stepId,
                    message: `Starting step: ${eventData.stepId}`,
                  } 
                });
              } else if (eventData.type === 'step-complete') {
                if (eventData.stepId === 'create-plan' && eventData.result?.plan) {
                  emit.next({ type: 'plan', data: eventData.result.plan });
                } else if (eventData.stepId === 'execute-plan' && eventData.result?.groupResults) {
                  for (const group of eventData.result.groupResults) {
                    emit.next({ type: 'group_start', data: { groupId: group.groupId } });
                    for (const task of group.subtaskResults) {
                      emit.next({ type: 'task_complete', data: task });
                    }
                  }
                } else if (eventData.stepId === 'review-results' && eventData.result?.review) {
                  emit.next({ type: 'review', data: eventData.result.review });
                }
              } else if (eventData.type === 'step-error') {
                emit.next({ 
                  type: 'error', 
                  data: { 
                    step: eventData.stepId,
                    message: eventData.error,
                  } 
                });
              }
            }

            emit.next({ type: 'done', data: { message: 'Workflow completed' } });
            emit.complete();
          } catch (error) {
            emit.next({ 
              type: 'error', 
              data: { 
                message: error instanceof Error ? error.message : 'Unknown error',
              } 
            });
            emit.complete();
          }
        })();

        return () => {
          // Cleanup if needed
        };
      });
    }),

  /**
   * Run planning workflow synchronously and return full result
   */
  run: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      task: z.string().min(10).max(5000),
      context: z.string().max(10000).optional(),
      maxIterations: z.number().min(1).max(5).default(3),
      maxParallelTasks: z.number().min(1).max(10).default(5),
      dryRun: z.boolean().default(false),
      createBranch: z.boolean().default(true),
      branchName: z.string().optional(),
      autoCommit: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check AI availability
      if (!isAIAvailable()) {
        const repoKey = await repoAiKeyModel.getAnyKey(input.repoId);
        if (!repoKey) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'AI is not configured. Add an API key in repository settings.',
          });
        }
        
        if (repoKey.provider === 'anthropic') {
          process.env.ANTHROPIC_API_KEY = repoKey.key;
        } else {
          process.env.OPENAI_API_KEY = repoKey.key;
        }
      }

      // Get repository
      const repo = await repoModel.findByIdWithOwner(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const ownerInfo = repo.owner as { username?: string; name?: string };
      const ownerUsername = ownerInfo.username || ownerInfo.name || 'unknown';

      // Build workflow input
      const workflowInput: MultiAgentPlanningInput = {
        repoId: input.repoId,
        repoPath: getRepoDiskPath(ownerUsername, repo.repo.name),
        owner: ownerUsername,
        repoName: repo.repo.name,
        userId: ctx.user.id,
        task: input.task,
        context: input.context,
        maxIterations: input.maxIterations,
        maxParallelTasks: input.maxParallelTasks,
        dryRun: input.dryRun,
        verbose: false,
        createBranch: input.createBranch,
        branchName: input.branchName,
        autoCommit: input.autoCommit,
      };

      try {
        const result = await runMultiAgentPlanningWorkflow(workflowInput);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Workflow execution failed',
        });
      }
    }),
});
