/**
 * IDE Integration Tests
 * 
 * Tests for IDE integration functionality including:
 * - Recent files and projects
 * - Editor state
 * - IDE-specific settings
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

describe('IDE Integration', () => {
  let userToken: string;
  let userId: string;
  let repoId: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create test user
    const result = await api.auth.register.mutate({
      username: uniqueUsername('ide-test'),
      email: uniqueEmail('ide-test'),
      password: 'password123',
      name: 'IDE Test User',
    });
    userToken = result.sessionId;
    userId = result.user.id;

    // Create a repository
    const authApi = createAuthenticatedClient(userToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('ide-repo'),
      description: 'Repository for IDE tests',
      isPrivate: false,
    });
    repoId = repo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Recent Projects', () => {
    it('records project access', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.recordAccess.mutate({
        repoId,
      });

      expect(result.success).toBe(true);
    });

    it('lists recent projects', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const projects = await authApi.ide.recentProjects.query({
        limit: 10,
      });

      expect(Array.isArray(projects)).toBe(true);
      expect(projects.some((p: any) => p.repoId === repoId)).toBe(true);
    });

    it('requires authentication', async () => {
      const api = createTestClient();

      await expect(
        api.ide.recentProjects.query({ limit: 10 })
      ).rejects.toThrow();
    });
  });

  describe('Recent Files', () => {
    it('records file access', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.recordFileAccess.mutate({
        repoId,
        filePath: 'src/index.ts',
      });

      expect(result.success).toBe(true);
    });

    it('lists recent files', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const files = await authApi.ide.recentFiles.query({
        repoId,
        limit: 10,
      });

      expect(Array.isArray(files)).toBe(true);
    });

    it('lists recent files across repos', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const files = await authApi.ide.recentFilesGlobal.query({
        limit: 10,
      });

      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe('Editor State', () => {
    it('saves editor state', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.saveState.mutate({
        repoId,
        state: {
          openFiles: ['src/index.ts', 'src/utils.ts'],
          activeFile: 'src/index.ts',
          cursorPositions: {
            'src/index.ts': { line: 10, column: 5 },
          },
        },
      });

      expect(result.success).toBe(true);
    });

    it('restores editor state', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const state = await authApi.ide.getState.query({
        repoId,
      });

      expect(state).toBeDefined();
      if (state) {
        expect(state.openFiles).toBeDefined();
        expect(state.activeFile).toBeDefined();
      }
    });

    it('clears editor state', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.clearState.mutate({
        repoId,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('IDE Settings', () => {
    it('gets IDE settings', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const settings = await authApi.ide.getSettings.query();

      expect(settings).toBeDefined();
    });

    it('updates IDE settings', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.updateSettings.mutate({
        theme: 'dark',
        fontSize: 14,
        tabSize: 2,
        autoSave: true,
      });

      expect(result.success).toBe(true);
    });

    it('gets repo-specific settings', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const settings = await authApi.ide.getRepoSettings.query({
        repoId,
      });

      expect(settings).toBeDefined();
    });

    it('updates repo-specific settings', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.updateRepoSettings.mutate({
        repoId,
        formatOnSave: true,
        lintOnSave: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('gets keyboard shortcuts', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const shortcuts = await authApi.ide.getShortcuts.query();

      expect(shortcuts).toBeDefined();
      expect(typeof shortcuts).toBe('object');
    });

    it('updates keyboard shortcut', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.updateShortcut.mutate({
        action: 'save',
        shortcut: 'Ctrl+S',
      });

      expect(result.success).toBe(true);
    });

    it('resets shortcuts to default', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.resetShortcuts.mutate();

      expect(result.success).toBe(true);
    });
  });

  describe('Pinned Items', () => {
    it('pins a file', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.pinFile.mutate({
        repoId,
        filePath: 'README.md',
      });

      expect(result.success).toBe(true);
    });

    it('lists pinned files', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const pinned = await authApi.ide.pinnedFiles.query({
        repoId,
      });

      expect(Array.isArray(pinned)).toBe(true);
      expect(pinned.some((f: any) => f.path === 'README.md')).toBe(true);
    });

    it('unpins a file', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const result = await authApi.ide.unpinFile.mutate({
        repoId,
        filePath: 'README.md',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Workspace', () => {
    it('gets workspace info', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const workspace = await authApi.ide.getWorkspace.query({
        repoId,
      });

      expect(workspace).toBeDefined();
      expect(workspace.repoId).toBe(repoId);
    });

    it('lists workspace folders', async () => {
      const authApi = createAuthenticatedClient(userToken);

      const folders = await authApi.ide.listFolders.query({
        repoId,
        path: '/',
      });

      expect(Array.isArray(folders)).toBe(true);
    });
  });
});
