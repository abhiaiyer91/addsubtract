/**
 * Merge Queue Database Model
 * 
 * Provides CRUD operations and queries for the merge queue system
 */

import { eq, and, desc, asc, sql, inArray, gt } from 'drizzle-orm';
import { getDb } from '../index';
import {
  mergeQueueConfig,
  mergeQueueEntries,
  mergeQueueBatches,
  mergeQueueHistory,
  pullRequests,
  type MergeQueueConfig,
  type NewMergeQueueConfig,
  type MergeQueueEntry,
  type NewMergeQueueEntry,
  type MergeQueueBatch,
  type NewMergeQueueBatch,
  type MergeQueueHistoryEntry,
  type NewMergeQueueHistoryEntry,
  type MergeQueueState,
} from '../schema';

// ============ TYPES ============

export interface MergeQueueEntryWithPR extends MergeQueueEntry {
  pr: {
    id: string;
    number: number;
    title: string;
    sourceBranch: string;
    authorId: string;
  };
}

export interface QueuePosition {
  position: number;
  totalInQueue: number;
  estimatedWaitMinutes: number;
}

// ============ CONFIG MODEL ============

export const mergeQueueConfigModel = {
  /**
   * Get merge queue config for a repository and branch
   */
  async get(
    repoId: string,
    targetBranch: string
  ): Promise<MergeQueueConfig | undefined> {
    const db = getDb();
    const [config] = await db
      .select()
      .from(mergeQueueConfig)
      .where(
        and(
          eq(mergeQueueConfig.repoId, repoId),
          eq(mergeQueueConfig.targetBranch, targetBranch)
        )
      );
    return config;
  },

  /**
   * Create or update merge queue config
   */
  async upsert(
    data: Omit<NewMergeQueueConfig, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<MergeQueueConfig> {
    const db = getDb();
    const [config] = await db
      .insert(mergeQueueConfig)
      .values(data)
      .onConflictDoUpdate({
        target: [mergeQueueConfig.repoId, mergeQueueConfig.targetBranch],
        set: {
          enabled: data.enabled,
          strategy: data.strategy,
          maxBatchSize: data.maxBatchSize,
          minWaitSeconds: data.minWaitSeconds,
          requiredChecks: data.requiredChecks,
          requireAllChecks: data.requireAllChecks,
          autoRebase: data.autoRebase,
          deleteBranchAfterMerge: data.deleteBranchAfterMerge,
          updatedAt: new Date(),
        },
      })
      .returning();
    return config;
  },

  /**
   * Check if merge queue is enabled for a branch
   */
  async isEnabled(repoId: string, targetBranch: string): Promise<boolean> {
    const config = await this.get(repoId, targetBranch);
    return config?.enabled ?? false;
  },

  /**
   * List all configs for a repository
   */
  async listByRepo(repoId: string): Promise<MergeQueueConfig[]> {
    const db = getDb();
    return db
      .select()
      .from(mergeQueueConfig)
      .where(eq(mergeQueueConfig.repoId, repoId));
  },

  /**
   * Delete a config
   */
  async delete(repoId: string, targetBranch: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(mergeQueueConfig)
      .where(
        and(
          eq(mergeQueueConfig.repoId, repoId),
          eq(mergeQueueConfig.targetBranch, targetBranch)
        )
      )
      .returning();
    return result.length > 0;
  },
};

// ============ ENTRIES MODEL ============

export const mergeQueueEntryModel = {
  /**
   * Add a PR to the merge queue
   */
  async add(
    data: Omit<NewMergeQueueEntry, 'id' | 'position' | 'createdAt' | 'updatedAt'>
  ): Promise<MergeQueueEntry> {
    const db = getDb();

    // Get the next position in the queue
    const [lastEntry] = await db
      .select({ position: mergeQueueEntries.position })
      .from(mergeQueueEntries)
      .where(
        and(
          eq(mergeQueueEntries.repoId, data.repoId),
          eq(mergeQueueEntries.targetBranch, data.targetBranch),
          inArray(mergeQueueEntries.state, ['pending', 'preparing', 'testing', 'ready'])
        )
      )
      .orderBy(desc(mergeQueueEntries.position))
      .limit(1);

    const position = (lastEntry?.position ?? -1) + 1;

    const [entry] = await db
      .insert(mergeQueueEntries)
      .values({ ...data, position })
      .returning();

    // Log history
    await mergeQueueHistoryModel.log({
      prId: data.prId,
      repoId: data.repoId,
      action: 'added',
      actorId: data.addedById,
      newState: 'pending',
      metadata: JSON.stringify({ position }),
    });

    return entry;
  },

  /**
   * Find entry by ID
   */
  async findById(id: string): Promise<MergeQueueEntry | undefined> {
    const db = getDb();
    const [entry] = await db
      .select()
      .from(mergeQueueEntries)
      .where(eq(mergeQueueEntries.id, id));
    return entry;
  },

  /**
   * Find entry by PR ID
   */
  async findByPrId(prId: string): Promise<MergeQueueEntry | undefined> {
    const db = getDb();
    const [entry] = await db
      .select()
      .from(mergeQueueEntries)
      .where(
        and(
          eq(mergeQueueEntries.prId, prId),
          inArray(mergeQueueEntries.state, ['pending', 'preparing', 'testing', 'ready', 'merging'])
        )
      );
    return entry;
  },

  /**
   * Check if a PR is in the queue
   */
  async isInQueue(prId: string): Promise<boolean> {
    const entry = await this.findByPrId(prId);
    return entry !== undefined;
  },

  /**
   * Get queue position for a PR
   */
  async getPosition(prId: string): Promise<QueuePosition | null> {
    const db = getDb();
    const entry = await this.findByPrId(prId);
    if (!entry) return null;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mergeQueueEntries)
      .where(
        and(
          eq(mergeQueueEntries.repoId, entry.repoId),
          eq(mergeQueueEntries.targetBranch, entry.targetBranch),
          inArray(mergeQueueEntries.state, ['pending', 'preparing', 'testing', 'ready'])
        )
      );

    const totalInQueue = Number(countResult?.count ?? 0);
    
    // Rough estimate: 5 minutes per PR
    const estimatedWaitMinutes = entry.position * 5;

    return {
      position: entry.position,
      totalInQueue,
      estimatedWaitMinutes,
    };
  },

  /**
   * Update entry state
   */
  async updateState(
    id: string,
    state: MergeQueueState,
    metadata?: { errorMessage?: string; speculativeMergeSha?: string }
  ): Promise<MergeQueueEntry | undefined> {
    const db = getDb();
    const entry = await this.findById(id);
    if (!entry) return undefined;

    const updateData: Partial<MergeQueueEntry> = {
      state,
      updatedAt: new Date(),
    };

    if (state === 'preparing' || state === 'testing' || state === 'merging') {
      updateData.startedAt = new Date();
    }

    if (state === 'completed' || state === 'failed' || state === 'cancelled') {
      updateData.completedAt = new Date();
    }

    if (metadata?.errorMessage) {
      updateData.errorMessage = metadata.errorMessage;
    }

    if (metadata?.speculativeMergeSha) {
      updateData.speculativeMergeSha = metadata.speculativeMergeSha;
    }

    const [updated] = await db
      .update(mergeQueueEntries)
      .set(updateData)
      .where(eq(mergeQueueEntries.id, id))
      .returning();

    // Log history
    await mergeQueueHistoryModel.log({
      prId: entry.prId,
      repoId: entry.repoId,
      action: state === 'completed' ? 'merged' : state === 'failed' ? 'failed' : 'state_changed',
      actorId: entry.addedById, // Should be system for automated changes
      previousState: entry.state,
      newState: state,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });

    return updated;
  },

  /**
   * Remove a PR from the queue
   */
  async remove(prId: string, actorId: string): Promise<boolean> {
    // db available via getDb() if needed for transactions
    const entry = await this.findByPrId(prId);
    if (!entry) return false;

    // Update state to cancelled
    await this.updateState(entry.id, 'cancelled');

    // Log history
    await mergeQueueHistoryModel.log({
      prId,
      repoId: entry.repoId,
      action: 'removed',
      actorId,
      previousState: entry.state,
      newState: 'cancelled',
    });

    // Reorder remaining entries
    await this.reorderAfterRemoval(entry.repoId, entry.targetBranch, entry.position);

    return true;
  },

  /**
   * Reorder entries after one is removed (internal helper)
   */
  async reorderAfterRemoval(
    repoId: string,
    targetBranch: string,
    removedPosition: number
  ): Promise<void> {
    const db = getDb();
    await db
      .update(mergeQueueEntries)
      .set({
        position: sql`${mergeQueueEntries.position} - 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mergeQueueEntries.repoId, repoId),
          eq(mergeQueueEntries.targetBranch, targetBranch),
          gt(mergeQueueEntries.position, removedPosition),
          inArray(mergeQueueEntries.state, ['pending', 'preparing', 'testing', 'ready'])
        )
      );
  },

  /**
   * List entries in queue for a branch
   */
  async listByBranch(
    repoId: string,
    targetBranch: string,
    options: { includeCompleted?: boolean; limit?: number } = {}
  ): Promise<MergeQueueEntryWithPR[]> {
    const db = getDb();

    const states: MergeQueueState[] = options.includeCompleted
      ? ['pending', 'preparing', 'testing', 'ready', 'merging', 'completed', 'failed', 'cancelled']
      : ['pending', 'preparing', 'testing', 'ready', 'merging'];

    let query = db
      .select({
        entry: mergeQueueEntries,
        pr: {
          id: pullRequests.id,
          number: pullRequests.number,
          title: pullRequests.title,
          sourceBranch: pullRequests.sourceBranch,
          authorId: pullRequests.authorId,
        },
      })
      .from(mergeQueueEntries)
      .innerJoin(pullRequests, eq(mergeQueueEntries.prId, pullRequests.id))
      .where(
        and(
          eq(mergeQueueEntries.repoId, repoId),
          eq(mergeQueueEntries.targetBranch, targetBranch),
          inArray(mergeQueueEntries.state, states)
        )
      )
      .orderBy(asc(mergeQueueEntries.position));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    const results = await query;
    return results.map(r => ({ ...r.entry, pr: r.pr }));
  },

  /**
   * Get next entries to process
   */
  async getNextToProcess(
    repoId: string,
    targetBranch: string,
    limit: number = 5
  ): Promise<MergeQueueEntry[]> {
    const db = getDb();
    return db
      .select()
      .from(mergeQueueEntries)
      .where(
        and(
          eq(mergeQueueEntries.repoId, repoId),
          eq(mergeQueueEntries.targetBranch, targetBranch),
          eq(mergeQueueEntries.state, 'pending')
        )
      )
      .orderBy(
        desc(mergeQueueEntries.priority),
        asc(mergeQueueEntries.position)
      )
      .limit(limit);
  },

  /**
   * Update touched files for conflict analysis
   */
  async updateTouchedFiles(id: string, files: string[]): Promise<void> {
    const db = getDb();
    await db
      .update(mergeQueueEntries)
      .set({
        touchedFiles: JSON.stringify(files),
        updatedAt: new Date(),
      })
      .where(eq(mergeQueueEntries.id, id));
  },

  /**
   * Update conflict score
   */
  async updateConflictScore(id: string, score: number): Promise<void> {
    const db = getDb();
    await db
      .update(mergeQueueEntries)
      .set({
        conflictScore: score,
        updatedAt: new Date(),
      })
      .where(eq(mergeQueueEntries.id, id));
  },

  /**
   * Assign entry to a batch
   */
  async assignToBatch(id: string, batchId: string): Promise<void> {
    const db = getDb();
    await db
      .update(mergeQueueEntries)
      .set({
        batchId,
        state: 'preparing',
        updatedAt: new Date(),
      })
      .where(eq(mergeQueueEntries.id, id));
  },

  /**
   * Increment retry count
   */
  async incrementRetry(id: string): Promise<number> {
    const db = getDb();
    const [result] = await db
      .update(mergeQueueEntries)
      .set({
        retryCount: sql`${mergeQueueEntries.retryCount} + 1`,
        state: 'pending',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(mergeQueueEntries.id, id))
      .returning({ retryCount: mergeQueueEntries.retryCount });
    return result?.retryCount ?? 0;
  },
};

// ============ BATCHES MODEL ============

export const mergeQueueBatchModel = {
  /**
   * Create a new batch
   */
  async create(
    data: Omit<NewMergeQueueBatch, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<MergeQueueBatch> {
    const db = getDb();
    const [batch] = await db
      .insert(mergeQueueBatches)
      .values(data)
      .returning();
    return batch;
  },

  /**
   * Find batch by ID
   */
  async findById(id: string): Promise<MergeQueueBatch | undefined> {
    const db = getDb();
    const [batch] = await db
      .select()
      .from(mergeQueueBatches)
      .where(eq(mergeQueueBatches.id, id));
    return batch;
  },

  /**
   * Update batch state
   */
  async updateState(
    id: string,
    state: MergeQueueState,
    metadata?: { mergeSha?: string; errorMessage?: string; commitGraph?: string }
  ): Promise<MergeQueueBatch | undefined> {
    const db = getDb();

    const updateData: Partial<MergeQueueBatch> = {
      state,
      updatedAt: new Date(),
    };

    if (state === 'completed' || state === 'failed') {
      updateData.completedAt = new Date();
    }

    if (metadata?.mergeSha) {
      updateData.mergeSha = metadata.mergeSha;
    }

    if (metadata?.errorMessage) {
      updateData.errorMessage = metadata.errorMessage;
    }

    if (metadata?.commitGraph) {
      updateData.commitGraph = metadata.commitGraph;
    }

    const [batch] = await db
      .update(mergeQueueBatches)
      .set(updateData)
      .where(eq(mergeQueueBatches.id, id))
      .returning();

    return batch;
  },

  /**
   * Get active batch for a branch
   */
  async getActiveBatch(
    repoId: string,
    targetBranch: string
  ): Promise<MergeQueueBatch | undefined> {
    const db = getDb();
    const [batch] = await db
      .select()
      .from(mergeQueueBatches)
      .where(
        and(
          eq(mergeQueueBatches.repoId, repoId),
          eq(mergeQueueBatches.targetBranch, targetBranch),
          inArray(mergeQueueBatches.state, ['preparing', 'testing', 'ready', 'merging'])
        )
      )
      .orderBy(desc(mergeQueueBatches.createdAt))
      .limit(1);
    return batch;
  },

  /**
   * List recent batches
   */
  async listRecent(
    repoId: string,
    targetBranch: string,
    limit: number = 10
  ): Promise<MergeQueueBatch[]> {
    const db = getDb();
    return db
      .select()
      .from(mergeQueueBatches)
      .where(
        and(
          eq(mergeQueueBatches.repoId, repoId),
          eq(mergeQueueBatches.targetBranch, targetBranch)
        )
      )
      .orderBy(desc(mergeQueueBatches.createdAt))
      .limit(limit);
  },
};

// ============ HISTORY MODEL ============

export const mergeQueueHistoryModel = {
  /**
   * Log a history entry
   */
  async log(
    data: Omit<NewMergeQueueHistoryEntry, 'id' | 'createdAt'>
  ): Promise<MergeQueueHistoryEntry> {
    const db = getDb();
    const [entry] = await db
      .insert(mergeQueueHistory)
      .values(data)
      .returning();
    return entry;
  },

  /**
   * Get history for a PR
   */
  async getByPr(prId: string): Promise<MergeQueueHistoryEntry[]> {
    const db = getDb();
    return db
      .select()
      .from(mergeQueueHistory)
      .where(eq(mergeQueueHistory.prId, prId))
      .orderBy(desc(mergeQueueHistory.createdAt));
  },

  /**
   * Get recent history for a repository
   */
  async getRecentByRepo(
    repoId: string,
    limit: number = 50
  ): Promise<MergeQueueHistoryEntry[]> {
    const db = getDb();
    return db
      .select()
      .from(mergeQueueHistory)
      .where(eq(mergeQueueHistory.repoId, repoId))
      .orderBy(desc(mergeQueueHistory.createdAt))
      .limit(limit);
  },
};

// ============ AGGREGATE QUERIES ============

export const mergeQueueStats = {
  /**
   * Get queue statistics for a branch
   */
  async getStats(repoId: string, targetBranch: string): Promise<{
    pending: number;
    processing: number;
    completedToday: number;
    failedToday: number;
    avgMergeTimeMinutes: number;
  }> {
    const db = getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mergeQueueEntries)
      .where(
        and(
          eq(mergeQueueEntries.repoId, repoId),
          eq(mergeQueueEntries.targetBranch, targetBranch),
          eq(mergeQueueEntries.state, 'pending')
        )
      );

    const [processingResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mergeQueueEntries)
      .where(
        and(
          eq(mergeQueueEntries.repoId, repoId),
          eq(mergeQueueEntries.targetBranch, targetBranch),
          inArray(mergeQueueEntries.state, ['preparing', 'testing', 'ready', 'merging'])
        )
      );

    const [completedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mergeQueueEntries)
      .where(
        and(
          eq(mergeQueueEntries.repoId, repoId),
          eq(mergeQueueEntries.targetBranch, targetBranch),
          eq(mergeQueueEntries.state, 'completed'),
          gt(mergeQueueEntries.completedAt, today)
        )
      );

    const [failedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mergeQueueEntries)
      .where(
        and(
          eq(mergeQueueEntries.repoId, repoId),
          eq(mergeQueueEntries.targetBranch, targetBranch),
          eq(mergeQueueEntries.state, 'failed'),
          gt(mergeQueueEntries.completedAt, today)
        )
      );

    // Calculate average merge time
    const [avgResult] = await db
      .select({
        avg: sql<number>`AVG(EXTRACT(EPOCH FROM (${mergeQueueEntries.completedAt} - ${mergeQueueEntries.createdAt})) / 60)`,
      })
      .from(mergeQueueEntries)
      .where(
        and(
          eq(mergeQueueEntries.repoId, repoId),
          eq(mergeQueueEntries.targetBranch, targetBranch),
          eq(mergeQueueEntries.state, 'completed'),
          gt(mergeQueueEntries.completedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
        )
      );

    return {
      pending: Number(pendingResult?.count ?? 0),
      processing: Number(processingResult?.count ?? 0),
      completedToday: Number(completedResult?.count ?? 0),
      failedToday: Number(failedResult?.count ?? 0),
      avgMergeTimeMinutes: Math.round(Number(avgResult?.avg ?? 0)),
    };
  },
};
