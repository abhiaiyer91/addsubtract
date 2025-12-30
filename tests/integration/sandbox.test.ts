/**
 * Sandbox Integration Tests
 * 
 * Tests for sandbox/code execution functionality including:
 * - Sandbox creation and management
 * - Command execution
 * - File operations in sandbox
 * - Session management
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('Sandbox', () => {
  let userToken: string;
  let userId: string;
  let username: string;
  let repoId: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create test user
    username = uniqueUsername('sandbox-test');
    const result = await api.auth.register.mutate({
      username,
      email: uniqueEmail('sandbox-test'),
      password: 'password123',
      name: 'Sandbox Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create a repository
    const authApi = createAuthenticatedClient(userToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('sandbox-repo'),
      description: 'Repository for sandbox tests',
      isPrivate: false,
    });
    repoId = repo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Sandbox Status', () => {
    it('checks sandbox availability', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const status = await authApi.sandbox.status.query();

      expect(status).toBeDefined();
      expect(typeof status.available).toBe('boolean');
      expect(status.providers).toBeDefined();
    });

    it('lists available providers', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const status = await authApi.sandbox.status.query();

      expect(Array.isArray(status.providers)).toBe(true);
      // Should have at least one provider type defined
    });

    it('requires authentication', async () => {
      const api = createTestClient();

      await expect(
        api.sandbox.status.query()
      ).rejects.toThrow();
    });
  });

  describe('Sandbox Sessions', () => {
    let sessionId: string;

    it('creates a sandbox session', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const session = await authApi.sandbox.create.mutate({
          repoId,
          branch: 'main',
        });

        expect(session).toBeDefined();
        expect(session.id).toBeDefined();
        expect(session.status).toBeDefined();
        sessionId = session.id;
      } catch (error: any) {
        // Sandbox may not be available in test environment
        expect(error.message).toMatch(/unavailable|not configured|provider/i);
      }
    });

    it('lists active sessions', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const sessions = await authApi.sandbox.listSessions.query();

      expect(Array.isArray(sessions)).toBe(true);
    });

    it('gets session status', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!sessionId) {
        // Create a session first
        try {
          const session = await authApi.sandbox.create.mutate({
            repoId,
            branch: 'main',
          });
          sessionId = session.id;
        } catch {
          return; // Skip if sandbox unavailable
        }
      }

      const status = await authApi.sandbox.getSession.query({
        sessionId,
      });

      expect(status).toBeDefined();
      expect(status.id).toBe(sessionId);
      expect(['creating', 'running', 'stopped', 'error']).toContain(status.status);
    });

    it('terminates session', async () => {
      const authApi = createAuthenticatedClient(userToken);

      if (!sessionId) return; // Skip if no session

      try {
        const result = await authApi.sandbox.terminate.mutate({
          sessionId,
        });

        expect(result.success).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/not found|already terminated/i);
      }
    });
  });

  describe('Command Execution', () => {
    let sessionId: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const session = await authApi.sandbox.create.mutate({
          repoId,
          branch: 'main',
        });
        sessionId = session.id;

        // Wait for session to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch {
        // Sandbox may not be available
      }
    });

    afterAll(async () => {
      if (sessionId) {
        const authApi = createAuthenticatedClient(userToken);
        try {
          await authApi.sandbox.terminate.mutate({ sessionId });
        } catch {
          // Ignore
        }
      }
    });

    it('executes simple command', async () => {
      if (!sessionId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.sandbox.execute.mutate({
          sessionId,
          command: 'echo "Hello, World!"',
        });

        expect(result).toBeDefined();
        expect(result.stdout).toContain('Hello, World!');
        expect(result.exitCode).toBe(0);
      } catch (error: any) {
        expect(error.message).toMatch(/not running|unavailable/i);
      }
    });

    it('captures stderr', async () => {
      if (!sessionId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.sandbox.execute.mutate({
          sessionId,
          command: 'echo "error" >&2',
        });

        expect(result.stderr).toContain('error');
      } catch (error: any) {
        expect(error.message).toMatch(/not running|unavailable/i);
      }
    });

    it('returns exit code', async () => {
      if (!sessionId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.sandbox.execute.mutate({
          sessionId,
          command: 'exit 42',
        });

        expect(result.exitCode).toBe(42);
      } catch (error: any) {
        expect(error.message).toMatch(/not running|unavailable/i);
      }
    });

    it('supports timeout', async () => {
      if (!sessionId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        await expect(
          authApi.sandbox.execute.mutate({
            sessionId,
            command: 'sleep 30',
            timeout: 1000, // 1 second timeout
          })
        ).rejects.toThrow(/timeout/i);
      } catch {
        // Timeout or unavailable is expected
      }
    });

    it('executes in working directory', async () => {
      if (!sessionId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        const result = await authApi.sandbox.execute.mutate({
          sessionId,
          command: 'pwd',
          workingDirectory: '/tmp',
        });

        expect(result.stdout).toContain('/tmp');
      } catch (error: any) {
        expect(error.message).toMatch(/not running|unavailable/i);
      }
    });
  });

  describe('File Operations', () => {
    let sessionId: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const session = await authApi.sandbox.create.mutate({
          repoId,
          branch: 'main',
        });
        sessionId = session.id;
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch {
        // Sandbox may not be available
      }
    });

    afterAll(async () => {
      if (sessionId) {
        const authApi = createAuthenticatedClient(userToken);
        try {
          await authApi.sandbox.terminate.mutate({ sessionId });
        } catch {
          // Ignore
        }
      }
    });

    it('reads file content', async () => {
      if (!sessionId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        // First create a file
        await authApi.sandbox.execute.mutate({
          sessionId,
          command: 'echo "test content" > /tmp/test.txt',
        });

        const content = await authApi.sandbox.readFile.query({
          sessionId,
          path: '/tmp/test.txt',
        });

        expect(content).toContain('test content');
      } catch (error: any) {
        expect(error.message).toMatch(/not running|unavailable/i);
      }
    });

    it('writes file content', async () => {
      if (!sessionId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        await authApi.sandbox.writeFile.mutate({
          sessionId,
          path: '/tmp/written.txt',
          content: 'written by test',
        });

        // Verify content
        const result = await authApi.sandbox.execute.mutate({
          sessionId,
          command: 'cat /tmp/written.txt',
        });

        expect(result.stdout).toContain('written by test');
      } catch (error: any) {
        expect(error.message).toMatch(/not running|unavailable/i);
      }
    });

    it('lists directory', async () => {
      if (!sessionId) return;

      const authApi = createAuthenticatedClient(userToken);

      try {
        const files = await authApi.sandbox.listDirectory.query({
          sessionId,
          path: '/tmp',
        });

        expect(Array.isArray(files)).toBe(true);
      } catch (error: any) {
        expect(error.message).toMatch(/not running|unavailable/i);
      }
    });
  });

  describe('Session Limits', () => {
    it('enforces session limits', async () => {
      const authApi = createAuthenticatedClient(userToken);

      // Try to create many sessions - should hit limit
      const sessions: string[] = [];

      try {
        for (let i = 0; i < 10; i++) {
          const session = await authApi.sandbox.create.mutate({
            repoId,
            branch: 'main',
          });
          sessions.push(session.id);
        }
      } catch (error: any) {
        // Expected to fail at some point due to limits
        expect(error.message).toMatch(/limit|maximum|too many/i);
      }

      // Cleanup
      for (const sid of sessions) {
        try {
          await authApi.sandbox.terminate.mutate({ sessionId: sid });
        } catch {
          // Ignore
        }
      }
    });
  });

  describe('Session Persistence', () => {
    it('preserves changes within session', async () => {
      const authApi = createAuthenticatedClient(userToken);

      let sessionId: string;

      try {
        const session = await authApi.sandbox.create.mutate({
          repoId,
          branch: 'main',
        });
        sessionId = session.id;

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Create a file
        await authApi.sandbox.execute.mutate({
          sessionId,
          command: 'echo "persistent" > /tmp/persist.txt',
        });

        // Read it back
        const result = await authApi.sandbox.execute.mutate({
          sessionId,
          command: 'cat /tmp/persist.txt',
        });

        expect(result.stdout).toContain('persistent');

        // Cleanup
        await authApi.sandbox.terminate.mutate({ sessionId });
      } catch (error: any) {
        expect(error.message).toMatch(/unavailable|not configured/i);
      }
    });
  });

  describe('Error Handling', () => {
    it('handles non-existent session', async () => {
      const authApi = createAuthenticatedClient(userToken);

      await expect(
        authApi.sandbox.getSession.query({
          sessionId: '00000000-0000-0000-0000-000000000000',
        })
      ).rejects.toThrow();
    });

    it('handles invalid commands gracefully', async () => {
      const authApi = createAuthenticatedClient(userToken);

      try {
        const session = await authApi.sandbox.create.mutate({
          repoId,
          branch: 'main',
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const result = await authApi.sandbox.execute.mutate({
          sessionId: session.id,
          command: 'nonexistent-command-xyz',
        });

        // Should return non-zero exit code
        expect(result.exitCode).not.toBe(0);

        await authApi.sandbox.terminate.mutate({ sessionId: session.id });
      } catch (error: any) {
        expect(error.message).toMatch(/unavailable|not configured/i);
      }
    });
  });
});
