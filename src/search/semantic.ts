/**
 * Semantic Code Search
 * 
 * Natural language search over code using embeddings.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Repository } from '../core/repository.js';
import { VectorStore, StoredVector, VectorMetadata, VectorQueryResult } from './vector-store.js';
import { generateEmbedding, generateCodeEmbeddings, detectLanguage } from './embeddings.js';
import { chunkCode, CodeChunk } from './chunker.js';
import { walkDir, loadIgnorePatterns, readFileText } from '../utils/fs.js';

/**
 * Result from semantic search
 */
export interface SemanticSearchResult {
  /** File path relative to repo root */
  path: string;
  /** Starting line number */
  startLine: number;
  /** Ending line number */
  endLine: number;
  /** The matched code content */
  content: string;
  /** Similarity score (0-1) */
  score: number;
  /** Type of code chunk */
  chunkType: string;
  /** Name of the chunk if available */
  chunkName?: string;
  /** Language of the code */
  language: string;
}

/**
 * Options for semantic search
 */
export interface SemanticSearchOptions {
  /** Maximum number of results */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
  /** Filter by file path pattern */
  pathPattern?: string;
  /** Filter by language */
  language?: string;
  /** Filter by chunk type */
  chunkType?: string;
}

/**
 * Options for indexing
 */
export interface IndexOptions {
  /** Force reindex even if files haven't changed */
  force?: boolean;
  /** File patterns to include */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Show progress */
  verbose?: boolean;
  /** Maximum files to index in one batch */
  batchSize?: number;
}

/**
 * Semantic search engine for a repository
 */
export class SemanticSearch {
  private repo: Repository;
  private vectorStore: VectorStore;
  private repoDescription?: string;

  constructor(repo: Repository, repoDescription?: string) {
    this.repo = repo;
    this.vectorStore = new VectorStore(repo.gitDir);
    this.repoDescription = repoDescription;
  }

  /**
   * Initialize the semantic search
   */
  init(): void {
    this.vectorStore.init();
  }

  /**
   * Perform semantic search with a natural language query
   */
  async search(query: string, options: SemanticSearchOptions = {}): Promise<SemanticSearchResult[]> {
    const {
      limit = 10,
      minSimilarity = 0.5,
      pathPattern,
      language,
      chunkType,
    } = options;

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Build filter function
    const filter = (metadata: VectorMetadata): boolean => {
      if (pathPattern && !metadata.path.includes(pathPattern)) {
        return false;
      }
      if (language && metadata.language !== language) {
        return false;
      }
      if (chunkType && metadata.chunkType !== chunkType) {
        return false;
      }
      return true;
    };

    // Query vector store
    const results = await this.vectorStore.query(queryEmbedding, {
      topK: limit,
      minSimilarity,
      filter,
    });

    // Convert to search results
    return results.map(this.toSearchResult);
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string, options: { force?: boolean } = {}): Promise<number> {
    const fullPath = path.join(this.repo.workDir, filePath);
    
    if (!fs.existsSync(fullPath)) {
      return 0;
    }

    const stat = fs.statSync(fullPath);
    
    // Check if reindexing is needed
    if (!options.force && !this.vectorStore.needsReindex(filePath, stat.mtimeMs)) {
      return 0;
    }

    // Delete existing vectors for this file
    await this.vectorStore.deleteForFile(filePath);

    // Read file content
    let content: string;
    try {
      content = readFileText(fullPath);
    } catch {
      // Skip binary or unreadable files
      return 0;
    }

    // Skip empty files
    if (!content.trim()) {
      return 0;
    }

    // Chunk the code
    const chunks = chunkCode(content, filePath);
    
    if (chunks.length === 0) {
      return 0;
    }

    // Generate embeddings
    const language = detectLanguage(filePath);
    const embeddings = await generateCodeEmbeddings(
      chunks.map(chunk => ({
        code: chunk.content,
        context: {
          path: filePath,
          language,
          repoDescription: this.repoDescription,
        },
      }))
    );

    // Create stored vectors
    const vectors: StoredVector[] = chunks.map((chunk, i) => ({
      id: this.generateVectorId(filePath, chunk),
      embedding: embeddings[i],
      metadata: {
        path: filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        chunkType: chunk.type,
        chunkName: chunk.name,
        language,
      },
      updatedAt: Date.now(),
    }));

    // Store vectors
    await this.vectorStore.upsert(vectors);

    return vectors.length;
  }

  /**
   * Index all files in the repository
   */
  async indexRepository(options: IndexOptions = {}): Promise<IndexStats> {
    const {
      force = false,
      include = [],
      exclude = [],
      verbose = false,
      batchSize = 50,
    } = options;

    const stats: IndexStats = {
      filesIndexed: 0,
      filesSkipped: 0,
      chunksCreated: 0,
      errors: [],
      duration: 0,
    };

    const startTime = Date.now();

    // Get ignore patterns
    const ignorePatterns = loadIgnorePatterns(this.repo.workDir);
    
    // Add default exclusions for binary/non-code files
    const defaultExcludes = [
      'node_modules/',
      '.git/',
      '.wit/',
      'dist/',
      'build/',
      'coverage/',
      '*.min.js',
      '*.min.css',
      '*.map',
      '*.lock',
      'package-lock.json',
      'yarn.lock',
      '*.png',
      '*.jpg',
      '*.jpeg',
      '*.gif',
      '*.ico',
      '*.svg',
      '*.woff',
      '*.woff2',
      '*.ttf',
      '*.eot',
      '*.pdf',
      '*.zip',
      '*.tar',
      '*.gz',
    ];

    const allExcludes = [...ignorePatterns, ...defaultExcludes, ...exclude];

    // Get all files
    const files = walkDir(this.repo.workDir, allExcludes);
    
    // Filter by include patterns if specified
    let filesToIndex = files.map(f => path.relative(this.repo.workDir, f));
    
    if (include.length > 0) {
      filesToIndex = filesToIndex.filter(file => 
        include.some(pattern => this.matchPattern(file, pattern))
      );
    }

    // Process files in batches
    for (let i = 0; i < filesToIndex.length; i += batchSize) {
      const batch = filesToIndex.slice(i, i + batchSize);
      
      if (verbose) {
        console.log(`Indexing files ${i + 1}-${Math.min(i + batchSize, filesToIndex.length)} of ${filesToIndex.length}...`);
      }

      for (const file of batch) {
        try {
          const chunks = await this.indexFile(file, { force });
          
          if (chunks > 0) {
            stats.filesIndexed++;
            stats.chunksCreated += chunks;
          } else {
            stats.filesSkipped++;
          }
        } catch (error) {
          stats.errors.push({
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    stats.duration = Date.now() - startTime;

    if (verbose) {
      console.log(`\nIndexing complete:`);
      console.log(`  Files indexed: ${stats.filesIndexed}`);
      console.log(`  Files skipped: ${stats.filesSkipped}`);
      console.log(`  Chunks created: ${stats.chunksCreated}`);
      console.log(`  Errors: ${stats.errors.length}`);
      console.log(`  Duration: ${(stats.duration / 1000).toFixed(2)}s`);
    }

    return stats;
  }

  /**
   * Remove a file from the index
   */
  async removeFile(filePath: string): Promise<void> {
    await this.vectorStore.deleteForFile(filePath);
  }

  /**
   * Clear the entire index
   */
  async clearIndex(): Promise<void> {
    await this.vectorStore.clear();
  }

  /**
   * Get index statistics
   */
  getStats() {
    return this.vectorStore.getStats();
  }

  /**
   * Generate a unique ID for a vector
   */
  private generateVectorId(filePath: string, chunk: CodeChunk): string {
    const content = `${filePath}:${chunk.startLine}:${chunk.endLine}:${chunk.content}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Convert a query result to a search result
   */
  private toSearchResult(result: VectorQueryResult): SemanticSearchResult {
    return {
      path: result.vector.metadata.path,
      startLine: result.vector.metadata.startLine,
      endLine: result.vector.metadata.endLine,
      content: result.vector.metadata.content,
      score: result.similarity,
      chunkType: result.vector.metadata.chunkType,
      chunkName: result.vector.metadata.chunkName,
      language: result.vector.metadata.language,
    };
  }

  /**
   * Simple pattern matching
   */
  private matchPattern(file: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    
    return new RegExp(`^${regex}$`).test(file);
  }
}

/**
 * Statistics from indexing operation
 */
export interface IndexStats {
  filesIndexed: number;
  filesSkipped: number;
  chunksCreated: number;
  errors: Array<{ file: string; error: string }>;
  duration: number;
}

/**
 * Create a semantic search instance for a repository
 */
export function createSemanticSearch(repo: Repository, description?: string): SemanticSearch {
  const search = new SemanticSearch(repo, description);
  search.init();
  return search;
}
