/**
 * Agent Router
 * 
 * Handles the wit coding agent API endpoints including:
 * - Chat sessions management
 * - Message streaming
 * - File change approval
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  agentSessionModel,
  agentMessageModel,
  agentFileChangeModel,
  repoModel,
} from '../../../db/models';
import { getTsgitAgent, isAIAvailable, getAIInfo } from '../../../ai/mastra';

/**
 * Agent router for coding agent functionality
 */
export const agentRouter = router({
  /**
   * Check if AI is available and configured
   */
  status: publicProcedure.query(async () => {
    const info = getAIInfo();
    return {
      available: info.available,
      model: info.model,
      provider: info.provider,
    };
  }),

  /**
   * Create a new agent session
   */
  createSession: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid().optional(),
        branch: z.string().optional(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify repo access if provided
      if (input.repoId) {
        const repo = await repoModel.findById(input.repoId);
        if (!repo) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Repository not found',
          });
        }
      }

      const session = await agentSessionModel.create({
        userId: ctx.user.id,
        repoId: input.repoId,
        branch: input.branch,
        title: input.title,
        status: 'active',
      });

      return session;
    }),

  /**
   * Get a session by ID
   */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await agentSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      return session;
    }),

  /**
   * List sessions for the current user
   */
  listSessions: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid().optional(),
        status: z.enum(['active', 'completed', 'cancelled']).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      return agentSessionModel.listByUser(ctx.user.id, input);
    }),

  /**
   * Update a session (title, status)
   */
  updateSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        title: z.string().optional(),
        status: z.enum(['active', 'completed', 'cancelled']).optional(),
        branch: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await agentSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      const { sessionId, ...updateData } = input;
      return agentSessionModel.update(sessionId, updateData);
    }),

  /**
   * Delete a session
   */
  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await agentSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      await agentSessionModel.delete(input.sessionId);
      return { success: true };
    }),

  /**
   * Get messages for a session
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
      const session = await agentSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      return agentMessageModel.listBySession(input.sessionId, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Send a message to the agent and get a response
   * This is the main chat endpoint (non-streaming)
   */
  chat: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        message: z.string().min(1).max(32000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check AI availability
      if (!isAIAvailable()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI is not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.',
        });
      }

      // Verify session ownership
      const session = await agentSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      if (session.status !== 'active') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Session is not active',
        });
      }

      // Save user message
      const userMessage = await agentMessageModel.create({
        sessionId: input.sessionId,
        role: 'user',
        content: input.message,
      });

      // Get conversation history for context
      const history = await agentMessageModel.getRecentMessages(input.sessionId, 20);
      
      // Build prompt with conversation history
      let contextPrompt = '';
      if (history.length > 0) {
        contextPrompt = 'Previous conversation:\n';
        for (const msg of history) {
          const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
          const content = msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content;
          contextPrompt += `${role}: ${content}\n`;
        }
        contextPrompt += '\n---\n\n';
      }

      // Get agent response
      const agent = getTsgitAgent();
      const fullPrompt = contextPrompt + `User: ${input.message}`;
      
      try {
        const result = await agent.generate(fullPrompt);

        // Save assistant message
        const assistantMessage = await agentMessageModel.create({
          sessionId: input.sessionId,
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls ? JSON.stringify(result.toolCalls) : undefined,
        });

        // Auto-generate title if first message and no title
        if (!session.title && history.length <= 1) {
          const title = input.message.slice(0, 100) + (input.message.length > 100 ? '...' : '');
          await agentSessionModel.update(input.sessionId, { title });
        }

        return {
          userMessage,
          assistantMessage,
          toolCalls: result.toolCalls,
        };
      } catch (error) {
        // Save error message
        await agentMessageModel.create({
          sessionId: input.sessionId,
          role: 'system',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Agent error',
        });
      }
    }),

  /**
   * Stream a chat response (using server-sent events pattern)
   * Returns a subscription that emits chunks
   */
  chatStream: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        message: z.string().min(1).max(32000),
      })
    )
    .subscription(({ input, ctx }) => {
      return observable<{ type: 'text' | 'tool_call' | 'done' | 'error'; content: string }>((emit) => {
        (async () => {
          try {
            // Check AI availability
            if (!isAIAvailable()) {
              emit.next({ type: 'error', content: 'AI is not configured' });
              emit.complete();
              return;
            }

            // Verify session ownership
            const session = await agentSessionModel.findByIdForUser(
              input.sessionId,
              ctx.user.id
            );

            if (!session) {
              emit.next({ type: 'error', content: 'Session not found' });
              emit.complete();
              return;
            }

            if (session.status !== 'active') {
              emit.next({ type: 'error', content: 'Session is not active' });
              emit.complete();
              return;
            }

            // Save user message
            await agentMessageModel.create({
              sessionId: input.sessionId,
              role: 'user',
              content: input.message,
            });

            // Get conversation history and build prompt
            const history = await agentMessageModel.getRecentMessages(input.sessionId, 20);
            let contextPrompt = '';
            if (history.length > 0) {
              contextPrompt = 'Previous conversation:\n';
              for (const msg of history) {
                const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
                const content = msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content;
                contextPrompt += `${role}: ${content}\n`;
              }
              contextPrompt += '\n---\n\n';
            }

            // Get agent and stream response
            const agent = getTsgitAgent();
            const fullPrompt = contextPrompt + `User: ${input.message}`;
            const result = await agent.stream(fullPrompt);

            let fullResponse = '';

            // Stream text chunks
            for await (const chunk of result.textStream) {
              fullResponse += chunk;
              emit.next({ type: 'text', content: chunk });
            }

            // Save assistant message (tool calls are handled internally by the agent)
            await agentMessageModel.create({
              sessionId: input.sessionId,
              role: 'assistant',
              content: fullResponse,
            });

            // Auto-generate title if needed
            if (!session.title && history.length <= 1) {
              const title = input.message.slice(0, 100) + (input.message.length > 100 ? '...' : '');
              await agentSessionModel.update(input.sessionId, { title });
            }

            emit.next({ type: 'done', content: '' });
            emit.complete();
          } catch (error) {
            emit.next({ 
              type: 'error', 
              content: error instanceof Error ? error.message : 'Unknown error' 
            });
            emit.complete();
          }
        })();

        // Return cleanup function
        return () => {
          // Cleanup if needed
        };
      });
    }),

  /**
   * Get pending file changes for a session
   */
  getPendingChanges: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await agentSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      return agentFileChangeModel.listPendingBySession(input.sessionId);
    }),

  /**
   * Approve a file change
   */
  approveChange: protectedProcedure
    .input(z.object({ changeId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const change = await agentFileChangeModel.findById(input.changeId);
      
      if (!change) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File change not found',
        });
      }

      // Verify session ownership
      const session = await agentSessionModel.findByIdForUser(
        change.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      return agentFileChangeModel.approve(input.changeId);
    }),

  /**
   * Reject a file change
   */
  rejectChange: protectedProcedure
    .input(z.object({ changeId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const change = await agentFileChangeModel.findById(input.changeId);
      
      if (!change) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File change not found',
        });
      }

      // Verify session ownership
      const session = await agentSessionModel.findByIdForUser(
        change.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      return agentFileChangeModel.reject(input.changeId);
    }),

  /**
   * Approve all pending changes for a session
   */
  approveAllChanges: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await agentSessionModel.findByIdForUser(
        input.sessionId,
        ctx.user.id
      );

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      const count = await agentFileChangeModel.approveAllForSession(input.sessionId);
      return { approved: count };
    }),
});
