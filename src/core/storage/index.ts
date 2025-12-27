/**
 * Storage Module
 * 
 * Provides a unified interface for repository storage.
 * Supports pluggable backends (disk, database, S3).
 */

export * from './types';
export * from './config';
export { DiskStorage } from './disk';

import type { StorageBackend, StorageConfig } from './types';
import { DiskStorage } from './disk';
import { getStorageConfig } from './config';

// Singleton storage instance
let storageInstance: StorageBackend | null = null;

/**
 * Create a storage backend from configuration
 */
export function createStorage(config?: StorageConfig): StorageBackend {
  const cfg = config || getStorageConfig();

  switch (cfg.type) {
    case 'disk':
      if (!cfg.disk) {
        throw new Error('Disk storage requires disk configuration');
      }
      return new DiskStorage(cfg.disk);

    case 'database':
      // Future: implement DatabaseStorage
      throw new Error('Database storage not yet implemented. Use disk storage.');

    case 's3':
      // Future: implement S3Storage
      throw new Error('S3 storage not yet implemented. Use disk storage.');

    default:
      throw new Error(`Unknown storage type: ${cfg.type}`);
  }
}

/**
 * Get the global storage instance
 * Creates one if it doesn't exist
 */
export function getStorage(): StorageBackend {
  if (!storageInstance) {
    storageInstance = createStorage();
  }
  return storageInstance;
}

/**
 * Set the global storage instance
 * Useful for testing or custom configurations
 */
export function setStorage(storage: StorageBackend): void {
  storageInstance = storage;
}

/**
 * Clear the global storage instance
 */
export function clearStorage(): void {
  storageInstance = null;
}

/**
 * Initialize storage with specific configuration
 */
export function initStorage(config: StorageConfig): StorageBackend {
  storageInstance = createStorage(config);
  return storageInstance;
}
