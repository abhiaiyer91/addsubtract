import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// =============================================================================
// Enums
// =============================================================================

export const milestoneStateEnum = pgEnum("milestone_state", ["open", "closed"]);

export const issueStateEnum = pgEnum("issue_state", ["open", "closed"]);

export const pullRequestStateEnum = pgEnum("pull_request_state", [
  "open",
  "closed",
  "merged",
]);

// =============================================================================
// Tables
// =============================================================================

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  description: text("description"),
  isPrivate: boolean("is_private").notNull().default(false),
  ownerId: uuid("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  state: milestoneStateEnum("state").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const issues = pgTable("issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  state: issueStateEnum("state").notNull().default("open"),
  authorId: uuid("author_id").notNull(),
  milestoneId: uuid("milestone_id").references(() => milestones.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const pullRequests = pgTable("pull_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  state: pullRequestStateEnum("state").notNull().default("open"),
  authorId: uuid("author_id").notNull(),
  sourceBranch: text("source_branch").notNull(),
  targetBranch: text("target_branch").notNull(),
  milestoneId: uuid("milestone_id").references(() => milestones.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  mergedAt: timestamp("merged_at", { withTimezone: true }),
});

// =============================================================================
// Relations
// =============================================================================

export const repositoriesRelations = relations(repositories, ({ many }) => ({
  milestones: many(milestones),
  issues: many(issues),
  pullRequests: many(pullRequests),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [milestones.repoId],
    references: [repositories.id],
  }),
  issues: many(issues),
  pullRequests: many(pullRequests),
}));

export const issuesRelations = relations(issues, ({ one }) => ({
  repository: one(repositories, {
    fields: [issues.repoId],
    references: [repositories.id],
  }),
  milestone: one(milestones, {
    fields: [issues.milestoneId],
    references: [milestones.id],
  }),
}));

export const pullRequestsRelations = relations(pullRequests, ({ one }) => ({
  repository: one(repositories, {
    fields: [pullRequests.repoId],
    references: [repositories.id],
  }),
  milestone: one(milestones, {
    fields: [pullRequests.milestoneId],
    references: [milestones.id],
  }),
}));

// =============================================================================
// Types
// =============================================================================

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;

export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;

export type PullRequest = typeof pullRequests.$inferSelect;
export type NewPullRequest = typeof pullRequests.$inferInsert;

export type MilestoneState = (typeof milestoneStateEnum.enumValues)[number];
export type IssueState = (typeof issueStateEnum.enumValues)[number];
export type PullRequestState =
  (typeof pullRequestStateEnum.enumValues)[number];
