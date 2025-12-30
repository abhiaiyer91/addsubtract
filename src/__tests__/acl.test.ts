/**
 * Tests for Access Control List (ACL) Module
 * 
 * Tests the centralized security layer for wi
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  ACL, 
  ACLError, 
  checkRepoPermission, 
  checkOrgRole,
  logSecurityEvent,
} from '../core/acl';

// Mock the database models
vi.mock('../db/models', () => ({
  repoModel: {
    findById: vi.fn(),
  },
  collaboratorModel: {
    find: vi.fn(),
    hasPermission: vi.fn(),
  },
  orgMemberModel: {
    find: vi.fn(),
    hasRole: vi.fn(),
    listByUser: vi.fn(),
  },
}));

import { repoModel, collaboratorModel, orgMemberModel } from '../db/models';

describe('ACL Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canAccessRepo', () => {
    describe('public repositories', () => {
      it('should allow read access to public repos without authentication', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: false,
          name: 'public-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });

        const result = await ACL.canAccessRepo('repo-1', 'read', {});
        
        expect(result.allowed).toBe(true);
        expect(result.source).toBe('public');
        expect(result.effectivePermission).toBe('read');
      });

      it('should deny write access to public repos without authentication', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: false,
          name: 'public-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });

        const result = await ACL.canAccessRepo('repo-1', 'write', {});
        
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Authentication required');
      });
    });

    describe('private repositories', () => {
      it('should deny access to private repos without authentication', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: true,
          name: 'private-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });

        const result = await ACL.canAccessRepo('repo-1', 'read', {});
        
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Authentication required');
      });

      it('should allow owner full access to private repos', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: true,
          name: 'private-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });

        const result = await ACL.canAccessRepo('repo-1', 'admin', { userId: 'owner-1' });
        
        expect(result.allowed).toBe(true);
        expect(result.source).toBe('owner');
        expect(result.effectivePermission).toBe('admin');
      });
    });

    describe('collaborator access', () => {
      it('should allow collaborator with sufficient permission', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: true,
          name: 'private-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });
        vi.mocked(collaboratorModel.find).mockResolvedValue({
          repoId: 'repo-1',
          userId: 'user-1',
          permission: 'write',
          createdAt: new Date(),
        });

        const result = await ACL.canAccessRepo('repo-1', 'write', { userId: 'user-1' });
        
        expect(result.allowed).toBe(true);
        expect(result.source).toBe('collaborator');
        expect(result.effectivePermission).toBe('write');
      });

      it('should deny collaborator with insufficient permission', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: true,
          name: 'private-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });
        vi.mocked(collaboratorModel.find).mockResolvedValue({
          repoId: 'repo-1',
          userId: 'user-1',
          permission: 'read',
          createdAt: new Date(),
        });

        const result = await ACL.canAccessRepo('repo-1', 'admin', { userId: 'user-1' });
        
        expect(result.allowed).toBe(false);
      });

      it('should allow higher permission level to access lower level', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: true,
          name: 'private-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });
        vi.mocked(collaboratorModel.find).mockResolvedValue({
          repoId: 'repo-1',
          userId: 'user-1',
          permission: 'admin',
          createdAt: new Date(),
        });

        const result = await ACL.canAccessRepo('repo-1', 'read', { userId: 'user-1' });
        
        expect(result.allowed).toBe(true);
      });
    });

    describe('organization repositories', () => {
      it('should allow org member read access to org repos', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'org-1',
          ownerType: 'organization',
          isPrivate: true,
          name: 'org-repo',
          diskPath: '/repos/org/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });
        vi.mocked(collaboratorModel.find).mockResolvedValue(undefined);
        vi.mocked(orgMemberModel.find).mockResolvedValue({
          orgId: 'org-1',
          userId: 'user-1',
          role: 'member',
          createdAt: new Date(),
        });

        const result = await ACL.canAccessRepo('repo-1', 'read', { userId: 'user-1' });
        
        expect(result.allowed).toBe(true);
        expect(result.source).toBe('org_member');
      });

      it('should allow org owner admin access to org repos', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'org-1',
          ownerType: 'organization',
          isPrivate: true,
          name: 'org-repo',
          diskPath: '/repos/org/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });
        vi.mocked(collaboratorModel.find).mockResolvedValue(undefined);
        vi.mocked(orgMemberModel.find).mockResolvedValue({
          orgId: 'org-1',
          userId: 'user-1',
          role: 'owner',
          createdAt: new Date(),
        });

        const result = await ACL.canAccessRepo('repo-1', 'admin', { userId: 'user-1' });
        
        expect(result.allowed).toBe(true);
        expect(result.source).toBe('org_member');
        expect(result.effectivePermission).toBe('admin');
      });
    });

    describe('OAuth scope enforcement', () => {
      it('should deny access when OAuth token lacks required scope', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: true,
          name: 'private-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });

        const result = await ACL.canAccessRepo('repo-1', 'write', {
          userId: 'owner-1',
          oauthScopes: ['repo:read'],
        });
        
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('OAuth token does not have sufficient scope');
      });

      it('should allow access when OAuth token has sufficient scope', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: true,
          name: 'private-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });

        const result = await ACL.canAccessRepo('repo-1', 'write', {
          userId: 'owner-1',
          oauthScopes: ['repo:write'],
        });
        
        expect(result.allowed).toBe(true);
      });

      it('should allow higher OAuth scope for lower permission level', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue({
          id: 'repo-1',
          ownerId: 'owner-1',
          ownerType: 'user',
          isPrivate: true,
          name: 'private-repo',
          diskPath: '/repos/test/repo.git',
          defaultBranch: 'main',
          starsCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
          openPrsCount: 0,
          isFork: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          pushedAt: null,
          description: null,
          forkedFromId: null,
        });

        const result = await ACL.canAccessRepo('repo-1', 'read', {
          userId: 'owner-1',
          oauthScopes: ['repo:admin'],
        });
        
        expect(result.allowed).toBe(true);
      });
    });

    describe('repository not found', () => {
      it('should return not found for non-existent repo', async () => {
        vi.mocked(repoModel.findById).mockResolvedValue(undefined);

        const result = await ACL.canAccessRepo('non-existent', 'read', {});
        
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Repository not found');
      });
    });
  });

  describe('canAccessOrg', () => {
    it('should allow member access for org members', async () => {
      vi.mocked(orgMemberModel.hasRole).mockResolvedValue(true);
      vi.mocked(orgMemberModel.find).mockResolvedValue({
        orgId: 'org-1',
        userId: 'user-1',
        role: 'member',
        createdAt: new Date(),
      });

      const result = await ACL.canAccessOrg('org-1', 'member', { userId: 'user-1' });
      
      expect(result.allowed).toBe(true);
      expect(result.effectivePermission).toBe('member');
    });

    it('should deny access without authentication', async () => {
      const result = await ACL.canAccessOrg('org-1', 'member', {});
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Authentication required');
    });

    it('should deny access for non-members', async () => {
      vi.mocked(orgMemberModel.hasRole).mockResolvedValue(false);

      const result = await ACL.canAccessOrg('org-1', 'member', { userId: 'user-1' });
      
      expect(result.allowed).toBe(false);
    });
  });

  describe('assertRepoAccess', () => {
    it('should throw ACLError for unauthorized access', async () => {
      vi.mocked(repoModel.findById).mockResolvedValue({
        id: 'repo-1',
        ownerId: 'owner-1',
        ownerType: 'user',
        isPrivate: true,
        name: 'private-repo',
        diskPath: '/repos/test/repo.git',
        defaultBranch: 'main',
        starsCount: 0,
        forksCount: 0,
        watchersCount: 0,
        openIssuesCount: 0,
        openPrsCount: 0,
        isFork: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        pushedAt: null,
        description: null,
        forkedFromId: null,
      });

      await expect(
        ACL.assertRepoAccess('repo-1', 'read', {})
      ).rejects.toThrow(ACLError);
    });

    it('should return repo for authorized access', async () => {
      vi.mocked(repoModel.findById).mockResolvedValue({
        id: 'repo-1',
        ownerId: 'owner-1',
        ownerType: 'user',
        isPrivate: true,
        name: 'private-repo',
        diskPath: '/repos/test/repo.git',
        defaultBranch: 'main',
        starsCount: 0,
        forksCount: 0,
        watchersCount: 0,
        openIssuesCount: 0,
        openPrsCount: 0,
        isFork: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        pushedAt: null,
        description: null,
        forkedFromId: null,
      });

      const result = await ACL.assertRepoAccess('repo-1', 'admin', { userId: 'owner-1' });
      
      expect(result.repo).toBeDefined();
      expect(result.effectivePermission).toBe('admin');
    });
  });

  describe('hasOAuthScopeForPermission', () => {
    it('should return true for matching scope', () => {
      expect(ACL.hasOAuthScopeForPermission(['repo:read'], 'read')).toBe(true);
      expect(ACL.hasOAuthScopeForPermission(['repo:write'], 'write')).toBe(true);
      expect(ACL.hasOAuthScopeForPermission(['repo:admin'], 'admin')).toBe(true);
    });

    it('should return true for higher scope', () => {
      expect(ACL.hasOAuthScopeForPermission(['repo:admin'], 'read')).toBe(true);
      expect(ACL.hasOAuthScopeForPermission(['repo:write'], 'read')).toBe(true);
    });

    it('should return false for insufficient scope', () => {
      expect(ACL.hasOAuthScopeForPermission(['repo:read'], 'write')).toBe(false);
      expect(ACL.hasOAuthScopeForPermission(['repo:read'], 'admin')).toBe(false);
    });

    it('should check related scopes', () => {
      expect(ACL.hasOAuthScopeForPermission(['issue:write'], 'write')).toBe(true);
      expect(ACL.hasOAuthScopeForPermission(['pull:read'], 'read')).toBe(true);
    });
  });

  describe('isOwner', () => {
    it('should return true for matching owner', () => {
      expect(ACL.isOwner('user-1', 'user-1')).toBe(true);
    });

    it('should return false for non-matching owner', () => {
      expect(ACL.isOwner('user-1', 'user-2')).toBe(false);
    });

    it('should return false for undefined user', () => {
      expect(ACL.isOwner('user-1', undefined)).toBe(false);
    });
  });
});

describe('ACLError', () => {
  it('should have correct status codes', () => {
    expect(new ACLError('UNAUTHORIZED', 'test').statusCode).toBe(401);
    expect(new ACLError('FORBIDDEN', 'test').statusCode).toBe(403);
    expect(new ACLError('NOT_FOUND', 'test').statusCode).toBe(404);
    expect(new ACLError('BAD_REQUEST', 'test').statusCode).toBe(400);
  });
});

describe('Helper functions', () => {
  describe('checkRepoPermission', () => {
    it('should return boolean for permission check', async () => {
      vi.mocked(repoModel.findById).mockResolvedValue({
        id: 'repo-1',
        ownerId: 'owner-1',
        ownerType: 'user',
        isPrivate: false,
        name: 'public-repo',
        diskPath: '/repos/test/repo.git',
        defaultBranch: 'main',
        starsCount: 0,
        forksCount: 0,
        watchersCount: 0,
        openIssuesCount: 0,
        openPrsCount: 0,
        isFork: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        pushedAt: null,
        description: null,
        forkedFromId: null,
      });

      const result = await checkRepoPermission('repo-1', undefined, 'read');
      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });
  });

  describe('checkOrgRole', () => {
    it('should return false without user', async () => {
      const result = await checkOrgRole('org-1', undefined, 'member');
      expect(result).toBe(false);
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security events', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logSecurityEvent({
        type: 'access_denied',
        userId: 'user-1',
        resourceType: 'repo',
        resourceId: 'repo-1',
        action: 'read',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
