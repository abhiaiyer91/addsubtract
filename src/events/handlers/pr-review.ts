/**
 * PR Review Event Handler
 * 
 * Listens for PR creation and update events and triggers the AI-powered
 * PR review workflow when enabled for the repository.
 */

import { eventBus } from '../bus';
import type { PrCreatedEvent, PrUpdatedEvent } from '../types';
import { 
  prModel,
  repoModel,
} from '../../db/models';
import { runPRReviewWorkflow, type PRReviewInput } from '../../ai/index.js';
import { repoAiKeyModel } from '../../db/models/repo-ai-keys';

/**
 * Register PR review handlers
 */
export function registerPRReviewHandlers(): void {
  eventBus.on('pr.created', handlePRCreated);
  eventBus.on('pr.updated', handlePRUpdated);
  console.log('[EventBus] PR Review workflow handlers registered');
}

/**
 * Handle new PR creation - trigger review workflow
 */
async function handlePRCreated(event: PrCreatedEvent): Promise<void> {
  const { prId, prNumber, repoId, repoFullName } = event.payload;
  await runReviewWorkflow(prId, prNumber, repoId, repoFullName, 'created');
}

/**
 * Handle PR update - trigger review workflow if enabled
 */
async function handlePRUpdated(event: PrUpdatedEvent): Promise<void> {
  const { prId, prNumber, repoId, repoFullName } = event.payload;
  await runReviewWorkflow(prId, prNumber, repoId, repoFullName, 'updated');
}

/**
 * Run the PR review workflow
 */
async function runReviewWorkflow(
  prId: string,
  prNumber: number,
  repoId: string,
  repoFullName: string,
  trigger: 'created' | 'updated'
): Promise<void> {
  try {
    // Check if AI keys are available
    const aiAvailability = await repoAiKeyModel.checkAvailability(repoId);
    if (!aiAvailability.available) {
      console.log(`[PRReviewWorkflow] Skipping review for ${repoFullName}#${prNumber} - no AI keys available`);
      return;
    }

    // Get PR details
    const pr = await prModel.findById(prId);
    if (!pr) {
      console.error(`[PRReviewWorkflow] PR ${prId} not found`);
      return;
    }

    // Get repo details
    const repo = await repoModel.findById(repoId);
    if (!repo) {
      console.error(`[PRReviewWorkflow] Repository ${repoId} not found`);
      return;
    }

    // Build workflow input
    const workflowInput: PRReviewInput = {
      prId,
      repoId,
      repoPath: repo.diskPath,
      baseSha: pr.baseSha,
      headSha: pr.headSha,
      prTitle: pr.title,
      prBody: pr.body || undefined,
      authorId: pr.authorId,
    };

    console.log(`[PRReviewWorkflow] Running review for ${repoFullName}#${prNumber} (${trigger})`);

    // Run the workflow
    const result = await runPRReviewWorkflow(workflowInput);

    if (result.success) {
      console.log(`[PRReviewWorkflow] Review completed for ${repoFullName}#${prNumber}`);
      console.log(`  Score: ${result.score}/10, Approved: ${result.approved}`);
      console.log(`  Issues: ${result.issues.length}, Security concerns: ${result.securityConcerns.length}`);
      if (result.appliedLabels?.length) {
        console.log(`  Labels applied: ${result.appliedLabels.join(', ')}`);
      }
    } else {
      console.error(`[PRReviewWorkflow] Review failed for ${repoFullName}#${prNumber}: ${result.error}`);
    }
  } catch (error) {
    console.error(`[PRReviewWorkflow] Error reviewing PR ${prId}:`, error);
  }
}

/**
 * Trigger an async PR review (fire-and-forget)
 * This is useful for manually triggering reviews or from other parts of the system.
 */
export function triggerAsyncPRReview(prId: string): void {
  setImmediate(async () => {
    try {
      const pr = await prModel.findById(prId);
      if (!pr) {
        console.error(`[PRReviewWorkflow] PR ${prId} not found for async review`);
        return;
      }
      
      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        console.error(`[PRReviewWorkflow] Repo ${pr.repoId} not found for async review`);
        return;
      }
      
      // Get owner name from repo
      const ownerName = repo.diskPath.split('/').slice(-2)[0] || 'unknown';
      const repoFullName = `${ownerName}/${repo.name}`;
      
      await runReviewWorkflow(prId, pr.number, pr.repoId, repoFullName, 'created');
    } catch (error) {
      console.error(`[PRReviewWorkflow] Async review failed for ${prId}:`, error);
    }
  });
}
