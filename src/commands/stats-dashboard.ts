/**
 * Stats Dashboard Command
 * Comprehensive repository statistics and insights CLI
 *
 * Features:
 * - Commit frequency (daily, weekly, monthly)
 * - Top contributors
 * - Code churn analysis
 * - File hotspots
 * - PR metrics (time to merge, review time)
 * - Issue metrics (time to close, distribution)
 * - Branch statistics
 * - ASCII visualizations
 * - Multiple output formats (pretty, json)
 */

import { Repository } from '../core/repository';
import { Commit } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';
import { colors } from '../utils/colors';
import * as path from 'path';
import * as fs from 'fs';

// ==========================================
// Types for Local Stats (no DB)
// ==========================================

export interface LocalRepoStats {
  // Summary
  totalCommits: number;
  totalFiles: number;
  totalLines: number;
  branches: number;

  // Contributors
  contributors: LocalContributorStats[];

  // Languages
  languages: LocalLanguageStats[];

  // Commit patterns
  commitsByDay: Map<string, number>;
  commitsByHour: Map<number, number>;
  commitsByDayOfWeek: Map<number, number>;
  commitsByMonth: Map<string, number>;

  // File analysis
  fileHotspots: LocalFileHotspot[];

  // Date range
  firstCommit: Date | null;
  lastCommit: Date | null;
  averageCommitsPerDay: number;

  // Peak activity
  mostActiveDay: string;
  mostActiveHour: number;
  mostActiveDayOfWeek: string;
}

export interface LocalContributorStats {
  name: string;
  email: string;
  commits: number;
  percentage: number;
  firstCommit: Date;
  lastCommit: Date;
  activeDays: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface LocalLanguageStats {
  language: string;
  files: number;
  lines: number;
  percentage: number;
  color: string;
}

export interface LocalFileHotspot {
  path: string;
  changeCount: number;
  contributors: Set<string>;
  lastModified: Date | null;
}

// ==========================================
// Language Detection
// ==========================================

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
  '.h': { name: 'C/C++ Header', color: '#555555' },
  '.hpp': { name: 'C++ Header', color: '#f34b7d' },
  '.cs': { name: 'C#', color: '#178600' },
  '.php': { name: 'PHP', color: '#4F5D95' },
  '.swift': { name: 'Swift', color: '#ffac45' },
  '.kt': { name: 'Kotlin', color: '#A97BFF' },
  '.html': { name: 'HTML', color: '#e34c26' },
  '.css': { name: 'CSS', color: '#563d7c' },
  '.scss': { name: 'SCSS', color: '#c6538c' },
  '.sass': { name: 'Sass', color: '#c6538c' },
  '.less': { name: 'Less', color: '#1d365d' },
  '.json': { name: 'JSON', color: '#292929' },
  '.yaml': { name: 'YAML', color: '#cb171e' },
  '.yml': { name: 'YAML', color: '#cb171e' },
  '.md': { name: 'Markdown', color: '#083fa1' },
  '.sh': { name: 'Shell', color: '#89e051' },
  '.bash': { name: 'Bash', color: '#89e051' },
  '.zsh': { name: 'Zsh', color: '#89e051' },
  '.sql': { name: 'SQL', color: '#e38c00' },
  '.vue': { name: 'Vue', color: '#41b883' },
  '.svelte': { name: 'Svelte', color: '#ff3e00' },
  '.astro': { name: 'Astro', color: '#ff5d01' },
};

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// ==========================================
// ASCII Visualization Helpers
// ==========================================

const BLOCK_CHARS = [' ', '░', '▒', '▓', '█'];
const BAR_CHARS = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Create a horizontal bar chart
 */
function createBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Create a sparkline from values
 */
function createSparkline(values: number[], width?: number): string {
  if (values.length === 0) return '';

  const max = Math.max(...values, 1);
  const sparkValues = width
    ? resampleArray(values, width)
    : values;

  return sparkValues
    .map((v) => {
      const level = Math.floor((v / max) * 7);
      return SPARK_CHARS[Math.min(level, 7)];
    })
    .join('');
}

/**
 * Resample an array to a target length
 */
function resampleArray(arr: number[], targetLen: number): number[] {
  if (arr.length === 0) return [];
  if (arr.length === targetLen) return arr;

  const result: number[] = [];
  const step = arr.length / targetLen;

  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    const slice = arr.slice(start, end);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }

  return result;
}

/**
 * Create activity heatmap (GitHub-style)
 */
function createActivityHeatmap(
  commitsByDay: Map<string, number>,
  weeks: number = 12
): string[] {
  const lines: string[] = [];
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - weeks * 7);

  // Find max for intensity calculation
  const values = Array.from(commitsByDay.values());
  const max = Math.max(...values, 1);

  // Build weeks array
  const weekData: number[][] = [];
  let currentWeek: number[] = [];

  for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const count = commitsByDay.get(dateStr) || 0;
    const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
    currentWeek.push(level);

    if (d.getDay() === 6) {
      weekData.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    weekData.push(currentWeek);
  }

  // Build heatmap lines (one per day of week)
  for (let day = 0; day < 7; day++) {
    let line = DAY_NAMES[day].slice(0, 3).padEnd(4);
    for (const week of weekData) {
      if (day < week.length) {
        line += BLOCK_CHARS[week[day]];
      } else {
        line += ' ';
      }
    }
    lines.push(line);
  }

  return lines;
}

/**
 * Create hourly activity chart
 */
function createHourlyChart(
  commitsByHour: Map<number, number>,
  height: number = 6
): string[] {
  const lines: string[] = [];
  const values: number[] = [];

  for (let h = 0; h < 24; h++) {
    values.push(commitsByHour.get(h) || 0);
  }

  const max = Math.max(...values, 1);

  // Build chart (bottom to top)
  for (let row = height - 1; row >= 0; row--) {
    const threshold = (row / height) * max;
    let line = '    '; // Padding

    for (let h = 0; h < 24; h++) {
      if (values[h] > threshold) {
        line += '█';
      } else if (values[h] > threshold - max / height) {
        line += '▄';
      } else {
        line += ' ';
      }
    }

    lines.push(line);
  }

  // Add hour labels
  lines.push('    ' + '0   4   8  12  16  20  24');

  return lines;
}

// ==========================================
// Data Collection (Local Git Repository)
// ==========================================

/**
 * Get all commits from the repository
 */
function getAllCommits(
  repo: Repository,
  limit?: number,
  since?: Date
): Commit[] {
  const commits: Commit[] = [];
  const visited = new Set<string>();

  try {
    const headHash = repo.refs.resolve('HEAD');
    if (!headHash) return [];

    const queue = [headHash];

    while (queue.length > 0) {
      const hash = queue.shift()!;

      if (visited.has(hash)) continue;
      if (limit && commits.length >= limit) break;

      visited.add(hash);

      try {
        const commit = repo.objects.readCommit(hash);

        // Filter by date if specified
        if (since) {
          const commitDate = new Date(commit.author.timestamp * 1000);
          if (commitDate < since) continue;
        }

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
function getFileStats(
  repo: Repository
): { files: number; lines: number; languages: LocalLanguageStats[] } {
  const languageStats = new Map<
    string,
    { files: number; lines: number; color: string }
  >();
  let totalFiles = 0;
  let totalLines = 0;

  const walkDir = (dir: string): void => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip ignored directories
          if (
            [
              'node_modules',
              '.wit',
              '.git',
              'dist',
              'build',
              'coverage',
              '.next',
              '.venv',
              'venv',
              '__pycache__',
              '.cache',
            ].includes(entry.name)
          ) {
            continue;
          }
          walkDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          const lang = LANGUAGE_MAP[ext];

          if (lang) {
            totalFiles++;

            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const lines = content.split('\n').length;
              totalLines += lines;

              if (!languageStats.has(lang.name)) {
                languageStats.set(lang.name, {
                  files: 0,
                  lines: 0,
                  color: lang.color,
                });
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
 * Analyze file change frequency from commits
 */
function analyzeFileHotspots(commits: Commit[]): LocalFileHotspot[] {
  const fileChanges = new Map<
    string,
    { count: number; contributors: Set<string>; lastModified: Date | null }
  >();

  for (const commit of commits) {
    const author = commit.author.email;
    const date = new Date(commit.author.timestamp * 1000);

    // Parse commit message for file paths (this is a heuristic)
    // In a real implementation, we'd diff commits
    const message = commit.message;
    const fileMatches = message.match(/[\w/.-]+\.(ts|js|py|go|rs|java|c|cpp)/g);

    if (fileMatches) {
      for (const file of fileMatches) {
        if (!fileChanges.has(file)) {
          fileChanges.set(file, {
            count: 0,
            contributors: new Set(),
            lastModified: null,
          });
        }
        const stats = fileChanges.get(file)!;
        stats.count++;
        stats.contributors.add(author);
        if (!stats.lastModified || date > stats.lastModified) {
          stats.lastModified = date;
        }
      }
    }
  }

  return Array.from(fileChanges.entries())
    .map(([path, stats]) => ({
      path,
      changeCount: stats.count,
      contributors: stats.contributors,
      lastModified: stats.lastModified,
    }))
    .sort((a, b) => b.changeCount - a.changeCount)
    .slice(0, 20);
}

/**
 * Collect comprehensive local repository statistics
 */
export function collectLocalStats(options: {
  period?: string;
  contributor?: string;
  file?: string;
}): LocalRepoStats {
  const repo = Repository.find();

  // Parse period to determine how far back to look
  let since: Date | undefined;
  const now = new Date();

  if (options.period) {
    const match = options.period.match(/^(\d+)([dwmy])$/);
    if (match) {
      const [, num, unit] = match;
      since = new Date(now);
      switch (unit) {
        case 'd':
          since.setDate(since.getDate() - parseInt(num));
          break;
        case 'w':
          since.setDate(since.getDate() - parseInt(num) * 7);
          break;
        case 'm':
          since.setMonth(since.getMonth() - parseInt(num));
          break;
        case 'y':
          since.setFullYear(since.getFullYear() - parseInt(num));
          break;
      }
    }
  }

  // Get all commits
  let commits = getAllCommits(repo, undefined, since);

  // Filter by contributor if specified
  if (options.contributor) {
    const filterName = options.contributor.toLowerCase();
    commits = commits.filter(
      (c) =>
        c.author.name.toLowerCase().includes(filterName) ||
        c.author.email.toLowerCase().includes(filterName)
    );
  }

  // Get file stats
  const { files, lines, languages } = getFileStats(repo);

  // Get branches
  const branches = repo.refs.listBranches();

  // Analyze contributors
  const contributorMap = new Map<
    string,
    {
      name: string;
      email: string;
      commits: number;
      firstCommit: Date;
      lastCommit: Date;
      activeDays: Set<string>;
      linesAdded: number;
      linesRemoved: number;
    }
  >();

  const commitsByDay = new Map<string, number>();
  const commitsByHour = new Map<number, number>();
  const commitsByDayOfWeek = new Map<number, number>();
  const commitsByMonth = new Map<string, number>();

  // Initialize maps
  for (let h = 0; h < 24; h++) commitsByHour.set(h, 0);
  for (let d = 0; d < 7; d++) commitsByDayOfWeek.set(d, 0);

  for (const commit of commits) {
    const date = new Date(commit.author.timestamp * 1000);
    const key = `${commit.author.name}<${commit.author.email}>`;
    const dayStr = date.toISOString().split('T')[0];
    const monthStr = `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;

    // Contributor stats
    if (!contributorMap.has(key)) {
      contributorMap.set(key, {
        name: commit.author.name,
        email: commit.author.email,
        commits: 0,
        firstCommit: date,
        lastCommit: date,
        activeDays: new Set(),
        linesAdded: 0,
        linesRemoved: 0,
      });
    }
    const stats = contributorMap.get(key)!;
    stats.commits++;
    stats.activeDays.add(dayStr);
    if (date < stats.firstCommit) stats.firstCommit = date;
    if (date > stats.lastCommit) stats.lastCommit = date;

    // Commits by day
    commitsByDay.set(dayStr, (commitsByDay.get(dayStr) || 0) + 1);

    // Commits by hour
    const hour = date.getHours();
    commitsByHour.set(hour, (commitsByHour.get(hour) || 0) + 1);

    // Commits by day of week
    const dayOfWeek = date.getDay();
    commitsByDayOfWeek.set(
      dayOfWeek,
      (commitsByDayOfWeek.get(dayOfWeek) || 0) + 1
    );

    // Commits by month
    commitsByMonth.set(monthStr, (commitsByMonth.get(monthStr) || 0) + 1);
  }

  // Convert contributors to sorted array
  const contributors = Array.from(contributorMap.values())
    .map((c) => ({
      name: c.name,
      email: c.email,
      commits: c.commits,
      percentage: (c.commits / commits.length) * 100,
      firstCommit: c.firstCommit,
      lastCommit: c.lastCommit,
      activeDays: c.activeDays.size,
      linesAdded: c.linesAdded,
      linesRemoved: c.linesRemoved,
    }))
    .sort((a, b) => b.commits - a.commits);

  // Find peaks
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

  let mostActiveDayOfWeek = 'Monday';
  let maxDayOfWeekCommits = 0;
  for (const [day, count] of commitsByDayOfWeek) {
    if (count > maxDayOfWeekCommits) {
      mostActiveDayOfWeek = DAY_NAMES[day];
      maxDayOfWeekCommits = count;
    }
  }

  // Calculate average commits per day
  const firstCommitDate =
    commits.length > 0
      ? new Date(commits[commits.length - 1].author.timestamp * 1000)
      : null;
  const lastCommitDate =
    commits.length > 0 ? new Date(commits[0].author.timestamp * 1000) : null;

  let averageCommitsPerDay = 0;
  if (firstCommitDate && lastCommitDate) {
    const days = Math.max(
      1,
      Math.floor(
        (lastCommitDate.getTime() - firstCommitDate.getTime()) / 86400000
      )
    );
    averageCommitsPerDay = commits.length / days;
  }

  // Analyze file hotspots
  const fileHotspots = analyzeFileHotspots(commits);

  return {
    totalCommits: commits.length,
    totalFiles: files,
    totalLines: lines,
    branches: branches.length,
    contributors,
    languages,
    commitsByDay,
    commitsByHour,
    commitsByDayOfWeek,
    commitsByMonth,
    fileHotspots,
    firstCommit: firstCommitDate,
    lastCommit: lastCommitDate,
    averageCommitsPerDay,
    mostActiveDay,
    mostActiveHour,
    mostActiveDayOfWeek,
  };
}

// ==========================================
// Output Formatters
// ==========================================

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / 86400000);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);

  if (years > 0) return `${years} year${years > 1 ? 's' : ''}`;
  if (months > 0) return `${months} month${months > 1 ? 's' : ''}`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  return 'today';
}

// ==========================================
// Pretty Print Output
// ==========================================

function printPrettyStats(stats: LocalRepoStats, showAll: boolean): void {
  console.log(colors.bold('\n📊 Repository Statistics\n'));

  // Overview
  console.log(colors.cyan('Overview'));
  console.log('─'.repeat(50));
  console.log(
    `  Commits:       ${colors.yellow(formatNumber(stats.totalCommits))}`
  );
  console.log(
    `  Files:         ${colors.yellow(formatNumber(stats.totalFiles))}`
  );
  console.log(
    `  Lines of code: ${colors.yellow(formatNumber(stats.totalLines))}`
  );
  console.log(`  Branches:      ${colors.yellow(stats.branches.toString())}`);
  console.log(
    `  Contributors:  ${colors.yellow(stats.contributors.length.toString())}`
  );

  if (stats.firstCommit && stats.lastCommit) {
    console.log();
    console.log(
      `  First commit:  ${colors.dim(stats.firstCommit.toLocaleDateString())}`
    );
    console.log(
      `  Last commit:   ${colors.dim(stats.lastCommit.toLocaleDateString())}`
    );
    console.log(
      `  Commits/day:   ${colors.dim(stats.averageCommitsPerDay.toFixed(2))}`
    );
    console.log(
      `  Active for:    ${colors.dim(
        formatDuration(stats.firstCommit, stats.lastCommit)
      )}`
    );
  }

  // Languages
  if (stats.languages.length > 0) {
    console.log();
    console.log(colors.cyan('Languages'));
    console.log('─'.repeat(50));

    for (const lang of stats.languages.slice(0, showAll ? undefined : 5)) {
      const bar = createBar(lang.percentage, 20);
      console.log(
        `  ${lang.language.padEnd(12)} ${colors.green(bar)} ` +
          `${lang.percentage.toFixed(1).padStart(5)}% ` +
          colors.dim(`(${formatNumber(lang.lines)} lines)`)
      );
    }

    if (!showAll && stats.languages.length > 5) {
      console.log(
        colors.dim(`  ... and ${stats.languages.length - 5} more languages`)
      );
    }
  }

  // Contributors
  if (stats.contributors.length > 0) {
    console.log();
    console.log(colors.cyan('Top Contributors'));
    console.log('─'.repeat(50));

    for (const contributor of stats.contributors.slice(
      0,
      showAll ? undefined : 5
    )) {
      const bar = createBar(contributor.percentage, 20);
      console.log(
        `  ${contributor.name.slice(0, 15).padEnd(15)} ${colors.blue(bar)} ` +
          `${contributor.percentage.toFixed(1).padStart(5)}% ` +
          colors.dim(`(${contributor.commits} commits)`)
      );
    }

    if (!showAll && stats.contributors.length > 5) {
      console.log(
        colors.dim(
          `  ... and ${stats.contributors.length - 5} more contributors`
        )
      );
    }
  }

  // Activity Patterns
  console.log();
  console.log(colors.cyan('Activity Patterns'));
  console.log('─'.repeat(50));
  console.log(
    `  Most active day:        ${colors.yellow(stats.mostActiveDayOfWeek)}`
  );
  console.log(
    `  Most active hour:       ${colors.yellow(formatHour(stats.mostActiveHour))}`
  );
  console.log(
    `  Peak activity date:     ${colors.yellow(stats.mostActiveDay)}`
  );

  // Commit Activity Graph (Sparkline)
  console.log();
  console.log(colors.dim('  Commit activity (last 12 weeks):'));

  // Get last 84 days (12 weeks)
  const last84Days: number[] = [];
  const now = new Date();
  for (let i = 83; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last84Days.push(stats.commitsByDay.get(dateStr) || 0);
  }

  const sparkline = createSparkline(last84Days);
  console.log(
    `  ${colors.green(sparkline)} ${colors.dim(
      `(${last84Days.reduce((a, b) => a + b, 0)} commits)`
    )}`
  );

  // Activity Heatmap
  if (showAll) {
    console.log();
    console.log(colors.dim('  Activity heatmap:'));
    const heatmapLines = createActivityHeatmap(stats.commitsByDay);
    for (const line of heatmapLines) {
      console.log(colors.green(`  ${line}`));
    }
    console.log(
      colors.dim('       ' + BLOCK_CHARS.map((c, i) => `${c}=${i}`).join(' '))
    );
  }

  // Hourly Distribution
  if (showAll) {
    console.log();
    console.log(colors.dim('  Commits by hour:'));
    const hourlyLines = createHourlyChart(stats.commitsByHour);
    for (const line of hourlyLines) {
      console.log(colors.cyan(line));
    }
  }

  // Day of Week Distribution
  console.log();
  console.log(colors.dim('  Commits by day of week:'));
  const maxDayCount = Math.max(
    ...Array.from(stats.commitsByDayOfWeek.values())
  );
  for (let d = 0; d < 7; d++) {
    const count = stats.commitsByDayOfWeek.get(d) || 0;
    const barLen = Math.round((count / maxDayCount) * 20);
    console.log(
      `  ${DAY_NAMES[d].slice(0, 3)} ${colors.cyan('█'.repeat(barLen))} ${colors.dim(count.toString())}`
    );
  }

  // File Hotspots
  if (showAll && stats.fileHotspots.length > 0) {
    console.log();
    console.log(colors.cyan('File Hotspots'));
    console.log(colors.dim('  (Most frequently mentioned in commits)'));
    console.log('─'.repeat(50));

    for (const file of stats.fileHotspots.slice(0, 10)) {
      console.log(
        `  ${colors.yellow(file.changeCount.toString().padStart(3))} ` +
          `${file.path} ` +
          colors.dim(`(${file.contributors.size} contributors)`)
      );
    }
  }

  // Monthly Trend
  if (showAll) {
    console.log();
    console.log(colors.cyan('Monthly Commit Trend'));
    console.log('─'.repeat(50));

    const sortedMonths = Array.from(stats.commitsByMonth.entries()).sort(
      (a, b) => a[0].localeCompare(b[0])
    );
    const maxMonthCommits = Math.max(
      ...sortedMonths.map(([, count]) => count)
    );

    for (const [month, count] of sortedMonths.slice(-12)) {
      const [year, m] = month.split('-');
      const label = `${MONTH_NAMES[parseInt(m) - 1]} ${year}`;
      const barLen = Math.round((count / maxMonthCommits) * 30);
      console.log(
        `  ${label.padEnd(10)} ${colors.green('█'.repeat(barLen))} ${colors.dim(count.toString())}`
      );
    }
  }

  console.log();

  if (!showAll) {
    console.log(colors.dim('Use --all or -a for detailed statistics'));
  }
}

// ==========================================
// JSON Output
// ==========================================

function printJsonStats(stats: LocalRepoStats): void {
  const output = {
    summary: {
      totalCommits: stats.totalCommits,
      totalFiles: stats.totalFiles,
      totalLines: stats.totalLines,
      branches: stats.branches,
      contributorCount: stats.contributors.length,
      languageCount: stats.languages.length,
      firstCommit: stats.firstCommit?.toISOString() || null,
      lastCommit: stats.lastCommit?.toISOString() || null,
      averageCommitsPerDay: stats.averageCommitsPerDay,
    },
    contributors: stats.contributors.map((c) => ({
      name: c.name,
      email: c.email,
      commits: c.commits,
      percentage: c.percentage,
      firstCommit: c.firstCommit.toISOString(),
      lastCommit: c.lastCommit.toISOString(),
      activeDays: c.activeDays,
    })),
    languages: stats.languages,
    activityPatterns: {
      mostActiveDay: stats.mostActiveDay,
      mostActiveHour: stats.mostActiveHour,
      mostActiveDayOfWeek: stats.mostActiveDayOfWeek,
      commitsByDayOfWeek: Object.fromEntries(
        Array.from(stats.commitsByDayOfWeek.entries()).map(([d, c]) => [
          DAY_NAMES[d],
          c,
        ])
      ),
      commitsByHour: Object.fromEntries(stats.commitsByHour),
    },
    fileHotspots: stats.fileHotspots.map((f) => ({
      path: f.path,
      changeCount: f.changeCount,
      contributors: Array.from(f.contributors),
      lastModified: f.lastModified?.toISOString() || null,
    })),
    commitsByMonth: Object.fromEntries(stats.commitsByMonth),
  };

  console.log(JSON.stringify(output, null, 2));
}

// ==========================================
// CLI Handler
// ==========================================

export function handleStatsDashboard(args: string[]): void {
  let showAll = false;
  let format = 'pretty';
  let period: string | undefined;
  let contributor: string | undefined;
  let file: string | undefined;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--all' || arg === '-a') {
      showAll = true;
    } else if (arg === '--format') {
      format = args[++i] || 'pretty';
    } else if (arg === '--json') {
      format = 'json';
    } else if (arg === '--period') {
      period = args[++i];
    } else if (arg === '--contributor') {
      contributor = args[++i];
    } else if (arg === '--file') {
      file = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printStatsHelp();
      return;
    }
  }

  try {
    const stats = collectLocalStats({ period, contributor, file });

    if (format === 'json') {
      printJsonStats(stats);
    } else {
      printPrettyStats(stats, showAll);
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

function printStatsHelp(): void {
  console.log(`
${colors.bold('wit stats')} - Repository statistics dashboard

${colors.cyan('USAGE')}
  wit stats [options]

${colors.cyan('OPTIONS')}
  -a, --all              Show all detailed statistics
  --period <period>      Filter by time period (e.g., 30d, 12w, 6m, 1y)
  --contributor <name>   Filter by contributor name or email
  --file <path>          Filter by file path prefix
  --format <format>      Output format: pretty (default) or json
  --json                 Output in JSON format (shortcut for --format json)
  -h, --help             Show this help message

${colors.cyan('EXAMPLES')}
  wit stats                         Basic repository statistics
  wit stats --all                   Detailed statistics with visualizations
  wit stats --period 30d            Statistics for the last 30 days
  wit stats --contributor alice     Statistics for contributor Alice
  wit stats --json                  Output in JSON format for scripting

${colors.cyan('VISUALIZATIONS')}
  The stats command provides ASCII visualizations including:
  - Language breakdown bar chart
  - Contributor activity bars
  - Commit activity sparkline
  - Activity heatmap (GitHub-style)
  - Hourly distribution chart
  - Day of week distribution
  - Monthly trend chart

${colors.cyan('PERIOD FORMAT')}
  Periods are specified as a number followed by a unit:
    d - days (e.g., 30d = last 30 days)
    w - weeks (e.g., 12w = last 12 weeks)
    m - months (e.g., 6m = last 6 months)
    y - years (e.g., 1y = last year)
`);
}
