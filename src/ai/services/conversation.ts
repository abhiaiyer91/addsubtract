/**
 * Conversation Service
 * 
 * Unified conversation history management using Mastra Memory.
 * This is the single source of truth for all conversation history,
 * whether from CLI, Web, or API.
 */

import * as crypto from 'crypto';
import { Memory } from '@mastra/memory';
import { getMemory } from '../mastra.js';

export interface ConversationThread {
  id: string;
  resourceId: string;
  title?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: unknown[];
  createdAt: Date;
}

export interface CreateThreadOptions {
  resourceId: string;
  title?: string;
  metadata?: Record<string, unknown>;
  repoId?: string;
  userId?: string;
  branch?: string;
}

export interface SaveMessageOptions {
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: unknown[];
}

export interface RecallOptions {
  threadId: string;
  limit?: number;
}

/**
 * Create a MastraDBMessage with proper content format
 */
function createMastraMessage(
  threadId: string,
  role: 'user' | 'assistant' | 'system',
  text: string,
  toolCalls?: unknown[]
): {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: { format: 2; parts: Array<{ type: 'text'; text: string } | { type: 'tool-invocation'; toolInvocation: unknown }> };
  createdAt: Date;
} {
  const parts: Array<{ type: 'text'; text: string } | { type: 'tool-invocation'; toolInvocation: unknown }> = [
    { type: 'text', text }
  ];

  // Add tool calls if present
  if (toolCalls && toolCalls.length > 0) {
    for (const toolCall of toolCalls) {
      parts.push({ type: 'tool-invocation', toolInvocation: toolCall });
    }
  }

  return {
    id: crypto.randomUUID(),
    threadId,
    role,
    content: {
      format: 2,
      parts,
    },
    createdAt: new Date(),
  };
}

/**
 * Extract text content from Mastra message content format
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content && typeof content === 'object') {
    const c = content as { parts?: Array<{ type: string; text?: string }> };
    if (c.parts && Array.isArray(c.parts)) {
      return c.parts
        .filter(p => p.type === 'text' && p.text)
        .map(p => p.text)
        .join('');
    }
  }
  return '';
}

/**
 * Extract tool calls from Mastra message content format
 */
function extractToolCalls(content: unknown): unknown[] {
  if (content && typeof content === 'object') {
    const c = content as { parts?: Array<{ type: string; toolInvocation?: unknown }> };
    if (c.parts && Array.isArray(c.parts)) {
      return c.parts
        .filter(p => p.type === 'tool-invocation' && p.toolInvocation)
        .map(p => p.toolInvocation);
    }
  }
  return [];
}

/**
 * Conversation Service - Unified interface for conversation history
 */
export class ConversationService {
  private memory: Memory;

  constructor(memory?: Memory) {
    this.memory = memory || getMemory();
  }

  /**
   * Create a new conversation thread
   */
  async createThread(options: CreateThreadOptions): Promise<ConversationThread> {
    const threadId = crypto.randomUUID();
    const now = new Date();

    const thread = {
      id: threadId,
      resourceId: options.resourceId,
      title: options.title || `Conversation - ${now.toISOString()}`,
      metadata: {
        ...options.metadata,
        repoId: options.repoId,
        userId: options.userId,
        branch: options.branch,
      },
      createdAt: now,
      updatedAt: now,
    };

    await this.memory.saveThread({
      thread,
    });

    return thread;
  }

  /**
   * Get a thread by ID
   */
  async getThread(threadId: string): Promise<ConversationThread | null> {
    try {
      const thread = await this.memory.getThreadById({ threadId });
      if (!thread) return null;

      return {
        id: thread.id,
        resourceId: thread.resourceId,
        title: thread.title,
        metadata: thread.metadata as Record<string, unknown>,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * Save a message to a thread
   */
  async saveMessage(options: SaveMessageOptions): Promise<ConversationMessage> {
    const message = createMastraMessage(
      options.threadId,
      options.role,
      options.content,
      options.toolCalls
    );

    await this.memory.saveMessages({
      messages: [message as never], // Type cast for Mastra compatibility
    });

    return {
      id: message.id,
      threadId: options.threadId,
      role: options.role,
      content: options.content,
      toolCalls: options.toolCalls,
      createdAt: message.createdAt,
    };
  }

  /**
   * Save user message
   */
  async saveUserMessage(threadId: string, content: string): Promise<ConversationMessage> {
    return this.saveMessage({ threadId, role: 'user', content });
  }

  /**
   * Save assistant message
   */
  async saveAssistantMessage(
    threadId: string,
    content: string,
    toolCalls?: unknown[]
  ): Promise<ConversationMessage> {
    return this.saveMessage({ threadId, role: 'assistant', content, toolCalls });
  }

  /**
   * Save system message
   */
  async saveSystemMessage(threadId: string, content: string): Promise<ConversationMessage> {
    return this.saveMessage({ threadId, role: 'system', content });
  }

  /**
   * Recall messages from a thread
   * Returns messages in chronological order
   */
  async recall(options: RecallOptions): Promise<ConversationMessage[]> {
    try {
      const { messages } = await this.memory.recall({
        threadId: options.threadId,
      });

      return messages.map(msg => ({
        id: (msg as any).id || crypto.randomUUID(),
        threadId: options.threadId,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: extractTextContent(msg.content),
        toolCalls: extractToolCalls(msg.content),
        createdAt: (msg as any).createdAt || new Date(),
      }));
    } catch (error) {
      console.error('[ConversationService] Error recalling messages:', error);
      return [];
    }
  }

  /**
   * Get messages formatted for context injection
   * This is used when manually building prompts (for legacy support)
   */
  async getContextForPrompt(
    threadId: string,
    options: { maxMessages?: number; maxLength?: number } = {}
  ): Promise<string> {
    const { maxMessages = 20, maxLength = 500 } = options;
    const messages = await this.recall({ threadId, limit: maxMessages });

    if (messages.length === 0) {
      return '';
    }

    let contextPrompt = 'Previous conversation:\n';
    for (const msg of messages) {
      const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      const content = msg.content.length > maxLength
        ? msg.content.slice(0, maxLength) + '...'
        : msg.content;
      contextPrompt += `${role}: ${content}\n`;
    }
    contextPrompt += '\n---\n\n';

    return contextPrompt;
  }

  /**
   * Get the thread ID to use with agent.stream() or agent.generate()
   * This enables Mastra's built-in memory management
   */
  getAgentStreamOptions(threadId: string, resourceId: string): { threadId: string; resourceId: string } {
    return { threadId, resourceId };
  }

  /**
   * Update thread metadata (e.g., title)
   */
  async updateThread(
    threadId: string,
    updates: { title?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    const existing = await this.getThread(threadId);
    if (!existing) return;

    await this.memory.saveThread({
      thread: {
        id: threadId,
        resourceId: existing.resourceId,
        title: updates.title || existing.title,
        metadata: { ...existing.metadata, ...updates.metadata },
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * List threads for a resource (e.g., a repository or user)
   */
  async listThreads(resourceId: string): Promise<ConversationThread[]> {
    try {
      const result = await this.memory.listThreadsByResourceId({ resourceId });
      return result.threads.map((t) => ({
        id: t.id,
        resourceId: t.resourceId,
        title: t.title,
        metadata: t.metadata as Record<string, unknown>,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Delete a thread (and all its messages)
   */
  async deleteThread(threadId: string): Promise<void> {
    try {
      await this.memory.deleteThread(threadId);
    } catch (error) {
      console.error('[ConversationService] Error deleting thread:', error);
    }
  }
}

// Singleton instance
let conversationServiceInstance: ConversationService | null = null;

/**
 * Get the singleton ConversationService instance
 */
export function getConversationService(): ConversationService {
  if (!conversationServiceInstance) {
    conversationServiceInstance = new ConversationService();
  }
  return conversationServiceInstance;
}

/**
 * Create a new ConversationService instance (useful for testing)
 */
export function createConversationService(memory?: Memory): ConversationService {
  return new ConversationService(memory);
}
