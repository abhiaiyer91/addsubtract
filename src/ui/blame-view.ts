/**
 * Interactive Blame View for wit
 * Shows line-by-line commit information with rich visualizations
 */

import { Repository } from '../core/repository';
import { Commit } from '../core/object';
import { highlightCode, detectLanguage } from './diff-viewer';

/**
 * Blame line information
 */
export interface BlameLine {
  lineNumber: number;
  content: string;
  commitHash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: Date;
  message: string;
  isFirstLine: boolean; // First line of a commit block
}

/**
 * Blame result
 */
export interface BlameResult {
  filename: string;
  lines: BlameLine[];
  commits: Map<string, Commit>;
  authors: Map<string, { name: string; email: string; lineCount: number }>;
}

/**
 * Parse blame output from git
 */
export function parseBlame(blameOutput: string, filename: string): BlameResult {
  const lines: BlameLine[] = [];
  const commits = new Map<string, Commit>();
  const authors = new Map<string, { name: string; email: string; lineCount: number }>();

  // This would be populated by actual blame command output
  // For now, return empty result as placeholder
  return {
    filename,
    lines,
    commits,
    authors,
  };
}

/**
 * Generate blame data for a file
 */
export function generateBlame(repo: Repository, filename: string): BlameResult {
  const lines: BlameLine[] = [];
  const commits = new Map<string, Commit>();
  const authors = new Map<string, { name: string; email: string; lineCount: number }>();

  try {
    // Read file content
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.join(repo.workDir, filename);
    const content = fs.readFileSync(fullPath, 'utf8');
    const fileLines = content.split('\n');

    // Get HEAD commit
    const headHash = repo.refs.resolve('HEAD');
    if (!headHash) {
      // No commits yet, just show lines without blame
      return createUncommittedBlame(filename, fileLines);
    }

    // Get commit history to find when each line was last modified
    const commitLog = repo.log('HEAD', 100);
    const lastCommit = commitLog[0];

    if (!lastCommit) {
      return createUncommittedBlame(filename, fileLines);
    }

    // For simplicity, attribute all lines to the last commit that touched the file
    // A full implementation would track line-by-line history
    const hash = lastCommit.hash();
    commits.set(hash, lastCommit);

    const authorKey = lastCommit.author.email;
    if (!authors.has(authorKey)) {
      authors.set(authorKey, {
        name: lastCommit.author.name,
        email: lastCommit.author.email,
        lineCount: 0,
      });
    }

    for (let i = 0; i < fileLines.length; i++) {
      lines.push({
        lineNumber: i + 1,
        content: fileLines[i],
        commitHash: hash,
        shortHash: hash.slice(0, 8),
        author: lastCommit.author.name,
        authorEmail: lastCommit.author.email,
        date: new Date(lastCommit.author.timestamp * 1000),
        message: lastCommit.message.split('\n')[0],
        isFirstLine: i === 0,
      });

      const author = authors.get(authorKey)!;
      author.lineCount++;
    }
  } catch {
    // Return empty result on error
  }

  return {
    filename,
    lines,
    commits,
    authors,
  };
}

/**
 * Create blame result for uncommitted file
 */
function createUncommittedBlame(filename: string, fileLines: string[]): BlameResult {
  const lines: BlameLine[] = fileLines.map((content, i) => ({
    lineNumber: i + 1,
    content,
    commitHash: 'uncommitted',
    shortHash: 'uncommit',
    author: 'Not Committed Yet',
    authorEmail: '',
    date: new Date(),
    message: 'Uncommitted changes',
    isFirstLine: i === 0,
  }));

  return {
    filename,
    lines,
    commits: new Map(),
    authors: new Map(),
  };
}

/**
 * Get unique color for an author
 */
export function getAuthorColor(author: string, allAuthors: string[]): string {
  const colors = [
    '#58a6ff', '#3fb950', '#f85149', '#a371f7',
    '#d29922', '#f778ba', '#79c0ff', '#7ee787',
    '#ff7b72', '#ffa657', '#d2a8ff', '#8b949e',
  ];

  const index = allAuthors.indexOf(author);
  return colors[index % colors.length];
}

/**
 * Format relative date
 */
export function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'just now' : `${diffMins} mins ago`;
    }
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(diffDays / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * Render blame view as HTML
 */
export function renderBlameHTML(blame: BlameResult): string {
  if (blame.lines.length === 0) {
    return `
      <div class="blame-empty">
        <div class="blame-empty-icon">📄</div>
        <p>No blame data available</p>
      </div>
    `;
  }

  const language = detectLanguage(blame.filename);
  const allAuthors = Array.from(blame.authors.keys());
  
  // Group consecutive lines by commit
  const blocks: { startLine: number; endLine: number; lines: BlameLine[] }[] = [];
  let currentBlock: BlameLine[] = [];
  let currentHash = '';

  for (const line of blame.lines) {
    if (line.commitHash !== currentHash) {
      if (currentBlock.length > 0) {
        blocks.push({
          startLine: currentBlock[0].lineNumber,
          endLine: currentBlock[currentBlock.length - 1].lineNumber,
          lines: currentBlock,
        });
      }
      currentBlock = [line];
      currentHash = line.commitHash;
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push({
      startLine: currentBlock[0].lineNumber,
      endLine: currentBlock[currentBlock.length - 1].lineNumber,
      lines: currentBlock,
    });
  }

  let html = `
    <div class="blame-container">
      <div class="blame-header">
        <h3 class="blame-filename">📄 ${escapeHtml(blame.filename)}</h3>
        <div class="blame-stats">
          <span>${blame.lines.length} lines</span>
          <span>${blame.authors.size} contributors</span>
          <span>${blame.commits.size} commits</span>
        </div>
      </div>
      <div class="blame-authors">
        ${Array.from(blame.authors.entries()).map(([email, author]) => `
          <div class="blame-author-badge" style="--author-color: ${getAuthorColor(email, allAuthors)}">
            <span class="blame-author-avatar">${getInitials(author.name)}</span>
            <span class="blame-author-name">${escapeHtml(author.name)}</span>
            <span class="blame-author-lines">${author.lineCount} lines</span>
          </div>
        `).join('')}
      </div>
      <div class="blame-content">
        <table class="blame-table">
  `;

  for (const block of blocks) {
    const firstLine = block.lines[0];
    const color = getAuthorColor(firstLine.authorEmail, allAuthors);
    const rowspan = block.lines.length;

    html += `
      <tr class="blame-block-start" data-commit="${firstLine.commitHash}">
        <td class="blame-info" rowspan="${rowspan}" style="--commit-color: ${color}">
          <div class="blame-commit-info">
            <div class="blame-commit-hash">${firstLine.shortHash}</div>
            <div class="blame-commit-author">${escapeHtml(firstLine.author)}</div>
            <div class="blame-commit-date">${formatRelativeDate(firstLine.date)}</div>
            <div class="blame-commit-message" title="${escapeHtml(firstLine.message)}">
              ${escapeHtml(truncate(firstLine.message, 30))}
            </div>
          </div>
        </td>
        <td class="blame-line-num">${firstLine.lineNumber}</td>
        <td class="blame-line-content">
          <code>${highlightCode(firstLine.content || ' ', language)}</code>
        </td>
      </tr>
    `;

    for (let i = 1; i < block.lines.length; i++) {
      const line = block.lines[i];
      html += `
        <tr class="blame-line" data-commit="${line.commitHash}">
          <td class="blame-line-num">${line.lineNumber}</td>
          <td class="blame-line-content">
            <code>${highlightCode(line.content || ' ', language)}</code>
          </td>
        </tr>
      `;
    }
  }

  html += `
        </table>
      </div>
    </div>
  `;

  return html;
}

/**
 * Get initials from a name
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Truncate text
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Get blame view CSS styles
 */
export function getBlameStyles(): string {
  return `
    .blame-container {
      background: var(--bg-primary);
      font-family: var(--font-family);
    }

    .blame-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-default);
    }

    .blame-filename {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .blame-stats {
      display: flex;
      gap: var(--spacing-md);
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
    }

    .blame-authors {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-default);
    }

    .blame-author-badge {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs) var(--spacing-sm);
      background: var(--bg-tertiary);
      border-radius: var(--border-radius-full);
      font-size: var(--font-size-sm);
      border-left: 3px solid var(--author-color);
    }

    .blame-author-avatar {
      width: 20px;
      height: 20px;
      background: var(--author-color);
      color: var(--text-inverse);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
    }

    .blame-author-name {
      color: var(--text-primary);
    }

    .blame-author-lines {
      color: var(--text-muted);
      font-size: var(--font-size-xs);
    }

    .blame-content {
      overflow-x: auto;
    }

    .blame-table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--font-family-mono);
      font-size: var(--font-size-sm);
    }

    .blame-table tr {
      transition: background var(--transition-fast);
    }

    .blame-table tr:hover {
      background: var(--bg-tertiary);
    }

    .blame-info {
      width: 200px;
      min-width: 200px;
      vertical-align: top;
      padding: var(--spacing-sm);
      background: var(--bg-secondary);
      border-left: 3px solid var(--commit-color);
      border-bottom: 1px solid var(--border-default);
    }

    .blame-commit-info {
      position: sticky;
      top: 0;
    }

    .blame-commit-hash {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-xs);
      color: var(--accent-primary);
      font-weight: 500;
    }

    .blame-commit-author {
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      font-weight: 500;
      margin-top: 2px;
    }

    .blame-commit-date {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .blame-commit-message {
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .blame-line-num {
      width: 50px;
      min-width: 50px;
      padding: 0 var(--spacing-sm);
      text-align: right;
      color: var(--text-muted);
      user-select: none;
      border-bottom: 1px solid var(--border-default);
    }

    .blame-line-content {
      padding: 0 var(--spacing-md);
      white-space: pre;
      color: var(--text-primary);
      border-bottom: 1px solid var(--border-default);
    }

    .blame-line-content code {
      font-family: inherit;
      font-size: inherit;
    }

    .blame-empty {
      text-align: center;
      padding: var(--spacing-xxl);
      color: var(--text-secondary);
    }

    .blame-empty-icon {
      font-size: 48px;
      margin-bottom: var(--spacing-md);
      opacity: 0.5;
    }

    /* Commit popup on hover */
    .blame-block-start:hover .blame-info {
      z-index: 10;
    }

    /* Syntax highlighting already applied via highlightCode */
  `;
}

/**
 * Blame view component (for integration)
 */
export class BlameViewer {
  private repo: Repository;
  private container: HTMLElement | null = null;

  constructor(repo: Repository) {
    this.repo = repo;
  }

  /**
   * Mount the blame viewer to a container
   */
  mount(container: HTMLElement): void {
    this.container = container;
  }

  /**
   * Show blame for a file
   */
  show(filename: string): void {
    if (!this.container) return;

    const blame = generateBlame(this.repo, filename);
    this.container.innerHTML = renderBlameHTML(blame);

    // Add click handlers for commits
    this.container.querySelectorAll('[data-commit]').forEach(el => {
      el.addEventListener('click', () => {
        const hash = (el as HTMLElement).dataset.commit;
        if (hash && hash !== 'uncommitted') {
          this.onCommitClick(hash);
        }
      });
    });
  }

  /**
   * Handle commit click
   */
  private onCommitClick(hash: string): void {
    // Emit event or callback for showing commit details
    const event = new CustomEvent('commit-selected', { detail: { hash } });
    this.container?.dispatchEvent(event);
  }
}
