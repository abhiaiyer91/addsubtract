import { eq, desc, inArray } from 'drizzle-orm';
import { getDb } from '../index';
import {
  activities,
  watches,
  repositories,
  type Activity,
  type Repository,
} from '../schema';
import { user } from '../auth-schema';

// Actor type from better-auth user table
type Actor = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  avatarUrl: string | null;
};

export type ActivityType =
  | 'push'
  | 'pr_opened'
  | 'pr_closed'
  | 'pr_merged'
  | 'pr_comment'
  | 'pr_review'
  | 'issue_opened'
  | 'issue_closed'
  | 'issue_comment'
  | 'repo_created'
  | 'repo_forked'
  | 'repo_starred'
  | 'repo_transferred'
  | 'user_followed';

export interface ActivityPayload {
  // Push event
  commits?: Array<{ sha: string; message: string }>;
  branch?: string;
  
  // PR/Issue events
  number?: number;
  title?: string;
  
  // Comment events
  commentId?: string;
  body?: string;
  
  // Review events
  reviewState?: 'approved' | 'changes_requested' | 'commented';
  
  // Fork events
  forkedFromId?: string;
  forkedFromName?: string;
  
  // Star events
  repoName?: string;
  
  // Follow events
  followedUserId?: string;
  followedUsername?: string;
  
  // Transfer events
  previousOwnerId?: string;
  previousOwnerName?: string;
  newOwnerId?: string;
  newOwnerName?: string;
}

export const activityModel = {
  /**
   * Find an activity by ID
   */
  async findById(id: string): Promise<Activity | undefined> {
    const db = getDb();
    const [activity] = await db
      .select()
      .from(activities)
      .where(eq(activities.id, id));
    return activity;
  },

  /**
   * Create a new activity
   */
  async create(data: {
    actorId: string;
    repoId?: string;
    type: ActivityType;
    payload?: ActivityPayload;
  }): Promise<Activity> {
    const db = getDb();
    const [activity] = await db
      .insert(activities)
      .values({
        actorId: data.actorId,
        repoId: data.repoId,
        type: data.type,
        payload: data.payload ? JSON.stringify(data.payload) : null,
      })
      .returning();
    return activity;
  },

  /**
   * List activities for a repository
   */
  async listByRepo(
    repoId: string,
    limit = 50,
    offset = 0
  ): Promise<(Activity & { actor: Actor })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(activities)
      .innerJoin(user, eq(activities.actorId, user.id))
      .where(eq(activities.repoId, repoId))
      .orderBy(desc(activities.createdAt))
      .limit(limit)
      .offset(offset);

    return result.map((r) => ({
      ...r.activities,
      actor: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        username: r.user.username,
        image: r.user.image,
        avatarUrl: r.user.avatarUrl,
      },
    }));
  },

  /**
   * List activities by a user
   */
  async listByUser(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<(Activity & { repo?: Repository })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(activities)
      .leftJoin(repositories, eq(activities.repoId, repositories.id))
      .where(eq(activities.actorId, userId))
      .orderBy(desc(activities.createdAt))
      .limit(limit)
      .offset(offset);

    return result.map((r) => ({
      ...r.activities,
      repo: r.repositories ?? undefined,
    }));
  },

  /**
   * Get user's feed (activities from watched repos)
   */
  async getFeed(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<(Activity & { actor: Actor; repo?: Repository })[]> {
    const db = getDb();

    // Get watched repo IDs
    const watchedRepos = await db
      .select({ repoId: watches.repoId })
      .from(watches)
      .where(eq(watches.userId, userId));

    const repoIds = watchedRepos.map((w) => w.repoId);

    if (repoIds.length === 0) {
      return [];
    }

    const result = await db
      .select()
      .from(activities)
      .innerJoin(user, eq(activities.actorId, user.id))
      .leftJoin(repositories, eq(activities.repoId, repositories.id))
      .where(inArray(activities.repoId, repoIds))
      .orderBy(desc(activities.createdAt))
      .limit(limit)
      .offset(offset);

    return result.map((r) => ({
      ...r.activities,
      actor: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        username: r.user.username,
        image: r.user.image,
        avatarUrl: r.user.avatarUrl,
      },
      repo: r.repositories ?? undefined,
    }));
  },

  /**
   * Get public feed (all public repo activities)
   */
  async getPublicFeed(
    limit = 50,
    offset = 0
  ): Promise<(Activity & { actor: Actor; repo?: Repository })[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(activities)
      .innerJoin(user, eq(activities.actorId, user.id))
      .innerJoin(repositories, eq(activities.repoId, repositories.id))
      .where(eq(repositories.isPrivate, false))
      .orderBy(desc(activities.createdAt))
      .limit(limit)
      .offset(offset);

    return result.map((r) => ({
      ...r.activities,
      actor: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        username: r.user.username,
        image: r.user.image,
        avatarUrl: r.user.avatarUrl,
      },
      repo: r.repositories,
    }));
  },

  /**
   * Parse activity payload
   */
  parsePayload(activity: Activity): ActivityPayload | null {
    if (!activity.payload) return null;
    try {
      return JSON.parse(activity.payload) as ActivityPayload;
    } catch {
      return null;
    }
  },

  /**
   * Delete old activities (cleanup)
   */
  async deleteOlderThan(days: number): Promise<number> {
    const db = getDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await db
      .delete(activities)
      .where(eq(activities.createdAt, cutoffDate))
      .returning();
    
    return result.length;
  },
};

// Helper functions for creating specific activity types

export const activityHelpers = {
  async logPush(
    actorId: string,
    repoId: string,
    branch: string,
    commits: Array<{ sha: string; message: string }>
  ): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'push',
      payload: { branch, commits: commits.slice(0, 5) }, // Limit to 5 commits
    });
  },

  async logPrOpened(
    actorId: string,
    repoId: string,
    number: number,
    title: string
  ): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'pr_opened',
      payload: { number, title },
    });
  },

  async logPrMerged(
    actorId: string,
    repoId: string,
    number: number,
    title: string
  ): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'pr_merged',
      payload: { number, title },
    });
  },

  async logPrClosed(
    actorId: string,
    repoId: string,
    number: number,
    title: string
  ): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'pr_closed',
      payload: { number, title },
    });
  },

  async logIssueOpened(
    actorId: string,
    repoId: string,
    number: number,
    title: string
  ): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'issue_opened',
      payload: { number, title },
    });
  },

  async logIssueClosed(
    actorId: string,
    repoId: string,
    number: number,
    title: string
  ): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'issue_closed',
      payload: { number, title },
    });
  },

  async logRepoCreated(actorId: string, repoId: string): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'repo_created',
    });
  },

  async logRepoForked(
    actorId: string,
    repoId: string,
    forkedFromId: string,
    forkedFromName: string
  ): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'repo_forked',
      payload: { forkedFromId, forkedFromName },
    });
  },

  async logRepoStarred(
    actorId: string,
    repoId: string,
    repoName: string
  ): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'repo_starred',
      payload: { repoName },
    });
  },

  async logRepoTransferred(
    actorId: string,
    repoId: string,
    previousOwnerId: string,
    previousOwnerName: string,
    newOwnerId: string,
    newOwnerName: string
  ): Promise<Activity> {
    return activityModel.create({
      actorId,
      repoId,
      type: 'repo_transferred',
      payload: { previousOwnerId, previousOwnerName, newOwnerId, newOwnerName },
    });
  },
};
