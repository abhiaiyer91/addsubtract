/**
 * Large file handling with chunking
 * Provides efficient storage for large binary files
 */

import * as path from 'path';
import { computeHash } from '../utils/hash';
import { compress, decompress } from '../utils/compression';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';

/**
 * Default chunk size: 1MB
 */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/**
 * Threshold for chunking: 2MB
 * Files larger than this will be chunked
 */
export const CHUNK_THRESHOLD = 2 * 1024 * 1024;

/**
 * Represents a chunked large file
 */
export interface ChunkedFile {
  type: 'chunked';
  originalSize: number;
  chunkSize: number;
  chunks: ChunkInfo[];
  hash: string; // Hash of the original content for verification
}

/**
 * Information about a single chunk
 */
export interface ChunkInfo {
  index: number;
  hash: string;
  size: number;
  offset: number;
}

/**
 * Handles large file storage with chunking and deduplication
 */
export class LargeFileHandler {
  private chunksDir: string;
  private manifestDir: string;
  private chunkSize: number;

  constructor(
    private gitDir: string,
    chunkSize: number = DEFAULT_CHUNK_SIZE
  ) {
    this.chunksDir = path.join(gitDir, 'chunks');
    this.manifestDir = path.join(gitDir, 'manifests');
    this.chunkSize = chunkSize;
  }

  /**
   * Initialize directories for large file storage
   */
  init(): void {
    mkdirp(this.chunksDir);
    mkdirp(this.manifestDir);
  }

  /**
   * Check if a file should be chunked based on size
   */
  shouldChunk(size: number): boolean {
    return size > CHUNK_THRESHOLD;
  }

  /**
   * Store a large file with chunking
   * Returns the manifest hash
   */
  storeFile(content: Buffer): string {
    const originalHash = computeHash(content);
    const chunks: ChunkInfo[] = [];

    let offset = 0;
    let index = 0;

    while (offset < content.length) {
      const end = Math.min(offset + this.chunkSize, content.length);
      const chunk = content.slice(offset, end);
      const chunkHash = this.storeChunk(chunk);

      chunks.push({
        index,
        hash: chunkHash,
        size: chunk.length,
        offset,
      });

      offset = end;
      index++;
    }

    const manifest: ChunkedFile = {
      type: 'chunked',
      originalSize: content.length,
      chunkSize: this.chunkSize,
      chunks,
      hash: originalHash,
    };

    return this.storeManifest(manifest);
  }

  /**
   * Store a single chunk
   */
  private storeChunk(chunk: Buffer): string {
    const hash = computeHash(chunk);
    const chunkPath = this.getChunkPath(hash);

    if (!exists(chunkPath)) {
      const compressed = compress(chunk);
      writeFile(chunkPath, compressed);
    }

    return hash;
  }

  /**
   * Store the manifest file
   */
  private storeManifest(manifest: ChunkedFile): string {
    const content = JSON.stringify(manifest, null, 2);
    const hash = computeHash(content);
    const manifestPath = this.getManifestPath(hash);

    if (!exists(manifestPath)) {
      writeFile(manifestPath, content);
    }

    return hash;
  }

  /**
   * Read a chunked file by manifest hash
   */
  readFile(manifestHash: string): Buffer {
    const manifest = this.readManifest(manifestHash);
    const buffers: Buffer[] = [];

    for (const chunkInfo of manifest.chunks) {
      const chunk = this.readChunk(chunkInfo.hash);
      buffers.push(chunk);
    }

    const content = Buffer.concat(buffers);

    // Verify integrity
    const actualHash = computeHash(content);
    if (actualHash !== manifest.hash) {
      throw new Error(`Integrity check failed for chunked file. Expected ${manifest.hash}, got ${actualHash}`);
    }

    return content;
  }

  /**
   * Read a single chunk
   */
  private readChunk(hash: string): Buffer {
    const chunkPath = this.getChunkPath(hash);

    if (!exists(chunkPath)) {
      throw new Error(`Chunk not found: ${hash}`);
    }

    const compressed = readFile(chunkPath);
    return decompress(compressed);
  }

  /**
   * Read a manifest file
   */
  private readManifest(hash: string): ChunkedFile {
    const manifestPath = this.getManifestPath(hash);

    if (!exists(manifestPath)) {
      throw new Error(`Manifest not found: ${hash}`);
    }

    const content = readFile(manifestPath).toString('utf8');
    return JSON.parse(content) as ChunkedFile;
  }

  /**
   * Check if a manifest exists
   */
  hasManifest(hash: string): boolean {
    return exists(this.getManifestPath(hash));
  }

  /**
   * Check if a chunk exists
   */
  hasChunk(hash: string): boolean {
    return exists(this.getChunkPath(hash));
  }

  /**
   * Get path for a chunk file
   */
  private getChunkPath(hash: string): string {
    const dir = hash.slice(0, 2);
    const file = hash.slice(2);
    return path.join(this.chunksDir, dir, file);
  }

  /**
   * Get path for a manifest file
   */
  private getManifestPath(hash: string): string {
    const dir = hash.slice(0, 2);
    const file = hash.slice(2);
    return path.join(this.manifestDir, dir, file);
  }

  /**
   * Get statistics about chunk storage
   */
  getStats(): { totalChunks: number; uniqueChunks: number; totalSize: number } {
    const totalChunks = 0;
    const totalSize = 0;

    // This is a simplified implementation
    // In a real implementation, we would scan the chunks directory
    return {
      totalChunks,
      uniqueChunks: totalChunks,
      totalSize,
    };
  }

  /**
   * Garbage collect unused chunks
   * Returns the number of chunks removed
   */
  gc(_usedHashes: Set<string>): number {
    // Implementation would scan chunks and remove unused ones
    // This is a placeholder for the full implementation
    return 0;
  }
}

/**
 * Check if content appears to be binary
 * Uses null byte detection in first 8KB
 */
export function isBinaryContent(content: Buffer): boolean {
  const checkLength = Math.min(content.length, 8000);
  for (let i = 0; i < checkLength; i++) {
    if (content[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
