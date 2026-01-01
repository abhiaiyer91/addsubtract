/**
 * Wrapped tRPC Router
 * API endpoints for monthly activity insights (Spotify Wrapped-style)
 */

import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { wrappedModel } from '../../../db/models/wrapped';

export const wrappedRouter = router({
  /**
   * Get wrapped data for current user for a specific month
   */
  forMonth: protectedProcedure
    .input(
      z.object({
        year: z.number().min(2020).max(2100),
        month: z.number().min(1).max(12),
      })
    )
    .query(async ({ input, ctx }) => {
      return wrappedModel.getForUser(ctx.user.id, input.year, input.month);
    }),

  /**
   * Get wrapped data for a specific user (public profiles only)
   */
  forUser: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        year: z.number().min(2020).max(2100),
        month: z.number().min(1).max(12),
      })
    )
    .query(async ({ input }) => {
      return wrappedModel.getForUser(input.userId, input.year, input.month);
    }),

  /**
   * Get current month's wrapped for authenticated user
   */
  currentMonth: protectedProcedure.query(async ({ ctx }) => {
    return wrappedModel.getCurrentMonth(ctx.user.id);
  }),

  /**
   * Get previous month's wrapped for authenticated user
   */
  previousMonth: protectedProcedure.query(async ({ ctx }) => {
    return wrappedModel.getPreviousMonth(ctx.user.id);
  }),

  /**
   * Get list of available periods for current user
   */
  availablePeriods: protectedProcedure.query(async ({ ctx }) => {
    return wrappedModel.getAvailablePeriods(ctx.user.id);
  }),

  /**
   * Get list of available periods for any user (public)
   */
  periodsForUser: publicProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .query(async ({ input }) => {
      return wrappedModel.getAvailablePeriods(input.userId);
    }),

  /**
   * Get yearly wrapped summary for authenticated user
   */
  yearlyWrapped: protectedProcedure
    .input(
      z.object({
        year: z.number().min(2020).max(2100),
      })
    )
    .query(async ({ input, ctx }) => {
      return wrappedModel.getYearlyWrapped(ctx.user.id, input.year);
    }),

  /**
   * Get team wrapped data for a group of users
   */
  teamWrapped: protectedProcedure
    .input(
      z.object({
        userIds: z.array(z.string()).min(1).max(50),
        year: z.number().min(2020).max(2100),
        month: z.number().min(1).max(12),
        teamName: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return wrappedModel.getTeamWrapped(
        input.userIds,
        input.year,
        input.month,
        input.teamName
      );
    }),

  /**
   * Get custom period wrapped for authenticated user
   */
  customPeriod: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        periodLabel: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return wrappedModel.getForCustomPeriod(
        ctx.user.id,
        input.startDate,
        input.endDate,
        input.periodLabel
      );
    }),
});
