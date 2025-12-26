import { RepoManager } from './repos';
import { repoModel, userModel } from '../../db/models';
import { isConnected } from '../../db';

/**
 * Sync result for a single repository
 */
export interface SyncResult {
  owner: string;
  name: string;
  action: 'created' | 'skipped' | 'error';
  message?: string;
}

/**
 * Sync all existing bare repositories to the database
 * Creates placeholder users for owners that don't exist
 */
export async function syncReposToDatabase(
  repoManager: RepoManager
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  // Check if database is connected
  if (!(await isConnected())) {
    console.warn('[sync] Database not connected - skipping sync');
    return results;
  }

  const bareRepos = repoManager.listRepos();

  console.log(`[sync] Found ${bareRepos.length} bare repositories to sync`);

  for (const info of bareRepos) {
    try {
      // Check if repo already exists in database
      const existingDbRepo = await repoModel.findByPath(info.owner, info.name);

      if (existingDbRepo) {
        results.push({
          owner: info.owner,
          name: info.name,
          action: 'skipped',
          message: 'Already exists in database',
        });
        continue;
      }

      // Find or create user
      let user = await userModel.findByUsername(info.owner);

      if (!user) {
        // Create placeholder user
        user = await userModel.create({
          username: info.owner,
          email: `${info.owner}@placeholder.local`,
          name: info.owner,
        });
        console.log(`[sync] Created placeholder user: ${info.owner}`);
      }

      // Create repo record
      await repoModel.create({
        ownerId: user.id,
        ownerType: 'user',
        name: info.name,
        diskPath: info.path,
        defaultBranch: 'main',
        isPrivate: false,
      });

      console.log(`[sync] Synced repo: ${info.owner}/${info.name}`);
      results.push({
        owner: info.owner,
        name: info.name,
        action: 'created',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[sync] Failed to sync ${info.owner}/${info.name}: ${message}`);
      results.push({
        owner: info.owner,
        name: info.name,
        action: 'error',
        message,
      });
    }
  }

  console.log(`[sync] Sync complete: ${results.filter(r => r.action === 'created').length} created, ${results.filter(r => r.action === 'skipped').length} skipped, ${results.filter(r => r.action === 'error').length} errors`);

  return results;
}

/**
 * Sync a single repository to the database
 */
export async function syncRepoToDatabase(
  repoManager: RepoManager,
  owner: string,
  name: string
): Promise<SyncResult> {
  // Check if database is connected
  if (!(await isConnected())) {
    return {
      owner,
      name,
      action: 'error',
      message: 'Database not connected',
    };
  }

  try {
    // Check if repo exists on disk
    if (!repoManager.exists(owner, name)) {
      return {
        owner,
        name,
        action: 'error',
        message: 'Repository not found on disk',
      };
    }

    // Check if repo already exists in database
    const existingDbRepo = await repoModel.findByPath(owner, name);

    if (existingDbRepo) {
      return {
        owner,
        name,
        action: 'skipped',
        message: 'Already exists in database',
      };
    }

    // Find or create user
    let user = await userModel.findByUsername(owner);

    if (!user) {
      // Create placeholder user
      user = await userModel.create({
        username: owner,
        email: `${owner}@placeholder.local`,
        name: owner,
      });
      console.log(`[sync] Created placeholder user: ${owner}`);
    }

    // Get the repo path
    const repoPath = repoManager.getRepo(owner, name, false)?.gitDir;

    if (!repoPath) {
      return {
        owner,
        name,
        action: 'error',
        message: 'Could not resolve repository path',
      };
    }

    // Create repo record
    await repoModel.create({
      ownerId: user.id,
      ownerType: 'user',
      name,
      diskPath: repoPath,
      defaultBranch: 'main',
      isPrivate: false,
    });

    console.log(`[sync] Synced repo: ${owner}/${name}`);
    return {
      owner,
      name,
      action: 'created',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[sync] Failed to sync ${owner}/${name}: ${message}`);
    return {
      owner,
      name,
      action: 'error',
      message,
    };
  }
}
