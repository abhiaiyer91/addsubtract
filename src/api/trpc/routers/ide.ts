/**
 * IDE Router
 * 
 * API endpoints for the web IDE to interact with virtual repositories.
 * Provides file operations, commits, and session management for in-memory editing.
 */

import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import { VirtualRepository, VirtualRepositoryManager } from '../../../primitives/virtual-repository';
import { setVirtualRepo, getVirtualRepo, clearVirtualRepo } from '../../../ai/tools/virtual-write-file';
import { getRepoDiskPath, resolveDiskPath } from '../../../server/storage/repos';
import { db } from '../../../db';
import { repositories } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { exists } from '../../../utils/fs';

// Session manager for IDE sessions
const sessionManager = new VirtualRepositoryManager();

/**
 * Get repository disk path from owner/name
 */
async function getRepoPath(owner: string, name: string): Promise<string | null> {
  // Try to get from database first
  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.name, name),
    with: {
      owner: true,
    },
  });

  if (repo && repo.diskPath) {
    // Resolve the stored path to an absolute filesystem path
    const resolved = resolveDiskPath(repo.diskPath);
    if (exists(resolved)) {
      return resolved;
    }
  }

  // Fall back to computed path
  const diskPath = getRepoDiskPath(owner, name);
  if (exists(diskPath)) {
    return diskPath;
  }

  return null;
}

export const ideRouter = router({
  /**
   * Create a new IDE session for editing a repository
   */
  createSession: protectedProcedure
    .input(z.object({
      owner: z.string(),
      repo: z.string(),
      branch: z.string().optional().default('main'),
    }))
    .mutation(async ({ input, ctx }) => {
      const { owner, repo, branch } = input;

      // Get repository path
      const repoPath = await getRepoPath(owner, repo);
      if (!repoPath) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Repository not found: ${owner}/${repo}`,
        });
      }

      // Create session
      const session = sessionManager.createSession(repoPath, branch);

      // Also register with the AI tools
      setVirtualRepo(session.id, session.vfs as any);

      return {
        sessionId: session.id,
        branch: session.branch,
        createdAt: session.createdAt,
      };
    }),

  /**
   * Close an IDE session
   */
  closeSession: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { sessionId } = input;
      
      sessionManager.closeSession(sessionId);
      clearVirtualRepo(sessionId);

      return { success: true };
    }),

  /**
   * Read a file from the virtual filesystem
   */
  readFile: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      path: z.string(),
    }))
    .query(async ({ input }) => {
      const { sessionId, path: filePath } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      const content = session.vfs.read(filePath);
      if (content === null) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `File not found: ${filePath}`,
        });
      }

      return {
        path: filePath,
        content,
      };
    }),

  /**
   * Write a file to the virtual filesystem
   */
  writeFile: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      path: z.string(),
      content: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { sessionId, path: filePath, content } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      // Security check
      if (filePath.startsWith('.wit') || filePath.startsWith('.git')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot write to .wit or .git directories',
        });
      }

      const existed = session.vfs.exists(filePath);
      session.vfs.write(filePath, content);
      session.lastModified = new Date();

      return {
        path: filePath,
        created: !existed,
        size: Buffer.byteLength(content, 'utf-8'),
      };
    }),

  /**
   * Delete a file from the virtual filesystem
   */
  deleteFile: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      path: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { sessionId, path: filePath } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      const deleted = session.vfs.delete(filePath);
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `File not found: ${filePath}`,
        });
      }

      session.lastModified = new Date();
      return { success: true };
    }),

  /**
   * List files in a directory
   */
  listDirectory: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      path: z.string().optional().default('.'),
      recursive: z.boolean().optional().default(false),
    }))
    .query(async ({ input }) => {
      const { sessionId, path: dirPath, recursive } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      const entries = recursive
        ? session.vfs.listRecursive(dirPath)
        : session.vfs.list(dirPath);

      return {
        path: dirPath,
        entries,
      };
    }),

  /**
   * Get status of changes
   */
  status: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .query(async ({ input }) => {
      const { sessionId } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      const changes = session.vfs.status();
      
      return {
        branch: session.branch,
        changes,
        hasChanges: changes.length > 0,
      };
    }),

  /**
   * Commit all changes
   */
  commit: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      message: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { sessionId, message } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      // Check for changes
      const status = session.vfs.status();
      if (status.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Nothing to commit',
        });
      }

      // Create author from user context
      const author = {
        name: ctx.user.name || ctx.user.username,
        email: ctx.user.email,
        timestamp: Math.floor(Date.now() / 1000),
        timezone: getTimezone(),
      };

      const commitHash = session.vfs.commit(message, author);

      return {
        commitHash,
        changedFiles: status.length,
        message: `Created commit ${commitHash.slice(0, 7)}: ${message}`,
      };
    }),

  /**
   * Get commit history
   */
  log: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      limit: z.number().optional().default(10),
    }))
    .query(async ({ input }) => {
      const { sessionId, limit } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      const commits = session.vfs.log(limit);
      
      return { commits };
    }),

  /**
   * Reset changes (discard all uncommitted changes)
   */
  reset: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { sessionId } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      // Re-checkout the branch to reset all changes
      session.vfs.clear();
      try {
        session.vfs.checkout(session.branch);
      } catch {
        // Branch might not have commits yet
      }

      return { success: true };
    }),

  /**
   * Create a new branch
   */
  createBranch: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      name: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { sessionId, name } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      // Create branch (VirtualFS handles this through refs)
      const headHash = session.vfs['refs'].resolve('HEAD');
      if (!headHash) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot create branch: no commits yet',
        });
      }

      session.vfs['refs'].createBranch(name, headHash);
      
      return { success: true, branch: name };
    }),

  /**
   * Switch to a different branch
   */
  checkoutBranch: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      branch: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { sessionId, branch } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      // Check for uncommitted changes
      const status = session.vfs.status();
      if (status.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot checkout: you have uncommitted changes. Commit or reset first.',
        });
      }

      session.vfs.checkout(branch);
      session.branch = branch;

      return { success: true, branch };
    }),

  /**
   * List all branches
   */
  listBranches: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .query(async ({ input }) => {
      const { sessionId } = input;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session not found: ${sessionId}`,
        });
      }

      const branches = session.vfs['refs'].listBranches();
      
      return {
        branches,
        current: session.branch,
      };
    }),
});

/**
 * Get current timezone offset string
 */
function getTimezone(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return `${sign}${hours}${minutes}`;
}
