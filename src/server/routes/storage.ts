/**
 * Storage Configuration API Routes
 * 
 * REST endpoints for managing repository storage settings.
 */

import { Hono, Context } from 'hono';
import { getDb } from '../../db';
import { repositories, storageCredentials } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { 
  getStorageBackend, 
  migrateStorage, 
  invalidateBackendCache,
  StorageBackendType,
  StorageConfig,
  S3StorageConfig,
} from '../../storage';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Helper to get user ID from context
function getUserId(c: Context): string | undefined {
  const user = c.get('user') as { id: string } | undefined;
  return user?.id;
}

// Valid storage backends
const VALID_BACKENDS = ['local', 's3', 'r2', 'gcs', 'minio', 'azure'] as const;

// Type for update storage request
interface UpdateStorageRequest {
  backend: StorageBackendType;
  config: StorageConfig;
  migrate?: boolean;
  deleteSource?: boolean;
}

// Type for create credentials request
interface CreateCredentialsRequest {
  name: string;
  backendType: StorageBackendType;
  credentials: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    clientEmail?: string;
    privateKey?: string;
    projectId?: string;
    accountName?: string;
    accountKey?: string;
    connectionString?: string;
  };
  metadata?: {
    bucket?: string;
    region?: string;
    endpoint?: string;
    accountName?: string;
  };
}

// =============================================================================
// Encryption Helpers
// =============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  // Ensure key is 32 bytes for AES-256
  return Buffer.from(key.padEnd(32, '0').slice(0, 32));
}

function encryptCredentials(data: object): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine iv + authTag + encrypted
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

function decryptCredentials(encrypted: string): object {
  const key = getEncryptionKey();
  const combined = Buffer.from(encrypted, 'base64');
  
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  
  return JSON.parse(decrypted.toString('utf8'));
}

// =============================================================================
// Routes
// =============================================================================

export function createStorageRoutes(): Hono {
  const app = new Hono();

  // ---------------------------------------------------------------------------
  // Get repository storage configuration
  // ---------------------------------------------------------------------------
  app.get('/:owner/:repo/storage', requireAuth, async (c) => {
    const { owner, repo } = c.req.param();
    const userId = getUserId(c);
    
    const db = getDb();
    
    // Find repository
    const [repository] = await db
      .select()
      .from(repositories)
      .where(and(
        eq(repositories.ownerId, owner),
        eq(repositories.name, repo)
      ))
      .limit(1);
    
    if (!repository) {
      return c.json({ error: 'Repository not found' }, 404);
    }
    
    // Check access (must be owner or admin)
    if (repository.ownerId !== userId) {
      // TODO: Check collaborator access
      return c.json({ error: 'Forbidden' }, 403);
    }
    
    // Get storage backend and stats
    try {
      const backend = await getStorageBackend(repository.id);
      const stats = await backend.getStats();
      const health = await backend.healthCheck();
      
      return c.json({
        backend: repository.storageBackend,
        config: repository.storageConfig,
        stats: {
          objectCount: stats.objectCount,
          totalSizeBytes: stats.totalSizeBytes,
          sizeByType: stats.sizeByType,
        },
        health: {
          healthy: health.healthy,
          latencyMs: health.latencyMs,
          error: health.error,
        },
        storageSizeBytes: repository.storageSizeBytes,
        storageObjectCount: repository.storageObjectCount,
        storageLastSyncAt: repository.storageLastSyncAt,
      });
    } catch (error) {
      return c.json({
        backend: repository.storageBackend,
        config: repository.storageConfig,
        stats: null,
        health: {
          healthy: false,
          error: (error as Error).message,
        },
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Update repository storage configuration
  // ---------------------------------------------------------------------------
  app.put('/:owner/:repo/storage', requireAuth, async (c) => {
      const { owner, repo } = c.req.param();
      const userId = getUserId(c);
      
      let body: UpdateStorageRequest;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
      }
      
      // Validate backend
      if (!VALID_BACKENDS.includes(body.backend as any)) {
        return c.json({ error: `Invalid backend: ${body.backend}` }, 400);
      }
      
      const db = getDb();
      
      // Find repository
      const [repository] = await db
        .select()
        .from(repositories)
        .where(and(
          eq(repositories.ownerId, owner),
          eq(repositories.name, repo)
        ))
        .limit(1);
      
      if (!repository) {
        return c.json({ error: 'Repository not found' }, 404);
      }
      
      // Check access (must be owner or admin)
      if (repository.ownerId !== userId) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      
      // If migration requested, perform it
      if (body.migrate && repository.storageBackend !== body.backend) {
        try {
          const result = await migrateStorage(
            repository.id,
            body.backend as StorageBackendType,
            body.config as StorageConfig,
            { deleteSource: body.deleteSource }
          );
          
          return c.json({
            message: 'Storage migrated successfully',
            backend: body.backend,
            config: body.config,
            migration: {
              copied: result.copied,
              errors: result.errors.length,
              errorDetails: result.errors.slice(0, 10),
            },
          });
        } catch (error) {
          return c.json({
            error: 'Migration failed',
            details: (error as Error).message,
          }, 500);
        }
      }
      
      // Just update configuration (no migration)
      await db
        .update(repositories)
        .set({
          storageBackend: body.backend,
          storageConfig: body.config,
          updatedAt: new Date(),
        })
        .where(eq(repositories.id, repository.id));
      
      // Invalidate cache
      invalidateBackendCache(repository.id);
      
      return c.json({
        message: 'Storage configuration updated',
        backend: body.backend,
        config: body.config,
        warning: body.backend !== repository.storageBackend
          ? 'Backend changed without migration. Existing objects will not be accessible.'
          : undefined,
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Sync storage stats
  // ---------------------------------------------------------------------------
  app.post('/:owner/:repo/storage/sync', requireAuth, async (c) => {
    const { owner, repo } = c.req.param();
    const userId = getUserId(c);
    
    const db = getDb();
    
    // Find repository
    const [repository] = await db
      .select()
      .from(repositories)
      .where(and(
        eq(repositories.ownerId, owner),
        eq(repositories.name, repo)
      ))
      .limit(1);
    
    if (!repository) {
      return c.json({ error: 'Repository not found' }, 404);
    }
    
    if (repository.ownerId !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    
    try {
      const backend = await getStorageBackend(repository.id);
      const stats = await backend.getStats();
      
      await db
        .update(repositories)
        .set({
          storageSizeBytes: stats.totalSizeBytes,
          storageObjectCount: stats.objectCount,
          storageLastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(repositories.id, repository.id));
      
      return c.json({
        message: 'Storage stats synced',
        stats: {
          objectCount: stats.objectCount,
          totalSizeBytes: stats.totalSizeBytes,
        },
      });
    } catch (error) {
      return c.json({
        error: 'Failed to sync storage stats',
        details: (error as Error).message,
      }, 500);
    }
  });

  // ---------------------------------------------------------------------------
  // List storage credentials
  // ---------------------------------------------------------------------------
  app.get('/credentials', requireAuth, async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const db = getDb();
    
    const credentials = await db
      .select({
        id: storageCredentials.id,
        name: storageCredentials.name,
        backendType: storageCredentials.backendType,
        metadata: storageCredentials.metadata,
        lastUsedAt: storageCredentials.lastUsedAt,
        usageCount: storageCredentials.usageCount,
        createdAt: storageCredentials.createdAt,
      })
      .from(storageCredentials)
      .where(eq(storageCredentials.ownerId, userId));
    
    return c.json({ credentials });
  });

  // ---------------------------------------------------------------------------
  // Create storage credentials
  // ---------------------------------------------------------------------------
  app.post('/credentials', requireAuth, async (c) => {
      const userId = getUserId(c);
      if (!userId) return c.json({ error: 'Unauthorized' }, 401);
      
      let body: CreateCredentialsRequest;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
      }
      
      // Validate
      if (!body.name || body.name.length < 1) {
        return c.json({ error: 'Name is required' }, 400);
      }
      if (!VALID_BACKENDS.includes(body.backendType as any)) {
        return c.json({ error: `Invalid backend type: ${body.backendType}` }, 400);
      }
      
      // Encrypt credentials
      let encryptedCredentials: string;
      try {
        encryptedCredentials = encryptCredentials(body.credentials);
      } catch (error) {
        return c.json({
          error: 'Failed to encrypt credentials',
          details: (error as Error).message,
        }, 500);
      }
      
      const db = getDb();
      
      const [created] = await db
        .insert(storageCredentials)
        .values({
          ownerId: userId,
          ownerType: 'user',
          name: body.name,
          backendType: body.backendType,
          encryptedCredentials,
          metadata: body.metadata,
        })
        .returning({
          id: storageCredentials.id,
          name: storageCredentials.name,
          backendType: storageCredentials.backendType,
          metadata: storageCredentials.metadata,
          createdAt: storageCredentials.createdAt,
        });
      
      return c.json({
        message: 'Credentials created',
        credentials: created,
      }, 201);
    }
  );

  // ---------------------------------------------------------------------------
  // Delete storage credentials
  // ---------------------------------------------------------------------------
  app.delete('/credentials/:id', requireAuth, async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const credentialsId = c.req.param('id');
    
    const db = getDb();
    
    // Verify ownership
    const [existing] = await db
      .select()
      .from(storageCredentials)
      .where(and(
        eq(storageCredentials.id, credentialsId),
        eq(storageCredentials.ownerId, userId)
      ))
      .limit(1);
    
    if (!existing) {
      return c.json({ error: 'Credentials not found' }, 404);
    }
    
    await db
      .delete(storageCredentials)
      .where(eq(storageCredentials.id, credentialsId));
    
    return c.json({ message: 'Credentials deleted' });
  });

  // ---------------------------------------------------------------------------
  // Test storage connection
  // ---------------------------------------------------------------------------
  app.post('/test', requireAuth, async (c) => {
    let body: UpdateStorageRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    
    if (!VALID_BACKENDS.includes(body.backend as any)) {
      return c.json({ error: `Invalid backend: ${body.backend}` }, 400);
    }
    
    try {
      // Create a temporary context
      const context = {
        repoId: 'test',
        owner: 'test',
        repo: 'test',
        backendType: body.backend as StorageBackendType,
        config: body.config as StorageConfig,
      };
      
      // Try to create and initialize the backend
      // This will validate the configuration
      const { createS3Backend, createLocalBackend, createMinIOBackend, createR2Backend } = await import('../../storage');
      
      let backend;
      switch (body.backend) {
        case 'local':
          backend = createLocalBackend(context);
          break;
        case 's3':
          backend = createS3Backend(context);
          break;
        case 'r2':
          backend = createR2Backend(context, process.env.CLOUDFLARE_ACCOUNT_ID || '');
          break;
        case 'minio':
          const config = body.config as S3StorageConfig;
          backend = createMinIOBackend(context, config.endpoint || 'http://localhost:9000');
          break;
        default:
          return c.json({ error: `Backend not supported: ${body.backend}` }, 400);
      }
      
      await backend.initialize();
      const health = await backend.healthCheck();
      await backend.close();
      
      return c.json({
        success: health.healthy,
        latencyMs: health.latencyMs,
        error: health.error,
        details: health.details,
      });
    } catch (error) {
      return c.json({
        success: false,
        error: (error as Error).message,
      }, 400);
    }
  });

  return app;
}
