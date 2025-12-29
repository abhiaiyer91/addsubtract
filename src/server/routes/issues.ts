/**
 * REST API routes for issues
 * These provide a REST interface that maps to the tRPC procedures
 */

import { Hono } from 'hono';
import { issueModel, issueRelationModel, issueActivityModel, repoModel } from '../../db/models';
import { issueStageModel } from '../../db/models/issue-stage';
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

    // Handle assignee changes
    if (body.assignee !== undefined || body.assigneeId !== undefined) {
      const assigneeId = body.assigneeId ?? body.assignee;
      if (assigneeId) {
        await issueModel.assign(issue.id, assigneeId);
      } else {
        await issueModel.unassign(issue.id);
      }
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

  // ============ STAGE ROUTES ============

  /**
   * GET /api/repos/:owner/:repo/stages
   * List all custom stages for a repository
   */
  app.get('/:owner/:repo/stages', async (c) => {
    const { owner, repo } = c.req.param();

    const dbRepo = await getRepo(owner, repo);
    const stages = await issueStageModel.listByRepo(dbRepo.id);

    return c.json(stages);
  });

  /**
   * POST /api/repos/:owner/:repo/stages
   * Create a new custom stage
   */
  app.post('/:owner/:repo/stages', async (c) => {
    const { owner, repo } = c.req.param();
    const body = await c.req.json();

    const dbRepo = await getRepo(owner, repo);

    // Check if key already exists
    const existing = await issueStageModel.findByKey(dbRepo.id, body.key);
    if (existing) {
      return c.json({ error: 'Stage with this key already exists' }, 400);
    }

    const stage = await issueStageModel.create({
      repoId: dbRepo.id,
      key: body.key,
      name: body.name,
      description: body.description,
      icon: body.icon || '○',
      color: body.color || '6b7280',
      position: body.position,
      isClosedState: body.isClosedState || false,
      isTriageState: body.isTriageState || false,
      isDefault: body.isDefault || false,
      isSystem: false, // User-created stages are never system stages
    });

    return c.json(stage, 201);
  });

  /**
   * GET /api/repos/:owner/:repo/stages/:stageKey
   * Get a specific stage
   */
  app.get('/:owner/:repo/stages/:stageKey', async (c) => {
    const { owner, repo, stageKey } = c.req.param();

    const dbRepo = await getRepo(owner, repo);
    const stage = await issueStageModel.findByKey(dbRepo.id, stageKey);

    if (!stage) {
      return c.json({ error: 'Stage not found' }, 404);
    }

    return c.json(stage);
  });

  /**
   * PATCH /api/repos/:owner/:repo/stages/:stageKey
   * Update a stage
   */
  app.patch('/:owner/:repo/stages/:stageKey', async (c) => {
    const { owner, repo, stageKey } = c.req.param();
    const body = await c.req.json();

    const dbRepo = await getRepo(owner, repo);
    const stage = await issueStageModel.findByKey(dbRepo.id, stageKey);

    if (!stage) {
      return c.json({ error: 'Stage not found' }, 404);
    }

    const updates: Parameters<typeof issueStageModel.update>[1] = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.color !== undefined) updates.color = body.color;
    if (body.position !== undefined) updates.position = body.position;
    if (body.isClosedState !== undefined) updates.isClosedState = body.isClosedState;
    if (body.isTriageState !== undefined) updates.isTriageState = body.isTriageState;
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault;

    const updated = await issueStageModel.update(stage.id, updates);
    return c.json(updated);
  });

  /**
   * DELETE /api/repos/:owner/:repo/stages/:stageKey
   * Delete a stage (non-system stages only)
   */
  app.delete('/:owner/:repo/stages/:stageKey', async (c) => {
    const { owner, repo, stageKey } = c.req.param();

    const dbRepo = await getRepo(owner, repo);
    const stage = await issueStageModel.findByKey(dbRepo.id, stageKey);

    if (!stage) {
      return c.json({ error: 'Stage not found' }, 404);
    }

    if (stage.isSystem) {
      return c.json({ error: 'Cannot delete system stages' }, 400);
    }

    const deleted = await issueStageModel.delete(stage.id);
    if (!deleted) {
      return c.json({ error: 'Failed to delete stage' }, 500);
    }

    return c.json({ success: true });
  });

  /**
   * POST /api/repos/:owner/:repo/stages/reorder
   * Reorder stages
   */
  app.post('/:owner/:repo/stages/reorder', async (c) => {
    const { owner, repo } = c.req.param();
    const body = await c.req.json();

    const dbRepo = await getRepo(owner, repo);

    if (!Array.isArray(body.stageIds)) {
      return c.json({ error: 'stageIds must be an array' }, 400);
    }

    const stages = await issueStageModel.reorder(dbRepo.id, body.stageIds);
    return c.json(stages);
  });

  /**
   * POST /api/repos/:owner/:repo/stages/init
   * Initialize default stages for a repository
   */
  app.post('/:owner/:repo/stages/init', async (c) => {
    const { owner, repo } = c.req.param();

    const dbRepo = await getRepo(owner, repo);

    // Check if stages already exist
    const hasStages = await issueStageModel.hasStages(dbRepo.id);
    if (hasStages) {
      return c.json({ error: 'Repository already has stages configured' }, 400);
    }

    const stages = await issueStageModel.createDefaultStages(dbRepo.id);
    return c.json(stages, 201);
  });

  /**
   * PATCH /api/repos/:owner/:repo/issues/:number/stage
   * Update issue stage (using custom stage system)
   */
  app.patch('/:owner/:repo/issues/:number/stage', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();

    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    let updated;
    if (body.stageId) {
      updated = await issueModel.updateStage(issue.id, body.stageId);
    } else if (body.stageKey) {
      updated = await issueModel.updateStageByKey(issue.id, body.stageKey);
    } else {
      return c.json({ error: 'Either stageId or stageKey is required' }, 400);
    }

    if (!updated) {
      return c.json({ error: 'Failed to update stage' }, 500);
    }

    return c.json(updated);
  });

  /**
   * GET /api/repos/:owner/:repo/issues/board
   * Get issues grouped by stage (for Kanban board with custom stages)
   */
  app.get('/:owner/:repo/issues/board', async (c) => {
    const { owner, repo } = c.req.param();
    const query = c.req.query();

    const dbRepo = await getRepo(owner, repo);

    const result = await issueModel.listByRepoGroupedByStage(dbRepo.id, {
      state: query.state as 'open' | 'closed' | undefined,
      authorId: query.author,
      assigneeId: query.assignee,
    });

    // Convert Map to object for JSON serialization
    const issuesByStage: Record<string, unknown[]> = {};
    for (const [stageId, issues] of result.issuesByStage) {
      issuesByStage[stageId] = issues;
    }

    return c.json({
      stages: result.stages,
      issuesByStage,
    });
  });

  return app;
}
