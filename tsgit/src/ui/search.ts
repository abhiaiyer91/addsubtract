/**
 * Search Functionality
 * Search commits, files, and content
 */

import { Repository } from '../core/repository';
import { Commit, Blob } from '../core/object';

/**
 * Search result types
 */
export type SearchResultType = 'commit' | 'file' | 'content';

/**
 * Base search result
 */
export interface SearchResult {
  type: SearchResultType;
  score: number;
  matchedText: string;
  highlightedText: string;
}

/**
 * Commit search result
 */
export interface CommitSearchResult extends SearchResult {
  type: 'commit';
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: Date;
}

/**
 * File search result
 */
export interface FileSearchResult extends SearchResult {
  type: 'file';
  path: string;
  filename: string;
}

/**
 * Content search result
 */
export interface ContentSearchResult extends SearchResult {
  type: 'content';
  path: string;
  lineNumber: number;
  lineContent: string;
  context: {
    before: string[];
    after: string[];
  };
}

/**
 * Combined search results
 */
export interface SearchResults {
  query: string;
  commits: CommitSearchResult[];
  files: FileSearchResult[];
  content: ContentSearchResult[];
  totalCount: number;
  searchTime: number;
}

/**
 * Search options
 */
export interface SearchOptions {
  searchCommits?: boolean;
  searchFiles?: boolean;
  searchContent?: boolean;
  caseSensitive?: boolean;
  regex?: boolean;
  maxResults?: number;
  contextLines?: number;
}

const DEFAULT_OPTIONS: SearchOptions = {
  searchCommits: true,
  searchFiles: true,
  searchContent: true,
  caseSensitive: false,
  regex: false,
  maxResults: 100,
  contextLines: 2,
};

/**
 * Search engine
 */
export class SearchEngine {
  constructor(private repo: Repository) {}

  /**
   * Perform search across the repository
   */
  search(query: string, options: SearchOptions = {}): SearchResults {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    const results: SearchResults = {
      query,
      commits: [],
      files: [],
      content: [],
      totalCount: 0,
      searchTime: 0,
    };

    if (!query.trim()) {
      return results;
    }

    // Create search pattern
    const pattern = this.createPattern(query, opts);

    // Search commits
    if (opts.searchCommits) {
      results.commits = this.searchCommits(pattern, opts);
    }

    // Search files
    if (opts.searchFiles) {
      results.files = this.searchFiles(pattern, opts);
    }

    // Search content
    if (opts.searchContent) {
      results.content = this.searchContent(pattern, opts);
    }

    results.totalCount = results.commits.length + results.files.length + results.content.length;
    results.searchTime = Date.now() - startTime;

    return results;
  }

  /**
   * Create search pattern
   */
  private createPattern(query: string, opts: SearchOptions): RegExp {
    let pattern = query;
    
    if (!opts.regex) {
      // Escape regex special characters
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const flags = opts.caseSensitive ? 'g' : 'gi';
    return new RegExp(pattern, flags);
  }

  /**
   * Search commits
   */
  private searchCommits(pattern: RegExp, opts: SearchOptions): CommitSearchResult[] {
    const results: CommitSearchResult[] = [];

    try {
      const commits = this.repo.log('HEAD', opts.maxResults || 100);

      for (const commit of commits) {
        const hash = commit.hash();
        const message = commit.message;
        const author = commit.author.name;

        // Search in message
        const messageMatch = message.match(pattern);
        if (messageMatch) {
          results.push({
            type: 'commit',
            hash,
            shortHash: hash.slice(0, 8),
            message: message.split('\n')[0],
            author,
            date: new Date(commit.author.timestamp * 1000),
            score: this.calculateScore(messageMatch[0], message),
            matchedText: messageMatch[0],
            highlightedText: this.highlightMatch(message.split('\n')[0], pattern),
          });
          continue;
        }

        // Search in author
        const authorMatch = author.match(pattern);
        if (authorMatch) {
          results.push({
            type: 'commit',
            hash,
            shortHash: hash.slice(0, 8),
            message: message.split('\n')[0],
            author,
            date: new Date(commit.author.timestamp * 1000),
            score: this.calculateScore(authorMatch[0], author),
            matchedText: authorMatch[0],
            highlightedText: this.highlightMatch(author, pattern),
          });
          continue;
        }

        // Search in hash
        if (hash.includes(pattern.source.toLowerCase())) {
          results.push({
            type: 'commit',
            hash,
            shortHash: hash.slice(0, 8),
            message: message.split('\n')[0],
            author,
            date: new Date(commit.author.timestamp * 1000),
            score: 1,
            matchedText: hash,
            highlightedText: this.highlightMatch(hash.slice(0, 8), pattern),
          });
        }
      }
    } catch {
      // No commits yet
    }

    return results.slice(0, opts.maxResults);
  }

  /**
   * Search files by name
   */
  private searchFiles(pattern: RegExp, opts: SearchOptions): FileSearchResult[] {
    const results: FileSearchResult[] = [];
    const status = this.repo.status();
    const trackedFiles = new Set([
      ...status.staged,
      ...status.modified,
      ...this.getTrackedFiles(),
    ]);

    for (const filePath of trackedFiles) {
      const filename = filePath.split('/').pop() || filePath;
      const match = filename.match(pattern) || filePath.match(pattern);

      if (match) {
        results.push({
          type: 'file',
          path: filePath,
          filename,
          score: this.calculateScore(match[0], filename),
          matchedText: match[0],
          highlightedText: this.highlightMatch(filePath, pattern),
        });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, opts.maxResults);
  }

  /**
   * Search file contents
   */
  private searchContent(pattern: RegExp, opts: SearchOptions): ContentSearchResult[] {
    const results: ContentSearchResult[] = [];
    const contextLines = opts.contextLines || 2;

    // Get tracked files
    const files = this.getTrackedFiles();

    for (const filePath of files) {
      if (results.length >= (opts.maxResults || 100)) break;

      try {
        const fullPath = require('path').join(this.repo.workDir, filePath);
        const content = require('fs').readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const match = line.match(pattern);

          if (match) {
            const before = lines.slice(Math.max(0, i - contextLines), i);
            const after = lines.slice(i + 1, i + 1 + contextLines);

            results.push({
              type: 'content',
              path: filePath,
              lineNumber: i + 1,
              lineContent: line,
              context: { before, after },
              score: this.calculateScore(match[0], line),
              matchedText: match[0],
              highlightedText: this.highlightMatch(line, pattern),
            });

            if (results.length >= (opts.maxResults || 100)) break;
          }
        }
      } catch {
        // Skip files we can't read
      }
    }

    return results;
  }

  /**
   * Get list of tracked files
   */
  private getTrackedFiles(): string[] {
    try {
      const headHash = this.repo.refs.resolve('HEAD');
      if (!headHash) return [];

      const files: string[] = [];
      const commit = this.repo.objects.readCommit(headHash);
      this.collectFiles(commit.treeHash, '', files);
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Collect files from tree
   */
  private collectFiles(treeHash: string, prefix: string, files: string[]): void {
    try {
      const tree = this.repo.objects.readTree(treeHash);

      for (const entry of tree.entries) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.mode === '40000') {
          this.collectFiles(entry.hash, fullPath, files);
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip on error
    }
  }

  /**
   * Calculate match score
   */
  private calculateScore(match: string, text: string): number {
    // Higher score for:
    // - Exact matches
    // - Matches at the start
    // - Matches of longer strings

    let score = match.length / text.length;

    if (text.toLowerCase().startsWith(match.toLowerCase())) {
      score += 0.5;
    }

    if (text === match) {
      score += 1;
    }

    return Math.min(score, 2);
  }

  /**
   * Highlight matches in text
   */
  private highlightMatch(text: string, pattern: RegExp): string {
    return text.replace(pattern, match => `<mark>${escapeHtml(match)}</mark>`);
  }
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render search results as HTML
 */
export function renderSearchResultsHTML(results: SearchResults): string {
  let html = `
    <div class="search-results">
      <div class="search-summary">
        Found ${results.totalCount} results for "${escapeHtml(results.query)}" 
        in ${results.searchTime}ms
      </div>
  `;

  // Commits
  if (results.commits.length > 0) {
    html += `<div class="result-section">
      <h3>📝 Commits (${results.commits.length})</h3>
      <ul class="result-list">`;

    for (const commit of results.commits) {
      html += `
        <li class="result-item commit-result" data-hash="${commit.hash}">
          <span class="commit-hash">${commit.shortHash}</span>
          <span class="result-text">${commit.highlightedText}</span>
          <span class="result-meta">${commit.author} • ${formatDate(commit.date)}</span>
        </li>
      `;
    }

    html += '</ul></div>';
  }

  // Files
  if (results.files.length > 0) {
    html += `<div class="result-section">
      <h3>📁 Files (${results.files.length})</h3>
      <ul class="result-list">`;

    for (const file of results.files) {
      html += `
        <li class="result-item file-result" data-path="${file.path}">
          <span class="file-icon">📄</span>
          <span class="result-text">${file.highlightedText}</span>
        </li>
      `;
    }

    html += '</ul></div>';
  }

  // Content
  if (results.content.length > 0) {
    html += `<div class="result-section">
      <h3>📃 Content (${results.content.length})</h3>
      <ul class="result-list">`;

    for (const content of results.content) {
      html += `
        <li class="result-item content-result" data-path="${content.path}" data-line="${content.lineNumber}">
          <div class="content-path">${content.path}:${content.lineNumber}</div>
          <div class="content-preview">
            ${content.context.before.map(l => `<div class="context-line">${escapeHtml(l)}</div>`).join('')}
            <div class="match-line">${content.highlightedText}</div>
            ${content.context.after.map(l => `<div class="context-line">${escapeHtml(l)}</div>`).join('')}
          </div>
        </li>
      `;
    }

    html += '</ul></div>';
  }

  if (results.totalCount === 0) {
    html += '<div class="no-results">No results found</div>';
  }

  html += '</div>';
  return html;
}

/**
 * Format date
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

/**
 * Get CSS styles for search
 */
export function getSearchStyles(): string {
  return `
    .search-container {
      background: var(--bg-secondary);
      border-radius: 8px;
      overflow: hidden;
    }

    .search-input-wrapper {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .search-input {
      flex: 1;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px 14px;
      color: var(--text-primary);
      font-size: 14px;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent-blue);
    }

    .search-options {
      display: flex;
      gap: 12px;
      margin-left: 12px;
    }

    .search-option {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--text-secondary);
      font-size: 12px;
    }

    .search-results {
      max-height: 500px;
      overflow-y: auto;
    }

    .search-summary {
      padding: 12px 16px;
      color: var(--text-secondary);
      font-size: 13px;
      border-bottom: 1px solid var(--border-color);
    }

    .result-section {
      padding: 12px 0;
    }

    .result-section h3 {
      padding: 0 16px 8px;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--text-secondary);
      font-weight: 600;
    }

    .result-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .result-item {
      padding: 8px 16px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .result-item:hover {
      background: var(--bg-tertiary);
    }

    .commit-hash {
      font-family: monospace;
      color: var(--accent-blue);
      margin-right: 8px;
    }

    .result-text {
      color: var(--text-primary);
    }

    .result-text mark {
      background: rgba(210, 153, 34, 0.3);
      color: var(--accent-yellow);
      padding: 1px 2px;
      border-radius: 2px;
    }

    .result-meta {
      color: var(--text-secondary);
      font-size: 12px;
      margin-left: 8px;
    }

    .content-path {
      color: var(--accent-blue);
      font-family: monospace;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .content-preview {
      background: var(--bg-tertiary);
      border-radius: 4px;
      padding: 8px;
      font-family: monospace;
      font-size: 12px;
      overflow-x: auto;
    }

    .context-line {
      color: var(--text-secondary);
    }

    .match-line {
      color: var(--text-primary);
      background: rgba(210, 153, 34, 0.1);
    }

    .no-results {
      padding: 40px;
      text-align: center;
      color: var(--text-secondary);
    }
  `;
}
