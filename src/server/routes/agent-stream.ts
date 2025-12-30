/**
 * Agent Streaming Routes
 * 
 * SSE endpoint for streaming agent chat responses.
 * Uses Mastra Memory for conversation history management.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as path from 'path';
import {
  agentSessionModel,
  repoModel,
  repoAiKeyModel,
} from '../../db/models';
import { type AgentMode, type AgentContext } from '../../ai/types';
import { createAuth } from '../../lib/auth';
import { getMemory } from '../../ai/mastra.js';

// Lazy import to avoid circular dependencies
async function getAgentForMode(mode: AgentMode, context: AgentContext, model: string) {
  const { createAgentForMode } = await import('../../ai/agents/factory.js');
  return createAgentForMode(mode, context, model);
}

function getRepoDiskPath(ownerUsername: string, repoName: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  return path.join(reposDir, ownerUsername, `${repoName}.git`);
}

/**
 * Create agent streaming routes
 */
export function createAgentStreamRoutes() {
  const app = new Hono();

  // SSE endpoint for streaming chat
  app.post('/chat/stream', async (c) => {
    // Get session from cookie using better-auth
    const auth = createAuth();

    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = session.user.id;

    // Parse request body
    let body: { sessionId: string; message: string; provider?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { sessionId, message, provider: requestedProvider } = body;

    if (!sessionId || !message) {
      return c.json({ error: 'sessionId and message are required' }, 400);
    }

    // Get session
    const agentSession = await agentSessionModel.findByIdForUser(sessionId, userId);
    if (!agentSession) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (agentSession.status !== 'active') {
      return c.json({ error: 'Session is not active' }, 400);
    }

    // Determine API key and provider
    let apiKey: string | null = null;
    let provider: 'openai' | 'anthropic' | 'openrouter' = (requestedProvider === 'openai' || requestedProvider === 'anthropic' || requestedProvider === 'openrouter') 
      ? requestedProvider 
      : 'anthropic';

    if (agentSession.repoId) {
      if (requestedProvider && (requestedProvider === 'openai' || requestedProvider === 'anthropic' || requestedProvider === 'openrouter')) {
        apiKey = await repoAiKeyModel.getDecryptedKey(agentSession.repoId, requestedProvider);
      } else {
        const repoKey = await repoAiKeyModel.getAnyKey(agentSession.repoId);
        if (repoKey) {
          apiKey = repoKey.key;
          provider = repoKey.provider;
        }
      }
    }

    if (!apiKey) {
      if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
        apiKey = process.env.ANTHROPIC_API_KEY;
      } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
        apiKey = process.env.OPENAI_API_KEY;
      } else if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
        apiKey = process.env.OPENROUTER_API_KEY;
      } else if (process.env.ANTHROPIC_API_KEY) {
        apiKey = process.env.ANTHROPIC_API_KEY;
        provider = 'anthropic';
      } else if (process.env.OPENROUTER_API_KEY) {
        apiKey = process.env.OPENROUTER_API_KEY;
        provider = 'openrouter';
      } else if (process.env.OPENAI_API_KEY) {
        apiKey = process.env.OPENAI_API_KEY;
        provider = 'openai';
      }
    }

    if (!apiKey) {
      return c.json({ error: 'AI is not configured' }, 412);
    }

    // Use the session ID as the Mastra thread ID for conversation history
    // This ensures conversation continuity across the session
    const threadId = sessionId;
    const resourceId = agentSession.repoId || `user:${userId}`;

    // Ensure the Mastra thread exists for this session
    const memory = getMemory();
    try {
      const existingThread = await memory.getThreadById({ threadId });
      if (!existingThread) {
        // Create a new Mastra thread for this session
        await memory.saveThread({
          thread: {
            id: threadId,
            resourceId,
            title: agentSession.title || `Session ${sessionId.slice(0, 8)}`,
            metadata: {
              repoId: agentSession.repoId,
              userId,
              branch: agentSession.branch,
              mode: agentSession.mode,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    } catch {
      console.log('[agent-stream] Creating new Mastra thread for session');
      await memory.saveThread({
        thread: {
          id: threadId,
          resourceId,
          title: agentSession.title || `Session ${sessionId.slice(0, 8)}`,
          metadata: {
            repoId: agentSession.repoId,
            userId,
            branch: agentSession.branch,
            mode: agentSession.mode,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    // Build agent context
    let agentContext: AgentContext | null = null;
    if (agentSession.repoId) {
      const repo = await repoModel.findById(agentSession.repoId);
      if (repo) {
        const repoWithOwner = await repoModel.findByIdWithOwner(agentSession.repoId);
        if (repoWithOwner) {
          const ownerUsername = 'username' in repoWithOwner.owner
            ? (repoWithOwner.owner.username || repoWithOwner.owner.name)
            : repoWithOwner.owner.name;
          agentContext = {
            repoId: agentSession.repoId,
            owner: ownerUsername,
            repoName: repo.name,
            repoPath: getRepoDiskPath(ownerUsername, repo.name),
            userId,
            mode: (agentSession.mode === 'questions' ? 'pm' : agentSession.mode || 'pm') as AgentMode,
          };
        }
      }
    }

    // Set API key temporarily
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    const originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
    
    if (provider === 'anthropic') {
      process.env.ANTHROPIC_API_KEY = apiKey;
    } else if (provider === 'openrouter') {
      // OpenRouter uses OpenAI-compatible API with a different base URL
      process.env.OPENAI_API_KEY = apiKey;
      process.env.OPENAI_BASE_URL = 'https://openrouter.ai/api/v1';
    } else {
      process.env.OPENAI_API_KEY = apiKey;
    }

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
      if (originalOpenAIBaseUrl !== undefined) {
        process.env.OPENAI_BASE_URL = originalOpenAIBaseUrl;
      } else {
        delete process.env.OPENAI_BASE_URL;
      }
    };

    // Stream the response
    return streamSSE(c, async (stream) => {
      try {
        // Send session info first
        await stream.writeSSE({
          event: 'session_info',
          data: JSON.stringify({ threadId, resourceId }),
        });

        // Get agent
        const sessionMode = (agentSession.mode === 'questions' ? 'pm' : agentSession.mode || 'pm') as AgentMode;
        // Select model based on provider
        // OpenRouter uses OpenAI-compatible format
        const modelId = provider === 'anthropic' 
          ? 'anthropic/claude-sonnet-4-20250514' 
          : 'openai/gpt-4o';

        let agent: any;
        if (agentContext) {
          agent = await getAgentForMode(sessionMode, agentContext, modelId);
        } else {
          const { getTsgitAgent } = await import('../../ai/mastra');
          agent = getTsgitAgent();
        }

        // Use stream with threadId for Mastra memory integration
        // Mastra will automatically:
        // 1. Load conversation history from the thread
        // 2. Save the user message and assistant response
        let fullResponse = '';
        let toolCallsWithResults: any[] = [];

        if (agent.stream) {
          // Pass threadId and resourceId to enable Mastra memory
          const result = await agent.stream(message, {
            threadId,
            resourceId,
          });

          // Stream text chunks
          for await (const chunk of result.textStream) {
            fullResponse += chunk;
            await stream.writeSSE({
              event: 'text',
              data: JSON.stringify({ content: chunk }),
            });
          }

          // Merge tool calls with their results from steps
          const toolCalls = result.toolCalls || [];
          const steps = result.steps || [];
          
          // Build a map of tool results by toolCallId
          const toolResultsMap = new Map<string, any>();
          for (const step of steps) {
            if (step.toolResults) {
              for (const tr of step.toolResults) {
                toolResultsMap.set(tr.toolCallId, tr.result);
              }
            }
          }
          
          // Merge tool calls with their results
          toolCallsWithResults = toolCalls.map((tc: any) => ({
            toolName: tc.toolName,
            toolCallId: tc.toolCallId,
            args: tc.input || tc.args,
            result: toolResultsMap.get(tc.toolCallId),
          }));
        } else {
          // Fallback to generate with memory
          const result = await agent.generate(message, {
            threadId,
            resourceId,
          });
          fullResponse = result.text || '';
          
          // Merge tool calls with results from steps
          const toolCalls = result.toolCalls || [];
          const steps = result.steps || [];
          
          const toolResultsMap = new Map<string, any>();
          for (const step of steps) {
            if (step.toolResults) {
              for (const tr of step.toolResults) {
                toolResultsMap.set(tr.toolCallId, tr.result);
              }
            }
          }
          
          toolCallsWithResults = toolCalls.map((tc: any) => ({
            toolName: tc.toolName,
            toolCallId: tc.toolCallId,
            args: tc.input || tc.args,
            result: toolResultsMap.get(tc.toolCallId),
          }));

          // Send the full response as a single chunk
          await stream.writeSSE({
            event: 'text',
            data: JSON.stringify({ content: fullResponse }),
          });
        }

        // Send tool calls with results if any
        if (toolCallsWithResults.length > 0) {
          await stream.writeSSE({
            event: 'tool_calls',
            data: JSON.stringify({ toolCalls: toolCallsWithResults }),
          });
        }

        // Auto-generate title if needed (check thread messages count)
        if (!agentSession.title) {
          try {
            const { messages } = await memory.recall({ threadId });
            if (messages.length <= 2) {
              const title = message.slice(0, 100) + (message.length > 100 ? '...' : '');
              await agentSessionModel.update(sessionId, { title });
            }
          } catch {
            // Ignore errors when generating title
          }
        }

        // Send completion
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ 
            threadId,
            provider,
          }),
        });

      } catch (error) {
        console.error('[agent-stream] Error:', error);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ 
            message: error instanceof Error ? error.message : 'Unknown error' 
          }),
        });
      } finally {
        restoreKeys();
      }
    });
  });

  return app;
}
