/**
 * Knowledge Base
 * 
 * RAG-powered knowledge base that truly understands your codebase.
 * Uses embeddings to enable semantic search across code, documentation,
 * git history, issues, and more.
 */

import * as crypto from 'crypto';
import { generateEmbedding, generateCodeEmbeddings } from '../../search/embeddings.js';
import { chunkCode } from '../../search/chunker.js';
import type {
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

/**
 * Knowledge Base for a repository
 * 
 * Stores and retrieves knowledge using vector embeddings for semantic search.
 */
export class KnowledgeBase {
  private repoId: string;
  private chunks: Map<string, KnowledgeChunk> = new Map();
  private embeddings: Map<string, number[]> = new Map();
  private initialized = false;

  constructor(repoId: string) {
    this.repoId = repoId;
  }

  /**
   * Initialize the knowledge base
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    // In production, this would load from PostgreSQL with pgvector
    // For now, we use in-memory storage
    this.initialized = true;
  }

  /**
   * Add knowledge to the base
   */
  async addKnowledge(
    content: string,
    type: KnowledgeType,
    metadata: KnowledgeMetadata
  ): Promise<KnowledgeChunk> {
    await this.init();

    const id = this.generateId(content, type, metadata);
    
    // Check if already exists
    if (this.chunks.has(id)) {
      return this.chunks.get(id)!;
    }

    // Generate embedding
    const embedding = await generateEmbedding(content);

    const chunk: KnowledgeChunk = {
      id,
      repoId: this.repoId,
      type,
      content,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.chunks.set(id, chunk);
    this.embeddings.set(id, embedding);

    return chunk;
  }

  /**
   * Add multiple knowledge chunks in batch
   */
  async addBatch(
    items: Array<{
      content: string;
      type: KnowledgeType;
      metadata: KnowledgeMetadata;
    }>
  ): Promise<KnowledgeChunk[]> {
    await this.init();

    const results: KnowledgeChunk[] = [];
    
    // Generate embeddings in batch for efficiency
    const contents = items.map(item => item.content);
    const embeddings = await generateCodeEmbeddings(
      contents.map((code, i) => ({
        code,
        context: {
          path: items[i].metadata.path || '',
          language: items[i].metadata.language || 'text',
        },
      }))
    );

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const id = this.generateId(item.content, item.type, item.metadata);
      
      const chunk: KnowledgeChunk = {
        id,
        repoId: this.repoId,
        type: item.type,
        content: item.content,
        metadata: item.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.chunks.set(id, chunk);
      this.embeddings.set(id, embeddings[i]);
      results.push(chunk);
    }

    return results;
  }

  /**
   * Query the knowledge base with a natural language query
   */
  async query(
    queryText: string,
    options: KnowledgeQueryOptions = {}
  ): Promise<KnowledgeQueryResult[]> {
    await this.init();

    const {
      limit = 10,
      minSimilarity = 0.5,
      type,
      pathPattern,
      language,
      tags,
      includeContent = true,
    } = options;

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(queryText);

    // Calculate similarities and filter
    const results: KnowledgeQueryResult[] = [];

    for (const [id, chunk] of this.chunks) {
      // Apply type filter
      if (type) {
        const types = Array.isArray(type) ? type : [type];
        if (!types.includes(chunk.type)) continue;
      }

      // Apply path filter
      if (pathPattern && chunk.metadata.path) {
        if (!chunk.metadata.path.includes(pathPattern)) continue;
      }

      // Apply language filter
      if (language && chunk.metadata.language !== language) continue;

      // Apply tags filter
      if (tags && tags.length > 0) {
        const chunkTags = chunk.metadata.tags || [];
        if (!tags.some(t => chunkTags.includes(t))) continue;
      }

      // Calculate cosine similarity
      const embedding = this.embeddings.get(id);
      if (!embedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      
      if (similarity >= minSimilarity) {
        results.push({
          chunk: includeContent ? chunk : { ...chunk, content: '' },
          similarity,
          highlight: this.extractHighlight(chunk.content, queryText),
        });
      }
    }

    // Sort by similarity and limit
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Build comprehensive AI context from a query
   */
  async buildContext(query: string): Promise<AIContext> {
    // Query different types in parallel
    const [relevantCode, relevantDocs, relevantHistory, relevantIssues] = await Promise.all([
      this.query(query, { type: 'code', limit: 5 }),
      this.query(query, { type: 'documentation', limit: 3 }),
      this.query(query, { type: 'git-history', limit: 5 }),
      this.query(query, { type: 'issue', limit: 3 }),
    ]);

    // Get conventions if we have them
    const conventionChunks = await this.query(query, { type: 'convention', limit: 3 });
    const conventions = conventionChunks.map(c => c.chunk.content);

    // Get architecture info
    const architectureChunks = await this.query(query, { type: 'architecture', limit: 2 });
    const repoStructure = architectureChunks.map(c => c.chunk.content).join('\n\n');

    return {
      query,
      relevantCode,
      relevantDocs,
      relevantHistory,
      relevantIssues,
      repoStructure: repoStructure || undefined,
      conventions: conventions.length > 0 ? conventions : undefined,
    };
  }

  /**
   * Index code from a file
   */
  async indexCode(
    filePath: string,
    content: string,
    language: string
  ): Promise<number> {
    // Chunk the code semantically
    const chunks = chunkCode(content, filePath);
    
    if (chunks.length === 0) return 0;

    const items = chunks.map(chunk => ({
      content: chunk.content,
      type: 'code' as KnowledgeType,
      metadata: {
        path: filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        language,
        constructType: chunk.type,
        constructName: chunk.name,
      },
    }));

    await this.addBatch(items);
    return chunks.length;
  }

  /**
   * Index a commit message
   */
  async indexCommit(
    sha: string,
    message: string,
    author: string,
    timestamp: Date,
    changedFiles: string[]
  ): Promise<void> {
    await this.addKnowledge(
      `Commit ${sha.slice(0, 8)}: ${message}\n\nFiles changed: ${changedFiles.join(', ')}`,
      'git-history',
      {
        commitSha: sha,
        author,
        timestamp,
        tags: changedFiles.map(f => f.split('/').pop() || f),
      }
    );
  }

  /**
   * Index an issue
   */
  async indexIssue(
    issueNumber: number,
    title: string,
    body: string,
    state: string,
    labels: string[],
    author: string
  ): Promise<void> {
    await this.addKnowledge(
      `Issue #${issueNumber}: ${title}\n\n${body}\n\nState: ${state}`,
      'issue',
      {
        issueNumber,
        author,
        tags: labels,
      }
    );
  }

  /**
   * Index a PR
   */
  async indexPR(
    prNumber: number,
    title: string,
    body: string,
    state: string,
    author: string,
    reviewComments: string[]
  ): Promise<void> {
    const content = [
      `PR #${prNumber}: ${title}`,
      body,
      `State: ${state}`,
      reviewComments.length > 0 ? `\nReview Comments:\n${reviewComments.join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    await this.addKnowledge(content, 'git-history', {
      prNumber,
      author,
    });
  }

  /**
   * Index documentation
   */
  async indexDocumentation(
    filePath: string,
    content: string
  ): Promise<void> {
    // For markdown, split by headers
    const sections = this.splitMarkdownByHeaders(content);
    
    for (const section of sections) {
      await this.addKnowledge(section.content, 'documentation', {
        path: filePath,
        tags: [section.heading],
      });
    }
  }

  /**
   * Add architecture knowledge (inferred patterns)
   */
  async addArchitectureKnowledge(
    description: string,
    tags: string[]
  ): Promise<void> {
    await this.addKnowledge(description, 'architecture', { tags });
  }

  /**
   * Add convention knowledge
   */
  async addConvention(
    convention: string,
    examples: string[]
  ): Promise<void> {
    const content = `Convention: ${convention}\n\nExamples:\n${examples.map(e => `- ${e}`).join('\n')}`;
    await this.addKnowledge(content, 'convention', {
      tags: ['convention'],
    });
  }

  /**
   * Remove knowledge for a specific file
   */
  async removeForFile(filePath: string): Promise<number> {
    let removed = 0;
    
    for (const [id, chunk] of this.chunks) {
      if (chunk.metadata.path === filePath) {
        this.chunks.delete(id);
        this.embeddings.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all knowledge
   */
  async clear(): Promise<void> {
    this.chunks.clear();
    this.embeddings.clear();
  }

  /**
   * Get statistics about the knowledge base
   */
  getStats(): KnowledgeStats {
    const chunksByType: Record<KnowledgeType, number> = {
      'code': 0,
      'documentation': 0,
      'git-history': 0,
      'issue': 0,
      'architecture': 0,
      'convention': 0,
    };

    const paths = new Set<string>();

    for (const chunk of this.chunks.values()) {
      chunksByType[chunk.type]++;
      if (chunk.metadata.path) {
        paths.add(chunk.metadata.path);
      }
    }

    // Estimate size
    let sizeBytes = 0;
    for (const chunk of this.chunks.values()) {
      sizeBytes += chunk.content.length * 2; // UTF-16
    }
    for (const embedding of this.embeddings.values()) {
      sizeBytes += embedding.length * 8; // Float64
    }

    return {
      totalChunks: this.chunks.size,
      chunksByType,
      filesIndexed: paths.size,
      sizeBytes,
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Generate a unique ID for a knowledge chunk
   */
  private generateId(
    content: string,
    type: KnowledgeType,
    metadata: KnowledgeMetadata
  ): string {
    const data = JSON.stringify({
      repoId: this.repoId,
      type,
      path: metadata.path,
      startLine: metadata.startLine,
      content: content.slice(0, 100),
    });
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Extract a relevant highlight from content
   */
  private extractHighlight(content: string, query: string): string {
    // Simple extraction - find lines containing query words
    const queryWords = query.toLowerCase().split(/\s+/);
    const lines = content.split('\n');
    
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      if (queryWords.some(word => lineLower.includes(word))) {
        return line.trim().slice(0, 200);
      }
    }
    
    // Fallback to first non-empty line
    return lines.find(l => l.trim())?.slice(0, 200) || '';
  }

  /**
   * Split markdown content by headers
   */
  private splitMarkdownByHeaders(
    content: string
  ): Array<{ heading: string; content: string }> {
    const sections: Array<{ heading: string; content: string }> = [];
    const lines = content.split('\n');
    
    let currentHeading = 'Introduction';
    let currentContent: string[] = [];
    
    for (const line of lines) {
      const headerMatch = line.match(/^#+\s+(.+)/);
      
      if (headerMatch) {
        // Save previous section
        if (currentContent.length > 0) {
          sections.push({
            heading: currentHeading,
            content: currentContent.join('\n').trim(),
          });
        }
        
        currentHeading = headerMatch[1];
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    
    // Save last section
    if (currentContent.length > 0) {
      sections.push({
        heading: currentHeading,
        content: currentContent.join('\n').trim(),
      });
    }
    
    return sections.filter(s => s.content.length > 0);
  }
}

// Cache of knowledge bases by repo
const knowledgeBases = new Map<string, KnowledgeBase>();

/**
 * Get or create a knowledge base for a repository
 */
export function getKnowledgeBase(repoId: string): KnowledgeBase {
  let kb = knowledgeBases.get(repoId);
  
  if (!kb) {
    kb = new KnowledgeBase(repoId);
    knowledgeBases.set(repoId, kb);
  }
  
  return kb;
}

/**
 * Clear the knowledge base cache
 */
export function clearKnowledgeBaseCache(): void {
  knowledgeBases.clear();
}
