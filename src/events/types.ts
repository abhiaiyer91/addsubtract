/**
 * Event Types for the Event Bus
 * 
 * These events are emitted throughout the application and can trigger:
 * - Notifications
 * - Webhooks
 * - Activity logs
 * - Analytics
 */

// ============ BASE EVENT ============

export interface BaseEvent {
  id: string;
  timestamp: Date;
  actorId: string; // User who triggered the event
}

// ============ REPOSITORY EVENTS ============

export interface RepoCreatedEvent extends BaseEvent {
  type: 'repo.created';
  payload: {
    repoId: string;
    repoName: string;
    ownerId: string;
    ownerType: 'user' | 'organization';
    isPrivate: boolean;
  };
}

export interface RepoPushedEvent extends BaseEvent {
  type: 'repo.pushed';
  payload: {
    repoId: string;
    repoFullName: string;
    ref: string;
    beforeSha: string | null;
    afterSha: string;
    commits: Array<{
      sha: string;
      message: string;
      author: string;
    }>;
  };
}

export interface RepoStarredEvent extends BaseEvent {
  type: 'repo.starred';
  payload: {
    repoId: string;
    repoFullName: string;
    ownerId: string;
  };
}

export interface RepoForkedEvent extends BaseEvent {
  type: 'repo.forked';
  payload: {
    repoId: string;
    repoFullName: string;
    forkedFromId: string;
    forkedFromFullName: string;
    ownerId: string;
  };
}

// ============ PULL REQUEST EVENTS ============

export interface PrCreatedEvent extends BaseEvent {
  type: 'pr.created';
  payload: {
    prId: string;
    prNumber: number;
    prTitle: string;
    repoId: string;
    repoFullName: string;
    sourceBranch: string;
    targetBranch: string;
  };
}

export interface PrUpdatedEvent extends BaseEvent {
  type: 'pr.updated';
  payload: {
    prId: string;
    prNumber: number;
    prTitle: string;
    repoId: string;
    repoFullName: string;
    authorId: string;
  };
}

export interface PrReviewRequestedEvent extends BaseEvent {
  type: 'pr.review_requested';
  payload: {
    prId: string;
    prNumber: number;
    prTitle: string;
    repoId: string;
    repoFullName: string;
    reviewerId: string;
    authorId: string;
  };
}

export interface PrReviewedEvent extends BaseEvent {
  type: 'pr.reviewed';
  payload: {
    prId: string;
    prNumber: number;
    prTitle: string;
    repoId: string;
    repoFullName: string;
    authorId: string;
    reviewState: 'approved' | 'changes_requested' | 'commented';
  };
}

export interface PrMergedEvent extends BaseEvent {
  type: 'pr.merged';
  payload: {
    prId: string;
    prNumber: number;
    prTitle: string;
    repoId: string;
    repoFullName: string;
    authorId: string;
    mergeStrategy: 'merge' | 'squash' | 'rebase';
  };
}

export interface PrClosedEvent extends BaseEvent {
  type: 'pr.closed';
  payload: {
    prId: string;
    prNumber: number;
    prTitle: string;
    repoId: string;
    repoFullName: string;
    authorId: string;
  };
}

export interface PrCommentedEvent extends BaseEvent {
  type: 'pr.commented';
  payload: {
    prId: string;
    prNumber: number;
    prTitle: string;
    repoId: string;
    repoFullName: string;
    authorId: string;
    commentId: string;
    commentBody: string;
    mentionedUserIds: string[];
  };
}

// ============ ISSUE EVENTS ============

export interface IssueCreatedEvent extends BaseEvent {
  type: 'issue.created';
  payload: {
    issueId: string;
    issueNumber: number;
    issueTitle: string;
    repoId: string;
    repoFullName: string;
  };
}

export interface IssueAssignedEvent extends BaseEvent {
  type: 'issue.assigned';
  payload: {
    issueId: string;
    issueNumber: number;
    issueTitle: string;
    repoId: string;
    repoFullName: string;
    assigneeId: string;
  };
}

export interface IssueClosedEvent extends BaseEvent {
  type: 'issue.closed';
  payload: {
    issueId: string;
    issueNumber: number;
    issueTitle: string;
    repoId: string;
    repoFullName: string;
    authorId: string;
  };
}

export interface IssueCommentedEvent extends BaseEvent {
  type: 'issue.commented';
  payload: {
    issueId: string;
    issueNumber: number;
    issueTitle: string;
    repoId: string;
    repoFullName: string;
    authorId: string;
    commentId: string;
    commentBody: string;
    mentionedUserIds: string[];
  };
}

// ============ CI/CD EVENTS ============

export interface CiRunCompletedEvent extends BaseEvent {
  type: 'ci.completed';
  payload: {
    runId: string;
    repoId: string;
    repoFullName: string;
    workflowName: string;
    conclusion: 'success' | 'failure' | 'cancelled';
    prId?: string;
    prNumber?: number;
    authorId?: string;
  };
}

// ============ MENTION EVENTS ============

export interface MentionEvent extends BaseEvent {
  type: 'mention';
  payload: {
    mentionedUserId: string;
    context: 'pr' | 'issue' | 'pr_comment' | 'issue_comment';
    contextId: string;
    contextNumber: number;
    contextTitle: string;
    repoId: string;
    repoFullName: string;
  };
}

// ============ MERGE QUEUE EVENTS ============

export interface MergeQueueAddedEvent extends BaseEvent {
  type: 'merge_queue.added';
  payload: {
    prId: string;
    prNumber: number;
    repoId: string;
    position: number;
  };
}

export interface MergeQueueProcessEvent extends BaseEvent {
  type: 'merge_queue.process';
  payload: {
    repoId: string;
    targetBranch: string;
  };
}

export interface MergeQueueCompletedEvent extends BaseEvent {
  type: 'merge_queue.completed';
  payload: {
    prId: string;
    prNumber: number;
    repoId: string;
    mergeSha: string;
  };
}

export interface MergeQueueFailedEvent extends BaseEvent {
  type: 'merge_queue.failed';
  payload: {
    prId: string;
    prNumber: number;
    repoId: string;
    errorMessage: string;
  };
}

// ============ UNION TYPE ============

export type AppEvent =
  | RepoCreatedEvent
  | RepoPushedEvent
  | RepoStarredEvent
  | RepoForkedEvent
  | PrCreatedEvent
  | PrUpdatedEvent
  | PrReviewRequestedEvent
  | PrReviewedEvent
  | PrMergedEvent
  | PrClosedEvent
  | PrCommentedEvent
  | IssueCreatedEvent
  | IssueAssignedEvent
  | IssueClosedEvent
  | IssueCommentedEvent
  | CiRunCompletedEvent
  | MentionEvent
  | MergeQueueAddedEvent
  | MergeQueueProcessEvent
  | MergeQueueCompletedEvent
  | MergeQueueFailedEvent;

export type EventType = AppEvent['type'];

// Helper to extract payload type for a given event type
export type EventPayload<T extends EventType> = Extract<AppEvent, { type: T }>['payload'];
