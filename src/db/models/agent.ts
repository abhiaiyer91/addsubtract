/**
 * Agent Session and File Change Models
 * 
 * Handles database operations for the wit coding agent's
 * session management and file change tracking.
 * 
 * NOTE: Conversation history is managed by Mastra Memory.
 * See src/ai/services/conversation.ts for the conversation API.
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../index';
import {
  agentSessions,
  agentFileChanges,
  type AgentSession,
  type NewAgentSession,
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
      mode?: 'pm' | 'code';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AgentSession[]> {
    const db = getDb();
    const { repoId, status, mode, limit = 50, offset = 0 } = options;

    const conditions = [eq(agentSessions.userId, userId)];
    
    if (repoId) {
      conditions.push(eq(agentSessions.repoId, repoId));
    }
    
    if (status) {
      conditions.push(eq(agentSessions.status, status));
    }
    
    if (mode) {
      conditions.push(eq(agentSessions.mode, mode));
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
    data: Partial<Pick<AgentSession, 'title' | 'status' | 'branch' | 'mode'>>
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
   * Delete a session (cascades to file changes)
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
