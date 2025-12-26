/**
 * Git HTTP Protocol Integration Tests
 * 
 * Tests for the Git Smart HTTP endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  stopTestServer,
  API_URL,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('Git HTTP Protocol', () => {
  let sessionToken: string;
  let testUsername: string;
  let repoName: string;

  beforeAll(async () => {
    await startTestServer();
    
    // Create a test user
    testUsername = uniqueUsername('githttp');
    const api = createTestClient();
    
    const result = await api.auth.register.mutate({
      username: testUsername,
      email: uniqueEmail('githttp'),
      password: 'password123',
    });
    
    sessionToken = result.sessionId;
    
    // Create a test repo via tRPC
    repoName = uniqueRepoName('git-test');
    const authApi = createAuthenticatedClient(sessionToken);
    await authApi.repos.create.mutate({
      name: repoName,
      description: 'Test repo for git protocol tests',
      isPrivate: false,
    });
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Ref Discovery', () => {
    it('returns refs for upload-pack (clone/fetch)', async () => {
      const response = await fetch(
        `${API_URL}/${testUsername}/${repoName}.git/info/refs?service=git-upload-pack`
      );
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe(
        'application/x-git-upload-pack-advertisement'
      );
    });

    it('returns refs for receive-pack (push)', async () => {
      const response = await fetch(
        `${API_URL}/${testUsername}/${repoName}.git/info/refs?service=git-receive-pack`
      );
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe(
        'application/x-git-receive-pack-advertisement'
      );
    });

    it('returns 400 for dumb HTTP (no service param)', async () => {
      const response = await fetch(
        `${API_URL}/${testUsername}/${repoName}.git/info/refs`
      );
      
      expect(response.status).toBe(400);
    });

    it('returns 400 for unknown service', async () => {
      const response = await fetch(
        `${API_URL}/${testUsername}/${repoName}.git/info/refs?service=unknown`
      );
      
      expect(response.status).toBe(400);
    });

    it('auto-creates repository on receive-pack if not exists', async () => {
      const newRepoName = uniqueRepoName('auto-create');
      
      const response = await fetch(
        `${API_URL}/${testUsername}/${newRepoName}.git/info/refs?service=git-receive-pack`
      );
      
      // Should succeed and create the repo
      expect(response.ok).toBe(true);
    });
  });

  describe('Upload Pack (Clone/Fetch)', () => {
    it('handles upload-pack POST request', async () => {
      // First get refs
      const refsResponse = await fetch(
        `${API_URL}/${testUsername}/${repoName}.git/info/refs?service=git-upload-pack`
      );
      expect(refsResponse.ok).toBe(true);

      // For an empty repo, upload-pack should handle gracefully
      const response = await fetch(
        `${API_URL}/${testUsername}/${repoName}.git/git-upload-pack`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-git-upload-pack-request',
          },
          body: Buffer.from('0000'), // Empty request (flush packet)
        }
      );
      
      // Should return 400 since no wants were provided
      expect(response.status).toBe(400);
    });
  });

  describe('Receive Pack (Push)', () => {
    it('handles receive-pack POST request structure', async () => {
      // First get refs
      const refsResponse = await fetch(
        `${API_URL}/${testUsername}/${repoName}.git/info/refs?service=git-receive-pack`
      );
      expect(refsResponse.ok).toBe(true);

      // Test that the endpoint accepts POST requests
      const response = await fetch(
        `${API_URL}/${testUsername}/${repoName}.git/git-receive-pack`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-git-receive-pack-request',
          },
          body: Buffer.from('0000'), // Empty flush packet - no commands
        }
      );
      
      // Should succeed but with no updates
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe(
        'application/x-git-receive-pack-result'
      );
    });
  });

  describe('Error Handling', () => {
    it('auto-creates repository on upload-pack for non-existent repo', async () => {
      // Note: The server auto-creates repos on both upload-pack and receive-pack
      // This is intentional behavior to simplify git operations
      const fakeRepoName = 'auto-created-on-upload-' + Date.now();
      
      const response = await fetch(
        `${API_URL}/${testUsername}/${fakeRepoName}.git/info/refs?service=git-upload-pack`
      );
      
      // Server auto-creates the repo and returns 200
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe(
        'application/x-git-upload-pack-advertisement'
      );
    });
  });
});
