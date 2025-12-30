/**
 * Repository AI Keys Router
 * 
 * Handles API key management for AI providers per repository.
 * Only repository owners can view and manage these keys.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { repoModel, repoAiKeyModel } from '../../../db/models';

// Valid AI providers
const aiProviderSchema = z.enum(['openai', 'anthropic', 'coderabbit']);

/**
 * Helper to get repo by owner/name and verify ownership
 */
async function getRepoAndVerifyOwner(owner: string, repoName: string, userId: string) {
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

/**
 * Helper to verify user is repository owner (by ID)
 */
async function verifyRepoOwner(repoId: string, userId: string) {
  const repo = await repoModel.findById(repoId);
  
  if (!repo) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }
  
  if (repo.ownerId !== userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the repository owner can manage AI keys',
    });
  }
  
  return repo;
}

export const repoAiKeysRouter = router({
  /**
   * Get all AI settings for a repository in one call
   * Accepts owner/repo to avoid needing repoId first
   */
  getSettings: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { repo, isOwner } = await getRepoAndVerifyOwner(input.owner, input.repo, ctx.user.id);
      
      // Check server keys availability (doesn't require owner)
      const hasServerKeys = !!(
        process.env.OPENAI_API_KEY || 
        process.env.ANTHROPIC_API_KEY
      );
      
      // If not owner, return limited info
      if (!isOwner) {
        const hasRepoKeys = await repoAiKeyModel.hasKeys(repo.id);
        return {
          isOwner: false,
          repoId: repo.id,
          keys: [],
          availability: {
            available: hasRepoKeys || hasServerKeys,
            source: hasRepoKeys ? 'repository' as const : hasServerKeys ? 'server' as const : null,
            hasRepoKeys,
            hasServerKeys,
          },
        };
      }
      
      // Owner gets full info - fetch keys and availability in parallel
      const [keys, hasRepoKeys] = await Promise.all([
        repoAiKeyModel.listKeys(repo.id),
        repoAiKeyModel.hasKeys(repo.id),
      ]);
      
      return {
        isOwner: true,
        repoId: repo.id,
        keys,
        availability: {
          available: hasRepoKeys || hasServerKeys,
          source: hasRepoKeys ? 'repository' as const : hasServerKeys ? 'server' as const : null,
          hasRepoKeys,
          hasServerKeys,
        },
      };
    }),

  /**
   * List all AI keys for a repository (metadata only, not decrypted)
   * Only accessible by repository owner
   */
  list: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      await verifyRepoOwner(input.repoId, ctx.user.id);
      
      const keys = await repoAiKeyModel.listKeys(input.repoId);
      return keys;
    }),

  /**
   * Set an AI API key for a repository
   * Creates or updates the key for the specified provider
   */
  set: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        provider: aiProviderSchema,
        apiKey: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoOwner(input.repoId, ctx.user.id);
      
      // Validate API key format based on provider
      if (input.provider === 'openai' && !input.apiKey.startsWith('sk-')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'OpenAI API keys should start with "sk-"',
        });
      }
      
      if (input.provider === 'anthropic' && !input.apiKey.startsWith('sk-ant-')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Anthropic API keys should start with "sk-ant-"',
        });
      }
      
      // CodeRabbit keys don't have a specific prefix requirement
      // but should be non-empty (already validated by z.string().min(1))
      
      const keyInfo = await repoAiKeyModel.setKey(
        input.repoId,
        input.provider,
        input.apiKey,
        ctx.user.id
      );
      
      return keyInfo;
    }),

  /**
   * Delete an AI key for a repository
   */
  delete: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        provider: aiProviderSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoOwner(input.repoId, ctx.user.id);
      
      const deleted = await repoAiKeyModel.deleteKey(input.repoId, input.provider);
      
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'AI key not found',
        });
      }
      
      return { success: true };
    }),

  /**
   * Check if a repository has any AI keys configured
   * Available to anyone with repo access (to show AI feature availability)
   */
  hasKeys: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const hasKeys = await repoAiKeyModel.hasKeys(input.repoId);
      return { hasKeys };
    }),

  /**
   * Check AI availability for a repository
   * Returns whether AI features can be used (either repo keys or server keys)
   */
  checkAvailability: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      // Check if repo has its own keys
      const hasRepoKeys = await repoAiKeyModel.hasKeys(input.repoId);
      
      // Check if server has global keys
      const hasServerKeys = !!(
        process.env.OPENAI_API_KEY || 
        process.env.ANTHROPIC_API_KEY
      );
      
      return {
        available: hasRepoKeys || hasServerKeys,
        source: hasRepoKeys ? 'repository' : hasServerKeys ? 'server' : null,
        hasRepoKeys,
        hasServerKeys,
      };
    }),
});
