/**
 * AI Agent Integration Tests
 * 
 * Tests for AI-powered coding agent functionality including:
 * - Agent conversations
 * - Code generation
 * - PR review
 * - Issue triage
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupIntegrationTest,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

// TODO: Tests use conversation-based API (types, listConversations, startConversation)
// Agent router uses session-based API (status, getModes, createSession, listSessions)
describe.skip('AI Agent', () => {
  setupIntegrationTest();

  let userToken: string;
  let userId: string;
  let repoId: string;
  let prId: string;
  let issueId: string;

  beforeAll(async () => {
    const api = createTestClient();

    // Create test user
    const result = await api.auth.register.mutate({
      username: uniqueUsername('ai-agent-test'),
      email: uniqueEmail('ai-agent-test'),
      password: 'password123',
      name: 'AI Agent Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create a repository
    const authApi = createAuthenticatedClient(userToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('ai-agent-repo'),
      description: 'Repository for AI agent tests',
      isPrivate: false,
    });
    repoId = repo.id;

    // Create an issue for triage
    const issue = await authApi.issues.create.mutate({
      repoId,
      title: 'Bug: Application crashes on startup',
      body: 'The application throws a NullPointerException when starting up without config file.',
    });
    issueId = issue.id;

    // Create a PR for review
    const pr = await authApi.pulls.create.mutate({
      repoId,
      title: 'Add error handling',
      body: 'This PR adds proper error handling for missing config files.',
      sourceBranch: 'fix-error-handling',
      targetBranch: 'main',
      headSha: 'a'.repeat(64),
      baseSha: 'b'.repeat(64),
      isDraft: false,
    });
    prId = pr.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Agent Status', () => {
    it('checks agent availability', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const status = await authApi.agent.status.query();

      expect(status).toBeDefined();
      expect(typeof status.available).toBe('boolean');
    });

    it('lists available agent types', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const types = await authApi.agent.types.query();

      expect(Array.isArray(types)).toBe(true);
      // Should include different agent types
    });

    it('requires authentication', async () => {
      const api = createTestClient();

      await expect(
        api.agent.status.query()
      ).rejects.toThrow();
    });
  });

  describe('Conversation Management', () => {
    let conversationId: string;

    it('starts a new conversation', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const conversation = await authApi.agent.startConversation.mutate({
          repoId,
          agentType: 'code',
        });

        expect(conversation).toBeDefined();
        expect(conversation.id).toBeDefined();
        conversationId = conversation.id;
      } catch (error: any) {
        // AI may not be configured in test environment
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('lists conversations', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const conversations = await authApi.agent.listConversations.query({
        repoId,
      });

      expect(Array.isArray(conversations)).toBe(true);
    });

    it('gets conversation history', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!conversationId) return;

      const history = await authApi.agent.getConversation.query({
        conversationId,
      });

      expect(history).toBeDefined();
      expect(history.id).toBe(conversationId);
      expect(Array.isArray(history.messages)).toBe(true);
    });

    it('deletes conversation', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!conversationId) return;

      const result = await authApi.agent.deleteConversation.mutate({
        conversationId,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Chat Messages', () => {
    let conversationId: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const conversation = await authApi.agent.startConversation.mutate({
          repoId,
          agentType: 'code',
        });
        conversationId = conversation.id;
      } catch {
        // AI may not be available
      }
    });

    it('sends a message', async () => {
      if (!conversationId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        const response = await authApi.agent.sendMessage.mutate({
          conversationId,
          message: 'What files are in this repository?',
        });

        expect(response).toBeDefined();
        expect(response.content).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });

    it('streams response', async () => {
      if (!conversationId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        const stream = await authApi.agent.streamMessage.mutate({
          conversationId,
          message: 'Explain this codebase',
        });

        expect(stream).toBeDefined();
        expect(stream.streamId).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });
  });

  describe('Code Generation', () => {
    it('generates code from description', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.ai.generateCode.mutate({
          repoId,
          description: 'Create a function that calculates factorial',
          language: 'typescript',
        });

        expect(result).toBeDefined();
        expect(result.code).toBeDefined();
        expect(result.code).toContain('function');
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('generates with context', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.ai.generateCode.mutate({
          repoId,
          description: 'Add a method to calculate sum',
          language: 'typescript',
          context: {
            files: ['src/utils/math.ts'],
          },
        });

        expect(result.code).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });
  });

  describe('PR Review', () => {
    it('triggers AI review', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.ai.reviewPr.mutate({
          prId,
        });

        expect(result).toBeDefined();
        expect(result.status).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('gets review status', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const status = await authApi.ai.getReviewStatus.query({
        prId,
      });

      expect(status).toBeDefined();
      expect(['pending', 'processing', 'completed', 'failed', 'none']).toContain(status.status);
    });

    it('configures auto-review', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ai.configureAutoReview.mutate({
        repoId,
        enabled: true,
        options: {
          reviewOnOpen: true,
          reviewOnUpdate: false,
        },
      });

      expect(result.enabled).toBe(true);
    });
  });

  describe('Issue Triage', () => {
    it('triggers issue triage', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.triageAgent.triage.mutate({
          issueId,
        });

        expect(result).toBeDefined();
        expect(result.labels).toBeDefined();
        expect(Array.isArray(result.labels)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });

    it('suggests assignees', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.triageAgent.suggestAssignees.query({
          issueId,
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result.suggestions)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });

    it('suggests labels', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.triageAgent.suggestLabels.query({
          issueId,
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result.labels)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable/i);
      }
    });

    it('configures auto-triage', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.triageAgent.configure.mutate({
        repoId,
        enabled: true,
        autoLabel: true,
        autoAssign: false,
      });

      expect(result.enabled).toBe(true);
    });
  });

  describe('AI API Keys', () => {
    it('lists user AI keys', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const keys = await authApi.userAiKeys.list.query();

      expect(Array.isArray(keys)).toBe(true);
    });

    it('adds AI key', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.userAiKeys.add.mutate({
          provider: 'openai',
          apiKey: 'sk-test-key-12345',
          name: 'Test Key',
        });

        expect(result.success).toBe(true);
      } catch (error: any) {
        // Key validation may fail
        expect(error.message).toMatch(/invalid|validation/i);
      }
    });

    it('sets default key', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const keys = await authApi.userAiKeys.list.query();

      if (keys.length > 0) {
        const result = await authApi.userAiKeys.setDefault.mutate({
          keyId: keys[0].id,
        });

        expect(result.success).toBe(true);
      }
    });

    it('removes AI key', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const keys = await authApi.userAiKeys.list.query();

      if (keys.length > 0) {
        const result = await authApi.userAiKeys.remove.mutate({
          keyId: keys[0].id,
        });

        expect(result.success).toBe(true);
      }
    });
  });

  describe('Repository AI Keys', () => {
    it('lists repo AI keys', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const keys = await authApi.repoAiKeys.list.query({ repoId });

      expect(Array.isArray(keys)).toBe(true);
    });

    it('adds repo AI key', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.repoAiKeys.add.mutate({
          repoId,
          provider: 'anthropic',
          apiKey: 'sk-ant-test-key-12345',
          name: 'Repo Test Key',
        });

        expect(result.success).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/invalid|validation/i);
      }
    });
  });

  describe('Completion', () => {
    it('gets code completion', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.completion.complete.mutate({
          repoId,
          filePath: 'src/index.ts',
          prefix: 'function add(a: number, b: number) {\n  return ',
          suffix: '\n}',
        });

        expect(result).toBeDefined();
        expect(result.completion).toBeDefined();
      } catch (error: any) {
        expect(error.message).toMatch(/not configured|unavailable|api key/i);
      }
    });
  });

  describe('MCP (Model Context Protocol)', () => {
    it('lists MCP servers', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const servers = await authApi.mcp.listServers.query();

      expect(Array.isArray(servers)).toBe(true);
    });

    it('lists available tools', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const tools = await authApi.mcp.listTools.query();

      expect(Array.isArray(tools)).toBe(true);
    });
  });
});
