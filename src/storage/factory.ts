/**
 * Storage Backend Factory
 * 
 * Creates the appropriate storage backend based on repository configuration.
 * Handles credential resolution, caching, and backend lifecycle.
 */

import { LRUCache } from 'lru-cache';
import {
  StorageBackend,
  StorageBackendType,
  RepoStorageContext,
  S3Credentials,
  StorageConfig,
  S3StorageConfig,
} from './types';
import { LocalStorageBackend, createLocalBackend } from './local-backend';
import { S3StorageBackend, createS3Backend, createR2Backend, createMinIOBackend } from './s3-backend';
import { getDb } from '../db';
import { repositories, storageCredentials } from '../db/schema';
import { eq } from 'drizzle-orm';

// =============================================================================
// Backend Cache
// =============================================================================

/**
 * LRU cache for storage backends
 * Backends are cached by repoId to avoid recreating connections
 */
const backendCache = new LRUCache<string, StorageBackend>({
  max: 100, // Cache up to 100 backends
  ttl: 1000 * 60 * 30, // 30 minutes
  dispose: async (backend) => {
    // Close backend when evicted
    try {
      await backend.close();
    } catch {
      // Ignore close errors
    }
  },
});

// =============================================================================
// Credential Resolution
// =============================================================================

/**
 * Resolve credentials for a storage backend
 * Credentials can come from:
 * 1. Environment variables (default)
 * 2. Stored credentials in database (referenced by credentialsId)
 */
async function resolveCredentials(
  backendType: StorageBackendType,
  config: StorageConfig
): Promise<S3Credentials | undefined> {
  // Check for credentialsId in config
  if ('credentialsId' in config && config.credentialsId) {
    return resolveStoredCredentials(config.credentialsId);
  }
  
  // Fall back to environment variables
  switch (backendType) {
    case 's3':
    case 'r2':
    case 'minio':
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        return {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken: process.env.AWS_SESSION_TOKEN,
        };
      }
      break;
  }
  
  return undefined;
}

/**
 * Resolve credentials stored in the database
 */
async function resolveStoredCredentials(credentialsId: string): Promise<S3Credentials | undefined> {
  try {
    const db = getDb();
    const [cred] = await db
      .select()
      .from(storageCredentials)
      .where(eq(storageCredentials.id, credentialsId))
      .limit(1);
    
    if (!cred) return undefined;
    
    // Decrypt credentials (assuming they're stored encrypted)
    // TODO: Implement proper encryption/decryption
    const decrypted = JSON.parse(cred.encryptedCredentials);
    
    return decrypted as S3Credentials;
  } catch {
    return undefined;
  }
}

// =============================================================================
// Storage Factory
// =============================================================================

/**
 * Options for getting a storage backend
 */
export interface GetStorageBackendOptions {
  /** Skip cache and create a fresh backend */
  skipCache?: boolean;
  /** Force a specific backend type (for migration) */
  forceType?: StorageBackendType;
}

/**
 * Get a storage backend for a repository
 * 
 * @param repoId - Repository UUID
 * @param options - Optional configuration
 * @returns Storage backend instance
 */
export async function getStorageBackend(
  repoId: string,
  options: GetStorageBackendOptions = {}
): Promise<StorageBackend> {
  const { skipCache = false, forceType } = options;
  
  // Check cache first
  if (!skipCache) {
    const cached = backendCache.get(repoId);
    if (cached) return cached;
  }
  
  // Load repository configuration from database
  const db = getDb();
  const [repo] = await db
    .select({
      id: repositories.id,
      ownerId: repositories.ownerId,
      name: repositories.name,
      diskPath: repositories.diskPath,
      storageBackend: repositories.storageBackend,
      storageConfig: repositories.storageConfig,
    })
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);
  
  if (!repo) {
    throw new Error(`Repository not found: ${repoId}`);
  }
  
  // Build context
  const context: RepoStorageContext = {
    repoId: repo.id,
    owner: repo.ownerId,
    repo: repo.name,
    backendType: forceType || repo.storageBackend,
    config: repo.storageConfig || {},
  };
  
  // Create backend
  const backend = await createBackend(context);
  
  // Cache it
  if (!skipCache) {
    backendCache.set(repoId, backend);
  }
  
  return backend;
}

/**
 * Get a storage backend by owner/repo name (for HTTP routes)
 */
export async function getStorageBackendByName(
  owner: string,
  repo: string,
  options: GetStorageBackendOptions = {}
): Promise<StorageBackend> {
  const cacheKey = `${owner}/${repo}`;
  
  // Check cache first
  if (!options.skipCache) {
    const cached = backendCache.get(cacheKey);
    if (cached) return cached;
  }
  
  // Try to load from database
  try {
    const db = getDb();
    const [repoRecord] = await db
      .select({
        id: repositories.id,
        ownerId: repositories.ownerId,
        name: repositories.name,
        diskPath: repositories.diskPath,
        storageBackend: repositories.storageBackend,
        storageConfig: repositories.storageConfig,
      })
      .from(repositories)
      .where(eq(repositories.ownerId, owner))
      .limit(1);
    
    if (repoRecord && repoRecord.name === repo) {
      return getStorageBackend(repoRecord.id, options);
    }
  } catch {
    // Database not available, fall back to local
  }
  
  // Fall back to local storage with default config
  const context: RepoStorageContext = {
    repoId: 'local',
    owner,
    repo,
    backendType: 'local',
    config: {},
  };
  
  const backend = await createBackend(context);
  
  if (!options.skipCache) {
    backendCache.set(cacheKey, backend);
  }
  
  return backend;
}

/**
 * Create a storage backend from context
 */
async function createBackend(context: RepoStorageContext): Promise<StorageBackend> {
  const { backendType, config } = context;
  
  // Resolve credentials if needed
  const credentials = await resolveCredentials(backendType, config);
  
  let backend: StorageBackend;
  
  switch (backendType) {
    case 'local':
      backend = createLocalBackend(context);
      break;
      
    case 's3':
      backend = createS3Backend(context, credentials);
      break;
      
    case 'r2': {
      const s3Config = config as S3StorageConfig;
      // Extract account ID from endpoint or use default
      const accountId = s3Config.endpoint?.match(/([a-f0-9]{32})/)?.[1] || 
                       process.env.CLOUDFLARE_ACCOUNT_ID || 
                       '';
      backend = createR2Backend(context, accountId, credentials);
      break;
    }
      
    case 'minio': {
      const s3Config = config as S3StorageConfig;
      const endpoint = s3Config.endpoint || process.env.MINIO_ENDPOINT || 'http://localhost:9000';
      backend = createMinIOBackend(context, endpoint, credentials);
      break;
    }
      
    case 'gcs':
    case 'azure':
      // TODO: Implement GCS and Azure backends
      throw new Error(`Storage backend not yet implemented: ${backendType}`);
      
    default:
      throw new Error(`Unknown storage backend: ${backendType}`);
  }
  
  // Initialize the backend
  await backend.initialize();
  
  return backend;
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Invalidate cached backend for a repository
 */
export function invalidateBackendCache(repoId: string): void {
  backendCache.delete(repoId);
}

/**
 * Clear all cached backends
 */
export async function clearBackendCache(): Promise<void> {
  // Close all backends before clearing
  for (const backend of backendCache.values()) {
    try {
      await backend.close();
    } catch {
      // Ignore errors
    }
  }
  backendCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: backendCache.size,
    maxSize: backendCache.max,
  };
}

// =============================================================================
// Migration Utilities
// =============================================================================

/**
 * Migrate a repository's objects from one backend to another
 */
export async function migrateStorage(
  repoId: string,
  targetType: StorageBackendType,
  targetConfig: StorageConfig,
  options: {
    deleteSource?: boolean;
    onProgress?: (copied: number, total: number) => void;
  } = {}
): Promise<{ copied: number; errors: string[] }> {
  const { deleteSource = false, onProgress } = options;
  
  // Get source backend
  const sourceBackend = await getStorageBackend(repoId);
  
  // Create target backend
  const db = getDb();
  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);
  
  if (!repo) {
    throw new Error(`Repository not found: ${repoId}`);
  }
  
  const targetContext: RepoStorageContext = {
    repoId,
    owner: repo.ownerId,
    repo: repo.name,
    backendType: targetType,
    config: targetConfig,
  };
  
  const targetBackend = await createBackend(targetContext);
  
  // List all objects
  const stats = await sourceBackend.getStats();
  const total = stats.objectCount;
  let copied = 0;
  const errors: string[] = [];
  
  // Copy objects in batches
  let cursor: string | undefined;
  let hasMore = true;
  
  while (hasMore) {
    const result = await sourceBackend.listObjects({
      limit: 100,
      cursor,
      includeMetadata: true,
    });
    
    for (const obj of result.objects) {
      const hash = typeof obj === 'string' ? obj : obj.hash;
      
      try {
        await sourceBackend.copyTo({
          hash,
          destination: targetBackend,
          deleteSource,
        });
        copied++;
        
        if (onProgress) {
          onProgress(copied, total);
        }
      } catch (error) {
        errors.push(`${hash}: ${(error as Error).message}`);
      }
    }
    
    cursor = result.nextCursor;
    hasMore = result.hasMore;
  }
  
  // Update repository configuration
  await db
    .update(repositories)
    .set({
      storageBackend: targetType,
      storageConfig: targetConfig,
      updatedAt: new Date(),
    })
    .where(eq(repositories.id, repoId));
  
  // Invalidate cache
  invalidateBackendCache(repoId);
  
  // Close target backend
  await targetBackend.close();
  
  return { copied, errors };
}

// =============================================================================
// Exports
// =============================================================================

export {
  StorageBackend,
  StorageBackendType,
  RepoStorageContext,
  LocalStorageBackend,
  S3StorageBackend,
};
