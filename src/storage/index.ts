/**
 * Storage Module
 * 
 * Configurable object storage for Git repositories.
 * Supports local filesystem, S3, R2, MinIO, GCS, and Azure.
 */

// Types
export * from './types';

// Backends
export { LocalStorageBackend, createLocalBackend } from './local-backend';
export { S3StorageBackend, createS3Backend, createR2Backend, createMinIOBackend } from './s3-backend';

// Factory
export {
  getStorageBackend,
  getStorageBackendByName,
  invalidateBackendCache,
  clearBackendCache,
  getCacheStats,
  migrateStorage,
} from './factory';

// Object Store Adapter
export { StorageObjectStore, createStorageObjectStore } from './object-store-adapter';

// Storage-Aware Repository Manager
export {
  StorageAwareBareRepository,
  StorageAwareRepoManager,
  RepoInfo,
  StorageError,
} from './repo-manager';
