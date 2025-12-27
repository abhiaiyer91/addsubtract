/**
 * Merge Queue Event Handler
 * 
 * Processes the merge queue, handling:
 * - New PRs added to queue
 * - Queue processing triggers
 * - CI completion events
 * - Automatic merging when ready
 */

import { eventBus } from '../bus';
import type { CiRunCompletedEvent, PrMergedEvent } from '../types';
import {
  mergeQueueConfigModel,
  mergeQueueEntryModel,
  mergeQueueBatchModel,
  mergeQueueHistoryModel,
} from '../../db/models/merge-queue';
import { prModel, repoModel } from '../../db/models';
import { createMergeQueueManager, type PRAnalysis } from '../../core/merge-queue';
import { mergePullRequest } from '../../server/storage/merge';
import * as path from 'path';

/**
 * Merge Queue Handler class
 */
class MergeQueueHandler {
  private processing = new Map<string, boolean>(); // repoId:branch -> processing

  /**
   * Process the merge queue for a repository/branch
   */
  async processQueue(repoId: string, targetBranch: string): Promise<void> {
    const queueKey = `${repoId}:${targetBranch}`;

    // Prevent concurrent processing
    if (this.processing.get(queueKey)) {
      console.log(`[MergeQueue] Already processing ${queueKey}`);
      return;
    }

    this.processing.set(queueKey, true);

    try {
      // Get config
      const config = await mergeQueueConfigModel.get(repoId, targetBranch);
      if (!config?.enabled) {
        console.log(`[MergeQueue] Queue disabled for ${queueKey}`);
        return;
      }

      // Get repo
      const repo = await repoModel.findById(repoId);
      if (!repo) {
        console.error(`[MergeQueue] Repository not found: ${repoId}`);
        return;
      }

      // Check for active batch
      const activeBatch = await mergeQueueBatchModel.getActiveBatch(repoId, targetBranch);
      if (activeBatch) {
        console.log(`[MergeQueue] Active batch exists for ${queueKey}, waiting...`);
        return;
      }

      // Get pending entries
      const entries = await mergeQueueEntryModel.getNextToProcess(
        repoId,
        targetBranch,
        config.maxBatchSize
      );

      if (entries.length === 0) {
        console.log(`[MergeQueue] No entries to process for ${queueKey}`);
        return;
      }

      console.log(`[MergeQueue] Processing ${entries.length} entries for ${queueKey}`);

      // Process based on strategy
      switch (config.strategy) {
        case 'sequential':
          await this.processSequential(repo.diskPath, entries, config);
          break;
        case 'optimistic':
          await this.processOptimistic(repo.diskPath, entries, config);
          break;
        case 'adaptive':
          await this.processAdaptive(repo.diskPath, entries, config);
          break;
      }
    } catch (error) {
      console.error(`[MergeQueue] Error processing ${queueKey}:`, error);
    } finally {
      this.processing.set(queueKey, false);
    }
  }

  /**
   * Sequential processing - merge one PR at a time
   */
  private async processSequential(
    diskPath: string,
    entries: any[],
    config: any
  ): Promise<void> {
    for (const entry of entries) {
      await mergeQueueEntryModel.updateState(entry.id, 'preparing');

      try {
        const pr = await prModel.findById(entry.prId);
        if (!pr) continue;

        // Check if we need to rebase
        const manager = createMergeQueueManager(diskPath, entry.targetBranch);
        
        if (config.autoRebase && !manager.canFastForward(entry.headSha, entry.baseSha)) {
          const rebaseResult = await manager.rebasePR(entry.headSha, entry.baseSha);
          
          if (!rebaseResult.success) {
            await mergeQueueEntryModel.updateState(entry.id, 'failed', {
              errorMessage: `Rebase failed: ${rebaseResult.error}`,
            });
            continue;
          }

          // Update head SHA after rebase
          await prModel.updateHead(entry.prId, rebaseResult.newHeadSha!);
        }

        await mergeQueueEntryModel.updateState(entry.id, 'testing');

        // In a real implementation, we'd wait for CI here
        // For now, proceed to merge

        await mergeQueueEntryModel.updateState(entry.id, 'merging');

        // Perform merge
        const mergeResult = await mergePullRequest(
          diskPath,
          entry.targetBranch,
          pr.sourceBranch,
          'merge',
          `Merge PR #${pr.number}: ${pr.title}`,
          pr.authorId
        );

        if (!mergeResult.success) {
          await mergeQueueEntryModel.updateState(entry.id, 'failed', {
            errorMessage: mergeResult.message || 'Merge failed',
          });
          continue;
        }

        // Mark as merged
        await mergeQueueEntryModel.updateState(entry.id, 'completed');
        await prModel.merge(entry.prId, 'system', mergeResult.mergeSha!);

        // Emit merge event
        eventBus.emit({
          id: crypto.randomUUID(),
          type: 'pr.merged',
          timestamp: new Date(),
          actorId: 'system',
          payload: {
            prId: entry.prId,
            prNumber: pr.number,
            prTitle: pr.title,
            repoId: entry.repoId,
            repoFullName: '', // Would need to look up
            authorId: pr.authorId,
            mergeStrategy: 'merge',
          },
        });

        console.log(`[MergeQueue] Merged PR #${pr.number}`);
      } catch (error: any) {
        await mergeQueueEntryModel.updateState(entry.id, 'failed', {
          errorMessage: error.message,
        });
      }
    }
  }

  /**
   * Optimistic processing - batch merge with rollback on failure
   */
  private async processOptimistic(
    diskPath: string,
    entries: any[],
    config: any
  ): Promise<void> {
    // Create batch
    const prOrder = entries.map(e => e.prId);
    const baseSha = entries[0].baseSha;

    const batch = await mergeQueueBatchModel.create({
      repoId: entries[0].repoId,
      targetBranch: entries[0].targetBranch,
      state: 'preparing',
      baseSha,
      prOrder: JSON.stringify(prOrder),
    });

    // Assign entries to batch
    for (const entry of entries) {
      await mergeQueueEntryModel.assignToBatch(entry.id, batch.id);
    }

    const manager = createMergeQueueManager(diskPath, entries[0].targetBranch);

    // Process batch
    const result = await manager.processBatch(
      entries.map(e => ({
        prId: e.prId,
        headSha: e.headSha,
        baseSha: e.baseSha,
      }))
    );

    if (result.success) {
      // Update batch
      await mergeQueueBatchModel.updateState(batch.id, 'ready', {
        mergeSha: result.mergeSha,
      });

      // Finalize merge
      const finalized = await manager.finalizeMerge(result.mergeSha!);

      if (finalized) {
        await mergeQueueBatchModel.updateState(batch.id, 'completed');

        // Mark all entries as merged
        for (const prId of result.mergedPrs) {
          const entry = entries.find(e => e.prId === prId);
          if (entry) {
            await mergeQueueEntryModel.updateState(entry.id, 'completed');
            const pr = await prModel.findById(prId);
            if (pr) {
              await prModel.merge(prId, 'system', result.mergeSha!);
            }
          }
        }

        console.log(`[MergeQueue] Batch merged: ${result.mergedPrs.length} PRs`);
      } else {
        await mergeQueueBatchModel.updateState(batch.id, 'failed', {
          errorMessage: 'Failed to finalize merge',
        });
      }
    } else {
      // Mark failed PRs
      await mergeQueueBatchModel.updateState(batch.id, 'failed', {
        errorMessage: result.errorMessage,
      });

      for (const prId of result.failedPrs) {
        const entry = entries.find(e => e.prId === prId);
        if (entry) {
          await mergeQueueEntryModel.updateState(entry.id, 'failed', {
            errorMessage: result.errorMessage,
          });
        }
      }

      console.log(`[MergeQueue] Batch failed: ${result.failedPrs.length} PRs failed`);
    }
  }

  /**
   * Adaptive processing - analyze conflicts and determine best order
   */
  private async processAdaptive(
    diskPath: string,
    entries: any[],
    config: any
  ): Promise<void> {
    const manager = createMergeQueueManager(diskPath, entries[0].targetBranch);

    // Analyze all PRs
    const analyses: PRAnalysis[] = [];
    for (const entry of entries) {
      const analysis = await manager.analyzePR(entry.headSha, entry.baseSha);
      analysis.prId = entry.prId;
      analyses.push(analysis);

      // Update touched files
      await mergeQueueEntryModel.updateTouchedFiles(
        entry.id,
        analysis.files.map(f => f.path)
      );
    }

    // Calculate conflict scores
    for (let i = 0; i < analyses.length; i++) {
      let totalScore = 0;
      for (let j = 0; j < analyses.length; j++) {
        if (i === j) continue;
        const prediction = manager.predictConflicts(analyses[i], analyses[j]);
        totalScore += prediction.probability * 100;
      }
      const avgScore = Math.round(totalScore / (analyses.length - 1));
      const entry = entries.find(e => e.prId === analyses[i].prId);
      if (entry) {
        await mergeQueueEntryModel.updateConflictScore(entry.id, avgScore);
      }
    }

    // Determine optimal order
    const optimalOrder = await manager.determineOptimalOrder(analyses);

    // Reorder entries
    const reorderedEntries = optimalOrder.map(a => 
      entries.find(e => e.prId === a.prId)!
    );

    // Process in optimal order using optimistic batching
    await this.processOptimistic(diskPath, reorderedEntries, config);
  }

  /**
   * Handle CI completion to continue merge queue processing
   */
  async handleCIComplete(event: CiRunCompletedEvent): Promise<void> {
    const { repoId, prId, conclusion } = event.payload;

    if (!prId) return;

    // Find merge queue entry
    const entry = await mergeQueueEntryModel.findByPrId(prId);
    if (!entry || entry.state !== 'testing') return;

    if (conclusion === 'success') {
      // CI passed, mark as ready
      await mergeQueueEntryModel.updateState(entry.id, 'ready');

      // Trigger queue processing
      await this.processQueue(entry.repoId, entry.targetBranch);
    } else {
      // CI failed
      await mergeQueueEntryModel.updateState(entry.id, 'failed', {
        errorMessage: `CI failed with conclusion: ${conclusion}`,
      });
    }
  }

  /**
   * Handle PR merged event to update queue
   */
  async handlePRMerged(event: PrMergedEvent): Promise<void> {
    const { prId, repoId } = event.payload;

    // Check if this PR was in the queue
    const entry = await mergeQueueEntryModel.findByPrId(prId);
    if (entry && entry.state !== 'completed') {
      await mergeQueueEntryModel.updateState(entry.id, 'completed');
    }

    // Trigger queue processing for other PRs that might need rebasing
    const repo = await repoModel.findById(repoId);
    if (repo) {
      // Process queue for the default branch
      await this.processQueue(repoId, repo.defaultBranch);
    }
  }
}

// Singleton instance
const handler = new MergeQueueHandler();

/**
 * Register merge queue event handlers
 */
export function registerMergeQueueHandlers(): void {
  // Handle queue processing triggers
  eventBus.on('merge_queue.process' as any, async (event: any) => {
    const { repoId, targetBranch } = event.payload;
    await handler.processQueue(repoId, targetBranch);
  });

  // Handle CI completion
  eventBus.on('ci.completed', async (event: CiRunCompletedEvent) => {
    await handler.handleCIComplete(event);
  });

  // Handle PR merged
  eventBus.on('pr.merged', async (event: PrMergedEvent) => {
    await handler.handlePRMerged(event);
  });

  // Handle new PR added to queue
  eventBus.on('merge_queue.added' as any, async (event: any) => {
    const { repoId } = event.payload;
    
    // Get the PR to find target branch
    const entry = await mergeQueueEntryModel.findByPrId(event.payload.prId);
    if (entry) {
      // Small delay to allow batching
      setTimeout(() => {
        handler.processQueue(repoId, entry.targetBranch);
      }, 5000);
    }
  });

  console.log('[MergeQueue] Event handlers registered');
}

// Export for direct use
export { handler as mergeQueueHandler };
