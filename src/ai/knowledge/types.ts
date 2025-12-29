/**
 * Knowledge Base Types
 * 
 * Types for the RAG-powered knowledge base that understands your codebase.
 */

import { z } from 'zod';

/**
 * Types of knowledge that can be indexed
 */
export type KnowledgeType = 
  | 'code'           // Source code (functions, classes, modules)
  | 'documentation'  // README, docs, comments
  | 'git-history'    // Commit messages, PR descriptions
  | 'issue'          // Issues and discussions
  | 'architecture'   // Inferred structure and patterns
  | 'convention';    // Coding conventions and style

/**
 * A single piece of knowledge with its embedding
 */
export interface KnowledgeChunk {
  /** Unique identifier */
  id: string;
  /** Repository ID */
  repoId: string;
  /** Type of knowledge */
  type: KnowledgeType;
  /** The actual content */
  content: string;
  /** Vector embedding (will be stored separately) */
  embedding?: number[];
  /** Metadata about the source */
  metadata: KnowledgeMetadata;
  /** When this was indexed */
  createdAt: Date;
  /** When this was last updated */
  updatedAt: Date;
}

/**
 * Metadata attached to knowledge chunks
 */
export interface KnowledgeMetadata {
  /** Source file path (for code/docs) */
  path?: string;
  /** Line numbers (for code) */
  startLine?: number;
  endLine?: number;
  /** Language (for code) */
  language?: string;
  /** Commit SHA (for git history) */
  commitSha?: string;
  /** Issue/PR number */
  issueNumber?: number;
  prNumber?: number;
  /** Author info */
  author?: string;
  /** Timestamp */
  timestamp?: Date;
  /** Additional tags */
  tags?: string[];
  /** The type of code construct (function, class, etc.) */
  constructType?: string;
  /** Name of the construct */
  constructName?: string;
}

/**
 * Query options for knowledge retrieval
 */
export interface KnowledgeQueryOptions {
  /** Maximum number of results */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
  /** Filter by knowledge type */
  type?: KnowledgeType | KnowledgeType[];
  /** Filter by file path pattern */
  pathPattern?: string;
  /** Filter by language */
  language?: string;
  /** Filter by tags */
  tags?: string[];
  /** Include full content or just metadata */
  includeContent?: boolean;
}

/**
 * Result from a knowledge query
 */
export interface KnowledgeQueryResult {
  /** The knowledge chunk */
  chunk: KnowledgeChunk;
  /** Similarity score (0-1) */
  similarity: number;
  /** Highlighted/relevant portion */
  highlight?: string;
}

/**
 * Context built from knowledge for AI interactions
 */
export interface AIContext {
  /** The original query */
  query: string;
  /** Relevant code snippets */
  relevantCode: KnowledgeQueryResult[];
  /** Relevant documentation */
  relevantDocs: KnowledgeQueryResult[];
  /** Relevant git history */
  relevantHistory: KnowledgeQueryResult[];
  /** Relevant issues/PRs */
  relevantIssues: KnowledgeQueryResult[];
  /** Repository structure summary */
  repoStructure?: string;
  /** Detected conventions */
  conventions?: string[];
}

/**
 * Statistics about the knowledge base
 */
export interface KnowledgeStats {
  /** Total number of chunks */
  totalChunks: number;
  /** Chunks by type */
  chunksByType: Record<KnowledgeType, number>;
  /** Number of indexed files */
  filesIndexed: number;
  /** Last index time */
  lastIndexed?: Date;
  /** Index size in bytes */
  sizeBytes: number;
}

/**
 * Options for indexing
 */
export interface IndexOptions {
  /** Force reindex even if unchanged */
  force?: boolean;
  /** File patterns to include */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Show progress */
  verbose?: boolean;
  /** Index in batches */
  batchSize?: number;
  /** Types to index */
  types?: KnowledgeType[];
}

/**
 * Result from indexing operation
 */
export interface IndexResult {
  /** Number of chunks created */
  chunksCreated: number;
  /** Number of files processed */
  filesProcessed: number;
  /** Number of items skipped */
  skipped: number;
  /** Errors encountered */
  errors: Array<{ source: string; error: string }>;
  /** Time taken in ms */
  duration: number;
}

/**
 * Zod schemas for validation
 */
export const KnowledgeTypeSchema = z.enum([
  'code',
  'documentation', 
  'git-history',
  'issue',
  'architecture',
  'convention',
]);

export const KnowledgeMetadataSchema = z.object({
  path: z.string().optional(),
  startLine: z.number().optional(),
  endLine: z.number().optional(),
  language: z.string().optional(),
  commitSha: z.string().optional(),
  issueNumber: z.number().optional(),
  prNumber: z.number().optional(),
  author: z.string().optional(),
  timestamp: z.date().optional(),
  tags: z.array(z.string()).optional(),
  constructType: z.string().optional(),
  constructName: z.string().optional(),
});

export const KnowledgeQueryOptionsSchema = z.object({
  limit: z.number().optional().default(10),
  minSimilarity: z.number().min(0).max(1).optional().default(0.5),
  type: z.union([KnowledgeTypeSchema, z.array(KnowledgeTypeSchema)]).optional(),
  pathPattern: z.string().optional(),
  language: z.string().optional(),
  tags: z.array(z.string()).optional(),
  includeContent: z.boolean().optional().default(true),
});
