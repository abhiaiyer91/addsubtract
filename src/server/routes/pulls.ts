/**
 * REST API routes for pull requests
 * These provide a REST interface that maps to the tRPC procedures
 */

import { Hono } from 'hono';
import {
  prModel,
  repoModel,
  collaboratorModel,
  activityHelpers,
} from '../../db/models';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { mergePullRequest, checkMergeability, getDefaultMergeMessage } from '../storage/merge';
import { resolveDiskPath } from '../storage/repos';
import { exists } from '../../utils/fs';
import { eventBus } from '../../events/bus';

export function createPullRoutes(): Hono {
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
   * GET /api/repos/:owner/:repo/pulls
   * List pull requests with filters
   */
  app.get('/:owner/:repo/pulls', async (c) => {
    const { owner, repo } = c.req.param();
    const query = c.req.query();

    const dbRepo = await getRepo(owner, repo);

    const options: Parameters<typeof prModel.listByRepo>[1] = {
      state: query.state as 'open' | 'closed' | 'merged' | undefined,
      authorId: query.authorId,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    };

    const prs = await prModel.listByRepo(dbRepo.id, options);

    // Fetch authors for each PR
    const prsWithDetails = await Promise.all(
      prs.map(async (pr) => {
        const result = await prModel.findWithAuthor(pr.id);
        return {
          ...pr,
          author: result?.author ?? null,
        };
      })
    );

    return c.json(prsWithDetails);
  });

  /**
   * GET /api/repos/:owner/:repo/pulls/:number
   * Get single pull request
   */
  app.get('/:owner/:repo/pulls/:number', async (c) => {
    const { owner, repo, number } = c.req.param();

    const dbRepo = await getRepo(owner, repo);
    const pr = await prModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ error: 'Pull request not found' }, 404);
    }

    const authorResult = await prModel.findWithAuthor(pr.id);

    return c.json({
      ...pr,
      author: authorResult?.author ?? null,
    });
  });

  /**
   * POST /api/repos/:owner/:repo/pulls
   * Create a new pull request
   */
  app.post('/:owner/:repo/pulls', requireAuth, async (c) => {
    const { owner, repo } = c.req.param();
    const user = c.get('user')!; // Non-null: requireAuth guarantees user exists
    const body = await c.req.json<{
      title: string;
      body?: string;
      sourceBranch: string;
      targetBranch: string;
      headSha: string;
      baseSha: string;
      isDraft?: boolean;
    }>();

    const dbRepo = await getRepo(owner, repo);

    const pr = await prModel.create({
      repoId: dbRepo.id,
      title: body.title,
      body: body.body,
      sourceBranch: body.sourceBranch,
      targetBranch: body.targetBranch,
      headSha: body.headSha,
      baseSha: body.baseSha,
      authorId: user.id,
      isDraft: body.isDraft ?? false,
      state: 'open',
    });

    // Log activity
    await activityHelpers.logPrOpened(user.id, dbRepo.id, pr.number, pr.title);

    // Emit pr.created event
    await eventBus.emit('pr.created', user.id, {
      prId: pr.id,
      prNumber: pr.number,
      prTitle: pr.title,
      repoId: dbRepo.id,
      repoFullName: `${owner}/${repo}`,
      sourceBranch: body.sourceBranch,
      targetBranch: body.targetBranch,
    });

    return c.json(pr, 201);
  });

  /**
   * PATCH /api/repos/:owner/:repo/pulls/:number
   * Update a pull request
   */
  app.patch('/:owner/:repo/pulls/:number', requireAuth, async (c) => {
    const { owner, repo, number } = c.req.param();
    const user = c.get('user')!; // Non-null: requireAuth guarantees user exists
    const body = await c.req.json<{
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
      isDraft?: boolean;
    }>();

    const dbRepo = await getRepo(owner, repo);
    const pr = await prModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ error: 'Pull request not found' }, 404);
    }

    // Check permissions
    const isAuthor = pr.authorId === user.id;
    const isAdmin = await collaboratorModel.hasPermission(pr.repoId, user.id, 'admin');

    if (!isAuthor && !isAdmin) {
      return c.json({ error: 'You do not have permission to update this pull request' }, 403);
    }

    // Handle state changes
    if (body.state === 'closed' && pr.state === 'open') {
      const closedPr = await prModel.close(pr.id);
      await activityHelpers.logPrClosed(user.id, pr.repoId, pr.number, pr.title);
      return c.json(closedPr);
    }

    if (body.state === 'open' && pr.state === 'closed') {
      const reopenedPr = await prModel.reopen(pr.id);
      return c.json(reopenedPr);
    }

    // Handle other updates
    const updates: Record<string, string | boolean | undefined> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.body !== undefined) updates.body = body.body;
    if (body.isDraft !== undefined) updates.isDraft = body.isDraft;

    const updatedPr = await prModel.update(pr.id, updates);
    return c.json(updatedPr);
  });

  /**
   * PUT /api/repos/:owner/:repo/pulls/:number/merge
   * Merge a pull request
   */
  app.put('/:owner/:repo/pulls/:number/merge', requireAuth, async (c) => {
    const { owner, repo, number } = c.req.param();
    const user = c.get('user')!; // Non-null: requireAuth guarantees user exists
    const body = await c.req.json<{
      mergeMethod?: 'merge' | 'squash' | 'rebase';
      message?: string;
    }>().catch(() => ({ mergeMethod: undefined, message: undefined }));

    const dbRepo = await getRepo(owner, repo);
    const pr = await prModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ error: 'Pull request not found' }, 404);
    }

    if (pr.state !== 'open') {
      return c.json({ error: 'Pull request is not open' }, 400);
    }

    // Check write permission
    const isOwner = dbRepo.ownerId === user.id;
    const canWrite = isOwner || (await collaboratorModel.hasPermission(pr.repoId, user.id, 'write'));

    if (!canWrite) {
      return c.json({ error: 'You do not have permission to merge this pull request' }, 403);
    }

    // Resolve disk path
    const diskPath = resolveDiskPath(dbRepo.diskPath);

    if (!exists(diskPath)) {
      return c.json({ error: 'Repository not found on disk' }, 500);
    }

    const strategy = body.mergeMethod || 'merge';

    // Generate merge message if not provided
    const mergeMessage = body.message || getDefaultMergeMessage(
      pr.number,
      pr.title,
      pr.sourceBranch,
      pr.targetBranch,
      strategy
    );

    // Actually perform the Git merge
    const mergeResult = await mergePullRequest(
      diskPath,
      pr.sourceBranch,
      pr.targetBranch,
      {
        authorName: user.name || user.username || 'Unknown',
        authorEmail: user.email,
        message: mergeMessage,
        strategy,
      }
    );

    if (!mergeResult.success) {
      return c.json({
        merged: false,
        error: mergeResult.error || 'Merge failed',
        conflicts: mergeResult.conflicts,
      }, 409);
    }

    // Update database with merge info
    const mergedPr = await prModel.merge(pr.id, user.id, mergeResult.mergeSha!);

    // Log activity
    if (mergedPr) {
      await activityHelpers.logPrMerged(user.id, pr.repoId, pr.number, pr.title);

      // Emit pr.merged event
      await eventBus.emit('pr.merged', user.id, {
        prId: pr.id,
        prNumber: pr.number,
        prTitle: pr.title,
        repoId: pr.repoId,
        repoFullName: `${owner}/${repo}`,
        authorId: pr.authorId,
        mergeStrategy: strategy,
      });
    }

    return c.json({
      merged: true,
      sha: mergeResult.mergeSha,
      message: `Pull request #${pr.number} merged`,
    });
  });

  /**
   * POST /api/repos/:owner/:repo/pulls/:number/comments
   * Add a comment to a pull request
   */
  app.post('/:owner/:repo/pulls/:number/comments', requireAuth, async (c) => {
    const { owner, repo, number } = c.req.param();
    const user = c.get('user')!; // Non-null: requireAuth guarantees user exists
    const body = await c.req.json<{ body: string }>();

    const dbRepo = await getRepo(owner, repo);
    const pr = await prModel.findByRepoAndNumber(dbRepo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ error: 'Pull request not found' }, 404);
    }

    // Import the comment model
    const { prCommentModel } = await import('../../db/models');

    const comment = await prCommentModel.create({
      prId: pr.id,
      userId: user.id,
      body: body.body,
    });

    return c.json(comment, 201);
  });

  return app;
}
