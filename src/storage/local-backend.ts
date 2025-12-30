/**
 * Local Filesystem Storage Backend
 * 
 * Stores Git objects on the local filesystem in the standard Git format.
 * Objects are stored in .git/objects/<xx>/<rest-of-hash>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { createHash } from 'crypto';
import { promisify } from 'util';
import {
  StorageBackend,
  StorageBackendType,
  StoredObject,
  ObjectMetadata,
  WriteOptions,
  ListOptions,
  ListResult,
  StorageStats,
  CopyOptions,
  HealthCheckResult,
  GitObjectType,
  RepoStorageContext,
  LocalStorageConfig,
} from './types';

const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

// =============================================================================
// Local Storage Backend
// =============================================================================

export class LocalStorageBackend implements StorageBackend {
  readonly type: StorageBackendType = 'local';
  readonly name: string;
  
  private readonly objectsDir: string;
  private readonly config: LocalStorageConfig;
  private readonly context: RepoStorageContext;

  constructor(context: RepoStorageContext) {
    this.context = context;
    this.config = (context.config || {}) as LocalStorageConfig;
    
    // Determine base path
    const basePath = this.config.path || path.join(
      process.env.REPOS_DIR || './repos',
      context.owner,
      `${context.repo}.git`
    );
    
    this.objectsDir = path.join(basePath, 'objects');
    this.name = `Local: ${basePath}`;
  }

  /**
   * Get the path for an object by hash
   */
  private getObjectPath(hash: string): string {
    const prefix = hash.slice(0, 2);
    const suffix = hash.slice(2);
    return path.join(this.objectsDir, prefix, suffix);
  }

  /**
   * Compute SHA-256 hash of content with Git header
   */
  private computeHash(type: GitObjectType, content: Buffer): string {
    const header = Buffer.from(`${type} ${content.length}\0`);
    const data = Buffer.concat([header, content]);
    return createHash('sha256').update(data).digest('hex');
  }

  // ===========================================================================
  // StorageBackend Implementation
  // ===========================================================================

  async initialize(): Promise<void> {
    // Create objects directory structure
    await fs.promises.mkdir(this.objectsDir, { recursive: true });
    
    // Create pack and info directories
    await fs.promises.mkdir(path.join(this.objectsDir, 'pack'), { recursive: true });
    await fs.promises.mkdir(path.join(this.objectsDir, 'info'), { recursive: true });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      // Check if directory exists and is writable
      await fs.promises.access(this.objectsDir, fs.constants.W_OK);
      
      // Try to write and delete a test file
      const testFile = path.join(this.objectsDir, '.health-check');
      await fs.promises.writeFile(testFile, 'ok');
      await fs.promises.unlink(testFile);
      
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        details: {
          path: this.objectsDir,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: (error as Error).message,
      };
    }
  }

  async writeObject(options: WriteOptions): Promise<string> {
    const { type, content } = options;
    
    // Compute hash
    const hash = this.computeHash(type, content);
    const objectPath = this.getObjectPath(hash);
    
    // Check if already exists
    if (await this.hasObject(hash)) {
      return hash;
    }
    
    // Create header and compress
    const header = Buffer.from(`${type} ${content.length}\0`);
    const data = Buffer.concat([header, content]);
    const compressed = await deflate(data);
    
    // Write atomically (write to temp, then rename)
    const dir = path.dirname(objectPath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    const tempPath = `${objectPath}.tmp.${process.pid}`;
    await fs.promises.writeFile(tempPath, compressed);
    await fs.promises.rename(tempPath, objectPath);
    
    return hash;
  }

  async readObject(hash: string): Promise<StoredObject> {
    const objectPath = this.getObjectPath(hash);
    
    try {
      const compressed = await fs.promises.readFile(objectPath);
      const data = await inflate(compressed);
      
      // Parse header
      const nullIndex = data.indexOf(0);
      const header = data.slice(0, nullIndex).toString('utf8');
      const [type, sizeStr] = header.split(' ');
      const size = parseInt(sizeStr, 10);
      const content = data.slice(nullIndex + 1);
      
      return {
        hash,
        type: type as GitObjectType,
        content,
        size,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Object not found: ${hash}`);
      }
      throw error;
    }
  }

  async hasObject(hash: string): Promise<boolean> {
    const objectPath = this.getObjectPath(hash);
    try {
      await fs.promises.access(objectPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async getObjectMetadata(hash: string): Promise<ObjectMetadata | null> {
    try {
      const object = await this.readObject(hash);
      return {
        hash,
        type: object.type,
        size: object.size,
      };
    } catch {
      return null;
    }
  }

  async deleteObject(hash: string): Promise<void> {
    const objectPath = this.getObjectPath(hash);
    try {
      await fs.promises.unlink(objectPath);
      
      // Try to remove empty parent directory
      const dir = path.dirname(objectPath);
      const files = await fs.promises.readdir(dir);
      if (files.length === 0) {
        await fs.promises.rmdir(dir);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async deleteObjects(hashes: string[]): Promise<void> {
    await Promise.all(hashes.map(hash => this.deleteObject(hash)));
  }

  async listObjects(options: ListOptions = {}): Promise<ListResult> {
    const { prefix = '', limit = 1000, includeMetadata = false } = options;
    const objects: (string | ObjectMetadata)[] = [];
    
    try {
      const dirs = await fs.promises.readdir(this.objectsDir);
      
      for (const dir of dirs) {
        // Skip special directories
        if (dir === 'pack' || dir === 'info') continue;
        if (dir.length !== 2) continue;
        
        // Filter by prefix
        if (prefix && !dir.startsWith(prefix.slice(0, 2))) continue;
        
        const dirPath = path.join(this.objectsDir, dir);
        const stat = await fs.promises.stat(dirPath);
        if (!stat.isDirectory()) continue;
        
        const files = await fs.promises.readdir(dirPath);
        
        for (const file of files) {
          const hash = dir + file;
          
          if (prefix && !hash.startsWith(prefix)) continue;
          
          if (includeMetadata) {
            const meta = await this.getObjectMetadata(hash);
            if (meta) objects.push(meta);
          } else {
            objects.push(hash);
          }
          
          if (objects.length >= limit) {
            return { objects, hasMore: true };
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    
    return { objects, hasMore: false };
  }

  async getStats(): Promise<StorageStats> {
    let objectCount = 0;
    let totalSizeBytes = 0;
    const sizeByType: Record<GitObjectType, number> = {
      blob: 0,
      tree: 0,
      commit: 0,
      tag: 0,
    };
    const countByType: Record<GitObjectType, number> = {
      blob: 0,
      tree: 0,
      commit: 0,
      tag: 0,
    };
    
    try {
      const { objects } = await this.listObjects({ includeMetadata: true, limit: 100000 });
      
      for (const obj of objects) {
        if (typeof obj !== 'string') {
          objectCount++;
          totalSizeBytes += obj.size;
          sizeByType[obj.type] += obj.size;
          countByType[obj.type]++;
        }
      }
    } catch {
      // Ignore errors, return zero stats
    }
    
    return {
      objectCount,
      totalSizeBytes,
      sizeByType,
      countByType,
    };
  }

  async copyTo(options: CopyOptions): Promise<void> {
    const { hash, destination, deleteSource = false } = options;
    
    const object = await this.readObject(hash);
    await destination.writeObject({
      type: object.type,
      content: object.content,
    });
    
    if (deleteSource) {
      await this.deleteObject(hash);
    }
  }

  async getSignedUrl(): Promise<string | null> {
    // Local storage doesn't support signed URLs
    return null;
  }

  async streamObject(hash: string): Promise<NodeJS.ReadableStream> {
    const objectPath = this.getObjectPath(hash);
    
    // Create a transform stream that decompresses and strips the header
    const fileStream = fs.createReadStream(objectPath);
    const unzipStream = zlib.createInflate();
    
    return fileStream.pipe(unzipStream);
  }

  async close(): Promise<void> {
    // No connections to close for local storage
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createLocalBackend(context: RepoStorageContext): LocalStorageBackend {
  return new LocalStorageBackend(context);
}
