/**
 * Tests for Collaborator Management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CollaboratorManager,
  CollaboratorRole,
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY,
} from '../core/collaborators';
import { createTestRepo, cleanupTempDir, suppressConsole, restoreCwd } from './test-utils';

describe('CollaboratorManager', () => {
  let testDir: string | undefined;
  let manager: CollaboratorManager;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const { repo, dir } = createTestRepo();
    testDir = dir;
    manager = new CollaboratorManager(repo.gitDir);
    manager.init();
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('invite', () => {
    it('should invite a collaborator with default role', () => {
      const { collaborator, invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );

      expect(collaborator.email).toBe('user@example.com');
      expect(collaborator.role).toBe('contributor');
      expect(collaborator.status).toBe('pending');
      expect(invitation.token).toBeDefined();
      expect(invitation.status).toBe('pending');
    });

    it('should invite a collaborator with specified role', () => {
      const { collaborator } = manager.invite(
        'admin@example.com',
        'admin',
        'owner@example.com'
      );

      expect(collaborator.role).toBe('admin');
      expect(collaborator.permissions.canManageCollaborators).toBe(true);
    });

    it('should include message in invitation', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com',
        { message: 'Welcome to the team!' }
      );

      expect(invitation.message).toBe('Welcome to the team!');
    });

    it('should reject invalid email addresses', () => {
      expect(() => {
        manager.invite('invalid-email', 'contributor', 'owner@example.com');
      }).toThrow('Invalid email address');
    });

    it('should reject duplicate invitations for active collaborators', () => {
      // First invite
      const { collaborator, invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );

      // Accept the invitation
      manager.accept(invitation.token);

      // Try to invite again
      expect(() => {
        manager.invite('user@example.com', 'admin', 'owner@example.com');
      }).toThrow("'user@example.com' is already a collaborator");
    });

    it('should allow re-inviting pending collaborators', () => {
      // First invite
      manager.invite('user@example.com', 'contributor', 'owner@example.com');

      // Re-invite with different role
      const { collaborator } = manager.invite(
        'user@example.com',
        'admin',
        'owner@example.com'
      );

      expect(collaborator.role).toBe('admin');
    });
  });

  describe('accept', () => {
    it('should accept a valid invitation', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );

      const collaborator = manager.accept(invitation.token);

      expect(collaborator.status).toBe('accepted');
      expect(collaborator.acceptedAt).toBeDefined();
    });

    it('should update collaborator name on accept', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );

      const collaborator = manager.accept(invitation.token, 'John Doe');

      expect(collaborator.name).toBe('John Doe');
    });

    it('should reject invalid tokens', () => {
      expect(() => {
        manager.accept('invalid-token');
      }).toThrow('Invalid or expired invitation token');
    });

    it('should reject already accepted invitations', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );

      manager.accept(invitation.token);

      expect(() => {
        manager.accept(invitation.token);
      }).toThrow('Invitation has already been accepted');
    });
  });

  describe('remove', () => {
    it('should remove a collaborator', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );
      manager.accept(invitation.token);

      manager.remove('user@example.com', 'owner@example.com');

      expect(manager.getByEmail('user@example.com')).toBeUndefined();
    });

    it('should not remove the last owner', () => {
      const { invitation } = manager.invite(
        'owner@example.com',
        'owner',
        'system@example.com'
      );
      manager.accept(invitation.token);

      expect(() => {
        manager.remove('owner@example.com', 'system@example.com');
      }).toThrow('Cannot remove the last owner');
    });

    it('should throw for non-existent collaborators', () => {
      expect(() => {
        manager.remove('nonexistent@example.com', 'owner@example.com');
      }).toThrow("Collaborator 'nonexistent@example.com' not found");
    });
  });

  describe('updateRole', () => {
    it('should update a collaborator role', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );
      manager.accept(invitation.token);

      const updated = manager.updateRole('user@example.com', 'maintainer', 'owner@example.com');

      expect(updated.role).toBe('maintainer');
      expect(updated.permissions.canMerge).toBe(true);
    });

    it('should not demote the last owner', () => {
      const { invitation } = manager.invite(
        'owner@example.com',
        'owner',
        'system@example.com'
      );
      manager.accept(invitation.token);

      expect(() => {
        manager.updateRole('owner@example.com', 'admin', 'system@example.com');
      }).toThrow('Cannot demote the last owner');
    });
  });

  describe('list', () => {
    it('should list all collaborators', () => {
      manager.invite('user1@example.com', 'contributor', 'owner@example.com');
      manager.invite('user2@example.com', 'admin', 'owner@example.com');

      const collaborators = manager.list();

      expect(collaborators).toHaveLength(2);
    });

    it('should filter by status', () => {
      const { invitation } = manager.invite(
        'user1@example.com',
        'contributor',
        'owner@example.com'
      );
      manager.accept(invitation.token);
      manager.invite('user2@example.com', 'admin', 'owner@example.com');

      const active = manager.list({ status: 'accepted' });
      const pending = manager.list({ status: 'pending' });

      expect(active).toHaveLength(1);
      expect(pending).toHaveLength(1);
    });

    it('should filter by role', () => {
      manager.invite('user1@example.com', 'contributor', 'owner@example.com');
      manager.invite('user2@example.com', 'admin', 'owner@example.com');
      manager.invite('user3@example.com', 'contributor', 'owner@example.com');

      const contributors = manager.list({ role: 'contributor' });

      expect(contributors).toHaveLength(2);
    });

    it('should sort by role hierarchy', () => {
      manager.invite('viewer@example.com', 'viewer', 'owner@example.com');
      manager.invite('admin@example.com', 'admin', 'owner@example.com');
      manager.invite('contributor@example.com', 'contributor', 'owner@example.com');

      const collaborators = manager.list();

      expect(collaborators[0].role).toBe('admin');
      expect(collaborators[1].role).toBe('contributor');
      expect(collaborators[2].role).toBe('viewer');
    });
  });

  describe('permissions', () => {
    it('should correctly check permissions', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );
      manager.accept(invitation.token);

      expect(manager.hasPermission('user@example.com', 'canRead')).toBe(true);
      expect(manager.hasPermission('user@example.com', 'canPush')).toBe(true);
      expect(manager.hasPermission('user@example.com', 'canMerge')).toBe(false);
      expect(manager.hasPermission('user@example.com', 'canManageSettings')).toBe(false);
    });

    it('should correctly check role hierarchy', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'maintainer',
        'owner@example.com'
      );
      manager.accept(invitation.token);

      expect(manager.hasRole('user@example.com', 'viewer')).toBe(true);
      expect(manager.hasRole('user@example.com', 'contributor')).toBe(true);
      expect(manager.hasRole('user@example.com', 'maintainer')).toBe(true);
      expect(manager.hasRole('user@example.com', 'admin')).toBe(false);
      expect(manager.hasRole('user@example.com', 'owner')).toBe(false);
    });

    it('should deny permissions for pending collaborators', () => {
      manager.invite('user@example.com', 'admin', 'owner@example.com');

      expect(manager.hasPermission('user@example.com', 'canRead')).toBe(false);
    });
  });

  describe('teams', () => {
    it('should create a team', () => {
      const team = manager.createTeam('Core Team', 'maintainer', 'owner@example.com', {
        description: 'Core maintainers',
      });

      expect(team.name).toBe('Core Team');
      expect(team.slug).toBe('core-team');
      expect(team.role).toBe('maintainer');
      expect(team.description).toBe('Core maintainers');
    });

    it('should add members to a team', () => {
      manager.createTeam('Devs', 'contributor', 'owner@example.com');
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );
      manager.accept(invitation.token);

      const team = manager.addTeamMember('devs', 'user@example.com');

      expect(team.members).toHaveLength(1);
    });

    it('should remove members from a team', () => {
      manager.createTeam('Devs', 'contributor', 'owner@example.com');
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );
      manager.accept(invitation.token);
      manager.addTeamMember('devs', 'user@example.com');

      const team = manager.removeTeamMember('devs', 'user@example.com');

      expect(team.members).toHaveLength(0);
    });

    it('should delete a team', () => {
      manager.createTeam('Temp Team', 'viewer', 'owner@example.com');

      manager.deleteTeam('temp-team');

      expect(manager.getTeam('temp-team')).toBeUndefined();
    });

    it('should prevent duplicate team names', () => {
      manager.createTeam('Devs', 'contributor', 'owner@example.com');

      expect(() => {
        manager.createTeam('Devs', 'admin', 'owner@example.com');
      }).toThrow("Team 'Devs' already exists");
    });
  });

  describe('activity log', () => {
    it('should log invitation activities', () => {
      manager.invite('user@example.com', 'contributor', 'owner@example.com');

      const activities = manager.getActivityLog();

      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('invited');
      expect(activities[0].collaboratorEmail).toBe('user@example.com');
    });

    it('should log acceptance activities', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );
      manager.accept(invitation.token);

      const activities = manager.getActivityLog();

      expect(activities.find(a => a.type === 'accepted')).toBeDefined();
    });

    it('should log role change activities', () => {
      const { invitation } = manager.invite(
        'user@example.com',
        'contributor',
        'owner@example.com'
      );
      manager.accept(invitation.token);
      manager.updateRole('user@example.com', 'maintainer', 'owner@example.com');

      const activities = manager.getActivityLog();
      const roleChange = activities.find(a => a.type === 'role_changed');

      expect(roleChange).toBeDefined();
      expect(roleChange?.details?.previousRole).toBe('contributor');
      expect(roleChange?.details?.newRole).toBe('maintainer');
    });
  });

  describe('statistics', () => {
    it('should return correct statistics', () => {
      manager.invite('user1@example.com', 'contributor', 'owner@example.com');
      const { invitation } = manager.invite(
        'user2@example.com',
        'admin',
        'owner@example.com'
      );
      manager.accept(invitation.token);
      manager.createTeam('Team A', 'contributor', 'owner@example.com');

      const stats = manager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.byRole.admin).toBe(1);
      expect(stats.byRole.contributor).toBe(0); // Only counts active
      expect(stats.teams).toBe(1);
    });
  });

  describe('configuration', () => {
    it('should get default configuration', () => {
      const config = manager.getConfig();

      expect(config.allowPublicAccess).toBe(false);
      expect(config.defaultRole).toBe('viewer');
      expect(config.inviteExpirationDays).toBe(7);
      expect(config.emailEnabled).toBe(false);
    });

    it('should update configuration', () => {
      manager.updateConfig({
        allowPublicAccess: true,
        defaultRole: 'contributor',
      });

      const config = manager.getConfig();

      expect(config.allowPublicAccess).toBe(true);
      expect(config.defaultRole).toBe('contributor');
    });
  });

  describe('revoke invitation', () => {
    it('should revoke a pending invitation', () => {
      manager.invite('user@example.com', 'contributor', 'owner@example.com');

      manager.revokeInvitation('user@example.com', 'owner@example.com');

      const invitations = manager.listInvitations('pending');
      expect(invitations).toHaveLength(0);
    });

    it('should throw for non-existent pending invitation', () => {
      expect(() => {
        manager.revokeInvitation('nonexistent@example.com', 'owner@example.com');
      }).toThrow("No pending invitation found for 'nonexistent@example.com'");
    });
  });
});

describe('Role Permissions', () => {
  it('should have correct owner permissions', () => {
    const perms = ROLE_PERMISSIONS.owner;
    expect(perms.canDeleteRepository).toBe(true);
    expect(perms.canManageCollaborators).toBe(true);
    expect(perms.canManageSettings).toBe(true);
  });

  it('should have correct admin permissions', () => {
    const perms = ROLE_PERMISSIONS.admin;
    expect(perms.canDeleteRepository).toBe(false);
    expect(perms.canManageCollaborators).toBe(true);
    expect(perms.canManageSettings).toBe(true);
  });

  it('should have correct maintainer permissions', () => {
    const perms = ROLE_PERMISSIONS.maintainer;
    expect(perms.canMerge).toBe(true);
    expect(perms.canManageReleases).toBe(true);
    expect(perms.canManageCollaborators).toBe(false);
    expect(perms.canPushProtected).toBe(false);
  });

  it('should have correct contributor permissions', () => {
    const perms = ROLE_PERMISSIONS.contributor;
    expect(perms.canPush).toBe(true);
    expect(perms.canMerge).toBe(false);
    expect(perms.canCreateBranch).toBe(true);
    expect(perms.canDeleteBranch).toBe(false);
  });

  it('should have correct viewer permissions', () => {
    const perms = ROLE_PERMISSIONS.viewer;
    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(false);
    expect(perms.canPush).toBe(false);
  });
});

describe('Role Hierarchy', () => {
  it('should have correct hierarchy order', () => {
    expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.maintainer);
    expect(ROLE_HIERARCHY.maintainer).toBeGreaterThan(ROLE_HIERARCHY.contributor);
    expect(ROLE_HIERARCHY.contributor).toBeGreaterThan(ROLE_HIERARCHY.viewer);
  });
});
