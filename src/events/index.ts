/**
 * Events Module
 * 
 * Event-driven architecture for the wit platform.
 * Events trigger notifications, webhooks, activity logs, AI workflows, etc.
 */

export * from './types';
export { eventBus, createEvent } from './bus';
export { registerNotificationHandlers } from './handlers/notifications';
export { registerCIHandlers } from './handlers/ci';
export { registerMergeQueueHandlers, mergeQueueHandler } from './handlers/merge-queue';
export { registerTriageHandlers } from './handlers/triage';
export { registerPRReviewHandlers, triggerAsyncPRReview } from './handlers/pr-review';
export { registerMarketingHandlers, triggerMarketingContent } from './handlers/marketing';

/**
 * Helper to extract @mentions from text
 */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_-]+)/g);
  return matches ? [...new Set(matches.map(m => m.slice(1)))] : [];
}
