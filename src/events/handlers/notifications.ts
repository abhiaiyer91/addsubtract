/**
 * Notification Event Handlers
 * 
 * Listens to events and creates appropriate notifications.
 */

import { eventBus } from '../bus';
import { notificationModel } from '../../db/models';
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
 * Register all notification handlers
 */
export function registerNotificationHandlers(): void {
  // PR Review Requested
  eventBus.on('pr.review_requested', async (event: PrReviewRequestedEvent) => {
    const { prId, prNumber, prTitle, repoId, repoFullName, reviewerId, authorId: _authorId } = event.payload;
    
    // Don't notify if reviewing own PR
    if (reviewerId === event.actorId) return;
    
    await notificationModel.create({
      userId: reviewerId,
      type: 'pr_review_requested',
      title: `Review requested on #${prNumber}: ${prTitle}`,
      body: `You've been requested to review a pull request`,
      actorId: event.actorId,
      prId,
      repoId,
      url: `/${repoFullName}/pull/${prNumber}`,
    });
  });

  // PR Reviewed
  eventBus.on('pr.reviewed', async (event: PrReviewedEvent) => {
    const { prId, prNumber, prTitle, repoId, repoFullName, authorId, reviewState } = event.payload;
    
    // Don't notify if reviewing own PR
    if (authorId === event.actorId) return;
    
    const stateText = reviewState === 'approved' ? 'approved' : 
                      reviewState === 'changes_requested' ? 'requested changes on' : 
                      'commented on';
    
    await notificationModel.create({
      userId: authorId,
      type: 'pr_reviewed',
      title: `Your PR #${prNumber} was ${stateText}`,
      body: prTitle,
      actorId: event.actorId,
      prId,
      repoId,
      url: `/${repoFullName}/pull/${prNumber}`,
    });
  });

  // PR Merged
  eventBus.on('pr.merged', async (event: PrMergedEvent) => {
    const { prId, prNumber, prTitle, repoId, repoFullName, authorId } = event.payload;
    
    // Notify the author if someone else merged it
    if (authorId !== event.actorId) {
      await notificationModel.create({
        userId: authorId,
        type: 'pr_merged',
        title: `Your PR #${prNumber} was merged`,
        body: prTitle,
        actorId: event.actorId,
        prId,
        repoId,
        url: `/${repoFullName}/pull/${prNumber}`,
      });
    }
  });

  // PR Commented
  eventBus.on('pr.commented', async (event: PrCommentedEvent) => {
    const { prId, prNumber, prTitle, repoId, repoFullName, authorId } = event.payload;
    
    // Notify the PR author (if not the commenter)
    if (authorId !== event.actorId) {
      await notificationModel.create({
        userId: authorId,
        type: 'pr_comment',
        title: `New comment on your PR #${prNumber}`,
        body: prTitle,
        actorId: event.actorId,
        prId,
        repoId,
        url: `/${repoFullName}/pull/${prNumber}`,
      });
    }
    
    // Handle mentions separately through the mention event
  });

  // Issue Assigned
  eventBus.on('issue.assigned', async (event: IssueAssignedEvent) => {
    const { issueId, issueNumber, issueTitle, repoId, repoFullName, assigneeId } = event.payload;
    
    // Don't notify if self-assigning
    if (assigneeId === event.actorId) return;
    
    await notificationModel.create({
      userId: assigneeId,
      type: 'issue_assigned',
      title: `You were assigned to #${issueNumber}: ${issueTitle}`,
      actorId: event.actorId,
      issueId,
      repoId,
      url: `/${repoFullName}/issues/${issueNumber}`,
    });
  });

  // Issue Commented
  eventBus.on('issue.commented', async (event: IssueCommentedEvent) => {
    const { issueId, issueNumber, issueTitle, repoId, repoFullName, authorId } = event.payload;
    
    // Notify the issue author (if not the commenter)
    if (authorId !== event.actorId) {
      await notificationModel.create({
        userId: authorId,
        type: 'issue_comment',
        title: `New comment on your issue #${issueNumber}`,
        body: issueTitle,
        actorId: event.actorId,
        issueId,
        repoId,
        url: `/${repoFullName}/issues/${issueNumber}`,
      });
    }
  });

  // Mentions
  eventBus.on('mention', async (event: MentionEvent) => {
    const { mentionedUserId, context, contextId, contextNumber, contextTitle, repoId, repoFullName } = event.payload;
    
    // Don't notify if mentioning yourself
    if (mentionedUserId === event.actorId) return;
    
    const contextType = context.includes('pr') ? 'pull request' : 'issue';
    const urlPath = context.includes('pr') ? 'pull' : 'issues';
    
    await notificationModel.create({
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
  });

  // Repo Starred
  eventBus.on('repo.starred', async (event: RepoStarredEvent) => {
    const { repoId, repoFullName, ownerId } = event.payload;
    
    // Don't notify if starring own repo
    if (ownerId === event.actorId) return;
    
    await notificationModel.create({
      userId: ownerId,
      type: 'repo_starred',
      title: `Someone starred your repository`,
      body: repoFullName,
      actorId: event.actorId,
      repoId,
      url: `/${repoFullName}`,
    });
  });

  // Repo Forked
  eventBus.on('repo.forked', async (event: RepoForkedEvent) => {
    const { repoId, forkedFromFullName, ownerId } = event.payload;
    
    // Notify the original repo owner
    await notificationModel.create({
      userId: ownerId,
      type: 'repo_forked',
      title: `Someone forked your repository`,
      body: forkedFromFullName,
      actorId: event.actorId,
      repoId,
      url: `/${forkedFromFullName}`,
    });
  });

  // CI Run Completed
  eventBus.on('ci.completed', async (event: CiRunCompletedEvent) => {
    const { repoId, repoFullName, workflowName, conclusion, prNumber, authorId } = event.payload;
    
    // Notify the author if CI failed on their PR
    if (authorId && conclusion === 'failure') {
      await notificationModel.create({
        userId: authorId,
        type: 'ci_failed',
        title: `CI failed: ${workflowName}`,
        body: prNumber ? `Pull request #${prNumber}` : undefined,
        actorId: event.actorId,
        repoId,
        url: prNumber ? `/${repoFullName}/pull/${prNumber}` : `/${repoFullName}`,
      });
    }
  });

  console.log('[EventBus] Notification handlers registered');
}
