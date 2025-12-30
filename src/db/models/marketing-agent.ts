import { eq } from 'drizzle-orm';
import { getDb } from '../index';
import {
  marketingAgentConfig,
  type MarketingAgentConfig,
  type NewMarketingAgentConfig,
} from '../schema';

export const marketingAgentConfigModel = {
  /**
   * Get marketing agent configuration for a repository
   */
  async findByRepoId(repoId: string): Promise<MarketingAgentConfig | undefined> {
    const db = getDb();
    const [config] = await db
      .select()
      .from(marketingAgentConfig)
      .where(eq(marketingAgentConfig.repoId, repoId));
    return config;
  },

  /**
   * Create or update marketing agent configuration
   */
  async upsert(
    repoId: string,
    data: Partial<Omit<NewMarketingAgentConfig, 'id' | 'repoId' | 'createdAt'>> & { updatedById: string }
  ): Promise<MarketingAgentConfig> {
    const db = getDb();
    
    const existing = await this.findByRepoId(repoId);
    
    if (existing) {
      const [updated] = await db
        .update(marketingAgentConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(marketingAgentConfig.repoId, repoId))
        .returning();
      return updated;
    }
    
    const [created] = await db
      .insert(marketingAgentConfig)
      .values({
        repoId,
        ...data,
      })
      .returning();
    return created;
  },

  /**
   * Enable/disable marketing agent for a repository
   */
  async setEnabled(repoId: string, enabled: boolean, updatedById: string): Promise<MarketingAgentConfig> {
    return this.upsert(repoId, { enabled, updatedById });
  },

  /**
   * Update the custom prompt for the marketing agent
   */
  async setPrompt(repoId: string, prompt: string | null, updatedById: string): Promise<MarketingAgentConfig> {
    return this.upsert(repoId, { prompt, updatedById });
  },

  /**
   * Delete marketing agent configuration
   */
  async delete(repoId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(marketingAgentConfig)
      .where(eq(marketingAgentConfig.repoId, repoId))
      .returning();
    return result.length > 0;
  },

  /**
   * Check if marketing agent is enabled for a repository
   */
  async isEnabled(repoId: string): Promise<boolean> {
    const config = await this.findByRepoId(repoId);
    return config?.enabled ?? false;
  },
};
