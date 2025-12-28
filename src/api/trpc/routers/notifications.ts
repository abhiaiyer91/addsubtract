import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { notificationModel, emailPreferencesModel } from '../../../db/models';

export const notificationsRouter = router({
  /**
   * List notifications for the current user
   */
  list: protectedProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().optional().default(false),
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { unreadOnly, limit, offset } = input || {};
      return notificationModel.listByUser(ctx.user.id, {
        unreadOnly,
        limit,
        offset,
      });
    }),

  /**
   * Get unread notification count
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return notificationModel.countUnread(ctx.user.id);
  }),

  /**
   * Mark a notification as read
   */
  markAsRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return notificationModel.markAsRead(input.id, ctx.user.id);
    }),

  /**
   * Mark all notifications as read
   */
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    return notificationModel.markAllAsRead(ctx.user.id);
  }),

  /**
   * Delete a notification
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return notificationModel.delete(input.id, ctx.user.id);
    }),

  /**
   * Delete all notifications
   */
  deleteAll: protectedProcedure.mutation(async ({ ctx }) => {
    return notificationModel.deleteAll(ctx.user.id);
  }),

  // ============ Email Preferences ============

  /**
   * Get email notification preferences
   */
  getEmailPreferences: protectedProcedure.query(async ({ ctx }) => {
    return emailPreferencesModel.getOrCreate(ctx.user.id);
  }),

  /**
   * Update email notification preferences
   */
  updateEmailPreferences: protectedProcedure
    .input(
      z.object({
        emailEnabled: z.boolean().optional(),
        prReviewRequested: z.boolean().optional(),
        prReviewed: z.boolean().optional(),
        prMerged: z.boolean().optional(),
        prComment: z.boolean().optional(),
        issueAssigned: z.boolean().optional(),
        issueComment: z.boolean().optional(),
        mention: z.boolean().optional(),
        repoPush: z.boolean().optional(),
        repoStarred: z.boolean().optional(),
        repoForked: z.boolean().optional(),
        ciFailed: z.boolean().optional(),
        ciPassed: z.boolean().optional(),
        digestEnabled: z.boolean().optional(),
        digestFrequency: z.enum(['daily', 'weekly']).optional(),
        digestDay: z.number().min(0).max(6).optional(),
        digestHour: z.number().min(0).max(23).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return emailPreferencesModel.update(ctx.user.id, input);
    }),
});
