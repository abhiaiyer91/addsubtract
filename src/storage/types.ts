/**
 * Storage Backend Types
 * 
 * Defines the interface for pluggable object storage backends.
 * Supports local filesystem, S3, R2, GCS, Azure, and MinIO.
 */

import type { 
  StorageConfig, 
  LocalStorageConfig, 
  S3StorageConfig, 
  GCSStorageConfig, 
  AzureStorageConfig 
} from '../db/schema';

// Re-export for convenience
export type { 
  StorageConfig, 
  LocalStorageConfig, 
  S3StorageConfig, 
  GCSStorageConfig, 
  AzureStorageConfig 
};

// =============================================================================
// Storage Backend Types
// =============================================================================

/**
 * Supported storage backend types
 */
export type StorageBackendType = 'local' | 's3' | 'r2' | 'gcs' | 'minio' | 'azure';

/**
 * Git object types
 */
export type GitObjectType = 'blob' | 'tree' | 'commit' | 'tag';

/**
 * Result of reading an object
 */
export interface StoredObject {
  /** The object's SHA hash */
  hash: string;
  /** Object type */
  type: GitObjectType;
  /** Object content */
  content: Buffer;
  /** Object size in bytes */
  size: number;
}

/**
 * Object metadata without content
 */
export interface ObjectMetadata {
  /** The object's SHA hash */
  hash: string;
  /** Object type */
  type: GitObjectType;
  /** Object size in bytes */
  size: number;
  /** Storage-specific metadata */
  metadata?: Record<string, string>;
}

/**
 * Options for writing objects
 */
export interface WriteOptions {
  /** Object type */
  type: GitObjectType;
  /** Content to write */
  content: Buffer;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

/**
 * Options for listing objects
 */
export interface ListOptions {
  /** Prefix to filter by */
  prefix?: string;
  /** Maximum number of objects to return */
  limit?: number;
  /** Continuation token for pagination */
  cursor?: string;
  /** Include object metadata */
  includeMetadata?: boolean;
}

/**
 * Result of listing objects
 */
export interface ListResult {
  /** Object hashes or metadata */
  objects: (string | ObjectMetadata)[];
  /** Continuation token for next page */
  nextCursor?: string;
  /** Whether there are more results */
  hasMore: boolean;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  /** Total number of objects */
  objectCount: number;
  /** Total size in bytes */
  totalSizeBytes: number;
  /** Size by object type */
  sizeByType?: Record<GitObjectType, number>;
  /** Count by object type */
  countByType?: Record<GitObjectType, number>;
}

/**
 * Options for copying between backends
 */
export interface CopyOptions {
  /** Source object hash */
  hash: string;
  /** Destination backend */
  destination: StorageBackend;
  /** Delete source after copy */
  deleteSource?: boolean;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Whether the backend is healthy */
  healthy: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Error message if unhealthy */
  error?: string;
  /** Backend-specific details */
  details?: Record<string, unknown>;
}

// =============================================================================
// Storage Backend Interface
// =============================================================================

/**
 * Storage Backend Interface
 * 
 * Abstracts object storage operations for Git objects.
 * Implementations handle the specifics of each storage provider.
 */
export interface StorageBackend {
  /** The backend type */
  readonly type: StorageBackendType;
  
  /** Human-readable name */
  readonly name: string;
  
  /**
   * Initialize the backend (create buckets, directories, etc.)
   */
  initialize(): Promise<void>;
  
  /**
   * Check if the backend is healthy and accessible
   */
  healthCheck(): Promise<HealthCheckResult>;
  
  /**
   * Write a Git object to storage
   * @returns The object's SHA hash
   */
  writeObject(options: WriteOptions): Promise<string>;
  
  /**
   * Read a Git object from storage
   * @throws NotFoundError if object doesn't exist
   */
  readObject(hash: string): Promise<StoredObject>;
  
  /**
   * Check if an object exists
   */
  hasObject(hash: string): Promise<boolean>;
  
  /**
   * Get object metadata without reading content
   */
  getObjectMetadata(hash: string): Promise<ObjectMetadata | null>;
  
  /**
   * Delete an object from storage
   */
  deleteObject(hash: string): Promise<void>;
  
  /**
   * Delete multiple objects (batch operation)
   */
  deleteObjects(hashes: string[]): Promise<void>;
  
  /**
   * List objects in storage
   */
  listObjects(options?: ListOptions): Promise<ListResult>;
  
  /**
   * Get storage statistics
   */
  getStats(): Promise<StorageStats>;
  
  /**
   * Copy an object to another backend
   */
  copyTo(options: CopyOptions): Promise<void>;
  
  /**
   * Get a signed URL for direct access (for cloud backends)
   * Returns null for local storage
   */
  getSignedUrl?(hash: string, expiresInSeconds?: number): Promise<string | null>;
  
  /**
   * Stream an object (for large files)
   */
  streamObject?(hash: string): Promise<NodeJS.ReadableStream>;
  
  /**
   * Close any open connections
   */
  close(): Promise<void>;
}

// =============================================================================
// Repository Storage Context
// =============================================================================

/**
 * Storage context for a specific repository
 */
export interface RepoStorageContext {
  /** Repository ID */
  repoId: string;
  /** Owner name */
  owner: string;
  /** Repository name */
  repo: string;
  /** Storage backend type */
  backendType: StorageBackendType;
  /** Storage configuration */
  config: StorageConfig;
}

/**
 * Factory function type for creating storage backends
 */
export type StorageBackendFactory = (
  context: RepoStorageContext
) => Promise<StorageBackend>;

// =============================================================================
// Storage Credentials
// =============================================================================

/**
 * Stored credentials reference
 * Actual credentials are stored securely (encrypted) in the database
 */
export interface StorageCredentials {
  id: string;
  name: string;
  backendType: StorageBackendType;
  createdAt: Date;
  lastUsedAt?: Date;
}

/**
 * AWS/S3 credentials
 */
export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * GCS credentials
 */
export interface GCSCredentials {
  clientEmail: string;
  privateKey: string;
  projectId: string;
}

/**
 * Azure credentials
 */
export interface AzureCredentials {
  accountName: string;
  accountKey?: string;
  connectionString?: string;
}

/**
 * Union type for all credential types
 */
export type CredentialData = S3Credentials | GCSCredentials | AzureCredentials;
