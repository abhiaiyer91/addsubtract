import { eq, and, or, desc, sql, ilike } from 'drizzle-orm';
import { getDb } from '../index';
import {
  repositories,
  collaborators,
  stars,
  watches,
  organizations,
  users,
  type Repository,
  type NewRepository,
  type Collaborator,
  type NewCollaborator,
  type Star,
  type Watch,
} from '../schema';
import { user } from '../auth-schema';

// Owner type - compatible with both old users and better-auth user table
type Owner = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  avatarUrl: string | null;
};

export const repoModel = {
  /**
   * Find a repository by ID
   */
  async findById(id: string): Promise<Repository | undefined> {
    const db = getDb();
    const [repo] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, id));
    return repo;
  },

  /**
   * Find a repository by owner and name
   */
  async findByOwnerAndName(
    ownerId: string,
    name: string
  ): Promise<Repository | undefined> {
    const db = getDb();
    const [repo] = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.ownerId, ownerId), eq(repositories.name, name)));
    return repo;
  },

  /**
   * Find a repository by username/orgname and repo name
   */
  async findByPath(
    ownerName: string,
    repoName: string
  ): Promise<
    | { repo: Repository; owner: Owner | { id: string; name: string; type: 'organization' } }
    | undefined
  > {
    const db = getDb();

    // Try better-auth user table first (new users have text IDs)
    try {
      const userResult = await db
        .select()
        .from(repositories)
        .innerJoin(user, sql`${repositories.ownerId}::text = ${user.id}`)
        .where(
          and(
            eq(user.username, ownerName),
            eq(repositories.name, repoName),
            eq(repositories.ownerType, 'user')
          )
        );

      if (userResult.length > 0) {
        return {
          repo: userResult[0].repositories,
          owner: {
            id: userResult[0].user.id,
            name: userResult[0].user.name,
            email: userResult[0].user.email,
            username: userResult[0].user.username,
            image: userResult[0].user.image,
            avatarUrl: userResult[0].user.avatarUrl,
          },
        };
      }
    } catch {
      // Ignore errors from type mismatch, try legacy table
    }

    // Try legacy users table (old users have UUID IDs)
    const legacyUserResult = await db
      .select()
      .from(repositories)
      .innerJoin(users, eq(repositories.ownerId, users.id))
      .where(
        and(
          eq(users.username, ownerName),
          eq(repositories.name, repoName),
          eq(repositories.ownerType, 'user')
        )
      );

    if (legacyUserResult.length > 0) {
      return {
        repo: legacyUserResult[0].repositories,
        owner: {
          id: legacyUserResult[0].users.id,
          name: legacyUserResult[0].users.name ?? '',
          email: legacyUserResult[0].users.email,
          username: legacyUserResult[0].users.username,
          image: null,
          avatarUrl: legacyUserResult[0].users.avatarUrl,
        },
      };
    }

    // Try organization
    const orgResult = await db
      .select()
      .from(repositories)
      .innerJoin(organizations, eq(repositories.ownerId, organizations.id))
      .where(
        and(
          eq(organizations.name, ownerName),
          eq(repositories.name, repoName),
          eq(repositories.ownerType, 'organization')
        )
      );

    if (orgResult.length > 0) {
      return {
        repo: orgResult[0].repositories,
        owner: {
          id: orgResult[0].organizations.id,
          name: orgResult[0].organizations.name,
          type: 'organization' as const,
        },
      };
    }

    return undefined;
  },

  /**
   * Create a new repository
   */
  async create(data: NewRepository): Promise<Repository> {
    const db = getDb();
    const [repo] = await db.insert(repositories).values(data).returning();
    return repo;
  },

  /**
   * Update a repository
   */
  async update(
    id: string,
    data: Partial<Omit<NewRepository, 'id' | 'createdAt'>>
  ): Promise<Repository | undefined> {
    const db = getDb();
    const [repo] = await db
      .update(repositories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(repositories.id, id))
      .returning();
    return repo;
  },

  /**
   * Delete a repository
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(repositories)
      .where(eq(repositories.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * List repositories by owner
   */
  async listByOwner(
    ownerId: string,
    ownerType: 'user' | 'organization'
  ): Promise<Repository[]> {
    const db = getDb();
    return db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.ownerId, ownerId),
          eq(repositories.ownerType, ownerType)
        )
      )
      .orderBy(desc(repositories.updatedAt));
  },

  /**
   * List public repositories by owner
   */
  async listPublicByOwner(
    ownerId: string,
    ownerType: 'user' | 'organization'
  ): Promise<Repository[]> {
    const db = getDb();
    return db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.ownerId, ownerId),
          eq(repositories.ownerType, ownerType),
          eq(repositories.isPrivate, false)
        )
      )
      .orderBy(desc(repositories.updatedAt));
  },

  /**
   * List forked repositories
   */
  async listForks(repoId: string): Promise<Repository[]> {
    const db = getDb();
    return db
      .select()
      .from(repositories)
      .where(eq(repositories.forkedFromId, repoId))
      .orderBy(desc(repositories.createdAt));
  },

  /**
   * Search repositories
   */
  async search(query: string, limit = 20): Promise<Repository[]> {
    const db = getDb();
    return db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.isPrivate, false),
          or(
            ilike(repositories.name, `%${query}%`),
            ilike(repositories.description, `%${query}%`)
          )
        )
      )
      .orderBy(desc(repositories.starsCount))
      .limit(limit);
  },

  /**
   * Increment a counter field (prevents negative values)
   */
  async incrementCounter(
    id: string,
    field: 'starsCount' | 'forksCount' | 'watchersCount' | 'openIssuesCount' | 'openPrsCount',
    delta: number
  ): Promise<void> {
    const db = getDb();
    // Use GREATEST to prevent negative values
    await db
      .update(repositories)
      .set({
        [field]: sql`GREATEST(0, ${repositories[field]} + ${delta})`,
        updatedAt: new Date(),
      })
      .where(eq(repositories.id, id));
  },

  /**
   * Update pushed timestamp
   */
  async updatePushedAt(id: string): Promise<void> {
    const db = getDb();
    const now = new Date();
    await db
      .update(repositories)
      .set({ pushedAt: now, updatedAt: now })
      .where(eq(repositories.id, id));
  },

  /**
   * Increment forks count
   */
  async incrementForksCount(id: string): Promise<void> {
    await this.incrementCounter(id, 'forksCount', 1);
  },
};

export const collaboratorModel = {
  /**
   * Find a collaborator
   */
  async find(
    repoId: string,
    userId: string
  ): Promise<Collaborator | undefined> {
    const db = getDb();
    const [collab] = await db
      .select()
      .from(collaborators)
      .where(
        and(eq(collaborators.repoId, repoId), eq(collaborators.userId, userId))
      );
    return collab;
  },

  /**
   * List all collaborators for a repository
   */
  async listByRepo(repoId: string): Promise<(Collaborator & { user: Owner })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(collaborators)
      .innerJoin(user, eq(collaborators.userId, user.id))
      .where(eq(collaborators.repoId, repoId));

    return result.map((r) => ({
      ...r.collaborators,
      user: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        username: r.user.username,
        image: r.user.image,
        avatarUrl: r.user.avatarUrl,
      },
    }));
  },

  /**
   * Add a collaborator
   */
  async add(data: NewCollaborator): Promise<Collaborator> {
    const db = getDb();
    const [collab] = await db.insert(collaborators).values(data).returning();
    return collab;
  },

  /**
   * Update collaborator permission
   */
  async updatePermission(
    repoId: string,
    userId: string,
    permission: 'read' | 'write' | 'admin'
  ): Promise<Collaborator | undefined> {
    const db = getDb();
    const [collab] = await db
      .update(collaborators)
      .set({ permission })
      .where(
        and(eq(collaborators.repoId, repoId), eq(collaborators.userId, userId))
      )
      .returning();
    return collab;
  },

  /**
   * Remove a collaborator
   */
  async remove(repoId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(collaborators)
      .where(
        and(eq(collaborators.repoId, repoId), eq(collaborators.userId, userId))
      )
      .returning();
    return result.length > 0;
  },

  /**
   * Check if user has permission
   */
  async hasPermission(
    repoId: string,
    userId: string,
    requiredPermission: 'read' | 'write' | 'admin'
  ): Promise<boolean> {
    const collab = await this.find(repoId, userId);
    if (!collab) return false;

    const permissionLevels = { read: 1, write: 2, admin: 3 };
    return (
      permissionLevels[collab.permission] >= permissionLevels[requiredPermission]
    );
  },
};

export const starModel = {
  /**
   * Check if user has starred a repo
   */
  async exists(repoId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const [star] = await db
      .select()
      .from(stars)
      .where(and(eq(stars.repoId, repoId), eq(stars.userId, userId)));
    return !!star;
  },

  /**
   * Star a repository
   */
  async add(repoId: string, userId: string): Promise<Star> {
    const db = getDb();
    const [star] = await db
      .insert(stars)
      .values({ repoId, userId })
      .onConflictDoNothing()
      .returning();

    if (star) {
      await repoModel.incrementCounter(repoId, 'starsCount', 1);
    }

    return star;
  },

  /**
   * Unstar a repository
   */
  async remove(repoId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(stars)
      .where(and(eq(stars.repoId, repoId), eq(stars.userId, userId)))
      .returning();

    if (result.length > 0) {
      await repoModel.incrementCounter(repoId, 'starsCount', -1);
      return true;
    }

    return false;
  },

  /**
   * List starred repos for a user
   */
  async listByUser(userId: string): Promise<Repository[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(stars)
      .innerJoin(repositories, eq(stars.repoId, repositories.id))
      .where(eq(stars.userId, userId))
      .orderBy(desc(stars.createdAt));

    return result.map((r) => r.repositories);
  },

  /**
   * List users who starred a repo
   */
  async listByRepo(repoId: string): Promise<Owner[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(stars)
      .innerJoin(user, eq(stars.userId, user.id))
      .where(eq(stars.repoId, repoId))
      .orderBy(desc(stars.createdAt));

    return result.map((r) => ({
      id: r.user.id,
      name: r.user.name,
      email: r.user.email,
      username: r.user.username,
      image: r.user.image,
      avatarUrl: r.user.avatarUrl,
    }));
  },
};

export const watchModel = {
  /**
   * Check if user is watching a repo
   */
  async exists(repoId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const [watch] = await db
      .select()
      .from(watches)
      .where(and(eq(watches.repoId, repoId), eq(watches.userId, userId)));
    return !!watch;
  },

  /**
   * Watch a repository
   */
  async add(repoId: string, userId: string): Promise<Watch> {
    const db = getDb();
    const [watch] = await db
      .insert(watches)
      .values({ repoId, userId })
      .onConflictDoNothing()
      .returning();

    if (watch) {
      await repoModel.incrementCounter(repoId, 'watchersCount', 1);
    }

    return watch;
  },

  /**
   * Unwatch a repository
   */
  async remove(repoId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(watches)
      .where(and(eq(watches.repoId, repoId), eq(watches.userId, userId)))
      .returning();

    if (result.length > 0) {
      await repoModel.incrementCounter(repoId, 'watchersCount', -1);
      return true;
    }

    return false;
  },

  /**
   * List watchers for a repo
   */
  async listByRepo(repoId: string): Promise<Owner[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(watches)
      .innerJoin(user, eq(watches.userId, user.id))
      .where(eq(watches.repoId, repoId))
      .orderBy(desc(watches.createdAt));

    return result.map((r) => ({
      id: r.user.id,
      name: r.user.name,
      email: r.user.email,
      username: r.user.username,
      image: r.user.image,
      avatarUrl: r.user.avatarUrl,
    }));
  },
};
