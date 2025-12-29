/**
 * Admin Model
 * 
 * Database operations for admin portal functionality:
 * - System stats and metrics
 * - User management (suspend, promote, etc.)
 * - Audit logging
 * - Feature flags
 */

import { eq, sql, desc, and, gte, lte, count, sum, like, or, isNull } from 'drizzle-orm';
import { getDb } from '..';
import { nanoid } from 'nanoid';
import { user } from '../auth-schema';
import { 
  adminAuditLogs, 
  systemSettings, 
  featureFlags, 
  systemMetricsSnapshots,
  loginAttempts,
} from '../admin-schema';
import { 
  repositories, 
  pullRequests, 
  issues, 
  organizations,
  workflowRuns,
  agentSessions,
  activities,
} from '../schema';
import type { UserRole } from '../auth-schema';

// ============ TYPES ============

export interface SystemStats {
  users: {
    total: number;
    active30Days: number;
    admins: number;
    suspended: number;
    newThisMonth: number;
  };
  repos: {
    total: number;
    public: number;
    private: number;
    newThisMonth: number;
  };
  prs: {
    total: number;
    open: number;
    merged: number;
    newThisMonth: number;
  };
  issues: {
    total: number;
    open: number;
    closed: number;
    newThisMonth: number;
  };
  orgs: {
    total: number;
    newThisMonth: number;
  };
  workflows: {
    totalRuns: number;
    successful: number;
    failed: number;
  };
  ai: {
    totalSessions: number;
    totalTokens: number;
  };
}

export interface UserWithStats {
  id: string;
  email: string;
  name: string;
  username: string | null;
  role: UserRole;
  suspended: boolean;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Stats
  repoCount: number;
  prCount: number;
  issueCount: number;
  lastActive: Date | null;
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminName?: string;
  adminEmail?: string;
  action: string;
  targetType: string;
  targetId: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AdminContext {
  adminId: string;
  ipAddress?: string;
  userAgent?: string;
}

// ============ SYSTEM STATS ============

/**
 * Get comprehensive system statistics
 */
export async function getSystemStats(): Promise<SystemStats> {
  const db = getDb();
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Run all queries in parallel
  const [
    userStats,
    repoStats,
    prStats,
    issueStats,
    orgStats,
    workflowStats,
    aiStats,
  ] = await Promise.all([
    // User stats
    db.select({
      total: count(),
      admins: sql<number>`count(*) filter (where ${user.role} in ('admin', 'superadmin'))`,
      suspended: sql<number>`count(*) filter (where ${user.suspended} = true)`,
      newThisMonth: sql<number>`count(*) filter (where ${user.createdAt} >= ${monthStart})`,
    }).from(user),

    // Repo stats
    db.select({
      total: count(),
      public: sql<number>`count(*) filter (where ${repositories.isPrivate} = false)`,
      private: sql<number>`count(*) filter (where ${repositories.isPrivate} = true)`,
      newThisMonth: sql<number>`count(*) filter (where ${repositories.createdAt} >= ${monthStart})`,
    }).from(repositories),

    // PR stats
    db.select({
      total: count(),
      open: sql<number>`count(*) filter (where ${pullRequests.state} = 'open')`,
      merged: sql<number>`count(*) filter (where ${pullRequests.state} = 'merged')`,
      newThisMonth: sql<number>`count(*) filter (where ${pullRequests.createdAt} >= ${monthStart})`,
    }).from(pullRequests),

    // Issue stats
    db.select({
      total: count(),
      open: sql<number>`count(*) filter (where ${issues.state} = 'open')`,
      closed: sql<number>`count(*) filter (where ${issues.state} = 'closed')`,
      newThisMonth: sql<number>`count(*) filter (where ${issues.createdAt} >= ${monthStart})`,
    }).from(issues),

    // Org stats
    db.select({
      total: count(),
      newThisMonth: sql<number>`count(*) filter (where ${organizations.createdAt} >= ${monthStart})`,
    }).from(organizations),

    // Workflow stats
    db.select({
      totalRuns: count(),
      successful: sql<number>`count(*) filter (where ${workflowRuns.conclusion} = 'success')`,
      failed: sql<number>`count(*) filter (where ${workflowRuns.conclusion} = 'failure')`,
    }).from(workflowRuns),

    // AI stats (token usage now tracked in Mastra Memory)
    db.select({ count: count() }).from(agentSessions),
  ]);

  // Calculate active users (users with activity in last 30 days)
  const activeUsersResult = await db
    .select({ count: sql<number>`count(distinct ${activities.actorId})` })
    .from(activities)
    .where(gte(activities.createdAt, thirtyDaysAgo));

  return {
    users: {
      total: userStats[0]?.total ?? 0,
      active30Days: activeUsersResult[0]?.count ?? 0,
      admins: userStats[0]?.admins ?? 0,
      suspended: userStats[0]?.suspended ?? 0,
      newThisMonth: userStats[0]?.newThisMonth ?? 0,
    },
    repos: {
      total: repoStats[0]?.total ?? 0,
      public: repoStats[0]?.public ?? 0,
      private: repoStats[0]?.private ?? 0,
      newThisMonth: repoStats[0]?.newThisMonth ?? 0,
    },
    prs: {
      total: prStats[0]?.total ?? 0,
      open: prStats[0]?.open ?? 0,
      merged: prStats[0]?.merged ?? 0,
      newThisMonth: prStats[0]?.newThisMonth ?? 0,
    },
    issues: {
      total: issueStats[0]?.total ?? 0,
      open: issueStats[0]?.open ?? 0,
      closed: issueStats[0]?.closed ?? 0,
      newThisMonth: issueStats[0]?.newThisMonth ?? 0,
    },
    orgs: {
      total: orgStats[0]?.total ?? 0,
      newThisMonth: orgStats[0]?.newThisMonth ?? 0,
    },
    workflows: {
      totalRuns: workflowStats[0]?.totalRuns ?? 0,
      successful: workflowStats[0]?.successful ?? 0,
      failed: workflowStats[0]?.failed ?? 0,
    },
    ai: {
      totalSessions: aiStats[0]?.count ?? 0,
      totalTokens: 0, // Now tracked in Mastra Memory
    },
  };
}

/**
 * Get daily activity data for charts (last N days)
 */
export async function getDailyActivity(days: number = 30): Promise<{
  date: string;
  users: number;
  repos: number;
  prs: number;
  issues: number;
}[]> {
  const db = getDb();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await db.execute(sql`
    WITH date_series AS (
      SELECT generate_series(
        ${startDate}::date,
        CURRENT_DATE,
        '1 day'::interval
      )::date AS date
    )
    SELECT 
      ds.date::text as date,
      COALESCE((SELECT count(*) FROM "user" WHERE created_at::date = ds.date), 0) as users,
      COALESCE((SELECT count(*) FROM repositories WHERE created_at::date = ds.date), 0) as repos,
      COALESCE((SELECT count(*) FROM pull_requests WHERE created_at::date = ds.date), 0) as prs,
      COALESCE((SELECT count(*) FROM issues WHERE created_at::date = ds.date), 0) as issues
    FROM date_series ds
    ORDER BY ds.date
  `);

  return result.rows as {
    date: string;
    users: number;
    repos: number;
    prs: number;
    issues: number;
  }[];
}

// ============ USER MANAGEMENT ============

/**
 * List all users with pagination and filtering
 */
export async function listUsers(options: {
  limit?: number;
  offset?: number;
  search?: string;
  role?: UserRole;
  suspended?: boolean;
  sortBy?: 'createdAt' | 'name' | 'email';
  sortOrder?: 'asc' | 'desc';
}): Promise<{ users: UserWithStats[]; total: number }> {
  const db = getDb();
  const { limit = 50, offset = 0, search, role, suspended, sortBy = 'createdAt', sortOrder = 'desc' } = options;

  // Build conditions
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(user.email, `%${search}%`),
        like(user.name, `%${search}%`),
        like(user.username, `%${search}%`)
      )
    );
  }
  if (role) {
    conditions.push(eq(user.role, role));
  }
  if (suspended !== undefined) {
    conditions.push(eq(user.suspended, suspended));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [countResult] = await db
    .select({ count: count() })
    .from(user)
    .where(whereClause);

  // Get users with stats
  const users = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      suspended: user.suspended,
      suspendedAt: user.suspendedAt,
      suspendedReason: user.suspendedReason,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(whereClause)
    .orderBy(sortOrder === 'desc' ? desc(user[sortBy]) : user[sortBy])
    .limit(limit)
    .offset(offset);

  // Get stats for each user
  const usersWithStats: UserWithStats[] = await Promise.all(
    users.map(async (u) => {
      const [repoCount] = await db
        .select({ count: count() })
        .from(repositories)
        .where(eq(repositories.ownerId, u.id));

      const [prCount] = await db
        .select({ count: count() })
        .from(pullRequests)
        .where(eq(pullRequests.authorId, u.id));

      const [issueCount] = await db
        .select({ count: count() })
        .from(issues)
        .where(eq(issues.authorId, u.id));

      const [lastActivity] = await db
        .select({ createdAt: activities.createdAt })
        .from(activities)
        .where(eq(activities.actorId, u.id))
        .orderBy(desc(activities.createdAt))
        .limit(1);

      return {
        ...u,
        role: (u.role as UserRole) || 'user',
        repoCount: repoCount?.count ?? 0,
        prCount: prCount?.count ?? 0,
        issueCount: issueCount?.count ?? 0,
        lastActive: lastActivity?.createdAt ?? null,
      };
    })
  );

  return { users: usersWithStats, total: countResult?.count ?? 0 };
}

/**
 * Get a single user by ID with detailed stats
 */
export async function getUserById(userId: string): Promise<UserWithStats | null> {
  const db = getDb();
  
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) return null;

  const [repoCount] = await db
    .select({ count: count() })
    .from(repositories)
    .where(eq(repositories.ownerId, u.id));

  const [prCount] = await db
    .select({ count: count() })
    .from(pullRequests)
    .where(eq(pullRequests.authorId, u.id));

  const [issueCount] = await db
    .select({ count: count() })
    .from(issues)
    .where(eq(issues.authorId, u.id));

  const [lastActivity] = await db
    .select({ createdAt: activities.createdAt })
    .from(activities)
    .where(eq(activities.actorId, u.id))
    .orderBy(desc(activities.createdAt))
    .limit(1);

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    username: u.username,
    role: (u.role as UserRole) || 'user',
    suspended: u.suspended,
    suspendedAt: u.suspendedAt,
    suspendedReason: u.suspendedReason,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    repoCount: repoCount?.count ?? 0,
    prCount: prCount?.count ?? 0,
    issueCount: issueCount?.count ?? 0,
    lastActive: lastActivity?.createdAt ?? null,
  };
}

/**
 * Update a user's role
 */
export async function updateUserRole(
  userId: string, 
  newRole: UserRole, 
  ctx: AdminContext
): Promise<void> {
  const db = getDb();
  
  const [currentUser] = await db.select().from(user).where(eq(user.id, userId));
  if (!currentUser) {
    throw new Error('User not found');
  }

  await db.update(user).set({ role: newRole }).where(eq(user.id, userId));

  await createAuditLog({
    adminId: ctx.adminId,
    action: 'user.role_changed',
    targetType: 'user',
    targetId: userId,
    description: `Changed user role from ${currentUser.role} to ${newRole}`,
    metadata: { 
      previousRole: currentUser.role, 
      newRole,
      userEmail: currentUser.email,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Suspend a user
 */
export async function suspendUser(
  userId: string, 
  reason: string, 
  ctx: AdminContext
): Promise<void> {
  const db = getDb();
  
  const [currentUser] = await db.select().from(user).where(eq(user.id, userId));
  if (!currentUser) {
    throw new Error('User not found');
  }

  if (currentUser.suspended) {
    throw new Error('User is already suspended');
  }

  await db.update(user).set({
    suspended: true,
    suspendedAt: new Date(),
    suspendedReason: reason,
  }).where(eq(user.id, userId));

  await createAuditLog({
    adminId: ctx.adminId,
    action: 'user.suspended',
    targetType: 'user',
    targetId: userId,
    description: `Suspended user: ${reason}`,
    metadata: { 
      reason,
      userEmail: currentUser.email,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Unsuspend a user
 */
export async function unsuspendUser(
  userId: string, 
  ctx: AdminContext
): Promise<void> {
  const db = getDb();
  
  const [currentUser] = await db.select().from(user).where(eq(user.id, userId));
  if (!currentUser) {
    throw new Error('User not found');
  }

  if (!currentUser.suspended) {
    throw new Error('User is not suspended');
  }

  await db.update(user).set({
    suspended: false,
    suspendedAt: null,
    suspendedReason: null,
  }).where(eq(user.id, userId));

  await createAuditLog({
    adminId: ctx.adminId,
    action: 'user.unsuspended',
    targetType: 'user',
    targetId: userId,
    description: `Unsuspended user`,
    metadata: { 
      previousReason: currentUser.suspendedReason,
      userEmail: currentUser.email,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Check if a user is an admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const db = getDb();
  const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  return u?.role === 'admin' || u?.role === 'superadmin';
}

/**
 * Check if a user is a superadmin
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const db = getDb();
  const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  return u?.role === 'superadmin';
}

// ============ AUDIT LOGGING ============

/**
 * Create an audit log entry
 */
export async function createAuditLog(entry: {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<string> {
  const db = getDb();
  const id = nanoid();

  await db.insert(adminAuditLogs).values({
    id,
    adminId: entry.adminId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    description: entry.description,
    metadata: entry.metadata ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  });

  return id;
}

/**
 * Get audit logs with pagination and filtering
 */
export async function getAuditLogs(options: {
  limit?: number;
  offset?: number;
  adminId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const db = getDb();
  const { limit = 50, offset = 0, adminId, action, targetType, targetId, startDate, endDate } = options;

  const conditions = [];
  if (adminId) conditions.push(eq(adminAuditLogs.adminId, adminId));
  if (action) conditions.push(eq(adminAuditLogs.action, action));
  if (targetType) conditions.push(eq(adminAuditLogs.targetType, targetType));
  if (targetId) conditions.push(eq(adminAuditLogs.targetId, targetId));
  if (startDate) conditions.push(gte(adminAuditLogs.createdAt, startDate));
  if (endDate) conditions.push(lte(adminAuditLogs.createdAt, endDate));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: count() })
    .from(adminAuditLogs)
    .where(whereClause);

  const logs = await db
    .select({
      id: adminAuditLogs.id,
      adminId: adminAuditLogs.adminId,
      adminName: user.name,
      adminEmail: user.email,
      action: adminAuditLogs.action,
      targetType: adminAuditLogs.targetType,
      targetId: adminAuditLogs.targetId,
      description: adminAuditLogs.description,
      metadata: adminAuditLogs.metadata,
      ipAddress: adminAuditLogs.ipAddress,
      userAgent: adminAuditLogs.userAgent,
      createdAt: adminAuditLogs.createdAt,
    })
    .from(adminAuditLogs)
    .leftJoin(user, eq(adminAuditLogs.adminId, user.id))
    .where(whereClause)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return { logs: logs as AuditLogEntry[], total: countResult?.count ?? 0 };
}

// ============ REPOSITORY MANAGEMENT ============

/**
 * List all repositories with admin view
 */
export async function listRepositories(options: {
  limit?: number;
  offset?: number;
  search?: string;
  isPrivate?: boolean;
  sortBy?: 'createdAt' | 'name' | 'starsCount';
  sortOrder?: 'asc' | 'desc';
}): Promise<{ repos: typeof repositories.$inferSelect[]; total: number }> {
  const db = getDb();
  const { limit = 50, offset = 0, search, isPrivate, sortBy = 'createdAt', sortOrder = 'desc' } = options;

  const conditions = [];
  if (search) {
    conditions.push(like(repositories.name, `%${search}%`));
  }
  if (isPrivate !== undefined) {
    conditions.push(eq(repositories.isPrivate, isPrivate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: count() })
    .from(repositories)
    .where(whereClause);

  const repos = await db
    .select()
    .from(repositories)
    .where(whereClause)
    .orderBy(sortOrder === 'desc' ? desc(repositories[sortBy]) : repositories[sortBy])
    .limit(limit)
    .offset(offset);

  return { repos, total: countResult?.count ?? 0 };
}

// ============ FEATURE FLAGS ============

/**
 * Get all feature flags
 */
export async function getFeatureFlags(): Promise<typeof featureFlags.$inferSelect[]> {
  const db = getDb();
  return db.select().from(featureFlags).orderBy(featureFlags.name);
}

/**
 * Create or update a feature flag
 */
export async function upsertFeatureFlag(
  flag: {
    name: string;
    description?: string;
    enabled: boolean;
    rolloutPercentage?: number;
    allowedUsers?: string[];
    blockedUsers?: string[];
  },
  ctx: AdminContext
): Promise<void> {
  const db = getDb();
  
  const existing = await db
    .select()
    .from(featureFlags)
    .where(eq(featureFlags.name, flag.name))
    .limit(1);

  if (existing.length > 0) {
    await db.update(featureFlags)
      .set({
        description: flag.description,
        enabled: flag.enabled,
        rolloutPercentage: flag.rolloutPercentage ?? 0,
        allowedUsers: flag.allowedUsers ?? [],
        blockedUsers: flag.blockedUsers ?? [],
      })
      .where(eq(featureFlags.name, flag.name));

    await createAuditLog({
      adminId: ctx.adminId,
      action: 'feature_flag.updated',
      targetType: 'feature_flag',
      targetId: flag.name,
      description: `Updated feature flag: ${flag.name}`,
      metadata: { enabled: flag.enabled, rolloutPercentage: flag.rolloutPercentage },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  } else {
    await db.insert(featureFlags).values({
      id: nanoid(),
      name: flag.name,
      description: flag.description,
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage ?? 0,
      allowedUsers: flag.allowedUsers ?? [],
      blockedUsers: flag.blockedUsers ?? [],
      createdBy: ctx.adminId,
    });

    await createAuditLog({
      adminId: ctx.adminId,
      action: 'feature_flag.created',
      targetType: 'feature_flag',
      targetId: flag.name,
      description: `Created feature flag: ${flag.name}`,
      metadata: { enabled: flag.enabled },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }
}

/**
 * Delete a feature flag
 */
export async function deleteFeatureFlag(name: string, ctx: AdminContext): Promise<void> {
  const db = getDb();
  
  await db.delete(featureFlags).where(eq(featureFlags.name, name));

  await createAuditLog({
    adminId: ctx.adminId,
    action: 'feature_flag.deleted',
    targetType: 'feature_flag',
    targetId: name,
    description: `Deleted feature flag: ${name}`,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Check if a feature flag is enabled for a user
 */
export async function isFeatureEnabled(flagName: string, userId?: string): Promise<boolean> {
  const db = getDb();
  
  const [flag] = await db
    .select()
    .from(featureFlags)
    .where(eq(featureFlags.name, flagName))
    .limit(1);

  if (!flag) return false;
  if (!flag.enabled) return false;

  // Check blocked users
  if (userId && flag.blockedUsers?.includes(userId)) {
    return false;
  }

  // Check allowed users
  if (userId && flag.allowedUsers?.includes(userId)) {
    return true;
  }

  // Check rollout percentage
  if (flag.rolloutPercentage === 100) return true;
  if (flag.rolloutPercentage === 0) return false;

  // Simple deterministic rollout based on user ID hash
  if (userId) {
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (hash % 100) < (flag.rolloutPercentage ?? 0);
  }

  return false;
}

// ============ SYSTEM SETTINGS ============

/**
 * Get a system setting
 */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const db = getDb();
  const [result] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  
  return result?.value as T ?? null;
}

/**
 * Set a system setting
 */
export async function setSetting(
  key: string, 
  value: unknown, 
  description: string | undefined,
  ctx: AdminContext
): Promise<void> {
  const db = getDb();
  
  const existing = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db.update(systemSettings)
      .set({ value, description, updatedBy: ctx.adminId })
      .where(eq(systemSettings.key, key));
  } else {
    await db.insert(systemSettings).values({
      key,
      value,
      description,
      updatedBy: ctx.adminId,
    });
  }

  await createAuditLog({
    adminId: ctx.adminId,
    action: 'system_setting.updated',
    targetType: 'system_setting',
    targetId: key,
    description: `Updated system setting: ${key}`,
    metadata: { value },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Get all system settings
 */
export async function getAllSettings(): Promise<typeof systemSettings.$inferSelect[]> {
  const db = getDb();
  return db.select().from(systemSettings);
}

// ============ LOGIN ATTEMPTS ============

/**
 * Get recent login attempts
 */
export async function getLoginAttempts(options: {
  limit?: number;
  offset?: number;
  email?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
}): Promise<{ attempts: typeof loginAttempts.$inferSelect[]; total: number }> {
  const db = getDb();
  const { limit = 50, offset = 0, email, success, startDate, endDate } = options;

  const conditions = [];
  if (email) conditions.push(like(loginAttempts.email, `%${email}%`));
  if (success !== undefined) conditions.push(eq(loginAttempts.success, success));
  if (startDate) conditions.push(gte(loginAttempts.createdAt, startDate));
  if (endDate) conditions.push(lte(loginAttempts.createdAt, endDate));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: count() })
    .from(loginAttempts)
    .where(whereClause);

  const attempts = await db
    .select()
    .from(loginAttempts)
    .where(whereClause)
    .orderBy(desc(loginAttempts.createdAt))
    .limit(limit)
    .offset(offset);

  return { attempts, total: countResult?.count ?? 0 };
}

// Export the model
export const adminModel = {
  // Stats
  getSystemStats,
  getDailyActivity,
  
  // Users
  listUsers,
  getUserById,
  updateUserRole,
  suspendUser,
  unsuspendUser,
  isAdmin,
  isSuperAdmin,
  
  // Audit
  createAuditLog,
  getAuditLogs,
  
  // Repos
  listRepositories,
  
  // Feature flags
  getFeatureFlags,
  upsertFeatureFlag,
  deleteFeatureFlag,
  isFeatureEnabled,
  
  // Settings
  getSetting,
  setSetting,
  getAllSettings,
  
  // Login attempts
  getLoginAttempts,
};
