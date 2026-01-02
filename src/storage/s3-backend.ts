/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * S3-Compatible Storage Backend
 * 
 * Stores Git objects in S3-compatible storage (AWS S3, Cloudflare R2, MinIO).
 * Objects are stored with content-addressable keys: <prefix>/<xx>/<rest-of-hash>
 * 
 * Note: AWS SDK packages (@aws-sdk/client-s3, @aws-sdk/s3-request-presigner) are optional dependencies.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  StorageClass,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { Readable } from 'stream';
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
  S3StorageConfig,
  S3Credentials,
} from './types';

const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

// =============================================================================
// S3 Storage Backend
// =============================================================================

export class S3StorageBackend implements StorageBackend {
  readonly type: StorageBackendType;
  readonly name: string;
  
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly config: S3StorageConfig;
  private readonly context: RepoStorageContext;

  constructor(
    context: RepoStorageContext, 
    credentials?: S3Credentials
  ) {
    this.context = context;
    this.config = context.config as S3StorageConfig;
    this.type = context.backendType as StorageBackendType;
    
    // Validate required config
    if (!this.config.bucket) {
      throw new Error('S3 storage requires a bucket name');
    }
    
    this.bucket = this.config.bucket;
    this.prefix = this.config.prefix || `repos/${context.owner}/${context.repo}`;
    this.name = `${this.type.toUpperCase()}: ${this.bucket}/${this.prefix}`;
    
    // Create S3 client
    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: this.config.region || process.env.AWS_REGION || 'us-east-1',
    };
    
    // Custom endpoint for R2, MinIO, etc.
    if (this.config.endpoint) {
      clientConfig.endpoint = this.config.endpoint;
    }
    
    // Force path-style for some S3-compatible services
    if (this.config.forcePathStyle) {
      clientConfig.forcePathStyle = true;
    }
    
    // Use provided credentials or fall back to environment
    if (credentials) {
      clientConfig.credentials = {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      };
    }
    
    this.client = new S3Client(clientConfig);
  }

  /**
   * Get the S3 key for an object by hash
   */
  private getObjectKey(hash: string): string {
    const prefix = hash.slice(0, 2);
    const suffix = hash.slice(2);
    return `${this.prefix}/objects/${prefix}/${suffix}`;
  }

  /**
   * Compute SHA-256 hash of content with Git header
   */
  private computeHash(type: GitObjectType, content: Buffer): string {
    const header = Buffer.from(`${type} ${content.length}\0`);
    const data = Buffer.concat([header, content]);
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Convert stream to buffer
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // ===========================================================================
  // StorageBackend Implementation
  // ===========================================================================

  async initialize(): Promise<void> {
    // S3 buckets don't need explicit directory creation
    // Just verify we can access the bucket
    await this.healthCheck();
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      // Try to list objects with limit 1 to verify access
      await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
        MaxKeys: 1,
      }));
      
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        details: {
          bucket: this.bucket,
          prefix: this.prefix,
          endpoint: this.config.endpoint,
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
    const { type, content, metadata = {} } = options;
    
    // Compute hash
    const hash = this.computeHash(type, content);
    
    // Check if already exists
    if (await this.hasObject(hash)) {
      return hash;
    }
    
    // Create header and compress
    const header = Buffer.from(`${type} ${content.length}\0`);
    const data = Buffer.concat([header, content]);
    const compressed = await deflate(data);
    
    // Upload to S3
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.getObjectKey(hash),
      Body: compressed,
      ContentType: 'application/x-git-object',
      ContentEncoding: 'deflate',
      Metadata: {
        'git-object-type': type,
        'git-object-size': String(content.length),
        ...metadata,
      },
      StorageClass: this.config.storageClass as StorageClass | undefined,
    }));
    
    return hash;
  }

  async readObject(hash: string): Promise<StoredObject> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.getObjectKey(hash),
      }));
      
      if (!response.Body) {
        throw new Error(`Object not found: ${hash}`);
      }
      
      const compressed = await this.streamToBuffer(response.Body as Readable);
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
      if ((error as any).name === 'NoSuchKey' || (error as any).Code === 'NoSuchKey') {
        throw new Error(`Object not found: ${hash}`);
      }
      throw error;
    }
  }

  async hasObject(hash: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.getObjectKey(hash),
      }));
      return true;
    } catch (error) {
      if ((error as any).name === 'NotFound' || (error as any).Code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  async getObjectMetadata(hash: string): Promise<ObjectMetadata | null> {
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.getObjectKey(hash),
      }));
      
      const type = (response.Metadata?.['git-object-type'] || 'blob') as GitObjectType;
      const size = parseInt(response.Metadata?.['git-object-size'] || '0', 10);
      
      return {
        hash,
        type,
        size,
        metadata: response.Metadata,
      };
    } catch (error) {
      if ((error as any).name === 'NotFound' || (error as any).Code === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(hash: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.getObjectKey(hash),
      }));
    } catch {
      // Ignore errors (object may not exist)
    }
  }

  async deleteObjects(hashes: string[]): Promise<void> {
    if (hashes.length === 0) return;
    
    // S3 allows max 1000 objects per delete request
    const batches: string[][] = [];
    for (let i = 0; i < hashes.length; i += 1000) {
      batches.push(hashes.slice(i, i + 1000));
    }
    
    for (const batch of batches) {
      await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: batch.map(hash => ({ Key: this.getObjectKey(hash) })),
        },
      }));
    }
  }

  async listObjects(options: ListOptions = {}): Promise<ListResult> {
    const { prefix = '', limit = 1000, cursor, includeMetadata = false } = options;
    
    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: `${this.prefix}/objects/${prefix}`,
      MaxKeys: limit,
      ContinuationToken: cursor,
    }));
    
    const objects: (string | ObjectMetadata)[] = [];
    
    for (const item of response.Contents || []) {
      if (!item.Key) continue;
      
      // Extract hash from key
      const keyParts = item.Key.split('/');
      const suffix = keyParts.pop() || '';
      const prefix2 = keyParts.pop() || '';
      const hash = prefix2 + suffix;
      
      if (hash.length !== 64) continue; // SHA-256 is 64 hex chars
      
      if (includeMetadata) {
        const meta = await this.getObjectMetadata(hash);
        if (meta) objects.push(meta);
      } else {
        objects.push(hash);
      }
    }
    
    return {
      objects,
      nextCursor: response.NextContinuationToken,
      hasMore: response.IsTruncated || false,
    };
  }

  async getStats(): Promise<StorageStats> {
    let objectCount = 0;
    let totalSizeBytes = 0;
    let continuationToken: string | undefined;
    
    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: `${this.prefix}/objects/`,
        ContinuationToken: continuationToken,
      }));
      
      for (const item of response.Contents || []) {
        objectCount++;
        totalSizeBytes += item.Size || 0;
      }
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    return {
      objectCount,
      totalSizeBytes,
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

  async getSignedUrl(hash: string, expiresInSeconds: number = 3600): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.getObjectKey(hash),
      });
      
      return await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch {
      return null;
    }
  }

  async streamObject(hash: string): Promise<NodeJS.ReadableStream> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.getObjectKey(hash),
    }));
    
    if (!response.Body) {
      throw new Error(`Object not found: ${hash}`);
    }
    
    return response.Body as Readable;
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createS3Backend(
  context: RepoStorageContext,
  credentials?: S3Credentials
): S3StorageBackend {
  return new S3StorageBackend(context, credentials);
}

/**
 * Create an R2-optimized backend (Cloudflare R2)
 */
export function createR2Backend(
  context: RepoStorageContext,
  accountId: string,
  credentials?: S3Credentials
): S3StorageBackend {
  // R2 uses S3-compatible API with Cloudflare-specific endpoint
  const config = context.config as S3StorageConfig;
  
  const r2Context: RepoStorageContext = {
    ...context,
    backendType: 'r2',
    config: {
      ...config,
      endpoint: config.endpoint || `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      region: 'auto', // R2 uses 'auto' region
    },
  };
  
  return new S3StorageBackend(r2Context, credentials);
}

/**
 * Create a MinIO-optimized backend
 */
export function createMinIOBackend(
  context: RepoStorageContext,
  endpoint: string,
  credentials?: S3Credentials
): S3StorageBackend {
  const config = context.config as S3StorageConfig;
  
  const minioContext: RepoStorageContext = {
    ...context,
    backendType: 'minio',
    config: {
      ...config,
      endpoint,
      forcePathStyle: true,
    },
  };
  
  return new S3StorageBackend(minioContext, credentials);
}
