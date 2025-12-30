/**
 * Public API - Issue Routes
 *
 * Endpoints:
 * - GET /repos/:owner/:repo/issues - List issues
 * - GET /repos/:owner/:repo/issues/:number - Get an issue
 * - POST /repos/:owner/:repo/issues - Create an issue
 * - PATCH /repos/:owner/:repo/issues/:number - Update an issue
 * - GET /repos/:owner/:repo/issues/:number/comments - List comments
 * - POST /repos/:owner/:repo/issues/:number/comments - Create comment
 * - GET /repos/:owner/:repo/labels - List labels
 * - POST /repos/:owner/:repo/issues/:number/labels - Add labels
 * - DELETE /repos/:owner/:repo/issues/:number/labels/:name - Remove label
 */

import { Hono } from 'hono';
import { issueModel, repoModel, userModel, issueCommentModel, labelModel, issueLabelModel } from '../../../db/models';
import { requireAuth, requireScopes, parsePagination, formatLinkHeader } from './middleware';
import { checkRepoAccess } from '../../../core/acl';
import { eventBus } from '../../../events/bus';

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
 * Format label response
 */
function formatLabel(label: any) {
  return {
    id: label.id,
    name: label.name,
    description: label.description,
    color: label.color?.replace('#', '') || 'ededed',
    default: label.isDefault || false,
  };
}

/**
 * Format issue response
 */
function formatIssue(issue: any, owner: string, repo: string, author?: any, assignee?: any, labels?: any[]) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    state_reason: issue.stateReason || null,
    locked: issue.locked || false,
    assignee: assignee ? formatUser(assignee) : null,
    assignees: assignee ? [formatUser(assignee)] : [],
    labels: labels?.map(formatLabel) || [],
    user: author ? formatUser(author) : null,
    milestone: issue.milestone || null,
    comments: issue.commentsCount || 0,
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
    closed_at: issue.closedAt,
    closed_by: issue.closedBy ? formatUser(issue.closedBy) : null,
    author_association: 'CONTRIBUTOR',
    priority: issue.priority,
    status: issue.status,
    due_date: issue.dueDate,
    estimate: issue.estimate,
    parent_number: issue.parentNumber,
    project_name: issue.projectName,
    cycle_number: issue.cycleNumber,
    html_url: `/${owner}/${repo}/issues/${issue.number}`,
    url: `/api/v1/repos/${owner}/${repo}/issues/${issue.number}`,
    repository_url: `/api/v1/repos/${owner}/${repo}`,
    labels_url: `/api/v1/repos/${owner}/${repo}/issues/${issue.number}/labels{/name}`,
    comments_url: `/api/v1/repos/${owner}/${repo}/issues/${issue.number}/comments`,
    events_url: `/api/v1/repos/${owner}/${repo}/issues/${issue.number}/events`,
  };
}

/**
 * Format comment response
 */
function formatComment(comment: any, owner: string, repo: string, issueNumber: number, author?: any) {
  return {
    id: comment.id,
    body: comment.body,
    user: author ? formatUser(author) : null,
    created_at: comment.createdAt,
    updated_at: comment.updatedAt,
    author_association: 'CONTRIBUTOR',
    html_url: `/${owner}/${repo}/issues/${issueNumber}#comment-${comment.id}`,
    url: `/api/v1/repos/${owner}/${repo}/issues/comments/${comment.id}`,
    issue_url: `/api/v1/repos/${owner}/${repo}/issues/${issueNumber}`,
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
): Promise<{ repo: any; error?: string; status?: number }> {
  const result = await repoModel.findByPath(owner, repo);

  if (!result) {
    return { repo: null, error: 'Not Found', status: 404 };
  }

  const { repo: repoData } = result;

  const access = await checkRepoAccess(repoData.id, userId, requiredLevel);

  if (!access.allowed) {
    if (!userId) {
      return { repo: null, error: 'Requires authentication', status: 401 };
    }
    return { repo: null, error: 'Not Found', status: 404 };
  }

  return { repo: repoData };
}

export function createIssueRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /repos/:owner/:repo/issues
   * List issues for a repository
   */
  app.get('/:owner/:repo/issues', async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;
    const { page, perPage, offset } = parsePagination(c);

    const state = (c.req.query('state') || 'open') as 'open' | 'closed' | 'all';
    const sort = c.req.query('sort') || 'created';
    const direction = c.req.query('direction') || 'desc';
    const status = c.req.query('status');
    const priority = c.req.query('priority');

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const options: any = {
      state: state === 'all' ? undefined : state,
      status,
      priority,
      sortBy: sort,
      sortOrder: direction as 'asc' | 'desc',
      limit: perPage,
      offset,
    };

    const issues = await issueModel.listByRepo(result.repo.id, options);

    const formattedIssues = await Promise.all(
      issues.map(async (issue) => {
        const author = issue.authorId ? await userModel.findById(issue.authorId) : null;
        const assignee = issue.assigneeId ? await userModel.findById(issue.assigneeId) : null;
        const issueLabels = await issueLabelModel.listByIssue(issue.id);
        return formatIssue(issue, owner, repo, author, assignee, issueLabels);
      })
    );

    return c.json(formattedIssues);
  });

  /**
   * GET /repos/:owner/:repo/issues/:number
   * Get a single issue
   */
  app.get('/:owner/:repo/issues/:number', async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const issue = await issueModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const author = issue.authorId ? await userModel.findById(issue.authorId) : null;
    const assignee = issue.assigneeId ? await userModel.findById(issue.assigneeId) : null;
    const labels = await issueLabelModel.listByIssue(issue.id);

    return c.json(formatIssue(issue, owner, repo, author, assignee, labels));
  });

  /**
   * POST /repos/:owner/:repo/issues
   * Create an issue
   */
  app.post('/:owner/:repo/issues', requireAuth, requireScopes('issue:write'), async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const result = await getRepoWithAccess(owner, repo, userId, 'write');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();

    if (!body.title) {
      return c.json({ message: 'Validation Failed', errors: [{ resource: 'Issue', field: 'title', code: 'missing_field' }] }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const issue = await issueModel.create({
      repoId: result.repo.id,
      authorId: userId,
      title: body.title,
      body: body.body,
      priority: body.priority,
      dueDate: body.due_date ? new Date(body.due_date) : undefined,
      estimate: body.estimate,
    });

    // Handle assignees
    if (body.assignees?.length > 0 || body.assignee) {
      const assigneeUsername = body.assignees?.[0] || body.assignee;
      const assigneeUser = await userModel.findByUsername(assigneeUsername);
      if (assigneeUser) {
        await issueModel.assign(issue.id, assigneeUser.id);
      }
    }

    // Handle labels
    if (body.labels?.length > 0) {
      for (const labelName of body.labels) {
        const label = await labelModel.findByName(result.repo.id, labelName);
        if (label) {
          await issueLabelModel.add(issue.id, label.id);
        }
      }
    }

    // Emit event
    await eventBus.emit('issue.created', userId, {
      issueId: issue.id,
      issueNumber: issue.number,
      issueTitle: issue.title,
      repoId: result.repo.id,
      repoFullName: `${owner}/${repo}`,
    });

    const author = await userModel.findById(userId);
    const updatedIssue = await issueModel.findById(issue.id);
    const assignee = updatedIssue?.assigneeId ? await userModel.findById(updatedIssue.assigneeId) : null;
    const labels = await issueLabelModel.listByIssue(issue.id);

    return c.json(formatIssue(updatedIssue || issue, owner, repo, author, assignee, labels), 201 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
  });

  /**
   * PATCH /repos/:owner/:repo/issues/:number
   * Update an issue
   */
  app.patch('/:owner/:repo/issues/:number', requireAuth, requireScopes('issue:write'), async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const result = await getRepoWithAccess(owner, repo, userId, 'write');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const issue = await issueModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();

    // Handle state changes
    if (body.state === 'closed' && issue.state !== 'closed') {
      await issueModel.close(issue.id, userId);
    } else if (body.state === 'open' && issue.state !== 'open') {
      await issueModel.reopen(issue.id);
    }

    // Handle assignee changes
    if (body.assignees !== undefined || body.assignee !== undefined) {
      const assigneeUsername = body.assignees?.[0] || body.assignee;
      if (assigneeUsername) {
        const assigneeUser = await userModel.findByUsername(assigneeUsername);
        if (assigneeUser) {
          await issueModel.assign(issue.id, assigneeUser.id);
        }
      } else {
        await issueModel.unassign(issue.id);
      }
    }

    // Handle other updates
    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.body !== undefined) updates.body = body.body;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;
    if (body.due_date !== undefined) {
      updates.dueDate = body.due_date ? new Date(body.due_date) : null;
    }
    if (body.estimate !== undefined) updates.estimate = body.estimate;

    if (Object.keys(updates).length > 0) {
      await issueModel.update(issue.id, updates);
    }

    // Handle labels
    if (body.labels !== undefined) {
      // Set new labels (removes old ones)
      const labelIds: string[] = [];
      for (const labelName of body.labels) {
        const label = await labelModel.findByName(result.repo.id, labelName);
        if (label) {
          labelIds.push(label.id);
        }
      }
      await issueLabelModel.setLabels(issue.id, labelIds);
    }

    const updatedIssue = await issueModel.findById(issue.id);
    const author = updatedIssue?.authorId ? await userModel.findById(updatedIssue.authorId) : null;
    const assignee = updatedIssue?.assigneeId ? await userModel.findById(updatedIssue.assigneeId) : null;
    const labels = await issueLabelModel.listByIssue(issue.id);

    return c.json(formatIssue(updatedIssue, owner, repo, author, assignee, labels));
  });

  /**
   * GET /repos/:owner/:repo/issues/:number/comments
   * List comments on an issue
   */
  app.get('/:owner/:repo/issues/:number/comments', async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const issue = await issueModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const comments = await issueCommentModel.listByIssue(issue.id);

    const formattedComments = comments.map((comment) => {
      return formatComment(comment, owner, repo, parseInt(number, 10), comment.user);
    });

    return c.json(formattedComments);
  });

  /**
   * POST /repos/:owner/:repo/issues/:number/comments
   * Create a comment on an issue
   */
  app.post('/:owner/:repo/issues/:number/comments', requireAuth, requireScopes('issue:write'), async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const result = await getRepoWithAccess(owner, repo, userId, 'write');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const issue = await issueModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();

    if (!body.body) {
      return c.json({ message: 'Validation Failed', errors: [{ resource: 'IssueComment', field: 'body', code: 'missing_field' }] }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const comment = await issueCommentModel.create({
      issueId: issue.id,
      userId,
      body: body.body,
    });

    const author = await userModel.findById(userId);

    return c.json(formatComment(comment, owner, repo, parseInt(number, 10), author), 201 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
  });

  /**
   * GET /repos/:owner/:repo/labels
   * List labels for a repository
   */
  app.get('/:owner/:repo/labels', async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const labels = await labelModel.listByRepo(result.repo.id);

    return c.json(labels.map(formatLabel));
  });

  /**
   * POST /repos/:owner/:repo/labels
   * Create a label
   */
  app.post('/:owner/:repo/labels', requireAuth, requireScopes('issue:write'), async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId, 'write');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();

    if (!body.name) {
      return c.json({ message: 'Validation Failed', errors: [{ resource: 'Label', field: 'name', code: 'missing_field' }] }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const existing = await labelModel.findByName(result.repo.id, body.name);
    if (existing) {
      return c.json({ message: 'Validation Failed', errors: [{ resource: 'Label', field: 'name', code: 'already_exists' }] }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const label = await labelModel.create({
      repoId: result.repo.id,
      name: body.name,
      description: body.description,
      color: body.color?.replace('#', '') || 'ededed',
    });

    return c.json(formatLabel(label), 201 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
  });

  /**
   * POST /repos/:owner/:repo/issues/:number/labels
   * Add labels to an issue
   */
  app.post('/:owner/:repo/issues/:number/labels', requireAuth, requireScopes('issue:write'), async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId, 'write');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const issue = await issueModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();
    const labelNames = body.labels || body;

    if (!Array.isArray(labelNames)) {
      return c.json({ message: 'Validation Failed' }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    for (const labelName of labelNames) {
      const label = await labelModel.findByName(result.repo.id, labelName);
      if (label) {
        await issueLabelModel.add(issue.id, label.id);
      }
    }

    const labels = await issueLabelModel.listByIssue(issue.id);
    return c.json(labels.map(formatLabel));
  });

  /**
   * DELETE /repos/:owner/:repo/issues/:number/labels/:name
   * Remove a label from an issue
   */
  app.delete('/:owner/:repo/issues/:number/labels/:name', requireAuth, requireScopes('issue:write'), async (c) => {
    const { owner, repo, number, name } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId, 'write');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const issue = await issueModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const label = await labelModel.findByName(result.repo.id, decodeURIComponent(name));

    if (!label) {
      return c.json({ message: 'Label not found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    await issueLabelModel.remove(issue.id, label.id);

    const labels = await issueLabelModel.listByIssue(issue.id);
    return c.json(labels.map(formatLabel));
  });

  return app;
}
