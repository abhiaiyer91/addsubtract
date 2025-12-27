/**
 * wit - A Modern Git Implementation in TypeScript
 * 
 * Improvements over Git:
 * - SHA-256 hashing by default (more secure than SHA-1)
 * - Large file chunking (better binary file handling)
 * - Operation journal (undo/history for all operations)
 * - Structured merge conflicts (easier resolution)
 * - Branch state management (auto-stash on switch)
 * - Monorepo scope support (work with repository subsets)
 * - Better error messages (with suggestions)
 * 
 * @example
 * ```typescript
 * import { Repository } from 'wit';
 * 
 * // Initialize a new repository
 * const repo = Repository.init('/path/to/project');
 * 
 * // Add and commit files
 * repo.add('file.txt');
 * const hash = repo.commit('Initial commit');
 * 
 * // Use undo functionality
 * repo.journal.undo();
 * 
 * // Work with a subset (monorepo)
 * repo.scopeManager.setScope({ paths: ['packages/frontend/'] });
 * ```
 */

// Core types and objects
export * from './core/types';
export * from './core/object';
export * from './core/object-store';
export { Index, buildTreeFromIndex } from './core/index';
export * from './core/refs';
export * from './core/repository';
export * from './core/diff';

// New improvements
export * from './core/errors';
export * from './core/journal';
export * from './core/large-file';
export * from './core/merge';
export * from './core/branch-state';
export * from './core/partial-clone';
export * from './core/scope';

// Utilities
export * from './utils/hash';
export * from './utils/compression';

// User Interface
export * from './ui';

// AI Integration
export * from './ai';

// Primitives
export * from './primitives';

// API - tRPC router and client utilities
export {
  // Router
  appRouter,
  type AppRouter,
  // Context
  createContext,
  createTestContext,
  type Context,
  // tRPC primitives
  router,
  publicProcedure,
  protectedProcedure,
  middleware,
  mergeRouters,
  // Middleware
  isAuthed,
  withRepoPermission,
  isRepoAdmin,
  isRepoMember,
  withOrgRole,
  isOrgAdmin,
  isOrgOwner,
  // Client
  createClient,
  createClientWithTokenGetter,
  isTRPCClientError,
  TRPCClientError,
} from './api/trpc';

// API Client and Types (namespaced to avoid conflicts with core Repository class)
export {
  ApiClient,
  createApiClient,
  getApiClient,
  resetApiClient,
  getServerUrl,
  getAuthToken,
  ApiError,
} from './api/client';

// API Types - exported with 'Api' prefix to avoid conflicts
export type {
  User as ApiUser,
  Repository as ApiRepository,
  PullRequest as ApiPullRequest,
  PullRequestWithAuthor as ApiPullRequestWithAuthor,
  Issue as ApiIssue,
  IssueWithAuthor as ApiIssueWithAuthor,
  Label as ApiLabel,
} from './api/client';

// Version
export const VERSION = '2.0.0';
