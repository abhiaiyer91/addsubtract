import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  prModel,
  prReviewModel,
  prCommentModel,
  prLabelModel,
  prReviewerModel,
  inboxModel,
  repoModel,
  collaboratorModel,
  activityHelpers,
  stackModel,
  stackBranchModel,
} from '../../../db/models';
import { mergePullRequest, checkMergeability, getDefaultMergeMessage } from '../../../server/storage/merge';
import { getConflictDetails } from '../../../server/storage/conflicts';
import { resolveDiskPath, BareRepository } from '../../../server/storage/repos';
import { triggerAsyncReview } from '../../../ai/services/pr-review';
import { exists } from '../../../utils/fs';
import { eventBus, extractMentions } from '../../../events';
import { diff, createHunks, FileDiff } from '../../../core/diff';
import { Blob, Tree, Commit } from '../../../core/object';
import { TreeEntry, Author } from '../../../core/types';

/**
 * Parse a unified diff into structured file changes
 */
function parseDiff(diffText: string): Array<{
  oldPath: string;
  newPath: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: Array<{ type: 'context' | 'add' | 'delete'; content: string }>;
  }>;
}> {
  const files: Array<{
    oldPath: string;
    newPath: string;
    status: 'added' | 'deleted' | 'modified' | 'renamed';
    additions: number;
    deletions: number;
    hunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      lines: Array<{ type: 'context' | 'add' | 'delete'; content: string }>;
    }>;
  }> = [];

  const fileChunks = diffText.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const lines = chunk.split('\n');
    const headerMatch = lines[0]?.match(/a\/(.+) b\/(.+)/);
    if (!headerMatch) continue;

    const oldPath = headerMatch[1];
    const newPath = headerMatch[2];

    // Determine status
    let status: 'added' | 'deleted' | 'modified' | 'renamed' = 'modified';
    if (chunk.includes('new file mode')) {
      status = 'added';
    } else if (chunk.includes('deleted file mode')) {
      status = 'deleted';
    } else if (chunk.includes('rename from')) {
      status = 'renamed';
    }

    const hunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      lines: Array<{ type: 'context' | 'add' | 'delete'; content: string }>;
    }> = [];

    let additions = 0;
    let deletions = 0;
    let currentHunk: typeof hunks[0] | null = null;

    for (const line of lines) {
      // Hunk header: @@ -1,5 +1,7 @@
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        currentHunk = {
          oldStart: parseInt(hunkMatch[1], 10),
          oldLines: parseInt(hunkMatch[2] || '1', 10),
          newStart: parseInt(hunkMatch[3], 10),
          newLines: parseInt(hunkMatch[4] || '1', 10),
          lines: [],
        };
        continue;
      }

      if (currentHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({ type: 'add', content: line.slice(1) });
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({ type: 'delete', content: line.slice(1) });
          deletions++;
        } else if (line.startsWith(' ')) {
          currentHunk.lines.push({ type: 'context', content: line.slice(1) });
        }
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    files.push({
      oldPath,
      newPath,
      status,
      additions,
      deletions,
      hunks,
    });
  }

  return files;
}

/**
 * Flatten a tree into a map of path -> blob hash
 */
function flattenTree(repo: BareRepository, treeHash: string, prefix: string): Map<string, string> {
  const result = new Map<string, string>();
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.mode === '40000') {
      const subTree = flattenTree(repo, entry.hash, fullPath);
      for (const [path, hash] of subTree) {
        result.set(path, hash);
      }
    } else {
      result.set(fullPath, entry.hash);
    }
  }
  
  return result;
}

/**
 * Flatten tree to include file modes
 */
function flattenTreeWithModes(repo: BareRepository, treeHash: string, prefix: string): Map<string, { hash: string; mode: string }> {
  const result = new Map<string, { hash: string; mode: string }>();
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.mode === '40000') {
      const subTree = flattenTreeWithModes(repo, entry.hash, fullPath);
      for (const [path, info] of subTree) {
        result.set(path, info);
      }
    } else {
      result.set(fullPath, { hash: entry.hash, mode: entry.mode });
    }
  }
  
  return result;
}

/**
 * Build a tree from a flat file map
 */
function buildTreeFromFiles(repo: BareRepository, files: Map<string, { hash: string; mode: string }>): string {
  // Group files by directory
  const dirs = new Map<string, TreeEntry[]>();
  dirs.set('', []);
  
  for (const [filePath, info] of files) {
    const parts = filePath.split('/');
    const fileName = parts.pop()!;
    const dirPath = parts.join('/');
    
    // Ensure parent directories exist
    let currentPath = '';
    for (const part of parts) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!dirs.has(currentPath)) {
        dirs.set(currentPath, []);
        // Add directory entry to parent
        const parentEntries = dirs.get(parentPath)!;
        if (!parentEntries.some(e => e.name === part && e.mode === '40000')) {
          parentEntries.push({ name: part, mode: '40000', hash: '' }); // Hash filled later
        }
      }
    }
    
    // Add file entry
    const dirEntries = dirs.get(dirPath) || [];
    if (!dirs.has(dirPath)) {
      dirs.set(dirPath, dirEntries);
    }
    dirEntries.push({ name: fileName, mode: info.mode, hash: info.hash });
  }
  
  // Build trees bottom-up
  const sortedPaths = Array.from(dirs.keys()).sort((a, b) => b.split('/').length - a.split('/').length);
  const treeHashes = new Map<string, string>();
  
  for (const dirPath of sortedPaths) {
    const entries = dirs.get(dirPath)!;
    
    // Update directory hashes
    for (const entry of entries) {
      if (entry.mode === '40000') {
        const childPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
        entry.hash = treeHashes.get(childPath)!;
      }
    }
    
    // Sort entries (directories first, then by name)
    entries.sort((a, b) => {
      if (a.mode === '40000' && b.mode !== '40000') return -1;
      if (a.mode !== '40000' && b.mode === '40000') return 1;
      return a.name.localeCompare(b.name);
    });
    
    // Write tree object
    const tree = new Tree(entries.filter(e => e.hash));
    const hash = repo.objects.writeObject(tree);
    treeHashes.set(dirPath, hash);
  }
  
  return treeHashes.get('')!;
}

/**
 * Get commits between two refs using wit's TS API
 */
function getCommitsBetween(repoPath: string, baseSha: string, headSha: string): Array<{
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
}> {
  try {
    const repo = new BareRepository(repoPath);
    const commits: Array<{ sha: string; message: string; author: string; authorEmail: string; date: string }> = [];
    
    // Walk commit history from head to base
    let currentHash: string | null = headSha;
    const baseSet = new Set<string>([baseSha]);
    
    while (currentHash && !baseSet.has(currentHash)) {
      try {
        const commit = repo.objects.readCommit(currentHash);
        commits.push({
          sha: currentHash,
          message: commit.message.split('\n')[0], // First line only
          author: commit.author.name,
          authorEmail: commit.author.email,
          date: new Date(commit.author.timestamp * 1000).toISOString(),
        });
        
        // Move to parent (first parent for linear history)
        currentHash = commit.parentHashes.length > 0 ? commit.parentHashes[0] : null;
      } catch {
        break;
      }
    }
    
    return commits;
  } catch (error) {
    console.error('[pulls.getCommits] Error:', error);
    return [];
  }
}

export const pullsRouter = router({
  /**
   * List pull requests for a repository (with author and labels)
   */
  list: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        state: z.enum(['open', 'closed', 'merged']).optional(),
        authorId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const prs = await prModel.listByRepo(input.repoId, {
        state: input.state,
        authorId: input.authorId,
        limit: input.limit,
        offset: input.offset,
      });

      // Fetch authors and labels for each PR
      const prsWithDetails = await Promise.all(
        prs.map(async (pr) => {
          const result = await prModel.findWithAuthor(pr.id);
          const labels = await prLabelModel.listByPr(pr.id);
          return {
            ...pr,
            author: result?.author ?? null,
            labels,
          };
        })
      );

      return prsWithDetails;
    }),

  /**
   * Get a single pull request by number (with author and labels)
   */
  get: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        number: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findByRepoAndNumber(input.repoId, input.number);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Get author
      const authorResult = await prModel.findWithAuthor(pr.id);
      const author = authorResult?.author ?? null;

      // Get labels
      const labels = await prLabelModel.listByPr(pr.id);

      // Get stack info if this PR is part of a stack
      let stack = null;
      if (pr.stackId) {
        const stackData = await stackModel.findWithDetails(pr.stackId);
        if (stackData) {
          stack = {
            id: stackData.id,
            name: stackData.name,
            baseBranch: stackData.baseBranch,
            branches: stackData.branches.map((b, idx) => ({
              branchName: b.branchName,
              position: idx,
              pr: b.pr ? {
                id: b.pr.id,
                number: b.pr.number,
                title: b.pr.title,
                state: b.pr.state,
              } : null,
              isCurrent: b.prId === pr.id,
            })),
          };
        }
      }

      return {
        ...pr,
        author,
        labels,
        stack,
      };
    }),

  /**
   * Get a pull request by ID
   */
  getById: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findById(input.id);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      return pr;
    }),

  /**
   * Get a pull request with author details
   */
  getWithAuthor: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const result = await prModel.findWithAuthor(input.id);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      return result;
    }),

  /**
   * Create a new pull request
   */
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        title: z.string().min(1, 'Title is required').max(256),
        body: z.string().optional(),
        sourceBranch: z.string().min(1, 'Source branch is required'),
        targetBranch: z.string().min(1, 'Target branch is required'),
        headSha: z.string().min(1, 'Head SHA is required'),
        baseSha: z.string().min(1, 'Base SHA is required'),
        isDraft: z.boolean().default(false),
        sourceRepoId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);

      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const pr = await prModel.create({
        repoId: input.repoId,
        title: input.title,
        body: input.body,
        sourceBranch: input.sourceBranch,
        targetBranch: input.targetBranch,
        headSha: input.headSha,
        baseSha: input.baseSha,
        authorId: ctx.user.id,
        isDraft: input.isDraft,
        sourceRepoId: input.sourceRepoId,
        state: 'open',
      });

      // Log activity
      await activityHelpers.logPrOpened(ctx.user.id, input.repoId, pr.number, pr.title);

      // Emit pr.created event
      const repoFullName = `${ctx.user.username || ctx.user.name}/${repo.name}`;
      await eventBus.emit('pr.created', ctx.user.id, {
        prId: pr.id,
        prNumber: pr.number,
        prTitle: pr.title,
        repoId: input.repoId,
        repoFullName,
        sourceBranch: input.sourceBranch,
        targetBranch: input.targetBranch,
      });

      // Trigger async AI review (fire-and-forget, doesn't block PR creation)
      if (!input.isDraft) {
        triggerAsyncReview(pr.id);
      }

      return pr;
    }),

  /**
   * Update a pull request
   */
  update: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        title: z.string().min(1).max(256).optional(),
        body: z.string().optional(),
        isDraft: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Only author or repo admin can update
      const isAuthor = pr.authorId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'admin');

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this pull request',
        });
      }

      const updates: Record<string, string | boolean | undefined> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.body !== undefined) updates.body = input.body;
      if (input.isDraft !== undefined) updates.isDraft = input.isDraft;

      return prModel.update(input.prId, updates);
    }),

  /**
   * Check if a pull request can be merged (no conflicts)
   */
  checkMergeability: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Resolve disk path
      const diskPath = resolveDiskPath(repo.diskPath);

      if (!exists(diskPath)) {
        return { 
          canMerge: false, 
          conflicts: [], 
          behindBy: 0, 
          aheadBy: 0,
          error: 'Repository not found on disk' 
        };
      }

      try {
        const result = checkMergeability(diskPath, pr.sourceBranch, pr.targetBranch);
        return result;
      } catch (error) {
        return { 
          canMerge: false, 
          conflicts: [], 
          behindBy: 0, 
          aheadBy: 0,
          error: error instanceof Error ? error.message : 'Failed to check mergeability' 
        };
      }
    }),

  /**
   * Merge a pull request
   * 
   * This actually performs the Git merge operation on the bare repository,
   * then updates the database to reflect the merged state.
   */
  merge: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        strategy: z.enum(['merge', 'squash', 'rebase']).default('merge'),
        message: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      if (pr.state !== 'open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Pull request is not open',
        });
      }

      // Check if user has write permission
      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to merge this pull request',
        });
      }

      // Use user info from context (already authenticated via better-auth)
      const user = ctx.user;

      // Resolve disk path
      const diskPath = resolveDiskPath(repo.diskPath);

      if (!exists(diskPath)) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Repository not found on disk',
        });
      }

      // Generate merge message if not provided
      const mergeMessage = input.message || getDefaultMergeMessage(
        pr.number,
        pr.title,
        pr.sourceBranch,
        pr.targetBranch,
        input.strategy
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
          strategy: input.strategy,
        }
      );

      if (!mergeResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: mergeResult.error || 'Merge failed',
          cause: mergeResult.conflicts,
        });
      }

      // Update database with merge info
      const mergedPr = await prModel.merge(input.prId, ctx.user.id, mergeResult.mergeSha!);

      // Log activity
      if (mergedPr) {
        await activityHelpers.logPrMerged(ctx.user.id, pr.repoId, pr.number, pr.title);
        
        // Emit pr.merged event for notifications
        // Use user info from context since we already have the repo
        const repoFullName = `${ctx.user.username || ctx.user.name}/${repo.name}`;
        await eventBus.emit('pr.merged', ctx.user.id, {
          prId: pr.id,
          prNumber: pr.number,
          prTitle: pr.title,
          repoId: pr.repoId,
          repoFullName,
          authorId: pr.authorId,
          mergeStrategy: input.strategy,
        });
      }

      return {
        ...mergedPr,
        mergeSha: mergeResult.mergeSha,
      };
    }),

  /**
   * Close a pull request
   */
  close: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Only author or repo admin can close
      const isAuthor = pr.authorId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'admin');

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to close this pull request',
        });
      }

      const closedPr = await prModel.close(input.prId);

      // Log activity
      if (closedPr) {
        await activityHelpers.logPrClosed(ctx.user.id, pr.repoId, pr.number, pr.title);
        
        // Emit pr.closed event
        const repo = await repoModel.findById(pr.repoId);
        if (repo) {
          await eventBus.emit('pr.closed', ctx.user.id, {
            prId: pr.id,
            prNumber: pr.number,
            prTitle: pr.title,
            repoId: pr.repoId,
            repoFullName: `${ctx.user.username || ctx.user.name}/${repo.name}`,
            authorId: pr.authorId,
          });
        }
      }

      return closedPr;
    }),

  /**
   * Reopen a pull request
   */
  reopen: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      if (pr.state !== 'closed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Pull request is not closed',
        });
      }

      // Only author or repo admin can reopen
      const isAuthor = pr.authorId === ctx.user.id;
      const isAdmin = await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'admin');

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to reopen this pull request',
        });
      }

      return prModel.reopen(input.prId);
    }),

  /**
   * Add a review to a pull request
   */
  addReview: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        state: z.enum(['approved', 'changes_requested', 'commented']),
        body: z.string().optional(),
        commitSha: z.string().min(1, 'Commit SHA is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const review = await prReviewModel.create({
        prId: input.prId,
        userId: ctx.user.id,
        state: input.state,
        body: input.body,
        commitSha: input.commitSha,
      });

      // Mark review request as completed
      await prReviewerModel.completeReview(input.prId, ctx.user.id);

      // Emit pr.reviewed event
      const repo = await repoModel.findById(pr.repoId);
      if (repo) {
        await eventBus.emit('pr.reviewed', ctx.user.id, {
          prId: pr.id,
          prNumber: pr.number,
          prTitle: pr.title,
          repoId: pr.repoId,
          repoFullName: `${ctx.user.username || ctx.user.name}/${repo.name}`,
          authorId: pr.authorId,
          reviewState: input.state,
        });
      }

      return review;
    }),

  /**
   * List reviews for a pull request
   */
  reviews: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return prReviewModel.listByPr(input.prId);
    }),

  /**
   * Add a comment to a pull request
   */
  addComment: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        body: z.string().min(1, 'Comment body is required'),
        path: z.string().optional(),
        line: z.number().int().positive().optional(),
        side: z.enum(['LEFT', 'RIGHT']).optional(),
        startLine: z.number().int().positive().optional(), // For multi-line selection
        endLine: z.number().int().positive().optional(), // For multi-line selection
        commitSha: z.string().optional(),
        reviewId: z.string().uuid().optional(),
        replyToId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const comment = await prCommentModel.create({
        prId: input.prId,
        userId: ctx.user.id,
        body: input.body,
        path: input.path,
        line: input.line,
        side: input.side,
        startLine: input.startLine,
        endLine: input.endLine,
        commitSha: input.commitSha,
        reviewId: input.reviewId,
        replyToId: input.replyToId,
      });

      // Emit pr.commented event
      const repo = await repoModel.findById(pr.repoId);
      if (repo) {
        const mentionedUsernames = extractMentions(input.body);
        
        await eventBus.emit('pr.commented', ctx.user.id, {
          prId: pr.id,
          prNumber: pr.number,
          prTitle: pr.title,
          repoId: pr.repoId,
          repoFullName: `${ctx.user.username || ctx.user.name}/${repo.name}`,
          authorId: pr.authorId,
          commentId: comment.id,
          commentBody: input.body,
          mentionedUserIds: [], // TODO: resolve usernames to IDs
        });

        // Emit individual mention events
        // Note: mentionedUsernames contains usernames, need to resolve to user IDs
        // This is left as TODO - would need to look up users by username
      }

      return comment;
    }),

  /**
   * List comments for a pull request
   */
  comments: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return prCommentModel.listByPr(input.prId);
    }),

  /**
   * Update a comment
   */
  updateComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
        body: z.string().min(1, 'Comment body is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await prCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      // Only the comment author can update
      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only edit your own comments',
        });
      }

      return prCommentModel.update(input.commentId, input.body);
    }),

  /**
   * Delete a comment
   */
  deleteComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await prCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      // Only the comment author can delete
      if (comment.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own comments',
        });
      }

      return prCommentModel.delete(input.commentId);
    }),

  /**
   * Resolve a comment thread
   * Only the PR author, comment author, or repo collaborators can resolve threads
   */
  resolveComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await prCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      const pr = await prModel.findById(comment.prId);
      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Check permissions: PR author, comment author, or repo collaborator
      const isPrAuthor = pr.authorId === ctx.user.id;
      const isCommentAuthor = comment.userId === ctx.user.id;
      const hasWriteAccess = await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write');

      if (!isPrAuthor && !isCommentAuthor && !hasWriteAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to resolve this comment thread',
        });
      }

      return prCommentModel.resolve(input.commentId, ctx.user.id);
    }),

  /**
   * Unresolve a comment thread
   * Only the PR author, comment author, or repo collaborators can unresolve threads
   */
  unresolveComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await prCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      const pr = await prModel.findById(comment.prId);
      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Check permissions: PR author, comment author, or repo collaborator
      const isPrAuthor = pr.authorId === ctx.user.id;
      const isCommentAuthor = comment.userId === ctx.user.id;
      const hasWriteAccess = await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write');

      if (!isPrAuthor && !isCommentAuthor && !hasWriteAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to unresolve this comment thread',
        });
      }

      return prCommentModel.unresolve(input.commentId);
    }),

  /**
   * Get inline comments for a specific file in a PR
   * Groups comments by line and includes thread information
   */
  getFileComments: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        path: z.string(),
      })
    )
    .query(async ({ input }) => {
      return prCommentModel.listByFile(input.prId, input.path);
    }),

  /**
   * Add a comment with a code suggestion
   * Suggestions allow reviewers to propose specific code changes
   */
  addSuggestion: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        body: z.string().min(1, 'Comment body is required'),
        suggestion: z.string().min(1, 'Suggestion code is required'),
        path: z.string(),
        line: z.number().int().positive(),
        side: z.enum(['LEFT', 'RIGHT']).default('RIGHT'),
        startLine: z.number().int().positive().optional(),
        endLine: z.number().int().positive().optional(),
        commitSha: z.string().optional(),
        reviewId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const comment = await prCommentModel.create({
        prId: input.prId,
        userId: ctx.user.id,
        body: input.body,
        suggestion: input.suggestion,
        path: input.path,
        line: input.line,
        side: input.side,
        startLine: input.startLine,
        endLine: input.endLine,
        commitSha: input.commitSha,
        reviewId: input.reviewId,
      });

      return comment;
    }),

  /**
   * Apply a code suggestion
   * Creates a commit with the suggested code change
   */
  applySuggestion: protectedProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const comment = await prCommentModel.findById(input.commentId);

      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      if (!comment.suggestion) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This comment does not contain a suggestion',
        });
      }

      if (comment.suggestionApplied) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This suggestion has already been applied',
        });
      }

      const pr = await prModel.findById(comment.prId);
      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Only PR author or repo collaborators can apply suggestions
      const isAuthor = pr.authorId === ctx.user.id;
      const hasWriteAccess = await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write');

      if (!isAuthor && !hasWriteAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to apply this suggestion',
        });
      }

      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Get the file path and apply the suggestion
      if (!comment.path || comment.line === null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Suggestion is missing file path or line information',
        });
      }

      // Resolve disk path
      const diskPath = resolveDiskPath(repo.diskPath);

      if (!exists(diskPath)) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Repository not found on disk',
        });
      }

      try {
        // Read the current file content from the source branch using wit's TS API
        const bareRepo = new BareRepository(diskPath);
        const branchHash = bareRepo.refs.resolve(`refs/heads/${pr.sourceBranch}`);
        if (!branchHash) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Branch '${pr.sourceBranch}' not found`,
          });
        }
        
        const parentCommit = bareRepo.objects.readCommit(branchHash);
        const files = flattenTreeWithModes(bareRepo, parentCommit.treeHash, '');
        const fileInfo = files.get(comment.path);
        
        if (!fileInfo) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `File '${comment.path}' not found in branch '${pr.sourceBranch}'`,
          });
        }
        
        const existingBlob = bareRepo.objects.readBlob(fileInfo.hash);
        const fileContent = existingBlob.content.toString('utf-8');

        const lines = fileContent.split('\n');
        const startLine = comment.startLine || comment.line;
        const endLine = comment.endLine || comment.line;

        // Replace the lines with the suggestion
        const newLines = [
          ...lines.slice(0, startLine - 1),
          comment.suggestion,
          ...lines.slice(endLine),
        ];

        const newContent = newLines.join('\n');

        // Create a new blob with the modified content
        const newBlob = new Blob(Buffer.from(newContent, 'utf-8'));
        const newBlobHash = bareRepo.objects.writeObject(newBlob);
        
        // Update the file map with the new blob
        files.set(comment.path, { hash: newBlobHash, mode: fileInfo.mode });
        
        // Build new tree with the modified file
        const newTreeHash = buildTreeFromFiles(bareRepo, files);
        
        // Get the suggestion author's username
        const { userModel } = await import('../../../db/models');
        const suggestionAuthor = comment.userId ? await userModel.findById(comment.userId) : null;
        const authorUsername = suggestionAuthor?.username || 'reviewer';

        // Create commit with author info
        const commitMessage = `Apply suggestion from @${authorUsername}\n\nCo-authored-by: ${ctx.user.name || ctx.user.username} <${ctx.user.email}>`;
        
        const author: Author = {
          name: ctx.user.name || ctx.user.username || 'Unknown',
          email: ctx.user.email,
          timestamp: Math.floor(Date.now() / 1000),
          timezone: '+0000',
        };
        
        const newCommit = new Commit(
          newTreeHash,
          [branchHash], // Parent is the current branch head
          author,
          author,
          commitMessage
        );
        
        const newSha = bareRepo.objects.writeObject(newCommit);
        
        // Update the branch ref to point to the new commit
        // This is equivalent to "push" since we're directly updating the bare repo
        bareRepo.refs.updateBranch(pr.sourceBranch, newSha);

        // Mark the suggestion as applied
        await prCommentModel.markSuggestionApplied(input.commentId, newSha);

        // Update PR head SHA
        await prModel.updateHead(pr.id, newSha);

        return {
          success: true,
          commitSha: newSha,
          message: 'Suggestion applied successfully',
        };
      } catch (error) {
        console.error('[pulls.applySuggestion] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to apply suggestion',
        });
      }
    }),

  /**
   * Get labels for a pull request
   */
  labels: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return prLabelModel.listByPr(input.prId);
    }),

  /**
   * Add a label to a pull request
   */
  addLabel: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        labelId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Check write permission
      const repo = await repoModel.findById(pr.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to add labels',
        });
      }

      await prLabelModel.add(input.prId, input.labelId);
      return { success: true };
    }),

  /**
   * Remove a label from a pull request
   */
  removeLabel: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        labelId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Check write permission
      const repo = await repoModel.findById(pr.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const canWrite = isOwner || (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to remove labels',
        });
      }

      return prLabelModel.remove(input.prId, input.labelId);
    }),

  /**
   * List pull requests by author
   */
  listByAuthor: publicProcedure
    .input(
      z.object({
        authorId: z.string().uuid(),
        state: z.enum(['open', 'closed', 'merged']).optional(),
      })
    )
    .query(async ({ input }) => {
      return prModel.listByAuthor(input.authorId, input.state);
    }),

  /**
   * Get AI review for a pull request
   * Returns the most recent AI-generated review
   */
  getAIReview: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Get reviews and find the AI review (from wit-bot user)
      const reviews = await prReviewModel.listByPr(input.prId);
      
      // Find AI reviews - look for reviews from wit-bot or reviews with AI marker in body
      const aiReview = reviews.find(r => {
        // Check if body contains AI review marker
        if (r.body?.includes('AI Review:') || r.body?.includes('wit AI')) {
          return true;
        }
        return false;
      });

      if (!aiReview) {
        // Check comments as fallback
        const comments = await prCommentModel.listByPr(input.prId);
        const aiComment = comments.find(c => 
          c.body?.includes('AI Review:') || c.body?.includes('wit AI')
        );

        if (aiComment) {
          return {
            id: aiComment.id,
            type: 'comment' as const,
            body: aiComment.body,
            createdAt: aiComment.createdAt,
            state: null,
          };
        }

        return null;
      }

      return {
        id: aiReview.id,
        type: 'review' as const,
        body: aiReview.body,
        state: aiReview.state,
        createdAt: aiReview.createdAt,
      };
    }),

  /**
   * Trigger an AI review for a pull request
   * Can be used to re-run review or run review on draft PRs
   */
  triggerAIReview: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Check if user has at least read access
      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const isOwner = repo.ownerId === ctx.user.id;
      const isAuthor = pr.authorId === ctx.user.id;
      const hasAccess = isOwner || isAuthor || 
        (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'read'));

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this pull request',
        });
      }

      // Trigger the review asynchronously
      triggerAsyncReview(pr.id);

      return { triggered: true, prId: pr.id, prNumber: pr.number };
    }),

  /**
   * Get the diff for a pull request
   * Returns parsed file changes with hunks
   */
  getDiff: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Resolve disk path
      const diskPath = resolveDiskPath(repo.diskPath);

      if (!exists(diskPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found on disk',
        });
      }

      try {
        // Use wit's TS API to generate diff
        const repo = new BareRepository(diskPath);
        
        const baseCommit = repo.objects.readCommit(pr.baseSha);
        const headCommit = repo.objects.readCommit(pr.headSha);
        
        const baseFiles = flattenTree(repo, baseCommit.treeHash, '');
        const headFiles = flattenTree(repo, headCommit.treeHash, '');
        
        const allPaths = new Set([...baseFiles.keys(), ...headFiles.keys()]);
        
        const files: Array<{
          oldPath: string;
          newPath: string;
          status: 'added' | 'deleted' | 'modified' | 'renamed';
          additions: number;
          deletions: number;
          hunks: Array<{
            oldStart: number;
            oldLines: number;
            newStart: number;
            newLines: number;
            lines: Array<{ type: 'context' | 'add' | 'delete'; content: string }>;
          }>;
        }> = [];
        
        for (const filePath of allPaths) {
          const baseHash = baseFiles.get(filePath);
          const headHash = headFiles.get(filePath);
          
          if (baseHash === headHash) continue;
          
          let oldContent = '';
          let newContent = '';
          
          if (baseHash) {
            const blob = repo.objects.readBlob(baseHash);
            oldContent = blob.content.toString('utf-8');
          }
          
          if (headHash) {
            const blob = repo.objects.readBlob(headHash);
            newContent = blob.content.toString('utf-8');
          }
          
          const diffLines = diff(oldContent, newContent);
          const hunks = createHunks(diffLines);
          
          // Count additions and deletions
          let additions = 0;
          let deletions = 0;
          for (const hunk of hunks) {
            for (const line of hunk.lines) {
              if (line.type === 'add') additions++;
              if (line.type === 'remove') deletions++;
            }
          }
          
          // Determine status
          let status: 'added' | 'deleted' | 'modified' | 'renamed' = 'modified';
          if (!baseHash) status = 'added';
          else if (!headHash) status = 'deleted';
          
          files.push({
            oldPath: filePath,
            newPath: filePath,
            status,
            additions,
            deletions,
            hunks: hunks.map(h => ({
              oldStart: h.oldStart,
              oldLines: h.oldCount,
              newStart: h.newStart,
              newLines: h.newCount,
              lines: h.lines.map(l => ({
                type: l.type === 'remove' ? 'delete' as const : l.type,
                content: l.content,
              })),
            })),
          });
        }

        // Calculate totals
        const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
        const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

        return {
          files,
          totalAdditions,
          totalDeletions,
          totalFiles: files.length,
        };
      } catch (error) {
        console.error('[pulls.getDiff] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate diff',
        });
      }
    }),

  /**
   * Get commits for a pull request
   * Returns list of commits between base and head
   */
  getCommits: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Resolve disk path
      const diskPath = resolveDiskPath(repo.diskPath);

      if (!exists(diskPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found on disk',
        });
      }

      const commits = getCommitsBetween(diskPath, pr.baseSha, pr.headSha);

      return {
        commits,
        totalCommits: commits.length,
      };
    }),

  // ============ INBOX ENDPOINTS ============

  /**
   * Get inbox summary - counts for each inbox section
   */
  inboxSummary: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      return inboxModel.getSummary(ctx.user.id, input?.repoId);
    }),

  /**
   * Get PRs awaiting the user's review
   * This is the main inbox section for code reviewers
   */
  inboxAwaitingReview: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        repoId: z.string().uuid().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const { limit = 20, offset = 0, repoId } = input ?? {};
      return inboxModel.getAwaitingReview(ctx.user.id, { limit, offset, repoId });
    }),

  /**
   * Get the user's own PRs that are open (awaiting reviews from others)
   */
  inboxMyPrs: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        repoId: z.string().uuid().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const { limit = 20, offset = 0, repoId } = input ?? {};
      return inboxModel.getMyPrsAwaitingReview(ctx.user.id, { limit, offset, repoId });
    }),

  /**
   * Get PRs where the user has participated (commented or reviewed)
   */
  inboxParticipated: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        state: z.enum(['open', 'closed', 'all']).default('open'),
        repoId: z.string().uuid().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const { limit = 20, offset = 0, state = 'open', repoId } = input ?? {};
      return inboxModel.getParticipated(ctx.user.id, { limit, offset, state, repoId });
    }),

  // ============ REVIEWER MANAGEMENT ============

  /**
   * Request a review from a user
   */
  requestReview: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        reviewerId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      if (pr.state !== 'open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only request reviews on open pull requests',
        });
      }

      // Check if user has write access to request reviews
      const repo = await repoModel.findById(pr.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const isAuthor = pr.authorId === ctx.user.id;
      const canWrite = isOwner || isAuthor || 
        (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to request reviews',
        });
      }

      // Create the review request
      const reviewer = await prReviewerModel.requestReview(
        input.prId,
        input.reviewerId,
        ctx.user.id
      );

      // Emit event for notification
      if (repo) {
        const repoFullName = `${ctx.user.username || ctx.user.name}/${repo.name}`;
        await eventBus.emit('pr.review_requested', ctx.user.id, {
          prId: pr.id,
          prNumber: pr.number,
          prTitle: pr.title,
          repoId: pr.repoId,
          repoFullName,
          reviewerId: input.reviewerId,
          authorId: pr.authorId,
        });
      }

      return reviewer;
    }),

  /**
   * Remove a review request
   */
  removeReviewRequest: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        reviewerId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Check if user has write access
      const repo = await repoModel.findById(pr.repoId);
      const isOwner = repo?.ownerId === ctx.user.id;
      const isAuthor = pr.authorId === ctx.user.id;
      const canWrite = isOwner || isAuthor || 
        (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage review requests',
        });
      }

      return prReviewerModel.removeReviewer(input.prId, input.reviewerId);
    }),

  /**
   * Get reviewers for a PR
   */
  reviewers: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return prReviewerModel.listByPr(input.prId);
    }),

  /**
   * Get detailed conflict information for a PR
   */
  getConflicts: publicProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findById(input.prId);

      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Resolve disk path
      const diskPath = resolveDiskPath(repo.diskPath);

      if (!exists(diskPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found on disk',
        });
      }

      try {
        const result = await getConflictDetails(diskPath, pr.sourceBranch, pr.targetBranch);
        return result;
      } catch (error) {
        console.error('[pulls.getConflicts] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get conflict details',
        });
      }
    }),
});
