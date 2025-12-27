import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { repoModel, collaboratorModel, stackModel, stackBranchModel, prModel } from '../../../db/models';
import { exists } from '../../../utils/fs';

/**
 * Stack visualization node (for UI rendering)
 */
export interface StackNode {
  branch: string;
  commit: string;
  message: string;
  isCurrent: boolean;
  status: 'synced' | 'behind' | 'ahead' | 'diverged';
  behindBy?: number;
  aheadBy?: number;
  pr?: {
    id: string;
    number: number;
    title: string;
    state: 'open' | 'closed' | 'merged';
  } | null;
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

      // Get stacks from database
      const stacks = await stackModel.listByRepoWithCounts(result.repo.id);
      
      return stacks.map(stack => ({
        id: stack.id,
        name: stack.name,
        baseBranch: stack.baseBranch,
        branchCount: stack.branchCount,
        description: stack.description,
        createdAt: stack.createdAt,
        updatedAt: stack.updatedAt,
      }));
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

      const stack = await stackModel.findByRepoAndName(result.repo.id, input.name);

      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      // Get full stack details
      const stackDetails = await stackModel.findWithDetails(stack.id);
      if (!stackDetails) {
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
        // Add base branch node
        const baseCommit = bareRepo.refs.resolve(stackDetails.baseBranch);
        if (baseCommit) {
          try {
            const commit = bareRepo.objects.readCommit(baseCommit);
            nodes.push({
              branch: stackDetails.baseBranch,
              commit: baseCommit.slice(0, 8),
              message: commit.message.split('\n')[0],
              isCurrent: false,
              status: 'synced',
              pr: null,
            });
          } catch {
            nodes.push({
              branch: stackDetails.baseBranch,
              commit: baseCommit.slice(0, 8),
              message: '',
              isCurrent: false,
              status: 'synced',
              pr: null,
            });
          }
        }

        // Add stack branch nodes
        for (const branch of stackDetails.branches) {
          const branchCommit = bareRepo.refs.resolve(`refs/heads/${branch.branchName}`);
          if (branchCommit) {
            try {
              const commit = bareRepo.objects.readCommit(branchCommit);
              nodes.push({
                branch: branch.branchName,
                commit: branchCommit.slice(0, 8),
                message: commit.message.split('\n')[0],
                isCurrent: false,
                status: 'synced', // TODO: Calculate actual status
                pr: branch.pr,
              });
            } catch {
              nodes.push({
                branch: branch.branchName,
                commit: branchCommit.slice(0, 8),
                message: '',
                isCurrent: false,
                status: 'synced',
                pr: branch.pr,
              });
            }
          } else {
            // Branch doesn't exist in repo (might have been deleted)
            nodes.push({
              branch: branch.branchName,
              commit: '',
              message: 'Branch not found',
              isCurrent: false,
              status: 'synced',
              pr: branch.pr,
            });
          }
        }
      }

      return {
        id: stackDetails.id,
        name: stackDetails.name,
        description: stackDetails.description,
        baseBranch: stackDetails.baseBranch,
        branches: stackDetails.branches.map(b => b.branchName),
        author: stackDetails.author,
        createdAt: stackDetails.createdAt,
        updatedAt: stackDetails.updatedAt,
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

      // Check if stack already exists
      const existing = await stackModel.findByRepoAndName(result.repo.id, input.name);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Stack already exists',
        });
      }

      // Verify base branch exists
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
      const stack = await stackModel.create({
        repoId: result.repo.id,
        name: input.name,
        baseBranch: input.baseBranch,
        description: input.description,
        authorId: ctx.user.id,
      });

      return {
        id: stack.id,
        name: stack.name,
        baseBranch: stack.baseBranch,
        description: stack.description,
        createdAt: stack.createdAt,
        updatedAt: stack.updatedAt,
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

      const stack = await stackModel.findByRepoAndName(result.repo.id, input.stackName);

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
      const branches = await stackBranchModel.listByStack(stack.id);
      if (branches.some(b => b.branchName === input.branchName)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Branch is already in this stack',
        });
      }

      // Add branch to stack
      await stackBranchModel.add(stack.id, input.branchName);

      // Return updated stack
      const updated = await stackModel.findWithDetails(stack.id);
      return {
        id: updated!.id,
        name: updated!.name,
        baseBranch: updated!.baseBranch,
        branches: updated!.branches.map(b => b.branchName),
        createdAt: updated!.createdAt,
        updatedAt: updated!.updatedAt,
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

      const stack = await stackModel.findByRepoAndName(result.repo.id, input.stackName);

      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      // Remove branch from stack
      await stackBranchModel.remove(stack.id, input.branchName);

      // Return updated stack
      const updated = await stackModel.findWithDetails(stack.id);
      return {
        id: updated!.id,
        name: updated!.name,
        baseBranch: updated!.baseBranch,
        branches: updated!.branches.map(b => b.branchName),
        createdAt: updated!.createdAt,
        updatedAt: updated!.updatedAt,
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

      const stack = await stackModel.findByRepoAndName(result.repo.id, input.stackName);

      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      // Validate that new order contains same branches
      const currentBranches = await stackBranchModel.listByStack(stack.id);
      const currentSet = new Set(currentBranches.map(b => b.branchName));
      const newSet = new Set(input.branches);

      if (currentSet.size !== newSet.size) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'New order must contain exactly the same branches',
        });
      }

      for (const branch of currentBranches) {
        if (!newSet.has(branch.branchName)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Branch '${branch.branchName}' is missing from new order`,
          });
        }
      }

      // Reorder branches
      await stackBranchModel.reorder(stack.id, input.branches);

      // Return updated stack
      const updated = await stackModel.findWithDetails(stack.id);
      return {
        id: updated!.id,
        name: updated!.name,
        baseBranch: updated!.baseBranch,
        branches: updated!.branches.map(b => b.branchName),
        createdAt: updated!.createdAt,
        updatedAt: updated!.updatedAt,
      };
    }),

  /**
   * Delete a stack (does not delete branches or PRs)
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

      const stack = await stackModel.findByRepoAndName(result.repo.id, input.name);

      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      // Get branches before deleting (for response)
      const branches = await stackBranchModel.listByStack(stack.id);
      const branchNames = branches.map(b => b.branchName);

      // Delete stack (cascades to branches due to FK)
      await stackModel.delete(stack.id);

      return { success: true, deletedBranches: branchNames };
    }),

  /**
   * Submit a stack - creates PRs for all branches that don't have them
   * Each PR targets the branch below it in the stack (or base branch for the first)
   */
  submit: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        stackName: z.string(),
        // Optional: create PRs as drafts
        draft: z.boolean().default(false),
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
          message: 'You do not have permission to submit stacks',
        });
      }

      const stack = await stackModel.findByRepoAndName(result.repo.id, input.stackName);
      if (!stack) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Stack not found',
        });
      }

      const stackDetails = await stackModel.findWithDetails(stack.id);
      if (!stackDetails || stackDetails.branches.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Stack has no branches',
        });
      }

      // Get bare repo for commit info
      const bareRepo = await getBareRepo(result.repo.diskPath);
      if (!bareRepo) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not access repository',
        });
      }

      const createdPRs: { branch: string; prNumber: number }[] = [];

      // Create PRs for branches that don't have them
      for (let i = 0; i < stackDetails.branches.length; i++) {
        const branch = stackDetails.branches[i];
        
        // Skip if already has a PR
        if (branch.pr) {
          continue;
        }

        // Determine target branch (previous branch in stack, or base branch)
        const targetBranch = i === 0 
          ? stackDetails.baseBranch 
          : stackDetails.branches[i - 1].branchName;

        // Get commits for SHAs
        const headSha = bareRepo.refs.resolve(`refs/heads/${branch.branchName}`);
        const baseSha = bareRepo.refs.resolve(i === 0 ? stackDetails.baseBranch : `refs/heads/${targetBranch}`);

        if (!headSha || !baseSha) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Could not resolve branch '${branch.branchName}' or target '${targetBranch}'`,
          });
        }

        // Get commit message for PR title
        let title = branch.branchName;
        try {
          const commit = bareRepo.objects.readCommit(headSha);
          title = commit.message.split('\n')[0];
        } catch {
          // Use branch name as fallback
        }

        // Create PR body with stack context
        const stackInfo = stackDetails.branches.map((b, idx) => {
          const marker = idx === i ? '→' : ' ';
          const prInfo = b.pr ? ` (#${b.pr.number})` : idx < i ? ' (pending)' : '';
          return `${marker} ${idx + 1}. \`${b.branchName}\`${prInfo}`;
        }).join('\n');

        const body = `## Stack: ${stackDetails.name}

This PR is part of a stacked diff. Please review and merge PRs in order.

### Stack Structure
\`\`\`
${stackInfo}
\`\`\`

**Base:** \`${stackDetails.baseBranch}\`
`;

        // Create the PR
        const pr = await prModel.create({
          repoId: result.repo.id,
          title,
          body,
          sourceBranch: branch.branchName,
          targetBranch,
          headSha,
          baseSha,
          authorId: ctx.user.id,
          isDraft: input.draft,
          stackId: stack.id,
        });

        // Link PR to stack branch
        await stackBranchModel.linkPR(stack.id, branch.branchName, pr.id);

        createdPRs.push({
          branch: branch.branchName,
          prNumber: pr.number,
        });
      }

      return {
        stackName: input.stackName,
        createdPRs,
        totalBranches: stackDetails.branches.length,
      };
    }),
});
