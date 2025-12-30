/**
 * Tests for the Agent API Router
 * 
 * Tests the tRPC endpoints for the wit coding agent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database
vi.mock('../db', () => ({
  getDb: () => ({}),
}));

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
  recall: vi.fn(async ({ threadId }) => {
    const messages = mockMessages.get(threadId) || [];
    return { messages };
  }),
  saveMessages: vi.fn(async ({ messages }) => {
    for (const msg of messages) {
      const threadMessages = mockMessages.get(msg.threadId) || [];
      threadMessages.push(msg);
      mockMessages.set(msg.threadId, threadMessages);
    }
    return { messages };
  }),
};

// Mock the AI module
vi.mock('../ai/mastra', () => ({
  isAIAvailable: vi.fn().mockReturnValue(true),
  getAIInfo: vi.fn().mockReturnValue({
    available: true,
    model: 'openai/gpt-4o',
    provider: 'openai',
  }),
  getTsgitAgent: vi.fn().mockReturnValue({
    generate: vi.fn().mockResolvedValue({
      text: 'I can help you with that!',
      toolCalls: [],
    }),
    stream: vi.fn().mockReturnValue({
      textStream: (async function* () {
        yield 'Hello';
        yield ' World';
      })(),
      then: (fn: (result: unknown) => unknown) => fn({ toolCalls: [] }),
    }),
  }),
  getMemory: () => mockMemory,
}));

// Test UUIDs - defined before mocks so they can be used in mock factory
const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_REPO_ID = '00000000-0000-0000-0000-000000000003';
const TEST_CHANGE_ID = '00000000-0000-0000-0000-000000000004';
const _TEST_MSG_ID = '00000000-0000-0000-0000-000000000005';
const TEST_SESSION_ID_2 = '00000000-0000-0000-0000-000000000006';

// Mock agent models - must be inside the factory
vi.mock('../db/models', () => ({
  agentSessionModel: {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdForUser: vi.fn(),
    listByUser: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    touch: vi.fn(),
  },
  agentFileChangeModel: {
    create: vi.fn(),
    findById: vi.fn(),
    listPendingBySession: vi.fn(),
    listBySession: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    approveAllForSession: vi.fn(),
  },
  repoModel: {
    findById: vi.fn().mockResolvedValue({ id: '00000000-0000-0000-0000-000000000003', name: 'test-repo' }),
    findByIdWithOwner: vi.fn().mockResolvedValue(null),
  },
  repoAiKeyModel: {
    listKeys: vi.fn().mockResolvedValue([]),
    getDecryptedKey: vi.fn().mockResolvedValue(null),
    getAnyKey: vi.fn().mockResolvedValue(null),
  },
}));

// Import after mocks are set up
import { agentRouter } from '../api/trpc/routers/agent';
import { router } from '../api/trpc/trpc';
import { getTsgitAgent } from '../ai/mastra';
import { 
  agentSessionModel, 
  agentFileChangeModel 
} from '../db/models';

// Create a test router
const testRouter = router({ agent: agentRouter });

// Create a test context
function createTestContext(userId?: string) {
  return {
    user: userId ? { id: userId, email: 'test@test.com', name: 'Test User' } : null,
    db: {},
    req: {} as Request,
  };
}

// Helper to call procedures
async function callProcedure<T>(
  procedure: string,
  input: unknown,
  ctx: ReturnType<typeof createTestContext>
): Promise<T> {
  const caller = testRouter.createCaller(ctx as never);
  const parts = procedure.split('.');
  let fn = caller as Record<string, unknown>;
  for (const part of parts) {
    fn = fn[part] as Record<string, unknown>;
  }
  return (fn as (input: unknown) => Promise<T>)(input);
}

// Get references to mocked models
const mockAgentSessionModel = vi.mocked(agentSessionModel);
const mockAgentFileChangeModel = vi.mocked(agentFileChangeModel);

describe('Agent API Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================
  // STATUS ENDPOINT
  // ===========================================
  describe('status', () => {
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    
    beforeEach(() => {
      // Set API keys for status tests
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      process.env.OPENAI_API_KEY = 'test-openai-key';
    });
    
    afterEach(() => {
      // Restore original keys
      if (originalAnthropicKey) {
        process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
      if (originalOpenAIKey) {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    it('should return AI status', async () => {
      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<{ available: boolean; model: string; provider: string }>(
        'agent.status',
        {},
        ctx
      );

      expect(result.available).toBe(true);
      // Anthropic is preferred when available
      expect(result.provider).toBe('anthropic');
    });

    it('should require authentication', async () => {
      const ctx = createTestContext(); // No user

      await expect(
        callProcedure('agent.status', {}, ctx)
      ).rejects.toThrow('Not authenticated');
    });
  });

  // ===========================================
  // SESSION MANAGEMENT
  // ===========================================
  describe('createSession', () => {
    it('should create a new session', async () => {
      const mockSession = {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockAgentSessionModel.create.mockResolvedValue(mockSession as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<typeof mockSession>(
        'agent.createSession',
        {},
        ctx
      );

      expect(result.id).toBe(TEST_SESSION_ID);
      expect(mockAgentSessionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER_ID,
          status: 'active',
        })
      );
    });

    it('should create session with repo context', async () => {
      const mockSession = {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        repoId: TEST_REPO_ID,
        branch: 'main',
        status: 'active',
      };
      mockAgentSessionModel.create.mockResolvedValue(mockSession as never);

      const ctx = createTestContext(TEST_USER_ID);
      await callProcedure(
        'agent.createSession',
        { repoId: TEST_REPO_ID, branch: 'main' },
        ctx
      );

      expect(mockAgentSessionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          repoId: TEST_REPO_ID,
          branch: 'main',
        })
      );
    });

    it('should require authentication', async () => {
      const ctx = createTestContext(); // No user

      await expect(
        callProcedure('agent.createSession', {}, ctx)
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('getSession', () => {
    it('should return session for owner', async () => {
      const mockSession = {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        status: 'active',
      };
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<typeof mockSession>(
        'agent.getSession',
        { sessionId: TEST_SESSION_ID },
        ctx
      );

      expect(result.id).toBe(TEST_SESSION_ID);
    });

    it('should throw NOT_FOUND for non-existent session', async () => {
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(undefined as never);

      const ctx = createTestContext(TEST_USER_ID);

      await expect(
        callProcedure('agent.getSession', { sessionId: TEST_SESSION_ID_2 }, ctx)
      ).rejects.toThrow('Session not found');
    });
  });

  describe('listSessions', () => {
    it('should list user sessions', async () => {
      const mockSessions = [
        { id: TEST_SESSION_ID, userId: TEST_USER_ID },
        { id: TEST_SESSION_ID_2, userId: TEST_USER_ID },
      ];
      mockAgentSessionModel.listByUser.mockResolvedValue(mockSessions as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<typeof mockSessions>(
        'agent.listSessions',
        {},
        ctx
      );

      expect(result).toHaveLength(2);
      expect(mockAgentSessionModel.listByUser).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.any(Object)
      );
    });

    it('should filter by status', async () => {
      mockAgentSessionModel.listByUser.mockResolvedValue([] as never);

      const ctx = createTestContext(TEST_USER_ID);
      await callProcedure('agent.listSessions', { status: 'active' }, ctx);

      expect(mockAgentSessionModel.listByUser).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ status: 'active' })
      );
    });
  });

  describe('updateSession', () => {
    it('should update session title', async () => {
      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID };
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);
      mockAgentSessionModel.update.mockResolvedValue({
        ...mockSession,
        title: 'New Title',
      } as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<{ title: string }>(
        'agent.updateSession',
        { sessionId: TEST_SESSION_ID, title: 'New Title' },
        ctx
      );

      expect(result.title).toBe('New Title');
    });

    it('should update session status', async () => {
      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID };
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);
      mockAgentSessionModel.update.mockResolvedValue({
        ...mockSession,
        status: 'completed',
      } as never);

      const ctx = createTestContext(TEST_USER_ID);
      await callProcedure(
        'agent.updateSession',
        { sessionId: TEST_SESSION_ID, status: 'completed' },
        ctx
      );

      expect(mockAgentSessionModel.update).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        expect.objectContaining({ status: 'completed' })
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete session', async () => {
      mockAgentSessionModel.findByIdForUser.mockResolvedValue({ id: TEST_SESSION_ID } as never);
      mockAgentSessionModel.delete.mockResolvedValue(true as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<{ success: boolean }>(
        'agent.deleteSession',
        { sessionId: TEST_SESSION_ID },
        ctx
      );

      expect(result.success).toBe(true);
      expect(mockAgentSessionModel.delete).toHaveBeenCalledWith(TEST_SESSION_ID);
    });
  });

  // ===========================================
  // CHAT ENDPOINT
  // ===========================================
  describe('chat', () => {
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    
    beforeEach(() => {
      // Set API key for chat tests
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      // Clear mock data
      mockMessages.clear();
      mockThreads.clear();
    });
    
    afterEach(() => {
      // Restore original key
      if (originalAnthropicKey) {
        process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('should send message and get response using Mastra Memory', async () => {
      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID, status: 'active' };
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<{
        threadId: string;
        response: string;
      }>(
        'agent.chat',
        { sessionId: TEST_SESSION_ID, message: 'Hello, can you help me?' },
        ctx
      );

      // Now returns threadId and response instead of separate message objects
      expect(result.threadId).toBe(TEST_SESSION_ID);
      expect(result.response).toBe('I can help you with that!');
      
      // Verify Mastra Memory was used
      expect(mockMemory.saveThread).toHaveBeenCalled();
    });

    it('should throw error when AI is not configured', async () => {
      // Remove API key
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID, status: 'active' };
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);

      const ctx = createTestContext(TEST_USER_ID);

      await expect(
        callProcedure('agent.chat', { sessionId: TEST_SESSION_ID, message: 'Hello' }, ctx)
      ).rejects.toThrow('AI is not configured');
    });

    it('should throw error for inactive session', async () => {
      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID, status: 'completed' };
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);

      const ctx = createTestContext(TEST_USER_ID);

      await expect(
        callProcedure('agent.chat', { sessionId: TEST_SESSION_ID, message: 'Hello' }, ctx)
      ).rejects.toThrow('Session is not active');
    });

    it('should use Mastra threadId for conversation context', async () => {
      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID, status: 'active' };
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);

      const ctx = createTestContext(TEST_USER_ID);
      await callProcedure(
        'agent.chat',
        { sessionId: TEST_SESSION_ID, message: 'Follow up question' },
        ctx
      );

      // Verify agent was called with threadId for Mastra memory
      expect(getTsgitAgent().generate).toHaveBeenCalledWith(
        'Follow up question',
        expect.objectContaining({
          threadId: TEST_SESSION_ID,
          resourceId: expect.any(String),
        })
      );
    });
  });

  // ===========================================
  // FILE CHANGES
  // ===========================================
  describe('getPendingChanges', () => {
    it('should return pending file changes', async () => {
      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID };
      const mockChanges = [
        { id: TEST_CHANGE_ID, filePath: 'src/index.ts', changeType: 'edit' },
      ];
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);
      mockAgentFileChangeModel.listPendingBySession.mockResolvedValue(mockChanges as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<typeof mockChanges>(
        'agent.getPendingChanges',
        { sessionId: TEST_SESSION_ID },
        ctx
      );

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe('src/index.ts');
    });
  });

  describe('approveChange', () => {
    it('should approve a file change', async () => {
      const mockChange = { id: TEST_CHANGE_ID, sessionId: TEST_SESSION_ID };
      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID };
      mockAgentFileChangeModel.findById.mockResolvedValue(mockChange as never);
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);
      mockAgentFileChangeModel.approve.mockResolvedValue({
        ...mockChange,
        approved: true,
      } as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<{ approved: boolean }>(
        'agent.approveChange',
        { changeId: TEST_CHANGE_ID },
        ctx
      );

      expect(result.approved).toBe(true);
    });
  });

  describe('rejectChange', () => {
    it('should reject a file change', async () => {
      const mockChange = { id: TEST_CHANGE_ID, sessionId: TEST_SESSION_ID };
      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID };
      mockAgentFileChangeModel.findById.mockResolvedValue(mockChange as never);
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);
      mockAgentFileChangeModel.reject.mockResolvedValue({
        ...mockChange,
        approved: false,
      } as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<{ approved: boolean }>(
        'agent.rejectChange',
        { changeId: TEST_CHANGE_ID },
        ctx
      );

      expect(result.approved).toBe(false);
    });
  });

  describe('approveAllChanges', () => {
    it('should approve all pending changes', async () => {
      const mockSession = { id: TEST_SESSION_ID, userId: TEST_USER_ID };
      mockAgentSessionModel.findByIdForUser.mockResolvedValue(mockSession as never);
      mockAgentFileChangeModel.approveAllForSession.mockResolvedValue(3 as never);

      const ctx = createTestContext(TEST_USER_ID);
      const result = await callProcedure<{ approved: number }>(
        'agent.approveAllChanges',
        { sessionId: TEST_SESSION_ID },
        ctx
      );

      expect(result.approved).toBe(3);
    });
  });
});
