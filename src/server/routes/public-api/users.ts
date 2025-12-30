/**
 * Public API - User Routes
 *
 * Endpoints:
 * - GET /user - Get authenticated user
 * - PATCH /user - Update authenticated user
 * - GET /users/:username - Get user by username
 * - GET /users/:username/repos - List user's repositories
 */

import { Hono } from 'hono';
import { userModel, repoModel } from '../../../db/models';
import { requireAuth, parsePagination, formatLinkHeader } from './middleware';

/**
 * Format user response (public fields only)
 */
function formatUser(user: any, includePrivate = false) {
  if (!user) return null;

  const publicFields = {
    id: user.id,
    login: user.username || user.name,
    name: user.name,
    avatar_url: user.image,
    bio: user.bio || null,
    location: user.location || null,
    blog: user.website || null,
    company: user.company || null,
    twitter_username: user.twitterUsername || null,
    public_repos: user.publicReposCount || 0,
    followers: user.followersCount || 0,
    following: user.followingCount || 0,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
    type: 'User',
    html_url: `/${user.username || user.name}`,
    url: `/api/v1/users/${user.username || user.name}`,
    repos_url: `/api/v1/users/${user.username || user.name}/repos`,
  };

  if (includePrivate) {
    return {
      ...publicFields,
      email: user.email,
      private_repos: user.privateReposCount || 0,
    };
  }

  return publicFields;
}

/**
 * Format repository response
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
    homepage: repo.homepage || null,
    size: repo.size || 0,
    stargazers_count: repo.starsCount || 0,
    watchers_count: repo.watchersCount || 0,
    forks_count: repo.forksCount || 0,
    open_issues_count: repo.openIssuesCount || 0,
    default_branch: repo.defaultBranch || 'main',
    language: repo.language || null,
    topics: repo.topics || [],
    visibility: repo.isPrivate ? 'private' : 'public',
    html_url: `/${ownerLogin}/${repo.name}`,
    url: `/api/v1/repos/${ownerLogin}/${repo.name}`,
    clone_url: `${process.env.WIT_SERVER_URL || 'http://localhost:3000'}/${ownerLogin}/${repo.name}.git`,
  };
}

export function createUserRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /user
   * Get the authenticated user
   */
  app.get('/', requireAuth, async (c) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Get full user details
    const fullUser = await userModel.findById(user.id);

    if (!fullUser) {
      return c.json({ message: 'User not found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    return c.json(formatUser(fullUser, true));
  });

  /**
   * PATCH /user
   * Update the authenticated user
   */
  app.patch('/', requireAuth, async (c) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();

    // Allowed update fields
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.bio !== undefined) updates.bio = body.bio;
    if (body.location !== undefined) updates.location = body.location;
    if (body.company !== undefined) updates.company = body.company;
    if (body.blog !== undefined) updates.website = body.blog;
    if (body.twitter_username !== undefined) updates.twitterUsername = body.twitter_username;

    if (Object.keys(updates).length === 0) {
      return c.json({ message: 'No valid fields to update' }, 400 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const updatedUser = await userModel.update(user.id, updates);

    if (!updatedUser) {
      return c.json({ message: 'Failed to update user' }, 500 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    return c.json(formatUser(updatedUser, true));
  });

  /**
   * GET /users/:username
   * Get a user by username
   */
  app.get('/:username', async (c) => {
    const username = c.req.param('username');

    const user = await userModel.findByUsername(username);

    if (!user) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    return c.json(formatUser(user));
  });

  /**
   * GET /users/:username/repos
   * List repositories for a user
   */
  app.get('/:username/repos', async (c) => {
    const username = c.req.param('username');
    const { page, perPage } = parsePagination(c);
    const sort = c.req.query('sort') || 'updated';
    const direction = c.req.query('direction') || 'desc';

    const user = await userModel.findByUsername(username);

    if (!user) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Check if viewing own repos (can see private)
    const currentUser = c.get('user');
    const canSeePrivate = currentUser?.id === user.id;

    // Get repositories
    const repos = await repoModel.listByOwner(user.id, 'user');

    // Filter out private repos if not owner
    const accessibleRepos = canSeePrivate
      ? repos
      : repos.filter((r) => !r.isPrivate);

    // Sort
    const sortedRepos = [...accessibleRepos].sort((a, b) => {
      const aVal = sort === 'created' ? a.createdAt : sort === 'pushed' ? a.pushedAt : a.updatedAt;
      const bVal = sort === 'created' ? b.createdAt : sort === 'pushed' ? b.pushedAt : b.updatedAt;
      const aTime = aVal?.getTime() || 0;
      const bTime = bVal?.getTime() || 0;
      return direction === 'desc' ? bTime - aTime : aTime - bTime;
    });

    // Paginate
    const paginatedRepos = sortedRepos.slice((page - 1) * perPage, page * perPage);

    // Format response
    const formattedRepos = paginatedRepos.map((repo) => formatRepo(repo, user));

    // Add pagination headers
    const linkHeader = formatLinkHeader(c.req.url.split('?')[0], page, perPage, accessibleRepos.length);

    if (linkHeader) {
      c.header('Link', linkHeader);
    }

    return c.json(formattedRepos);
  });

  return app;
}
