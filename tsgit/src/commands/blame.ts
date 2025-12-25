/**
 * Blame Command
 * Show who changed each line of a file and when
 * 
 * Better than git blame with:
 * - Color-coded by author
 * - Relative dates
 * - Commit message preview on hover (in web UI)
 */

import { Repository } from '../core/repository';
import { Commit } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';
import * as path from 'path';
import * as fs from 'fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// Color palette for different authors
const AUTHOR_COLORS = [
  (s: string) => `\x1b[36m${s}\x1b[0m`,  // cyan
  (s: string) => `\x1b[33m${s}\x1b[0m`,  // yellow
  (s: string) => `\x1b[32m${s}\x1b[0m`,  // green
  (s: string) => `\x1b[35m${s}\x1b[0m`,  // magenta
  (s: string) => `\x1b[34m${s}\x1b[0m`,  // blue
  (s: string) => `\x1b[91m${s}\x1b[0m`,  // bright red
  (s: string) => `\x1b[92m${s}\x1b[0m`,  // bright green
  (s: string) => `\x1b[93m${s}\x1b[0m`,  // bright yellow
];

export interface BlameLine {
  lineNumber: number;
  content: string;
  commitHash: string;
  shortHash: string;
  author: string;
  date: Date;
  message: string;
  isOriginal: boolean;  // true if this commit created the line
}

export interface BlameResult {
  file: string;
  lines: BlameLine[];
  authors: Map<string, number>;  // author -> line count
  commits: Map<string, number>;  // commit -> line count
}

export interface BlameOptions {
  startLine?: number;
  endLine?: number;
  showEmail?: boolean;
  porcelain?: boolean;  // Machine-readable output
}

/**
 * Generate blame for a file
 * 
 * Note: This is a simplified implementation that shows the last commit
 * that touched each line. A full implementation would trace through
 * history to find the originating commit for each line.
 */
export function blame(filePath: string, options: BlameOptions = {}): BlameResult {
  const repo = Repository.find();
  
  // Normalize path
  const relativePath = path.isAbsolute(filePath) 
    ? path.relative(repo.workDir, filePath)
    : filePath;
  
  const fullPath = path.join(repo.workDir, relativePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new TsgitError(
      `File not found: ${filePath}`,
      ErrorCode.FILE_NOT_FOUND,
      ['Check the file path and try again']
    );
  }
  
  // Read current file content
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  
  // Get commit history for this file
  const fileHistory = getFileHistory(repo, relativePath);
  
  // Build blame info for each line
  const blameLines: BlameLine[] = [];
  const authors = new Map<string, number>();
  const commits = new Map<string, number>();
  
  // For now, use a simplified approach: show the latest commit that modified the file
  // A full implementation would diff each commit to find who introduced each line
  const lastCommit = fileHistory[0];
  
  if (!lastCommit) {
    // File not yet committed
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      if (options.startLine && lineNum < options.startLine) continue;
      if (options.endLine && lineNum > options.endLine) continue;
      
      blameLines.push({
        lineNumber: lineNum,
        content: lines[i],
        commitHash: '0'.repeat(40),
        shortHash: '00000000',
        author: 'Not Committed Yet',
        date: new Date(),
        message: 'Working copy',
        isOriginal: true,
      });
    }
  } else {
    // Trace each line back through history
    const lineAuthors = traceLines(repo, relativePath, lines, fileHistory);
    
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      if (options.startLine && lineNum < options.startLine) continue;
      if (options.endLine && lineNum > options.endLine) continue;
      
      const lineInfo = lineAuthors[i] || {
        hash: lastCommit.hash(),
        author: lastCommit.author.name,
        date: new Date(lastCommit.author.timestamp * 1000),
        message: lastCommit.message.split('\n')[0],
      };
      
      blameLines.push({
        lineNumber: lineNum,
        content: lines[i],
        commitHash: lineInfo.hash,
        shortHash: lineInfo.hash.slice(0, 8),
        author: lineInfo.author,
        date: lineInfo.date,
        message: lineInfo.message,
        isOriginal: false,
      });
      
      // Count stats
      authors.set(lineInfo.author, (authors.get(lineInfo.author) || 0) + 1);
      commits.set(lineInfo.hash, (commits.get(lineInfo.hash) || 0) + 1);
    }
  }
  
  return {
    file: relativePath,
    lines: blameLines,
    authors,
    commits,
  };
}

/**
 * Get commit history for a specific file
 */
function getFileHistory(repo: Repository, filePath: string): Commit[] {
  const history: Commit[] = [];
  
  try {
    const commits = repo.log('HEAD', 100);
    
    for (const commit of commits) {
      // Check if file exists in this commit's tree
      const blobHash = findFileInTree(repo, commit.treeHash, filePath.split('/'));
      if (blobHash) {
        history.push(commit);
      }
    }
  } catch {
    // No commits yet
  }
  
  return history;
}

/**
 * Find a file in a tree
 */
function findFileInTree(repo: Repository, treeHash: string, pathParts: string[]): string | null {
  try {
    const tree = repo.objects.readTree(treeHash);
    
    for (const entry of tree.entries) {
      if (entry.name === pathParts[0]) {
        if (pathParts.length === 1) {
          return entry.mode === '40000' ? null : entry.hash;
        }
        if (entry.mode === '40000') {
          return findFileInTree(repo, entry.hash, pathParts.slice(1));
        }
      }
    }
  } catch {
    // Tree not found
  }
  
  return null;
}

/**
 * Trace each line back through history
 * Simplified: assigns all lines to the most recent commit that touched the file
 */
function traceLines(
  repo: Repository, 
  filePath: string, 
  currentLines: string[], 
  history: Commit[]
): Array<{ hash: string; author: string; date: Date; message: string } | null> {
  const result: Array<{ hash: string; author: string; date: Date; message: string } | null> = 
    new Array(currentLines.length).fill(null);
  
  if (history.length === 0) {
    return result;
  }
  
  // Simple approach: assign to latest commit
  // A real implementation would diff between commits
  const latestCommit = history[0];
  const info = {
    hash: latestCommit.hash(),
    author: latestCommit.author.name,
    date: new Date(latestCommit.author.timestamp * 1000),
    message: latestCommit.message.split('\n')[0],
  };
  
  for (let i = 0; i < currentLines.length; i++) {
    result[i] = info;
  }
  
  return result;
}

/**
 * Format relative date
 */
function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

/**
 * CLI handler for blame
 */
export function handleBlame(args: string[]): void {
  const options: BlameOptions = {};
  let filePath: string | undefined;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-L' && i + 1 < args.length) {
      const range = args[i + 1];
      const match = range.match(/^(\d+),(\d+)$/);
      if (match) {
        options.startLine = parseInt(match[1], 10);
        options.endLine = parseInt(match[2], 10);
      }
      i++;
    } else if (arg === '--email' || arg === '-e') {
      options.showEmail = true;
    } else if (arg === '--porcelain') {
      options.porcelain = true;
    } else if (!arg.startsWith('-')) {
      filePath = arg;
    }
  }
  
  if (!filePath) {
    console.error(colors.red('error: ') + 'No file specified');
    console.error(colors.dim('Usage: tsgit blame <file>'));
    process.exit(1);
  }
  
  try {
    const result = blame(filePath, options);
    
    if (options.porcelain) {
      // Machine-readable output
      for (const line of result.lines) {
        console.log(`${line.commitHash} ${line.lineNumber} ${line.lineNumber} 1`);
        console.log(`author ${line.author}`);
        console.log(`author-time ${Math.floor(line.date.getTime() / 1000)}`);
        console.log(`summary ${line.message}`);
        console.log(`filename ${result.file}`);
        console.log(`\t${line.content}`);
      }
    } else {
      // Human-readable output
      console.log(colors.bold(`Blame for ${result.file}\n`));
      
      // Assign colors to authors
      const authorColors = new Map<string, (s: string) => string>();
      let colorIndex = 0;
      
      for (const line of result.lines) {
        if (!authorColors.has(line.author)) {
          authorColors.set(line.author, AUTHOR_COLORS[colorIndex % AUTHOR_COLORS.length]);
          colorIndex++;
        }
      }
      
      // Calculate column widths
      const maxLineNum = Math.max(...result.lines.map(l => l.lineNumber));
      const lineNumWidth = maxLineNum.toString().length;
      
      for (const line of result.lines) {
        const colorFn = authorColors.get(line.author) || colors.dim;
        const lineNum = line.lineNumber.toString().padStart(lineNumWidth);
        const date = formatRelativeDate(line.date).padStart(8);
        const author = line.author.slice(0, 12).padEnd(12);
        
        console.log(
          colors.yellow(line.shortHash) + ' ' +
          colorFn(author) + ' ' +
          colors.dim(date) + ' ' +
          colors.dim(lineNum + ' │') + ' ' +
          line.content
        );
      }
      
      // Show summary
      console.log();
      console.log(colors.bold('Summary:'));
      console.log(colors.dim(`  ${result.commits.size} commit(s), ${result.authors.size} author(s)`));
      
      // Top authors
      const topAuthors = Array.from(result.authors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      for (const [author, count] of topAuthors) {
        const pct = Math.round((count / result.lines.length) * 100);
        console.log(colors.dim(`  ${author}: ${count} lines (${pct}%)`));
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
