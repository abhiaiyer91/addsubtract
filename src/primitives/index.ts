/**
 * Wit Primitives
 * 
 * High-level abstractions built on top of wit core for agent workspaces.
 * Building blocks for agent-centric applications backed by Git.
 */

// Filesystem primitive - Git-backed virtual filesystem
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
