import { eq, and, desc, inArray } from 'drizzle-orm';
import { getDb } from '../index';
import {
  issueActivities,
  issues,
  type IssueActivity,
  type NewIssueActivity,
} from '../schema';
import { user } from '../auth-schema';

// Activity action types
export type ActivityAction =
  | 'created'
  | 'updated'
  | 'closed'
  | 'reopened'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'unassigned'
  | 'label_added'
  | 'label_removed'
  | 'estimate_changed'
  | 'due_date_set'
  | 'due_date_cleared'
  | 'parent_set'
  | 'parent_removed'
  | 'project_changed'
  | 'cycle_changed'
  | 'relation_added'
  | 'relation_removed'
  | 'commented';

type Actor = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
};

export const issueActivityModel = {
  /**
   * Log an activity
   */
  async log(data: NewIssueActivity): Promise<IssueActivity> {
    const db = getDb();
    const [activity] = await db.insert(issueActivities).values(data).returning();
    return activity;
  },

  /**
   * List activities for an issue
   */
  async listByIssue(
    issueId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Array<IssueActivity & { actor: Actor }>> {
    const db = getDb();

    let query = db
      .select({
        activity: issueActivities,
        actor: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          image: user.image,
        },
      })
      .from(issueActivities)
      .innerJoin(user, eq(issueActivities.actorId, user.id))
      .where(eq(issueActivities.issueId, issueId))
      .orderBy(desc(issueActivities.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    const result = await query;
    return result.map((r) => ({
      ...r.activity,
      actor: r.actor,
    }));
  },

  /**
   * List activities for a repository (across all issues)
   */
  async listByRepo(
    repoId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Array<IssueActivity & { actor: Actor; issue: { id: string; number: number; title: string } }>> {
    const db = getDb();

    let query = db
      .select({
        activity: issueActivities,
        actor: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          image: user.image,
        },
        issue: {
          id: issues.id,
          number: issues.number,
          title: issues.title,
        },
      })
      .from(issueActivities)
      .innerJoin(user, eq(issueActivities.actorId, user.id))
      .innerJoin(issues, eq(issueActivities.issueId, issues.id))
      .where(eq(issues.repoId, repoId))
      .orderBy(desc(issueActivities.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    const result = await query;
    return result.map((r) => ({
      ...r.activity,
      actor: r.actor,
      issue: r.issue,
    }));
  },

  /**
   * List activities by an actor
   */
  async listByActor(
    actorId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Array<IssueActivity & { issue: { id: string; number: number; title: string } }>> {
    const db = getDb();

    let query = db
      .select({
        activity: issueActivities,
        issue: {
          id: issues.id,
          number: issues.number,
          title: issues.title,
        },
      })
      .from(issueActivities)
      .innerJoin(issues, eq(issueActivities.issueId, issues.id))
      .where(eq(issueActivities.actorId, actorId))
      .orderBy(desc(issueActivities.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    const result = await query;
    return result.map((r) => ({
      ...r.activity,
      issue: r.issue,
    }));
  },

  // ============ Helper functions for logging specific actions ============

  /**
   * Log issue creation
   */
  async logCreated(issueId: string, actorId: string): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'created',
    });
  },

  /**
   * Log issue closed
   */
  async logClosed(issueId: string, actorId: string): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'closed',
    });
  },

  /**
   * Log issue reopened
   */
  async logReopened(issueId: string, actorId: string): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'reopened',
    });
  },

  /**
   * Log status change
   */
  async logStatusChanged(
    issueId: string,
    actorId: string,
    oldStatus: string,
    newStatus: string
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'status_changed',
      field: 'status',
      oldValue: oldStatus,
      newValue: newStatus,
    });
  },

  /**
   * Log priority change
   */
  async logPriorityChanged(
    issueId: string,
    actorId: string,
    oldPriority: string,
    newPriority: string
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'priority_changed',
      field: 'priority',
      oldValue: oldPriority,
      newValue: newPriority,
    });
  },

  /**
   * Log assignment
   */
  async logAssigned(
    issueId: string,
    actorId: string,
    assigneeId: string,
    assigneeName?: string
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'assigned',
      field: 'assignee',
      newValue: assigneeId,
      metadata: assigneeName ? JSON.stringify({ assigneeName }) : undefined,
    });
  },

  /**
   * Log unassignment
   */
  async logUnassigned(
    issueId: string,
    actorId: string,
    previousAssigneeId: string,
    previousAssigneeName?: string
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'unassigned',
      field: 'assignee',
      oldValue: previousAssigneeId,
      metadata: previousAssigneeName ? JSON.stringify({ previousAssigneeName }) : undefined,
    });
  },

  /**
   * Log label added
   */
  async logLabelAdded(
    issueId: string,
    actorId: string,
    labelId: string,
    labelName: string
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'label_added',
      field: 'labels',
      newValue: labelId,
      metadata: JSON.stringify({ labelName }),
    });
  },

  /**
   * Log label removed
   */
  async logLabelRemoved(
    issueId: string,
    actorId: string,
    labelId: string,
    labelName: string
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'label_removed',
      field: 'labels',
      oldValue: labelId,
      metadata: JSON.stringify({ labelName }),
    });
  },

  /**
   * Log estimate change
   */
  async logEstimateChanged(
    issueId: string,
    actorId: string,
    oldEstimate: number | null,
    newEstimate: number | null
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'estimate_changed',
      field: 'estimate',
      oldValue: oldEstimate?.toString() ?? null,
      newValue: newEstimate?.toString() ?? null,
    });
  },

  /**
   * Log due date set
   */
  async logDueDateSet(
    issueId: string,
    actorId: string,
    dueDate: Date
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'due_date_set',
      field: 'dueDate',
      newValue: dueDate.toISOString(),
    });
  },

  /**
   * Log due date cleared
   */
  async logDueDateCleared(
    issueId: string,
    actorId: string,
    previousDueDate: Date
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'due_date_cleared',
      field: 'dueDate',
      oldValue: previousDueDate.toISOString(),
    });
  },

  /**
   * Log parent set
   */
  async logParentSet(
    issueId: string,
    actorId: string,
    parentId: string,
    parentNumber?: number
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'parent_set',
      field: 'parent',
      newValue: parentId,
      metadata: parentNumber ? JSON.stringify({ parentNumber }) : undefined,
    });
  },

  /**
   * Log parent removed
   */
  async logParentRemoved(
    issueId: string,
    actorId: string,
    previousParentId: string,
    previousParentNumber?: number
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'parent_removed',
      field: 'parent',
      oldValue: previousParentId,
      metadata: previousParentNumber ? JSON.stringify({ previousParentNumber }) : undefined,
    });
  },

  /**
   * Log project change
   */
  async logProjectChanged(
    issueId: string,
    actorId: string,
    oldProjectId: string | null,
    newProjectId: string | null,
    projectNames?: { old?: string; new?: string }
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'project_changed',
      field: 'project',
      oldValue: oldProjectId,
      newValue: newProjectId,
      metadata: projectNames ? JSON.stringify(projectNames) : undefined,
    });
  },

  /**
   * Log cycle change
   */
  async logCycleChanged(
    issueId: string,
    actorId: string,
    oldCycleId: string | null,
    newCycleId: string | null,
    cycleNames?: { old?: string; new?: string }
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'cycle_changed',
      field: 'cycle',
      oldValue: oldCycleId,
      newValue: newCycleId,
      metadata: cycleNames ? JSON.stringify(cycleNames) : undefined,
    });
  },

  /**
   * Log relation added
   */
  async logRelationAdded(
    issueId: string,
    actorId: string,
    relationType: string,
    relatedIssueId: string,
    relatedIssueNumber?: number
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'relation_added',
      field: 'relations',
      newValue: relatedIssueId,
      metadata: JSON.stringify({ relationType, relatedIssueNumber }),
    });
  },

  /**
   * Log relation removed
   */
  async logRelationRemoved(
    issueId: string,
    actorId: string,
    relationType: string,
    relatedIssueId: string,
    relatedIssueNumber?: number
  ): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'relation_removed',
      field: 'relations',
      oldValue: relatedIssueId,
      metadata: JSON.stringify({ relationType, relatedIssueNumber }),
    });
  },

  /**
   * Log comment added
   */
  async logCommented(issueId: string, actorId: string, commentId: string): Promise<IssueActivity> {
    return this.log({
      issueId,
      actorId,
      action: 'commented',
      metadata: JSON.stringify({ commentId }),
    });
  },
};
