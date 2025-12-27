import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { repoModel, collaboratorModel } from '../../../db/models';
import { exists, readFile, writeFile, mkdirp } from '../../../utils/fs';

/**
 * Stack metadata stored in the repository
 */
interface StackMetadata {
  name: string;
  baseBranch: string;
  baseCommit: string;
  branches: string[];
  createdAt: number;
  updatedAt: number;
  description?: string;
}

/**
 * Stack visualization node
 */
export interface StackNode {
  branch: string;
  commit: string;
  message: string;
  isCurrent: boolean;
  status: 'synced' | 'behind' | 'ahead' | 'diverged';
  behindBy?: number;
  aheadBy?: number;
}

/**
 * Get the stacks directory for a repository
 */
function getStacksDir(diskPath: string): string {
  return path.join(diskPath, 'stacks');
}

/**
 * Get the meta file path for stacks
 */
function getMetaFile(diskPath: string): string {
  return path.join(getStacksDir(diskPath), 'stacks.json');
}

/**
 * Initialize stacks directory
 */
function initStacksDir(diskPath: string): void {
  const stacksDir = getStacksDir(diskPath);
  mkdirp(stacksDir);
  const metaFile = getMetaFile(diskPath);
  if (!exists(metaFile)) {
    writeFile(metaFile, JSON.stringify({ stacks: [] }, null, 2));
  }
}

/**
 * Load stacks metadata
 */
function loadMeta(diskPath: string): { stacks: string[] } {
  initStacksDir(diskPath);
  const metaFile = getMetaFile(diskPath);
  try {
    const content = readFile(metaFile).toString('utf8');
    return JSON.parse(content);
  } catch {
    return { stacks: [] };
  }
}

/**
 * Save stacks metadata
 */
function saveMeta(diskPath: string, meta: { stacks: string[] }): void {
  initStacksDir(diskPath);
  const metaFile = getMetaFile(diskPath);
  writeFile(metaFile, JSON.stringify(meta, null, 2));
}

/**
 * Get a specific stack
 */
function getStack(diskPath: string, name: string): StackMetadata | null {
  const stackFile = path.join(getStacksDir(diskPath), `${name}.json`);
  if (!exists(stackFile)) {
    return null;
  }
  try {
    const content = readFile(stackFile).toString('utf8');
    return JSON.parse(content) as StackMetadata;
  } catch {
    return null;
  }
}

/**
 * Save a stack
 */
function saveStack(diskPath: string, stack: StackMetadata): void {
  initStacksDir(diskPath);
  const stackFile = path.join(getStacksDir(diskPath), `${stack.name}.json`);
  writeFile(stackFile, JSON.stringify(stack, null, 2));
}

/**
 * Delete a stack file
 */
function deleteStackFile(diskPath: string, name: string): void {
  const stackFile = path.join(getStacksDir(diskPath), `${name}.json`);
  if (exists(stackFile)) {
    require('fs').unlinkSync(stackFile);
  }
}

/**
 * Get the absolute disk path for a repository
 */
function getAbsoluteDiskPath(diskPath: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  return path.isAbsolute(diskPath)
    ? diskPath
    : path.join(process.cwd(), reposDir, diskPath.replace(/^\/repos\//, ''));
}

/**
 * Helper to get BareRepository from disk path
 */
async function getBareRepo(diskPath: string) {
  const { BareRepository } = await import('../../../server/storage/repos');
  const absolutePath = getAbsoluteDiskPath(diskPath);
  
  if (!exists(absolutePath) || !exists(path.join(absolutePath, 'objects'))) {
    return null;
  }
  
  return new BareRepository(absolutePath);
}

export const stacksRouter = router({
  /**
   * List all stacks in a repository
   */
  list: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access for private repos
      if (result.repo.isPrivate) {
        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const isOwner = result.repo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this repository',
          });
        }
      }

      const absolutePath = getAbsoluteDiskPath(result.repo.diskPath);
      const meta = loadMeta(absolutePath);
      
      // Get details for each stack
      const stacks = meta.stacks.map(name => {
        const stack = getStack(absolutePath, name);
        return stack ? {
          name: stack.name,
          baseBranch: stack.baseBranch,
          branchCount: stack.branches.length,
          description: stack.description,
          createdAt: new Date(stack.createdAt),
          updatedAt: new Date(stack.updatedAt),
        } : null;
      }).filter(Boolean);

      return stacks;
    }),

  /**
   * Get a specific stack with visualization
   */
  get: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        name: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access for private repos
      if (result.repo.isPrivate) {
        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const isOwner = result.repo.ownerId === ctx.user.id;
        const hasAccess = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'read'));

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this repository',
          });
        }
      }

      const absolutePath = getAbsoluteDiskPath(result.repo.diskPath);
      const stack = getStack(absolutePath, input.name);

      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      // Get bare repo for branch/commit info
      const bareRepo = await getBareRepo(result.repo.diskPath);
      
      // Build visualization nodes
      const nodes: StackNode[] = [];

      if (bareRepo) {
        // Add base branch
        const baseCommit = bareRepo.refs.resolve(stack.baseBranch);
        if (baseCommit) {
          try {
            const commit = bareRepo.objects.readCommit(baseCommit);
            nodes.push({
              branch: stack.baseBranch,
              commit: baseCommit.slice(0, 8),
              message: commit.message.split('\n')[0],
              isCurrent: false,
              status: 'synced',
            });
          } catch {
            nodes.push({
              branch: stack.baseBranch,
              commit: baseCommit.slice(0, 8),
              message: '',
              isCurrent: false,
              status: 'synced',
            });
          }
        }

        // Add stack branches
        for (const branch of stack.branches) {
          const branchCommit = bareRepo.refs.resolve(`refs/heads/${branch}`);
          if (branchCommit) {
            try {
              const commit = bareRepo.objects.readCommit(branchCommit);
              nodes.push({
                branch,
                commit: branchCommit.slice(0, 8),
                message: commit.message.split('\n')[0],
                isCurrent: false,
                status: 'synced', // Would need more logic to determine actual status
              });
            } catch {
              nodes.push({
                branch,
                commit: branchCommit.slice(0, 8),
                message: '',
                isCurrent: false,
                status: 'synced',
              });
            }
          }
        }
      }

      return {
        ...stack,
        createdAt: new Date(stack.createdAt),
        updatedAt: new Date(stack.updatedAt),
        nodes,
      };
    }),

  /**
   * Create a new stack
   */
  create: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/),
        baseBranch: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = result.repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to create stacks',
        });
      }

      const absolutePath = getAbsoluteDiskPath(result.repo.diskPath);

      // Check if stack already exists
      if (getStack(absolutePath, input.name)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Stack already exists',
        });
      }

      // Get base branch commit
      const bareRepo = await getBareRepo(result.repo.diskPath);
      if (!bareRepo) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not access repository',
        });
      }

      const baseCommit = bareRepo.refs.resolve(input.baseBranch);
      if (!baseCommit) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Branch '${input.baseBranch}' not found`,
        });
      }

      // Create the stack
      const stack: StackMetadata = {
        name: input.name,
        baseBranch: input.baseBranch,
        baseCommit,
        branches: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        description: input.description,
      };

      saveStack(absolutePath, stack);

      // Add to meta
      const meta = loadMeta(absolutePath);
      if (!meta.stacks.includes(input.name)) {
        meta.stacks.push(input.name);
        saveMeta(absolutePath, meta);
      }

      return {
        ...stack,
        createdAt: new Date(stack.createdAt),
        updatedAt: new Date(stack.updatedAt),
      };
    }),

  /**
   * Add a branch to a stack
   */
  addBranch: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        stackName: z.string(),
        branchName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = result.repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to modify stacks',
        });
      }

      const absolutePath = getAbsoluteDiskPath(result.repo.diskPath);
      const stack = getStack(absolutePath, input.stackName);

      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      // Check if branch exists
      const bareRepo = await getBareRepo(result.repo.diskPath);
      if (!bareRepo) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not access repository',
        });
      }

      const branchCommit = bareRepo.refs.resolve(`refs/heads/${input.branchName}`);
      if (!branchCommit) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Branch '${input.branchName}' not found`,
        });
      }

      // Check if already in stack
      if (stack.branches.includes(input.branchName)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Branch is already in this stack',
        });
      }

      // Add branch to stack
      stack.branches.push(input.branchName);
      stack.updatedAt = Date.now();
      saveStack(absolutePath, stack);

      return {
        ...stack,
        createdAt: new Date(stack.createdAt),
        updatedAt: new Date(stack.updatedAt),
      };
    }),

  /**
   * Remove a branch from a stack
   */
  removeBranch: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        stackName: z.string(),
        branchName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = result.repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to modify stacks',
        });
      }

      const absolutePath = getAbsoluteDiskPath(result.repo.diskPath);
      const stack = getStack(absolutePath, input.stackName);

      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      // Remove branch from stack
      stack.branches = stack.branches.filter(b => b !== input.branchName);
      stack.updatedAt = Date.now();
      saveStack(absolutePath, stack);

      return {
        ...stack,
        createdAt: new Date(stack.createdAt),
        updatedAt: new Date(stack.updatedAt),
      };
    }),

  /**
   * Reorder branches in a stack
   */
  reorder: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        stackName: z.string(),
        branches: z.array(z.string()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = result.repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to modify stacks',
        });
      }

      const absolutePath = getAbsoluteDiskPath(result.repo.diskPath);
      const stack = getStack(absolutePath, input.stackName);

      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      // Validate that new order contains same branches
      const currentSet = new Set(stack.branches);
      const newSet = new Set(input.branches);

      if (currentSet.size !== newSet.size) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'New order must contain exactly the same branches',
        });
      }

      for (const branch of stack.branches) {
        if (!newSet.has(branch)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Branch '${branch}' is missing from new order`,
          });
        }
      }

      // Update order
      stack.branches = input.branches;
      stack.updatedAt = Date.now();
      saveStack(absolutePath, stack);

      return {
        ...stack,
        createdAt: new Date(stack.createdAt),
        updatedAt: new Date(stack.updatedAt),
      };
    }),

  /**
   * Delete a stack (does not delete branches)
   */
  delete: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        name: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = result.repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(result.repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete stacks',
        });
      }

      const absolutePath = getAbsoluteDiskPath(result.repo.diskPath);
      const stack = getStack(absolutePath, input.name);

      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      // Delete stack file
      deleteStackFile(absolutePath, input.name);

      // Remove from meta
      const meta = loadMeta(absolutePath);
      meta.stacks = meta.stacks.filter(s => s !== input.name);
      saveMeta(absolutePath, meta);

      return { success: true, deletedBranches: stack.branches };
    }),
});
