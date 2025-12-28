/**
 * Admin Portal Database Schema
 * 
 * Tables for admin-specific functionality:
 * - Audit logs for tracking admin actions
 * - System settings for configuration
 * - Feature flags
 */

import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, jsonb, integer } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

/**
 * Admin Audit Logs
 * Tracks all administrative actions for compliance and debugging
 */
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    // Who performed the action
    adminId: text("admin_id")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),
    // Type of action performed
    action: text("action").notNull(), // e.g., 'user.suspend', 'user.unsuspend', 'repo.delete', etc.
    // Target entity type
    targetType: text("target_type").notNull(), // 'user', 'repo', 'org', 'system'
    // Target entity ID (if applicable)
    targetId: text("target_id"),
    // Human-readable description
    description: text("description").notNull(),
    // Additional metadata as JSON
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    // IP address of the admin
    ipAddress: text("ip_address"),
    // User agent
    userAgent: text("user_agent"),
    // Timestamp
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("admin_audit_logs_admin_id_idx").on(table.adminId),
    index("admin_audit_logs_action_idx").on(table.action),
    index("admin_audit_logs_target_type_idx").on(table.targetType),
    index("admin_audit_logs_target_id_idx").on(table.targetId),
    index("admin_audit_logs_created_at_idx").on(table.createdAt),
  ]
);

/**
 * System Settings
 * Key-value store for system-wide configuration
 */
export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

/**
 * Feature Flags
 * Toggle features on/off for the entire system or specific users
 */
export const featureFlags = pgTable(
  "feature_flags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description"),
    // Whether the flag is enabled globally
    enabled: boolean("enabled").default(false).notNull(),
    // Percentage rollout (0-100)
    rolloutPercentage: integer("rollout_percentage").default(0),
    // Specific user IDs that have access regardless of rollout
    allowedUsers: jsonb("allowed_users").$type<string[]>().default([]),
    // Specific user IDs that are blocked regardless of rollout
    blockedUsers: jsonb("blocked_users").$type<string[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [index("feature_flags_name_idx").on(table.name)]
);

/**
 * System Metrics Snapshots
 * Periodic snapshots of system metrics for historical tracking
 */
export const systemMetricsSnapshots = pgTable(
  "system_metrics_snapshots",
  {
    id: text("id").primaryKey(),
    // Snapshot timestamp
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    // Metrics data
    totalUsers: integer("total_users").default(0).notNull(),
    activeUsers: integer("active_users").default(0).notNull(), // Active in last 30 days
    totalRepos: integer("total_repos").default(0).notNull(),
    publicRepos: integer("public_repos").default(0).notNull(),
    privateRepos: integer("private_repos").default(0).notNull(),
    totalOrgs: integer("total_orgs").default(0).notNull(),
    totalPrs: integer("total_prs").default(0).notNull(),
    totalIssues: integer("total_issues").default(0).notNull(),
    totalCommits: integer("total_commits").default(0).notNull(),
    // CI metrics
    totalWorkflowRuns: integer("total_workflow_runs").default(0).notNull(),
    successfulWorkflowRuns: integer("successful_workflow_runs").default(0).notNull(),
    failedWorkflowRuns: integer("failed_workflow_runs").default(0).notNull(),
    // AI metrics
    totalAgentSessions: integer("total_agent_sessions").default(0).notNull(),
    totalAgentTokens: integer("total_agent_tokens").default(0).notNull(),
    // Storage metrics (in bytes)
    totalStorageUsed: text("total_storage_used"), // Using text for bigint compatibility
  },
  (table) => [index("system_metrics_snapshots_timestamp_idx").on(table.timestamp)]
);

/**
 * Login Attempts
 * Track login attempts for security monitoring
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    success: boolean("success").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("login_attempts_email_idx").on(table.email),
    index("login_attempts_user_id_idx").on(table.userId),
    index("login_attempts_ip_address_idx").on(table.ipAddress),
    index("login_attempts_created_at_idx").on(table.createdAt),
  ]
);

// Relations
export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  admin: one(user, {
    fields: [adminAuditLogs.adminId],
    references: [user.id],
  }),
}));

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  updatedByUser: one(user, {
    fields: [systemSettings.updatedBy],
    references: [user.id],
  }),
}));

export const featureFlagsRelations = relations(featureFlags, ({ one }) => ({
  createdByUser: one(user, {
    fields: [featureFlags.createdBy],
    references: [user.id],
  }),
}));

export const loginAttemptsRelations = relations(loginAttempts, ({ one }) => ({
  user: one(user, {
    fields: [loginAttempts.userId],
    references: [user.id],
  }),
}));
