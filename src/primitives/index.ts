/**
 * Wit Primitives
 * 
 * High-level abstractions built on top of wit core for agent workspaces.
 */

// Filesystem primitive - Git-backed virtual filesystem
export {
  Filesystem,
  type FileEntry,
  type FileStatus,
  type FileStat,
  type CommitInfo,
} from './filesystem';

// Export filesystem MergeResult with a different name to avoid conflict with core/merge
export { type MergeResult as FilesystemMergeResult } from './filesystem';

// Knowledge primitive - Git-backed key-value store
export { Knowledge, type KnowledgeOptions, type HistoryEntry } from './knowledge';
