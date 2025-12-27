/**
 * Search Router
 * 
 * tRPC router for search functionality including semantic code search.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { repoModel, collaboratorModel, userModel } from '../../../db/models';

export const searchRouter = router({
  /**
   * Universal search across all types
   */
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      type: z.enum(['all', 'code', 'repositories', 'issues', 'prs']).default('all'),
      repoId: z.string().uuid().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const results: Array<{
        type: 'code' | 'repository' | 'issue' | 'pull_request';
        id: string;
        title: string;
        description?: string;
        url: string;
        score?: number;
        metadata?: Record<string, any>;
      }> = [];

      // Search repositories
      if (input.type === 'all' || input.type === 'repositories') {
        const repos = await repoModel.search(input.query, input.limit);

        for (const repo of repos) {
          results.push({
            type: 'repository',
            id: repo.id,
            title: repo.name,
            description: repo.description || undefined,
            url: `/${repo.name}`, // Will need owner from frontend
            metadata: {
              stars: repo.starsCount,
              isPrivate: repo.isPrivate,
            },
          });
        }
      }

      // Code search - semantic search would go here
      // For now, return empty array for code search as it requires repository indexing
      if (input.type === 'code') {
        // Note: Code search requires repository indexing with semantic search
        // This would integrate with the SemanticSearch class from src/search/
      }

      return {
        results,
        query: input.query,
        type: input.type,
        total: results.length,
      };
    }),

  /**
   * Semantic code search within a repository
   */
  codeSearch: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(10),
      language: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access
      const isOwner = repo.ownerId === ctx.user.id;
      const hasAccess = isOwner || 
        !repo.isPrivate || 
        (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'read'));

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      // Note: Full semantic code search requires repository indexing
      // For now, return a message indicating the feature needs setup
      return {
        results: [],
        query: input.query,
        repoId: input.repoId,
        requiresIndexing: true,
        message: 'Semantic code search requires repository indexing. Run `wit index` in your repository to enable this feature.',
      };
    }),

  /**
   * Quick search suggestions (autocomplete)
   */
  suggestions: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(10).default(5),
    }))
    .query(async ({ input, ctx }) => {
      const suggestions: Array<{
        type: 'repository' | 'user' | 'issue' | 'pull_request';
        text: string;
        url: string;
      }> = [];

      // Get repository suggestions
      const repos = await repoModel.search(input.query, input.limit);

      for (const repo of repos.slice(0, 3)) {
        // Get owner info for the URL
        const owner = await userModel.findById(repo.ownerId);
        const ownerUsername = owner?.username || owner?.name || 'unknown';
        suggestions.push({
          type: 'repository',
          text: `${ownerUsername}/${repo.name}`,
          url: `/${ownerUsername}/${repo.name}`,
        });
      }

      return { suggestions };
    }),
});
