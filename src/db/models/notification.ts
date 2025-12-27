import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../index';
import { notifications, type Notification, type NewNotification } from '../schema';
import { user } from '../auth-schema';

// Notification with actor info
export type NotificationWithActor = Notification & {
  actor: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
  } | null;
};

export const notificationModel = {
  /**
   * Create a new notification
   */
  async create(data: NewNotification): Promise<Notification> {
    const db = getDb();
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  },

  /**
   * Create multiple notifications (for batch operations)
   */
  async createMany(data: NewNotification[]): Promise<Notification[]> {
    if (data.length === 0) return [];
    const db = getDb();
    return db.insert(notifications).values(data).returning();
  },

  /**
   * Get notifications for a user
   */
  async listByUser(
    userId: string,
    options: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<NotificationWithActor[]> {
    const db = getDb();
    const { unreadOnly = false, limit = 50, offset = 0 } = options;

    const conditions = [eq(notifications.userId, userId)];
    if (unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    const results = await db
      .select({
        notification: notifications,
        actor: {
          id: user.id,
          name: user.name,
          username: user.username,
          image: user.image,
        },
      })
      .from(notifications)
      .leftJoin(user, eq(notifications.actorId, user.id))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return results.map((r) => ({
      ...r.notification,
      actor: r.actor?.id ? r.actor : null,
    }));
  },

  /**
   * Count unread notifications for a user
   */
  async countUnread(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return result.length;
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(id: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return result.length > 0;
  },

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
      .returning();
    return result.length;
  },

  /**
   * Delete a notification
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return result.length > 0;
  },

  /**
   * Delete all notifications for a user
   */
  async deleteAll(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(notifications)
      .where(eq(notifications.userId, userId))
      .returning();
    return result.length;
  },
};

// Helper to create notifications for common events
export const notificationHelpers = {
  /**
   * Notify when a PR review is requested
   */
  async prReviewRequested(
    reviewerId: string,
    actorId: string,
    prId: string,
    repoId: string,
    prTitle: string,
    repoFullName: string
  ): Promise<Notification> {
    return notificationModel.create({
      userId: reviewerId,
      type: 'pr_review_requested',
      title: `Review requested on "${prTitle}"`,
      body: `You've been requested to review a pull request in ${repoFullName}`,
      actorId,
      prId,
      repoId,
      url: `/${repoFullName}/pull/${prId}`,
    });
  },

  /**
   * Notify PR author when their PR is reviewed
   */
  async prReviewed(
    authorId: string,
    reviewerId: string,
    prId: string,
    repoId: string,
    prTitle: string,
    repoFullName: string,
    reviewState: string
  ): Promise<Notification> {
    const stateText = reviewState === 'approved' ? 'approved' : 
                      reviewState === 'changes_requested' ? 'requested changes on' : 
                      'commented on';
    return notificationModel.create({
      userId: authorId,
      type: 'pr_reviewed',
      title: `Your PR "${prTitle}" was ${stateText}`,
      actorId: reviewerId,
      prId,
      repoId,
      url: `/${repoFullName}/pull/${prId}`,
    });
  },

  /**
   * Notify when mentioned in a comment
   */
  async mention(
    mentionedUserId: string,
    actorId: string,
    context: 'pr' | 'issue',
    contextId: string,
    repoId: string,
    repoFullName: string,
    contextNumber: number
  ): Promise<Notification> {
    return notificationModel.create({
      userId: mentionedUserId,
      type: 'mention',
      title: `You were mentioned in ${context === 'pr' ? 'a pull request' : 'an issue'}`,
      actorId,
      prId: context === 'pr' ? contextId : undefined,
      issueId: context === 'issue' ? contextId : undefined,
      repoId,
      url: `/${repoFullName}/${context === 'pr' ? 'pull' : 'issues'}/${contextNumber}`,
    });
  },

  /**
   * Notify issue assignee
   */
  async issueAssigned(
    assigneeId: string,
    actorId: string,
    issueId: string,
    repoId: string,
    issueTitle: string,
    repoFullName: string,
    issueNumber: number
  ): Promise<Notification> {
    return notificationModel.create({
      userId: assigneeId,
      type: 'issue_assigned',
      title: `You were assigned to "${issueTitle}"`,
      actorId,
      issueId,
      repoId,
      url: `/${repoFullName}/issues/${issueNumber}`,
    });
  },
};
