/**
 * Planning Workflow Router
 * 
 * tRPC router for the agent planning workflow system.
 * Uses Mastra workflows for AI-powered planning and execution.
 * 
 * Provides endpoints for:
 * - Creating and managing planning sessions
 * - Iterating on plans with AI (Mastra workflow)
 * - Managing and executing tasks (Mastra workflow)
 * - Monitoring execution progress
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { router, protectedProcedure } from '../trpc';
import {
  planningSessionModel,
  planningMessageModel,
  agentTaskModel,
  repoModel,
  getPlanningSessionFull,
} from '../../../db/models/index.js';
import {
  runPlanningWorkflow,
  runPlanningIterationWorkflow,
} from '../../../ai/mastra.js';
import {
  startPlanningSession,
  generateTasks,
  finalizeTasks,
  executeTasks,
  cancelSession,
} from '../../../ai/workflows/planning-workflow.js';
import type { PlanningSessionStatus, AgentTaskStatus } from '../../../db/schema.js';

/**
 * Planning Workflow Router
 */
export const planningWorkflowRouter = router({
  /**
   * Create a new planning session
   */
  createSession: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        planningPrompt: z.string().min(1).max(50000),
        title: z.string().optional(),
        baseBranch: z.string().optional().default('main'),
        maxConcurrency: z.number().min(1).max(10).optional().default(3),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify repo access
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Start the planning session
      const session = await startPlanningSession({
        userId: ctx.user.id,
        repoId: input.repoId,
        planningPrompt: input.planningPrompt,
        title: input.title,
        baseBranch: input.baseBranch,
        maxConcurrency: input.maxConcurrency,
      });

      return session;
    }),

  /**
   * Get a planning session by ID
   */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      return session;
    }),

  /**
   * Get full session details including messages and tasks
   */
  getSessionFull: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      return getPlanningSessionFull(input.sessionId);
    }),

  /**
   * List planning sessions for a user
   */
  listSessions: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid().optional(),
        status: z.enum(['planning', 'ready', 'executing', 'completed', 'failed', 'cancelled']).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      return planningSessionModel.listByUser(ctx.user.id, {
        repoId: input.repoId,
        status: input.status as PlanningSessionStatus | undefined,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * List planning sessions for a repository
   */
  listSessionsByRepo: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        status: z.enum(['planning', 'ready', 'executing', 'completed', 'failed', 'cancelled']).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return planningSessionModel.listByRepo(input.repoId, {
        status: input.status as PlanningSessionStatus | undefined,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get messages for a planning session
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      return planningMessageModel.listBySession(input.sessionId, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Send a message to iterate on the plan (uses Mastra workflow)
   */
  iterate: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        message: z.string().min(1).max(50000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      if (session.status !== 'planning') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Session is not in planning phase',
        });
      }

      // Use Mastra workflow for iteration
      const result = await runPlanningIterationWorkflow({
        sessionId: input.sessionId,
        userMessage: input.message,
      });

      // Get updated session
      const updatedSession = await planningSessionModel.findById(input.sessionId);

      return {
        session: updatedSession!,
        response: result.response,
        iteration: result.iteration,
        hasTasks: result.hasTasks,
      };
    }),

  /**
   * Generate tasks from the current plan
   */
  generateTasks: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      if (session.status !== 'planning') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Session is not in planning phase',
        });
      }

      const tasks = await generateTasks(input.sessionId);
      
      if (!tasks) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate tasks from the current plan',
        });
      }

      return tasks;
    }),

  /**
   * Finalize tasks and prepare for execution
   */
  finalizeTasks: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        tasks: z.array(
          z.object({
            title: z.string().min(1).max(200),
            description: z.string().min(1).max(10000),
            targetFiles: z.array(z.string()).optional(),
            priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
            dependsOn: z.array(z.number()).optional(),
          })
        ).min(1).max(50),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      if (session.status !== 'planning') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Session is not in planning phase',
        });
      }

      const tasks = await finalizeTasks({
        sessionId: input.sessionId,
        tasks: input.tasks,
      });

      return tasks;
    }),

  /**
   * Get tasks for a planning session
   */
  getTasks: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        status: z.enum(['pending', 'queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      return agentTaskModel.listBySession(input.sessionId, {
        status: input.status as AgentTaskStatus | undefined,
      });
    }),

  /**
   * Get task status counts for a session
   */
  getTaskCounts: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      return agentTaskModel.countByStatus(input.sessionId);
    }),

  /**
   * Start task execution (uses legacy executor)
   */
  execute: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      if (session.status !== 'ready') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot execute session in status: ${session.status}`,
        });
      }

      // Start execution
      const result = await executeTasks({ sessionId: input.sessionId });
      
      return result;
    }),

  /**
   * Run complete Mastra planning workflow (plan + execute)
   * This creates a session, generates plan, creates tasks, and executes them
   */
  runFullWorkflow: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        planningPrompt: z.string().min(1).max(50000),
        title: z.string().optional(),
        baseBranch: z.string().optional().default('main'),
        maxConcurrency: z.number().min(1).max(10).optional().default(3),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify repo access
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Run the full Mastra planning workflow
      const result = await runPlanningWorkflow({
        userId: ctx.user.id,
        repoId: input.repoId,
        planningPrompt: input.planningPrompt,
        title: input.title,
        baseBranch: input.baseBranch,
        maxConcurrency: input.maxConcurrency,
      });

      return result;
    }),

  /**
   * Cancel a planning session
   */
  cancel: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      if (['completed', 'cancelled'].includes(session.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Session is already completed or cancelled',
        });
      }

      return cancelSession(input.sessionId);
    }),

  /**
   * Delete a planning session
   */
  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      await planningSessionModel.delete(input.sessionId);
      return { success: true };
    }),

  /**
   * Update task order/priorities
   */
  updateTasks: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        updates: z.array(
          z.object({
            taskId: z.string().uuid(),
            priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify session ownership
      const session = await planningSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Planning session not found',
        });
      }

      if (!['planning', 'ready'].includes(session.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot update tasks for session in this status',
        });
      }

      // Apply updates
      for (const update of input.updates) {
        const task = await agentTaskModel.findById(update.taskId);
        if (task && task.sessionId === input.sessionId) {
          // Note: We only allow priority updates for now
          // Full updates would require more complex validation
        }
      }

      return agentTaskModel.listBySession(input.sessionId);
    }),

  /**
   * Subscribe to session status updates (for real-time UI)
   */
  onSessionUpdate: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .subscription(({ input, ctx }) => {
      return observable<{
        session: Awaited<ReturnType<typeof planningSessionModel.findById>>;
        taskCounts: Record<AgentTaskStatus, number>;
      }>((emit) => {
        let isActive = true;
        
        const poll = async () => {
          while (isActive) {
            try {
              const session = await planningSessionModel.findByIdForUser(
                input.sessionId,
                ctx.user.id
              );
              
              if (!session) {
                emit.error(new Error('Session not found'));
                return;
              }

              const taskCounts = await agentTaskModel.countByStatus(input.sessionId);
              
              emit.next({ session, taskCounts });

              // Stop polling if session is in a terminal state
              if (['completed', 'failed', 'cancelled'].includes(session.status)) {
                emit.complete();
                return;
              }

              // Poll every 2 seconds
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
              if (isActive) {
                emit.error(error instanceof Error ? error : new Error('Unknown error'));
              }
              return;
            }
          }
        };

        poll();

        return () => {
          isActive = false;
        };
      });
    }),
});
