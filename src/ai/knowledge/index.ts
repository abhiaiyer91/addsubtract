/**
 * Knowledge Base Module
 * 
 * RAG-powered knowledge base for understanding codebases.
 */

// Core knowledge base
export { 
  KnowledgeBase,
  getKnowledgeBase,
  clearKnowledgeBaseCache,
} from './knowledge-base.js';

// Context builder
export {
  buildContext,
  buildContextWithBudget,
  formatContextForPrompt,
  summarizeContext,
  estimateContextTokens,
  type ContextBuildOptions,
} from './context-builder.js';

// Incremental indexer
export {
  IncrementalIndexer,
  createIndexer,
} from './incremental-indexer.js';

// Types
export type {
  KnowledgeChunk,
  KnowledgeType,
  KnowledgeMetadata,
  KnowledgeQueryOptions,
  KnowledgeQueryResult,
  KnowledgeStats,
  IndexOptions,
  IndexResult,
  AIContext,
} from './types.js';
