/**
 * Notification Event Handlers
 * 
 * Listens to events and creates appropriate notifications.
 * Also handles inbox-related state updates (review requests).
 * Sends email notifications based on user preferences.
 */

import { eventBus } from '../bus';
import { notificationModel, prReviewerModel } from '../../db/models';
import { emailPreferencesModel } from '../../db/models/email-preferences';
import { getGlobalEmailService } from '../../core/email';
import { getDb } from '../../db';
import { user } from '../../db/auth-schema';
import { notifications, type Notification } from '../../db/schema';
import { eq } from 'drizzle-orm';
import type { 
  PrReviewRequestedEvent,
  PrReviewedEvent,
  PrMergedEvent,
  PrCommentedEvent,
  IssueAssignedEvent,
  IssueCommentedEvent,
  MentionEvent,
  RepoStarredEvent,
  RepoForkedEvent,
  CiRunCompletedEvent,
} from '../types';

/**
 * Send email notification for a notification if user preferences allow
 */
async function sendNotificationEmail(notification: Notification, actorName?: string): Promise<void> {
  const emailService = getGlobalEmailService();
  
  // Check if email service is configured
  if (!emailService.isConfigured()) {
    return;
  }

  try {
    // Check user preferences
    const shouldSend = await emailPreferencesModel.shouldSendEmail(notification.userId, notification.type);
    if (!shouldSend) {
      return;
    }

    // Get user email
    const db = getDb();
    const [recipient] = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, notification.userId))
      .limit(1);

    if (!recipient?.email) {
      return;
    }

    // Send the email
    const result = await emailService.sendNotificationEmail({
      email: recipient.email,
      name: recipient.name || undefined,
      notifications: [{
        type: notification.type,
        title: notification.title,
        body: notification.body || undefined,
        url: notification.url || undefined,
        actorName,
      }],
    });

    if (result.success) {
      // Mark notification as email sent
      await db
        .update(notifications)
        .set({ emailSent: true, emailSentAt: new Date() })
        .where(eq(notifications.id, notification.id));
    } else {
      console.error('[EventBus] Failed to send notification email:', result.error);
    }
  } catch (error) {
    console.error('[EventBus] Error sending notification email:', error);
  }
}

/**
 * Get actor name for email notifications
 */
async function getActorName(actorId: string): Promise<string | undefined> {
  try {
    const db = getDb();
    const [actor] = await db
      .select({ name: user.name, username: user.username })
      .from(user)
      .where(eq(user.id, actorId))
      .limit(1);
    return actor?.name || actor?.username || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Register all notification handlers
 */
export function registerNotificationHandlers(): void {
  // PR Review Requested
  eventBus.on('pr.review_requested', async (event: PrReviewRequestedEvent) => {
    const { prId, prNumber, prTitle, repoId, repoFullName, reviewerId, authorId: _authorId } = event.payload;
    
    // Persist the review request to the database (for inbox feature)
    try {
      await prReviewerModel.requestReview(prId, reviewerId, event.actorId);
    } catch (error) {
      console.error('[EventBus] Failed to persist review request:', error);
    }
    
    // Don't notify if reviewing own PR
    if (reviewerId === event.actorId) return;
    
    const notification = await notificationModel.create({
      userId: reviewerId,
      type: 'pr_review_requested',
      title: `Review requested on #${prNumber}: ${prTitle}`,
      body: `You've been requested to review a pull request`,
      actorId: event.actorId,
      prId,
      repoId,
      url: `/${repoFullName}/pull/${prNumber}`,
    });
    
    // Send email notification
    const actorName = await getActorName(event.actorId);
    sendNotificationEmail(notification, actorName);
  });

  // PR Reviewed
  eventBus.on('pr.reviewed', async (event: PrReviewedEvent) => {
    const { prId, prNumber, prTitle, repoId, repoFullName, authorId, reviewState } = event.payload;
    
    // Mark the review request as completed (for inbox feature)
    try {
      await prReviewerModel.completeReview(prId, event.actorId);
    } catch (error) {
      console.error('[EventBus] Failed to complete review request:', error);
    }
    
    // Don't notify if reviewing own PR
    if (authorId === event.actorId) return;
    
    const stateText = reviewState === 'approved' ? 'approved' : 
                      reviewState === 'changes_requested' ? 'requested changes on' : 
                      'commented on';
    
    const notification = await notificationModel.create({
      userId: authorId,
      type: 'pr_reviewed',
      title: `Your PR #${prNumber} was ${stateText}`,
      body: prTitle,
      actorId: event.actorId,
      prId,
      repoId,
      url: `/${repoFullName}/pull/${prNumber}`,
    });
    
    // Send email notification
    const actorName = await getActorName(event.actorId);
    sendNotificationEmail(notification, actorName);
  });

  // PR Merged
  eventBus.on('pr.merged', async (event: PrMergedEvent) => {
    const { prId, prNumber, prTitle, repoId, repoFullName, authorId } = event.payload;
    
    // Notify the author if someone else merged it
    if (authorId !== event.actorId) {
      const notification = await notificationModel.create({
        userId: authorId,
        type: 'pr_merged',
        title: `Your PR #${prNumber} was merged`,
        body: prTitle,
        actorId: event.actorId,
        prId,
        repoId,
        url: `/${repoFullName}/pull/${prNumber}`,
      });
      
      // Send email notification
      const actorName = await getActorName(event.actorId);
      sendNotificationEmail(notification, actorName);
    }
  });

  // PR Commented
  eventBus.on('pr.commented', async (event: PrCommentedEvent) => {
    const { prId, prNumber, prTitle, repoId, repoFullName, authorId } = event.payload;
    
    // Notify the PR author (if not the commenter)
    if (authorId !== event.actorId) {
      const notification = await notificationModel.create({
        userId: authorId,
        type: 'pr_comment',
        title: `New comment on your PR #${prNumber}`,
        body: prTitle,
        actorId: event.actorId,
        prId,
        repoId,
        url: `/${repoFullName}/pull/${prNumber}`,
      });
      
      // Send email notification
      const actorName = await getActorName(event.actorId);
      sendNotificationEmail(notification, actorName);
    }
    
    // Handle mentions separately through the mention event
  });

  // Issue Assigned
  eventBus.on('issue.assigned', async (event: IssueAssignedEvent) => {
    const { issueId, issueNumber, issueTitle, repoId, repoFullName, assigneeId } = event.payload;
    
    // Don't notify if self-assigning
    if (assigneeId === event.actorId) return;
    
    const notification = await notificationModel.create({
      userId: assigneeId,
      type: 'issue_assigned',
      title: `You were assigned to #${issueNumber}: ${issueTitle}`,
      actorId: event.actorId,
      issueId,
      repoId,
      url: `/${repoFullName}/issues/${issueNumber}`,
    });
    
    // Send email notification
    const actorName = await getActorName(event.actorId);
    sendNotificationEmail(notification, actorName);
  });

  // Issue Commented
  eventBus.on('issue.commented', async (event: IssueCommentedEvent) => {
    const { issueId, issueNumber, issueTitle, repoId, repoFullName, authorId } = event.payload;
    
    // Notify the issue author (if not the commenter)
    if (authorId !== event.actorId) {
      const notification = await notificationModel.create({
        userId: authorId,
        type: 'issue_comment',
        title: `New comment on your issue #${issueNumber}`,
        body: issueTitle,
        actorId: event.actorId,
        issueId,
        repoId,
        url: `/${repoFullName}/issues/${issueNumber}`,
      });
      
      // Send email notification
      const actorName = await getActorName(event.actorId);
      sendNotificationEmail(notification, actorName);
    }
  });

  // Mentions
  eventBus.on('mention', async (event: MentionEvent) => {
    const { mentionedUserId, context, contextId, contextNumber, contextTitle, repoId, repoFullName } = event.payload;
    
    // Don't notify if mentioning yourself
    if (mentionedUserId === event.actorId) return;
    
    const contextType = context.includes('pr') ? 'pull request' : 'issue';
    const urlPath = context.includes('pr') ? 'pull' : 'issues';
    
    const notification = await notificationModel.create({
      userId: mentionedUserId,
      type: 'mention',
      title: `You were mentioned in a ${contextType}`,
      body: `#${contextNumber}: ${contextTitle}`,
      actorId: event.actorId,
      prId: context.includes('pr') ? contextId : undefined,
      issueId: context.includes('issue') ? contextId : undefined,
      repoId,
      url: `/${repoFullName}/${urlPath}/${contextNumber}`,
    });
    
    // Send email notification
    const actorName = await getActorName(event.actorId);
    sendNotificationEmail(notification, actorName);
  });

  // Repo Starred
  eventBus.on('repo.starred', async (event: RepoStarredEvent) => {
    const { repoId, repoFullName, ownerId } = event.payload;
    
    // Don't notify if starring own repo
    if (ownerId === event.actorId) return;
    
    const notification = await notificationModel.create({
      userId: ownerId,
      type: 'repo_starred',
      title: `Someone starred your repository`,
      body: repoFullName,
      actorId: event.actorId,
      repoId,
      url: `/${repoFullName}`,
    });
    
    // Send email notification (usually off by default, but respect preferences)
    const actorName = await getActorName(event.actorId);
    sendNotificationEmail(notification, actorName);
  });

  // Repo Forked
  eventBus.on('repo.forked', async (event: RepoForkedEvent) => {
    const { repoId, forkedFromFullName, ownerId } = event.payload;
    
    // Notify the original repo owner
    const notification = await notificationModel.create({
      userId: ownerId,
      type: 'repo_forked',
      title: `Someone forked your repository`,
      body: forkedFromFullName,
      actorId: event.actorId,
      repoId,
      url: `/${forkedFromFullName}`,
    });
    
    // Send email notification
    const actorName = await getActorName(event.actorId);
    sendNotificationEmail(notification, actorName);
  });

  // CI Run Completed
  eventBus.on('ci.completed', async (event: CiRunCompletedEvent) => {
    const { repoId, repoFullName, workflowName, conclusion, prNumber, authorId } = event.payload;
    
    // Notify the author if CI failed on their PR
    if (authorId && conclusion === 'failure') {
      const notification = await notificationModel.create({
        userId: authorId,
        type: 'ci_failed',
        title: `CI failed: ${workflowName}`,
        body: prNumber ? `Pull request #${prNumber}` : undefined,
        actorId: event.actorId,
        repoId,
        url: prNumber ? `/${repoFullName}/pull/${prNumber}` : `/${repoFullName}`,
      });
      
      // Send email notification
      sendNotificationEmail(notification);
    }
    
    // Optionally notify on CI success (usually off by default)
    if (authorId && conclusion === 'success') {
      const notification = await notificationModel.create({
        userId: authorId,
        type: 'ci_passed',
        title: `CI passed: ${workflowName}`,
        body: prNumber ? `Pull request #${prNumber}` : undefined,
        actorId: event.actorId,
        repoId,
        url: prNumber ? `/${repoFullName}/pull/${prNumber}` : `/${repoFullName}`,
      });
      
      // Send email notification (usually off by default)
      sendNotificationEmail(notification);
    }
  });

  console.log('[EventBus] Notification handlers registered');
}
