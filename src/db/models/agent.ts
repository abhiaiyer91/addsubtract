/**
 * Agent Session and Message Models
 * 
 * Handles database operations for the wit coding agent's
 * conversation history and file change tracking.
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../index';
import {
  agentSessions,
  agentMessages,
  agentFileChanges,
  type AgentSession,
  type NewAgentSession,
  type AgentMessage,
  type NewAgentMessage,
  type AgentFileChange,
  type NewAgentFileChange,
} from '../schema';

// ============ AGENT SESSION MODEL ============

export const agentSessionModel = {
  /**
   * Create a new agent session
   */
  async create(data: NewAgentSession): Promise<AgentSession> {
    const db = getDb();
    const [session] = await db
      .insert(agentSessions)
      .values(data)
      .returning();
    return session;
  },

  /**
   * Find a session by ID
   */
  async findById(id: string): Promise<AgentSession | undefined> {
    const db = getDb();
    const [session] = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, id));
    return session;
  },

  /**
   * Find a session by ID and verify ownership
   */
  async findByIdForUser(id: string, userId: string): Promise<AgentSession | undefined> {
    const db = getDb();
    const [session] = await db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.id, id), eq(agentSessions.userId, userId)));
    return session;
  },

  /**
   * List sessions for a user
   */
  async listByUser(
    userId: string,
    options: {
      repoId?: string;
      status?: 'active' | 'completed' | 'cancelled';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AgentSession[]> {
    const db = getDb();
    const { repoId, status, limit = 50, offset = 0 } = options;

    const conditions = [eq(agentSessions.userId, userId)];
    
    if (repoId) {
      conditions.push(eq(agentSessions.repoId, repoId));
    }
    
    if (status) {
      conditions.push(eq(agentSessions.status, status));
    }

    return db
      .select()
      .from(agentSessions)
      .where(and(...conditions))
      .orderBy(desc(agentSessions.updatedAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Update a session
   */
  async update(
    id: string,
    data: Partial<Pick<AgentSession, 'title' | 'status' | 'branch'>>
  ): Promise<AgentSession | undefined> {
    const db = getDb();
    const [session] = await db
      .update(agentSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agentSessions.id, id))
      .returning();
    return session;
  },

  /**
   * Delete a session (cascades to messages and file changes)
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(agentSessions)
      .where(eq(agentSessions.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Touch session (update timestamp)
   */
  async touch(id: string): Promise<void> {
    const db = getDb();
    await db
      .update(agentSessions)
      .set({ updatedAt: new Date() })
      .where(eq(agentSessions.id, id));
  },
};

// ============ AGENT MESSAGE MODEL ============

export const agentMessageModel = {
  /**
   * Create a new message
   */
  async create(data: NewAgentMessage): Promise<AgentMessage> {
    const db = getDb();
    const [message] = await db
      .insert(agentMessages)
      .values(data)
      .returning();

    // Update session timestamp
    await agentSessionModel.touch(data.sessionId);

    return message;
  },

  /**
   * Find a message by ID
   */
  async findById(id: string): Promise<AgentMessage | undefined> {
    const db = getDb();
    const [message] = await db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.id, id));
    return message;
  },

  /**
   * List messages for a session
   */
  async listBySession(
    sessionId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<AgentMessage[]> {
    const db = getDb();
    const { limit = 100, offset = 0 } = options;

    return db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.sessionId, sessionId))
      .orderBy(agentMessages.createdAt)
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get the last N messages for context
   */
  async getRecentMessages(sessionId: string, count: number = 10): Promise<AgentMessage[]> {
    const db = getDb();
    
    const messages = await db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.sessionId, sessionId))
      .orderBy(desc(agentMessages.createdAt))
      .limit(count);

    // Reverse to get chronological order
    return messages.reverse();
  },

  /**
   * Delete messages for a session
   */
  async deleteBySession(sessionId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(agentMessages)
      .where(eq(agentMessages.sessionId, sessionId))
      .returning();
    return result.length;
  },
};

// ============ AGENT FILE CHANGE MODEL ============

export const agentFileChangeModel = {
  /**
   * Create a file change proposal
   */
  async create(data: NewAgentFileChange): Promise<AgentFileChange> {
    const db = getDb();
    const [change] = await db
      .insert(agentFileChanges)
      .values(data)
      .returning();
    return change;
  },

  /**
   * Find a file change by ID
   */
  async findById(id: string): Promise<AgentFileChange | undefined> {
    const db = getDb();
    const [change] = await db
      .select()
      .from(agentFileChanges)
      .where(eq(agentFileChanges.id, id));
    return change;
  },

  /**
   * List pending file changes for a session
   */
  async listPendingBySession(sessionId: string): Promise<AgentFileChange[]> {
    const db = getDb();
    return db
      .select()
      .from(agentFileChanges)
      .where(
        and(
          eq(agentFileChanges.sessionId, sessionId),
          eq(agentFileChanges.approved, false)
        )
      )
      .orderBy(agentFileChanges.createdAt);
  },

  /**
   * List all file changes for a session
   */
  async listBySession(sessionId: string): Promise<AgentFileChange[]> {
    const db = getDb();
    return db
      .select()
      .from(agentFileChanges)
      .where(eq(agentFileChanges.sessionId, sessionId))
      .orderBy(agentFileChanges.createdAt);
  },

  /**
   * Approve a file change
   */
  async approve(id: string): Promise<AgentFileChange | undefined> {
    const db = getDb();
    const [change] = await db
      .update(agentFileChanges)
      .set({ approved: true, appliedAt: new Date() })
      .where(eq(agentFileChanges.id, id))
      .returning();
    return change;
  },

  /**
   * Reject a file change
   */
  async reject(id: string): Promise<AgentFileChange | undefined> {
    const db = getDb();
    const [change] = await db
      .update(agentFileChanges)
      .set({ approved: false })
      .where(eq(agentFileChanges.id, id))
      .returning();
    return change;
  },

  /**
   * Approve all pending changes for a session
   */
  async approveAllForSession(sessionId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .update(agentFileChanges)
      .set({ approved: true, appliedAt: new Date() })
      .where(
        and(
          eq(agentFileChanges.sessionId, sessionId),
          eq(agentFileChanges.approved, false)
        )
      )
      .returning();
    return result.length;
  },
};
