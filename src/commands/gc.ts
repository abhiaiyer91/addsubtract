/**
 * Garbage Collection Command
 * 
 * Cleans up and optimizes the wit repository.
 * 
 * Commands:
 * - wit gc                       Run garbage collection
 * - wit gc --aggressive          More aggressive optimization
 * - wit gc --prune=now           Prune immediately (no grace period)
 * - wit gc --prune=<date>        Prune objects older than date
 * - wit gc --no-prune            Don't prune loose objects
 * - wit gc --quiet               Suppress output
 * - wit gc --auto                Only run if thresholds exceeded
 * 
 * Tasks performed:
 * 1. Remove unreachable objects
 * 2. Pack loose objects into packfiles (future enhancement)
 * 3. Remove stale refs
 * 4. Expire reflog entries
 * 5. Clean up temporary files
 * 6. Verify object integrity (optional)
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, readFile, writeFile, mkdirp, readFileText, readDir, isDirectory } from '../utils/fs';
import { ReflogManager } from './reflog';

/**
 * GC configuration
 */
export interface GCConfig {
  pruneDays: number;           // Prune objects older than N days (default: 14)
  reflogExpireDays: number;    // Expire reflog entries older than N days (default: 90)
  reflogExpireUnreachable: number;  // Expire unreachable reflog entries (default: 30)
  autoThreshold: number;       // Number of loose objects before auto gc (default: 6700)
  aggressiveWindow: number;    // Delta chain window for aggressive gc (default: 250)
  aggressiveDepth: number;     // Delta chain depth for aggressive gc (default: 250)
}

const DEFAULT_CONFIG: GCConfig = {
  pruneDays: 14,
  reflogExpireDays: 90,
  reflogExpireUnreachable: 30,
  autoThreshold: 6700,
  aggressiveWindow: 250,
  aggressiveDepth: 250,
};

/**
 * GC statistics
 */
export interface GCStats {
  looseObjectsFound: number;
  looseObjectsRemoved: number;
  staleBranchesRemoved: number;
  staleTagsRemoved: number;
  reflogEntriesExpired: number;
  tempFilesRemoved: number;
  corruptObjectsFound: number;
  bytesFreed: number;
  duration: number;
}

/**
 * Garbage Collector
 */
export class GarbageCollector {
  private objectsDir: string;
  private refsDir: string;
  private logsDir: string;

  constructor(private repo: Repository) {
    this.objectsDir = path.join(repo.gitDir, 'objects');
    this.refsDir = path.join(repo.gitDir, 'refs');
    this.logsDir = path.join(repo.gitDir, 'logs');
  }

  /**
   * Run garbage collection
   */
  async run(options: {
    aggressive?: boolean;
    prune?: string | boolean;      // 'now', date, or true for default
    noPrune?: boolean;
    quiet?: boolean;
    auto?: boolean;
    verify?: boolean;
    dryRun?: boolean;
    config?: Partial<GCConfig>;
  } = {}): Promise<GCStats> {
    const startTime = Date.now();
    const config = { ...DEFAULT_CONFIG, ...options.config };
    
    const stats: GCStats = {
      looseObjectsFound: 0,
      looseObjectsRemoved: 0,
      staleBranchesRemoved: 0,
      staleTagsRemoved: 0,
      reflogEntriesExpired: 0,
      tempFilesRemoved: 0,
      corruptObjectsFound: 0,
      bytesFreed: 0,
      duration: 0,
    };

    // Check if auto gc should run
    if (options.auto) {
      const looseCount = this.countLooseObjects();
      if (looseCount < config.autoThreshold) {
        if (!options.quiet) {
          console.log(`Auto gc: ${looseCount} loose objects, threshold is ${config.autoThreshold}`);
        }
        stats.duration = Date.now() - startTime;
        return stats;
      }
    }

    if (!options.quiet) {
      console.log('Running garbage collection...');
    }

    // Step 1: Find all reachable objects
    const reachableObjects = this.findReachableObjects();
    
    if (!options.quiet) {
      console.log(`Found ${reachableObjects.size} reachable objects`);
    }

    // Step 2: Find and optionally remove unreachable objects
    if (!options.noPrune) {
      const pruneResult = await this.pruneObjects(
        reachableObjects,
        options.prune,
        config,
        options.dryRun,
        options.quiet
      );
      stats.looseObjectsFound = pruneResult.found;
      stats.looseObjectsRemoved = pruneResult.removed;
      stats.bytesFreed += pruneResult.bytesFreed;
    }

    // Step 3: Verify objects if requested
    if (options.verify) {
      const corruptCount = this.verifyObjects(options.quiet);
      stats.corruptObjectsFound = corruptCount;
    }

    // Step 4: Clean up stale refs
    const staleResult = this.cleanStaleRefs(options.dryRun, options.quiet);
    stats.staleBranchesRemoved = staleResult.branches;
    stats.staleTagsRemoved = staleResult.tags;

    // Step 5: Expire reflog entries
    const reflogManager = new ReflogManager(this.repo.gitDir, this.repo.workDir);
    const reflogResult = reflogManager.expire({
      expire: config.reflogExpireDays,
      expireUnreachable: config.reflogExpireUnreachable,
      all: true,
      dryRun: options.dryRun,
    });
    stats.reflogEntriesExpired = reflogResult.reduce((sum, r) => sum + r.removed, 0);

    // Step 6: Clean up temporary files
    const tempResult = this.cleanTempFiles(options.dryRun, options.quiet);
    stats.tempFilesRemoved = tempResult.count;
    stats.bytesFreed += tempResult.bytes;

    // Step 7: Pack objects if aggressive
    if (options.aggressive) {
      // In a full implementation, we would pack loose objects
      // For now, we just report that we would do it
      if (!options.quiet) {
        console.log('Aggressive mode: would pack loose objects');
      }
    }

    stats.duration = Date.now() - startTime;
    return stats;
  }

  /**
   * Count loose objects
   */
  private countLooseObjects(): number {
    let count = 0;
    
    if (!exists(this.objectsDir)) {
      return 0;
    }

    const dirs = readDir(this.objectsDir);
    
    for (const dir of dirs) {
      // Object directories are 2-character hex
      if (dir.length !== 2 || !/^[0-9a-f]{2}$/.test(dir)) {
        continue;
      }

      const dirPath = path.join(this.objectsDir, dir);
      if (isDirectory(dirPath)) {
        count += readDir(dirPath).length;
      }
    }

    return count;
  }

  /**
   * Find all objects reachable from refs
   */
  private findReachableObjects(): Set<string> {
    const reachable = new Set<string>();
    
    // Get all refs
    const refs = this.getAllRefs();
    
    // Walk from each ref
    for (const ref of refs) {
      const hash = this.resolveRef(ref);
      if (hash) {
        this.walkCommit(hash, reachable);
      }
    }

    return reachable;
  }

  /**
   * Get all refs (branches, tags, HEAD)
   */
  private getAllRefs(): string[] {
    const refs: string[] = ['HEAD'];

    // Branches
    const headsDir = path.join(this.refsDir, 'heads');
    if (exists(headsDir)) {
      refs.push(...this.listRefsRecursive(headsDir, 'refs/heads'));
    }

    // Tags
    const tagsDir = path.join(this.refsDir, 'tags');
    if (exists(tagsDir)) {
      refs.push(...this.listRefsRecursive(tagsDir, 'refs/tags'));
    }

    return refs;
  }

  /**
   * Recursively list refs
   */
  private listRefsRecursive(dir: string, prefix: string): string[] {
    const refs: string[] = [];
    const entries = readDir(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const refName = `${prefix}/${entry}`;
      
      if (isDirectory(fullPath)) {
        refs.push(...this.listRefsRecursive(fullPath, refName));
      } else {
        refs.push(refName);
      }
    }

    return refs;
  }

  /**
   * Resolve a ref to a commit hash
   */
  private resolveRef(ref: string): string | null {
    try {
      return this.repo.refs.resolve(ref);
    } catch {
      return null;
    }
  }

  /**
   * Walk a commit and all its reachable objects
   */
  private walkCommit(hash: string, reachable: Set<string>): void {
    if (reachable.has(hash)) {
      return;
    }

    reachable.add(hash);

    try {
      const commit = this.repo.objects.readCommit(hash);
      
      // Walk tree
      this.walkTree(commit.treeHash, reachable);
      
      // Walk parents
      for (const parentHash of commit.parentHashes) {
        this.walkCommit(parentHash, reachable);
      }
    } catch {
      // Object might not exist or be corrupt
    }
  }

  /**
   * Walk a tree and all its reachable objects
   */
  private walkTree(hash: string, reachable: Set<string>): void {
    if (reachable.has(hash)) {
      return;
    }

    reachable.add(hash);

    try {
      const tree = this.repo.objects.readTree(hash);
      
      for (const entry of tree.entries) {
        if (entry.mode === '40000') {
          // Subtree
          this.walkTree(entry.hash, reachable);
        } else {
          // Blob
          reachable.add(entry.hash);
        }
      }
    } catch {
      // Object might not exist or be corrupt
    }
  }

  /**
   * Prune unreachable objects
   */
  private async pruneObjects(
    reachable: Set<string>,
    prune: string | boolean | undefined,
    config: GCConfig,
    dryRun?: boolean,
    quiet?: boolean
  ): Promise<{ found: number; removed: number; bytesFreed: number }> {
    const result = { found: 0, removed: 0, bytesFreed: 0 };
    
    // Determine prune time
    let pruneTime: number;
    if (prune === 'now') {
      pruneTime = Date.now();
    } else if (prune === true || prune === undefined) {
      pruneTime = Date.now() - config.pruneDays * 24 * 60 * 60 * 1000;
    } else if (typeof prune === 'string') {
      const parsed = Date.parse(prune);
      pruneTime = isNaN(parsed) ? Date.now() - config.pruneDays * 24 * 60 * 60 * 1000 : parsed;
    } else {
      pruneTime = Date.now() - config.pruneDays * 24 * 60 * 60 * 1000;
    }

    if (!exists(this.objectsDir)) {
      return result;
    }

    const dirs = readDir(this.objectsDir);
    
    for (const dir of dirs) {
      // Object directories are 2-character hex
      if (dir.length !== 2 || !/^[0-9a-f]{2}$/.test(dir)) {
        continue;
      }

      const dirPath = path.join(this.objectsDir, dir);
      if (!isDirectory(dirPath)) {
        continue;
      }

      const files = readDir(dirPath);
      
      for (const file of files) {
        result.found++;
        const hash = dir + file;
        
        // Skip if reachable
        if (reachable.has(hash)) {
          continue;
        }

        const filePath = path.join(dirPath, file);
        
        try {
          const stats = fs.statSync(filePath);
          
          // Check if old enough to prune
          if (stats.mtimeMs > pruneTime) {
            continue;
          }

          result.removed++;
          result.bytesFreed += stats.size;

          if (!dryRun) {
            fs.unlinkSync(filePath);
          }

          if (!quiet) {
            console.log(`  Pruned: ${hash.slice(0, 7)}`);
          }
        } catch {
          // Skip files we can't stat
        }
      }

      // Remove empty directories
      if (!dryRun) {
        try {
          const remaining = readDir(dirPath);
          if (remaining.length === 0) {
            fs.rmdirSync(dirPath);
          }
        } catch {
          // Ignore
        }
      }
    }

    return result;
  }

  /**
   * Verify object integrity
   */
  private verifyObjects(quiet?: boolean): number {
    let corruptCount = 0;
    
    if (!exists(this.objectsDir)) {
      return 0;
    }

    const dirs = readDir(this.objectsDir);
    
    for (const dir of dirs) {
      if (dir.length !== 2 || !/^[0-9a-f]{2}$/.test(dir)) {
        continue;
      }

      const dirPath = path.join(this.objectsDir, dir);
      if (!isDirectory(dirPath)) {
        continue;
      }

      const files = readDir(dirPath);
      
      for (const file of files) {
        const hash = dir + file;
        
        try {
          // Try to read the object
          this.repo.objects.readObject(hash);
        } catch (error) {
          corruptCount++;
          if (!quiet) {
            console.log(`  Corrupt: ${hash.slice(0, 7)}`);
          }
        }
      }
    }

    return corruptCount;
  }

  /**
   * Clean up stale refs
   */
  private cleanStaleRefs(dryRun?: boolean, quiet?: boolean): { branches: number; tags: number } {
    const result = { branches: 0, tags: 0 };
    
    // Check for stale branches that point to non-existent commits
    const headsDir = path.join(this.refsDir, 'heads');
    if (exists(headsDir)) {
      result.branches = this.cleanStaleRefsDir(headsDir, 'branch', dryRun, quiet);
    }

    // Check for stale tags
    const tagsDir = path.join(this.refsDir, 'tags');
    if (exists(tagsDir)) {
      result.tags = this.cleanStaleRefsDir(tagsDir, 'tag', dryRun, quiet);
    }

    return result;
  }

  /**
   * Clean stale refs in a directory
   */
  private cleanStaleRefsDir(dir: string, type: string, dryRun?: boolean, quiet?: boolean): number {
    let count = 0;
    const entries = readDir(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      
      if (isDirectory(fullPath)) {
        count += this.cleanStaleRefsDir(fullPath, type, dryRun, quiet);
        
        // Remove empty directories
        if (!dryRun) {
          try {
            const remaining = readDir(fullPath);
            if (remaining.length === 0) {
              fs.rmdirSync(fullPath);
            }
          } catch {
            // Ignore
          }
        }
      } else {
        const content = readFileText(fullPath).trim();
        
        // Check if the commit exists
        if (!this.repo.objects.hasObject(content)) {
          count++;
          if (!quiet) {
            console.log(`  Stale ${type}: ${entry} -> ${content.slice(0, 7)}`);
          }
          
          // Don't actually remove stale refs by default as this could be dangerous
          // if (!dryRun) {
          //   fs.unlinkSync(fullPath);
          // }
        }
      }
    }

    return count;
  }

  /**
   * Clean up temporary files
   */
  private cleanTempFiles(dryRun?: boolean, quiet?: boolean): { count: number; bytes: number } {
    const result = { count: 0, bytes: 0 };
    const gitDir = this.repo.gitDir;
    
    // Common temp file patterns
    const tempPatterns = [
      'MERGE_HEAD',
      'MERGE_MSG',
      'MERGE_MODE',
      'REBASE_HEAD',
      'REBASE_MERGE',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'BISECT_LOG',
      'BISECT_NAMES',
      'BISECT_EXPECTED_REV',
      'COMMIT_EDITMSG',
      'SQUASH_MSG',
      'FETCH_HEAD',
      'ORIG_HEAD',
    ];

    // Check for stale temp files
    for (const pattern of tempPatterns) {
      const filePath = path.join(gitDir, pattern);
      
      if (exists(filePath)) {
        try {
          const stats = fs.statSync(filePath);
          const age = Date.now() - stats.mtimeMs;
          
          // Only remove files older than 24 hours
          if (age > 24 * 60 * 60 * 1000) {
            result.count++;
            result.bytes += stats.size;
            
            if (!dryRun) {
              fs.unlinkSync(filePath);
            }
            
            if (!quiet) {
              console.log(`  Removed temp file: ${pattern}`);
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    // Clean up .lock files
    const lockFiles = this.findLockFiles(gitDir);
    for (const lockFile of lockFiles) {
      try {
        const stats = fs.statSync(lockFile);
        const age = Date.now() - stats.mtimeMs;
        
        // Only remove lock files older than 1 hour
        if (age > 60 * 60 * 1000) {
          result.count++;
          result.bytes += stats.size;
          
          if (!dryRun) {
            fs.unlinkSync(lockFile);
          }
          
          if (!quiet) {
            console.log(`  Removed stale lock: ${path.basename(lockFile)}`);
          }
        }
      } catch {
        // Ignore
      }
    }

    return result;
  }

  /**
   * Find .lock files
   */
  private findLockFiles(dir: string): string[] {
    const lockFiles: string[] = [];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          lockFiles.push(...this.findLockFiles(fullPath));
        } else if (entry.name.endsWith('.lock')) {
          lockFiles.push(fullPath);
        }
      }
    } catch {
      // Ignore unreadable directories
    }

    return lockFiles;
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
 * Format bytes
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * CLI handler for gc command
 */
export function handleGC(args: string[]): void {
  const repo = Repository.find();
  const gc = new GarbageCollector(repo);

  // Parse options
  const options: Parameters<typeof gc.run>[0] = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--aggressive') {
      options.aggressive = true;
    } else if (arg === '--prune') {
      options.prune = args[++i] || 'now';
    } else if (arg.startsWith('--prune=')) {
      options.prune = arg.slice('--prune='.length);
    } else if (arg === '--no-prune') {
      options.noPrune = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--auto') {
      options.auto = true;
    } else if (arg === '--verify') {
      options.verify = true;
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
    }
  }

  try {
    gc.run(options).then(stats => {
      if (options.quiet) {
        return;
      }

      console.log();
      console.log(colors.bold('Garbage collection results:'));
      console.log();
      
      if (stats.looseObjectsRemoved > 0) {
        console.log(`  ${colors.green('✓')} Removed ${stats.looseObjectsRemoved} unreachable objects`);
      } else if (stats.looseObjectsFound > 0) {
        console.log(`  ${colors.dim('•')} Found ${stats.looseObjectsFound} loose objects (all reachable)`);
      }

      if (stats.staleBranchesRemoved > 0) {
        console.log(`  ${colors.green('✓')} Found ${stats.staleBranchesRemoved} stale branches`);
      }

      if (stats.staleTagsRemoved > 0) {
        console.log(`  ${colors.green('✓')} Found ${stats.staleTagsRemoved} stale tags`);
      }

      if (stats.reflogEntriesExpired > 0) {
        console.log(`  ${colors.green('✓')} Expired ${stats.reflogEntriesExpired} reflog entries`);
      }

      if (stats.tempFilesRemoved > 0) {
        console.log(`  ${colors.green('✓')} Removed ${stats.tempFilesRemoved} temp files`);
      }

      if (stats.corruptObjectsFound > 0) {
        console.log(`  ${colors.red('!')} Found ${stats.corruptObjectsFound} corrupt objects`);
      }

      if (stats.bytesFreed > 0) {
        console.log(`  ${colors.cyan('•')} Freed ${formatBytes(stats.bytesFreed)}`);
      }

      console.log();
      console.log(colors.dim(`Completed in ${stats.duration}ms`));

      if (options.dryRun) {
        console.log(colors.yellow('\n(Dry run - no changes made)'));
      }
    }).catch(error => {
      if (error instanceof TsgitError) {
        console.error(error.format());
      } else if (error instanceof Error) {
        console.error(colors.red('error: ') + error.message);
      }
      process.exit(1);
    });
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
