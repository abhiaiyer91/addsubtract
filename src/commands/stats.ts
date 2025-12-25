/**
 * Stats Command
 * Repository statistics and insights
 * 
 * Shows useful information like:
 * - Total commits, files, lines
 * - Contributor activity
 * - Language breakdown
 * - Commit frequency
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

export interface RepoStats {
  totalCommits: number;
  totalFiles: number;
  totalLines: number;
  branches: number;
  contributors: ContributorStats[];
  languages: LanguageStats[];
  commitsByDay: Map<string, number>;  // day of week -> count
  commitsByHour: Map<number, number>; // hour -> count
  firstCommit: Date | null;
  lastCommit: Date | null;
  averageCommitsPerDay: number;
  mostActiveDay: string;
  mostActiveHour: number;
}

export interface ContributorStats {
  name: string;
  email: string;
  commits: number;
  percentage: number;
  firstCommit: Date;
  lastCommit: Date;
}

export interface LanguageStats {
  language: string;
  files: number;
  lines: number;
  percentage: number;
  color: string;
}

// Language detection by extension
const LANGUAGE_MAP: Record<string, { name: string; color: string }> = {
  '.ts': { name: 'TypeScript', color: '#3178c6' },
  '.tsx': { name: 'TypeScript', color: '#3178c6' },
  '.js': { name: 'JavaScript', color: '#f7df1e' },
  '.jsx': { name: 'JavaScript', color: '#f7df1e' },
  '.py': { name: 'Python', color: '#3572A5' },
  '.rb': { name: 'Ruby', color: '#701516' },
  '.go': { name: 'Go', color: '#00ADD8' },
  '.rs': { name: 'Rust', color: '#dea584' },
  '.java': { name: 'Java', color: '#b07219' },
  '.c': { name: 'C', color: '#555555' },
  '.cpp': { name: 'C++', color: '#f34b7d' },
  '.cs': { name: 'C#', color: '#178600' },
  '.php': { name: 'PHP', color: '#4F5D95' },
  '.swift': { name: 'Swift', color: '#ffac45' },
  '.kt': { name: 'Kotlin', color: '#A97BFF' },
  '.html': { name: 'HTML', color: '#e34c26' },
  '.css': { name: 'CSS', color: '#563d7c' },
  '.scss': { name: 'SCSS', color: '#c6538c' },
  '.json': { name: 'JSON', color: '#292929' },
  '.yaml': { name: 'YAML', color: '#cb171e' },
  '.yml': { name: 'YAML', color: '#cb171e' },
  '.md': { name: 'Markdown', color: '#083fa1' },
  '.sh': { name: 'Shell', color: '#89e051' },
  '.sql': { name: 'SQL', color: '#e38c00' },
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Collect repository statistics
 */
export function collectStats(): RepoStats {
  const repo = Repository.find();
  
  // Get all commits
  const commits = getAllCommits(repo);
  
  // Get file stats
  const { files, lines, languages } = getFileStats(repo);
  
  // Get branches
  const branches = repo.refs.listBranches();
  
  // Analyze contributors
  const contributorMap = new Map<string, {
    name: string;
    email: string;
    commits: number;
    firstCommit: Date;
    lastCommit: Date;
  }>();
  
  const commitsByDay = new Map<string, number>();
  const commitsByHour = new Map<number, number>();
  
  for (const commit of commits) {
    const date = new Date(commit.author.timestamp * 1000);
    const key = `${commit.author.name}<${commit.author.email}>`;
    
    // Contributor stats
    if (contributorMap.has(key)) {
      const stats = contributorMap.get(key)!;
      stats.commits++;
      if (date < stats.firstCommit) stats.firstCommit = date;
      if (date > stats.lastCommit) stats.lastCommit = date;
    } else {
      contributorMap.set(key, {
        name: commit.author.name,
        email: commit.author.email,
        commits: 1,
        firstCommit: date,
        lastCommit: date,
      });
    }
    
    // Commits by day of week
    const dayName = DAY_NAMES[date.getDay()];
    commitsByDay.set(dayName, (commitsByDay.get(dayName) || 0) + 1);
    
    // Commits by hour
    const hour = date.getHours();
    commitsByHour.set(hour, (commitsByHour.get(hour) || 0) + 1);
  }
  
  // Convert to sorted arrays
  const contributors = Array.from(contributorMap.values())
    .map(c => ({
      ...c,
      percentage: (c.commits / commits.length) * 100,
    }))
    .sort((a, b) => b.commits - a.commits);
  
  // Find most active day/hour
  let mostActiveDay = 'Monday';
  let maxDayCommits = 0;
  for (const [day, count] of commitsByDay) {
    if (count > maxDayCommits) {
      mostActiveDay = day;
      maxDayCommits = count;
    }
  }
  
  let mostActiveHour = 12;
  let maxHourCommits = 0;
  for (const [hour, count] of commitsByHour) {
    if (count > maxHourCommits) {
      mostActiveHour = hour;
      maxHourCommits = count;
    }
  }
  
  // Calculate average commits per day
  const firstCommitDate = commits.length > 0 
    ? new Date(commits[commits.length - 1].author.timestamp * 1000) 
    : null;
  const lastCommitDate = commits.length > 0 
    ? new Date(commits[0].author.timestamp * 1000) 
    : null;
  
  let averageCommitsPerDay = 0;
  if (firstCommitDate && lastCommitDate) {
    const days = Math.max(1, Math.floor((lastCommitDate.getTime() - firstCommitDate.getTime()) / 86400000));
    averageCommitsPerDay = commits.length / days;
  }
  
  return {
    totalCommits: commits.length,
    totalFiles: files,
    totalLines: lines,
    branches: branches.length,
    contributors,
    languages,
    commitsByDay,
    commitsByHour,
    firstCommit: firstCommitDate,
    lastCommit: lastCommitDate,
    averageCommitsPerDay,
    mostActiveDay,
    mostActiveHour,
  };
}

/**
 * Get all commits in the repository
 */
function getAllCommits(repo: Repository): Commit[] {
  const commits: Commit[] = [];
  const visited = new Set<string>();
  
  try {
    const headHash = repo.refs.resolve('HEAD');
    if (!headHash) return [];
    
    const queue = [headHash];
    
    while (queue.length > 0) {
      const hash = queue.shift()!;
      
      if (visited.has(hash)) continue;
      visited.add(hash);
      
      try {
        const commit = repo.objects.readCommit(hash);
        commits.push(commit);
        queue.push(...commit.parentHashes);
      } catch {
        // Skip corrupted commits
      }
    }
  } catch {
    // No commits
  }
  
  // Sort by date (newest first)
  commits.sort((a, b) => b.author.timestamp - a.author.timestamp);
  
  return commits;
}

/**
 * Get file and language statistics
 */
function getFileStats(repo: Repository): { files: number; lines: number; languages: LanguageStats[] } {
  const languageStats = new Map<string, { files: number; lines: number; color: string }>();
  let totalFiles = 0;
  let totalLines = 0;
  
  // Walk the working directory
  const walkDir = (dir: string): void => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip ignored directories
          if (['node_modules', '.wit', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
            continue;
          }
          walkDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          const lang = LANGUAGE_MAP[ext];
          
          if (lang) {
            totalFiles++;
            
            // Count lines
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const lines = content.split('\n').length;
              totalLines += lines;
              
              if (!languageStats.has(lang.name)) {
                languageStats.set(lang.name, { files: 0, lines: 0, color: lang.color });
              }
              const stats = languageStats.get(lang.name)!;
              stats.files++;
              stats.lines += lines;
            } catch {
              // Skip files we can't read
            }
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  };
  
  walkDir(repo.workDir);
  
  // Convert to sorted array
  const languages = Array.from(languageStats.entries())
    .map(([language, stats]) => ({
      language,
      files: stats.files,
      lines: stats.lines,
      percentage: totalLines > 0 ? (stats.lines / totalLines) * 100 : 0,
      color: stats.color,
    }))
    .sort((a, b) => b.lines - a.lines);
  
  return { files: totalFiles, lines: totalLines, languages };
}

/**
 * Create a horizontal bar
 */
function createBar(percentage: number, width: number = 30): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * CLI handler for stats
 */
export function handleStats(args: string[]): void {
  let showAll = false;
  
  for (const arg of args) {
    if (arg === '--all' || arg === '-a') {
      showAll = true;
    }
  }
  
  try {
    const stats = collectStats();
    
    console.log(colors.bold('\n📊 Repository Statistics\n'));
    
    // Overview
    console.log(colors.cyan('Overview'));
    console.log('─'.repeat(40));
    console.log(`  Commits:       ${colors.yellow(stats.totalCommits.toString())}`);
    console.log(`  Files:         ${colors.yellow(stats.totalFiles.toString())}`);
    console.log(`  Lines of code: ${colors.yellow(stats.totalLines.toLocaleString())}`);
    console.log(`  Branches:      ${colors.yellow(stats.branches.toString())}`);
    console.log(`  Contributors:  ${colors.yellow(stats.contributors.length.toString())}`);
    
    if (stats.firstCommit && stats.lastCommit) {
      console.log();
      console.log(`  First commit:  ${colors.dim(stats.firstCommit.toLocaleDateString())}`);
      console.log(`  Last commit:   ${colors.dim(stats.lastCommit.toLocaleDateString())}`);
      console.log(`  Commits/day:   ${colors.dim(stats.averageCommitsPerDay.toFixed(2))}`);
    }
    
    // Languages
    if (stats.languages.length > 0) {
      console.log();
      console.log(colors.cyan('Languages'));
      console.log('─'.repeat(40));
      
      for (const lang of stats.languages.slice(0, showAll ? undefined : 5)) {
        const bar = createBar(lang.percentage, 20);
        console.log(
          `  ${lang.language.padEnd(12)} ${colors.green(bar)} ` +
          `${lang.percentage.toFixed(1).padStart(5)}% ` +
          colors.dim(`(${lang.lines.toLocaleString()} lines)`)
        );
      }
      
      if (!showAll && stats.languages.length > 5) {
        console.log(colors.dim(`  ... and ${stats.languages.length - 5} more languages`));
      }
    }
    
    // Contributors
    if (stats.contributors.length > 0) {
      console.log();
      console.log(colors.cyan('Top Contributors'));
      console.log('─'.repeat(40));
      
      for (const contributor of stats.contributors.slice(0, showAll ? undefined : 5)) {
        const bar = createBar(contributor.percentage, 20);
        console.log(
          `  ${contributor.name.slice(0, 15).padEnd(15)} ${colors.blue(bar)} ` +
          `${contributor.percentage.toFixed(1).padStart(5)}% ` +
          colors.dim(`(${contributor.commits} commits)`)
        );
      }
      
      if (!showAll && stats.contributors.length > 5) {
        console.log(colors.dim(`  ... and ${stats.contributors.length - 5} more contributors`));
      }
    }
    
    // Activity patterns
    console.log();
    console.log(colors.cyan('Activity Patterns'));
    console.log('─'.repeat(40));
    console.log(`  Most active day:  ${colors.yellow(stats.mostActiveDay)}`);
    console.log(`  Most active hour: ${colors.yellow(formatHour(stats.mostActiveHour))}`);
    
    // Hour distribution
    if (showAll) {
      console.log();
      console.log(colors.dim('  Commits by hour:'));
      const maxHourCount = Math.max(...Array.from(stats.commitsByHour.values(), v => v || 0));
      
      for (let h = 0; h < 24; h++) {
        const count = stats.commitsByHour.get(h) || 0;
        const barLen = maxHourCount > 0 ? Math.round((count / maxHourCount) * 15) : 0;
        console.log(
          `  ${h.toString().padStart(2)}:00 ` +
          colors.green('█'.repeat(barLen)) +
          ' '.repeat(15 - barLen) +
          colors.dim(` ${count}`)
        );
      }
    }
    
    console.log();
    
    if (!showAll) {
      console.log(colors.dim('Use --all for detailed statistics'));
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

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}
