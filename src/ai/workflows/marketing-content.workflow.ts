/**
 * Marketing Content Workflow
 * 
 * Automatically generates social media content when PRs are merged or releases
 * are published. The workflow:
 * 
 * 1. Analyzes the PR/release to understand what shipped
 * 2. Generates a tweet (280 chars) for quick announcements
 * 3. Generates a longer thread for feature launches
 * 4. Stores the content for review/publishing
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// =============================================================================
// Input/Output Schemas
// =============================================================================

export const MarketingContentInputSchema = z.object({
  type: z.enum(['pr_merged', 'release_published']),
  repoId: z.string().describe('Repository ID'),
  repoFullName: z.string().describe('Full repo name (owner/repo)'),
  // PR-specific fields
  prId: z.string().optional(),
  prNumber: z.number().optional(),
  prTitle: z.string().optional(),
  prBody: z.string().optional(),
  // Release-specific fields
  releaseId: z.string().optional(),
  releaseTag: z.string().optional(),
  releaseName: z.string().optional(),
  releaseBody: z.string().optional(),
  // Common
  authorId: z.string().optional(),
});

export type MarketingContentInput = z.infer<typeof MarketingContentInputSchema>;

export const MarketingContentOutputSchema = z.object({
  success: z.boolean(),
  contentId: z.string().optional().describe('ID of stored content'),
  tweet: z.string().describe('Single tweet (280 chars max)'),
  thread: z.array(z.string()).optional().describe('Tweet thread for longer content'),
  changelog: z.string().optional().describe('Changelog entry'),
  error: z.string().optional(),
});

export type MarketingContentOutput = z.infer<typeof MarketingContentOutputSchema>;

// =============================================================================
// Step 1: Analyze Content
// =============================================================================

const analyzeContentStep = createStep({
  id: 'analyze-content',
  inputSchema: MarketingContentInputSchema,
  outputSchema: z.object({
    type: z.enum(['pr_merged', 'release_published']),
    repoId: z.string(),
    repoFullName: z.string(),
    title: z.string(),
    body: z.string(),
    isFeature: z.boolean(),
    isBugfix: z.boolean(),
    isBreaking: z.boolean(),
    keyPoints: z.array(z.string()),
    prId: z.string().optional(),
    prNumber: z.number().optional(),
    releaseId: z.string().optional(),
    releaseTag: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const title = inputData.type === 'pr_merged' 
      ? inputData.prTitle || 'Update'
      : inputData.releaseName || inputData.releaseTag || 'New Release';
    
    const body = inputData.type === 'pr_merged'
      ? inputData.prBody || ''
      : inputData.releaseBody || '';
    
    const lowerTitle = title.toLowerCase();
    const lowerBody = body.toLowerCase();
    
    // Detect content type
    const isFeature = /feat|feature|add|new|introduce|launch/i.test(lowerTitle) ||
                      /## features?|### features?/i.test(body);
    const isBugfix = /fix|bug|patch|hotfix|resolve/i.test(lowerTitle);
    const isBreaking = /breaking|major/i.test(lowerTitle) || 
                       /breaking change/i.test(lowerBody) ||
                       /^v?\d+\.0\.0/.test(inputData.releaseTag || '');
    
    // Extract key points from body
    const keyPoints: string[] = [];
    
    // Look for bullet points
    const bulletMatches = body.match(/^[-*]\s+(.+)$/gm);
    if (bulletMatches) {
      keyPoints.push(...bulletMatches.slice(0, 5).map(b => b.replace(/^[-*]\s+/, '').trim()));
    }
    
    // Look for numbered items
    const numberedMatches = body.match(/^\d+\.\s+(.+)$/gm);
    if (numberedMatches) {
      keyPoints.push(...numberedMatches.slice(0, 5).map(n => n.replace(/^\d+\.\s+/, '').trim()));
    }
    
    return {
      type: inputData.type,
      repoId: inputData.repoId,
      repoFullName: inputData.repoFullName,
      title,
      body,
      isFeature,
      isBugfix,
      isBreaking,
      keyPoints: keyPoints.slice(0, 5),
      prId: inputData.prId,
      prNumber: inputData.prNumber,
      releaseId: inputData.releaseId,
      releaseTag: inputData.releaseTag,
    };
  },
});

// =============================================================================
// Step 2: Generate Tweet
// =============================================================================

const generateTweetStep = createStep({
  id: 'generate-tweet',
  inputSchema: z.object({
    type: z.enum(['pr_merged', 'release_published']),
    repoId: z.string(),
    repoFullName: z.string(),
    title: z.string(),
    body: z.string(),
    isFeature: z.boolean(),
    isBugfix: z.boolean(),
    isBreaking: z.boolean(),
    keyPoints: z.array(z.string()),
    prId: z.string().optional(),
    prNumber: z.number().optional(),
    releaseId: z.string().optional(),
    releaseTag: z.string().optional(),
  }),
  outputSchema: z.object({
    type: z.enum(['pr_merged', 'release_published']),
    repoId: z.string(),
    repoFullName: z.string(),
    title: z.string(),
    body: z.string(),
    isFeature: z.boolean(),
    isBugfix: z.boolean(),
    isBreaking: z.boolean(),
    keyPoints: z.array(z.string()),
    prId: z.string().optional(),
    prNumber: z.number().optional(),
    releaseId: z.string().optional(),
    releaseTag: z.string().optional(),
    tweet: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { repoFullName, title, isFeature, isBugfix, isBreaking, releaseTag, prNumber } = inputData;
    
    // Build tweet components
    let emoji = '';
    let action = '';
    
    if (isBreaking) {
      emoji = '';
      action = 'Breaking change';
    } else if (isFeature) {
      emoji = '';
      action = 'New';
    } else if (isBugfix) {
      emoji = '';
      action = 'Fixed';
    } else {
      emoji = '';
      action = 'Shipped';
    }
    
    // Clean up title for tweet
    const cleanedTitle = title
      .replace(/^(feat|fix|chore|docs|refactor|test|style|perf|ci|build)(\([^)]+\))?:\s*/i, '')
      .replace(/\[.*?\]/g, '')
      .trim();
    
    // Build the tweet
    let tweet = '';
    
    if (inputData.type === 'release_published' && releaseTag) {
      tweet = `${emoji} ${repoFullName} ${releaseTag} is out!\n\n${cleanedTitle}`;
    } else if (prNumber) {
      tweet = `${emoji} ${action}: ${cleanedTitle}\n\n${repoFullName}#${prNumber}`;
    } else {
      tweet = `${emoji} ${action}: ${cleanedTitle}\n\n${repoFullName}`;
    }
    
    // Truncate if needed (leave room for potential link)
    if (tweet.length > 260) {
      tweet = tweet.substring(0, 257) + '...';
    }
    
    return {
      ...inputData,
      tweet,
    };
  },
});

// =============================================================================
// Step 3: Generate Thread (for features/releases)
// =============================================================================

const generateThreadStep = createStep({
  id: 'generate-thread',
  inputSchema: z.object({
    type: z.enum(['pr_merged', 'release_published']),
    repoId: z.string(),
    repoFullName: z.string(),
    title: z.string(),
    body: z.string(),
    isFeature: z.boolean(),
    isBugfix: z.boolean(),
    isBreaking: z.boolean(),
    keyPoints: z.array(z.string()),
    prId: z.string().optional(),
    prNumber: z.number().optional(),
    releaseId: z.string().optional(),
    releaseTag: z.string().optional(),
    tweet: z.string(),
  }),
  outputSchema: z.object({
    type: z.enum(['pr_merged', 'release_published']),
    repoId: z.string(),
    repoFullName: z.string(),
    title: z.string(),
    isFeature: z.boolean(),
    keyPoints: z.array(z.string()),
    prId: z.string().optional(),
    prNumber: z.number().optional(),
    releaseId: z.string().optional(),
    releaseTag: z.string().optional(),
    tweet: z.string(),
    thread: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { tweet, keyPoints, isFeature, type, releaseTag } = inputData;
    const thread: string[] = [tweet];
    
    // Only generate thread for features or releases with key points
    if ((isFeature || type === 'release_published') && keyPoints.length > 0) {
      // Add key points as thread items
      for (let i = 0; i < keyPoints.length; i++) {
        const point = keyPoints[i];
        const threadItem = `${i + 1}. ${point}`;
        
        if (threadItem.length <= 280) {
          thread.push(threadItem);
        } else {
          thread.push(threadItem.substring(0, 277) + '...');
        }
      }
      
      // Add closing tweet for releases
      if (type === 'release_published' && releaseTag) {
        thread.push(`Check out the full release notes for ${releaseTag}!`);
      }
    }
    
    return {
      type: inputData.type,
      repoId: inputData.repoId,
      repoFullName: inputData.repoFullName,
      title: inputData.title,
      isFeature: inputData.isFeature,
      keyPoints,
      prId: inputData.prId,
      prNumber: inputData.prNumber,
      releaseId: inputData.releaseId,
      releaseTag: inputData.releaseTag,
      tweet,
      thread: thread.length > 1 ? thread : [],
    };
  },
});

// =============================================================================
// Step 4: Store Content
// =============================================================================

const storeContentStep = createStep({
  id: 'store-content',
  inputSchema: z.object({
    type: z.enum(['pr_merged', 'release_published']),
    repoId: z.string(),
    repoFullName: z.string(),
    title: z.string(),
    isFeature: z.boolean(),
    keyPoints: z.array(z.string()),
    prId: z.string().optional(),
    prNumber: z.number().optional(),
    releaseId: z.string().optional(),
    releaseTag: z.string().optional(),
    tweet: z.string(),
    thread: z.array(z.string()),
  }),
  outputSchema: MarketingContentOutputSchema,
  execute: async ({ inputData }) => {
    try {
      const { marketingContentModel } = await import('../../db/models/index.js');
      
      const content = await marketingContentModel.create({
        repoId: inputData.repoId,
        sourceType: inputData.type,
        sourceId: inputData.prId || inputData.releaseId || '',
        sourceRef: inputData.prNumber?.toString() || inputData.releaseTag || '',
        tweet: inputData.tweet,
        thread: inputData.thread.length > 0 ? inputData.thread : null,
        status: 'pending',
      });
      
      console.log(`[MarketingWorkflow] Generated content for ${inputData.repoFullName}: ${content.id}`);
      
      return {
        success: true,
        contentId: content.id,
        tweet: inputData.tweet,
        thread: inputData.thread.length > 0 ? inputData.thread : undefined,
      };
    } catch (error) {
      console.error('[MarketingWorkflow] Failed to store content:', error);
      
      // Return content even if storage fails
      return {
        success: true,
        tweet: inputData.tweet,
        thread: inputData.thread.length > 0 ? inputData.thread : undefined,
        error: 'Content generated but storage failed',
      };
    }
  },
});

// =============================================================================
// Workflow Definition
// =============================================================================

export const marketingContentWorkflow = createWorkflow({
  id: 'marketing-content',
  inputSchema: MarketingContentInputSchema,
  outputSchema: MarketingContentOutputSchema,
})
  .then(analyzeContentStep)
  .then(generateTweetStep)
  .then(generateThreadStep)
  .then(storeContentStep)
  .commit();

// =============================================================================
// Helper to run the workflow
// =============================================================================

export async function runMarketingContentWorkflow(
  input: MarketingContentInput
): Promise<MarketingContentOutput> {
  try {
    const run = await marketingContentWorkflow.createRun();
    const result = await run.start({ inputData: input });
    
    if (result.status === 'success' && result.result) {
      return result.result as MarketingContentOutput;
    }
    
    return {
      success: false,
      tweet: '',
      error: 'Workflow failed to complete',
    };
  } catch (error) {
    console.error('[MarketingWorkflow] Error:', error);
    return {
      success: false,
      tweet: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
