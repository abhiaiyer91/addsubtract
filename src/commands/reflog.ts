/**
 * Reflog Command
 * 
 * Traditional reflog alongside the existing journal system.
 * The reflog tracks all changes to refs (branches, HEAD) and provides
 * a way to recover from mistakes.
 * 
 * Commands:
 * - wit reflog                    Show HEAD reflog
 * - wit reflog <ref>              Show reflog for specific ref
 * - wit reflog show <ref>         Same as above
 * - wit reflog expire             Prune old entries
 * - wit reflog delete <entry>     Delete specific entry
 * - wit reflog exists <ref>       Check if reflog exists
 * 
 * Reflog entries are stored in .wit/logs/
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { TsgitError } from '../core/errors';
import { exists, readFile, writeFile, mkdirp, readFileText, readDir, isDirectory } from '../utils/fs';

/**
 * A single reflog entry
 */
export interface ReflogEntry {
  oldHash: string;
  newHash: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
    timezone: string;
  };
  message: string;
  lineNumber: number;
}

/**
 * Parsed reflog format:
 * <old-hash> <new-hash> <author-name> <<email>> <timestamp> <timezone>\t<message>
 */
function parseReflogLine(line: string, lineNumber: number): ReflogEntry | null {
  if (!line.trim()) {
    return null;
  }

  // Match the reflog line format
  const match = line.match(
    /^([0-9a-f]+)\s+([0-9a-f]+)\s+(.+?)\s+<([^>]+)>\s+(\d+)\s+([+-]\d{4})\t(.*)$/
  );

  if (!match) {
    // Try simpler format without tab
    const simpleMatch = line.match(
      /^([0-9a-f]+)\s+([0-9a-f]+)\s+(.+?)\s+<([^>]+)>\s+(\d+)\s+([+-]\d{4})\s+(.*)$/
    );
    
    if (!simpleMatch) {
      return null;
    }

    return {
      oldHash: simpleMatch[1],
      newHash: simpleMatch[2],
      author: {
        name: simpleMatch[3],
        email: simpleMatch[4],
        timestamp: parseInt(simpleMatch[5], 10),
        timezone: simpleMatch[6],
      },
      message: simpleMatch[7],
      lineNumber,
    };
  }

  return {
    oldHash: match[1],
    newHash: match[2],
    author: {
      name: match[3],
      email: match[4],
      timestamp: parseInt(match[5], 10),
      timezone: match[6],
    },
    message: match[7],
    lineNumber,
  };
}

/**
 * Format a reflog entry for writing
 */
function formatReflogEntry(entry: Omit<ReflogEntry, 'lineNumber'>): string {
  return `${entry.oldHash} ${entry.newHash} ${entry.author.name} <${entry.author.email}> ${entry.author.timestamp} ${entry.author.timezone}\t${entry.message}`;
}

/**
 * Reflog Manager
 */
export class ReflogManager {
  private logsDir: string;
  private headsLogsDir: string;

  constructor(private gitDir: string, private workDir: string) {
    this.logsDir = path.join(gitDir, 'logs');
    this.headsLogsDir = path.join(this.logsDir, 'refs', 'heads');
  }

  /**
   * Initialize reflog directories
   */
  init(): void {
    mkdirp(this.logsDir);
    mkdirp(this.headsLogsDir);
  }

  /**
   * Get the log file path for a ref
   */
  private getLogPath(ref: string): string {
    if (ref === 'HEAD') {
      return path.join(this.logsDir, 'HEAD');
    }
    
    // refs/heads/main -> logs/refs/heads/main
    if (ref.startsWith('refs/')) {
      return path.join(this.logsDir, ref);
    }
    
    // main -> logs/refs/heads/main
    return path.join(this.headsLogsDir, ref);
  }

  /**
   * Append an entry to the reflog
   */
  append(ref: string, oldHash: string, newHash: string, message: string, author?: {
    name: string;
    email: string;
  }): void {
    const logPath = this.getLogPath(ref);
    mkdirp(path.dirname(logPath));

    // Get author info
    const authorName = author?.name || process.env.WIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME || 'Anonymous';
    const authorEmail = author?.email || process.env.WIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL || 'anonymous@example.com';
    const timestamp = Math.floor(Date.now() / 1000);
    const timezone = this.getTimezone();

    const entry = formatReflogEntry({
      oldHash: oldHash || '0'.repeat(40),
      newHash,
      author: {
        name: authorName,
        email: authorEmail,
        timestamp,
        timezone,
      },
      message,
    });

    // Append to log file
    const content = exists(logPath) ? readFileText(logPath) : '';
    writeFile(logPath, content + entry + '\n');
  }

  /**
   * Get timezone string
   */
  private getTimezone(): string {
    const offset = new Date().getTimezoneOffset();
    const sign = offset <= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
    const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
    return `${sign}${hours}${minutes}`;
  }

  /**
   * Read the reflog for a ref
   */
  read(ref: string, limit?: number): ReflogEntry[] {
    const logPath = this.getLogPath(ref);
    
    if (!exists(logPath)) {
      return [];
    }

    const content = readFileText(logPath);
    const lines = content.split('\n').filter(l => l.trim());
    
    const entries: ReflogEntry[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = parseReflogLine(lines[i], lines.length - 1 - i);
      if (entry) {
        entries.push(entry);
        if (limit && entries.length >= limit) {
          break;
        }
      }
    }

    return entries;
  }

  /**
   * Check if reflog exists for a ref
   */
  exists(ref: string): boolean {
    return exists(this.getLogPath(ref));
  }

  /**
   * Delete a reflog
   */
  delete(ref: string): boolean {
    const logPath = this.getLogPath(ref);
    
    if (exists(logPath)) {
      fs.unlinkSync(logPath);
      return true;
    }
    
    return false;
  }

  /**
   * Delete a specific entry from the reflog
   */
  deleteEntry(ref: string, index: number): boolean {
    const logPath = this.getLogPath(ref);
    
    if (!exists(logPath)) {
      return false;
    }

    const content = readFileText(logPath);
    const lines = content.split('\n').filter(l => l.trim());
    
    // Index is from newest to oldest, but file is oldest to newest
    const lineIndex = lines.length - 1 - index;
    
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return false;
    }

    lines.splice(lineIndex, 1);
    writeFile(logPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
    
    return true;
  }

  /**
   * Expire old reflog entries
   */
  expire(options: {
    expire?: number;        // Expire entries older than N days (default: 90)
    expireUnreachable?: number;  // Expire unreachable entries older than N days (default: 30)
    all?: boolean;          // Process all refs
    dryRun?: boolean;       // Don't actually delete
    staleRefs?: boolean;    // Only process stale refs
  } = {}): { ref: string; removed: number }[] {
    const results: { ref: string; removed: number }[] = [];
    
    const expireDays = options.expire ?? 90;
    const expireTime = Date.now() / 1000 - (expireDays * 24 * 60 * 60);
    
    const refs = options.all ? this.listRefs() : ['HEAD'];

    for (const ref of refs) {
      const logPath = this.getLogPath(ref);
      
      if (!exists(logPath)) {
        continue;
      }

      const content = readFileText(logPath);
      const lines = content.split('\n').filter(l => l.trim());
      
      const remaining: string[] = [];
      let removed = 0;

      for (const line of lines) {
        const entry = parseReflogLine(line, 0);
        
        if (!entry) {
          remaining.push(line);
          continue;
        }

        // Check if entry should be expired
        if (entry.author.timestamp < expireTime) {
          if (!options.dryRun) {
            removed++;
          } else {
            remaining.push(line);
            removed++;
          }
        } else {
          remaining.push(line);
        }
      }

      if (removed > 0) {
        if (!options.dryRun) {
          writeFile(logPath, remaining.join('\n') + (remaining.length > 0 ? '\n' : ''));
        }
        results.push({ ref, removed });
      }
    }

    return results;
  }

  /**
   * List all refs with reflogs
   */
  listRefs(): string[] {
    const refs: string[] = [];
    
    // HEAD
    if (exists(path.join(this.logsDir, 'HEAD'))) {
      refs.push('HEAD');
    }

    // Branch refs
    if (exists(this.headsLogsDir)) {
      const branches = this.listRefsRecursive(this.headsLogsDir, 'refs/heads');
      refs.push(...branches);
    }

    return refs;
  }

  /**
   * Recursively list refs
   */
  private listRefsRecursive(dir: string, prefix: string): string[] {
    const refs: string[] = [];
    
    if (!exists(dir)) {
      return refs;
    }

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
   * Resolve a reflog reference like HEAD@{2}
   */
  resolve(refSpec: string): string | null {
    const match = refSpec.match(/^(.+)@\{(\d+)\}$/);
    
    if (!match) {
      return null;
    }

    const ref = match[1];
    const index = parseInt(match[2], 10);
    
    const entries = this.read(ref, index + 1);
    
    if (entries.length <= index) {
      return null;
    }

    return entries[index].newHash;
  }

  /**
   * Resolve a time-based reflog reference like HEAD@{yesterday}
   */
  resolveTime(refSpec: string): string | null {
    const match = refSpec.match(/^(.+)@\{(.+)\}$/);
    
    if (!match) {
      return null;
    }

    const ref = match[1];
    const timeSpec = match[2];
    
    // Parse time specification
    let targetTime: number;
    
    if (/^\d+$/.test(timeSpec)) {
      // Numeric index
      return this.resolve(refSpec);
    } else if (timeSpec === 'yesterday') {
      targetTime = Date.now() / 1000 - 24 * 60 * 60;
    } else if (timeSpec.match(/^\d+\s+days?\s+ago$/)) {
      const days = parseInt(timeSpec, 10);
      targetTime = Date.now() / 1000 - days * 24 * 60 * 60;
    } else if (timeSpec.match(/^\d+\s+hours?\s+ago$/)) {
      const hours = parseInt(timeSpec, 10);
      targetTime = Date.now() / 1000 - hours * 60 * 60;
    } else {
      // Try parsing as a date
      const date = new Date(timeSpec);
      if (isNaN(date.getTime())) {
        return null;
      }
      targetTime = date.getTime() / 1000;
    }

    const entries = this.read(ref);
    
    // Find the entry closest to the target time
    for (const entry of entries) {
      if (entry.author.timestamp <= targetTime) {
        return entry.newHash;
      }
    }

    // If all entries are newer, return the oldest
    if (entries.length > 0) {
      return entries[entries.length - 1].newHash;
    }

    return null;
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
 * Format time ago
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString();
}

/**
 * CLI handler for reflog command
 */
export function handleReflog(args: string[]): void {
  const repo = Repository.find();
  const reflogManager = new ReflogManager(repo.gitDir, repo.workDir);
  reflogManager.init();

  const subcommand = args[0];

  try {
    // Check if first arg is a ref or subcommand
    if (!subcommand || (!['show', 'expire', 'delete', 'exists'].includes(subcommand))) {
      // Show reflog for HEAD or specified ref
      const ref = subcommand || 'HEAD';
      const entries = reflogManager.read(ref);
      
      if (entries.length === 0) {
        if (reflogManager.exists(ref)) {
          console.log(colors.dim(`No reflog entries for ${ref}`));
        } else {
          console.log(colors.dim(`No reflog for ${ref}`));
        }
        return;
      }

      for (const entry of entries) {
        const hash = entry.newHash.slice(0, 7);
        const ago = formatTimeAgo(entry.author.timestamp);
        
        console.log(
          `${colors.yellow(hash)} ` +
          `${ref}@{${entry.lineNumber}}: ` +
          `${entry.message} ` +
          colors.dim(`(${ago})`)
        );
      }
      return;
    }

    switch (subcommand) {
      case 'show': {
        const ref = args[1] || 'HEAD';
        const limit = args.includes('-n') 
          ? parseInt(args[args.indexOf('-n') + 1], 10)
          : undefined;
        
        const entries = reflogManager.read(ref, limit);
        
        if (entries.length === 0) {
          console.log(colors.dim(`No reflog entries for ${ref}`));
          return;
        }

        for (const entry of entries) {
          const hash = entry.newHash.slice(0, 7);
          const oldHash = entry.oldHash === '0'.repeat(40) ? '(none)' : entry.oldHash.slice(0, 7);
          const ago = formatTimeAgo(entry.author.timestamp);
          
          console.log(
            `${colors.yellow(hash)} ${ref}@{${entry.lineNumber}}: ${entry.message}`
          );
          console.log(
            colors.dim(`  ${oldHash} -> ${hash}, ${ago}`)
          );
        }
        break;
      }

      case 'expire': {
        const expireDays = args.includes('--expire')
          ? parseInt(args[args.indexOf('--expire') + 1], 10)
          : 90;
        const all = args.includes('--all');
        const dryRun = args.includes('--dry-run') || args.includes('-n');
        
        const results = reflogManager.expire({
          expire: expireDays,
          all,
          dryRun,
        });

        if (results.length === 0) {
          console.log(colors.dim('Nothing to expire'));
        } else {
          for (const { ref, removed } of results) {
            if (dryRun) {
              console.log(`Would expire ${removed} entries from ${ref}`);
            } else {
              console.log(colors.green('✓') + ` Expired ${removed} entries from ${ref}`);
            }
          }
        }
        break;
      }

      case 'delete': {
        const ref = args[1];
        const entrySpec = args[2];
        
        if (!ref) {
          console.error(colors.red('error: ') + 'Please specify a ref');
          process.exit(1);
        }

        if (entrySpec !== undefined) {
          // Delete specific entry
          const index = parseInt(entrySpec, 10);
          if (reflogManager.deleteEntry(ref, index)) {
            console.log(colors.green('✓') + ` Deleted entry ${ref}@{${index}}`);
          } else {
            console.error(colors.red('error: ') + `Entry ${ref}@{${index}} not found`);
            process.exit(1);
          }
        } else {
          // Delete entire reflog
          if (reflogManager.delete(ref)) {
            console.log(colors.green('✓') + ` Deleted reflog for ${ref}`);
          } else {
            console.log(colors.yellow('!') + ` No reflog for ${ref}`);
          }
        }
        break;
      }

      case 'exists': {
        const ref = args[1] || 'HEAD';
        
        if (reflogManager.exists(ref)) {
          console.log(colors.green('✓') + ` Reflog exists for ${ref}`);
        } else {
          console.log(colors.yellow('!') + ` No reflog for ${ref}`);
          process.exit(1);
        }
        break;
      }

      default:
        console.error(colors.red('error: ') + `Unknown subcommand: ${subcommand}`);
        console.error('\nUsage:');
        console.error('  wit reflog                  Show HEAD reflog');
        console.error('  wit reflog <ref>            Show reflog for ref');
        console.error('  wit reflog show <ref>       Show detailed reflog');
        console.error('  wit reflog expire [--all]   Expire old entries');
        console.error('  wit reflog delete <ref> [n] Delete reflog or entry');
        console.error('  wit reflog exists <ref>     Check if reflog exists');
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

/**
 * Reflog integration for repository operations
 */
export function updateReflog(
  gitDir: string,
  workDir: string,
  ref: string,
  oldHash: string,
  newHash: string,
  message: string
): void {
  const reflogManager = new ReflogManager(gitDir, workDir);
  reflogManager.init();
  reflogManager.append(ref, oldHash, newHash, message);
}
