/**
 * Semantic Search Module
 * 
 * Provides AI-powered natural language code search using embeddings.
 */

// Core semantic search
export { 
  SemanticSearch,
  createSemanticSearch,
  type SemanticSearchResult,
  type SemanticSearchOptions,
  type IndexOptions,
  type IndexStats,
} from './semantic.js';

// Embedding utilities
export {
  generateEmbedding,
  generateEmbeddings,
  generateCodeEmbedding,
  generateCodeEmbeddings,
  detectLanguage,
  cosineSimilarity,
  EMBEDDING_DIMENSIONS,
  type CodeContext,
} from './embeddings.js';

// Code chunking
export {
  chunkCode,
  type CodeChunk,
  type ChunkType,
  type ChunkOptions,
} from './chunker.js';

// Vector storage
export {
  VectorStore,
  type StoredVector,
  type VectorMetadata,
  type VectorQueryResult,
  type VectorStoreOptions,
  type VectorStoreStats,
} from './vector-store.js';
