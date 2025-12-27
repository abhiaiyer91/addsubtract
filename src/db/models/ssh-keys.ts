/**
 * SSH Keys Model
 *
 * Database operations for user SSH public keys.
 * Used for SSH-based Git operations (push/pull over SSH).
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../index';
import { sshKeys, type SSHKey, type NewSSHKey } from '../schema';

export const sshKeyModel = {
  /**
   * Find an SSH key by ID
   */
  async findById(id: string): Promise<SSHKey | undefined> {
    const db = getDb();
    const [key] = await db.select().from(sshKeys).where(eq(sshKeys.id, id));
    return key;
  },

  /**
   * Find all SSH keys for a user
   */
  async findByUserId(userId: string): Promise<SSHKey[]> {
    const db = getDb();
    return db.select().from(sshKeys).where(eq(sshKeys.userId, userId));
  },

  /**
   * Find an SSH key by its fingerprint (unique identifier)
   */
  async findByFingerprint(fingerprint: string): Promise<SSHKey | undefined> {
    const db = getDb();
    const [key] = await db
      .select()
      .from(sshKeys)
      .where(eq(sshKeys.fingerprint, fingerprint));
    return key;
  },

  /**
   * Create a new SSH key
   */
  async create(data: NewSSHKey): Promise<SSHKey> {
    const db = getDb();
    const [key] = await db.insert(sshKeys).values(data).returning();
    return key;
  },

  /**
   * Update the last used timestamp for a key
   */
  async updateLastUsed(id: string): Promise<SSHKey | undefined> {
    const db = getDb();
    const [key] = await db
      .update(sshKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(sshKeys.id, id))
      .returning();
    return key;
  },

  /**
   * Update key title
   */
  async updateTitle(id: string, title: string): Promise<SSHKey | undefined> {
    const db = getDb();
    const [key] = await db
      .update(sshKeys)
      .set({ title })
      .where(eq(sshKeys.id, id))
      .returning();
    return key;
  },

  /**
   * Delete an SSH key
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(sshKeys).where(eq(sshKeys.id, id)).returning();
    return result.length > 0;
  },

  /**
   * Delete all SSH keys for a user
   */
  async deleteAllForUser(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(sshKeys)
      .where(eq(sshKeys.userId, userId))
      .returning();
    return result.length;
  },

  /**
   * Count keys for a user
   */
  async countByUserId(userId: string): Promise<number> {
    const db = getDb();
    const keys = await db.select().from(sshKeys).where(eq(sshKeys.userId, userId));
    return keys.length;
  },

  /**
   * Check if a user owns a specific key
   */
  async isOwnedByUser(keyId: string, userId: string): Promise<boolean> {
    const key = await this.findById(keyId);
    return key?.userId === userId;
  },
};
