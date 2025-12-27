import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { notificationModel } from '../../../db/models';

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
});
