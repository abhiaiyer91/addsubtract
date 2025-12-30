/**
 * MCP Router
 * 
 * Handles MCP (Model Context Protocol) server management:
 * - Search available MCPs from Composio
 * - Enable/disable MCPs for a repository
 * - Configure MCP settings
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { repoModel, mcpServerModel } from '../../../db/models';
import { composioService } from '../../../ai/services/composio.js';

/**
 * Helper to verify user has access to manage MCPs for a repository
 */
async function verifyRepoAccess(repoId: string, userId: string) {
  const repo = await repoModel.findById(repoId);
  
  if (!repo) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }
  
  // Only owner can manage MCP servers for now
  // TODO: Allow admin collaborators as well
  if (repo.ownerId !== userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the repository owner can manage MCP servers',
    });
  }
  
  return repo;
}

/**
 * Helper to get repo by owner/name
 */
async function getRepoByPath(owner: string, repoName: string, userId: string) {
  const result = await repoModel.findByPath(owner, repoName);
  
  if (!result) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }
  
  const isOwner = result.repo.ownerId === userId;
  
  return { repo: result.repo, isOwner };
}

export const mcpRouter = router({
  /**
   * Search available MCP servers from Composio
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const result = await composioService.search(input || {});
      
      return {
        servers: result.servers,
        total: result.total,
        categories: result.categories,
      };
    }),

  /**
   * Get details for a specific MCP server
   */
  getServer: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
      })
    )
    .query(async ({ input }) => {
      const server = await composioService.getServer(input.slug);
      
      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }
      
      return server;
    }),

  /**
   * Get available tools for an MCP server
   */
  getTools: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
      })
    )
    .query(async ({ input }) => {
      const tools = await composioService.getTools(input.slug);
      return { tools };
    }),

  /**
   * Get available categories
   */
  getCategories: protectedProcedure.query(async () => {
    return { categories: composioService.getCategories() };
  }),

  /**
   * List enabled MCP servers for a repository
   */
  listEnabled: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { repo, isOwner } = await getRepoByPath(input.owner, input.repo, ctx.user.id);
      
      const servers = await mcpServerModel.listAll(repo.id);
      
      return {
        servers,
        isOwner,
        repoId: repo.id,
      };
    }),

  /**
   * Enable an MCP server for a repository
   */
  enable: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        mcpSlug: z.string(),
        config: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoAccess(input.repoId, ctx.user.id);
      
      // Get the MCP server details from Composio
      const mcpServer = await composioService.getServer(input.mcpSlug);
      
      if (!mcpServer) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }
      
      // Validate config if required
      if (mcpServer.requiresConfig) {
        const validation = composioService.validateConfig(mcpServer, input.config || {});
        if (!validation.valid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid configuration: ${validation.errors.join(', ')}`,
          });
        }
      }
      
      // Enable the MCP server
      const server = await mcpServerModel.enable({
        repoId: input.repoId,
        mcpSlug: input.mcpSlug,
        name: mcpServer.name,
        description: mcpServer.description,
        iconUrl: mcpServer.iconUrl || undefined,
        category: mcpServer.category,
        config: input.config,
        enabledById: ctx.user.id,
      });
      
      return {
        id: server.id,
        mcpSlug: server.mcpSlug,
        name: server.name,
        enabled: server.enabled,
      };
    }),

  /**
   * Disable an MCP server for a repository
   */
  disable: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        mcpSlug: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoAccess(input.repoId, ctx.user.id);
      
      const server = await mcpServerModel.setEnabled(input.repoId, input.mcpSlug, false);
      
      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found for this repository',
        });
      }
      
      return { success: true };
    }),

  /**
   * Remove an MCP server from a repository
   */
  remove: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        mcpSlug: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoAccess(input.repoId, ctx.user.id);
      
      const removed = await mcpServerModel.remove(input.repoId, input.mcpSlug);
      
      if (!removed) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found for this repository',
        });
      }
      
      return { success: true };
    }),

  /**
   * Update configuration for an MCP server
   */
  updateConfig: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        mcpSlug: z.string(),
        config: z.record(z.unknown()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoAccess(input.repoId, ctx.user.id);
      
      // Get the MCP server details from Composio to validate config
      const mcpServer = await composioService.getServer(input.mcpSlug);
      
      if (mcpServer && mcpServer.requiresConfig) {
        const validation = composioService.validateConfig(mcpServer, input.config);
        if (!validation.valid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid configuration: ${validation.errors.join(', ')}`,
          });
        }
      }
      
      const server = await mcpServerModel.updateConfig(
        input.repoId,
        input.mcpSlug,
        input.config
      );
      
      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found for this repository',
        });
      }
      
      return { success: true };
    }),

  /**
   * Toggle enabled status for an MCP server
   */
  setEnabled: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        mcpSlug: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoAccess(input.repoId, ctx.user.id);
      
      const server = await mcpServerModel.setEnabled(
        input.repoId,
        input.mcpSlug,
        input.enabled
      );
      
      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found for this repository',
        });
      }
      
      return { enabled: server.enabled };
    }),
});
