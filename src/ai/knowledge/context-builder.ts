/**
 * Context Builder
 * 
 * Builds rich AI context from the knowledge base for any query.
 * This is what makes the AI actually understand your codebase.
 */

import { getKnowledgeBase } from './knowledge-base.js';
import type { AIContext, KnowledgeQueryResult } from './types.js';

/**
 * Options for building context
 */
export interface ContextBuildOptions {
  /** Maximum code snippets to include */
  maxCode?: number;
  /** Maximum documentation snippets */
  maxDocs?: number;
  /** Maximum history items */
  maxHistory?: number;
  /** Maximum issues */
  maxIssues?: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Include repository structure */
  includeStructure?: boolean;
  /** Include conventions */
  includeConventions?: boolean;
}

const DEFAULT_OPTIONS: ContextBuildOptions = {
  maxCode: 5,
  maxDocs: 3,
  maxHistory: 5,
  maxIssues: 3,
  minSimilarity: 0.4,
  includeStructure: true,
  includeConventions: true,
};

/**
 * Build comprehensive context for an AI query
 */
export async function buildContext(
  query: string,
  repoId: string,
  options: ContextBuildOptions = {}
): Promise<AIContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const kb = getKnowledgeBase(repoId);
  await kb.init();

  // Query all knowledge types in parallel
  const [
    relevantCode,
    relevantDocs,
    relevantHistory,
    relevantIssues,
    conventions,
    architecture,
  ] = await Promise.all([
    kb.query(query, {
      type: 'code',
      limit: opts.maxCode,
      minSimilarity: opts.minSimilarity,
    }),
    kb.query(query, {
      type: 'documentation',
      limit: opts.maxDocs,
      minSimilarity: opts.minSimilarity,
    }),
    kb.query(query, {
      type: 'git-history',
      limit: opts.maxHistory,
      minSimilarity: opts.minSimilarity,
    }),
    kb.query(query, {
      type: 'issue',
      limit: opts.maxIssues,
      minSimilarity: opts.minSimilarity,
    }),
    opts.includeConventions
      ? kb.query(query, { type: 'convention', limit: 3 })
      : Promise.resolve([]),
    opts.includeStructure
      ? kb.query(query, { type: 'architecture', limit: 2 })
      : Promise.resolve([]),
  ]);

  return {
    query,
    relevantCode,
    relevantDocs,
    relevantHistory,
    relevantIssues,
    repoStructure: architecture.map(a => a.chunk.content).join('\n\n') || undefined,
    conventions: conventions.map(c => c.chunk.content),
  };
}

/**
 * Format context as a string for inclusion in prompts
 */
export function formatContextForPrompt(context: AIContext): string {
  const sections: string[] = [];

  // Add relevant code
  if (context.relevantCode.length > 0) {
    sections.push('## Relevant Code\n');
    for (const result of context.relevantCode) {
      const meta = result.chunk.metadata;
      const header = meta.path 
        ? `### ${meta.path}${meta.startLine ? `:${meta.startLine}-${meta.endLine}` : ''}`
        : '### Code Snippet';
      sections.push(`${header} (${Math.round(result.similarity * 100)}% match)\n`);
      sections.push('```' + (meta.language || '') + '\n');
      sections.push(result.chunk.content);
      sections.push('\n```\n');
    }
  }

  // Add relevant documentation
  if (context.relevantDocs.length > 0) {
    sections.push('## Relevant Documentation\n');
    for (const result of context.relevantDocs) {
      const meta = result.chunk.metadata;
      const header = meta.path || 'Documentation';
      sections.push(`### ${header}\n`);
      sections.push(result.chunk.content);
      sections.push('\n');
    }
  }

  // Add git history
  if (context.relevantHistory.length > 0) {
    sections.push('## Related Git History\n');
    for (const result of context.relevantHistory) {
      sections.push(`- ${result.chunk.content.split('\n')[0]}\n`);
    }
  }

  // Add related issues
  if (context.relevantIssues.length > 0) {
    sections.push('## Related Issues\n');
    for (const result of context.relevantIssues) {
      sections.push(`- ${result.chunk.content.split('\n')[0]}\n`);
    }
  }

  // Add conventions
  if (context.conventions && context.conventions.length > 0) {
    sections.push('## Project Conventions\n');
    for (const convention of context.conventions) {
      sections.push(`- ${convention}\n`);
    }
  }

  // Add structure
  if (context.repoStructure) {
    sections.push('## Repository Structure\n');
    sections.push(context.repoStructure);
    sections.push('\n');
  }

  return sections.join('\n');
}

/**
 * Create a summary of the context for logging/debugging
 */
export function summarizeContext(context: AIContext): string {
  return [
    `Query: "${context.query}"`,
    `Code snippets: ${context.relevantCode.length}`,
    `Documentation: ${context.relevantDocs.length}`,
    `Git history: ${context.relevantHistory.length}`,
    `Issues: ${context.relevantIssues.length}`,
    context.conventions ? `Conventions: ${context.conventions.length}` : null,
    context.repoStructure ? 'Has structure info' : null,
  ].filter(Boolean).join(', ');
}

/**
 * Estimate token count for context (rough)
 */
export function estimateContextTokens(context: AIContext): number {
  const formatted = formatContextForPrompt(context);
  // Rough estimate: 4 characters per token
  return Math.ceil(formatted.length / 4);
}

/**
 * Trim context to fit within token budget
 */
export async function buildContextWithBudget(
  query: string,
  repoId: string,
  maxTokens: number
): Promise<AIContext> {
  // Start with default options
  let options = { ...DEFAULT_OPTIONS };
  let context = await buildContext(query, repoId, options);
  let tokens = estimateContextTokens(context);

  // Reduce context until it fits
  while (tokens > maxTokens && (options.maxCode! > 1 || options.maxDocs! > 1)) {
    if (options.maxCode! > 2) options.maxCode!--;
    else if (options.maxDocs! > 1) options.maxDocs!--;
    else if (options.maxHistory! > 2) options.maxHistory!--;
    else if (options.maxIssues! > 1) options.maxIssues!--;
    else options.maxCode!--;

    context = await buildContext(query, repoId, options);
    tokens = estimateContextTokens(context);
  }

  return context;
}
