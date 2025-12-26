/**
 * File-based Vector Store for Semantic Search
 * 
 * Stores embeddings locally in the .wit directory for fast retrieval.
 * Uses a simple JSON-based storage with in-memory caching.
 */

import * as path from 'path';
import * as fs from 'fs';
import { cosineSimilarity, EMBEDDING_DIMENSIONS } from './embeddings.js';
import { compress, decompress } from '../utils/compression.js';

/**
 * A stored vector with metadata
 */
export interface StoredVector {
  /** Unique identifier */
  id: string;
  /** The embedding vector */
  embedding: number[];
  /** Associated metadata */
  metadata: VectorMetadata;
  /** When this was created/updated */
  updatedAt: number;
}

/**
 * Metadata associated with a vector
 */
export interface VectorMetadata {
  /** File path relative to repo root */
  path: string;
  /** Starting line number */
  startLine: number;
  /** Ending line number */
  endLine: number;
  /** The original code content */
  content: string;
  /** Type of chunk (function, class, etc.) */
  chunkType: string;
  /** Name of the chunk if available */
  chunkName?: string;
  /** Language of the code */
  language: string;
}

/**
 * Query result from vector search
 */
export interface VectorQueryResult {
  /** The stored vector */
  vector: StoredVector;
  /** Similarity score (0-1, higher is more similar) */
  similarity: number;
}

/**
 * Options for vector store
 */
export interface VectorStoreOptions {
  /** Directory to store vectors (defaults to .wit/embeddings) */
  storageDir?: string;
  /** Whether to use compression */
  compress?: boolean;
  /** Cache size limit in number of vectors */
  cacheSize?: number;
}

/**
 * File-based vector store
 */
export class VectorStore {
  private storageDir: string;
  private useCompression: boolean;
  private cacheSize: number;
  private cache: Map<string, StoredVector> = new Map();
  private indexPath: string;
  private index: VectorIndex | null = null;
  private dirty: boolean = false;

  constructor(gitDir: string, options: VectorStoreOptions = {}) {
    this.storageDir = options.storageDir || path.join(gitDir, 'embeddings');
    this.useCompression = options.compress ?? true;
    this.cacheSize = options.cacheSize ?? 10000;
    this.indexPath = path.join(this.storageDir, 'index.json');
  }

  /**
   * Initialize the vector store
   */
  init(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.loadIndex();
  }

  /**
   * Load or create the index
   */
  private loadIndex(): void {
    if (fs.existsSync(this.indexPath)) {
      try {
        const data = fs.readFileSync(this.indexPath, 'utf8');
        this.index = JSON.parse(data);
      } catch {
        this.index = this.createEmptyIndex();
      }
    } else {
      this.index = this.createEmptyIndex();
    }
  }

  /**
   * Create an empty index
   */
  private createEmptyIndex(): VectorIndex {
    return {
      version: 1,
      dimensions: EMBEDDING_DIMENSIONS,
      vectorCount: 0,
      files: {},
      lastUpdated: Date.now(),
    };
  }

  /**
   * Save the index to disk
   */
  private saveIndex(): void {
    if (!this.index) return;
    this.index.lastUpdated = Date.now();
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2));
    this.dirty = false;
  }

  /**
   * Upsert vectors for a file
   */
  async upsert(vectors: StoredVector[]): Promise<void> {
    if (!this.index) this.loadIndex();

    for (const vector of vectors) {
      // Update cache
      this.cache.set(vector.id, vector);

      // Update file index
      const filePath = vector.metadata.path;
      if (!this.index!.files[filePath]) {
        this.index!.files[filePath] = {
          vectorIds: [],
          lastIndexed: 0,
        };
      }
      
      if (!this.index!.files[filePath].vectorIds.includes(vector.id)) {
        this.index!.files[filePath].vectorIds.push(vector.id);
        this.index!.vectorCount++;
      }
      this.index!.files[filePath].lastIndexed = Date.now();

      // Store vector to disk
      await this.storeVector(vector);
    }

    // Manage cache size
    this.pruneCache();
    
    this.dirty = true;
    this.saveIndex();
  }

  /**
   * Store a single vector to disk
   */
  private async storeVector(vector: StoredVector): Promise<void> {
    const vectorPath = this.getVectorPath(vector.id);
    const dir = path.dirname(vectorPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = JSON.stringify(vector);
    
    if (this.useCompression) {
      const compressed = compress(Buffer.from(data));
      fs.writeFileSync(vectorPath + '.gz', compressed);
    } else {
      fs.writeFileSync(vectorPath, data);
    }
  }

  /**
   * Load a vector from disk
   */
  private loadVector(id: string): StoredVector | null {
    // Check cache first
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    const vectorPath = this.getVectorPath(id);
    
    try {
      let data: string;
      
      if (this.useCompression && fs.existsSync(vectorPath + '.gz')) {
        const compressed = fs.readFileSync(vectorPath + '.gz');
        data = decompress(compressed).toString();
      } else if (fs.existsSync(vectorPath)) {
        data = fs.readFileSync(vectorPath, 'utf8');
      } else {
        return null;
      }

      const vector = JSON.parse(data) as StoredVector;
      this.cache.set(id, vector);
      return vector;
    } catch {
      return null;
    }
  }

  /**
   * Get the file path for a vector
   */
  private getVectorPath(id: string): string {
    // Use first 2 chars as subdirectory for better filesystem performance
    const prefix = id.slice(0, 2);
    return path.join(this.storageDir, 'vectors', prefix, `${id}.json`);
  }

  /**
   * Delete vectors for a file
   */
  async deleteForFile(filePath: string): Promise<void> {
    if (!this.index) this.loadIndex();

    const fileInfo = this.index!.files[filePath];
    if (!fileInfo) return;

    // Delete vector files
    for (const id of fileInfo.vectorIds) {
      this.cache.delete(id);
      
      const vectorPath = this.getVectorPath(id);
      try {
        if (fs.existsSync(vectorPath + '.gz')) {
          fs.unlinkSync(vectorPath + '.gz');
        }
        if (fs.existsSync(vectorPath)) {
          fs.unlinkSync(vectorPath);
        }
      } catch {
        // Ignore deletion errors
      }
    }

    // Update index
    this.index!.vectorCount -= fileInfo.vectorIds.length;
    delete this.index!.files[filePath];
    
    this.dirty = true;
    this.saveIndex();
  }

  /**
   * Query for similar vectors
   */
  async query(
    queryEmbedding: number[],
    options: {
      topK?: number;
      minSimilarity?: number;
      filter?: (metadata: VectorMetadata) => boolean;
    } = {}
  ): Promise<VectorQueryResult[]> {
    const { topK = 10, minSimilarity = 0.5, filter } = options;

    if (!this.index) this.loadIndex();

    const results: VectorQueryResult[] = [];

    // Load all vectors and compute similarity
    for (const fileInfo of Object.values(this.index!.files)) {
      for (const id of fileInfo.vectorIds) {
        const vector = this.loadVector(id);
        if (!vector) continue;

        // Apply filter if provided
        if (filter && !filter(vector.metadata)) continue;

        const similarity = cosineSimilarity(queryEmbedding, vector.embedding);
        
        if (similarity >= minSimilarity) {
          results.push({ vector, similarity });
        }
      }
    }

    // Sort by similarity (descending) and take top K
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  /**
   * Check if a file needs reindexing
   */
  needsReindex(filePath: string, fileModTime: number): boolean {
    if (!this.index) this.loadIndex();

    const fileInfo = this.index!.files[filePath];
    if (!fileInfo) return true;

    return fileModTime > fileInfo.lastIndexed;
  }

  /**
   * Get all indexed files
   */
  getIndexedFiles(): string[] {
    if (!this.index) this.loadIndex();
    return Object.keys(this.index!.files);
  }

  /**
   * Get stats about the vector store
   */
  getStats(): VectorStoreStats {
    if (!this.index) this.loadIndex();

    return {
      vectorCount: this.index!.vectorCount,
      fileCount: Object.keys(this.index!.files).length,
      dimensions: this.index!.dimensions,
      cacheSize: this.cache.size,
      lastUpdated: new Date(this.index!.lastUpdated),
    };
  }

  /**
   * Prune cache to stay within size limits
   */
  private pruneCache(): void {
    if (this.cache.size <= this.cacheSize) return;

    // Remove oldest entries (simple LRU approximation)
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    
    const toRemove = entries.slice(0, entries.length - this.cacheSize);
    for (const [id] of toRemove) {
      this.cache.delete(id);
    }
  }

  /**
   * Clear all vectors
   */
  async clear(): Promise<void> {
    this.cache.clear();
    
    // Remove all vector files
    const vectorsDir = path.join(this.storageDir, 'vectors');
    if (fs.existsSync(vectorsDir)) {
      fs.rmSync(vectorsDir, { recursive: true });
    }

    // Reset index
    this.index = this.createEmptyIndex();
    this.saveIndex();
  }

  /**
   * Flush any pending changes
   */
  flush(): void {
    if (this.dirty) {
      this.saveIndex();
    }
  }
}

/**
 * Index structure stored on disk
 */
interface VectorIndex {
  version: number;
  dimensions: number;
  vectorCount: number;
  files: Record<string, {
    vectorIds: string[];
    lastIndexed: number;
  }>;
  lastUpdated: number;
}

/**
 * Stats about the vector store
 */
export interface VectorStoreStats {
  vectorCount: number;
  fileCount: number;
  dimensions: number;
  cacheSize: number;
  lastUpdated: Date;
}
