/**
 * Agent Router
 * 
 * Handles the wit coding agent API endpoints including:
 * - Chat sessions management
 * - Message streaming
 * - File change approval
 */

import { z } from 'zod';
import * as path from 'path';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  agentSessionModel,
  agentMessageModel,
  agentFileChangeModel,
  repoModel,
  repoAiKeyModel,
} from '../../../db/models';
import { getTsgitAgent, isAIAvailable, getAIInfo } from '../../../ai/mastra';
import { AGENT_MODES, type AgentMode, type AgentContext } from '../../../ai/types';

// Lazy import to avoid circular dependencies
async function getAgentForMode(mode: AgentMode, context: AgentContext, model: string) {
  const { createAgentForMode } = await import('../../../ai/agents/factory.js');
  return createAgentForMode(mode, context, model);
}

/**
 * Generate disk path for a repository
 * Inlined to avoid circular dependency with server/storage
 */
function getRepoDiskPath(ownerUsername: string, repoName: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  return path.join(reposDir, ownerUsername, `${repoName}.git`);
}

// Available models configuration
const AVAILABLE_MODELS = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    model: 'anthropic/claude-opus-4-5',
    description: 'Claude Opus 4.5 (Recommended)',
  },
  openai: {
    id: 'openai', 
    name: 'OpenAI',
    model: 'gpt-5.2',
    description: 'GPT 5.2',
  },
} as const;

type ProviderId = keyof typeof AVAILABLE_MODELS;

/**
 * Agent router for coding agent functionality
 */
export const agentRouter = router({
  /**
   * Check if AI is available and configured
   * Returns available providers based on both server and repo keys
   */
  status: protectedProcedure
    .input(z.object({ repoId: z.string().uuid().optional() }).optional())
    .query(async ({ input }) => {
      const info = getAIInfo();
      
      // Check which providers are available
      const availableProviders: Array<{
        id: string;
        name: string;
        model: string;
        description: string;
        source: 'server' | 'repository';
      }> = [];
      
      // Check server-level keys
      if (process.env.ANTHROPIC_API_KEY) {
        availableProviders.push({
          ...AVAILABLE_MODELS.anthropic,
          source: 'server',
        });
      }
      if (process.env.OPENAI_API_KEY) {
        availableProviders.push({
          ...AVAILABLE_MODELS.openai,
          source: 'server',
        });
      }
      
      // Check repo-level keys if repoId provided
      if (input?.repoId) {
        const repoKeys = await repoAiKeyModel.listKeys(input.repoId);
        for (const key of repoKeys) {
          // Don't add duplicates
          if (!availableProviders.some(p => p.id === key.provider)) {
            const modelInfo = AVAILABLE_MODELS[key.provider as ProviderId];
            if (modelInfo) {
              availableProviders.push({
                ...modelInfo,
                source: 'repository',
              });
            }
          }
        }
      }
      
      // Sort to prefer Anthropic
      availableProviders.sort((a, b) => {
        if (a.id === 'anthropic') return -1;
        if (b.id === 'anthropic') return 1;
        return 0;
      });
      
      const defaultProvider = availableProviders[0] || null;
      
      return {
        available: availableProviders.length > 0,
        model: defaultProvider?.model || info.model,
        provider: defaultProvider?.id || info.provider,
        providers: availableProviders,
        defaultProvider: defaultProvider?.id || null,
      };
    }),

  /**
   * Get available agent modes
   */
  getModes: publicProcedure.query(() => {
    return {
      modes: Object.values(AGENT_MODES),
      defaultMode: 'questions' as AgentMode,
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
        mode: z.enum(['questions', 'pm', 'code']).default('questions'),
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
        mode: input.mode,
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
        provider: z.enum(['anthropic', 'openai']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get session to check for repoId
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

      // Determine which provider/key to use
      let apiKey: string | null = null;
      let provider = input.provider || 'anthropic'; // Default to Anthropic
      
      // Try repo-level keys first if we have a repoId
      if (session.repoId) {
        if (input.provider) {
          // User specified a provider, try to get that key
          apiKey = await repoAiKeyModel.getDecryptedKey(session.repoId, input.provider);
        } else {
          // No provider specified, get any available key (prefers Anthropic)
          const repoKey = await repoAiKeyModel.getAnyKey(session.repoId);
          if (repoKey) {
            apiKey = repoKey.key;
            provider = repoKey.provider;
          }
        }
      }
      
      // Fall back to server-level keys
      if (!apiKey) {
        if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
          apiKey = process.env.ANTHROPIC_API_KEY;
        } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
          apiKey = process.env.OPENAI_API_KEY;
        } else if (process.env.ANTHROPIC_API_KEY) {
          apiKey = process.env.ANTHROPIC_API_KEY;
          provider = 'anthropic';
        } else if (process.env.OPENAI_API_KEY) {
          apiKey = process.env.OPENAI_API_KEY;
          provider = 'openai';
        }
      }

      if (!apiKey) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI is not configured. Add an API key in repository settings or set ANTHROPIC_API_KEY.',
        });
      }

      // Set the API key in environment for the agent to use
      // This is a temporary override for this request
      const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
      const originalOpenAIKey = process.env.OPENAI_API_KEY;
      
      if (provider === 'anthropic') {
        process.env.ANTHROPIC_API_KEY = apiKey;
      } else {
        process.env.OPENAI_API_KEY = apiKey;
      }

      // Helper to restore original keys
      const restoreKeys = () => {
        if (originalAnthropicKey !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
        } else {
          delete process.env.ANTHROPIC_API_KEY;
        }
        if (originalOpenAIKey !== undefined) {
          process.env.OPENAI_API_KEY = originalOpenAIKey;
        } else {
          delete process.env.OPENAI_API_KEY;
        }
      };

      if (session.status !== 'active') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Session is not active',
        });
      }

      // Build agent context if we have a repository
      let agentContext: AgentContext | null = null;
      if (session.repoId) {
        const repo = await repoModel.findById(session.repoId);
        if (repo) {
          // Get owner info to determine owner username
          const repoWithOwner = await repoModel.findByIdWithOwner(session.repoId);
          if (repoWithOwner) {
            // Get username - handle both user (with username) and organization (with name)
            const ownerUsername = 'username' in repoWithOwner.owner 
              ? (repoWithOwner.owner.username || repoWithOwner.owner.name)
              : repoWithOwner.owner.name;
            agentContext = {
              repoId: session.repoId,
              owner: ownerUsername,
              repoName: repo.name,
              repoPath: getRepoDiskPath(ownerUsername, repo.name),
              userId: ctx.user.id,
              mode: (session.mode || 'questions') as AgentMode,
            };
          }
        }
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

      // Get agent based on mode (or fallback to general agent)
      const sessionMode = (session.mode || 'questions') as AgentMode;
      const modelId = provider === 'anthropic' ? 'anthropic/claude-opus-4-5' : 'openai/gpt-5.2';
      
      // Use mode-based agent if we have a repo context, otherwise fallback to general agent
      const agent = agentContext 
        ? await getAgentForMode(sessionMode, agentContext, modelId)
        : getTsgitAgent();
      
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

        // Restore original API keys
        restoreKeys();

        return {
          userMessage,
          assistantMessage,
          toolCalls: result.toolCalls,
          provider, // Return which provider was used
        };
      } catch (error) {
        // Restore original API keys
        restoreKeys();

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
