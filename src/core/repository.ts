import * as path from 'path';
import { ObjectStore } from './object-store';
import { Index, buildTreeFromIndex } from './index';
import { Refs } from './refs';
import { Tree, Commit, Blob } from './object';
import { Author, TreeEntry, IndexEntry } from './types';
import { exists, mkdirp, writeFile, readFile, walkDir, readFileText, loadIgnorePatterns, deleteFile, readDir, isDirectory } from '../utils/fs';
import { Journal } from './journal';
import { LargeFileHandler, CHUNK_THRESHOLD } from './large-file';
import { BranchStateManager } from './branch-state';
import { MergeManager } from './merge';
import { ScopeManager } from './scope';
import { PartialCloneManager, SparseCheckoutManager } from './partial-clone';
import { RemoteManager } from './remote';
import { setHashAlgorithm, getHashAlgorithm, HashAlgorithm } from '../utils/hash';
import { HookManager } from './hooks';
import { BranchProtectionEngine } from './branch-protection';
import { CollaboratorManager } from './collaborators';

/**
 * Repository configuration
 */
export interface RepositoryConfig {
  hashAlgorithm: HashAlgorithm;
  largeFileThreshold: number;
  autoStashOnSwitch: boolean;
}

const DEFAULT_CONFIG: RepositoryConfig = {
  // Default to SHA-1 for Git interoperability (GitHub, GitLab, etc.)
  hashAlgorithm: 'sha1',
  largeFileThreshold: CHUNK_THRESHOLD,
  autoStashOnSwitch: true,
};

/**
 * Main Repository class - the entry point for all Git operations
 * 
 * Improvements over Git:
 * - SHA-256 hashing by default (more secure)
 * - Large file chunking for better binary handling
 * - Operation journal for undo/history
 * - Branch state management (auto-stash)
 * - Monorepo scope support
 */
export class Repository {
  readonly gitDir: string;
  readonly workDir: string;
  readonly objects: ObjectStore;
  readonly index: Index;
  readonly refs: Refs;

  // New features
  readonly journal: Journal;
  readonly largeFiles: LargeFileHandler;
  readonly branchState: BranchStateManager;
  readonly mergeManager: MergeManager;
  readonly scopeManager: ScopeManager;
  readonly partialClone: PartialCloneManager;
  readonly sparseCheckout: SparseCheckoutManager;
  readonly hooks: HookManager;
  readonly remotes: RemoteManager;
  readonly branchProtection: BranchProtectionEngine;
  readonly collaborators: CollaboratorManager;

  private config: RepositoryConfig;

  constructor(workDir: string, config: Partial<RepositoryConfig> = {}, gitDirOverride?: string) {
    this.workDir = path.resolve(workDir);
    
    // Determine which git directory to use
    // Override is used when find() locates a specific directory
    // For new repos (init), we always use .wit
    if (gitDirOverride) {
      this.gitDir = gitDirOverride;
    } else {
      // Default to .wit - this is important for Repository.init()
      // find() handles the .wit vs .git detection separately
      this.gitDir = path.join(this.workDir, '.wit');
    }

    // Load config from existing repo if it exists
    const loadedConfig = this.loadStoredConfig();
    this.config = { ...DEFAULT_CONFIG, ...loadedConfig, ...config };

    // Set hash algorithm
    setHashAlgorithm(this.config.hashAlgorithm);

    // Core components
    this.objects = new ObjectStore(this.gitDir);
    this.index = new Index(this.gitDir);
    this.refs = new Refs(this.gitDir);

    // New feature components
    this.journal = new Journal(this.gitDir);
    this.largeFiles = new LargeFileHandler(this.gitDir);
    this.branchState = new BranchStateManager(this.gitDir, this.workDir);
    this.mergeManager = new MergeManager(this, this.gitDir);
    this.scopeManager = new ScopeManager(this.gitDir, this.workDir);
    this.partialClone = new PartialCloneManager(this.gitDir, this.objects);
    this.sparseCheckout = new SparseCheckoutManager(this.gitDir);
    this.hooks = new HookManager(this.gitDir, this.workDir);
    this.remotes = new RemoteManager(this.gitDir);
    this.branchProtection = new BranchProtectionEngine(this.gitDir);
    this.collaborators = new CollaboratorManager(this.gitDir);
  }

  /**
   * Load configuration from .wit/config file if it exists
   */
  private loadStoredConfig(): Partial<RepositoryConfig> {
    const configPath = path.join(this.gitDir, 'config');
    if (!exists(configPath)) {
      return {};
    }

    try {
      const configContent = readFileText(configPath);
      const config: Partial<RepositoryConfig> = {};

      // Parse simple INI-style config
      const hashMatch = configContent.match(/hashAlgorithm\s*=\s*(sha1|sha256)/);
      if (hashMatch) {
        config.hashAlgorithm = hashMatch[1] as HashAlgorithm;
      }

      const thresholdMatch = configContent.match(/largeFileThreshold\s*=\s*(\d+)/);
      if (thresholdMatch) {
        config.largeFileThreshold = parseInt(thresholdMatch[1], 10);
      }

      const autoStashMatch = configContent.match(/autoStashOnSwitch\s*=\s*(true|false)/);
      if (autoStashMatch) {
        config.autoStashOnSwitch = autoStashMatch[1] === 'true';
      }

      return config;
    } catch {
      return {};
    }
  }

  /**
   * Get repository configuration
   */
  getConfig(): RepositoryConfig {
    return { ...this.config };
  }

  /**
   * Get hash algorithm
   */
  getHashAlgorithm(): HashAlgorithm {
    return getHashAlgorithm();
  }

  /**
   * Check if this is a valid repository
   */
  isValid(): boolean {
    return exists(this.gitDir) && exists(path.join(this.gitDir, 'objects'));
  }

  /**
   * Initialize a new repository
   */
  static init(workDir: string, options: { hashAlgorithm?: HashAlgorithm } = {}): Repository {
    const repo = new Repository(workDir, options);

    if (repo.isValid()) {
      throw new Error(`Repository already exists at ${workDir}`);
    }

    // Create directory structure
    mkdirp(path.join(repo.gitDir, 'objects'));
    mkdirp(path.join(repo.gitDir, 'refs', 'heads'));
    mkdirp(path.join(repo.gitDir, 'refs', 'tags'));
    mkdirp(path.join(repo.gitDir, 'info'));

    // Create HEAD pointing to main branch
    writeFile(path.join(repo.gitDir, 'HEAD'), 'ref: refs/heads/main\n');

    // Create config file with wit improvements
    // Default to SHA-1 for Git interoperability
    const hashAlgo = options.hashAlgorithm || 'sha1';
    const config = `[core]
    repositoryformatversion = 1
    filemode = true
    bare = false
[wit]
    hashAlgorithm = ${hashAlgo}
    largeFileThreshold = ${CHUNK_THRESHOLD}
    autoStashOnSwitch = true
`;
    writeFile(path.join(repo.gitDir, 'config'), config);

    // Create description
    writeFile(
      path.join(repo.gitDir, 'description'),
      'Unnamed repository; edit this file to name the repository.\n'
    );

    // Initialize new feature directories
    repo.journal.init();
    repo.largeFiles.init();
    repo.branchState.init();
    repo.scopeManager.init();
    repo.hooks.init();
    repo.remotes.init();
    repo.branchProtection.getManager().init();
    repo.collaborators.init();

    console.log(`Initialized wit repository with ${hashAlgo} hashing`);

    return repo;
  }

  /**
   * Find a repository by walking up the directory tree
   * 
   * wit can work with both .wit and .git directories. However, for full
   * functionality with .git repos, wit init should be run to create a .wit
   * directory (which shares the same object format and can sync with .git).
   */
  static find(startPath: string = process.cwd()): Repository {
    let currentPath = path.resolve(startPath);
    let foundGitDir: string | null = null;

    while (true) {
      // Check for .wit first (native wit repo)
      const witDir = path.join(currentPath, '.wit');
      if (exists(witDir) && (exists(path.join(witDir, 'HEAD')) || exists(path.join(witDir, 'objects')))) {
        return new Repository(currentPath, {}, witDir);
      }
      
      // Note if we find a .git directory (we'll report this in error)
      const gitDir = path.join(currentPath, '.git');
      if (!foundGitDir && exists(gitDir) && (exists(path.join(gitDir, 'HEAD')) || exists(path.join(gitDir, 'objects')))) {
        foundGitDir = currentPath;
      }

      const parent = path.dirname(currentPath);
      if (parent === currentPath) {
        // No .wit found, but if we found .git, give helpful message
        if (foundGitDir) {
          throw new Error(
            `Found git repository at ${foundGitDir}, but no wit repository.\n` +
            `\nTo use wit with this git repo, run:\n` +
            `  cd ${foundGitDir}\n` +
            `  wit init\n` +
            `\nThis creates a .wit directory alongside .git for wit features.`
          );
        }
        throw new Error('Not a wit repository (or any parent up to root)');
      }
      currentPath = parent;
    }
  }
  
  /**
   * Check if a .git directory exists alongside this .wit directory
   */
  hasGitDirectory(): boolean {
    const gitDir = path.join(this.workDir, '.git');
    return exists(gitDir) && (exists(path.join(gitDir, 'HEAD')) || exists(path.join(gitDir, 'objects')));
  }

  /**
   * Add a file to the staging area
   */
  add(filePath: string): void {
    const relativePath = this.getRelativePath(filePath);
    const fullPath = path.join(this.workDir, relativePath);

    if (!exists(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFile(fullPath);
    const hash = this.objects.writeBlob(content);
    this.index.add(relativePath, hash, this.workDir);
    this.index.save();
  }

  /**
   * Add all files matching a pattern
   */
  addAll(): void {
    const ignorePatterns = loadIgnorePatterns(this.workDir);
    const files = walkDir(this.workDir, ignorePatterns);

    for (const file of files) {
      const relativePath = path.relative(this.workDir, file);
      const content = readFile(file);
      const hash = this.objects.writeBlob(content);
      this.index.add(relativePath, hash, this.workDir);
    }

    this.index.save();
  }

  /**
   * Create a commit from the current index
   */
  commit(message: string, author?: Author): string {
    if (this.index.size === 0) {
      throw new Error('Nothing to commit');
    }

    // Build tree from index
    const treeHash = this.writeTree();

    // Get author info
    const authorInfo = author || this.getDefaultAuthor();

    // Get parent commit(s)
    const parentHashes: string[] = [];
    const headHash = this.refs.resolve('HEAD');
    if (headHash) {
      // Verify the parent commit exists before using it
      try {
        this.objects.readCommit(headHash);
        parentHashes.push(headHash);
      } catch (error) {
        // Parent commit doesn't exist - this could happen if objects weren't properly stored
        console.warn(`Warning: HEAD points to ${headHash} but commit object not found. Creating orphan commit.`);
      }
    }

    // Create commit object
    const commit = new Commit(
      treeHash,
      parentHashes,
      authorInfo,
      authorInfo,
      message
    );

    const commitHash = this.objects.writeObject(commit);

    // Update branch reference
    const head = this.refs.getHead();
    if (head.isSymbolic) {
      this.refs.updateBranch(head.target.replace('refs/heads/', ''), commitHash);
    } else {
      this.refs.setHeadDetached(commitHash);
    }

    return commitHash;
  }

  /**
   * Write the index as a tree object (recursively)
   */
  private writeTree(): string {
    const entries = this.index.getEntries();
    const trees = buildTreeFromIndex(entries);

    // Build trees bottom-up
    const sortedPaths = Array.from(trees.keys()).sort((a, b) => b.length - a.length);
    const treeHashes = new Map<string, string>();

    for (const treePath of sortedPaths) {
      const treeEntries = trees.get(treePath)!;
      const finalEntries: TreeEntry[] = [];

      for (const [name, info] of treeEntries) {
        if (info.isTree) {
          const childPath = treePath ? treePath + '/' + name : name;
          const childHash = treeHashes.get(childPath)!;
          finalEntries.push({ mode: '40000', name, hash: childHash });
        } else {
          finalEntries.push({ mode: info.mode, name, hash: info.hash });
        }
      }

      const tree = new Tree(finalEntries);
      const hash = this.objects.writeObject(tree);
      treeHashes.set(treePath, hash);
    }

    return treeHashes.get('')!;
  }

  /**
   * Get the commit log starting from a ref
   */
  log(ref: string = 'HEAD', limit: number = 10): Commit[] {
    const commits: Commit[] = [];
    let currentHash = this.refs.resolve(ref);

    while (currentHash && commits.length < limit) {
      const commit = this.objects.readCommit(currentHash);
      commits.push(commit);

      if (commit.parentHashes.length > 0) {
        currentHash = commit.parentHashes[0];
      } else {
        break;
      }
    }

    return commits;
  }

  /**
   * Get repository status
   */
  status(): {
    staged: string[];
    modified: string[];
    untracked: string[];
    deleted: string[];
  } {
    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];
    const deleted: string[] = [];

    // Get HEAD tree
    const headTree = this.getHeadTree();

    // Compare index with HEAD
    const indexEntries = this.index.getEntriesMap();
    for (const [filePath, entry] of indexEntries) {
      const headBlob = headTree.get(filePath);
      if (!headBlob || headBlob !== entry.hash) {
        staged.push(filePath);
      }
    }

    // Check for deleted files in index compared to HEAD
    for (const [filePath] of headTree) {
      if (!indexEntries.has(filePath)) {
        staged.push(filePath + ' (deleted)');
      }
    }

    // Compare working directory with index
    const ignorePatterns = loadIgnorePatterns(this.workDir);
    const workFiles = walkDir(this.workDir, ignorePatterns);
    const workFilesSet = new Set<string>();

    for (const file of workFiles) {
      const relativePath = path.relative(this.workDir, file);
      workFilesSet.add(relativePath);

      if (indexEntries.has(relativePath)) {
        if (this.index.isModified(relativePath, this.workDir)) {
          modified.push(relativePath);
        }
      } else {
        untracked.push(relativePath);
      }
    }

    // Check for deleted files
    for (const [filePath] of indexEntries) {
      if (!workFilesSet.has(filePath)) {
        deleted.push(filePath);
      }
    }

    return { staged, modified, untracked, deleted };
  }

  /**
   * Get the tree from HEAD commit
   */
  private getHeadTree(): Map<string, string> {
    const result = new Map<string, string>();
    const headHash = this.refs.resolve('HEAD');

    if (!headHash) {
      return result;
    }

    const commit = this.objects.readCommit(headHash);
    this.flattenTree(commit.treeHash, '', result);

    return result;
  }

  /**
   * Flatten a tree into a map of path -> blob hash
   */
  private flattenTree(treeHash: string, prefix: string, result: Map<string, string>): void {
    const tree = this.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      const fullPath = prefix ? prefix + '/' + entry.name : entry.name;

      if (entry.mode === '40000') {
        this.flattenTree(entry.hash, fullPath, result);
      } else {
        result.set(fullPath, entry.hash);
      }
    }
  }

  /**
   * Checkout a branch or commit
   */
  checkout(ref: string, createBranch: boolean = false): void {
    if (createBranch) {
      const currentHash = this.refs.resolve('HEAD');
      if (!currentHash) {
        throw new Error('Cannot create branch: no commits yet');
      }
      this.refs.createBranch(ref, currentHash);
      this.refs.setHeadSymbolic(`refs/heads/${ref}`);
      return;
    }

    // Check if it's a branch
    if (this.refs.branchExists(ref)) {
      const hash = this.refs.resolve(ref)!;
      this.checkoutTree(hash);
      this.refs.setHeadSymbolic(`refs/heads/${ref}`);
      return;
    }

    // Check if it's a commit hash
    const hash = this.refs.resolve(ref);
    if (hash) {
      this.checkoutTree(hash);
      this.refs.setHeadDetached(hash);
      return;
    }

    throw new Error(`pathspec '${ref}' did not match any ref or commit`);
  }

  /**
   * Checkout a commit's tree to the working directory
   */
  private checkoutTree(commitHash: string): void {
    const commit = this.objects.readCommit(commitHash);
    
    // Get files in the new tree
    const newTreeFiles = new Map<string, string>();
    this.flattenTree(commit.treeHash, '', newTreeFiles);
    
    // Get currently tracked files (from old index) before clearing
    const oldTrackedFiles = new Set(this.index.getEntries().map(e => e.path));
    
    // Clear and rebuild index from tree
    this.index.clear();
    this.checkoutTreeRecursive(commit.treeHash, '');
    this.index.save();
    
    // Delete files that were tracked but aren't in the new tree
    for (const oldFile of oldTrackedFiles) {
      if (!newTreeFiles.has(oldFile)) {
        const fullPath = path.join(this.workDir, oldFile);
        deleteFile(fullPath);
      }
    }
    
    // Clean up empty directories
    this.cleanEmptyDirectories();
  }

  /**
   * Clean up empty directories in the working directory
   */
  private cleanEmptyDirectories(): void {
    const excludeDirs = ['.wit', 'node_modules', '.git', 'dist', 'build'];
    
    const cleanDir = (dir: string): boolean => {
      if (!exists(dir) || !isDirectory(dir)) return false;
      
      const entries = readDir(dir);
      let isEmpty = true;
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        
        // Skip excluded directories
        if (excludeDirs.includes(entry)) {
          isEmpty = false;
          continue;
        }
        
        if (isDirectory(fullPath)) {
          // Recursively clean subdirectories
          const subDirEmpty = cleanDir(fullPath);
          if (!subDirEmpty) {
            isEmpty = false;
          }
        } else {
          isEmpty = false;
        }
      }
      
      // Remove empty directory (but not the workDir itself)
      if (isEmpty && dir !== this.workDir) {
        try {
          require('fs').rmdirSync(dir);
          return true;
        } catch {
          return false;
        }
      }
      
      return isEmpty;
    };
    
    cleanDir(this.workDir);
  }

  /**
   * Recursively checkout tree entries
   */
  private checkoutTreeRecursive(treeHash: string, prefix: string): void {
    const tree = this.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      const relativePath = prefix ? prefix + '/' + entry.name : entry.name;
      const fullPath = path.join(this.workDir, relativePath);

      if (entry.mode === '40000') {
        mkdirp(fullPath);
        this.checkoutTreeRecursive(entry.hash, relativePath);
      } else {
        const blob = this.objects.readBlob(entry.hash);
        mkdirp(path.dirname(fullPath));
        writeFile(fullPath, blob.content);

        // Add to index
        this.index.add(relativePath, entry.hash, this.workDir);
      }
    }
  }

  /**
   * Create a new branch
   */
  createBranch(name: string): void {
    const currentHash = this.refs.resolve('HEAD');
    if (!currentHash) {
      throw new Error('Cannot create branch: no commits yet');
    }
    this.refs.createBranch(name, currentHash);
  }

  /**
   * Delete a branch
   */
  deleteBranch(name: string): void {
    this.refs.deleteBranch(name);
  }

  /**
   * List all branches
   */
  listBranches(): { name: string; isCurrent: boolean }[] {
    const branches = this.refs.listBranches();
    const current = this.refs.getCurrentBranch();

    return branches.map(name => ({
      name,
      isCurrent: name === current,
    }));
  }

  /**
   * Get relative path from work directory
   */
  private getRelativePath(filePath: string): string {
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    return path.relative(this.workDir, absolute);
  }

  /**
   * Get default author info from environment, GitHub auth, git config, or defaults
   */
  private getDefaultAuthor(): Author {
    // Try environment variables first
    let name = process.env.WIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME;
    let email = process.env.WIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL;

    // If not set, try GitHub credentials (from `wit github login`)
    if (!name || !email) {
      const githubInfo = this.readGitHubUserInfo();
      if (!name) name = githubInfo.name;
      if (!email) email = githubInfo.email;
    }

    // If not set, try reading from git config
    if (!name || !email) {
      const gitConfig = this.readGitConfig();
      if (!name) name = gitConfig.name;
      if (!email) email = gitConfig.email;
    }

    // Fall back to defaults
    if (!name) name = 'Anonymous';
    if (!email) email = 'anonymous@example.com';

    return {
      name,
      email,
      timestamp: Math.floor(Date.now() / 1000),
      timezone: this.getTimezone(),
    };
  }

  /**
   * Read user info from stored GitHub credentials
   */
  private readGitHubUserInfo(): { name?: string; email?: string } {
    try {
      const { loadGitHubCredentials } = require('./github');
      const creds = loadGitHubCredentials();
      if (creds) {
        return {
          name: creds.name,
          email: creds.email,
        };
      }
    } catch {
      // GitHub module not available or no credentials
    }
    return {};
  }

  /**
   * Read user info from git config (local repo config, then global)
   */
  private readGitConfig(): { name?: string; email?: string } {
    const result: { name?: string; email?: string } = {};

    // Try local .git/config first, then ~/.gitconfig
    const configPaths = [
      path.join(this.gitDir, 'config'),
      path.join(process.env.HOME || '', '.gitconfig'),
    ];

    for (const configPath of configPaths) {
      try {
        if (!exists(configPath)) continue;

        const content = readFileText(configPath);
        const lines = content.split('\n');
        let inUserSection = false;

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('[')) {
            inUserSection = trimmed.toLowerCase() === '[user]';
            continue;
          }

          if (inUserSection) {
            const nameMatch = trimmed.match(/^name\s*=\s*(.+)$/i);
            if (nameMatch && !result.name) {
              result.name = nameMatch[1].trim();
            }

            const emailMatch = trimmed.match(/^email\s*=\s*(.+)$/i);
            if (emailMatch && !result.email) {
              result.email = emailMatch[1].trim();
            }
          }
        }

        // Stop if we have both
        if (result.name && result.email) break;
      } catch {
        // Ignore errors reading config
      }
    }

    return result;
  }

  /**
   * Get current timezone offset string
   */
  private getTimezone(): string {
    const offset = new Date().getTimezoneOffset();
    const sign = offset <= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
    const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
    return `${sign}${hours}${minutes}`;
  }

  /**
   * Show contents of a file at a specific commit
   */
  show(ref: string, filePath: string): string {
    const hash = this.refs.resolve(ref);
    if (!hash) {
      throw new Error(`Unknown ref: ${ref}`);
    }

    const commit = this.objects.readCommit(hash);
    const tree = this.getHeadTree();
    const blobHash = tree.get(filePath);

    if (!blobHash) {
      throw new Error(`File not found: ${filePath}`);
    }

    const blob = this.objects.readBlob(blobHash);
    return blob.toString();
  }

  /**
   * Get file content at a specific ref
   */
  getFileAtRef(ref: string, filePath: string): Buffer | null {
    const hash = this.refs.resolve(ref);
    if (!hash) return null;

    const commit = this.objects.readCommit(hash);
    const blobHash = this.findBlobInTree(commit.treeHash, filePath.split('/'));

    if (!blobHash) return null;

    const blob = this.objects.readBlob(blobHash);
    return blob.content;
  }

  /**
   * Find a blob in a tree by path
   */
  private findBlobInTree(treeHash: string, pathParts: string[]): string | null {
    const tree = this.objects.readTree(treeHash);

    for (const entry of tree.entries) {
      if (entry.name === pathParts[0]) {
        if (pathParts.length === 1) {
          return entry.mode === '40000' ? null : entry.hash;
        }
        if (entry.mode === '40000') {
          return this.findBlobInTree(entry.hash, pathParts.slice(1));
        }
      }
    }

    return null;
  }
}
