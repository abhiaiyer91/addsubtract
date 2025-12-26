import { pgTable, uuid, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Users table - referenced by releases for author information
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Repositories table - releases are associated with repositories
 */
export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  isPrivate: boolean('is_private').notNull().default(false),
  defaultBranch: text('default_branch').notNull().default('main'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Releases table - tag-based releases with metadata
 * Similar to GitHub releases
 */
export const releases = pgTable('releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  tagName: text('tag_name').notNull(),
  name: text('name').notNull(),
  body: text('body'), // Markdown release notes
  isDraft: boolean('is_draft').notNull().default(false),
  isPrerelease: boolean('is_prerelease').notNull().default(false),
  authorId: uuid('author_id').notNull().references(() => users.id),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Release assets table - files attached to releases
 */
export const releaseAssets = pgTable('release_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id').notNull().references(() => releases.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  downloadUrl: text('download_url').notNull(),
  downloadCount: integer('download_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations

export const usersRelations = relations(users, ({ many }) => ({
  repositories: many(repositories),
  releases: many(releases),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  owner: one(users, {
    fields: [repositories.ownerId],
    references: [users.id],
  }),
  releases: many(releases),
}));

export const releasesRelations = relations(releases, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [releases.repoId],
    references: [repositories.id],
  }),
  author: one(users, {
    fields: [releases.authorId],
    references: [users.id],
  }),
  assets: many(releaseAssets),
}));

export const releaseAssetsRelations = relations(releaseAssets, ({ one }) => ({
  release: one(releases, {
    fields: [releaseAssets.releaseId],
    references: [releases.id],
  }),
}));

// Type exports for use in models
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export type Release = typeof releases.$inferSelect;
export type NewRelease = typeof releases.$inferInsert;

export type ReleaseAsset = typeof releaseAssets.$inferSelect;
export type NewReleaseAsset = typeof releaseAssets.$inferInsert;
