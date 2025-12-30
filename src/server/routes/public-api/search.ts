/**
 * Public API - Search Routes
 *
 * Endpoints:
 * - GET /search/repositories - Search repositories
 * - GET /search/issues - Search issues
 * - GET /search/users - Search users
 */

import { Hono } from 'hono';
import { repoModel, userModel, issueModel } from '../../../db/models';
import { parsePagination, formatLinkHeader } from './middleware';

/**
 * Format user response
 */
function formatUser(user: any) {
  if (!user) return null;
  return {
    id: user.id,
    login: user.username || user.name,
    name: user.name,
    avatar_url: user.image,
    type: 'User',
    html_url: `/${user.username || user.name}`,
    url: `/api/v1/users/${user.username || user.name}`,
    score: 1.0,
  };
}

/**
 * Format repository response for search
 */
function formatRepo(repo: any, owner: any) {
  const ownerLogin = owner?.username || owner?.name || 'unknown';
  return {
    id: repo.id,
    name: repo.name,
    full_name: `${ownerLogin}/${repo.name}`,
    owner: owner ? formatUser(owner) : null,
    private: repo.isPrivate,
    description: repo.description,
    fork: repo.isFork || false,
    created_at: repo.createdAt,
    updated_at: repo.updatedAt,
    pushed_at: repo.pushedAt,
    size: repo.size || 0,
    stargazers_count: repo.starsCount || 0,
    watchers_count: repo.watchersCount || 0,
    forks_count: repo.forksCount || 0,
    open_issues_count: repo.openIssuesCount || 0,
    default_branch: repo.defaultBranch || 'main',
    language: repo.language,
    topics: repo.topics || [],
    visibility: repo.isPrivate ? 'private' : 'public',
    html_url: `/${ownerLogin}/${repo.name}`,
    url: `/api/v1/repos/${ownerLogin}/${repo.name}`,
    score: 1.0,
  };
}

/**
 * Format issue response for search
 */
function formatIssue(issue: any, repo: any, owner: any) {
  const ownerLogin = owner?.username || owner?.name || 'unknown';
  const repoName = repo?.name || 'unknown';
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    user: issue.author ? formatUser(issue.author) : null,
    labels: issue.labels || [],
    comments: issue.commentsCount || 0,
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
    closed_at: issue.closedAt,
    html_url: `/${ownerLogin}/${repoName}/issues/${issue.number}`,
    url: `/api/v1/repos/${ownerLogin}/${repoName}/issues/${issue.number}`,
    repository_url: `/api/v1/repos/${ownerLogin}/${repoName}`,
    score: 1.0,
  };
}

export function createSearchRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /search/repositories
   * Search repositories
   */
  app.get('/repositories', async (c) => {
    const q = c.req.query('q');
    const { perPage } = parsePagination(c);

    if (!q) {
      return c.json({
        message: 'Validation Failed',
        errors: [{ resource: 'Search', field: 'q', code: 'missing' }],
      }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Simple search using existing search method
    const items = await repoModel.search(q, perPage);

    // Format results
    const formattedItems = await Promise.all(
      items.map(async (repo) => {
        const owner = await userModel.findById(repo.ownerId);
        return formatRepo(repo, owner);
      })
    );

    return c.json({
      total_count: formattedItems.length,
      incomplete_results: false,
      items: formattedItems,
    });
  });

  /**
   * GET /search/issues
   * Search issues and pull requests
   */
  app.get('/issues', async (c) => {
    const q = c.req.query('q');
    const { perPage } = parsePagination(c);

    if (!q) {
      return c.json({
        message: 'Validation Failed',
        errors: [{ resource: 'Search', field: 'q', code: 'missing' }],
      }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Parse search query for repo qualifier
    const repoMatch = q.match(/repo:([^\s]+)/);
    if (repoMatch) {
      const [owner, repoName] = repoMatch[1].split('/');
      const result = await repoModel.findByPath(owner, repoName);

      if (result) {
        const searchTerm = q.replace(/repo:[^\s]+/, '').trim();
        const issues = await issueModel.listByRepo(result.repo.id, { limit: perPage });

        // Simple text filter
        const filteredIssues = searchTerm
          ? issues.filter((i) =>
              i.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
              i.body?.toLowerCase().includes(searchTerm.toLowerCase())
            )
          : issues;

        const formattedItems = await Promise.all(
          filteredIssues.map(async (issue) => {
            const ownerData = await userModel.findById(result.repo.ownerId);
            return formatIssue(issue, result.repo, ownerData);
          })
        );

        return c.json({
          total_count: formattedItems.length,
          incomplete_results: false,
          items: formattedItems,
        });
      }
    }

    return c.json({
      total_count: 0,
      incomplete_results: false,
      items: [],
    });
  });

  /**
   * GET /search/users
   * Search users
   */
  app.get('/users', async (c) => {
    const q = c.req.query('q');
    const { perPage } = parsePagination(c);

    if (!q) {
      return c.json({
        message: 'Validation Failed',
        errors: [{ resource: 'Search', field: 'q', code: 'missing' }],
      }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Simple search - find users by username or name containing the query
    const users = await userModel.search(q, perPage);

    const formattedItems = users.map(formatUser).filter(Boolean);

    return c.json({
      total_count: formattedItems.length,
      incomplete_results: false,
      items: formattedItems,
    });
  });

  return app;
}
