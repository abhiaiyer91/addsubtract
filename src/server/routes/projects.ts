/**
 * REST API routes for projects
 * These provide a REST interface that maps to the tRPC procedures
 */

import { Hono } from 'hono';
import { projectModel, repoModel } from '../../db/models';
import { authMiddleware } from '../middleware/auth';

export function createProjectRoutes(): Hono {
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
   * GET /api/repos/:owner/:repo/projects
   * List projects
   */
  app.get('/:owner/:repo/projects', async (c) => {
    const { owner, repo } = c.req.param();
    const status = c.req.query('status');
    
    const dbRepo = await getRepo(owner, repo);
    
    const projects = await projectModel.listByRepo(dbRepo.id, {
      status: status as 'backlog' | 'planned' | 'in_progress' | 'paused' | 'completed' | 'canceled' | undefined,
    });
    
    return c.json(projects);
  });

  /**
   * GET /api/repos/:owner/:repo/projects/:name
   * Get project by name
   */
  app.get('/:owner/:repo/projects/:name', async (c) => {
    const { owner, repo, name } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const project = await projectModel.findByRepoAndName(dbRepo.id, decodeURIComponent(name));
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    return c.json(project);
  });

  /**
   * POST /api/repos/:owner/:repo/projects
   * Create project
   */
  app.post('/:owner/:repo/projects', async (c) => {
    const { owner, repo } = c.req.param();
    const body = await c.req.json();
    
    const dbRepo = await getRepo(owner, repo);
    
    const project = await projectModel.create({
      repoId: dbRepo.id,
      name: body.name,
      description: body.description,
      leadId: body.leadId,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
    });
    
    return c.json(project, 201);
  });

  /**
   * PATCH /api/repos/:owner/:repo/projects/:name
   * Update project
   */
  app.patch('/:owner/:repo/projects/:name', async (c) => {
    const { owner, repo, name } = c.req.param();
    const body = await c.req.json();
    
    const dbRepo = await getRepo(owner, repo);
    const project = await projectModel.findByRepoAndName(dbRepo.id, decodeURIComponent(name));
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    const updates: Parameters<typeof projectModel.update>[1] = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.leadId !== undefined) updates.leadId = body.leadId;
    if (body.startDate !== undefined) {
      updates.startDate = body.startDate ? new Date(body.startDate) : undefined;
    }
    if (body.targetDate !== undefined) {
      updates.targetDate = body.targetDate ? new Date(body.targetDate) : undefined;
    }
    
    const updated = await projectModel.update(project.id, updates);
    return c.json(updated);
  });

  /**
   * DELETE /api/repos/:owner/:repo/projects/:name
   * Delete project
   */
  app.delete('/:owner/:repo/projects/:name', async (c) => {
    const { owner, repo, name } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const project = await projectModel.findByRepoAndName(dbRepo.id, decodeURIComponent(name));
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    await projectModel.delete(project.id);
    return c.json({ success: true });
  });

  /**
   * GET /api/repos/:owner/:repo/projects/:name/progress
   * Get project progress
   */
  app.get('/:owner/:repo/projects/:name/progress', async (c) => {
    const { owner, repo, name } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const project = await projectModel.findByRepoAndName(dbRepo.id, decodeURIComponent(name));
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    const progress = await projectModel.getProgress(project.id);
    return c.json(progress);
  });

  /**
   * GET /api/repos/:owner/:repo/projects/:name/issues
   * Get project issues
   */
  app.get('/:owner/:repo/projects/:name/issues', async (c) => {
    const { owner, repo, name } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const project = await projectModel.findByRepoAndName(dbRepo.id, decodeURIComponent(name));
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    const issues = await projectModel.getIssues(project.id);
    return c.json(issues);
  });

  /**
   * POST /api/repos/:owner/:repo/projects/:name/complete
   * Complete project
   */
  app.post('/:owner/:repo/projects/:name/complete', async (c) => {
    const { owner, repo, name } = c.req.param();
    
    const dbRepo = await getRepo(owner, repo);
    const project = await projectModel.findByRepoAndName(dbRepo.id, decodeURIComponent(name));
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    const completed = await projectModel.complete(project.id);
    return c.json(completed);
  });

  return app;
}
