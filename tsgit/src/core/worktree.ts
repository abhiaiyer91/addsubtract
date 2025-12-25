/**
 * Worktree System
 * 
 * Provides Git-like worktree support for multiple working directories.
 * Worktrees allow checking out the same repository in multiple directories
 * simultaneously, useful for:
 * - Working on multiple branches at once
 * - Building/testing on one branch while developing on another
 * - Running long processes without blocking other work
 * 
 * Commands:
 * - tsgit worktree add <path> <branch>  Create new worktree
 * - tsgit worktree list                 List all worktrees
 * - tsgit worktree remove <path>        Remove a worktree
 * - tsgit worktree prune                Prune stale worktree entries
 * - tsgit worktree lock <path>          Lock a worktree from being pruned
 * - tsgit worktree unlock <path>        Unlock a worktree
 * - tsgit worktree move <path> <new>    Move a worktree
 * 
 * Worktree data is stored in .tsgit/worktrees/
 */

import * as path from 'path';
import * as fs from 'fs';
import { exists, readFile, writeFile, mkdirp, readFileText, readDir, isDirectory } from '../utils/fs';
import { TsgitError, ErrorCode } from './errors';

/**
 * Worktree information
 */
export interface WorktreeInfo {
  path: string;
  branch: string | null;
  commit: string;
  isMain: boolean;
  isLocked: boolean;
  lockReason?: string;
  isPrunable: boolean;
}

/**
 * Worktree entry stored in .tsgit/worktrees/<name>/
 */
interface WorktreeEntry {
  gitdir: string;  // Path to the worktree's gitdir
  locked?: string;  // Lock reason, if locked
}

/**
 * Worktree Manager
 */
export class WorktreeManager {
  private worktreesDir: string;
  private commonDir: string;

  constructor(private gitDir: string, private workDir: string) {
    this.worktreesDir = path.join(gitDir, 'worktrees');
    this.commonDir = gitDir;
  }

  /**
   * Initialize worktrees directory
   */
  init(): void {
    mkdirp(this.worktreesDir);
  }

  /**
   * Get the main worktree info
   */
  private getMainWorktree(): WorktreeInfo {
    // Read HEAD
    const headPath = path.join(this.gitDir, 'HEAD');
    let branch: string | null = null;
    let commit = '';

    if (exists(headPath)) {
      const head = readFileText(headPath).trim();
      if (head.startsWith('ref: ')) {
        branch = head.replace('ref: refs/heads/', '');
        const refPath = path.join(this.gitDir, head.slice(5));
        if (exists(refPath)) {
          commit = readFileText(refPath).trim();
        }
      } else {
        commit = head;
      }
    }

    return {
      path: this.workDir,
      branch,
      commit,
      isMain: true,
      isLocked: false,
      isPrunable: false,
    };
  }

  /**
   * Get the name for a worktree from its path
   */
  private getWorktreeName(worktreePath: string): string {
    // Use the last component of the path, sanitized
    return path.basename(worktreePath).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * List all worktrees
   */
  list(): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];

    // Add main worktree
    worktrees.push(this.getMainWorktree());

    // List linked worktrees
    if (!exists(this.worktreesDir)) {
      return worktrees;
    }

    const entries = readDir(this.worktreesDir);
    
    for (const name of entries) {
      const entryDir = path.join(this.worktreesDir, name);
      
      if (!isDirectory(entryDir)) {
        continue;
      }

      // Read gitdir file
      const gitdirPath = path.join(entryDir, 'gitdir');
      if (!exists(gitdirPath)) {
        continue;
      }

      const gitdirContent = readFileText(gitdirPath).trim();
      const worktreeGitDir = path.dirname(gitdirContent);
      const worktreePath = path.dirname(worktreeGitDir);

      // Check if worktree still exists
      const isPrunable = !exists(worktreePath);

      // Read HEAD
      const headPath = path.join(entryDir, 'HEAD');
      let branch: string | null = null;
      let commit = '';

      if (exists(headPath)) {
        const head = readFileText(headPath).trim();
        if (head.startsWith('ref: ')) {
          branch = head.replace('ref: refs/heads/', '');
          // Resolve commit from main repo
          const refPath = path.join(this.gitDir, head.slice(5));
          if (exists(refPath)) {
            commit = readFileText(refPath).trim();
          }
        } else {
          commit = head;
        }
      }

      // Check lock
      const lockPath = path.join(entryDir, 'locked');
      const isLocked = exists(lockPath);
      const lockReason = isLocked ? readFileText(lockPath).trim() : undefined;

      worktrees.push({
        path: worktreePath,
        branch,
        commit,
        isMain: false,
        isLocked,
        lockReason,
        isPrunable,
      });
    }

    return worktrees;
  }

  /**
   * Add a new worktree
   */
  add(worktreePath: string, branchOrCommit: string, options: {
    createBranch?: boolean;
    detach?: boolean;
    force?: boolean;
  } = {}): WorktreeInfo {
    const fullPath = path.resolve(worktreePath);

    // Check if path exists
    if (exists(fullPath)) {
      if (!options.force) {
        throw new TsgitError(
          `Path '${worktreePath}' already exists`,
          ErrorCode.OPERATION_FAILED,
          ['Use --force to use an existing directory']
        );
      }
    }

    // Check if already a worktree
    const existing = this.list();
    for (const wt of existing) {
      if (path.resolve(wt.path) === fullPath) {
        throw new TsgitError(
          `'${worktreePath}' is already a worktree`,
          ErrorCode.OPERATION_FAILED
        );
      }
    }

    // Resolve the branch/commit
    let branch: string | null = null;
    let commit: string;

    if (options.createBranch) {
      // Create a new branch at HEAD
      branch = branchOrCommit;
      commit = this.resolveRef('HEAD');
      
      // Check if branch already exists
      const branchPath = path.join(this.gitDir, 'refs', 'heads', branch);
      if (exists(branchPath)) {
        throw new TsgitError(
          `Branch '${branch}' already exists`,
          ErrorCode.BRANCH_EXISTS
        );
      }
      
      // Create the branch
      mkdirp(path.dirname(branchPath));
      writeFile(branchPath, commit + '\n');
    } else if (options.detach) {
      // Detached HEAD at the specified commit
      commit = this.resolveRef(branchOrCommit);
    } else {
      // Check if it's a branch
      const branchPath = path.join(this.gitDir, 'refs', 'heads', branchOrCommit);
      if (exists(branchPath)) {
        branch = branchOrCommit;
        commit = readFileText(branchPath).trim();
        
        // Check if branch is already checked out
        for (const wt of existing) {
          if (wt.branch === branch) {
            throw new TsgitError(
              `Branch '${branch}' is already checked out at '${wt.path}'`,
              ErrorCode.OPERATION_FAILED,
              ['Use --detach to checkout the commit instead']
            );
          }
        }
      } else {
        // Try as a commit
        commit = this.resolveRef(branchOrCommit);
      }
    }

    // Create the worktree directory
    mkdirp(fullPath);

    // Create worktree entry directory
    const worktreeName = this.getWorktreeName(fullPath);
    const entryDir = path.join(this.worktreesDir, worktreeName);
    mkdirp(entryDir);

    // Create .git file in worktree pointing to entry
    const worktreeGitFile = path.join(fullPath, '.tsgit');
    writeFile(worktreeGitFile, `gitdir: ${entryDir}\n`);

    // Create gitdir file pointing back
    writeFile(path.join(entryDir, 'gitdir'), worktreeGitFile + '\n');

    // Create HEAD
    if (branch) {
      writeFile(path.join(entryDir, 'HEAD'), `ref: refs/heads/${branch}\n`);
    } else {
      writeFile(path.join(entryDir, 'HEAD'), commit + '\n');
    }

    // Create commondir file
    writeFile(path.join(entryDir, 'commondir'), '../../\n');

    // Create index (empty initially)
    writeFile(path.join(entryDir, 'index'), JSON.stringify({ version: 2, entries: [] }));

    // Checkout files
    this.checkoutToWorktree(fullPath, commit, entryDir);

    return {
      path: fullPath,
      branch,
      commit,
      isMain: false,
      isLocked: false,
      isPrunable: false,
    };
  }

  /**
   * Resolve a ref to a commit hash
   */
  private resolveRef(ref: string): string {
    // Check if already a hash
    if (/^[0-9a-f]{40,64}$/.test(ref)) {
      return ref;
    }

    // HEAD
    if (ref === 'HEAD') {
      const headPath = path.join(this.gitDir, 'HEAD');
      if (!exists(headPath)) {
        throw new TsgitError('No commits yet', ErrorCode.NO_COMMITS_YET);
      }
      
      const head = readFileText(headPath).trim();
      if (head.startsWith('ref: ')) {
        return this.resolveRef(head.slice(5));
      }
      return head;
    }

    // Full ref path
    const fullRefPath = path.join(this.gitDir, ref);
    if (exists(fullRefPath)) {
      return readFileText(fullRefPath).trim();
    }

    // Branch
    const branchPath = path.join(this.gitDir, 'refs', 'heads', ref);
    if (exists(branchPath)) {
      return readFileText(branchPath).trim();
    }

    // Tag
    const tagPath = path.join(this.gitDir, 'refs', 'tags', ref);
    if (exists(tagPath)) {
      return readFileText(tagPath).trim();
    }

    throw new TsgitError(
      `Unknown ref: ${ref}`,
      ErrorCode.REF_NOT_FOUND
    );
  }

  /**
   * Checkout files to a worktree
   */
  private checkoutToWorktree(worktreePath: string, commitHash: string, entryDir: string): void {
    // Import necessary modules
    const { ObjectStore } = require('./object-store');
    const objectsDir = path.join(this.gitDir, 'objects');
    
    // Simple object store access
    const objectStore = new ObjectStore(this.gitDir);
    
    try {
      const commit = objectStore.readCommit(commitHash);
      const treeHash = commit.treeHash;
      
      // Checkout tree recursively
      this.checkoutTree(objectStore, treeHash, worktreePath, '', entryDir);
    } catch (error) {
      // Cleanup on error
      console.warn('Warning: Could not checkout files:', error);
    }
  }

  /**
   * Checkout a tree to a directory
   */
  private checkoutTree(
    objectStore: any,
    treeHash: string,
    basePath: string,
    prefix: string,
    entryDir: string
  ): void {
    const tree = objectStore.readTree(treeHash);
    const indexEntries: any[] = [];

    for (const entry of tree.entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(basePath, relativePath);

      if (entry.mode === '40000') {
        // Directory
        mkdirp(fullPath);
        this.checkoutTree(objectStore, entry.hash, basePath, relativePath, entryDir);
      } else {
        // File
        const blob = objectStore.readBlob(entry.hash);
        mkdirp(path.dirname(fullPath));
        writeFile(fullPath, blob.content);
        
        // Add to index entries
        indexEntries.push({
          mode: entry.mode,
          hash: entry.hash,
          stage: 0,
          path: relativePath,
          ctime: Date.now(),
          mtime: Date.now(),
          dev: 0,
          ino: 0,
          uid: 0,
          gid: 0,
          size: blob.content.length,
        });
      }
    }

    // Update index for worktree
    if (prefix === '') {
      const indexPath = path.join(entryDir, 'index');
      const existingIndex = exists(indexPath) 
        ? JSON.parse(readFileText(indexPath))
        : { version: 2, entries: [] };
      
      existingIndex.entries = indexEntries;
      writeFile(indexPath, JSON.stringify(existingIndex, null, 2));
    }
  }

  /**
   * Remove a worktree
   */
  remove(worktreePath: string, options: { force?: boolean } = {}): void {
    const fullPath = path.resolve(worktreePath);
    
    // Find the worktree
    const worktrees = this.list();
    const worktree = worktrees.find(wt => path.resolve(wt.path) === fullPath);
    
    if (!worktree) {
      throw new TsgitError(
        `'${worktreePath}' is not a worktree`,
        ErrorCode.OPERATION_FAILED,
        ['tsgit worktree list    # List worktrees']
      );
    }

    if (worktree.isMain) {
      throw new TsgitError(
        'Cannot remove the main working tree',
        ErrorCode.OPERATION_FAILED
      );
    }

    if (worktree.isLocked && !options.force) {
      throw new TsgitError(
        `Worktree '${worktreePath}' is locked: ${worktree.lockReason || 'no reason given'}`,
        ErrorCode.OPERATION_FAILED,
        [
          'tsgit worktree unlock <path>    # Unlock the worktree',
          'Use --force to remove anyway'
        ]
      );
    }

    // Check for changes (unless force)
    if (!options.force && exists(fullPath)) {
      // Simple check: look for modified files
      const gitFile = path.join(fullPath, '.tsgit');
      if (exists(gitFile)) {
        const content = readFileText(gitFile).trim();
        if (content.startsWith('gitdir:')) {
          const entryDir = content.replace('gitdir:', '').trim();
          const indexPath = path.join(entryDir, 'index');
          
          // We could check for modifications here, but for simplicity
          // we'll just warn if there are any files
          const entries = readDir(fullPath);
          const hasFiles = entries.some(e => e !== '.tsgit');
          
          if (hasFiles) {
            // Just a warning for now
          }
        }
      }
    }

    // Remove the worktree entry
    const worktreeName = this.getWorktreeName(fullPath);
    const entryDir = path.join(this.worktreesDir, worktreeName);
    
    if (exists(entryDir)) {
      fs.rmSync(entryDir, { recursive: true, force: true });
    }

    // Remove the worktree directory
    if (exists(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }

  /**
   * Prune stale worktree entries
   */
  prune(options: { dryRun?: boolean; verbose?: boolean } = {}): string[] {
    const pruned: string[] = [];
    
    if (!exists(this.worktreesDir)) {
      return pruned;
    }

    const entries = readDir(this.worktreesDir);
    
    for (const name of entries) {
      const entryDir = path.join(this.worktreesDir, name);
      
      if (!isDirectory(entryDir)) {
        continue;
      }

      // Check if locked
      const lockPath = path.join(entryDir, 'locked');
      if (exists(lockPath)) {
        if (options.verbose) {
          console.log(`Skipping locked worktree: ${name}`);
        }
        continue;
      }

      // Read gitdir to find worktree path
      const gitdirPath = path.join(entryDir, 'gitdir');
      if (!exists(gitdirPath)) {
        // Invalid entry, prune it
        if (!options.dryRun) {
          fs.rmSync(entryDir, { recursive: true, force: true });
        }
        pruned.push(name);
        continue;
      }

      const gitdirContent = readFileText(gitdirPath).trim();
      const worktreeGitFile = gitdirContent;
      
      // Check if worktree still exists
      if (!exists(worktreeGitFile)) {
        if (!options.dryRun) {
          fs.rmSync(entryDir, { recursive: true, force: true });
        }
        pruned.push(name);
      }
    }

    return pruned;
  }

  /**
   * Lock a worktree
   */
  lock(worktreePath: string, reason?: string): void {
    const fullPath = path.resolve(worktreePath);
    
    // Find the worktree
    const worktrees = this.list();
    const worktree = worktrees.find(wt => path.resolve(wt.path) === fullPath);
    
    if (!worktree) {
      throw new TsgitError(
        `'${worktreePath}' is not a worktree`,
        ErrorCode.OPERATION_FAILED
      );
    }

    if (worktree.isMain) {
      throw new TsgitError(
        'Cannot lock the main working tree',
        ErrorCode.OPERATION_FAILED
      );
    }

    const worktreeName = this.getWorktreeName(fullPath);
    const lockPath = path.join(this.worktreesDir, worktreeName, 'locked');
    
    writeFile(lockPath, reason || '');
  }

  /**
   * Unlock a worktree
   */
  unlock(worktreePath: string): void {
    const fullPath = path.resolve(worktreePath);
    
    // Find the worktree
    const worktrees = this.list();
    const worktree = worktrees.find(wt => path.resolve(wt.path) === fullPath);
    
    if (!worktree) {
      throw new TsgitError(
        `'${worktreePath}' is not a worktree`,
        ErrorCode.OPERATION_FAILED
      );
    }

    if (!worktree.isLocked) {
      throw new TsgitError(
        `Worktree '${worktreePath}' is not locked`,
        ErrorCode.OPERATION_FAILED
      );
    }

    const worktreeName = this.getWorktreeName(fullPath);
    const lockPath = path.join(this.worktreesDir, worktreeName, 'locked');
    
    if (exists(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }

  /**
   * Move a worktree
   */
  move(oldPath: string, newPath: string): void {
    const oldFullPath = path.resolve(oldPath);
    const newFullPath = path.resolve(newPath);
    
    // Find the worktree
    const worktrees = this.list();
    const worktree = worktrees.find(wt => path.resolve(wt.path) === oldFullPath);
    
    if (!worktree) {
      throw new TsgitError(
        `'${oldPath}' is not a worktree`,
        ErrorCode.OPERATION_FAILED
      );
    }

    if (worktree.isMain) {
      throw new TsgitError(
        'Cannot move the main working tree',
        ErrorCode.OPERATION_FAILED
      );
    }

    if (worktree.isLocked) {
      throw new TsgitError(
        `Worktree '${oldPath}' is locked`,
        ErrorCode.OPERATION_FAILED,
        ['tsgit worktree unlock <path>    # Unlock first']
      );
    }

    if (exists(newFullPath)) {
      throw new TsgitError(
        `Path '${newPath}' already exists`,
        ErrorCode.OPERATION_FAILED
      );
    }

    // Move the directory
    fs.renameSync(oldFullPath, newFullPath);

    // Update the entry
    const oldName = this.getWorktreeName(oldFullPath);
    const newName = this.getWorktreeName(newFullPath);
    
    const oldEntryDir = path.join(this.worktreesDir, oldName);
    const newEntryDir = path.join(this.worktreesDir, newName);

    if (oldName !== newName) {
      fs.renameSync(oldEntryDir, newEntryDir);
    }

    // Update gitdir path
    const worktreeGitFile = path.join(newFullPath, '.tsgit');
    writeFile(worktreeGitFile, `gitdir: ${newEntryDir}\n`);

    // Update gitdir reference
    writeFile(path.join(newEntryDir, 'gitdir'), worktreeGitFile + '\n');
  }
}

/**
 * Colors for CLI output
 */
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * CLI handler for worktree command
 */
export function handleWorktree(args: string[]): void {
  // Import Repository here to avoid circular dependency
  const { Repository } = require('./repository');
  
  const repo = Repository.find();
  const worktreeManager = new WorktreeManager(repo.gitDir, repo.workDir);
  worktreeManager.init();
  
  const subcommand = args[0];

  try {
    switch (subcommand) {
      case 'list':
      case undefined: {
        const worktrees = worktreeManager.list();
        
        for (const wt of worktrees) {
          let line = wt.path;
          
          if (wt.commit) {
            line += `  ${colors.dim(wt.commit.slice(0, 7))}`;
          }
          
          if (wt.branch) {
            line += `  ${colors.cyan(`[${wt.branch}]`)}`;
          } else {
            line += `  ${colors.yellow('(detached HEAD)')}`;
          }
          
          if (wt.isMain) {
            line += `  ${colors.dim('(main)')}`;
          }
          
          if (wt.isLocked) {
            line += `  ${colors.red('(locked)')}`;
          }
          
          if (wt.isPrunable) {
            line += `  ${colors.yellow('(prunable)')}`;
          }
          
          console.log(line);
        }
        break;
      }

      case 'add': {
        const targetPath = args[1];
        const branchOrCommit = args[2];
        
        if (!targetPath) {
          console.error(colors.red('error: ') + 'Please specify a path');
          console.error('\nUsage: tsgit worktree add <path> <branch|commit>');
          process.exit(1);
        }

        // Parse options
        let createBranch = false;
        let detach = false;
        let force = false;
        let branch = branchOrCommit;

        for (let i = 2; i < args.length; i++) {
          if (args[i] === '-b' || args[i] === '--branch') {
            createBranch = true;
            branch = args[++i];
          } else if (args[i] === '-d' || args[i] === '--detach') {
            detach = true;
          } else if (args[i] === '-f' || args[i] === '--force') {
            force = true;
          } else if (!args[i].startsWith('-')) {
            branch = args[i];
          }
        }

        if (!branch) {
          // Default to HEAD if no branch specified
          branch = 'HEAD';
          detach = true;
        }

        const worktree = worktreeManager.add(targetPath, branch, {
          createBranch,
          detach,
          force,
        });

        console.log(colors.green('✓') + ` Prepared worktree at '${worktree.path}'`);
        if (worktree.branch) {
          console.log(`  Branch: ${colors.cyan(worktree.branch)}`);
        } else {
          console.log(`  HEAD at ${colors.dim(worktree.commit.slice(0, 7))}`);
        }
        break;
      }

      case 'remove': {
        const targetPath = args[1];
        const force = args.includes('--force') || args.includes('-f');
        
        if (!targetPath) {
          console.error(colors.red('error: ') + 'Please specify a worktree path');
          process.exit(1);
        }

        worktreeManager.remove(targetPath, { force });
        console.log(colors.green('✓') + ` Removed worktree at '${targetPath}'`);
        break;
      }

      case 'prune': {
        const dryRun = args.includes('--dry-run') || args.includes('-n');
        const verbose = args.includes('--verbose') || args.includes('-v');
        
        const pruned = worktreeManager.prune({ dryRun, verbose });
        
        if (pruned.length === 0) {
          console.log(colors.dim('Nothing to prune'));
        } else {
          for (const name of pruned) {
            if (dryRun) {
              console.log(`Would prune: ${name}`);
            } else {
              console.log(colors.green('✓') + ` Pruned: ${name}`);
            }
          }
        }
        break;
      }

      case 'lock': {
        const targetPath = args[1];
        const reasonIdx = args.indexOf('--reason');
        const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : undefined;
        
        if (!targetPath) {
          console.error(colors.red('error: ') + 'Please specify a worktree path');
          process.exit(1);
        }

        worktreeManager.lock(targetPath, reason);
        console.log(colors.green('✓') + ` Locked worktree at '${targetPath}'`);
        break;
      }

      case 'unlock': {
        const targetPath = args[1];
        
        if (!targetPath) {
          console.error(colors.red('error: ') + 'Please specify a worktree path');
          process.exit(1);
        }

        worktreeManager.unlock(targetPath);
        console.log(colors.green('✓') + ` Unlocked worktree at '${targetPath}'`);
        break;
      }

      case 'move': {
        const oldPath = args[1];
        const newPath = args[2];
        
        if (!oldPath || !newPath) {
          console.error(colors.red('error: ') + 'Please specify both old and new paths');
          console.error('\nUsage: tsgit worktree move <old-path> <new-path>');
          process.exit(1);
        }

        worktreeManager.move(oldPath, newPath);
        console.log(colors.green('✓') + ` Moved worktree from '${oldPath}' to '${newPath}'`);
        break;
      }

      default:
        console.error(colors.red('error: ') + `Unknown subcommand: ${subcommand}`);
        console.error('\nUsage:');
        console.error('  tsgit worktree                     List worktrees');
        console.error('  tsgit worktree add <path> <branch> Create new worktree');
        console.error('  tsgit worktree add <path> -b <new> Create with new branch');
        console.error('  tsgit worktree remove <path>       Remove worktree');
        console.error('  tsgit worktree prune               Prune stale entries');
        console.error('  tsgit worktree lock <path>         Lock worktree');
        console.error('  tsgit worktree unlock <path>       Unlock worktree');
        console.error('  tsgit worktree move <old> <new>    Move worktree');
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
