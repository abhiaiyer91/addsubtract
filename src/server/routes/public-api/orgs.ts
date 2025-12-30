/**
 * Public API - Organization Routes
 *
 * Endpoints:
 * - GET /orgs/:org - Get an organization
 * - GET /orgs/:org/members - List organization members
 * - GET /orgs/:org/repos - List organization repositories
 */

import { Hono } from 'hono';
import { orgModel, orgMemberModel, repoModel, userModel } from '../../../db/models';
import { requireAuth, requireScopes, parsePagination, formatLinkHeader } from './middleware';

/**
 * Format organization response
 */
function formatOrg(org: any, includePrivate = false) {
  const publicFields = {
    id: org.id,
    login: org.name,
    name: org.displayName || org.name,
    avatar_url: org.avatarUrl || org.image,
    description: org.description,
    url: `/api/v1/orgs/${org.name}`,
    html_url: `/${org.name}`,
    repos_url: `/api/v1/orgs/${org.name}/repos`,
    members_url: `/api/v1/orgs/${org.name}/members{/member}`,
    public_repos: org.publicReposCount || 0,
    type: 'Organization',
    created_at: org.createdAt,
    updated_at: org.updatedAt,
    blog: org.website,
    location: org.location,
    email: org.publicEmail,
    is_verified: org.isVerified || false,
  };

  if (includePrivate) {
    return {
      ...publicFields,
      billing_email: org.billingEmail,
      private_repos: org.privateReposCount || 0,
    };
  }

  return publicFields;
}

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
  };
}

/**
 * Format member response
 */
function formatMember(user: any, role: string) {
  return {
    ...formatUser(user),
    role,
  };
}

/**
 * Format repository response
 */
function formatRepo(repo: any, owner: any) {
  const ownerLogin = owner?.name || owner?.username || 'unknown';
  return {
    id: repo.id,
    name: repo.name,
    full_name: `${ownerLogin}/${repo.name}`,
    owner: owner ? {
      id: owner.id,
      login: owner.name || owner.username,
      avatar_url: owner.avatarUrl || owner.image,
      type: 'Organization',
      url: `/api/v1/orgs/${owner.name}`,
    } : null,
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
    visibility: repo.isPrivate ? 'private' : 'public',
    html_url: `/${ownerLogin}/${repo.name}`,
    url: `/api/v1/repos/${ownerLogin}/${repo.name}`,
  };
}

export function createOrgRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /orgs/:org
   * Get an organization
   */
  app.get('/:org', async (c) => {
    const orgName = c.req.param('org');
    const userId = c.get('user')?.id;

    const org = await orgModel.findByName(orgName);

    if (!org) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Check if user is a member to show private info
    let isMember = false;
    if (userId) {
      isMember = await orgMemberModel.isMember(org.id, userId);
    }

    return c.json(formatOrg(org, isMember));
  });

  /**
   * PATCH /orgs/:org
   * Update an organization
   */
  app.patch('/:org', requireAuth, requireScopes('org:write'), async (c) => {
    const orgName = c.req.param('org');
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const org = await orgModel.findByName(orgName);

    if (!org) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Check if user is an admin
    const isAdmin = await orgMemberModel.hasRole(org.id, userId, 'admin');

    if (!isAdmin) {
      return c.json({ message: 'Must be an organization admin' }, 403 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();

    // Allowed update fields
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.displayName = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.email !== undefined) updates.publicEmail = body.email;
    if (body.location !== undefined) updates.location = body.location;
    if (body.blog !== undefined) updates.website = body.blog;

    if (Object.keys(updates).length === 0) {
      return c.json({ message: 'No valid fields to update' }, 400 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const updatedOrg = await orgModel.update(org.id, updates);

    return c.json(formatOrg(updatedOrg, true));
  });

  /**
   * GET /orgs/:org/members
   * List organization members
   */
  app.get('/:org/members', async (c) => {
    const orgName = c.req.param('org');
    const userId = c.get('user')?.id;
    const { page, perPage } = parsePagination(c);
    const role = c.req.query('role');

    const org = await orgModel.findByName(orgName);

    if (!org) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Check if user is a member
    let isMember = false;
    if (userId) {
      isMember = await orgMemberModel.isMember(org.id, userId);
    }

    const members = await orgMemberModel.listByOrg(org.id);

    // Filter by role if specified
    const filteredMembers = role
      ? members.filter((m) => m.role === role)
      : members;

    // Paginate
    const paginatedMembers = filteredMembers.slice((page - 1) * perPage, page * perPage);

    const formattedMembers = await Promise.all(
      paginatedMembers.map(async (member) => {
        const user = await userModel.findById(member.userId);
        return formatMember(user, member.role);
      })
    );

    // Add Link header for pagination
    const linkHeader = formatLinkHeader(c.req.url.split('?')[0], page, perPage, filteredMembers.length);
    if (linkHeader) {
      c.header('Link', linkHeader);
    }

    return c.json(formattedMembers);
  });

  /**
   * PUT /orgs/:org/memberships/:username
   * Add or update organization membership
   */
  app.put('/:org/memberships/:username', requireAuth, requireScopes('org:write'), async (c) => {
    const orgName = c.req.param('org');
    const username = c.req.param('username');
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const org = await orgModel.findByName(orgName);

    if (!org) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Check if user is an admin
    const isAdmin = await orgMemberModel.hasRole(org.id, userId, 'admin');

    if (!isAdmin) {
      return c.json({ message: 'Must be an organization admin' }, 403 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const targetUser = await userModel.findByUsername(username);

    if (!targetUser) {
      return c.json({ message: 'User not found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json().catch(() => ({}));
    const role = body.role || 'member';

    if (role !== 'admin' && role !== 'member') {
      return c.json({ message: 'Invalid role. Must be admin or member' }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Add or update membership
    await orgMemberModel.add({ orgId: org.id, userId: targetUser.id, role });

    return c.json({
      url: `/api/v1/orgs/${orgName}/memberships/${username}`,
      state: 'active',
      role,
      organization_url: `/api/v1/orgs/${orgName}`,
      organization: formatOrg(org),
      user: formatUser(targetUser),
    });
  });

  /**
   * DELETE /orgs/:org/memberships/:username
   * Remove organization membership
   */
  app.delete('/:org/memberships/:username', requireAuth, requireScopes('org:write'), async (c) => {
    const orgName = c.req.param('org');
    const username = c.req.param('username');
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const org = await orgModel.findByName(orgName);

    if (!org) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const targetUser = await userModel.findByUsername(username);

    if (!targetUser) {
      return c.json({ message: 'User not found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Can remove self, or admin can remove others
    const isAdmin = await orgMemberModel.hasRole(org.id, userId, 'admin');

    if (targetUser.id !== userId && !isAdmin) {
      return c.json({ message: 'Must be an organization admin' }, 403 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    await orgMemberModel.remove(org.id, targetUser.id);

    return c.body(null, 204);
  });

  /**
   * GET /orgs/:org/repos
   * List organization repositories
   */
  app.get('/:org/repos', async (c) => {
    const orgName = c.req.param('org');
    const userId = c.get('user')?.id;
    const { page, perPage } = parsePagination(c);
    const sort = c.req.query('sort') || 'created';
    const direction = c.req.query('direction') || 'desc';

    const org = await orgModel.findByName(orgName);

    if (!org) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Check if user is a member (can see private repos)
    let isMember = false;
    if (userId) {
      isMember = await orgMemberModel.isMember(org.id, userId);
    }

    // Get all org repos and filter based on access
    const repos = await repoModel.listByOwner(org.id, 'organization');

    // Filter out private repos if not a member
    const accessibleRepos = isMember
      ? repos
      : repos.filter((r) => !r.isPrivate);

    // Sort
    const sortedRepos = [...accessibleRepos].sort((a, b) => {
      const aVal = sort === 'updated' ? a.updatedAt : sort === 'pushed' ? a.pushedAt : a.createdAt;
      const bVal = sort === 'updated' ? b.updatedAt : sort === 'pushed' ? b.pushedAt : b.createdAt;
      const aTime = aVal?.getTime() || 0;
      const bTime = bVal?.getTime() || 0;
      return direction === 'desc' ? bTime - aTime : aTime - bTime;
    });

    // Paginate
    const paginatedRepos = sortedRepos.slice((page - 1) * perPage, page * perPage);

    const formattedRepos = paginatedRepos.map((repo) => formatRepo(repo, org));

    // Add Link header for pagination
    const linkHeader = formatLinkHeader(c.req.url.split('?')[0], page, perPage, accessibleRepos.length);
    if (linkHeader) {
      c.header('Link', linkHeader);
    }

    return c.json(formattedRepos);
  });

  return app;
}
