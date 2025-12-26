/**
 * API module - exports all API-related functionality
 *
 * This module provides:
 * - tRPC API for type-safe server-client communication
 * - HTTP API client for platform features
 */

// Re-export everything from tRPC module
export * from './trpc';

// Re-export HTTP API client
export {
  // Client
  ApiClient,
  createApiClient,
  getApiClient,
  resetApiClient,

  // Configuration
  getServerUrl,
  getAuthToken,

  // Error handling
  ApiError,

  // Types
  type User,
  type Repository,
  type PullRequest,
  type PullRequestWithAuthor,
  type Issue,
  type IssueWithAuthor,
  type Label,
} from './client';
