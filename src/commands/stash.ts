/**
 * Stash Command
 * Save and restore working directory changes
 * 
 * Unlike Git's cryptic stash, wit provides clear stash management:
 * - wit stash              # Save changes with auto-message
 * - wit stash save "msg"   # Save with custom message
 * - wit stash list         # List all stashes
 * - wit stash pop          # Apply and remove latest stash
 * - wit stash apply [n]    # Apply stash without removing
 * - wit stash drop [n]     # Remove a stash
 * - wit stash clear        # Remove all stashes
 * - wit stash show [n]     # Show stash contents
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, readFile, writeFile, mkdirp, walkDir, stat } from '../utils/fs';
import { compress, decompress } from '../utils/compression';
import { computeHash } from '../utils/hash';
import { colors } from '../utils/colors';

/**
 * Represents a file in the stash
 */
export interface StashFile {
  path: string;
  content: string;  // Base64 encoded
  mode: string;
  isStaged: boolean;
}

/**
 * Represents a stash entry
 */
export interface StashEntry {
  id: string;
  index: number;
  message: string;
  branch: string;
  createdAt: number;
  files: StashFile[];
  stagedPaths: string[];
  baseCommit: string;
}

/**
 * Stash storage format
 */
interface StashStorage {
  version: 1;
  entries: StashEntry[];
}

/**
 * Stash Manager - handles all stash operations
 */
export class StashManager {
  private stashPath: string;
  private stashDir: string;

  constructor(private repo: Repository) {
    this.stashDir = path.join(repo.gitDir, 'stash');
    this.stashPath = path.join(this.stashDir, 'stash.json');
  }

  /**
   * Initialize stash directory
   */
  init(): void {
    mkdirp(this.stashDir);
  }

  /**
   * Load stash storage
   */
  private load(): StashStorage {
    if (!exists(this.stashPath)) {
      return { version: 1, entries: [] };
    }

    try {
      const compressed = readFile(this.stashPath);
      const content = decompress(compressed).toString('utf8');
      return JSON.parse(content) as StashStorage;
    } catch {
      return { version: 1, entries: [] };
    }
  }

  /**
   * Save stash storage
   */
  private save(storage: StashStorage): void {
    mkdirp(this.stashDir);
    const compressed = compress(Buffer.from(JSON.stringify(storage)));
    writeFile(this.stashPath, compressed);
  }

  /**
   * Save current changes to stash
   */
  stash(message?: string): StashEntry {
    const status = this.repo.status();
    const hasChanges = status.staged.length > 0 || 
                       status.modified.length > 0 || 
                       status.deleted.length > 0;

    if (!hasChanges) {
      throw new TsgitError(
        'No local changes to save',
        ErrorCode.NOTHING_TO_COMMIT,
        ['Your working directory is clean']
      );
    }

    const branch = this.repo.refs.getCurrentBranch() || 'detached HEAD';
    const headHash = this.repo.refs.resolve('HEAD') || '';
    const storage = this.load();

    // Collect files
    const files: StashFile[] = [];
    const excludeDirs = ['.wit/', 'node_modules/', '.git/'];
    const allFiles = walkDir(this.repo.workDir, excludeDirs);

    for (const filePath of allFiles) {
      const relativePath = path.relative(this.repo.workDir, filePath);
      
      // Only stash modified/staged files
      if (status.modified.includes(relativePath) || 
          status.staged.includes(relativePath) ||
          status.untracked.includes(relativePath)) {
        try {
          const content = readFile(filePath);
          const stats = stat(filePath);

          files.push({
            path: relativePath,
            content: content.toString('base64'),
            mode: (stats.mode & 0o777).toString(8).padStart(6, '0'),
            isStaged: status.staged.includes(relativePath),
          });
        } catch {
          // Skip files that can't be read
        }
      }
    }

    // Also track deleted files
    for (const deletedPath of status.deleted) {
      files.push({
        path: deletedPath,
        content: '',  // Empty for deleted
        mode: '000000',
        isStaged: false,
      });
    }

    // Generate stash message
    const autoMessage = message || this.generateMessage(status);

    // Create entry
    const entry: StashEntry = {
      id: computeHash(Buffer.from(Date.now().toString() + Math.random())).slice(0, 16),
      index: 0,
      message: autoMessage,
      branch,
      createdAt: Date.now(),
      files,
      stagedPaths: status.staged,
      baseCommit: headHash,
    };

    // Add to storage (most recent first)
    storage.entries.unshift(entry);

    // Re-index
    storage.entries.forEach((e, i) => e.index = i);

    this.save(storage);

    // Reset working directory
    this.resetWorkingDirectory(headHash);

    return entry;
  }

  /**
   * Generate auto message from status
   */
  private generateMessage(status: { staged: string[]; modified: string[]; deleted: string[] }): string {
    const parts: string[] = [];
    
    if (status.staged.length > 0) {
      parts.push(`${status.staged.length} staged`);
    }
    if (status.modified.length > 0) {
      parts.push(`${status.modified.length} modified`);
    }
    if (status.deleted.length > 0) {
      parts.push(`${status.deleted.length} deleted`);
    }

    return `WIP: ${parts.join(', ')}`;
  }

  /**
   * Reset working directory to match HEAD commit
   */
  private resetWorkingDirectory(commitHash: string): void {
    if (!commitHash) return;

    const commit = this.repo.objects.readCommit(commitHash);
    const treeFiles = new Map<string, string>();
    this.flattenTree(commit.treeHash, '', treeFiles);

    // Get current working files
    const excludeDirs = ['.wit/', 'node_modules/', '.git/'];
    const workFiles = walkDir(this.repo.workDir, excludeDirs);

    // Delete files not in tree
    for (const file of workFiles) {
      const relativePath = path.relative(this.repo.workDir, file);
      if (!treeFiles.has(relativePath)) {
        fs.unlinkSync(file);
      }
    }

    // Restore files from tree
    for (const [filePath, blobHash] of treeFiles) {
      const fullPath = path.join(this.repo.workDir, filePath);
      const blob = this.repo.objects.readBlob(blobHash);

      const dir = path.dirname(fullPath);
      if (!exists(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, blob.content);
    }

    // Clear and rebuild index
    this.repo.index.clear();
    for (const [filePath, blobHash] of treeFiles) {
      this.repo.index.add(filePath, blobHash, this.repo.workDir);
    }
    this.repo.index.save();
  }

  /**
   * Flatten tree to map
   */
  private flattenTree(treeHash: string, prefix: string, result: Map<string, string>): void {
    const tree = this.repo.objects.readTree(treeHash);

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
   * List all stashes
   */
  list(): StashEntry[] {
    return this.load().entries;
  }

  /**
   * Get a specific stash entry
   */
  get(index: number): StashEntry | null {
    const storage = this.load();
    return storage.entries.find(e => e.index === index) || null;
  }

  /**
   * Apply a stash without removing it
   */
  apply(index: number = 0): StashEntry {
    const entry = this.get(index);
    
    if (!entry) {
      throw new TsgitError(
        `stash@{${index}} does not exist`,
        ErrorCode.OPERATION_FAILED,
        ['wit stash list    # List available stashes']
      );
    }

    // Restore files
    for (const file of entry.files) {
      const fullPath = path.join(this.repo.workDir, file.path);

      if (file.content === '' && file.mode === '000000') {
        // Deleted file - remove it
        if (exists(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } else {
        // Restore file
        const content = Buffer.from(file.content, 'base64');
        const dir = path.dirname(fullPath);
        
        if (!exists(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(fullPath, content);

        // Re-stage if it was staged
        if (file.isStaged) {
          const hash = this.repo.objects.writeBlob(content);
          this.repo.index.add(file.path, hash, this.repo.workDir);
        }
      }
    }

    this.repo.index.save();
    return entry;
  }

  /**
   * Pop a stash (apply and remove)
   */
  pop(index: number = 0): StashEntry {
    const entry = this.apply(index);
    this.drop(index);
    return entry;
  }

  /**
   * Drop a stash
   */
  drop(index: number): void {
    const storage = this.load();
    const entryIndex = storage.entries.findIndex(e => e.index === index);

    if (entryIndex === -1) {
      throw new TsgitError(
        `stash@{${index}} does not exist`,
        ErrorCode.OPERATION_FAILED,
        ['wit stash list    # List available stashes']
      );
    }

    storage.entries.splice(entryIndex, 1);

    // Re-index
    storage.entries.forEach((e, i) => e.index = i);

    this.save(storage);
  }

  /**
   * Clear all stashes
   */
  clear(): number {
    const storage = this.load();
    const count = storage.entries.length;
    
    storage.entries = [];
    this.save(storage);

    return count;
  }

  /**
   * Show stash contents
   */
  show(index: number = 0): { entry: StashEntry; summary: string } {
    const entry = this.get(index);
    
    if (!entry) {
      throw new TsgitError(
        `stash@{${index}} does not exist`,
        ErrorCode.OPERATION_FAILED,
        ['wit stash list    # List available stashes']
      );
    }

    let summary = '';
    const staged = entry.files.filter(f => f.isStaged);
    const unstaged = entry.files.filter(f => !f.isStaged && f.content !== '');
    const deleted = entry.files.filter(f => f.content === '' && f.mode === '000000');

    if (staged.length > 0) {
      summary += 'Staged changes:\n';
      for (const file of staged) {
        summary += `  ${file.path}\n`;
      }
    }

    if (unstaged.length > 0) {
      summary += 'Modified files:\n';
      for (const file of unstaged) {
        summary += `  ${file.path}\n`;
      }
    }

    if (deleted.length > 0) {
      summary += 'Deleted files:\n';
      for (const file of deleted) {
        summary += `  ${file.path}\n`;
      }
    }

    return { entry, summary };
  }
}

/**
 * CLI handler for stash command
 */
export function handleStash(args: string[]): void {
  const repo = Repository.find();
  const stashManager = new StashManager(repo);
  stashManager.init();

  const subcommand = args[0] || 'save';

  try {
    switch (subcommand) {
      case 'save':
      case 'push': {
        // wit stash [save] [-m "message"] or wit stash "message"
        let message: string | undefined;
        
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '-m' && i + 1 < args.length) {
            message = args[i + 1];
            i++;
          } else if (!args[i].startsWith('-')) {
            message = args[i];
          }
        }

        const entry = stashManager.stash(message);
        console.log(colors.green('✓') + ' Saved working directory and index state');
        console.log(colors.dim(`  stash@{0}: On ${entry.branch}: ${entry.message}`));
        break;
      }

      case 'list': {
        const entries = stashManager.list();
        
        if (entries.length === 0) {
          console.log(colors.dim('No stashes saved'));
        } else {
          for (const entry of entries) {
            const date = new Date(entry.createdAt);
            const ago = formatTimeAgo(date);
            console.log(
              `${colors.yellow(`stash@{${entry.index}}`)} ` +
              `${colors.dim('on')} ${entry.branch}: ` +
              `${entry.message} ` +
              colors.dim(`(${ago})`)
            );
          }
        }
        break;
      }

      case 'show': {
        const index = args[1] ? parseInt(args[1], 10) : 0;
        const { entry, summary } = stashManager.show(index);
        
        console.log(colors.bold(`stash@{${entry.index}}: ${entry.message}`));
        console.log(colors.dim(`Branch: ${entry.branch}`));
        console.log(colors.dim(`Date: ${new Date(entry.createdAt).toLocaleString()}`));
        console.log();
        console.log(summary);
        break;
      }

      case 'apply': {
        const index = args[1] ? parseInt(args[1], 10) : 0;
        const entry = stashManager.apply(index);
        
        console.log(colors.green('✓') + ` Applied stash@{${index}}`);
        console.log(colors.dim(`  ${entry.message}`));
        console.log(colors.cyan('\nStash kept. Use "wit stash drop" to remove it.'));
        break;
      }

      case 'pop': {
        const index = args[1] ? parseInt(args[1], 10) : 0;
        const entry = stashManager.pop(index);
        
        console.log(colors.green('✓') + ` Applied and removed stash@{${index}}`);
        console.log(colors.dim(`  ${entry.message}`));
        break;
      }

      case 'drop': {
        const index = args[1] ? parseInt(args[1], 10) : 0;
        stashManager.drop(index);
        
        console.log(colors.green('✓') + ` Dropped stash@{${index}}`);
        break;
      }

      case 'clear': {
        const count = stashManager.clear();
        
        console.log(colors.green('✓') + ` Cleared ${count} stash(es)`);
        break;
      }

      default: {
        // If first arg doesn't look like a subcommand, treat it as save with message
        if (!['save', 'push', 'list', 'show', 'apply', 'pop', 'drop', 'clear'].includes(subcommand)) {
          const entry = stashManager.stash(subcommand);
          console.log(colors.green('✓') + ' Saved working directory and index state');
          console.log(colors.dim(`  stash@{0}: On ${entry.branch}: ${entry.message}`));
        } else {
          console.error(colors.red('error: ') + `Unknown stash subcommand: ${subcommand}`);
          console.error('\nUsage:');
          console.error('  wit stash [save] [-m "msg"]  Save changes to stash');
          console.error('  wit stash list               List all stashes');
          console.error('  wit stash show [n]           Show stash contents');
          console.error('  wit stash apply [n]          Apply stash');
          console.error('  wit stash pop [n]            Apply and remove stash');
          console.error('  wit stash drop [n]           Remove stash');
          console.error('  wit stash clear              Remove all stashes');
          process.exit(1);
        }
      }
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

/**
 * Format time ago
 */
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  
  return date.toLocaleDateString();
}
