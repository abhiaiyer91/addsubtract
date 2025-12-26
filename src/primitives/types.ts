/**
 * Shared types for filesystem primitives
 */

/**
 * Represents a file or directory entry
 */
export interface FileEntry {
  /** The name of the file or directory */
  name: string;
  /** The relative path from the workspace root */
  path: string;
  /** Whether this is a file or directory */
  type: 'file' | 'dir';
}

/**
 * Status of a file in the working directory
 */
export interface FileStatus {
  /** The relative path of the file */
  path: string;
  /** The status of the file */
  status: 'added' | 'modified' | 'deleted' | 'untracked';
}

/**
 * File statistics
 */
export interface FileStat {
  /** File size in bytes */
  size: number;
  /** Last modified date */
  modified: Date;
  /** Creation date */
  created: Date;
  /** Whether this is a file or directory */
  type: 'file' | 'dir';
}

/**
 * Commit information
 */
export interface CommitInfo {
  /** The commit hash */
  hash: string;
  /** The commit message */
  message: string;
  /** The author name and email */
  author: string;
  /** The commit date */
  date: Date;
}

/**
 * Result of a filesystem merge operation
 */
export interface FsMergeResult {
  /** Whether the merge was successful */
  success: boolean;
  /** List of conflicting files if merge failed */
  conflicts?: string[];
}

/**
 * Shared types for Knowledge primitive
 */

/**
 * Options for configuring a Knowledge instance
 */
export interface KnowledgeOptions {
  /** Auto-commit after each write operation (default: true) */
  autoCommit?: boolean;
}

/**
 * A history entry representing a past value of a key
 */
export interface HistoryEntry<T> {
  /** The commit hash when this value was stored */
  hash: string;
  /** The value at this point in history */
  value: T;
  /** When this value was committed */
  timestamp: Date;
  /** The commit message */
  message?: string;
}
