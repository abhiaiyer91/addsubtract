import { eq } from 'drizzle-orm';
import { getDb } from '../index';
import { 
  emailNotificationPreferences, 
  type EmailNotificationPreferences, 
  type NewEmailNotificationPreferences,
  type Notification,
} from '../schema';

// Type for notification type to preference field mapping
type NotificationType = Notification['type'];

// Map notification types to preference field names
const NOTIFICATION_TYPE_TO_PREFERENCE: Record<NotificationType, keyof Omit<EmailNotificationPreferences, 'id' | 'userId' | 'emailEnabled' | 'digestEnabled' | 'digestFrequency' | 'digestDay' | 'digestHour' | 'createdAt' | 'updatedAt'>> = {
  pr_review_requested: 'prReviewRequested',
  pr_reviewed: 'prReviewed',
  pr_merged: 'prMerged',
  pr_comment: 'prComment',
  issue_assigned: 'issueAssigned',
  issue_comment: 'issueComment',
  mention: 'mention',
  repo_push: 'repoPush',
  repo_starred: 'repoStarred',
  repo_forked: 'repoForked',
  ci_failed: 'ciFailed',
  ci_passed: 'ciPassed',
};

// Default preferences for new users
const DEFAULT_PREFERENCES: Omit<NewEmailNotificationPreferences, 'userId'> = {
  emailEnabled: true,
  prReviewRequested: true,
  prReviewed: true,
  prMerged: true,
  prComment: true,
  issueAssigned: true,
  issueComment: true,
  mention: true,
  repoPush: false,
  repoStarred: false,
  repoForked: true,
  ciFailed: true,
  ciPassed: false,
  digestEnabled: false,
  digestFrequency: 'daily',
  digestDay: 1,
  digestHour: 9,
};

export const emailPreferencesModel = {
  /**
   * Get email preferences for a user
   * Creates default preferences if none exist
   */
  async getOrCreate(userId: string): Promise<EmailNotificationPreferences> {
    const db = getDb();
    
    // Try to get existing preferences
    const [existing] = await db
      .select()
      .from(emailNotificationPreferences)
      .where(eq(emailNotificationPreferences.userId, userId))
      .limit(1);
    
    if (existing) {
      return existing;
    }
    
    // Create default preferences
    const [created] = await db
      .insert(emailNotificationPreferences)
      .values({ userId, ...DEFAULT_PREFERENCES })
      .returning();
    
    return created;
  },

  /**
   * Get email preferences for a user (returns null if not set)
   */
  async get(userId: string): Promise<EmailNotificationPreferences | null> {
    const db = getDb();
    
    const [existing] = await db
      .select()
      .from(emailNotificationPreferences)
      .where(eq(emailNotificationPreferences.userId, userId))
      .limit(1);
    
    return existing || null;
  },

  /**
   * Update email preferences for a user
   */
  async update(
    userId: string,
    updates: Partial<Omit<EmailNotificationPreferences, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<EmailNotificationPreferences> {
    const db = getDb();
    
    // Ensure preferences exist first
    await this.getOrCreate(userId);
    
    const [updated] = await db
      .update(emailNotificationPreferences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(emailNotificationPreferences.userId, userId))
      .returning();
    
    return updated;
  },

  /**
   * Check if a user should receive email for a notification type
   */
  async shouldSendEmail(userId: string, notificationType: NotificationType): Promise<boolean> {
    const prefs = await this.get(userId);
    
    // Default to true for high-priority notifications if no preferences set
    if (!prefs) {
      const defaultsToTrue = ['pr_review_requested', 'pr_reviewed', 'issue_assigned', 'mention', 'ci_failed'];
      return defaultsToTrue.includes(notificationType);
    }
    
    // Check master switch
    if (!prefs.emailEnabled) {
      return false;
    }
    
    // Check specific notification type preference
    const prefField = NOTIFICATION_TYPE_TO_PREFERENCE[notificationType];
    return Boolean(prefs[prefField]);
  },

  /**
   * Get users who have digest enabled
   */
  async getUsersWithDigestEnabled(frequency: 'daily' | 'weekly'): Promise<EmailNotificationPreferences[]> {
    const db = getDb();
    
    const results = await db
      .select()
      .from(emailNotificationPreferences)
      .where(eq(emailNotificationPreferences.digestEnabled, true));
    
    return results.filter(p => p.digestFrequency === frequency);
  },
};
