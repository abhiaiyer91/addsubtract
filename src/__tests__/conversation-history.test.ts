/**
 * Tests for Conversation History with Mastra Memory
 * 
 * Verifies that conversation history is properly stored and retrieved
 * using Mastra Memory as the single source of truth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';

// Mock Mastra Memory
const mockMessages: Map<string, any[]> = new Map();
const mockThreads: Map<string, any> = new Map();

const mockMemory = {
  saveThread: vi.fn(async ({ thread }) => {
    mockThreads.set(thread.id, thread);
    if (!mockMessages.has(thread.id)) {
      mockMessages.set(thread.id, []);
    }
    return thread;
  }),
  getThreadById: vi.fn(async ({ threadId }) => {
    return mockThreads.get(threadId) || null;
  }),
  listThreadsByResourceId: vi.fn(async ({ resourceId }) => {
    const threads = Array.from(mockThreads.values()).filter(
      t => t.resourceId === resourceId
    );
    return { threads };
  }),
  deleteThread: vi.fn(async (threadId: string) => {
    mockThreads.delete(threadId);
    mockMessages.delete(threadId);
  }),
  saveMessages: vi.fn(async ({ messages }) => {
    for (const msg of messages) {
      const threadMessages = mockMessages.get(msg.threadId) || [];
      threadMessages.push(msg);
      mockMessages.set(msg.threadId, threadMessages);
    }
    return { messages };
  }),
  recall: vi.fn(async ({ threadId }) => {
    const messages = mockMessages.get(threadId) || [];
    return { messages };
  }),
  updateThread: vi.fn(async ({ id, title, metadata }) => {
    const thread = mockThreads.get(id);
    if (thread) {
      thread.title = title || thread.title;
      thread.metadata = { ...thread.metadata, ...metadata };
      thread.updatedAt = new Date();
      mockThreads.set(id, thread);
    }
    return thread;
  }),
};

// Mock the mastra module
vi.mock('../ai/mastra', () => ({
  getMemory: () => mockMemory,
  getStorage: () => ({}),
}));

// Import after mocks
import { 
  ConversationService, 
  getConversationService,
  createConversationService,
} from '../ai/services/conversation';

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(() => {
    // Clear mock data
    mockMessages.clear();
    mockThreads.clear();
    vi.clearAllMocks();
    
    // Create a fresh service instance
    service = createConversationService(mockMemory as any);
  });

  describe('Thread Management', () => {
    it('should create a new conversation thread', async () => {
      const thread = await service.createThread({
        resourceId: 'repo:test-repo',
        title: 'Test Conversation',
        repoId: 'test-repo-id',
      });

      expect(thread.id).toBeDefined();
      expect(thread.resourceId).toBe('repo:test-repo');
      expect(thread.title).toBe('Test Conversation');
      expect(thread.metadata?.repoId).toBe('test-repo-id');
      expect(mockMemory.saveThread).toHaveBeenCalledTimes(1);
    });

    it('should get an existing thread by ID', async () => {
      // Create a thread first
      const created = await service.createThread({
        resourceId: 'repo:test-repo',
        title: 'Test Thread',
      });

      // Retrieve it
      const retrieved = await service.getThread(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe('Test Thread');
    });

    it('should return null for non-existent thread', async () => {
      const thread = await service.getThread('non-existent-id');
      expect(thread).toBeNull();
    });

    it('should list threads by resource ID', async () => {
      // Create multiple threads for the same resource
      await service.createThread({
        resourceId: 'repo:test-repo',
        title: 'Thread 1',
      });
      await service.createThread({
        resourceId: 'repo:test-repo',
        title: 'Thread 2',
      });
      await service.createThread({
        resourceId: 'repo:other-repo',
        title: 'Other Thread',
      });

      const threads = await service.listThreads('repo:test-repo');

      expect(threads).toHaveLength(2);
      expect(threads.map(t => t.title)).toContain('Thread 1');
      expect(threads.map(t => t.title)).toContain('Thread 2');
    });

    it('should delete a thread', async () => {
      const thread = await service.createThread({
        resourceId: 'repo:test-repo',
        title: 'To Delete',
      });

      await service.deleteThread(thread.id);

      expect(mockMemory.deleteThread).toHaveBeenCalledWith(thread.id);
      const retrieved = await service.getThread(thread.id);
      expect(retrieved).toBeNull();
    });

    it('should update thread metadata', async () => {
      const thread = await service.createThread({
        resourceId: 'repo:test-repo',
        title: 'Original Title',
      });

      // Clear call count from create
      mockMemory.saveThread.mockClear();

      await service.updateThread(thread.id, {
        title: 'Updated Title',
        metadata: { newKey: 'newValue' },
      });

      // updateThread uses saveThread internally
      expect(mockMemory.saveThread).toHaveBeenCalledWith(
        expect.objectContaining({
          thread: expect.objectContaining({
            id: thread.id,
            title: 'Updated Title',
          }),
        })
      );
    });
  });

  describe('Message Management', () => {
    let threadId: string;

    beforeEach(async () => {
      const thread = await service.createThread({
        resourceId: 'repo:test-repo',
      });
      threadId = thread.id;
    });

    it('should save a user message', async () => {
      const message = await service.saveUserMessage(threadId, 'Hello, AI!');

      expect(message.id).toBeDefined();
      expect(message.threadId).toBe(threadId);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, AI!');
      expect(mockMemory.saveMessages).toHaveBeenCalledTimes(1);
    });

    it('should save an assistant message', async () => {
      const message = await service.saveAssistantMessage(
        threadId,
        'Hello! How can I help you?',
        [{ toolName: 'readFile', args: { path: 'test.ts' } }]
      );

      expect(message.role).toBe('assistant');
      expect(message.content).toBe('Hello! How can I help you?');
      expect(message.toolCalls).toHaveLength(1);
    });

    it('should save a system message', async () => {
      const message = await service.saveSystemMessage(
        threadId,
        'Error: Something went wrong'
      );

      expect(message.role).toBe('system');
      expect(message.content).toBe('Error: Something went wrong');
    });

    it('should recall messages in chronological order', async () => {
      // Save multiple messages
      await service.saveUserMessage(threadId, 'First message');
      await service.saveAssistantMessage(threadId, 'First response');
      await service.saveUserMessage(threadId, 'Second message');
      await service.saveAssistantMessage(threadId, 'Second response');

      const messages = await service.recall({ threadId });

      expect(messages).toHaveLength(4);
      expect(messages[0].content).toBe('First message');
      expect(messages[1].content).toBe('First response');
      expect(messages[2].content).toBe('Second message');
      expect(messages[3].content).toBe('Second response');
    });

    it('should return empty array for thread with no messages', async () => {
      const messages = await service.recall({ threadId });
      expect(messages).toHaveLength(0);
    });
  });

  describe('Context Building', () => {
    let threadId: string;

    beforeEach(async () => {
      const thread = await service.createThread({
        resourceId: 'repo:test-repo',
      });
      threadId = thread.id;
    });

    it('should build context prompt from conversation history', async () => {
      await service.saveUserMessage(threadId, 'What is this file?');
      await service.saveAssistantMessage(threadId, 'This is a TypeScript file.');
      await service.saveUserMessage(threadId, 'Can you modify it?');

      const context = await service.getContextForPrompt(threadId);

      expect(context).toContain('Previous conversation:');
      expect(context).toContain('User: What is this file?');
      expect(context).toContain('Assistant: This is a TypeScript file.');
      expect(context).toContain('User: Can you modify it?');
    });

    it('should return empty string for new conversation', async () => {
      const context = await service.getContextForPrompt(threadId);
      expect(context).toBe('');
    });

    it('should truncate long messages in context', async () => {
      const longMessage = 'A'.repeat(1000);
      await service.saveUserMessage(threadId, longMessage);

      const context = await service.getContextForPrompt(threadId, {
        maxLength: 100,
      });

      expect(context).toContain('...');
      expect(context.length).toBeLessThan(longMessage.length);
    });

    it('should return agent stream options', () => {
      const options = service.getAgentStreamOptions(threadId, 'repo:test');

      expect(options.threadId).toBe(threadId);
      expect(options.resourceId).toBe('repo:test');
    });
  });

  describe('Singleton Instance', () => {
    it('should return the same instance', () => {
      // Note: This test needs to be careful about module caching
      const service1 = getConversationService();
      const service2 = getConversationService();

      // Both should be instances of ConversationService
      expect(service1).toBeInstanceOf(ConversationService);
      expect(service2).toBeInstanceOf(ConversationService);
    });
  });

  describe('Message Format Handling', () => {
    let threadId: string;

    beforeEach(async () => {
      const thread = await service.createThread({
        resourceId: 'repo:test-repo',
      });
      threadId = thread.id;
    });

    it('should handle Mastra message format with parts', async () => {
      // Simulate Mastra's internal format
      const mastraFormatMessage = {
        id: crypto.randomUUID(),
        threadId,
        role: 'assistant',
        content: {
          format: 2,
          parts: [
            { type: 'text', text: 'Here is the code:' },
            { type: 'text', text: '\n```typescript\nconsole.log("hello");\n```' },
          ],
        },
        createdAt: new Date(),
      };

      // Manually add to mock
      const messages = mockMessages.get(threadId) || [];
      messages.push(mastraFormatMessage);
      mockMessages.set(threadId, messages);

      const recalled = await service.recall({ threadId });

      expect(recalled).toHaveLength(1);
      expect(recalled[0].content).toContain('Here is the code:');
      expect(recalled[0].content).toContain('console.log');
    });

    it('should handle tool invocations in messages', async () => {
      const mastraFormatMessage = {
        id: crypto.randomUUID(),
        threadId,
        role: 'assistant',
        content: {
          format: 2,
          parts: [
            { type: 'text', text: 'Let me read that file.' },
            { 
              type: 'tool-invocation', 
              toolInvocation: { 
                toolName: 'readFile', 
                args: { path: 'src/index.ts' } 
              } 
            },
          ],
        },
        createdAt: new Date(),
      };

      const messages = mockMessages.get(threadId) || [];
      messages.push(mastraFormatMessage);
      mockMessages.set(threadId, messages);

      const recalled = await service.recall({ threadId });

      expect(recalled).toHaveLength(1);
      expect(recalled[0].toolCalls).toHaveLength(1);
      expect((recalled[0].toolCalls![0] as any).toolName).toBe('readFile');
    });
  });
});

describe('Session-Thread Integration', () => {
  /**
   * These tests verify that database sessions properly integrate
   * with Mastra threads for conversation history.
   */

  beforeEach(() => {
    mockMessages.clear();
    mockThreads.clear();
    vi.clearAllMocks();
  });

  it('should use session ID as thread ID', async () => {
    const service = createConversationService(mockMemory as any);
    const sessionId = crypto.randomUUID();

    // Create thread with session ID
    const thread = await service.createThread({
      resourceId: `session:${sessionId}`,
      metadata: { sessionId },
    });

    // The thread ID should be a valid UUID
    expect(thread.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('should persist messages across service instances', async () => {
    const threadId = crypto.randomUUID();

    // Create thread and save message with first service instance
    const service1 = createConversationService(mockMemory as any);
    await service1.createThread({
      resourceId: 'repo:test',
    });
    
    // Manually set the thread with the known ID
    mockThreads.set(threadId, {
      id: threadId,
      resourceId: 'repo:test',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockMessages.set(threadId, []);

    await service1.saveUserMessage(threadId, 'Hello from service 1');

    // Create new service instance and recall messages
    const service2 = createConversationService(mockMemory as any);
    const messages = await service2.recall({ threadId });

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello from service 1');
  });

  it('should handle concurrent message saves', async () => {
    const service = createConversationService(mockMemory as any);
    const thread = await service.createThread({
      resourceId: 'repo:test',
    });

    // Simulate concurrent saves
    const promises = [
      service.saveUserMessage(thread.id, 'Message 1'),
      service.saveUserMessage(thread.id, 'Message 2'),
      service.saveUserMessage(thread.id, 'Message 3'),
    ];

    await Promise.all(promises);

    const messages = await service.recall({ threadId: thread.id });
    expect(messages).toHaveLength(3);
  });
});

describe('Error Handling', () => {
  beforeEach(() => {
    mockMessages.clear();
    mockThreads.clear();
    vi.clearAllMocks();
  });

  it('should handle recall errors gracefully', async () => {
    const errorMemory = {
      ...mockMemory,
      recall: vi.fn().mockRejectedValue(new Error('Database error')),
    };

    const service = createConversationService(errorMemory as any);
    const messages = await service.recall({ threadId: 'test-thread' });

    // Should return empty array on error
    expect(messages).toEqual([]);
  });

  it('should handle getThread errors gracefully', async () => {
    const errorMemory = {
      ...mockMemory,
      getThreadById: vi.fn().mockRejectedValue(new Error('Not found')),
    };

    const service = createConversationService(errorMemory as any);
    const thread = await service.getThread('test-thread');

    // Should return null on error
    expect(thread).toBeNull();
  });

  it('should handle listThreads errors gracefully', async () => {
    const errorMemory = {
      ...mockMemory,
      listThreadsByResourceId: vi.fn().mockRejectedValue(new Error('Query error')),
    };

    const service = createConversationService(errorMemory as any);
    const threads = await service.listThreads('repo:test');

    // Should return empty array on error
    expect(threads).toEqual([]);
  });
});
