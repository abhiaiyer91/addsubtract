import { eq, desc } from 'drizzle-orm';
import { getDb } from '../index';
import {
  triageAgentConfig,
  triageAgentRuns,
  type TriageAgentConfig,
  type NewTriageAgentConfig,
  type TriageAgentRun,
  type NewTriageAgentRun,
} from '../schema';

export const triageAgentConfigModel = {
  /**
   * Get triage agent configuration for a repository
   */
  async findByRepoId(repoId: string): Promise<TriageAgentConfig | undefined> {
    const db = getDb();
    const [config] = await db
      .select()
      .from(triageAgentConfig)
      .where(eq(triageAgentConfig.repoId, repoId));
    return config;
  },

  /**
   * Create or update triage agent configuration
   */
  async upsert(
    repoId: string,
    data: Partial<Omit<NewTriageAgentConfig, 'id' | 'repoId' | 'createdAt'>> & { updatedById: string }
  ): Promise<TriageAgentConfig> {
    const db = getDb();
    
    const existing = await this.findByRepoId(repoId);
    
    if (existing) {
      const [updated] = await db
        .update(triageAgentConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(triageAgentConfig.repoId, repoId))
        .returning();
      return updated;
    }
    
    const [created] = await db
      .insert(triageAgentConfig)
      .values({
        repoId,
        ...data,
      })
      .returning();
    return created;
  },

  /**
   * Enable/disable triage agent for a repository
   */
  async setEnabled(repoId: string, enabled: boolean, updatedById: string): Promise<TriageAgentConfig> {
    return this.upsert(repoId, { enabled, updatedById });
  },

  /**
   * Update the custom prompt for the triage agent
   */
  async setPrompt(repoId: string, prompt: string | null, updatedById: string): Promise<TriageAgentConfig> {
    return this.upsert(repoId, { prompt, updatedById });
  },

  /**
   * Delete triage agent configuration
   */
  async delete(repoId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(triageAgentConfig)
      .where(eq(triageAgentConfig.repoId, repoId))
      .returning();
    return result.length > 0;
  },

  /**
   * Check if triage agent is enabled for a repository
   */
  async isEnabled(repoId: string): Promise<boolean> {
    const config = await this.findByRepoId(repoId);
    return config?.enabled ?? false;
  },
};

export const triageAgentRunModel = {
  /**
   * Log a triage agent run
   */
  async create(data: NewTriageAgentRun): Promise<TriageAgentRun> {
    const db = getDb();
    const [run] = await db
      .insert(triageAgentRuns)
      .values(data)
      .returning();
    return run;
  },

  /**
   * Get runs for a specific issue
   */
  async findByIssueId(issueId: string): Promise<TriageAgentRun[]> {
    const db = getDb();
    return db
      .select()
      .from(triageAgentRuns)
      .where(eq(triageAgentRuns.issueId, issueId))
      .orderBy(desc(triageAgentRuns.createdAt));
  },

  /**
   * Get recent runs for a repository
   */
  async listByRepoId(
    repoId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<TriageAgentRun[]> {
    const { limit = 50, offset = 0 } = options;
    const db = getDb();
    return db
      .select()
      .from(triageAgentRuns)
      .where(eq(triageAgentRuns.repoId, repoId))
      .orderBy(desc(triageAgentRuns.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get the most recent run for an issue
   */
  async findLatestByIssueId(issueId: string): Promise<TriageAgentRun | undefined> {
    const db = getDb();
    const [run] = await db
      .select()
      .from(triageAgentRuns)
      .where(eq(triageAgentRuns.issueId, issueId))
      .orderBy(desc(triageAgentRuns.createdAt))
      .limit(1);
    return run;
  },
};
