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

// Knowledge primitive - Key-value store with history
export { Knowledge, type KnowledgeOptions, type HistoryEntry } from './knowledge';

// Re-export types for convenience
export * from './types';
