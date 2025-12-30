/**
 * REST API routes for repository management
 * These provide a REST interface that maps to the tRPC procedures
 */

import { Hono } from 'hono';
import * as path from 'path';
import * as fs from 'fs';
import {
  repoModel,
  userModel,
  orgModel,
  orgMemberModel,
  activityHelpers,
} from '../../db/models';
import { authMiddleware } from '../middleware/auth';
import { eventBus } from '../../events/bus';
import { exists, mkdirp } from '../../utils/fs';

// Helper to resolve disk paths
function resolveDiskPath(storedPath: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  const relativePath = storedPath.replace(/^\/repos\//, '');
  return path.isAbsolute(reposDir)
    ? path.join(reposDir, relativePath)
    : path.join(process.cwd(), reposDir, relativePath);
}

export function createRepoRoutes(): Hono {
  const app = new Hono();

  // Apply auth middleware
  app.use('*', authMiddleware);

  /**
   * POST /api/repos/:owner/:repo/transfer
   * Transfer a repository to a new owner (user or organization)
   */
  app.post('/:owner/:repo/transfer', async (c) => {
    const { owner, repo } = c.req.param();
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const userId = user.id;

    // Parse request body
    const body = await c.req.json<{
      newOwner: string;
      newOwnerType: 'user' | 'organization';
    }>();

    if (!body.newOwner || !body.newOwnerType) {
      return c.json({ error: 'newOwner and newOwnerType are required' }, 400);
    }

    // Find the repository
    const result = await repoModel.findByPath(owner, repo);
    if (!result) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const repoData = result.repo;

    // Check ownership - only the owner can transfer
    let isOwner = false;
    let previousOwnerName = '';

    if (repoData.ownerType === 'user') {
      isOwner = repoData.ownerId === userId;
      const ownerUser = await userModel.findById(repoData.ownerId);
      previousOwnerName = ownerUser?.username || ownerUser?.name || 'unknown';
    } else {
      // Organization - check if user is an owner of the org
      isOwner = await orgMemberModel.hasRole(repoData.ownerId, userId, 'owner');
      const org = await orgModel.findById(repoData.ownerId);
      previousOwnerName = org?.name || 'unknown';
    }

    if (!isOwner) {
      return c.json({ error: 'Only the repository owner can transfer it' }, 403);
    }

    // Resolve the new owner
    let newOwnerId: string;
    let newOwnerName: string;

    if (body.newOwnerType === 'user') {
      const newOwnerUser = await userModel.findByUsername(body.newOwner);
      if (!newOwnerUser) {
        return c.json({ error: `User '${body.newOwner}' not found` }, 404);
      }
      newOwnerId = newOwnerUser.id;
      newOwnerName = newOwnerUser.username || newOwnerUser.name || 'unknown';
    } else {
      const newOwnerOrg = await orgModel.findByName(body.newOwner);
      if (!newOwnerOrg) {
        return c.json({ error: `Organization '${body.newOwner}' not found` }, 404);
      }

      // Check if the current user is an admin/owner of the target org
      const hasPermission = await orgMemberModel.hasRole(newOwnerOrg.id, userId, 'admin');
      if (!hasPermission) {
        return c.json(
          { error: 'You must be an admin or owner of the target organization' },
          403
        );
      }

      newOwnerId = newOwnerOrg.id;
      newOwnerName = newOwnerOrg.name;
    }

    // Check if a repo with the same name already exists for the new owner
    const existingRepo = await repoModel.findByOwnerAndName(newOwnerId, repoData.name);
    if (existingRepo) {
      return c.json(
        { error: `A repository named '${repoData.name}' already exists for ${body.newOwner}` },
        409
      );
    }

    // Calculate the new disk path
    const newDiskPath = `/repos/${newOwnerName}/${repoData.name}.git`;

    // Move the repository on disk
    const oldAbsolutePath = resolveDiskPath(repoData.diskPath);
    const newAbsolutePath = resolveDiskPath(newDiskPath);

    // Ensure the target directory exists
    const newOwnerDir = path.dirname(newAbsolutePath);
    if (!exists(newOwnerDir)) {
      mkdirp(newOwnerDir);
    }

    // Check if old path exists before attempting to move
    if (exists(oldAbsolutePath)) {
      try {
        // Move the repository directory
        fs.renameSync(oldAbsolutePath, newAbsolutePath);
      } catch {
        // If rename fails (cross-device), try copy + delete
        try {
          fs.cpSync(oldAbsolutePath, newAbsolutePath, { recursive: true });
          fs.rmSync(oldAbsolutePath, { recursive: true, force: true });
        } catch (copyError) {
          return c.json(
            {
              error: `Failed to move repository on disk: ${copyError instanceof Error ? copyError.message : 'Unknown error'}`,
            },
            500
          );
        }
      }
    }

    // Update the database
    const updatedRepo = await repoModel.transfer(
      repoData.id,
      newOwnerId,
      body.newOwnerType,
      newDiskPath
    );

    if (!updatedRepo) {
      return c.json({ error: 'Failed to update repository record' }, 500);
    }

    // Log activity
    await activityHelpers.logRepoTransferred(
      userId,
      repoData.id,
      repoData.ownerId,
      previousOwnerName,
      newOwnerId,
      newOwnerName
    );

    // Emit event for repo transfer
    await eventBus.emit('repo.transferred', userId, {
      repoId: repoData.id,
      repoName: repoData.name,
      previousOwnerId: repoData.ownerId,
      previousOwnerName,
      newOwnerId,
      newOwnerName,
      newOwnerType: body.newOwnerType,
    });

    return c.json({
      success: true,
      repo: updatedRepo,
      previousOwner: previousOwnerName,
      newOwner: newOwnerName,
    });
  });

  return app;
}
