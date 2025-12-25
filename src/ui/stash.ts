/**
 * Stash Management UI for wit
 * Visual stash list with quick actions
 */

import { Repository } from '../core/repository';

/**
 * Stash entry
 */
export interface StashEntry {
  id: number;
  message: string;
  branch: string;
  date: Date;
  hash: string;
  files: string[];
}

/**
 * Get stash list (mock implementation - would be backed by actual stash functionality)
 */
export function getStashList(repo: Repository): StashEntry[] {
  // This would be implemented with actual stash support
  // For now, return empty array as placeholder
  return [];
}

/**
 * Render stash list HTML
 */
export function renderStashListHTML(stashes: StashEntry[]): string {
  if (stashes.length === 0) {
    return `
      <div class="stash-empty">
        <div class="stash-empty-icon">📦</div>
        <h3>No Stashes</h3>
        <p>Your stash is empty. Stash changes to save them for later.</p>
        <button class="btn btn-primary" onclick="createStash()">
          📦 Stash Current Changes
        </button>
      </div>
    `;
  }

  return `
    <div class="stash-container">
      <div class="stash-header">
        <h3>📦 Stash List</h3>
        <button class="btn btn-primary" onclick="createStash()">
          + New Stash
        </button>
      </div>
      <div class="stash-list">
        ${stashes.map((stash, index) => renderStashEntryHTML(stash, index)).join('')}
      </div>
    </div>
  `;
}

/**
 * Render a single stash entry
 */
function renderStashEntryHTML(stash: StashEntry, index: number): string {
  return `
    <div class="stash-entry" data-stash="${stash.id}">
      <div class="stash-entry-header">
        <span class="stash-entry-id">stash@{${index}}</span>
        <span class="stash-entry-branch">on ${escapeHtml(stash.branch)}</span>
        <span class="stash-entry-date">${formatRelativeDate(stash.date)}</span>
      </div>
      <div class="stash-entry-message">${escapeHtml(stash.message)}</div>
      <div class="stash-entry-files">
        <span class="stash-entry-file-count">${stash.files.length} files</span>
        <div class="stash-entry-file-list collapsed">
          ${stash.files.slice(0, 5).map(f => `<span class="stash-file">${escapeHtml(f)}</span>`).join('')}
          ${stash.files.length > 5 ? `<span class="stash-file-more">+${stash.files.length - 5} more</span>` : ''}
        </div>
      </div>
      <div class="stash-entry-actions">
        <button class="btn btn-primary btn-sm" onclick="applyStash(${stash.id})">
          Apply
        </button>
        <button class="btn btn-secondary btn-sm" onclick="popStash(${stash.id})">
          Pop
        </button>
        <button class="btn btn-secondary btn-sm" onclick="viewStash(${stash.id})">
          View
        </button>
        <button class="btn btn-danger btn-sm" onclick="dropStash(${stash.id})">
          Drop
        </button>
      </div>
    </div>
  `;
}

/**
 * Render stash creation modal
 */
export function renderStashCreateModalHTML(): string {
  return `
    <div class="modal-overlay" id="stash-modal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">📦 Create Stash</span>
          <button class="modal-close" onclick="closeStashModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Stash Message (optional)</label>
            <input type="text" id="stash-message" placeholder="WIP: work in progress...">
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="stash-include-untracked">
              Include untracked files
            </label>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="stash-keep-index">
              Keep staged changes in index
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeStashModal()">Cancel</button>
          <button class="btn btn-primary" onclick="confirmCreateStash()">Create Stash</button>
        </div>
      </div>
    </div>
  `;
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
 * Get stash CSS styles
 */
export function getStashStyles(): string {
  return `
    .stash-container {
      background: var(--bg-secondary);
      border-radius: var(--border-radius-lg);
      overflow: hidden;
    }

    .stash-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md) var(--spacing-lg);
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-default);
    }

    .stash-header h3 {
      margin: 0;
      font-size: var(--font-size-lg);
      color: var(--text-primary);
    }

    .stash-list {
      display: flex;
      flex-direction: column;
    }

    .stash-entry {
      padding: var(--spacing-md) var(--spacing-lg);
      border-bottom: 1px solid var(--border-default);
      transition: background var(--transition-fast);
    }

    .stash-entry:last-child {
      border-bottom: none;
    }

    .stash-entry:hover {
      background: var(--bg-tertiary);
    }

    .stash-entry-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-xs);
    }

    .stash-entry-id {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-sm);
      color: var(--accent-primary);
      font-weight: 600;
    }

    .stash-entry-branch {
      font-size: var(--font-size-sm);
      color: var(--accent-success);
      background: rgba(63, 185, 80, 0.1);
      padding: 2px 8px;
      border-radius: var(--border-radius-full);
    }

    .stash-entry-date {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      margin-left: auto;
    }

    .stash-entry-message {
      font-size: var(--font-size-base);
      color: var(--text-primary);
      margin-bottom: var(--spacing-sm);
    }

    .stash-entry-files {
      margin-bottom: var(--spacing-sm);
    }

    .stash-entry-file-count {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      cursor: pointer;
    }

    .stash-entry-file-count:hover {
      color: var(--accent-primary);
    }

    .stash-entry-file-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs);
      margin-top: var(--spacing-xs);
    }

    .stash-entry-file-list.collapsed {
      display: none;
    }

    .stash-file {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 3px;
    }

    .stash-file-more {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .stash-entry-actions {
      display: flex;
      gap: var(--spacing-sm);
      opacity: 0;
      transition: opacity var(--transition-fast);
    }

    .stash-entry:hover .stash-entry-actions {
      opacity: 1;
    }

    .stash-empty {
      text-align: center;
      padding: var(--spacing-xxl);
    }

    .stash-empty-icon {
      font-size: 64px;
      margin-bottom: var(--spacing-md);
      opacity: 0.5;
    }

    .stash-empty h3 {
      margin: 0 0 var(--spacing-sm);
      color: var(--text-primary);
    }

    .stash-empty p {
      color: var(--text-secondary);
      margin: 0 0 var(--spacing-lg);
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      cursor: pointer;
      font-size: var(--font-size-sm);
    }

    .checkbox-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent-primary);
    }

    .btn-danger {
      background: var(--accent-danger);
      color: white;
    }

    .btn-danger:hover {
      background: color-mix(in srgb, var(--accent-danger) 85%, white);
    }
  `;
}

/**
 * Stash manager component
 */
export class StashManager {
  private repo: Repository;
  private container: HTMLElement | null = null;
  private stashes: StashEntry[] = [];

  constructor(repo: Repository) {
    this.repo = repo;
  }

  /**
   * Mount to container
   */
  mount(container: HTMLElement): void {
    this.container = container;
    this.refresh();
  }

  /**
   * Refresh stash list
   */
  refresh(): void {
    this.stashes = getStashList(this.repo);
    this.render();
  }

  /**
   * Render the UI
   */
  private render(): void {
    if (!this.container) return;
    this.container.innerHTML = renderStashListHTML(this.stashes);
  }

  /**
   * Create a new stash
   */
  async createStash(message?: string, includeUntracked?: boolean, keepIndex?: boolean): Promise<void> {
    // Implementation would use actual stash functionality
    console.log('Creating stash:', { message, includeUntracked, keepIndex });
    this.refresh();
  }

  /**
   * Apply a stash
   */
  async applyStash(id: number): Promise<void> {
    console.log('Applying stash:', id);
    this.refresh();
  }

  /**
   * Pop a stash
   */
  async popStash(id: number): Promise<void> {
    console.log('Popping stash:', id);
    this.refresh();
  }

  /**
   * Drop a stash
   */
  async dropStash(id: number): Promise<void> {
    console.log('Dropping stash:', id);
    this.refresh();
  }
}
