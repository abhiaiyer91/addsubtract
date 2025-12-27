/**
 * Wit Primitives
 * 
 * High-level abstractions built on top of wit core for agent workspaces.
 * Building blocks for agent-centric applications backed by Git.
 */

// Filesystem primitive - Git-backed virtual filesystem (disk-based)
export {
  Filesystem,
  type FileEntry,
  type FileStatus,
  type FileStat,
  type CommitInfo,
  type FsMergeResult,
} from './filesystem';

// Export filesystem MergeResult with alternate name for backwards compatibility
export { type FsMergeResult as FilesystemMergeResult } from './filesystem';

// Knowledge primitive - Git-backed key-value store
export { Knowledge, type KnowledgeOptions, type HistoryEntry } from './knowledge';

// Virtual Filesystem - In-memory filesystem for IDE/agent use
export {
  VirtualFS,
  type VirtualFile,
  type VirtualDirectory,
} from './virtual-fs';

// Virtual Repository - Combines VirtualFS with ObjectStore for server-side repos
export {
  VirtualRepository,
  VirtualRepositoryManager,
  virtualRepoManager,
  createVirtualRepository,
  createVirtualRepositorySync,
  type VirtualRepositoryOptions,
  type VirtualSession,
} from './virtual-repository';

// Re-export storage module for convenience
export {
  getStorage,
  createStorage,
  initStorage,
  DiskStorage,
  loadConfig,
  saveConfig,
  getConfigPath,
  type StorageBackend,
  type StorageConfig,
  type WitConfig,
} from '../core/storage';
