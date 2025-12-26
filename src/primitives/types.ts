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
 * Result of a merge operation
 */
export interface MergeResult {
  /** Whether the merge was successful */
  success: boolean;
  /** List of conflicting files if merge failed */
  conflicts?: string[];
}
