/**
 * Agent Streaming Routes
 * 
 * SSE endpoint for streaming agent chat responses
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as path from 'path';
import {
  agentSessionModel,
  agentMessageModel,
  repoModel,
  repoAiKeyModel,
} from '../../db/models';
import { type AgentMode, type AgentContext } from '../../ai/types';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '../../db';

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
    const auth = betterAuth({
      database: drizzleAdapter(getDb(), { provider: 'pg' }),
      session: {
        cookieCache: { enabled: true, maxAge: 60 * 5 },
      },
    });

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
    let provider: 'openai' | 'anthropic' = (requestedProvider === 'openai' || requestedProvider === 'anthropic') 
      ? requestedProvider 
      : 'anthropic';

    if (agentSession.repoId) {
      if (requestedProvider && (requestedProvider === 'openai' || requestedProvider === 'anthropic')) {
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
      } else if (process.env.ANTHROPIC_API_KEY) {
        apiKey = process.env.ANTHROPIC_API_KEY;
        provider = 'anthropic';
      } else if (process.env.OPENAI_API_KEY) {
        apiKey = process.env.OPENAI_API_KEY;
        provider = 'openai';
      }
    }

    if (!apiKey) {
      return c.json({ error: 'AI is not configured' }, 412);
    }

    // Save user message first
    const userMessage = await agentMessageModel.create({
      sessionId,
      role: 'user',
      content: message,
    });

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

    // Get conversation history
    const history = await agentMessageModel.getRecentMessages(sessionId, 20);
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

    // Set API key temporarily
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    
    if (provider === 'anthropic') {
      process.env.ANTHROPIC_API_KEY = apiKey;
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
    };

    // Stream the response
    return streamSSE(c, async (stream) => {
      try {
        // Send user message ID first
        await stream.writeSSE({
          event: 'user_message',
          data: JSON.stringify({ id: userMessage.id }),
        });

        // Get agent
        const sessionMode = (agentSession.mode === 'questions' ? 'pm' : agentSession.mode || 'pm') as AgentMode;
        const modelId = provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o';

        let agent: any;
        if (agentContext) {
          agent = await getAgentForMode(sessionMode, agentContext, modelId);
        } else {
          const { getTsgitAgent } = await import('../../ai/mastra');
          agent = getTsgitAgent();
        }

        const fullPrompt = contextPrompt + `User: ${message}`;

        // Use stream if available, otherwise fall back to generate
        let fullResponse = '';
        let toolCalls: any[] = [];

        if (agent.stream) {
          const result = await agent.stream(fullPrompt);

          // Stream text chunks
          for await (const chunk of result.textStream) {
            fullResponse += chunk;
            await stream.writeSSE({
              event: 'text',
              data: JSON.stringify({ content: chunk }),
            });
          }

          // Get tool calls if any
          if (result.toolCalls) {
            toolCalls = result.toolCalls;
          }
        } else {
          // Fallback to generate
          const result = await agent.generate(fullPrompt);
          fullResponse = result.text || '';
          toolCalls = result.toolCalls || [];

          // Send the full response as a single chunk
          await stream.writeSSE({
            event: 'text',
            data: JSON.stringify({ content: fullResponse }),
          });
        }

        // Send tool calls if any
        if (toolCalls.length > 0) {
          await stream.writeSSE({
            event: 'tool_calls',
            data: JSON.stringify({ toolCalls }),
          });
        }

        // Save assistant message
        const assistantMessage = await agentMessageModel.create({
          sessionId,
          role: 'assistant',
          content: fullResponse,
          toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : undefined,
        });

        // Auto-generate title if needed
        if (!agentSession.title && history.length <= 1) {
          const title = message.slice(0, 100) + (message.length > 100 ? '...' : '');
          await agentSessionModel.update(sessionId, { title });
        }

        // Send completion
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ 
            assistantMessageId: assistantMessage.id,
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
