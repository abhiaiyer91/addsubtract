/**
 * Collaborators Integration Tests
 * 
 * Tests for repository collaborator functionality including:
 * - Adding/removing collaborators
 * - Permission levels
 * - Invitation workflow
 * - Access control
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

describe('Collaborators', () => {
  let ownerToken: string;
  let ownerId: string;
  let ownerUsername: string;
  let collaboratorToken: string;
  let collaboratorId: string;
  let collaboratorUsername: string;
  let outsiderToken: string;
  let outsiderId: string;
  let repoId: string;
  let privateRepoId: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create repo owner
    ownerUsername = uniqueUsername('collab-owner');
    const ownerResult = await api.auth.register.mutate({
      username: ownerUsername,
      email: uniqueEmail('collab-owner'),
      password: 'password123',
      name: 'Collaborator Test Owner',
    });
    ownerToken = ownerResult.sessionId;
    ownerId = ownerResult.user.id;

    // Create collaborator
    collaboratorUsername = uniqueUsername('collaborator');
    const collabResult = await api.auth.register.mutate({
      username: collaboratorUsername,
      email: uniqueEmail('collaborator'),
      password: 'password123',
      name: 'Collaborator User',
    });
    collaboratorToken = collabResult.sessionId;
    collaboratorId = collabResult.user.id;

    // Create outsider (no access)
    const outsiderResult = await api.auth.register.mutate({
      username: uniqueUsername('outsider'),
      email: uniqueEmail('outsider'),
      password: 'password123',
      name: 'Outsider User',
    });
    outsiderToken = outsiderResult.sessionId;
    outsiderId = outsiderResult.user.id;

    // Create public repository
    const authApi = createAuthenticatedClient(ownerToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('collab-test'),
      description: 'Repository for collaborator tests',
      isPrivate: false,
    });
    repoId = repo.id;

    // Create private repository
    const privateRepo = await authApi.repos.create.mutate({
      name: uniqueRepoName('private-collab'),
      description: 'Private repository for collaborator tests',
      isPrivate: true,
    });
    privateRepoId = privateRepo.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Adding Collaborators', () => {
    it('adds collaborator with read permission', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.repos.addCollaborator.mutate({
        repoId,
        username: collaboratorUsername,
        permission: 'read',
      });

      expect(result.success).toBe(true);
    });

    it('lists collaborators', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const collaborators = await authApi.repos.collaborators.query({
        repoId,
      });

      expect(Array.isArray(collaborators)).toBe(true);
      expect(collaborators.some((c: any) => c.userId === collaboratorId)).toBe(true);
    });

    it('fails to add non-existent user', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.repos.addCollaborator.mutate({
          repoId,
          username: 'nonexistent-user-xyz123',
          permission: 'read',
        })
      ).rejects.toThrow();
    });

    it('requires owner/admin permission to add collaborator', async () => {
      const collabApi = createAuthenticatedClient(collaboratorToken);

      // Collaborator with read access can't add others
      await expect(
        collabApi.repos.addCollaborator.mutate({
          repoId,
          username: uniqueUsername('another-collab'),
          permission: 'read',
        })
      ).rejects.toThrow();
    });
  });

  describe('Permission Levels', () => {
    it('updates collaborator permission', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.repos.updateCollaborator.mutate({
        repoId,
        userId: collaboratorId,
        permission: 'write',
      });

      expect(result.success).toBe(true);
    });

    it('verifies read permission', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Set to read
      await authApi.repos.updateCollaborator.mutate({
        repoId,
        userId: collaboratorId,
        permission: 'read',
      });

      // Collaborator can read
      const collabApi = createAuthenticatedClient(collaboratorToken);
      const repo = await collabApi.repos.get.query({
        owner: ownerUsername,
        repo: await authApi.repos.getById.query({ repoId }).then(r => r.name),
      });
      expect(repo).toBeDefined();
    });

    it('verifies write permission allows issue creation', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Set to write
      await authApi.repos.updateCollaborator.mutate({
        repoId,
        userId: collaboratorId,
        permission: 'write',
      });

      // Collaborator can create issues
      const collabApi = createAuthenticatedClient(collaboratorToken);
      const issue = await collabApi.issues.create.mutate({
        repoId,
        title: 'Collaborator Issue',
        body: 'Created by collaborator',
      });
      expect(issue).toBeDefined();
    });

    it('verifies admin permission allows collaborator management', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Set to admin
      await authApi.repos.updateCollaborator.mutate({
        repoId,
        userId: collaboratorId,
        permission: 'admin',
      });

      // Collaborator can add others now
      const collabApi = createAuthenticatedClient(collaboratorToken);
      
      // Create a new user to add
      const api = createTestClient();
      const newUser = await api.auth.register.mutate({
        username: uniqueUsername('new-collab'),
        email: uniqueEmail('new-collab'),
        password: 'password123',
      });

      const result = await collabApi.repos.addCollaborator.mutate({
        repoId,
        username: newUser.user.username,
        permission: 'read',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Removing Collaborators', () => {
    it('removes collaborator', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // First ensure collaborator is added
      await authApi.repos.addCollaborator.mutate({
        repoId,
        username: collaboratorUsername,
        permission: 'read',
      });

      const result = await authApi.repos.removeCollaborator.mutate({
        repoId,
        userId: collaboratorId,
      });

      expect(result.success).toBe(true);

      // Verify removal
      const collaborators = await authApi.repos.collaborators.query({
        repoId,
      });
      expect(collaborators.some((c: any) => c.userId === collaboratorId)).toBe(false);
    });

    it('collaborator can remove themselves', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const collabApi = createAuthenticatedClient(collaboratorToken);

      // Add collaborator
      await authApi.repos.addCollaborator.mutate({
        repoId,
        username: collaboratorUsername,
        permission: 'read',
      });

      // Self-remove
      const result = await collabApi.collaborators.leave.mutate({
        repoId,
      });

      expect(result.success).toBe(true);
    });

    it('owner cannot remove themselves', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.repos.removeCollaborator.mutate({
          repoId,
          userId: ownerId,
        })
      ).rejects.toThrow();
    });
  });

  describe('Private Repository Access', () => {
    beforeAll(async () => {
      // Add collaborator to private repo
      const authApi = createAuthenticatedClient(ownerToken);
      await authApi.repos.addCollaborator.mutate({
        repoId: privateRepoId,
        username: collaboratorUsername,
        permission: 'read',
      });
    });

    it('collaborator can access private repo', async () => {
      const collabApi = createAuthenticatedClient(collaboratorToken);

      const authApi = createAuthenticatedClient(ownerToken);
      const repoName = await authApi.repos.getById.query({ repoId: privateRepoId }).then(r => r.name);

      const repo = await collabApi.repos.get.query({
        owner: ownerUsername,
        repo: repoName,
      });

      expect(repo).toBeDefined();
    });

    it('outsider cannot access private repo', async () => {
      const outsiderApi = createAuthenticatedClient(outsiderToken);

      const authApi = createAuthenticatedClient(ownerToken);
      const repoName = await authApi.repos.getById.query({ repoId: privateRepoId }).then(r => r.name);

      await expect(
        outsiderApi.repos.get.query({
          owner: ownerUsername,
          repo: repoName,
        })
      ).rejects.toThrow();
    });

    it('unauthenticated user cannot access private repo', async () => {
      const api = createTestClient();

      const authApi = createAuthenticatedClient(ownerToken);
      const repoName = await authApi.repos.getById.query({ repoId: privateRepoId }).then(r => r.name);

      await expect(
        api.repos.get.query({
          owner: ownerUsername,
          repo: repoName,
        })
      ).rejects.toThrow();
    });
  });

  describe('Collaboration Invitations', () => {
    it('sends collaboration invitation', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Create new user to invite
      const newUser = await api.auth.register.mutate({
        username: uniqueUsername('invite-user'),
        email: uniqueEmail('invite-user'),
        password: 'password123',
      });

      const result = await authApi.collaborators.invite.mutate({
        repoId,
        email: `${newUser.user.username}@example.com`,
        permission: 'write',
      });

      expect(result.success).toBe(true);
      expect(result.invitationId).toBeDefined();
    });

    it('lists pending invitations', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const invitations = await authApi.collaborators.pendingInvitations.query({
        repoId,
      });

      expect(Array.isArray(invitations)).toBe(true);
    });

    it('cancels invitation', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Get pending invitations
      const invitations = await authApi.collaborators.pendingInvitations.query({
        repoId,
      });

      if (invitations.length > 0) {
        const result = await authApi.collaborators.cancelInvitation.mutate({
          invitationId: invitations[0].id,
        });

        expect(result.success).toBe(true);
      }
    });
  });

  describe('Permission Checking', () => {
    it('checks user permission on repo', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Add collaborator with write
      await authApi.repos.addCollaborator.mutate({
        repoId,
        username: collaboratorUsername,
        permission: 'write',
      });

      const permission = await authApi.collaborators.getPermission.query({
        repoId,
        userId: collaboratorId,
      });

      expect(permission).toBe('write');
    });

    it('returns null for non-collaborator', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const permission = await authApi.collaborators.getPermission.query({
        repoId,
        userId: outsiderId,
      });

      expect(permission).toBeNull();
    });

    it('returns owner for repository owner', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const permission = await authApi.collaborators.getPermission.query({
        repoId,
        userId: ownerId,
      });

      expect(permission).toBe('owner');
    });
  });

  describe('Collaborator Activity', () => {
    it('lists collaborator contributions', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Ensure collaborator is added
      await authApi.repos.addCollaborator.mutate({
        repoId,
        username: collaboratorUsername,
        permission: 'write',
      });

      const contributions = await authApi.collaborators.contributions.query({
        repoId,
        userId: collaboratorId,
      });

      expect(contributions).toBeDefined();
      expect(typeof contributions.commits).toBe('number');
      expect(typeof contributions.issues).toBe('number');
      expect(typeof contributions.prs).toBe('number');
    });
  });
});
