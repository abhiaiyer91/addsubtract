/**
 * Marketing Content Event Handler
 * 
 * Listens for PR merges and release publications to automatically
 * generate social media content (tweets, threads).
 */

import { eventBus } from '../bus';
import type { PrMergedEvent, ReleasePublishedEvent } from '../types';
import { prModel, repoModel, releaseModel } from '../../db/models';
import { runMarketingContentWorkflow, type MarketingContentInput } from '../../ai/workflows/marketing-content.workflow.js';
import { repoAiKeyModel } from '../../db/models/repo-ai-keys';

/**
 * Register marketing content handlers
 */
export function registerMarketingHandlers(): void {
  eventBus.on('pr.merged', handlePRMerged);
  eventBus.on('release.published', handleReleasePublished);
  console.log('[EventBus] Marketing content workflow handlers registered');
}

/**
 * Handle PR merged - generate tweet for the change
 */
async function handlePRMerged(event: PrMergedEvent): Promise<void> {
  const { prId, prNumber, prTitle, repoId, repoFullName } = event.payload;
  
  try {
    // Check if AI keys are available for this repo
    const aiAvailability = await repoAiKeyModel.checkAvailability(repoId);
    if (!aiAvailability.available) {
      console.log(`[MarketingWorkflow] Skipping for ${repoFullName}#${prNumber} - no AI keys available`);
      return;
    }

    // Get PR details for the body
    const pr = await prModel.findById(prId);
    if (!pr) {
      console.error(`[MarketingWorkflow] PR ${prId} not found`);
      return;
    }

    const input: MarketingContentInput = {
      type: 'pr_merged',
      repoId,
      repoFullName,
      prId,
      prNumber,
      prTitle,
      prBody: pr.body || undefined,
      authorId: pr.authorId,
    };

    console.log(`[MarketingWorkflow] Generating content for merged PR: ${repoFullName}#${prNumber}`);
    
    const result = await runMarketingContentWorkflow(input);

    if (result.success) {
      console.log(`[MarketingWorkflow] Content generated for ${repoFullName}#${prNumber}`);
      console.log(`  Tweet: ${result.tweet.substring(0, 50)}...`);
      if (result.thread?.length) {
        console.log(`  Thread: ${result.thread.length} tweets`);
      }
      if (result.contentId) {
        console.log(`  Content ID: ${result.contentId}`);
      }
    } else {
      console.error(`[MarketingWorkflow] Failed for ${repoFullName}#${prNumber}: ${result.error}`);
    }
  } catch (error) {
    console.error(`[MarketingWorkflow] Error processing PR ${prId}:`, error);
  }
}

/**
 * Handle release published - generate announcement content
 */
async function handleReleasePublished(event: ReleasePublishedEvent): Promise<void> {
  const { releaseId, releaseTag, releaseName, releaseBody, repoId, repoFullName, isPrerelease } = event.payload;

  // Skip prereleases for marketing
  if (isPrerelease) {
    console.log(`[MarketingWorkflow] Skipping prerelease ${releaseTag} for ${repoFullName}`);
    return;
  }

  try {
    // Check if AI keys are available
    const aiAvailability = await repoAiKeyModel.checkAvailability(repoId);
    if (!aiAvailability.available) {
      console.log(`[MarketingWorkflow] Skipping release ${releaseTag} - no AI keys available`);
      return;
    }

    const input: MarketingContentInput = {
      type: 'release_published',
      repoId,
      repoFullName,
      releaseId,
      releaseTag,
      releaseName: releaseName || releaseTag,
      releaseBody: releaseBody || undefined,
    };

    console.log(`[MarketingWorkflow] Generating content for release: ${repoFullName} ${releaseTag}`);

    const result = await runMarketingContentWorkflow(input);

    if (result.success) {
      console.log(`[MarketingWorkflow] Content generated for ${repoFullName} ${releaseTag}`);
      console.log(`  Tweet: ${result.tweet.substring(0, 50)}...`);
      if (result.thread?.length) {
        console.log(`  Thread: ${result.thread.length} tweets`);
      }
      if (result.contentId) {
        console.log(`  Content ID: ${result.contentId}`);
      }
    } else {
      console.error(`[MarketingWorkflow] Failed for release ${releaseTag}: ${result.error}`);
    }
  } catch (error) {
    console.error(`[MarketingWorkflow] Error processing release ${releaseId}:`, error);
  }
}

/**
 * Trigger marketing content generation manually
 */
export async function triggerMarketingContent(
  type: 'pr_merged' | 'release_published',
  id: string
): Promise<{ success: boolean; contentId?: string; error?: string }> {
  try {
    if (type === 'pr_merged') {
      const pr = await prModel.findById(id);
      if (!pr) {
        return { success: false, error: 'PR not found' };
      }

      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        return { success: false, error: 'Repository not found' };
      }

      const ownerName = repo.diskPath.split('/').slice(-2)[0] || 'unknown';
      const repoFullName = `${ownerName}/${repo.name}`;

      const result = await runMarketingContentWorkflow({
        type: 'pr_merged',
        repoId: pr.repoId,
        repoFullName,
        prId: id,
        prNumber: pr.number,
        prTitle: pr.title,
        prBody: pr.body || undefined,
        authorId: pr.authorId,
      });

      return {
        success: result.success,
        contentId: result.contentId,
        error: result.error,
      };
    } else {
      const release = await releaseModel.getById(id);
      if (!release) {
        return { success: false, error: 'Release not found' };
      }

      const repo = await repoModel.findById(release.repoId);
      if (!repo) {
        return { success: false, error: 'Repository not found' };
      }

      const ownerName = repo.diskPath.split('/').slice(-2)[0] || 'unknown';
      const repoFullName = `${ownerName}/${repo.name}`;

      const result = await runMarketingContentWorkflow({
        type: 'release_published',
        repoId: release.repoId,
        repoFullName,
        releaseId: id,
        releaseTag: release.tagName,
        releaseName: release.name || release.tagName,
        releaseBody: release.body || undefined,
      });

      return {
        success: result.success,
        contentId: result.contentId,
        error: result.error,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
