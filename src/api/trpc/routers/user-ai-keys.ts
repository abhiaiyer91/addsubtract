/**
 * User AI Keys Router
 * 
 * Handles API key management for AI providers per user.
 * Users can set their own keys to use AI features across all repositories.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { userAiKeyModel } from '../../../db/models';

// Valid AI providers
const aiProviderSchema = z.enum(['openai', 'anthropic', 'coderabbit']);

export const userAiKeysRouter = router({
  /**
   * Get all AI settings for the current user
   */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    // Check server keys availability
    const hasServerKeys = !!(
      process.env.OPENAI_API_KEY || 
      process.env.ANTHROPIC_API_KEY
    );
    
    // Fetch user's keys
    const [keys, hasUserKeys] = await Promise.all([
      userAiKeyModel.listKeys(ctx.user.id),
      userAiKeyModel.hasKeys(ctx.user.id),
    ]);
    
    return {
      keys,
      availability: {
        available: hasUserKeys || hasServerKeys,
        source: hasUserKeys ? 'user' as const : hasServerKeys ? 'server' as const : null,
        hasUserKeys,
        hasServerKeys,
      },
    };
  }),

  /**
   * List all AI keys for the current user (metadata only, not decrypted)
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const keys = await userAiKeyModel.listKeys(ctx.user.id);
    return keys;
  }),

  /**
   * Set an AI API key for the current user
   * Creates or updates the key for the specified provider
   */
  set: protectedProcedure
    .input(
      z.object({
        provider: aiProviderSchema,
        apiKey: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
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
      
      const keyInfo = await userAiKeyModel.setKey(
        ctx.user.id,
        input.provider,
        input.apiKey
      );
      
      return keyInfo;
    }),

  /**
   * Delete an AI key for the current user
   */
  delete: protectedProcedure
    .input(
      z.object({
        provider: aiProviderSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const deleted = await userAiKeyModel.deleteKey(ctx.user.id, input.provider);
      
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'AI key not found',
        });
      }
      
      return { success: true };
    }),

  /**
   * Check if the current user has any AI keys configured
   */
  hasKeys: protectedProcedure.query(async ({ ctx }) => {
    const hasKeys = await userAiKeyModel.hasKeys(ctx.user.id);
    return { hasKeys };
  }),

  /**
   * Check AI availability for the current user
   * Returns whether AI features can be used (user keys or server keys)
   */
  checkAvailability: protectedProcedure.query(async ({ ctx }) => {
    // Check if user has their own keys
    const hasUserKeys = await userAiKeyModel.hasKeys(ctx.user.id);
    
    // Check if server has global keys
    const hasServerKeys = !!(
      process.env.OPENAI_API_KEY || 
      process.env.ANTHROPIC_API_KEY
    );
    
    return {
      available: hasUserKeys || hasServerKeys,
      source: hasUserKeys ? 'user' : hasServerKeys ? 'server' : null,
      hasUserKeys,
      hasServerKeys,
    };
  }),
});
