import { eq, and, ilike } from 'drizzle-orm';
import { getDb } from '../index';
import {
  organizations,
  orgMembers,
  teams,
  teamMembers,
  type Organization,
  type NewOrganization,
  type OrgMember,
  type NewOrgMember,
  type Team,
  type NewTeam,
  type TeamMember,
} from '../schema';
import { user } from '../auth-schema';

export const orgModel = {
  /**
   * Find an organization by ID
   */
  async findById(id: string): Promise<Organization | undefined> {
    const db = getDb();
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id));
    return org;
  },

  /**
   * Find an organization by name (URL slug)
   */
  async findByName(name: string): Promise<Organization | undefined> {
    const db = getDb();
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, name));
    return org;
  },

  /**
   * Search organizations by name
   */
  async search(query: string, limit = 20): Promise<Organization[]> {
    const db = getDb();
    return db
      .select()
      .from(organizations)
      .where(
        ilike(organizations.name, `%${query}%`)
      )
      .limit(limit);
  },

  /**
   * Create a new organization
   */
  async create(
    data: NewOrganization,
    creatorId: string
  ): Promise<Organization> {
    const db = getDb();
    const [org] = await db.insert(organizations).values(data).returning();

    // Add creator as owner
    await db.insert(orgMembers).values({
      orgId: org.id,
      userId: creatorId,
      role: 'owner',
    });

    return org;
  },

  /**
   * Update an organization
   */
  async update(
    id: string,
    data: Partial<Omit<NewOrganization, 'id' | 'createdAt'>>
  ): Promise<Organization | undefined> {
    const db = getDb();
    const [org] = await db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return org;
  },

  /**
   * Delete an organization
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(organizations)
      .where(eq(organizations.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Check if name is available
   */
  async isNameAvailable(name: string): Promise<boolean> {
    const org = await this.findByName(name);
    return !org;
  },
};

export const orgMemberModel = {
  /**
   * Find a member
   */
  async find(
    orgId: string,
    userId: string
  ): Promise<OrgMember | undefined> {
    const db = getDb();
    const [member] = await db
      .select()
      .from(orgMembers)
      .where(
        and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId))
      );
    return member;
  },

  /**
   * List all members of an organization
   */
  async listByOrg(
    orgId: string
  ): Promise<(OrgMember & { user: typeof user.$inferSelect })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(orgMembers)
      .innerJoin(user, eq(orgMembers.userId, user.id))
      .where(eq(orgMembers.orgId, orgId));

    return result.map((r) => ({
      ...r.org_members,
      user: r.user,
    }));
  },

  /**
   * List organizations for a user
   */
  async listByUser(
    userId: string
  ): Promise<(OrgMember & { org: Organization })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(eq(orgMembers.userId, userId));

    return result.map((r) => ({
      ...r.org_members,
      org: r.organizations,
    }));
  },

  /**
   * Add a member to an organization
   */
  async add(data: NewOrgMember): Promise<OrgMember> {
    const db = getDb();
    const [member] = await db.insert(orgMembers).values(data).returning();
    return member;
  },

  /**
   * Update member role
   */
  async updateRole(
    orgId: string,
    userId: string,
    role: 'member' | 'admin' | 'owner'
  ): Promise<OrgMember | undefined> {
    const db = getDb();
    const [member] = await db
      .update(orgMembers)
      .set({ role })
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .returning();
    return member;
  },

  /**
   * Remove a member from an organization
   */
  async remove(orgId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .returning();
    return result.length > 0;
  },

  /**
   * Check if user is a member
   */
  async isMember(orgId: string, userId: string): Promise<boolean> {
    const member = await this.find(orgId, userId);
    return !!member;
  },

  /**
   * Check if user has role
   */
  async hasRole(
    orgId: string,
    userId: string,
    requiredRole: 'member' | 'admin' | 'owner'
  ): Promise<boolean> {
    const member = await this.find(orgId, userId);
    if (!member) return false;

    const roleLevels = { member: 1, admin: 2, owner: 3 };
    return roleLevels[member.role] >= roleLevels[requiredRole];
  },

  /**
   * Get owners of an organization
   */
  async getOwners(orgId: string): Promise<User[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(orgMembers)
      .innerJoin(user, eq(orgMembers.userId, user.id))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, 'owner')));

    return result.map((r) => r.user);
  },
};

export const teamModel = {
  /**
   * Find a team by ID
   */
  async findById(id: string): Promise<Team | undefined> {
    const db = getDb();
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  },

  /**
   * Find a team by org and name
   */
  async findByName(orgId: string, name: string): Promise<Team | undefined> {
    const db = getDb();
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.orgId, orgId), eq(teams.name, name)));
    return team;
  },

  /**
   * List teams in an organization
   */
  async listByOrg(orgId: string): Promise<Team[]> {
    const db = getDb();
    return db.select().from(teams).where(eq(teams.orgId, orgId));
  },

  /**
   * Create a team
   */
  async create(data: NewTeam): Promise<Team> {
    const db = getDb();
    const [team] = await db.insert(teams).values(data).returning();
    return team;
  },

  /**
   * Update a team
   */
  async update(
    id: string,
    data: Partial<Omit<NewTeam, 'id' | 'orgId' | 'createdAt'>>
  ): Promise<Team | undefined> {
    const db = getDb();
    const [team] = await db
      .update(teams)
      .set(data)
      .where(eq(teams.id, id))
      .returning();
    return team;
  },

  /**
   * Delete a team
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(teams).where(eq(teams.id, id)).returning();
    return result.length > 0;
  },
};

export const teamMemberModel = {
  /**
   * Check if user is a team member
   */
  async isMember(teamId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
      );
    return !!member;
  },

  /**
   * List members of a team
   */
  async listByTeam(teamId: string): Promise<(TeamMember & { user: typeof user.$inferSelect })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(teamMembers)
      .innerJoin(user, eq(teamMembers.userId, user.id))
      .where(eq(teamMembers.teamId, teamId));

    return result.map((r) => ({
      ...r.team_members,
      user: r.user,
    }));
  },

  /**
   * List teams for a user
   */
  async listByUser(userId: string): Promise<(TeamMember & { team: Team })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId));

    return result.map((r) => ({
      ...r.team_members,
      team: r.teams,
    }));
  },

  /**
   * Add a member to a team
   */
  async add(teamId: string, userId: string): Promise<TeamMember> {
    const db = getDb();
    const [member] = await db
      .insert(teamMembers)
      .values({ teamId, userId })
      .returning();
    return member;
  },

  /**
   * Remove a member from a team
   */
  async remove(teamId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
      )
      .returning();
    return result.length > 0;
  },
};
