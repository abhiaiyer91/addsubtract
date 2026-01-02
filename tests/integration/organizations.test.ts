/**
 * Organizations Integration Tests
 * 
 * Tests for organization management including:
 * - Organization CRUD operations
 * - Member management
 * - Team management
 * - Permission checks
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupIntegrationTest,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
} from './setup';

describe('Organizations Flow', () => {
  setupIntegrationTest();

  let ownerToken: string;
  let memberToken: string;
  let ownerId: string;
  let memberId: string;
  let ownerUsername: string;
  let memberUsername: string;

  beforeAll(async () => {

    // Create owner user
    ownerUsername = uniqueUsername('orgowner');
    const api = createTestClient();
    const ownerResult = await api.auth.register.mutate({
      username: ownerUsername,
      email: uniqueEmail('orgowner'),
      password: 'password123',
      name: 'Org Owner',
    });
    ownerToken = ownerResult.sessionId;
    ownerId = ownerResult.user.id;

    // Create member user
    memberUsername = uniqueUsername('orgmember');
    const memberResult = await api.auth.register.mutate({
      username: memberUsername,
      email: uniqueEmail('orgmember'),
      password: 'password123',
      name: 'Org Member',
    });
    memberToken = memberResult.sessionId;
    memberId = memberResult.user.id;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Organization CRUD', () => {
    const uniqueOrgName = () => `testorg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    it('creates an organization', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const orgName = uniqueOrgName();

      const org = await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'Test Organization',
        description: 'A test organization for integration tests',
      });

      expect(org).toBeDefined();
      expect(org.name).toBe(orgName);
      expect(org.displayName).toBe('Test Organization');
      expect(org.description).toBe('A test organization for integration tests');
    });

    it('fails to create org with duplicate name', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const orgName = uniqueOrgName();

      // First creation
      await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'First Org',
      });

      // Duplicate should fail
      await expect(
        authApi.organizations.create.mutate({
          name: orgName,
          displayName: 'Duplicate Org',
        })
      ).rejects.toThrow();
    });

    it('fails to create org with invalid name', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Names starting with hyphen are invalid
      await expect(
        authApi.organizations.create.mutate({
          name: '-invalid-name',
          displayName: 'Invalid',
        })
      ).rejects.toThrow();
    });

    it('checks organization name availability', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const orgName = uniqueOrgName();

      // Should be available before creation
      const beforeCreate = await authApi.organizations.checkName.query({ name: orgName });
      expect(beforeCreate.available).toBe(true);

      // Create the org
      await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'Test Org',
      });

      // Should not be available after creation
      const afterCreate = await authApi.organizations.checkName.query({ name: orgName });
      expect(afterCreate.available).toBe(false);
    });

    it('gets organization by name', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();
      const orgName = uniqueOrgName();

      await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'Get By Name Test',
        description: 'Test description',
      });

      // Public endpoint - should work without auth
      const org = await api.organizations.get.query({ name: orgName });

      expect(org).toBeDefined();
      expect(org.name).toBe(orgName);
      expect(org.displayName).toBe('Get By Name Test');
    });

    it('gets organization by ID', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();
      const orgName = uniqueOrgName();

      const created = await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'Get By ID Test',
      });

      const org = await api.organizations.getById.query({ id: created.id });

      expect(org).toBeDefined();
      expect(org.id).toBe(created.id);
      expect(org.name).toBe(orgName);
    });

    it('updates organization', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const orgName = uniqueOrgName();

      const org = await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'Original Name',
        description: 'Original description',
      });

      const updated = await authApi.organizations.update.mutate({
        orgId: org.id,
        displayName: 'Updated Name',
        description: 'Updated description',
        website: 'https://example.com',
      });

      expect(updated.displayName).toBe('Updated Name');
      expect(updated.description).toBe('Updated description');
      expect(updated.website).toBe('https://example.com');
    });

    it('fails to update org without permission', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const memberApi = createAuthenticatedClient(memberToken);
      const orgName = uniqueOrgName();

      const org = await ownerApi.organizations.create.mutate({
        name: orgName,
        displayName: 'Owner Only Org',
      });

      // Member should not be able to update
      await expect(
        memberApi.organizations.update.mutate({
          orgId: org.id,
          displayName: 'Hacked Name',
        })
      ).rejects.toThrow();
    });

    it('searches organizations', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();
      const searchTerm = `searchable-${Date.now()}`;

      await authApi.organizations.create.mutate({
        name: `${searchTerm}-org`,
        displayName: 'Searchable Organization',
      });

      const results = await api.organizations.search.query({
        query: searchTerm,
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(org => org.name.includes(searchTerm))).toBe(true);
    });

    it('deletes organization', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();
      const orgName = uniqueOrgName();

      const org = await authApi.organizations.create.mutate({
        name: orgName,
        displayName: 'To Be Deleted',
      });

      await authApi.organizations.delete.mutate({ orgId: org.id });

      // Should not be found after deletion
      await expect(
        api.organizations.get.query({ name: orgName })
      ).rejects.toThrow();
    });

    it('fails to delete org without owner permission', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const memberApi = createAuthenticatedClient(memberToken);
      const orgName = uniqueOrgName();

      const org = await ownerApi.organizations.create.mutate({
        name: orgName,
        displayName: 'Protected Org',
      });

      // Add member as admin (not owner)
      await ownerApi.organizations.addMember.mutate({
        orgId: org.id,
        userId: memberId,
        role: 'admin',
      });

      // Admin should not be able to delete
      await expect(
        memberApi.organizations.delete.mutate({ orgId: org.id })
      ).rejects.toThrow();
    });
  });

  describe('Member Management', () => {
    let orgId: string;
    const uniqueOrgName = () => `memberorg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    beforeEach(async () => {
        const authApi = createAuthenticatedClient(ownerToken);
      const org = await authApi.organizations.create.mutate({
        name: uniqueOrgName(),
        displayName: 'Member Test Org',
      });
      orgId = org.id;
    });

    it('adds a member to organization', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const member = await authApi.organizations.addMember.mutate({
        orgId,
        userId: memberId,
        role: 'member',
      });

      expect(member).toBeDefined();
      expect(member.userId).toBe(memberId);
      expect(member.role).toBe('member');
    });

    it('fails to add duplicate member', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await authApi.organizations.addMember.mutate({
        orgId,
        userId: memberId,
        role: 'member',
      });

      await expect(
        authApi.organizations.addMember.mutate({
          orgId,
          userId: memberId,
          role: 'admin',
        })
      ).rejects.toThrow();
    });

    it('lists organization members', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      await authApi.organizations.addMember.mutate({
        orgId,
        userId: memberId,
        role: 'member',
      });

      const members = await api.organizations.listMembers.query({ orgId });

      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBe(2); // Owner + member
      expect(members.some(m => m.userId === ownerId && m.role === 'owner')).toBe(true);
      expect(members.some(m => m.userId === memberId && m.role === 'member')).toBe(true);
    });

    it('updates member role', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await authApi.organizations.addMember.mutate({
        orgId,
        userId: memberId,
        role: 'member',
      });

      const updated = await authApi.organizations.updateMemberRole.mutate({
        orgId,
        userId: memberId,
        role: 'admin',
      });

      expect(updated.role).toBe('admin');
    });

    it('fails to demote last owner', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await expect(
        authApi.organizations.updateMemberRole.mutate({
          orgId,
          userId: ownerId,
          role: 'admin',
        })
      ).rejects.toThrow();
    });

    it('checks membership', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Before adding
      const beforeAdd = await api.organizations.checkMembership.query({
        orgId,
        userId: memberId,
      });
      expect(beforeAdd.isMember).toBe(false);

      // Add member
      await authApi.organizations.addMember.mutate({
        orgId,
        userId: memberId,
        role: 'admin',
      });

      // After adding
      const afterAdd = await api.organizations.checkMembership.query({
        orgId,
        userId: memberId,
      });
      expect(afterAdd.isMember).toBe(true);
      expect(afterAdd.role).toBe('admin');
    });

    it('removes member from organization', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      await authApi.organizations.addMember.mutate({
        orgId,
        userId: memberId,
        role: 'member',
      });

      await authApi.organizations.removeMember.mutate({
        orgId,
        userId: memberId,
      });

      const membership = await api.organizations.checkMembership.query({
        orgId,
        userId: memberId,
      });
      expect(membership.isMember).toBe(false);
    });

    it('member can remove themselves', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const memberApi = createAuthenticatedClient(memberToken);
      const api = createTestClient();

      await ownerApi.organizations.addMember.mutate({
        orgId,
        userId: memberId,
        role: 'member',
      });

      // Member removes themselves
      await memberApi.organizations.removeMember.mutate({
        orgId,
        userId: memberId,
      });

      const membership = await api.organizations.checkMembership.query({
        orgId,
        userId: memberId,
      });
      expect(membership.isMember).toBe(false);
    });

    it('lists organizations for user', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const memberApi = createAuthenticatedClient(memberToken);

      await ownerApi.organizations.addMember.mutate({
        orgId,
        userId: memberId,
        role: 'member',
      });

      const orgs = await memberApi.organizations.listForUser.query();

      expect(Array.isArray(orgs)).toBe(true);
      expect(orgs.some(o => o.orgId === orgId)).toBe(true);
    });
  });

  describe('Team Management', () => {
    let orgId: string;
    const uniqueOrgName = () => `teamorg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    beforeEach(async () => {
        const authApi = createAuthenticatedClient(ownerToken);
      const org = await authApi.organizations.create.mutate({
        name: uniqueOrgName(),
        displayName: 'Team Test Org',
      });
      orgId = org.id;

      // Add member to org first
      await authApi.organizations.addMember.mutate({
        orgId,
        userId: memberId,
        role: 'member',
      });
    });

    it('creates a team', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const team = await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'developers',
        description: 'Development team',
      });

      expect(team).toBeDefined();
      expect(team.name).toBe('developers');
      expect(team.description).toBe('Development team');
    });

    it('fails to create duplicate team name', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'developers',
      });

      await expect(
        authApi.organizations.createTeam.mutate({
          orgId,
          name: 'developers',
        })
      ).rejects.toThrow();
    });

    it('lists teams in organization', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'team-a',
      });
      await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'team-b',
      });

      const teams = await api.organizations.listTeams.query({ orgId });

      expect(Array.isArray(teams)).toBe(true);
      expect(teams.length).toBe(2);
    });

    it('gets team by ID', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const created = await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'my-team',
        description: 'My test team',
      });

      const team = await api.organizations.getTeam.query({ teamId: created.id });

      expect(team).toBeDefined();
      expect(team.id).toBe(created.id);
      expect(team.name).toBe('my-team');
    });

    it('updates a team', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const team = await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'original-team',
        description: 'Original description',
      });

      const updated = await authApi.organizations.updateTeam.mutate({
        teamId: team.id,
        name: 'renamed-team',
        description: 'Updated description',
      });

      expect(updated.name).toBe('renamed-team');
      expect(updated.description).toBe('Updated description');
    });

    it('deletes a team', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const team = await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'to-delete',
      });

      await authApi.organizations.deleteTeam.mutate({ teamId: team.id });

      await expect(
        api.organizations.getTeam.query({ teamId: team.id })
      ).rejects.toThrow();
    });

    it('adds member to team', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const team = await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'test-team',
      });

      const member = await authApi.organizations.addTeamMember.mutate({
        teamId: team.id,
        userId: memberId,
      });

      expect(member).toBeDefined();
    });

    it('fails to add non-org member to team', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Create another user who is not an org member
      const outsiderUsername = uniqueUsername('outsider');
      const outsiderResult = await api.auth.register.mutate({
        username: outsiderUsername,
        email: uniqueEmail('outsider'),
        password: 'password123',
      });

      const team = await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'exclusive-team',
      });

      await expect(
        authApi.organizations.addTeamMember.mutate({
          teamId: team.id,
          userId: outsiderResult.user.id,
        })
      ).rejects.toThrow();
    });

    it('lists team members', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const team = await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'member-list-team',
      });

      await authApi.organizations.addTeamMember.mutate({
        teamId: team.id,
        userId: memberId,
      });

      const members = await api.organizations.listTeamMembers.query({ teamId: team.id });

      expect(Array.isArray(members)).toBe(true);
      expect(members.some(m => m.userId === memberId)).toBe(true);
    });

    it('removes member from team', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const team = await authApi.organizations.createTeam.mutate({
        orgId,
        name: 'remove-member-team',
      });

      await authApi.organizations.addTeamMember.mutate({
        teamId: team.id,
        userId: memberId,
      });

      await authApi.organizations.removeTeamMember.mutate({
        teamId: team.id,
        userId: memberId,
      });

      const members = await api.organizations.listTeamMembers.query({ teamId: team.id });
      expect(members.some(m => m.userId === memberId)).toBe(false);
    });

    it('member can remove themselves from team', async () => {
      const ownerApi = createAuthenticatedClient(ownerToken);
      const memberApi = createAuthenticatedClient(memberToken);
      const api = createTestClient();

      const team = await ownerApi.organizations.createTeam.mutate({
        orgId,
        name: 'self-remove-team',
      });

      await ownerApi.organizations.addTeamMember.mutate({
        teamId: team.id,
        userId: memberId,
      });

      await memberApi.organizations.removeTeamMember.mutate({
        teamId: team.id,
        userId: memberId,
      });

      const members = await api.organizations.listTeamMembers.query({ teamId: team.id });
      expect(members.some(m => m.userId === memberId)).toBe(false);
    });
  });
});
