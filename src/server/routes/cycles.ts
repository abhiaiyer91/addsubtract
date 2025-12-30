/**
 * REST API routes for cycles
 * These provide a REST interface that maps to the tRPC procedures
 */

import { Hono } from 'hono';
import { cycleModel, repoModel, issueModel } from '../../db/models';
import { authMiddleware } from '../middleware/auth';

export function createCycleRoutes(): Hono {
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
   * GET /api/repos/:owner/:repo/cycles
   * List cycles
   */
  app.get('/:owner/:repo/cycles', async (c) => {
    const { owner, repo } = c.req.param();
    const filter = c.req.query('filter') as 'past' | 'current' | 'upcoming' | undefined;
    
    const dbRepo = await getRepo(owner, repo);
    
    const cycles = await cycleModel.listByRepo(dbRepo.id, { filter });
    return c.json(cycles);
  });

  /**
   * GET /api/repos/:owner/:repo/cycles/current
   * Get current cycle
   */
  app.get('/:owner/:repo/cycles/current', async (c) => {
    const { owner, repo } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const cycle = await cycleModel.getCurrent(dbRepo.id);
    
    if (!cycle) {
      return c.json(null);
    }
    
    return c.json(cycle);
  });

  /**
   * GET /api/repos/:owner/:repo/cycles/velocity
   * Get velocity metrics
   */
  app.get('/:owner/:repo/cycles/velocity', async (c) => {
    const { owner, repo } = c.req.param();
    const count = c.req.query('count') ? parseInt(c.req.query('count')!, 10) : 5;
    
    const dbRepo = await getRepo(owner, repo);
    const velocity = await cycleModel.getVelocity(dbRepo.id, count);
    
    return c.json(velocity);
  });

  /**
   * GET /api/repos/:owner/:repo/cycles/:number
   * Get cycle by number
   */
  app.get('/:owner/:repo/cycles/:number', async (c) => {
    const { owner, repo, number } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const cycle = await cycleModel.findByNumber(dbRepo.id, parseInt(number, 10));
    
    if (!cycle) {
      return c.json({ error: 'Cycle not found' }, 404);
    }
    
    return c.json(cycle);
  });

  /**
   * POST /api/repos/:owner/:repo/cycles
   * Create cycle
   */
  app.post('/:owner/:repo/cycles', async (c) => {
    const { owner, repo } = c.req.param();
    const body = await c.req.json();
    
    const dbRepo = await getRepo(owner, repo);
    
    const cycle = await cycleModel.create({
      repoId: dbRepo.id,
      name: body.name,
      description: body.description,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    });
    
    return c.json(cycle, 201);
  });

  /**
   * PATCH /api/repos/:owner/:repo/cycles/:number
   * Update cycle
   */
  app.patch('/:owner/:repo/cycles/:number', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();
    
    const dbRepo = await getRepo(owner, repo);
    const cycle = await cycleModel.findByNumber(dbRepo.id, parseInt(number, 10));
    
    if (!cycle) {
      return c.json({ error: 'Cycle not found' }, 404);
    }
    
    const updates: Parameters<typeof cycleModel.update>[1] = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.startDate !== undefined) updates.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) updates.endDate = new Date(body.endDate);
    
    const updated = await cycleModel.update(cycle.id, updates);
    return c.json(updated);
  });

  /**
   * DELETE /api/repos/:owner/:repo/cycles/:number
   * Delete cycle
   */
  app.delete('/:owner/:repo/cycles/:number', async (c) => {
    const { owner, repo, number } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const cycle = await cycleModel.findByNumber(dbRepo.id, parseInt(number, 10));
    
    if (!cycle) {
      return c.json({ error: 'Cycle not found' }, 404);
    }
    
    await cycleModel.delete(cycle.id);
    return c.json({ success: true });
  });

  /**
   * GET /api/repos/:owner/:repo/cycles/:number/progress
   * Get cycle progress
   */
  app.get('/:owner/:repo/cycles/:number/progress', async (c) => {
    const { owner, repo, number } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const cycle = await cycleModel.findByNumber(dbRepo.id, parseInt(number, 10));
    
    if (!cycle) {
      return c.json({ error: 'Cycle not found' }, 404);
    }
    
    const progress = await cycleModel.getProgress(cycle.id);
    return c.json(progress);
  });

  /**
   * GET /api/repos/:owner/:repo/cycles/:number/issues
   * Get cycle issues
   */
  app.get('/:owner/:repo/cycles/:number/issues', async (c) => {
    const { owner, repo, number } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const cycle = await cycleModel.findByNumber(dbRepo.id, parseInt(number, 10));
    
    if (!cycle) {
      return c.json({ error: 'Cycle not found' }, 404);
    }
    
    const issues = await cycleModel.getIssues(cycle.id);
    return c.json(issues);
  });

  /**
   * POST /api/repos/:owner/:repo/cycles/:number/issues
   * Add issue to cycle
   */
  app.post('/:owner/:repo/cycles/:number/issues', async (c) => {
    const { owner, repo, number } = c.req.param();
    const body = await c.req.json();
    
    const dbRepo = await getRepo(owner, repo);
    const cycle = await cycleModel.findByNumber(dbRepo.id, parseInt(number, 10));
    
    if (!cycle) {
      return c.json({ error: 'Cycle not found' }, 404);
    }
    
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, body.issueNumber);
    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }
    
    await cycleModel.addIssue(cycle.id, issue.id);
    return c.json({ success: true });
  });

  /**
   * DELETE /api/repos/:owner/:repo/cycles/:number/issues/:issueNumber
   * Remove issue from cycle
   */
  app.delete('/:owner/:repo/cycles/:number/issues/:issueNumber', async (c) => {
    const { owner, repo, issueNumber } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const issue = await issueModel.findByRepoAndNumber(dbRepo.id, parseInt(issueNumber, 10));
    
    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }
    
    await cycleModel.removeIssue(issue.id);
    return c.json({ success: true });
  });

  return app;
}
