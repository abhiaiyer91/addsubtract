/**
 * Git object types
 */
export type ObjectType = 'blob' | 'tree' | 'commit' | 'tag';

/**
 * File modes in Git
 */
export enum FileMode {
  REGULAR = '100644',      // Regular file
  EXECUTABLE = '100755',   // Executable file
  SYMLINK = '120000',      // Symbolic link
  DIRECTORY = '40000',     // Directory (tree)
  SUBMODULE = '160000',    // Git submodule
}

/**
 * A tree entry represents a file or subdirectory in a tree
 */
export interface TreeEntry {
  mode: string;
  name: string;
  hash: string;
}

/**
 * Author/Committer information
 */
export interface Author {
  name: string;
  email: string;
  timestamp: number;
  timezone: string;
}

/**
 * Index entry for staging area
 */
export interface IndexEntry {
  mode: string;
  hash: string;
  stage: number;
  path: string;
  ctime: number;
  mtime: number;
  dev: number;
  ino: number;
  uid: number;
  gid: number;
  size: number;
}

/**
 * Reference types
 */
export interface Ref {
  name: string;
  hash: string;
  isSymbolic?: boolean;
  target?: string;
}
