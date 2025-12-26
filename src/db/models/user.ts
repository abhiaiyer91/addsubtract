import { eq, or, ilike } from 'drizzle-orm';
import { getDb } from '../index';
import {
  users,
  sessions,
  oauthAccounts,
  type User,
  type NewUser,
  type Session,
  type NewSession,
  type OAuthAccount,
  type NewOAuthAccount,
} from '../schema';

export const userModel = {
  /**
   * Find a user by their ID
   */
  async findById(id: string): Promise<User | undefined> {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  /**
   * Find a user by username
   */
  async findByUsername(username: string): Promise<User | undefined> {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  },

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  },

  /**
   * Find a user by username or email
   */
  async findByUsernameOrEmail(usernameOrEmail: string): Promise<User | undefined> {
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(eq(users.username, usernameOrEmail), eq(users.email, usernameOrEmail))
      );
    return user;
  },

  /**
   * Search users by username or name
   */
  async search(query: string, limit = 20): Promise<User[]> {
    const db = getDb();
    return db
      .select()
      .from(users)
      .where(or(ilike(users.username, `%${query}%`), ilike(users.name, `%${query}%`)))
      .limit(limit);
  },

  /**
   * Create a new user
   */
  async create(data: NewUser): Promise<User> {
    const db = getDb();
    const [user] = await db.insert(users).values(data).returning();
    return user;
  },

  /**
   * Update a user
   */
  async update(
    id: string,
    data: Partial<Omit<NewUser, 'id' | 'createdAt'>>
  ): Promise<User | undefined> {
    const db = getDb();
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  },

  /**
   * Delete a user
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  },

  /**
   * Check if username is available
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const user = await this.findByUsername(username);
    return !user;
  },

  /**
   * Check if email is available
   */
  async isEmailAvailable(email: string): Promise<boolean> {
    const user = await this.findByEmail(email);
    return !user;
  },
};

export const sessionModel = {
  /**
   * Find a session by ID
   */
  async findById(id: string): Promise<Session | undefined> {
    const db = getDb();
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session;
  },

  /**
   * Find a session with its user
   */
  async findWithUser(
    id: string
  ): Promise<{ session: Session; user: User } | undefined> {
    const db = getDb();
    const result = await db
      .select()
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, id));

    if (result.length === 0) return undefined;

    return {
      session: result[0].sessions,
      user: result[0].users,
    };
  },

  /**
   * Create a new session
   */
  async create(data: NewSession): Promise<Session> {
    const db = getDb();
    const [session] = await db.insert(sessions).values(data).returning();
    return session;
  },

  /**
   * Delete a session
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(sessions).where(eq(sessions.id, id)).returning();
    return result.length > 0;
  },

  /**
   * Delete all sessions for a user
   */
  async deleteAllForUser(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(sessions)
      .where(eq(sessions.userId, userId))
      .returning();
    return result.length;
  },

  /**
   * Delete expired sessions
   */
  async deleteExpired(): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(sessions)
      .where(eq(sessions.expiresAt, new Date()))
      .returning();
    return result.length;
  },
};

export const oauthAccountModel = {
  /**
   * Find OAuth account by provider and provider account ID
   */
  async findByProviderAccount(
    provider: string,
    providerAccountId: string
  ): Promise<OAuthAccount | undefined> {
    const db = getDb();
    const [account] = await db
      .select()
      .from(oauthAccounts)
      .where(
        eq(oauthAccounts.provider, provider) &&
          eq(oauthAccounts.providerAccountId, providerAccountId)
      );
    return account;
  },

  /**
   * Find all OAuth accounts for a user
   */
  async findByUserId(userId: string): Promise<OAuthAccount[]> {
    const db = getDb();
    return db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
  },

  /**
   * Create a new OAuth account link
   */
  async create(data: NewOAuthAccount): Promise<OAuthAccount> {
    const db = getDb();
    const [account] = await db.insert(oauthAccounts).values(data).returning();
    return account;
  },

  /**
   * Update OAuth account tokens
   */
  async updateTokens(
    id: string,
    tokens: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: Date;
    }
  ): Promise<OAuthAccount | undefined> {
    const db = getDb();
    const [account] = await db
      .update(oauthAccounts)
      .set(tokens)
      .where(eq(oauthAccounts.id, id))
      .returning();
    return account;
  },

  /**
   * Delete an OAuth account link
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(oauthAccounts)
      .where(eq(oauthAccounts.id, id))
      .returning();
    return result.length > 0;
  },
};
