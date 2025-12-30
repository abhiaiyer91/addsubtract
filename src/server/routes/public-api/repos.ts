/**
 * Public API - Repository Routes
 *
 * Endpoints:
 * - GET /repos/:owner/:repo - Get a repository
 * - PATCH /repos/:owner/:repo - Update a repository
 * - DELETE /repos/:owner/:repo - Delete a repository
 * - GET /repos/:owner/:repo/branches - List branches
 * - GET /repos/:owner/:repo/collaborators - List collaborators
 * - PUT /repos/:owner/:repo/star - Star a repository
 * - DELETE /repos/:owner/:repo/star - Unstar a repository
 */

import { Hono } from 'hono';
import {
  repoModel,
  userModel,
  orgModel,
  collaboratorModel,
  starModel,
} from '../../../db/models';
import { requireAuth, requireScopes, parsePagination, formatLinkHeader } from './middleware';
import { checkRepoAccess } from '../../../core/acl';

/**
 * Format user response (public fields only)
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
  };
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
    open_prs_count: repo.openPrsCount || 0,
    default_branch: repo.defaultBranch || 'main',
    language: repo.language || null,
    topics: repo.topics || [],
    visibility: repo.isPrivate ? 'private' : 'public',
    has_issues: true,
    has_projects: true,
    archived: repo.isArchived || false,
    html_url: `/${ownerLogin}/${repo.name}`,
    url: `/api/v1/repos/${ownerLogin}/${repo.name}`,
    clone_url: `${process.env.WIT_SERVER_URL || 'http://localhost:3000'}/${ownerLogin}/${repo.name}.git`,
    branches_url: `/api/v1/repos/${ownerLogin}/${repo.name}/branches{/branch}`,
    commits_url: `/api/v1/repos/${ownerLogin}/${repo.name}/commits{/sha}`,
    contents_url: `/api/v1/repos/${ownerLogin}/${repo.name}/contents/{+path}`,
    issues_url: `/api/v1/repos/${ownerLogin}/${repo.name}/issues{/number}`,
    pulls_url: `/api/v1/repos/${ownerLogin}/${repo.name}/pulls{/number}`,
    collaborators_url: `/api/v1/repos/${ownerLogin}/${repo.name}/collaborators{/collaborator}`,
    stargazers_url: `/api/v1/repos/${ownerLogin}/${repo.name}/stargazers`,
  };
}

/**
 * Helper to get repo and check access
 */
async function getRepoWithAccess(
  owner: string,
  repo: string,
  userId?: string,
  requiredLevel: 'read' | 'write' | 'admin' = 'read'
): Promise<{ repo: any; owner: any; error?: string; status?: number }> {
  const result = await repoModel.findByPath(owner, repo);

  if (!result) {
    return { repo: null, owner: null, error: 'Not Found', status: 404 };
  }

  const { repo: repoData } = result;

  // Get owner info
  let ownerData: any;
  if (repoData.ownerType === 'organization') {
    ownerData = await orgModel.findById(repoData.ownerId);
    if (ownerData) {
      ownerData.username = ownerData.name;
      ownerData.type = 'Organization';
    }
  } else {
    ownerData = await userModel.findById(repoData.ownerId);
  }

  // Check access
  const access = await checkRepoAccess(repoData.id, userId, requiredLevel);

  if (!access.allowed) {
    if (!userId) {
      return { repo: null, owner: null, error: 'Requires authentication', status: 401 };
    }
    return { repo: null, owner: null, error: 'Not Found', status: 404 };
  }

  return { repo: repoData, owner: ownerData };
}

export function createRepoRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /repos/:owner/:repo
   * Get a repository
   */
  app.get('/:owner/:repo', async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    return c.json(formatRepo(result.repo, result.owner));
  });

  /**
   * PATCH /repos/:owner/:repo
   * Update a repository
   */
  app.patch('/:owner/:repo', requireAuth, requireScopes('repo:write'), async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId, 'admin');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();

    // Allowed update fields
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.homepage !== undefined) updates.homepage = body.homepage;
    if (body.private !== undefined) updates.isPrivate = body.private;
    if (body.default_branch !== undefined) updates.defaultBranch = body.default_branch;
    if (body.archived !== undefined) updates.isArchived = body.archived;

    if (Object.keys(updates).length === 0) {
      return c.json({ message: 'No valid fields to update' }, 400 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const updatedRepo = await repoModel.update(result.repo.id, updates);

    if (!updatedRepo) {
      return c.json({ message: 'Failed to update repository' }, 500 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    return c.json(formatRepo(updatedRepo, result.owner));
  });

  /**
   * DELETE /repos/:owner/:repo
   * Delete a repository
   */
  app.delete('/:owner/:repo', requireAuth, requireScopes('repo:admin'), async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId, 'admin');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    await repoModel.delete(result.repo.id);

    return c.body(null, 204);
  });

  /**
   * GET /repos/:owner/:repo/branches
   * List branches
   */
  app.get('/:owner/:repo/branches', async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;
    const { page, perPage } = parsePagination(c);

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Get branches from bare repository
    try {
      const { BareRepository } = await import('../../storage/repos');
      const bareRepo = new BareRepository(result.repo.diskPath);

      const branches = bareRepo.listBranches();

      // Paginate
      const paginatedBranches = branches.slice((page - 1) * perPage, page * perPage);

      const formattedBranches = paginatedBranches.map((branch) => {
        const sha = bareRepo.refs.resolve(`refs/heads/${branch}`);
        return {
          name: branch,
          protected: false,
          commit: {
            sha: sha || '',
            url: `/api/v1/repos/${owner}/${repo}/commits/${sha}`,
          },
        };
      });

      // Add Link header for pagination
      const linkHeader = formatLinkHeader(c.req.url.split('?')[0], page, perPage, branches.length);
      if (linkHeader) {
        c.header('Link', linkHeader);
      }

      return c.json(formattedBranches);
    } catch (error) {
      return c.json([]);
    }
  });

  /**
   * GET /repos/:owner/:repo/collaborators
   * List collaborators
   */
  app.get('/:owner/:repo/collaborators', requireAuth, requireScopes('repo:read'), async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId, 'admin');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const collaborators = await collaboratorModel.listByRepo(result.repo.id);

    const formattedCollaborators = collaborators.map((collab) => ({
      ...formatUser(collab.user),
      permissions: {
        pull: true,
        triage: collab.permission === 'write' || collab.permission === 'admin',
        push: collab.permission === 'write' || collab.permission === 'admin',
        maintain: collab.permission === 'admin',
        admin: collab.permission === 'admin',
      },
      role_name: collab.permission,
    }));

    return c.json(formattedCollaborators);
  });

  /**
   * PUT /repos/:owner/:repo/collaborators/:username
   * Add a collaborator
   */
  app.put('/:owner/:repo/collaborators/:username', requireAuth, requireScopes('repo:admin'), async (c) => {
    const { owner, repo, username } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId, 'admin');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json().catch(() => ({}));
    const permission = body.permission || 'write';

    const targetUser = await userModel.findByUsername(username);

    if (!targetUser) {
      return c.json({ message: 'User not found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    await collaboratorModel.add({
      repoId: result.repo.id,
      userId: targetUser.id,
      permission,
    });

    return c.body(null, 201);
  });

  /**
   * DELETE /repos/:owner/:repo/collaborators/:username
   * Remove a collaborator
   */
  app.delete('/:owner/:repo/collaborators/:username', requireAuth, requireScopes('repo:admin'), async (c) => {
    const { owner, repo, username } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId, 'admin');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const targetUser = await userModel.findByUsername(username);

    if (!targetUser) {
      return c.json({ message: 'User not found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    await collaboratorModel.remove(result.repo.id, targetUser.id);

    return c.body(null, 204);
  });

  /**
   * GET /repos/:owner/:repo/stargazers
   * List stargazers
   */
  app.get('/:owner/:repo/stargazers', async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const stargazers = await starModel.listByRepo(result.repo.id);

    // listByRepo already returns user data as Owner type
    const formattedStargazers = stargazers.map((user) => formatUser(user));

    return c.json(formattedStargazers.filter(Boolean));
  });

  /**
   * PUT /user/starred/:owner/:repo
   * Star a repository
   */
  app.put('/starred/:owner/:repo', requireAuth, async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    await starModel.add(result.repo.id, userId);

    return c.body(null, 204);
  });

  /**
   * DELETE /user/starred/:owner/:repo
   * Unstar a repository
   */
  app.delete('/starred/:owner/:repo', requireAuth, async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    await starModel.remove(result.repo.id, userId);

    return c.body(null, 204);
  });

  return app;
}
