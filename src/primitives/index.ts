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
  type MergeResult,
} from './filesystem';

// Re-export types for convenience
export * from './types';
