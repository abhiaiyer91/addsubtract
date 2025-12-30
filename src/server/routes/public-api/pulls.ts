/**
 * Public API - Pull Request Routes
 *
 * Endpoints:
 * - GET /repos/:owner/:repo/pulls - List pull requests
 * - GET /repos/:owner/:repo/pulls/:number - Get a pull request
 * - POST /repos/:owner/:repo/pulls - Create a pull request
 * - PATCH /repos/:owner/:repo/pulls/:number - Update a pull request
 * - PUT /repos/:owner/:repo/pulls/:number/merge - Merge a pull request
 * - GET /repos/:owner/:repo/pulls/:number/reviews - List reviews
 * - POST /repos/:owner/:repo/pulls/:number/reviews - Create a review
 */

import { Hono } from 'hono';
import { prModel, repoModel, userModel, prReviewModel, prCommentModel } from '../../../db/models';
import { requireAuth, requireScopes, parsePagination } from './middleware';
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
 * Format pull request response
 */
function formatPullRequest(pr: any, owner: string, repo: string, author?: any) {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state === 'merged' ? 'closed' : pr.state,
    locked: pr.locked || false,
    user: author ? formatUser(author) : null,
    draft: pr.isDraft || false,
    head: {
      label: `${owner}:${pr.sourceBranch}`,
      ref: pr.sourceBranch,
      sha: pr.headSha,
    },
    base: {
      label: `${owner}:${pr.targetBranch}`,
      ref: pr.targetBranch,
      sha: pr.baseSha,
    },
    merged: pr.state === 'merged',
    mergeable: pr.isMergeable,
    merged_by: pr.mergedBy ? formatUser(pr.mergedBy) : null,
    merged_at: pr.mergedAt,
    merge_commit_sha: pr.mergeCommitSha,
    comments: pr.commentsCount || 0,
    commits: pr.commitsCount || 0,
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    changed_files: pr.changedFiles || 0,
    created_at: pr.createdAt,
    updated_at: pr.updatedAt,
    closed_at: pr.closedAt,
    html_url: `/${owner}/${repo}/pull/${pr.number}`,
    url: `/api/v1/repos/${owner}/${repo}/pulls/${pr.number}`,
    diff_url: `/${owner}/${repo}/pull/${pr.number}.diff`,
    patch_url: `/${owner}/${repo}/pull/${pr.number}.patch`,
    commits_url: `/api/v1/repos/${owner}/${repo}/pulls/${pr.number}/commits`,
    review_comments_url: `/api/v1/repos/${owner}/${repo}/pulls/${pr.number}/comments`,
  };
}

/**
 * Format review response
 */
function formatReview(review: any, owner: string, repo: string, prNumber: number, user?: any) {
  return {
    id: review.id,
    user: user ? formatUser(user) : null,
    body: review.body,
    state: review.state?.toUpperCase() || 'COMMENTED',
    submitted_at: review.submittedAt || review.createdAt,
    commit_id: review.commitSha,
    html_url: `/${owner}/${repo}/pull/${prNumber}#pullrequestreview-${review.id}`,
    pull_request_url: `/api/v1/repos/${owner}/${repo}/pulls/${prNumber}`,
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

export function createPullRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /repos/:owner/:repo/pulls
   * List pull requests for a repository
   */
  app.get('/:owner/:repo/pulls', async (c) => {
    const { owner, repo } = c.req.param();
    const userId = c.get('user')?.id;
    const { perPage, offset } = parsePagination(c);

    const state = (c.req.query('state') || 'open') as 'open' | 'closed' | 'all';
    const sort = c.req.query('sort') || 'created';
    const direction = c.req.query('direction') || 'desc';
    const head = c.req.query('head');
    const base = c.req.query('base');

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const options: any = {
      state: state === 'all' ? undefined : state,
      sortBy: sort,
      sortOrder: direction as 'asc' | 'desc',
      limit: perPage,
      offset,
    };

    if (head) {
      const branch = head.includes(':') ? head.split(':')[1] : head;
      options.sourceBranch = branch;
    }

    if (base) {
      options.targetBranch = base;
    }

    const prs = await prModel.listByRepo(result.repo.id, options);

    const formattedPrs = await Promise.all(
      prs.map(async (pr) => {
        const author = pr.authorId ? await userModel.findById(pr.authorId) : null;
        return formatPullRequest(pr, owner, repo, author);
      })
    );

    return c.json(formattedPrs);
  });

  /**
   * GET /repos/:owner/:repo/pulls/:number
   * Get a single pull request
   */
  app.get('/:owner/:repo/pulls/:number', async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const pr = await prModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const author = pr.authorId ? await userModel.findById(pr.authorId) : null;

    return c.json(formatPullRequest(pr, owner, repo, author));
  });

  /**
   * POST /repos/:owner/:repo/pulls
   * Create a pull request
   */
  app.post('/:owner/:repo/pulls', requireAuth, requireScopes('pull:write'), async (c) => {
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
      return c.json({ message: 'Validation Failed', errors: [{ resource: 'PullRequest', field: 'title', code: 'missing_field' }] }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    if (!body.head) {
      return c.json({ message: 'Validation Failed', errors: [{ resource: 'PullRequest', field: 'head', code: 'missing_field' }] }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    if (!body.base) {
      return c.json({ message: 'Validation Failed', errors: [{ resource: 'PullRequest', field: 'base', code: 'missing_field' }] }, 422 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const headBranch = body.head.includes(':') ? body.head.split(':')[1] : body.head;

    // For now, we'll create a placeholder for the SHAs
    // In a real implementation, these would be resolved from the repository
    const headSha = body.head_sha || 'placeholder';
    const baseSha = body.base_sha || 'placeholder';

    const pr = await prModel.create({
      repoId: result.repo.id,
      authorId: userId,
      title: body.title,
      body: body.body,
      sourceBranch: headBranch,
      targetBranch: body.base,
      headSha,
      baseSha,
      isDraft: body.draft || false,
    });

    await eventBus.emit('pr.created', userId, {
      prId: pr.id,
      prNumber: pr.number,
      prTitle: pr.title,
      repoId: result.repo.id,
      repoFullName: `${owner}/${repo}`,
      sourceBranch: headBranch,
      targetBranch: body.base,
    });

    const author = await userModel.findById(userId);

    return c.json(formatPullRequest(pr, owner, repo, author), 201 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
  });

  /**
   * PATCH /repos/:owner/:repo/pulls/:number
   * Update a pull request
   */
  app.patch('/:owner/:repo/pulls/:number', requireAuth, requireScopes('pull:write'), async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const result = await getRepoWithAccess(owner, repo, userId, 'write');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const pr = await prModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();

    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.body !== undefined) updates.body = body.body;
    if (body.state !== undefined) updates.state = body.state;
    if (body.base !== undefined) updates.targetBranch = body.base;

    if (Object.keys(updates).length > 0) {
      await prModel.update(pr.id, updates);
    }

    const updatedPr = await prModel.findById(pr.id);
    const author = updatedPr?.authorId ? await userModel.findById(updatedPr.authorId) : null;

    return c.json(formatPullRequest(updatedPr, owner, repo, author));
  });

  /**
   * PUT /repos/:owner/:repo/pulls/:number/merge
   * Merge a pull request
   */
  app.put('/:owner/:repo/pulls/:number/merge', requireAuth, requireScopes('pull:write'), async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const result = await getRepoWithAccess(owner, repo, userId, 'write');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const pr = await prModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    if (pr.state !== 'open') {
      return c.json({ message: 'Pull Request is not mergeable' }, 405 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json().catch(() => ({}));

    // Get user info for merge commit
    const mergeUser = await userModel.findById(userId);
    if (!mergeUser) {
      return c.json({ message: 'User not found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Perform merge using the existing merge function
    const { mergePullRequest } = await import('../../storage/merge');
    const mergeResult = await mergePullRequest(
      result.repo.diskPath,
      pr.sourceBranch,
      pr.targetBranch,
      {
        message: body.commit_message,
        authorName: mergeUser.name || mergeUser.username || 'Unknown',
        authorEmail: mergeUser.email,
        strategy: body.merge_method || 'merge',
      }
    );

    if (!mergeResult.success) {
      return c.json({
        message: mergeResult.error || 'Merge failed',
      }, 405 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    // Update PR status
    await prModel.merge(pr.id, userId, mergeResult.mergeSha || 'merged');

    await eventBus.emit('pr.merged', userId, {
      prId: pr.id,
      prNumber: pr.number,
      prTitle: pr.title,
      repoId: result.repo.id,
      repoFullName: `${owner}/${repo}`,
      authorId: pr.authorId,
      mergeStrategy: (body.merge_method || 'merge') as 'merge' | 'squash' | 'rebase',
    });

    return c.json({
      sha: mergeResult.mergeSha,
      merged: true,
      message: 'Pull Request successfully merged',
    });
  });

  /**
   * GET /repos/:owner/:repo/pulls/:number/reviews
   * List reviews on a pull request
   */
  app.get('/:owner/:repo/pulls/:number/reviews', async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const pr = await prModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const reviews = await prReviewModel.listByPr(pr.id);

    const formattedReviews = await Promise.all(
      reviews.map(async (review) => {
        const user = review.userId ? await userModel.findById(review.userId) : null;
        return formatReview(review, owner, repo, parseInt(number, 10), user);
      })
    );

    return c.json(formattedReviews);
  });

  /**
   * POST /repos/:owner/:repo/pulls/:number/reviews
   * Create a review
   */
  app.post('/:owner/:repo/pulls/:number/reviews', requireAuth, requireScopes('pull:write'), async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ message: 'Requires authentication' }, 401 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const result = await getRepoWithAccess(owner, repo, userId, 'write');

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const pr = await prModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const body = await c.req.json();

    // Map event to state
    type ReviewState = 'pending' | 'commented' | 'approved' | 'changes_requested';
    let state: ReviewState = 'commented';
    if (body.event === 'APPROVE') state = 'approved';
    else if (body.event === 'REQUEST_CHANGES') state = 'changes_requested';
    else if (body.event === 'COMMENT') state = 'commented';

    const review = await prReviewModel.create({
      prId: pr.id,
      userId,
      body: body.body || null,
      state,
      commitSha: body.commit_id || pr.headSha,
    });

    // Handle inline comments
    if (body.comments?.length > 0) {
      for (const comment of body.comments) {
        await prCommentModel.create({
          prId: pr.id,
          reviewId: review.id,
          userId,
          body: comment.body,
          path: comment.path,
          line: comment.line,
          side: comment.side,
          commitSha: body.commit_id || pr.headSha,
        });
      }
    }

    const user = await userModel.findById(userId);

    return c.json(formatReview(review, owner, repo, parseInt(number, 10), user));
  });

  /**
   * GET /repos/:owner/:repo/pulls/:number/comments
   * List review comments on a pull request
   */
  app.get('/:owner/:repo/pulls/:number/comments', async (c) => {
    const { owner, repo, number } = c.req.param();
    const userId = c.get('user')?.id;

    const result = await getRepoWithAccess(owner, repo, userId);

    if (result.error) {
      return c.json({ message: result.error }, result.status as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const pr = await prModel.findByRepoAndNumber(result.repo.id, parseInt(number, 10));

    if (!pr) {
      return c.json({ message: 'Not Found' }, 404 as 200 | 201 | 400 | 401 | 403 | 404 | 405 | 422 | 500);
    }

    const comments = await prCommentModel.listByPr(pr.id);

    const formattedComments = await Promise.all(
      comments.map(async (comment) => {
        const user = comment.userId ? await userModel.findById(comment.userId) : null;
        return {
          id: comment.id,
          pull_request_review_id: comment.reviewId,
          path: comment.path,
          line: comment.line,
          side: comment.side,
          commit_id: comment.commitSha,
          user: user ? formatUser(user) : null,
          body: comment.body,
          created_at: comment.createdAt,
          updated_at: comment.updatedAt,
          html_url: `/${owner}/${repo}/pull/${number}#discussion_r${comment.id}`,
          pull_request_url: `/api/v1/repos/${owner}/${repo}/pulls/${number}`,
          url: `/api/v1/repos/${owner}/${repo}/pulls/comments/${comment.id}`,
        };
      })
    );

    return c.json(formattedComments);
  });

  return app;
}
