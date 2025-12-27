import * as path from 'path';
import * as crypto from 'crypto';
import { IndexEntry } from './types';
import { exists, readFile, writeFile, stat } from '../utils/fs';

/**
 * The Index (staging area) tracks files staged for the next commit
 * 
 * This is a simplified implementation. Real Git uses a binary format,
 * but we use a JSON format for simplicity and readability.
 */
export class Index {
  private entries: Map<string, IndexEntry> = new Map();
  private indexPath: string;

  constructor(gitDir: string) {
    this.indexPath = path.join(gitDir, 'index');
    this.load();
  }

  /**
   * Load index from disk
   */
  private load(): void {
    if (!exists(this.indexPath)) {
      return;
    }

    try {
      const data = readFile(this.indexPath);
      const json = JSON.parse(data.toString('utf8'));
      
      this.entries = new Map();
      for (const entry of json.entries) {
        this.entries.set(entry.path, entry);
      }
    } catch {
      // Start fresh if index is corrupted
      this.entries = new Map();
    }
  }

  /**
   * Save index to disk
   */
  save(): void {
    const entries = Array.from(this.entries.values()).sort((a, b) => 
      a.path.localeCompare(b.path)
    );
    
    const json = {
      version: 2,
      entries,
    };

    writeFile(this.indexPath, JSON.stringify(json, null, 2));
  }

  /**
   * Add a file to the index
   */
  add(filePath: string, hash: string, workDir: string): void {
    const fullPath = path.join(workDir, filePath);
    const stats = stat(fullPath);

    const entry: IndexEntry = {
      mode: stats.mode & 0o100 ? '100755' : '100644',
      hash,
      stage: 0,
      path: filePath,
      ctime: Math.floor(stats.ctimeMs),
      mtime: Math.floor(stats.mtimeMs),
      dev: stats.dev,
      ino: stats.ino,
      uid: stats.uid,
      gid: stats.gid,
      size: stats.size,
    };

    this.entries.set(filePath, entry);
  }

  /**
   * Remove a file from the index
   */
  remove(filePath: string): boolean {
    return this.entries.delete(filePath);
  }

  /**
   * Get an entry from the index
   */
  get(filePath: string): IndexEntry | undefined {
    return this.entries.get(filePath);
  }

  /**
   * Check if a file is in the index
   */
  has(filePath: string): boolean {
    return this.entries.has(filePath);
  }

  /**
   * Get all entries
   */
  getEntries(): IndexEntry[] {
    return Array.from(this.entries.values()).sort((a, b) =>
      a.path.localeCompare(b.path)
    );
  }

  /**
   * Get entries as a map (path -> hash)
   */
  getEntriesMap(): Map<string, IndexEntry> {
    return new Map(this.entries);
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get the number of entries
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Check if a file has been modified compared to index
   */
  isModified(filePath: string, workDir: string): boolean {
    const entry = this.entries.get(filePath);
    if (!entry) return true;

    const fullPath = path.join(workDir, filePath);
    if (!exists(fullPath)) return true;

    const stats = stat(fullPath);
    
    // Quick check using mtime and size
    if (stats.size !== entry.size) return true;
    if (Math.floor(stats.mtimeMs) !== entry.mtime) return true;

    return false;
  }
}

/**
 * Build a tree from index entries
 * Returns a nested structure suitable for creating tree objects
 */
export function buildTreeFromIndex(entries: IndexEntry[]): Map<string, Map<string, { mode: string; hash: string; isTree: boolean }>> {
  const trees = new Map<string, Map<string, { mode: string; hash: string; isTree: boolean }>>();
  
  // Initialize root tree
  trees.set('', new Map());

  for (const entry of entries) {
    const parts = entry.path.split('/');
    
    // Ensure parent directories exist
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = currentPath;
      currentPath = currentPath ? currentPath + '/' + parts[i] : parts[i];
      
      if (!trees.has(currentPath)) {
        trees.set(currentPath, new Map());
      }
      
      // Add reference to parent
      const parent = trees.get(parentPath)!;
      if (!parent.has(parts[i])) {
        parent.set(parts[i], { mode: '40000', hash: '', isTree: true });
      }
    }
    
    // Add file to its parent directory
    const parentPath = parts.slice(0, -1).join('/');
    const fileName = parts[parts.length - 1];
    const parent = trees.get(parentPath)!;
    parent.set(fileName, { mode: entry.mode, hash: entry.hash, isTree: false });
  }

  return trees;
}

// Re-export core modules
export * from './types';
export * from './errors';
export { Repository, RepositoryConfig } from './repository';
export { ObjectStore } from './object-store';
export { GitObject, Blob, Tree, Commit, Tag } from './object';
export { Refs } from './refs';
export { Journal } from './journal';
export { LargeFileHandler, CHUNK_THRESHOLD } from './large-file';
export { BranchStateManager } from './branch-state';
export { MergeManager } from './merge';
export { ScopeManager } from './scope';
export { PartialCloneManager, SparseCheckoutManager } from './partial-clone';
export { 
  FileDiff, 
  DiffLine, 
  DiffHunk, 
  RenameCandidate,
  RenameDetectionOptions,
  diff, 
  createHunks, 
  formatUnifiedDiff, 
  formatColoredDiff, 
  isBinary,
  calculateContentSimilarity,
  calculateFilenameSimilarity,
  detectRenames,
  processRenames,
} from './diff';
export {
  BranchProtectionRule,
  ProtectionResult,
  ProtectionViolation,
  ViolationType,
  BranchProtectionManager,
  BranchProtectionEngine,
  PROTECTION_PRESETS,
  formatRule,
  formatViolations,
  handleProtect,
} from './branch-protection';

// Remote infrastructure
export { Remote, RemoteManager } from './remote';
export {
  CredentialManager,
  CredentialSource,
  CredentialResult,
  createBasicCredentials,
  createBearerCredentials,
  createGitHubCredentials,
  createGitLabCredentials,
  getCredentialManager,
} from './auth';

// Collaborator management
export {
  CollaboratorManager,
  CollaboratorRole,
  Collaborator,
  CollaboratorPermissions,
  Team,
  Invitation,
  InvitationStatus,
  CollaboratorActivity,
  CollaboratorConfig,
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY,
} from './collaborators';

// Email service
export {
  EmailService,
  EmailConfig,
  EmailResult,
  createEmailService,
} from './email';

// Protocol exports
export * as protocol from './protocol';
