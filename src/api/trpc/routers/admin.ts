/**
 * Admin Router
 *
 * Provides admin-only endpoints for:
 * - System statistics and health
 * - User management (suspend, promote, etc.)
 * - Repository management
 * - Audit logs
 * - Feature flags
 * - System settings
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, middleware } from '../trpc';
import { TRPCError } from '@trpc/server';
import { adminModel } from '../../../db/models/admin';
import { healthCheck, getPool } from '../../../db';
import type { UserRole } from '../../../db/auth-schema';

// ============ ADMIN MIDDLEWARE ============

/**
 * Middleware that checks if user is an admin
 */
const isAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  const isUserAdmin = await adminModel.isAdmin(ctx.user.id);
  if (!isUserAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      admin: { id: ctx.user.id },
    },
  });
});

/**
 * Middleware that checks if user is a superadmin
 */
const isSuperAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  const isUserSuperAdmin = await adminModel.isSuperAdmin(ctx.user.id);
  if (!isUserSuperAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Superadmin access required' });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      admin: { id: ctx.user.id },
    },
  });
});

/**
 * Protected procedure that requires admin access
 */
const adminProcedure = protectedProcedure.use(isAdmin);

/**
 * Protected procedure that requires superadmin access
 */
const superAdminProcedure = protectedProcedure.use(isSuperAdmin);

// ============ ROUTER ============

export const adminRouter = router({
  // ============ AUTHENTICATION ============
  
  /**
   * Check if current user is an admin
   */
  checkAccess: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = await adminModel.isAdmin(ctx.user.id);
    const isSuperAdmin = await adminModel.isSuperAdmin(ctx.user.id);
    return { isAdmin, isSuperAdmin };
  }),

  // ============ SYSTEM STATS ============

  /**
   * Get comprehensive system statistics
   */
  getStats: adminProcedure.query(async () => {
    return adminModel.getSystemStats();
  }),

  /**
   * Get daily activity data for charts
   */
  getDailyActivity: adminProcedure
    .input(
      z.object({
        days: z.number().min(7).max(90).default(30),
      }).optional()
    )
    .query(async ({ input }) => {
      return adminModel.getDailyActivity(input?.days ?? 30);
    }),

  /**
   * Get system health status
   */
  getHealth: adminProcedure.query(async () => {
    const dbHealth = await healthCheck();
    const pool = getPool();
    
    return {
      database: {
        ok: dbHealth.ok,
        latency: dbHealth.latency,
        poolSize: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingConnections: pool.waitingCount,
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
      },
    };
  }),

  // ============ USER MANAGEMENT ============

  /**
   * List all users with pagination and filtering
   */
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        search: z.string().optional(),
        role: z.enum(['user', 'admin', 'superadmin']).optional(),
        suspended: z.boolean().optional(),
        sortBy: z.enum(['createdAt', 'name', 'email']).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }).optional()
    )
    .query(async ({ input }) => {
      return adminModel.listUsers(input ?? {});
    }),

  /**
   * Get a single user by ID
   */
  getUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const user = await adminModel.getUserById(input.userId);
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      return user;
    }),

  /**
   * Update a user's role (superadmin only)
   */
  updateUserRole: superAdminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(['user', 'admin', 'superadmin']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Prevent self-demotion
      if (input.userId === ctx.user.id && input.role !== 'superadmin') {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Cannot change your own role' 
        });
      }

      await adminModel.updateUserRole(input.userId, input.role as UserRole, {
        adminId: ctx.user.id,
        ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        userAgent: ctx.req.headers.get('user-agent') ?? undefined,
      });

      return { success: true };
    }),

  /**
   * Suspend a user
   */
  suspendUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        reason: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Prevent self-suspension
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Cannot suspend yourself' 
        });
      }

      // Check if target is a superadmin (only superadmins can suspend other admins)
      const targetUser = await adminModel.getUserById(input.userId);
      if (targetUser?.role === 'superadmin') {
        const isSuperAdmin = await adminModel.isSuperAdmin(ctx.user.id);
        if (!isSuperAdmin) {
          throw new TRPCError({ 
            code: 'FORBIDDEN', 
            message: 'Only superadmins can suspend other superadmins' 
          });
        }
      }

      await adminModel.suspendUser(input.userId, input.reason, {
        adminId: ctx.user.id,
        ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        userAgent: ctx.req.headers.get('user-agent') ?? undefined,
      });

      return { success: true };
    }),

  /**
   * Unsuspend a user
   */
  unsuspendUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await adminModel.unsuspendUser(input.userId, {
        adminId: ctx.user.id,
        ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        userAgent: ctx.req.headers.get('user-agent') ?? undefined,
      });

      return { success: true };
    }),

  // ============ REPOSITORY MANAGEMENT ============

  /**
   * List all repositories
   */
  listRepositories: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        search: z.string().optional(),
        isPrivate: z.boolean().optional(),
        sortBy: z.enum(['createdAt', 'name', 'starsCount']).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }).optional()
    )
    .query(async ({ input }) => {
      return adminModel.listRepositories(input ?? {});
    }),

  // ============ AUDIT LOGS ============

  /**
   * Get audit logs
   */
  getAuditLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        adminId: z.string().optional(),
        action: z.string().optional(),
        targetType: z.string().optional(),
        targetId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return adminModel.getAuditLogs(input ?? {});
    }),

  // ============ FEATURE FLAGS ============

  /**
   * Get all feature flags
   */
  getFeatureFlags: adminProcedure.query(async () => {
    return adminModel.getFeatureFlags();
  }),

  /**
   * Create or update a feature flag
   */
  upsertFeatureFlag: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        enabled: z.boolean(),
        rolloutPercentage: z.number().min(0).max(100).optional(),
        allowedUsers: z.array(z.string()).optional(),
        blockedUsers: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await adminModel.upsertFeatureFlag(input, {
        adminId: ctx.user.id,
        ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        userAgent: ctx.req.headers.get('user-agent') ?? undefined,
      });

      return { success: true };
    }),

  /**
   * Delete a feature flag
   */
  deleteFeatureFlag: adminProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await adminModel.deleteFeatureFlag(input.name, {
        adminId: ctx.user.id,
        ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        userAgent: ctx.req.headers.get('user-agent') ?? undefined,
      });

      return { success: true };
    }),

  /**
   * Check if a feature is enabled
   */
  checkFeature: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input, ctx }) => {
      const enabled = await adminModel.isFeatureEnabled(input.name, ctx.user?.id);
      return { enabled };
    }),

  // ============ SYSTEM SETTINGS ============

  /**
   * Get all system settings
   */
  getSettings: adminProcedure.query(async () => {
    return adminModel.getAllSettings();
  }),

  /**
   * Get a single setting
   */
  getSetting: adminProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const value = await adminModel.getSetting(input.key);
      return { key: input.key, value };
    }),

  /**
   * Set a system setting (superadmin only)
   */
  setSetting: superAdminProcedure
    .input(
      z.object({
        key: z.string().min(1).max(100),
        value: z.unknown(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await adminModel.setSetting(input.key, input.value, input.description, {
        adminId: ctx.user.id,
        ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        userAgent: ctx.req.headers.get('user-agent') ?? undefined,
      });

      return { success: true };
    }),

  // ============ SECURITY ============

  /**
   * Get login attempts
   */
  getLoginAttempts: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        email: z.string().optional(),
        success: z.boolean().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return adminModel.getLoginAttempts(input ?? {});
    }),
});
