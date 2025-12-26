/**
 * API Client exports
 *
 * Provides the API client for communicating with the wit server
 * for platform features like pull requests and issues.
 */

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
