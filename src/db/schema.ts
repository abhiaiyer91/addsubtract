/**
 * Database Schema
 * Defines the data structures for repositories, users, and related entities
 */

import { z } from 'zod';

/**
 * User schema
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1).max(39),
  email: z.string().email(),
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

/**
 * Repository visibility
 */
export const VisibilitySchema = z.enum(['public', 'private', 'internal']);
export type Visibility = z.infer<typeof VisibilitySchema>;

/**
 * Repository schema
 */
export const RepositorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ownerId: z.string().uuid(),
  visibility: VisibilitySchema.default('private'),
  defaultBranch: z.string().default('main'),
  diskPath: z.string(), // Path to bare git repo on disk
  
  // Fork-related fields
  isFork: z.boolean().default(false),
  forkedFromId: z.string().uuid().nullable().default(null),
  forksCount: z.number().int().min(0).default(0),
  
  // Stats
  starsCount: z.number().int().min(0).default(0),
  watchersCount: z.number().int().min(0).default(0),
  
  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
  pushedAt: z.date().optional(),
});

export type Repository = z.infer<typeof RepositorySchema>;

/**
 * Repository with owner information
 */
export const RepositoryWithOwnerSchema = RepositorySchema.extend({
  owner: UserSchema,
  forkedFrom: RepositorySchema.pick({
    id: true,
    name: true,
    ownerId: true,
  }).extend({
    owner: UserSchema.pick({
      id: true,
      username: true,
    }),
  }).nullable().optional(),
});

export type RepositoryWithOwner = z.infer<typeof RepositoryWithOwnerSchema>;

/**
 * Activity log entry schema
 */
export const ActivitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  repoId: z.string().uuid(),
  action: z.enum(['create', 'fork', 'push', 'star', 'watch', 'delete']),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date(),
});

export type Activity = z.infer<typeof ActivitySchema>;

/**
 * Create repository input
 */
export const CreateRepositoryInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  visibility: VisibilitySchema.default('private'),
  defaultBranch: z.string().default('main'),
});

export type CreateRepositoryInput = z.infer<typeof CreateRepositoryInputSchema>;

/**
 * Fork repository input
 */
export const ForkRepositoryInputSchema = z.object({
  repoId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(), // Defaults to original repo name
});

export type ForkRepositoryInput = z.infer<typeof ForkRepositoryInputSchema>;
