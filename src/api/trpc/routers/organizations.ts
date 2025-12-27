import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { orgModel, orgMemberModel, teamModel, teamMemberModel } from '../../../db/models';

// Validation schemas
const orgNameSchema = z.string()
  .min(2, 'Organization name must be at least 2 characters')
  .max(39, 'Organization name must be at most 39 characters')
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/, 'Organization name must be alphanumeric with hyphens, cannot start or end with hyphen');

const orgRoleSchema = z.enum(['member', 'admin', 'owner']);

export const organizationsRouter = router({
  /**
   * Get an organization by name (slug)
   */
  get: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input }) => {
      const org = await orgModel.findByName(input.name);
      
      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      return org;
    }),

  /**
   * Get organization by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const org = await orgModel.findById(input.id);
      
      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      return org;
    }),

  /**
   * Search organizations
   */
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      return orgModel.search(input.query, input.limit);
    }),

  /**
   * Check if organization name is available
   */
  checkName: publicProcedure
    .input(z.object({ name: orgNameSchema }))
    .query(async ({ input }) => {
      const available = await orgModel.isNameAvailable(input.name);
      return { available };
    }),

  /**
   * Create a new organization
   */
  create: protectedProcedure
    .input(z.object({
      name: orgNameSchema,
      displayName: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      avatarUrl: z.string().url().optional(),
      website: z.string().url().optional(),
      location: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if name is available
      const available = await orgModel.isNameAvailable(input.name);
      if (!available) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Organization name is already taken',
        });
      }

      const org = await orgModel.create({
        name: input.name,
        displayName: input.displayName || input.name,
        description: input.description,
        avatarUrl: input.avatarUrl,
        website: input.website,
        location: input.location,
      }, ctx.user.id);

      return org;
    }),

  /**
   * Update an organization
   */
  update: protectedProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      displayName: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      avatarUrl: z.string().url().nullable().optional(),
      website: z.string().url().nullable().optional(),
      location: z.string().max(100).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check permission (admin or owner)
      const hasPermission = await orgMemberModel.hasRole(input.orgId, ctx.user.id, 'admin');
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this organization',
        });
      }

      const { orgId, ...updateData } = input;
      const org = await orgModel.update(orgId, updateData);
      
      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      return org;
    }),

  /**
   * Delete an organization
   */
  delete: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Only owners can delete
      const hasPermission = await orgMemberModel.hasRole(input.orgId, ctx.user.id, 'owner');
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owners can delete the organization',
        });
      }

      const success = await orgModel.delete(input.orgId);
      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      return { success: true };
    }),

  // ============ Members ============

  /**
   * List organization members
   */
  listMembers: publicProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ input }) => {
      const members = await orgMemberModel.listByOrg(input.orgId);
      return members.map(m => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.createdAt,
        user: {
          id: m.user.id,
          username: m.user.username,
          name: m.user.name,
          avatarUrl: m.user.avatarUrl,
        },
      }));
    }),

  /**
   * Get user's organizations
   */
  listForUser: protectedProcedure
    .query(async ({ ctx }) => {
      const memberships = await orgMemberModel.listByUser(ctx.user.id);
      return memberships.map(m => ({
        orgId: m.orgId,
        role: m.role,
        joinedAt: m.createdAt,
        org: m.org,
      }));
    }),

  /**
   * Check if user is a member
   */
  checkMembership: publicProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      userId: z.string(),
    }))
    .query(async ({ input }) => {
      const member = await orgMemberModel.find(input.orgId, input.userId);
      return {
        isMember: !!member,
        role: member?.role || null,
      };
    }),

  /**
   * Add a member to an organization
   */
  addMember: protectedProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      userId: z.string(),
      role: orgRoleSchema.default('member'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check permission (admin or owner can add members)
      const hasPermission = await orgMemberModel.hasRole(input.orgId, ctx.user.id, 'admin');
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to add members',
        });
      }

      // Check if user is already a member
      const existing = await orgMemberModel.find(input.orgId, input.userId);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User is already a member of this organization',
        });
      }

      const member = await orgMemberModel.add({
        orgId: input.orgId,
        userId: input.userId,
        role: input.role,
      });

      return member;
    }),

  /**
   * Update member role
   */
  updateMemberRole: protectedProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      userId: z.string(),
      role: orgRoleSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      // Only owners can change roles
      const hasPermission = await orgMemberModel.hasRole(input.orgId, ctx.user.id, 'owner');
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owners can change member roles',
        });
      }

      // Can't demote the last owner
      if (input.role !== 'owner') {
        const owners = await orgMemberModel.getOwners(input.orgId);
        if (owners.length === 1 && owners[0].id === input.userId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot demote the last owner. Transfer ownership first.',
          });
        }
      }

      const member = await orgMemberModel.updateRole(input.orgId, input.userId, input.role);
      if (!member) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Member not found',
        });
      }

      return member;
    }),

  /**
   * Remove a member from an organization
   */
  removeMember: protectedProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Members can remove themselves, admins/owners can remove others
      const isSelf = ctx.user.id === input.userId;
      
      if (!isSelf) {
        const hasPermission = await orgMemberModel.hasRole(input.orgId, ctx.user.id, 'admin');
        if (!hasPermission) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to remove members',
          });
        }
      }

      // Can't remove the last owner
      const member = await orgMemberModel.find(input.orgId, input.userId);
      if (member?.role === 'owner') {
        const owners = await orgMemberModel.getOwners(input.orgId);
        if (owners.length === 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot remove the last owner. Transfer ownership first.',
          });
        }
      }

      const success = await orgMemberModel.remove(input.orgId, input.userId);
      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Member not found',
        });
      }

      return { success: true };
    }),

  // ============ Teams ============

  /**
   * List teams in an organization
   */
  listTeams: publicProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ input }) => {
      return teamModel.listByOrg(input.orgId);
    }),

  /**
   * Get a team by ID
   */
  getTeam: publicProcedure
    .input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ input }) => {
      const team = await teamModel.findById(input.teamId);
      if (!team) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Team not found',
        });
      }
      return team;
    }),

  /**
   * Create a team
   */
  createTeam: protectedProcedure
    .input(z.object({
      orgId: z.string().uuid(),
      name: z.string().min(1).max(50),
      description: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check permission
      const hasPermission = await orgMemberModel.hasRole(input.orgId, ctx.user.id, 'admin');
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to create teams',
        });
      }

      // Check if team name exists
      const existing = await teamModel.findByName(input.orgId, input.name);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A team with this name already exists',
        });
      }

      const team = await teamModel.create({
        orgId: input.orgId,
        name: input.name,
        description: input.description,
      });

      return team;
    }),

  /**
   * Update a team
   */
  updateTeam: protectedProcedure
    .input(z.object({
      teamId: z.string().uuid(),
      name: z.string().min(1).max(50).optional(),
      description: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const team = await teamModel.findById(input.teamId);
      if (!team) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Team not found',
        });
      }

      // Check permission
      const hasPermission = await orgMemberModel.hasRole(team.orgId, ctx.user.id, 'admin');
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update teams',
        });
      }

      const { teamId, ...updateData } = input;
      const updated = await teamModel.update(teamId, updateData);
      return updated;
    }),

  /**
   * Delete a team
   */
  deleteTeam: protectedProcedure
    .input(z.object({ teamId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const team = await teamModel.findById(input.teamId);
      if (!team) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Team not found',
        });
      }

      // Check permission
      const hasPermission = await orgMemberModel.hasRole(team.orgId, ctx.user.id, 'admin');
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete teams',
        });
      }

      const success = await teamModel.delete(input.teamId);
      return { success };
    }),

  /**
   * List team members
   */
  listTeamMembers: publicProcedure
    .input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ input }) => {
      const members = await teamMemberModel.listByTeam(input.teamId);
      return members.map(m => ({
        userId: m.userId,
        joinedAt: m.createdAt,
        user: {
          id: m.user.id,
          username: m.user.username,
          name: m.user.name,
          avatarUrl: m.user.avatarUrl,
        },
      }));
    }),

  /**
   * Add member to team
   */
  addTeamMember: protectedProcedure
    .input(z.object({
      teamId: z.string().uuid(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const team = await teamModel.findById(input.teamId);
      if (!team) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Team not found',
        });
      }

      // Check permission
      const hasPermission = await orgMemberModel.hasRole(team.orgId, ctx.user.id, 'admin');
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage team members',
        });
      }

      // Check if user is org member
      const isOrgMember = await orgMemberModel.isMember(team.orgId, input.userId);
      if (!isOrgMember) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User must be an organization member to join a team',
        });
      }

      // Check if already a team member
      const isTeamMember = await teamMemberModel.isMember(input.teamId, input.userId);
      if (isTeamMember) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User is already a team member',
        });
      }

      const member = await teamMemberModel.add(input.teamId, input.userId);
      return member;
    }),

  /**
   * Remove member from team
   */
  removeTeamMember: protectedProcedure
    .input(z.object({
      teamId: z.string().uuid(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const team = await teamModel.findById(input.teamId);
      if (!team) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Team not found',
        });
      }

      // Members can remove themselves, admins can remove others
      const isSelf = ctx.user.id === input.userId;
      if (!isSelf) {
        const hasPermission = await orgMemberModel.hasRole(team.orgId, ctx.user.id, 'admin');
        if (!hasPermission) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to remove team members',
          });
        }
      }

      const success = await teamMemberModel.remove(input.teamId, input.userId);
      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Team member not found',
        });
      }

      return { success: true };
    }),
});
