/**
 * WIP Command
 * Quick "Work in Progress" commit with auto-generated message
 * 
 * This is a huge QoL improvement - no need to think of a message for temporary saves
 */

import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import * as path from 'path';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

export interface WipOptions {
  all?: boolean;         // Stage all tracked files
  message?: string;      // Optional suffix to WIP message
  includeUntracked?: boolean;  // Also stage untracked files
}

/**
 * Create a WIP commit with auto-generated message
 */
export function wip(options: WipOptions = {}): string {
  const repo = Repository.find();
  
  // Stage files based on options
  const status = repo.status();
  
  if (options.all || options.includeUntracked) {
    // Stage modified tracked files
    for (const file of status.modified) {
      repo.add(file);
    }
    
    // Stage untracked files if requested
    if (options.includeUntracked) {
      for (const file of status.untracked) {
        repo.add(file);
      }
    }
  }
  
  // Refresh status after staging
  const newStatus = repo.status();
  
  if (newStatus.staged.length === 0) {
    throw new TsgitError(
      'Nothing to commit',
      ErrorCode.NOTHING_TO_COMMIT,
      [
        'tsgit wip -a          # Stage all tracked files first',
        'tsgit wip -u          # Include untracked files too',
        'tsgit add <file>      # Stage specific files',
      ]
    );
  }
  
  // Generate WIP message
  const wipMessage = generateWipMessage(newStatus.staged, options.message);
  
  // Create commit
  const hash = repo.commit(wipMessage);
  
  // Record in journal
  const beforeState = {
    head: repo.refs.resolve('HEAD') || '',
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  repo.journal.record(
    'wip',
    options.all ? ['-a'] : [],
    `WIP commit with ${newStatus.staged.length} file(s)`,
    beforeState,
    {
      head: hash,
      branch: repo.refs.getCurrentBranch(),
      indexHash: '',
    },
    { commitHash: hash, affectedFiles: newStatus.staged }
  );
  
  return hash;
}

/**
 * Generate a descriptive WIP message based on changed files
 */
function generateWipMessage(files: string[], suffix?: string): string {
  const timestamp = new Date().toLocaleString();
  
  // Categorize files
  const byExtension = new Map<string, string[]>();
  const byDirectory = new Map<string, number>();
  
  for (const file of files) {
    // By extension
    const ext = path.extname(file) || '(no ext)';
    if (!byExtension.has(ext)) {
      byExtension.set(ext, []);
    }
    byExtension.get(ext)!.push(file);
    
    // By directory
    const dir = path.dirname(file) || '.';
    byDirectory.set(dir, (byDirectory.get(dir) || 0) + 1);
  }
  
  // Build summary
  let summary = 'WIP: ';
  
  if (files.length === 1) {
    summary += `Update ${files[0]}`;
  } else if (files.length <= 3) {
    summary += `Update ${files.join(', ')}`;
  } else {
    // Summarize by what's most common
    const topDirs = Array.from(byDirectory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    
    if (topDirs.length === 1 && topDirs[0][0] !== '.') {
      summary += `Update ${topDirs[0][1]} files in ${topDirs[0][0]}/`;
    } else {
      // Summarize by extension
      const topExts = Array.from(byExtension.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 2);
      
      const extSummary = topExts
        .map(([ext, files]) => `${files.length} ${ext}`)
        .join(', ');
      
      summary += `Update ${files.length} files (${extSummary})`;
    }
  }
  
  if (suffix) {
    summary += ` - ${suffix}`;
  }
  
  // Build full message with details
  let message = summary + '\n\n';
  message += `[WIP commit at ${timestamp}]\n\n`;
  message += 'Changed files:\n';
  
  for (const file of files.slice(0, 20)) {
    message += `  - ${file}\n`;
  }
  
  if (files.length > 20) {
    message += `  ... and ${files.length - 20} more files\n`;
  }
  
  return message;
}

/**
 * CLI handler for wip
 */
export function handleWip(args: string[]): void {
  const options: WipOptions = {};
  
  const remaining: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-a' || arg === '--all') {
      options.all = true;
    } else if (arg === '-u' || arg === '--include-untracked') {
      options.includeUntracked = true;
      options.all = true;  // -u implies -a
    } else if (arg === '-m' && i + 1 < args.length) {
      options.message = args[i + 1];
      i++;
    } else {
      remaining.push(arg);
    }
  }
  
  // If there are remaining args, treat them as message suffix
  if (remaining.length > 0 && !options.message) {
    options.message = remaining.join(' ');
  }
  
  try {
    const hash = wip(options);
    console.log(colors.green('✓') + ` Created WIP commit: ${colors.yellow(hash.slice(0, 8))}`);
    console.log(colors.dim('  Use "tsgit undo" to revert if needed'));
    console.log(colors.dim('  Use "tsgit uncommit" to keep changes staged'));
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
