import { eq, or, ilike } from 'drizzle-orm';
import { getDb } from '../index';
import { user } from '../auth-schema';

// User type from better-auth schema
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

// Bot user constants
const BOT_USERNAME = 'wit-bot';
const BOT_EMAIL = 'bot@wit.dev';
const BOT_NAME = 'Wit Bot';

export const userModel = {
  /**
   * Find a user by their ID
   */
  async findById(id: string): Promise<User | undefined> {
    const db = getDb();
    const [found] = await db.select().from(user).where(eq(user.id, id));
    return found;
  },

  /**
   * Find a user by username
   */
  async findByUsername(username: string): Promise<User | undefined> {
    const db = getDb();
    const [found] = await db.select().from(user).where(eq(user.username, username));
    return found;
  },

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const db = getDb();
    const [found] = await db.select().from(user).where(eq(user.email, email));
    return found;
  },

  /**
   * Find a user by username or email
   */
  async findByUsernameOrEmail(usernameOrEmail: string): Promise<User | undefined> {
    const db = getDb();
    const [found] = await db
      .select()
      .from(user)
      .where(
        or(eq(user.username, usernameOrEmail), eq(user.email, usernameOrEmail))
      );
    return found;
  },

  /**
   * Search users by username or name
   */
  async search(query: string, limit = 20): Promise<User[]> {
    const db = getDb();
    return db
      .select()
      .from(user)
      .where(or(ilike(user.username, `%${query}%`), ilike(user.name, `%${query}%`)))
      .limit(limit);
  },

  /**
   * Create a new user (for internal use - better-auth handles registration)
   */
  async create(data: { 
    id?: string;
    name?: string; 
    email: string; 
    username?: string;
    avatarUrl?: string;
  }): Promise<User> {
    const db = getDb();
    const id = data.id || crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    // Default name to username or email prefix if not provided
    const name = data.name || data.username || data.email.split('@')[0];
    const [created] = await db.insert(user).values({
      id,
      name,
      email: data.email,
      username: data.username || null,
      avatarUrl: data.avatarUrl || null,
      emailVerified: false,
    }).returning();
    return created;
  },

  /**
   * Update a user
   */
  async update(
    id: string,
    data: Partial<Omit<NewUser, 'id' | 'createdAt'>>
  ): Promise<User | undefined> {
    const db = getDb();
    const [updated] = await db
      .update(user)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();
    return updated;
  },

  /**
   * Check if username is available
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const found = await this.findByUsername(username);
    return !found;
  },

  /**
   * Check if email is available
   */
  async isEmailAvailable(email: string): Promise<boolean> {
    const found = await this.findByEmail(email);
    return !found;
  },

  /**
   * Delete a user by ID
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(user).where(eq(user.id, id)).returning();
    return result.length > 0;
  },

  /**
   * Get or create the AI bot user
   * This user is used as the author for AI-generated comments, reviews, etc.
   */
  async getOrCreateBotUser(): Promise<User> {
    // Try to find existing bot user
    const existing = await this.findByUsername(BOT_USERNAME);
    if (existing) {
      return existing;
    }

    // Create the bot user
    console.log('[UserModel] Creating wit-bot user');
    return this.create({
      name: BOT_NAME,
      email: BOT_EMAIL,
      username: BOT_USERNAME,
    });
  },
};
