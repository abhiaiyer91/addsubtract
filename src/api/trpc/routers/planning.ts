/**
 * Planning Router
 * 
 * API endpoints for the multi-agent planning workflow.
 * Enables complex task planning with parallel subtask execution.
 * Streams Mastra workflow events directly to the frontend.
 */

import { z } from 'zod';
import * as path from 'path';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { router, protectedProcedure } from '../trpc';
import { repoModel, repoAiKeyModel } from '../../../db/models';
import { isAIAvailable, getAIInfo, getStorage } from '../../../ai/mastra';
import { runMultiAgentPlanningWorkflow, streamMultiAgentPlanningWorkflow } from '../../../ai/mastra';
import type { WorkflowRunState } from '@mastra/core/workflows';
import type { 
  MultiAgentPlanningInput, 
  MultiAgentPlanningOutput,
  ExecutionPlan,
  GroupResult,
  ReviewResult,
} from '../../../ai/workflows/multi-agent-planning.workflow';

// =============================================================================
// Streaming Event Types
// =============================================================================

/**
 * Streaming event types - matches Mastra workflow events plus our custom events
 */
export type PlanningStreamEventType = 
  | 'started'       // Workflow started
  | 'step-start'    // Mastra step starting
  | 'step-complete' // Mastra step completed with result
  | 'step-error'    // Mastra step failed
  | 'complete'      // Workflow completed
  | 'error';        // Workflow error

/**
 * Streaming event structure
 */
export interface PlanningStreamEvent {
  type: PlanningStreamEventType;
  timestamp: string;
  runId: string;
  stepId?: string;
  result?: unknown;
  error?: string;
}

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
type PlanningStatus = 'pending' | 'planning' | 'executing' | 'reviewing' | 'completed' | 'failed';

/**
 * Planning workflow run record (in-memory for now, could be persisted)
 */
interface PlanningRun {
  id: string;
  repoId: string;
  userId: string;
  task: string;
  context?: string;
  status: PlanningStatus;
  plan?: ExecutionPlan;
  groupResults?: GroupResult[];
  review?: ReviewResult;
  output?: MultiAgentPlanningOutput;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  // Store events for replay/observation
  events: PlanningStreamEvent[];
  // EventEmitter-like subscribers for live updates
  subscribers: Set<(event: PlanningStreamEvent) => void>;
  // Configuration
  dryRun: boolean;
  createBranch: boolean;
  branchName?: string;
  autoCommit: boolean;
  maxIterations: number;
  maxParallelTasks: number;
}

// In-memory store for planning runs (could be moved to database)
const planningRuns = new Map<string, PlanningRun>();

/**
 * Get a planning run by ID (for use by observe endpoint)
 * Only returns in-memory runs (active runs that can be observed)
 */
export function getPlanningRun(runId: string): PlanningRun | undefined {
  return planningRuns.get(runId);
}

/**
 * Get a planning run from Mastra storage by ID
 * Used for fetching completed/persisted runs
 */
export async function getPlanningRunFromStorage(runId: string, userId: string): Promise<{
  id: string;
  repoId: string;
  task: string;
  context?: string;
  status: PlanningStatus;
  plan?: ExecutionPlan;
  groupResults?: GroupResult[];
  review?: ReviewResult;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  dryRun: boolean;
  createBranch: boolean;
  branchName?: string;
  autoCommit: boolean;
} | null> {
  try {
    const storage = getStorage();
    const workflowsStore = await storage.getStore('workflows');
    
    if (!workflowsStore) {
      return null;
    }

    const mastraRun = await workflowsStore.getWorkflowRunById({
      runId,
      workflowName: 'multiAgentPlanning',
    });

    if (!mastraRun) {
      return null;
    }

    // Parse snapshot
    const snapshot = typeof mastraRun.snapshot === 'string' 
      ? JSON.parse(mastraRun.snapshot) as WorkflowRunState
      : mastraRun.snapshot as WorkflowRunState;

    // Extract input from snapshot
    const workflowInput = snapshot?.context?.input as MultiAgentPlanningInput | undefined;
    
    // Verify ownership
    if (workflowInput?.userId !== userId) {
      return null;
    }

    // Extract step results
    const planResult = snapshot?.context?.['create-plan'] as { output?: { plan?: ExecutionPlan } } | undefined;
    const execResult = snapshot?.context?.['execute-plan'] as { output?: { groupResults?: GroupResult[] } } | undefined;
    const reviewResult = snapshot?.context?.['review-results'] as { output?: { review?: ReviewResult } } | undefined;

    // Map Mastra status to our status
    // Mastra uses: 'running' | 'success' | 'failed' | 'tripwire' | 'suspended' | 'waiting' | 'pending' | 'canceled' | 'bailed' | 'paused'
    let status: PlanningStatus = 'pending';
    if (snapshot?.status === 'success') {
      status = 'completed';
    } else if (snapshot?.status === 'failed' || snapshot?.status === 'canceled' || snapshot?.status === 'bailed') {
      status = 'failed';
    } else if (snapshot?.status === 'running') {
      if (reviewResult) {
        status = 'reviewing';
      } else if (execResult) {
        status = 'executing';
      } else if (planResult) {
        status = 'planning';
      }
    }

    return {
      id: mastraRun.runId,
      repoId: workflowInput?.repoId || '',
      task: workflowInput?.task || 'Unknown task',
      context: workflowInput?.context,
      status,
      plan: planResult?.output?.plan,
      groupResults: execResult?.output?.groupResults,
      review: reviewResult?.output?.review,
      error: snapshot?.error?.message,
      startedAt: mastraRun.createdAt,
      completedAt: (snapshot?.status === 'success' || snapshot?.status === 'failed')
        ? mastraRun.updatedAt
        : undefined,
      dryRun: workflowInput?.dryRun || false,
      createBranch: workflowInput?.createBranch ?? true,
      branchName: workflowInput?.branchName,
      autoCommit: workflowInput?.autoCommit ?? true,
    };
  } catch (error) {
    console.error('[Planning] Failed to fetch run from Mastra storage:', error);
    return null;
  }
}

/**
 * Subscribe to planning run events (for use by observe endpoint)
 * Returns an unsubscribe function
 */
export function subscribeToPlanningRun(
  runId: string, 
  callback: (event: PlanningStreamEvent) => void
): () => void {
  const run = planningRuns.get(runId);
  if (!run) {
    return () => {};
  }
  
  run.subscribers.add(callback);
  return () => {
    run.subscribers.delete(callback);
  };
}

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
        context: input.context,
        status: 'pending',
        startedAt: new Date(),
        events: [],
        subscribers: new Set(),
        dryRun: input.dryRun,
        createBranch: input.createBranch,
        branchName: input.branchName,
        autoCommit: input.autoCommit,
        maxIterations: input.maxIterations,
        maxParallelTasks: input.maxParallelTasks,
      };
      planningRuns.set(runId, run);

      // Helper to emit events to run record and subscribers
      const emitEvent = (event: PlanningStreamEvent) => {
        run.events.push(event);
        for (const subscriber of run.subscribers) {
          try {
            subscriber(event);
          } catch {
            // Subscriber error, remove it
            run.subscribers.delete(subscriber);
          }
        }
      };

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

      // Start workflow asynchronously with event streaming
      const startTime = Date.now();
      (async () => {
        try {
          run.status = 'planning';
          
          // Emit started event
          emitEvent({
            type: 'started',
            timestamp: new Date().toISOString(),
            runId,
            result: {
              task: input.task,
              repoName: repo.repo.name,
              dryRun: input.dryRun,
            },
          });

          // Stream workflow events
          for await (const event of streamMultiAgentPlanningWorkflow(workflowInput)) {
            const eventData = event as { type: string; stepId?: string; result?: unknown; error?: string };
            
            emitEvent({
              type: eventData.type as PlanningStreamEventType,
              timestamp: new Date().toISOString(),
              runId,
              stepId: eventData.stepId,
              result: eventData.result,
              error: eventData.error,
            });

            // Update run state based on step results
            if (eventData.stepId === 'create-plan' && eventData.result) {
              const planResult = eventData.result as { plan?: ExecutionPlan };
              if (planResult.plan) {
                run.plan = planResult.plan;
              }
            }
            if (eventData.stepId === 'execute-plan' && eventData.result) {
              const execResult = eventData.result as { groupResults?: GroupResult[] };
              if (execResult.groupResults) {
                run.groupResults = execResult.groupResults;
              }
              run.status = 'executing';
            }
            if (eventData.stepId === 'review-results' && eventData.result) {
              const reviewResult = eventData.result as { review?: ReviewResult };
              if (reviewResult.review) {
                run.review = reviewResult.review;
              }
              run.status = 'reviewing';
            }
          }

          // Emit complete event
          emitEvent({
            type: 'complete',
            timestamp: new Date().toISOString(),
            runId,
            result: { totalDuration: Date.now() - startTime },
          });

          run.status = 'completed';
          run.completedAt = new Date();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          emitEvent({
            type: 'error',
            timestamp: new Date().toISOString(),
            runId,
            error: errorMessage,
          });

          run.status = 'failed';
          run.error = errorMessage;
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
   * Checks in-memory first, then falls back to Mastra storage
   */
  getRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      // First check in-memory for active runs
      const run = planningRuns.get(input.runId);
      
      if (run) {
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
          context: run.context,
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
          // Configuration
          dryRun: run.dryRun,
          createBranch: run.createBranch,
          branchName: run.branchName,
          autoCommit: run.autoCommit,
        };
      }

      // Not in memory, try Mastra storage
      try {
        const storage = getStorage();
        const workflowsStore = await storage.getStore('workflows');
        
        if (workflowsStore) {
          const mastraRun = await workflowsStore.getWorkflowRunById({
            runId: input.runId,
            workflowName: 'multiAgentPlanning',
          });

          if (mastraRun) {
            // Parse snapshot
            const snapshot = typeof mastraRun.snapshot === 'string' 
              ? JSON.parse(mastraRun.snapshot) as WorkflowRunState
              : mastraRun.snapshot as WorkflowRunState;

            // Extract input and results from snapshot
            const workflowInput = snapshot?.context?.input as MultiAgentPlanningInput | undefined;
            
            // Verify ownership
            if (workflowInput?.userId !== ctx.user.id) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Not authorized to view this run',
              });
            }

            // Extract step results
            const planResult = snapshot?.context?.['create-plan'] as { output?: { plan?: ExecutionPlan } } | undefined;
            const execResult = snapshot?.context?.['execute-plan'] as { output?: { groupResults?: GroupResult[] } } | undefined;
            const reviewResult = snapshot?.context?.['review-results'] as { output?: { review?: ReviewResult } } | undefined;

            // Map Mastra status to our status
            // Mastra uses: 'running' | 'success' | 'failed' | 'tripwire' | 'suspended' | 'waiting' | 'pending' | 'canceled' | 'bailed' | 'paused'
            let status: PlanningStatus = 'pending';
            if (snapshot?.status === 'success') {
              status = 'completed';
            } else if (snapshot?.status === 'failed' || snapshot?.status === 'canceled' || snapshot?.status === 'bailed') {
              status = 'failed';
            } else if (snapshot?.status === 'running') {
              if (reviewResult) {
                status = 'reviewing';
              } else if (execResult) {
                status = 'executing';
              } else if (planResult) {
                status = 'planning';
              }
            }

            const startedAt = mastraRun.createdAt;
            const completedAt = (snapshot?.status === 'success' || snapshot?.status === 'failed')
              ? mastraRun.updatedAt
              : undefined;

            return {
              id: mastraRun.runId,
              repoId: workflowInput?.repoId || '',
              task: workflowInput?.task || 'Unknown task',
              context: workflowInput?.context,
              status,
              plan: planResult?.output?.plan,
              groupResults: execResult?.output?.groupResults,
              review: reviewResult?.output?.review,
              error: snapshot?.error?.message,
              startedAt,
              completedAt,
              duration: completedAt 
                ? completedAt.getTime() - startedAt.getTime()
                : Date.now() - startedAt.getTime(),
              // Configuration
              dryRun: workflowInput?.dryRun || false,
              createBranch: workflowInput?.createBranch || true,
              branchName: workflowInput?.branchName,
              autoCommit: workflowInput?.autoCommit || true,
            };
          }
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[Planning] Failed to fetch run from Mastra storage:', error);
      }

      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Planning run not found',
      });
    }),

  /**
   * List planning runs for a repository
   * Fetches from Mastra workflow storage for persistence across server restarts
   */
  listRuns: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input, ctx }) => {
      // First check in-memory for active runs
      const inMemoryRuns: Array<{
        id: string;
        task: string;
        status: PlanningStatus;
        startedAt: Date;
        completedAt?: Date;
        error?: string;
      }> = [];
      
      for (const run of planningRuns.values()) {
        if (run.repoId === input.repoId && run.userId === ctx.user.id) {
          inMemoryRuns.push({
            id: run.id,
            task: run.task,
            status: run.status,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            error: run.error,
          });
        }
      }

      // Also fetch from Mastra storage for persisted runs
      try {
        const storage = getStorage();
        const workflowsStore = await storage.getStore('workflows');
        
        if (workflowsStore) {
          const { runs: mastraRuns } = await workflowsStore.listWorkflowRuns({
            workflowName: 'multiAgentPlanning',
            resourceId: input.repoId,
            perPage: input.limit,
            page: 0,
          });

          for (const mastraRun of mastraRuns) {
            // Skip if already in memory (active run)
            if (inMemoryRuns.some(r => r.id === mastraRun.runId)) {
              continue;
            }

            // Parse snapshot to get task details
            const snapshot = typeof mastraRun.snapshot === 'string' 
              ? JSON.parse(mastraRun.snapshot) as WorkflowRunState
              : mastraRun.snapshot as WorkflowRunState;

            // Extract input from snapshot context
            const workflowInput = snapshot?.context?.input as MultiAgentPlanningInput | undefined;
            
            // Only include runs for this user
            if (workflowInput?.userId !== ctx.user.id) {
              continue;
            }

            // Map Mastra status to our status
            // Mastra uses: 'running' | 'success' | 'failed' | 'tripwire' | 'suspended' | 'waiting' | 'pending' | 'canceled' | 'bailed' | 'paused'
            let status: PlanningStatus = 'pending';
            if (snapshot?.status === 'success') {
              status = 'completed';
            } else if (snapshot?.status === 'failed' || snapshot?.status === 'canceled' || snapshot?.status === 'bailed') {
              status = 'failed';
            } else if (snapshot?.status === 'running') {
              // Check step results to determine phase
              const stepResults = snapshot?.context || {};
              if (stepResults['review-results']) {
                status = 'reviewing';
              } else if (stepResults['execute-plan']) {
                status = 'executing';
              } else if (stepResults['create-plan']) {
                status = 'planning';
              }
            }

            inMemoryRuns.push({
              id: mastraRun.runId,
              task: workflowInput?.task || 'Unknown task',
              status,
              startedAt: mastraRun.createdAt,
              completedAt: snapshot?.status === 'success' || snapshot?.status === 'failed' 
                ? mastraRun.updatedAt 
                : undefined,
              error: snapshot?.error?.message,
            });
          }
        }
      } catch (error) {
        // Log but don't fail - in-memory runs will still be returned
        console.error('[Planning] Failed to fetch runs from Mastra storage:', error);
      }

      // Sort by start time descending
      inMemoryRuns.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

      return inMemoryRuns.slice(0, input.limit);
    }),

  /**
   * Observe an existing planning run
   * Replays stored events and subscribes to new events for live updates
   */
  observeStream: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .subscription(({ input, ctx }) => {
      return observable<PlanningStreamEvent>((emit) => {
        const run = planningRuns.get(input.runId);
        
        if (!run) {
          emit.error(new TRPCError({
            code: 'NOT_FOUND',
            message: 'Planning run not found',
          }));
          return;
        }

        // Verify ownership
        if (run.userId !== ctx.user.id) {
          emit.error(new TRPCError({
            code: 'FORBIDDEN',
            message: 'Not authorized to view this run',
          }));
          return;
        }

        // Replay all stored events
        for (const event of run.events) {
          emit.next(event);
        }

        // If already completed, we're done
        if (run.status === 'completed' || run.status === 'failed') {
          emit.complete();
          return;
        }

        // Subscribe to new events
        const subscriber = (event: PlanningStreamEvent) => {
          emit.next(event);
          // Complete when we receive complete or error event
          if (event.type === 'complete' || event.type === 'error') {
            emit.complete();
          }
        };
        run.subscribers.add(subscriber);

        // Cleanup on unsubscribe
        return () => {
          run.subscribers.delete(subscriber);
        };
      });
    }),

  /**
   * Stream planning workflow execution
   * Passes through Mastra workflow events directly to the frontend
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
      return observable<PlanningStreamEvent>((emit) => {
        const runId = crypto.randomUUID();
        const startTime = Date.now();
        let aborted = false;

        const emitEvent = (event: Omit<PlanningStreamEvent, 'timestamp' | 'runId'>): void => {
          if (aborted) return;
          emit.next({
            ...event,
            timestamp: new Date().toISOString(),
            runId,
          });
        };

        (async () => {
          try {
            // Check AI availability
            if (!isAIAvailable()) {
              const repoKey = await repoAiKeyModel.getAnyKey(input.repoId);
              if (!repoKey) {
                emitEvent({ type: 'error', error: 'AI is not configured. Add an API key in repository settings.' });
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
              emitEvent({ type: 'error', error: 'Repository not found' });
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

            // Emit started event with context
            emitEvent({ 
              type: 'started', 
              result: { 
                task: input.task, 
                repoName: repo.repo.name, 
                dryRun: input.dryRun 
              } 
            });

            // Stream Mastra workflow events directly
            for await (const event of streamMultiAgentPlanningWorkflow(workflowInput)) {
              if (aborted) break;
              
              const eventData = event as { type: string; stepId?: string; result?: unknown; error?: string };
              
              // Pass through Mastra events with our wrapper
              emitEvent({
                type: eventData.type as PlanningStreamEventType,
                stepId: eventData.stepId,
                result: eventData.result,
                error: eventData.error,
              });
            }

            // Emit complete event
            emitEvent({ 
              type: 'complete', 
              result: { totalDuration: Date.now() - startTime } 
            });
            emit.complete();
          } catch (error) {
            emitEvent({ 
              type: 'error', 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
            emit.complete();
          }
        })();

        return () => {
          aborted = true;
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
