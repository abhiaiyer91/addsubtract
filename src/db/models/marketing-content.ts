/**
 * Marketing Content Model
 * 
 * Stores AI-generated social media content from PRs and releases
 */

import { eq, desc, and } from 'drizzle-orm';
import { db } from '../index';
import {
  marketingContent,
  type MarketingContent,
  type NewMarketingContent,
  type MarketingContentStatus,
  type MarketingContentSource,
} from '../schema';

export const marketingContentModel = {
  /**
   * Create new marketing content
   */
  async create(data: {
    repoId: string;
    sourceType: MarketingContentSource;
    sourceId: string;
    sourceRef: string;
    tweet: string;
    thread?: string[] | null;
    status?: MarketingContentStatus;
  }): Promise<MarketingContent> {
    const [content] = await db
      .insert(marketingContent)
      .values({
        repoId: data.repoId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        sourceRef: data.sourceRef,
        tweet: data.tweet,
        thread: data.thread || null,
        status: data.status || 'pending',
      })
      .returning();

    return content;
  },

  /**
   * Find by ID
   */
  async findById(id: string): Promise<MarketingContent | null> {
    const [content] = await db
      .select()
      .from(marketingContent)
      .where(eq(marketingContent.id, id))
      .limit(1);

    return content || null;
  },

  /**
   * Find by source (PR or release)
   */
  async findBySource(
    sourceType: MarketingContentSource,
    sourceId: string
  ): Promise<MarketingContent | null> {
    const [content] = await db
      .select()
      .from(marketingContent)
      .where(
        and(
          eq(marketingContent.sourceType, sourceType),
          eq(marketingContent.sourceId, sourceId)
        )
      )
      .limit(1);

    return content || null;
  },

  /**
   * List content for a repository
   */
  async listByRepo(
    repoId: string,
    options?: {
      status?: MarketingContentStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<MarketingContent[]> {
    const conditions = [eq(marketingContent.repoId, repoId)];
    
    if (options?.status) {
      conditions.push(eq(marketingContent.status, options.status));
    }

    return db
      .select()
      .from(marketingContent)
      .where(and(...conditions))
      .orderBy(desc(marketingContent.createdAt))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);
  },

  /**
   * Update content status
   */
  async updateStatus(
    id: string,
    status: MarketingContentStatus,
    postedUrl?: string
  ): Promise<MarketingContent | null> {
    const updates: Partial<MarketingContent> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'posted') {
      updates.postedAt = new Date();
      if (postedUrl) {
        updates.postedUrl = postedUrl;
      }
    }

    const [updated] = await db
      .update(marketingContent)
      .set(updates)
      .where(eq(marketingContent.id, id))
      .returning();

    return updated || null;
  },

  /**
   * Update tweet content
   */
  async updateContent(
    id: string,
    data: { tweet?: string; thread?: string[] | null }
  ): Promise<MarketingContent | null> {
    const [updated] = await db
      .update(marketingContent)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(marketingContent.id, id))
      .returning();

    return updated || null;
  },

  /**
   * Delete content
   */
  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(marketingContent)
      .where(eq(marketingContent.id, id));

    return result.rowCount !== null && result.rowCount > 0;
  },

  /**
   * Get pending content count for a repo
   */
  async getPendingCount(repoId: string): Promise<number> {
    const result = await db
      .select()
      .from(marketingContent)
      .where(
        and(
          eq(marketingContent.repoId, repoId),
          eq(marketingContent.status, 'pending')
        )
      );

    return result.length;
  },
};
