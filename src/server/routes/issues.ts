/**
 * REST API routes for issues
 * These provide a REST interface that maps to the tRPC procedures
 */

import { Hono } from 'hono';
import { issueModel, issueRelationModel, issueActivityModel, repoModel } from '../../db/models';
import { authMiddleware } from '../middleware/auth';

type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled' | 'triage';
type IssuePriority = 'none' | 'urgent' | 'high' | 'medium' | 'low';

export function createIssueRoutes(): Hono {
  const app = new Hono();

  // Apply auth middleware
  app.use('*', authMiddleware);

  /**
   * Helper to get repo from owner/name
   */
  async function getRepo(owner: string, repo: string) {
    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      throw new Error('Repository not found');
    }
    return result.repo;
  }

  /**
   * GET /api/repos/:owner/:repo/issues
   * List issues with filters
   */
  app.get('/:owner/:repo/issues', async (c) => {
    const { owner, repo } = c.req.param();
    const query = c.req.query();

    const dbRepo = await getRepo(owner, repo);

    const options: Parameters<typeof issueModel.listByRepo>[1] = {
      state: query.state as 'open' | 'closed' | undefined,
      status: query.status as IssueStatus | undefined,
      priority: query.priority as IssuePriority | undefined,
      assigneeId: query.assignee,
      sortBy: query.sortBy as 'created' | 'updated' | 'priority' | undefined,
      sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    };

    const issues = await issueModel.listByRepo(dbRepo.id, options);
    return c.json(issues);
  });

  /**
   * GET /api/repos/:owner/:repo/issues/:number
   * Get single issue with details
   */
  app.get('/:owner/:repo/issues/:number', async (c) => {
    const { owner, repo, number } = c.req.param();

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    // Get relations if available
    let relations = null;
    try {
      const allRelations = await issueRelationModel.getRelations(issue.id);
      relations = {
        blocking: allRelations.blocks.map((r) => r.number),
        blockedBy: allRelations.blockedBy.map((r) => r.number),
        related: allRelations.relatesTo.map((r) => r.number),
        duplicates: allRelations.duplicates.map((r) => r.number),
        duplicatedBy: allRelations.duplicatedBy.map((r) => r.number),
      };
    } catch {
      // Relations not available
    }

    // Get sub-issue info if this is a parent
    let subIssueCount = 0;
    let subIssueProgress = 0;
    try {
      const subIssues = await issueModel.getSubIssues(issue.id);
      subIssueCount = subIssues.length;
      if (subIssueCount > 0) {
        const completed = subIssues.filter((s) => s.state === 'closed').length;
        subIssueProgress = Math.round((completed / subIssueCount) * 100);
      }
    } catch {
      // Sub-issues not available
    }

    return c.json({
      ...issue,
      relations,
      subIssueCount,
      subIssueProgress,
    });
  });

  /**
   * POST /api/repos/:owner/:repo/issues
   * Create a new issue
   */
  app.post('/:owner/:repo/issues', async (c) => {
    const { owner, repo } = c.req.param();
    const body = await c.req.json();
    const user = c.get('user');

    const dbRepo = await getRepo(owner, repo);

    const issue = await issueModel.create({
      repoId: dbRepo.id,
      authorId: user?.id || 'anonymous',
      title: body.title,
      body: body.body,
      priority: body.priority,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      estimate: body.estimate,
    });

    // Set parent if specified
    if (body.parentNumber) {
      const parent = await issueModel.findByRepoAndNumber(dbRepo.id, body.parentNumber);
      if (parent) {
        await issueModel.setParent(issue.id, parent.id);
      }
    }

    return c.json(issue, 201);
  });

  /**
   * PATCH /api/repos/:owner/:repo/issues/:number
   * Update an issue
   */
  app.patch('/:owner/:repo/issues/:number', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();
    const user = c.get('user');

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    // Handle state changes
    if (body.state === 'closed') {
      await issueModel.close(issue.id, user?.id || 'anonymous');
    } else if (body.state === 'open') {
      await issueModel.reopen(issue.id);
    }

    // Handle other updates
    const updates: Parameters<typeof issueModel.update>[1] = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.body !== undefined) updates.body = body.body;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.dueDate !== undefined) {
      updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.estimate !== undefined) updates.estimate = body.estimate;
    if (body.status !== undefined) updates.status = body.status;

    if (Object.keys(updates).length > 0) {
      await issueModel.update(issue.id, updates);
    }

    const updated = await issueModel.findById(issue.id);
    return c.json(updated);
  });

  /**
   * POST /api/repos/:owner/:repo/issues/:number/parent
   * Set parent issue
   */
  app.post('/:owner/:repo/issues/:number/parent', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    const parent = await issueModel.findByRepoAndNumber(dbRepo.id, body.parentNumber);
    if (!parent) {
      return c.json({ error: 'Parent issue not found' }, 404);
    }

    await issueModel.setParent(issue.id, parent.id);
    const updated = await issueModel.findById(issue.id);
    return c.json(updated);
  });

  /**
   * DELETE /api/repos/:owner/:repo/issues/:number/parent
   * Remove parent issue
   */
  app.delete('/:owner/:repo/issues/:number/parent', async (c) => {
    const { owner, repo, number } = c.req.param();

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    await issueModel.removeParent(issue.id);
    const updated = await issueModel.findById(issue.id);
    return c.json(updated);
  });

  /**
   * GET /api/repos/:owner/:repo/issues/:number/sub-issues
   * Get sub-issues
   */
  app.get('/:owner/:repo/issues/:number/sub-issues', async (c) => {
    const { owner, repo, number } = c.req.param();

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    const subIssues = await issueModel.getSubIssues(issue.id);
    return c.json(subIssues);
  });

  /**
   * POST /api/repos/:owner/:repo/issues/:number/relations
   * Add relation
   */
  app.post('/:owner/:repo/issues/:number/relations', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();
    const user = c.get('user');

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));
    const relatedIssue = await issueModel.findByRepoAndNumber(dbRepo.id, body.relatedNumber);

    if (!issue || !relatedIssue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    await issueRelationModel.addRelation(issue.id, relatedIssue.id, body.type, user?.id || 'anonymous');

    return c.json({ success: true });
  });

  /**
   * DELETE /api/repos/:owner/:repo/issues/:number/relations/:relatedNumber
   * Remove relation
   */
  app.delete('/:owner/:repo/issues/:number/relations/:relatedNumber', async (c) => {
    const { owner, repo, number, relatedNumber } = c.req.param();
    const type = c.req.query('type') as 'blocks' | 'relates_to' | 'duplicates';

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));
    const relatedIssue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(relatedNumber, 10));

    if (!issue || !relatedIssue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    await issueRelationModel.removeRelation(issue.id, relatedIssue.id, type);

    return c.json({ success: true });
  });

  /**
   * POST /api/repos/:owner/:repo/issues/:number/duplicate
   * Mark as duplicate
   */
  app.post('/:owner/:repo/issues/:number/duplicate', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();
    const user = c.get('user');

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));
    const canonicalIssue = await issueModel.findByRepoAndNumber(dbRepo.id, body.canonicalNumber);

    if (!issue || !canonicalIssue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    await issueRelationModel.markAsDuplicate(issue.id, canonicalIssue.id, user?.id || 'anonymous');

    // Close the duplicate
    await issueModel.close(issue.id, user?.id || 'anonymous');

    const updated = await issueModel.findById(issue.id);
    return c.json(updated);
  });

  /**
   * POST /api/repos/:owner/:repo/issues/:number/accept
   * Accept triage item
   */
  app.post('/:owner/:repo/issues/:number/accept', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    await issueModel.acceptTriage(issue.id, body.targetStatus || 'backlog');

    if (body.priority) {
      await issueModel.updatePriority(issue.id, body.priority);
    }

    const updated = await issueModel.findById(issue.id);
    return c.json(updated);
  });

  /**
   * POST /api/repos/:owner/:repo/issues/:number/reject
   * Reject triage item
   */
  app.post('/:owner/:repo/issues/:number/reject', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();
    const user = c.get('user');

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    await issueModel.rejectTriage(issue.id, user?.id || 'anonymous');

    const updated = await issueModel.findById(issue.id);
    return c.json(updated);
  });

  /**
   * GET /api/repos/:owner/:repo/issues/:number/activity
   * Get issue activity
   */
  app.get('/:owner/:repo/issues/:number/activity', async (c) => {
    const { owner, repo, number } = c.req.param();
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    const activities = await issueActivityModel.listByIssue(issue.id, { limit });
    return c.json(activities);
  });

  /**
   * GET /api/repos/:owner/:repo/issues/activity
   * Get repo activity
   */
  app.get('/:owner/:repo/issues/activity', async (c) => {
    const { owner, repo } = c.req.param();
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;

    const dbRepo = await getRepo(owner, repo);

    const activities = await issueActivityModel.listByRepo(dbRepo.id, { limit });
    return c.json(activities);
  });

  /**
   * POST /api/repos/:owner/:repo/issues/:number/comments
   * Add comment
   */
  app.post('/:owner/:repo/issues/:number/comments', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();
    const user = c.get('user');

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    // Use the comments model to add comment
    // For now, just log activity
    await issueActivityModel.logCommented(issue.id, user?.id || 'anonymous', body.body);

    return c.json({ id: 'comment-id', body: body.body });
  });

  return app;
}
