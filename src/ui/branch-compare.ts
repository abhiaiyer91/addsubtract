/**
 * Branch Comparison View for wit
 * Compare branches visually with commit differences
 */

import { Repository } from '../core/repository';
import { Commit } from '../core/object';

/**
 * Branch comparison result
 */
export interface BranchComparison {
  base: string;
  compare: string;
  ahead: Commit[];
  behind: Commit[];
  commonAncestor: string | null;
  canMerge: boolean;
  hasConflicts: boolean;
  changedFiles: {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
  }[];
}

/**
 * Compare two branches
 */
export function compareBranches(repo: Repository, base: string, compare: string): BranchComparison {
  const result: BranchComparison = {
    base,
    compare,
    ahead: [],
    behind: [],
    commonAncestor: null,
    canMerge: true,
    hasConflicts: false,
    changedFiles: [],
  };

  try {
    const baseHash = repo.refs.resolve(`refs/heads/${base}`) || repo.refs.resolve(base);
    const compareHash = repo.refs.resolve(`refs/heads/${compare}`) || repo.refs.resolve(compare);

    if (!baseHash || !compareHash) {
      return result;
    }

    // Find commits ahead (in compare but not in base)
    const baseCommits = new Set<string>();
    collectCommitHashes(repo, baseHash, baseCommits, 100);

    const compareCommits: Commit[] = [];
    collectCommits(repo, compareHash, compareCommits, 100);

    // Commits in compare but not in base (ahead)
    for (const commit of compareCommits) {
      if (!baseCommits.has(commit.hash())) {
        result.ahead.push(commit);
      } else {
        result.commonAncestor = commit.hash();
        break;
      }
    }

    // Commits in base but not in compare (behind)
    const compareCommitHashes = new Set(compareCommits.map(c => c.hash()));
    const baseCommitsList: Commit[] = [];
    collectCommits(repo, baseHash, baseCommitsList, 100);

    for (const commit of baseCommitsList) {
      if (!compareCommitHashes.has(commit.hash())) {
        result.behind.push(commit);
      } else if (!result.commonAncestor) {
        result.commonAncestor = commit.hash();
        break;
      }
    }

    // Check for merge conflicts (simplified)
    result.canMerge = result.ahead.length > 0 || result.behind.length > 0;

  } catch {
    // Return empty comparison on error
  }

  return result;
}

/**
 * Collect commit hashes into a set
 */
function collectCommitHashes(repo: Repository, startHash: string, hashes: Set<string>, limit: number): void {
  const queue = [startHash];
  
  while (queue.length > 0 && hashes.size < limit) {
    const hash = queue.shift()!;
    if (hashes.has(hash)) continue;

    try {
      const commit = repo.objects.readCommit(hash);
      hashes.add(hash);
      queue.push(...commit.parentHashes);
    } catch {
      break;
    }
  }
}

/**
 * Collect commits into an array
 */
function collectCommits(repo: Repository, startHash: string, commits: Commit[], limit: number): void {
  const seen = new Set<string>();
  const queue = [startHash];
  
  while (queue.length > 0 && commits.length < limit) {
    const hash = queue.shift()!;
    if (seen.has(hash)) continue;
    seen.add(hash);

    try {
      const commit = repo.objects.readCommit(hash);
      commits.push(commit);
      queue.push(...commit.parentHashes);
    } catch {
      break;
    }
  }
}

/**
 * Render branch comparison HTML
 */
export function renderBranchComparisonHTML(comparison: BranchComparison): string {
  const totalAhead = comparison.ahead.length;
  const totalBehind = comparison.behind.length;

  return `
    <div class="branch-compare">
      <div class="branch-compare-header">
        <div class="branch-compare-selector">
          <span class="branch-compare-branch base">
            <span class="branch-icon">🌿</span>
            ${escapeHtml(comparison.base)}
          </span>
          <span class="branch-compare-arrow">←</span>
          <span class="branch-compare-branch compare">
            <span class="branch-icon">🌿</span>
            ${escapeHtml(comparison.compare)}
          </span>
        </div>
        <div class="branch-compare-summary">
          ${totalAhead > 0 ? `
            <span class="branch-compare-stat ahead">
              <span class="stat-icon">↑</span>
              ${totalAhead} commit${totalAhead !== 1 ? 's' : ''} ahead
            </span>
          ` : ''}
          ${totalBehind > 0 ? `
            <span class="branch-compare-stat behind">
              <span class="stat-icon">↓</span>
              ${totalBehind} commit${totalBehind !== 1 ? 's' : ''} behind
            </span>
          ` : ''}
          ${totalAhead === 0 && totalBehind === 0 ? `
            <span class="branch-compare-stat equal">
              <span class="stat-icon">✓</span>
              Branches are identical
            </span>
          ` : ''}
        </div>
      </div>

      ${comparison.canMerge && totalAhead > 0 ? `
        <div class="branch-compare-actions">
          <button class="btn btn-primary" onclick="createPullRequest()">
            🔀 Create Pull Request
          </button>
          <button class="btn btn-secondary" onclick="mergeBranches()">
            ↪ Merge
          </button>
        </div>
      ` : ''}

      <div class="branch-compare-visualization">
        ${renderBranchVisualization(comparison)}
      </div>

      ${totalAhead > 0 ? `
        <div class="branch-compare-section">
          <h3 class="section-title">
            <span class="section-icon ahead">↑</span>
            Commits in ${escapeHtml(comparison.compare)} but not in ${escapeHtml(comparison.base)}
          </h3>
          <div class="commit-list">
            ${comparison.ahead.map(renderCommitHTML).join('')}
          </div>
        </div>
      ` : ''}

      ${totalBehind > 0 ? `
        <div class="branch-compare-section">
          <h3 class="section-title">
            <span class="section-icon behind">↓</span>
            Commits in ${escapeHtml(comparison.base)} but not in ${escapeHtml(comparison.compare)}
          </h3>
          <div class="commit-list">
            ${comparison.behind.map(renderCommitHTML).join('')}
          </div>
        </div>
      ` : ''}

      ${comparison.changedFiles.length > 0 ? `
        <div class="branch-compare-section">
          <h3 class="section-title">
            <span class="section-icon">📁</span>
            Changed Files (${comparison.changedFiles.length})
          </h3>
          <div class="file-changes-list">
            ${comparison.changedFiles.map(renderFileChangeHTML).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render branch visualization
 */
function renderBranchVisualization(comparison: BranchComparison): string {
  const { ahead, behind, base, compare } = comparison;
  const totalAhead = ahead.length;
  const totalBehind = behind.length;
  const maxDots = 5;

  if (totalAhead === 0 && totalBehind === 0) {
    return `
      <div class="branch-viz identical">
        <div class="branch-viz-line">
          <span class="branch-viz-label">${escapeHtml(base)}</span>
          <div class="branch-viz-dots">
            <span class="branch-viz-dot current">●</span>
          </div>
          <span class="branch-viz-label">${escapeHtml(compare)}</span>
        </div>
        <div class="branch-viz-message">Branches point to the same commit</div>
      </div>
    `;
  }

  return `
    <div class="branch-viz">
      <div class="branch-viz-row base">
        <span class="branch-viz-label">${escapeHtml(base)}</span>
        <div class="branch-viz-line">
          <span class="branch-viz-dot current">●</span>
          ${totalBehind > 0 ? `
            ${Array(Math.min(totalBehind, maxDots)).fill(0).map(() => '<span class="branch-viz-dot behind">●</span>').join('')}
            ${totalBehind > maxDots ? `<span class="branch-viz-more">+${totalBehind - maxDots}</span>` : ''}
          ` : ''}
        </div>
      </div>
      <div class="branch-viz-connector">
        <svg height="30" width="100%">
          <path d="M 50% 0 L 50% 30" stroke="var(--border-default)" stroke-width="2" fill="none"/>
        </svg>
      </div>
      <div class="branch-viz-row compare">
        <span class="branch-viz-label">${escapeHtml(compare)}</span>
        <div class="branch-viz-line">
          <span class="branch-viz-dot current">●</span>
          ${totalAhead > 0 ? `
            ${Array(Math.min(totalAhead, maxDots)).fill(0).map(() => '<span class="branch-viz-dot ahead">●</span>').join('')}
            ${totalAhead > maxDots ? `<span class="branch-viz-more">+${totalAhead - maxDots}</span>` : ''}
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render a commit item
 */
function renderCommitHTML(commit: Commit): string {
  const hash = commit.hash();
  const message = commit.message.split('\n')[0];
  const date = new Date(commit.author.timestamp * 1000);

  return `
    <div class="commit-item" data-hash="${hash}">
      <div class="commit-item-main">
        <span class="commit-item-hash">${hash.slice(0, 8)}</span>
        <span class="commit-item-message">${escapeHtml(message)}</span>
      </div>
      <div class="commit-item-meta">
        <span class="commit-item-author">${escapeHtml(commit.author.name)}</span>
        <span class="commit-item-date">${formatRelativeDate(date)}</span>
      </div>
    </div>
  `;
}

/**
 * Render a file change item
 */
function renderFileChangeHTML(file: { path: string; status: string; additions: number; deletions: number }): string {
  const statusIcons: Record<string, string> = {
    added: '+',
    modified: '~',
    deleted: '-',
    renamed: '→',
  };

  return `
    <div class="file-change-item ${file.status}">
      <span class="file-change-status">${statusIcons[file.status] || '?'}</span>
      <span class="file-change-path">${escapeHtml(file.path)}</span>
      <div class="file-change-stats">
        ${file.additions > 0 ? `<span class="additions">+${file.additions}</span>` : ''}
        ${file.deletions > 0 ? `<span class="deletions">-${file.deletions}</span>` : ''}
      </div>
    </div>
  `;
}

/**
 * Format relative date
 */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
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
 * Get branch comparison CSS
 */
export function getBranchCompareStyles(): string {
  return `
    .branch-compare {
      background: var(--bg-secondary);
      border-radius: var(--border-radius-lg);
      overflow: hidden;
    }

    .branch-compare-header {
      padding: var(--spacing-lg);
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-default);
    }

    .branch-compare-selector {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .branch-compare-branch {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      font-weight: 500;
    }

    .branch-compare-branch.base {
      color: var(--accent-primary);
    }

    .branch-compare-branch.compare {
      color: var(--accent-success);
    }

    .branch-icon {
      font-size: 14px;
    }

    .branch-compare-arrow {
      font-size: 20px;
      color: var(--text-muted);
    }

    .branch-compare-summary {
      display: flex;
      gap: var(--spacing-lg);
    }

    .branch-compare-stat {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      font-size: var(--font-size-sm);
    }

    .branch-compare-stat.ahead {
      color: var(--accent-success);
    }

    .branch-compare-stat.behind {
      color: var(--accent-warning);
    }

    .branch-compare-stat.equal {
      color: var(--text-secondary);
    }

    .stat-icon {
      font-weight: 700;
    }

    .branch-compare-actions {
      display: flex;
      gap: var(--spacing-md);
      padding: var(--spacing-md) var(--spacing-lg);
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-default);
    }

    .branch-compare-visualization {
      padding: var(--spacing-lg);
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border-default);
    }

    .branch-viz {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .branch-viz-row {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      width: 100%;
      max-width: 600px;
    }

    .branch-viz-label {
      width: 120px;
      font-size: var(--font-size-sm);
      font-weight: 500;
      text-align: right;
    }

    .branch-viz-line {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      height: 24px;
      background: var(--bg-tertiary);
      border-radius: var(--border-radius-full);
      padding: 0 var(--spacing-sm);
    }

    .branch-viz-dot {
      width: 10px;
      height: 10px;
      font-size: 10px;
      line-height: 1;
    }

    .branch-viz-dot.current {
      color: var(--accent-primary);
    }

    .branch-viz-dot.ahead {
      color: var(--accent-success);
    }

    .branch-viz-dot.behind {
      color: var(--accent-warning);
    }

    .branch-viz-more {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .branch-viz-connector {
      height: 30px;
      overflow: hidden;
    }

    .branch-viz.identical {
      text-align: center;
    }

    .branch-viz-message {
      margin-top: var(--spacing-sm);
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
    }

    .branch-compare-section {
      padding: var(--spacing-lg);
      border-bottom: 1px solid var(--border-default);
    }

    .branch-compare-section:last-child {
      border-bottom: none;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin: 0 0 var(--spacing-md);
      font-size: var(--font-size-base);
      font-weight: 600;
      color: var(--text-primary);
    }

    .section-icon {
      font-size: var(--font-size-lg);
    }

    .section-icon.ahead {
      color: var(--accent-success);
    }

    .section-icon.behind {
      color: var(--accent-warning);
    }

    .commit-list {
      display: flex;
      flex-direction: column;
    }

    .commit-item {
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--border-radius);
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .commit-item:hover {
      background: var(--bg-tertiary);
    }

    .commit-item-main {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .commit-item-hash {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-sm);
      color: var(--accent-primary);
    }

    .commit-item-message {
      flex: 1;
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .commit-item-meta {
      display: flex;
      gap: var(--spacing-md);
      margin-top: 2px;
      padding-left: calc(var(--spacing-md) + 70px);
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .file-changes-list {
      display: flex;
      flex-direction: column;
    }

    .file-change-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-xs) var(--spacing-sm);
      border-radius: var(--border-radius);
    }

    .file-change-item:hover {
      background: var(--bg-tertiary);
    }

    .file-change-status {
      width: 20px;
      text-align: center;
      font-weight: 600;
    }

    .file-change-item.added .file-change-status { color: var(--git-added); }
    .file-change-item.modified .file-change-status { color: var(--git-modified); }
    .file-change-item.deleted .file-change-status { color: var(--git-deleted); }
    .file-change-item.renamed .file-change-status { color: var(--git-renamed); }

    .file-change-path {
      flex: 1;
      font-family: var(--font-family-mono);
      font-size: var(--font-size-sm);
      color: var(--text-primary);
    }

    .file-change-stats {
      display: flex;
      gap: var(--spacing-sm);
      font-family: var(--font-family-mono);
      font-size: var(--font-size-xs);
    }

    .additions { color: var(--git-added); }
    .deletions { color: var(--git-deleted); }
  `;
}

/**
 * Branch comparison component
 */
export class BranchComparer {
  private repo: Repository;
  private container: HTMLElement | null = null;
  private comparison: BranchComparison | null = null;

  constructor(repo: Repository) {
    this.repo = repo;
  }

  /**
   * Mount to container
   */
  mount(container: HTMLElement): void {
    this.container = container;
  }

  /**
   * Compare two branches
   */
  compare(base: string, compare: string): void {
    this.comparison = compareBranches(this.repo, base, compare);
    this.render();
  }

  /**
   * Render the UI
   */
  private render(): void {
    if (!this.container || !this.comparison) return;
    this.container.innerHTML = renderBranchComparisonHTML(this.comparison);
  }
}
