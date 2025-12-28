/**
 * Code Completion Router
 * 
 * AI-powered code completion API for the IDE.
 * Uses Mastra for all AI operations.
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { Agent } from '@mastra/core/agent';
import { getAnyApiKeyForRepo, isAIAvailable, isAIAvailableForRepo } from '../../../ai/mastra.js';

// Cache for rate limiting and deduplication
const completionCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL_MS = 5000; // 5 seconds

// Rate limiting per user
const userRateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

/**
 * System prompt for code completion
 */
const COMPLETION_SYSTEM_PROMPT = `You are an expert code completion assistant. Your task is to complete the code at the cursor position.

Rules:
1. Only output the completion text - no explanations, no markdown, no code blocks
2. Complete in a way that makes the code syntactically correct
3. Match the existing code style (indentation, naming conventions)
4. Keep completions concise - complete the current statement or block
5. If the context suggests a function call, complete it with sensible parameters
6. Do not repeat code that's already in the prefix
7. The completion should flow naturally into the suffix
8. Output ONLY the raw code to insert - nothing else`;

/**
 * Create a completion agent using Mastra
 */
function createCompletionAgent(model: string): Agent {
  return new Agent({
    id: 'wit-completion-agent',
    name: 'Code Completion Agent',
    description: 'Generates inline code completions',
    instructions: COMPLETION_SYSTEM_PROMPT,
    model,
  });
}

/**
 * Generate completion using Mastra agent
 */
async function generateCompletion(
  prefix: string,
  suffix: string,
  language: string,
  filePath: string,
  repoId: string | null,
  maxTokens: number = 150
): Promise<string> {
  // Get API key (repo-level or server-level)
  const apiKeyInfo = await getAnyApiKeyForRepo(repoId);
  
  if (!apiKeyInfo) {
    throw new Error('No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or add an API key in repository settings.');
  }

  // Determine model based on provider
  const model = apiKeyInfo.provider === 'anthropic' 
    ? 'anthropic/claude-sonnet-4-20250514'
    : 'openai/gpt-4o-mini';

  // Create completion agent
  const agent = createCompletionAgent(model);

  // Build the completion prompt
  const userPrompt = `File: ${filePath}
Language: ${language}

Code before cursor:
${prefix.slice(-1500)}

Code after cursor:
${suffix.slice(0, 500)}

Complete the code at the cursor position. Output ONLY the completion text, nothing else.`;

  // Generate completion using Mastra agent
  const response = await agent.generate(userPrompt);

  // Extract text from response
  const completion = typeof response.text === 'string' ? response.text : '';
  
  return cleanCompletion(completion, prefix, suffix);
}

/**
 * Clean up completion text
 */
function cleanCompletion(completion: string, prefix: string, suffix: string): string {
  let cleaned = completion.trim();
  
  // Remove markdown code blocks if present
  cleaned = cleaned.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '');
  
  // Remove any leading/trailing quotes that might be artifacts
  if ((cleaned.startsWith('`') && cleaned.endsWith('`')) ||
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  
  // If the completion starts with text that's at the end of the prefix, remove it
  const prefixEnd = prefix.slice(-50);
  for (let i = Math.min(cleaned.length, 30); i > 0; i--) {
    const overlap = cleaned.slice(0, i);
    if (prefixEnd.endsWith(overlap)) {
      cleaned = cleaned.slice(i);
      break;
    }
  }
  
  // If completion ends with text that's at the start of suffix, remove it
  const suffixStart = suffix.slice(0, 50);
  for (let i = Math.min(cleaned.length, 30); i > 0; i--) {
    const overlap = cleaned.slice(-i);
    if (suffixStart.startsWith(overlap)) {
      cleaned = cleaned.slice(0, -i);
      break;
    }
  }
  
  return cleaned;
}

/**
 * Check and update rate limit for a user
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = userRateLimits.get(userId);
  
  if (!limit || now >= limit.resetAt) {
    userRateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  limit.count++;
  return true;
}

/**
 * Generate cache key for deduplication
 */
function getCacheKey(prefix: string, suffix: string, filePath: string): string {
  // Use last 200 chars of prefix and first 100 of suffix for cache key
  const prefixKey = prefix.slice(-200);
  const suffixKey = suffix.slice(0, 100);
  return `${filePath}:${prefixKey}:${suffixKey}`;
}

export const completionRouter = router({
  /**
   * Get AI-powered code completion
   */
  getCompletion: protectedProcedure
    .input(z.object({
      prefix: z.string().describe('Code before the cursor'),
      suffix: z.string().describe('Code after the cursor'),
      filePath: z.string().describe('Path to the current file'),
      language: z.string().describe('Programming language'),
      repoId: z.string().optional().describe('Repository ID for repo-specific API keys'),
      maxTokens: z.number().optional().default(150).describe('Maximum tokens to generate'),
    }))
    .mutation(async ({ input, ctx }) => {
      const { prefix, suffix, filePath, language, repoId, maxTokens } = input;
      const userId = ctx.user.id;

      // Rate limit check
      if (!checkRateLimit(userId)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Rate limit exceeded. Please wait before requesting more completions.',
        });
      }

      // Check cache for recent identical requests
      const cacheKey = getCacheKey(prefix, suffix, filePath);
      const cached = completionCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return {
          completion: cached.result,
          cached: true,
        };
      }

      // Check if AI is available (server-level or repo-level keys)
      const aiAvailable = repoId 
        ? await isAIAvailableForRepo(repoId)
        : isAIAvailable();
      
      if (!aiAvailable) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or add an API key in repository settings.',
        });
      }

      try {
        const completion = await generateCompletion(
          prefix,
          suffix,
          language,
          filePath,
          repoId || null,
          maxTokens
        );

        // Cache the result
        completionCache.set(cacheKey, { result: completion, timestamp: Date.now() });

        // Clean up old cache entries periodically
        if (completionCache.size > 1000) {
          const now = Date.now();
          for (const [key, value] of completionCache) {
            if (now - value.timestamp > CACHE_TTL_MS) {
              completionCache.delete(key);
            }
          }
        }

        return {
          completion,
          cached: false,
        };
      } catch (error) {
        console.error('Completion error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate completion',
        });
      }
    }),

  /**
   * Get multiple completion suggestions
   */
  getCompletions: protectedProcedure
    .input(z.object({
      prefix: z.string(),
      suffix: z.string(),
      filePath: z.string(),
      language: z.string(),
      repoId: z.string().optional(),
      count: z.number().optional().default(3).describe('Number of suggestions to generate'),
    }))
    .mutation(async ({ input, ctx }) => {
      const { prefix, suffix, filePath, language, repoId, count } = input;
      const userId = ctx.user.id;

      // Rate limit check (counts as multiple requests)
      for (let i = 0; i < count; i++) {
        if (!checkRateLimit(userId)) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Rate limit exceeded.',
          });
        }
      }

      // Check if AI is available (server-level or repo-level keys)
      const aiAvailable = repoId 
        ? await isAIAvailableForRepo(repoId)
        : isAIAvailable();
      
      if (!aiAvailable) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or add an API key in repository settings.',
        });
      }

      try {
        // Generate multiple completions with varying lengths
        const tokenCounts = [50, 100, 200].slice(0, count);
        const completions: string[] = [];

        for (const maxTokens of tokenCounts) {
          const completion = await generateCompletion(
            prefix,
            suffix,
            language,
            filePath,
            repoId || null,
            maxTokens
          );

          if (completion && !completions.includes(completion)) {
            completions.push(completion);
          }
        }

        return { completions };
      } catch (error) {
        console.error('Completions error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate completions',
        });
      }
    }),
});
