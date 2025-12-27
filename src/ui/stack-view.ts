/**
 * Stack View UI for wit
 * Visual stacked diffs management with interactive controls
 */

import { Repository } from '../core/repository';
import { StackManager, StackMetadata, StackNode } from '../core/stack';

/**
 * Stack entry for UI display
 */
export interface StackViewEntry {
  name: string;
  description?: string;
  baseBranch: string;
  branches: string[];
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Stack branch status
 */
export interface StackBranchStatus {
  branch: string;
  commit: string;
  message: string;
  isCurrent: boolean;
  status: 'synced' | 'behind' | 'ahead' | 'diverged';
  behindBy?: number;
  aheadBy?: number;
}

/**
 * Get stack list for UI
 */
export function getStackList(repo: Repository): StackViewEntry[] {
  const manager = new StackManager(repo, repo.gitDir);
  const stackNames = manager.listStacks();
  const currentStack = manager.getCurrentStack();

  const entries: StackViewEntry[] = [];
  
  for (const name of stackNames) {
    const stack = manager.getStack(name);
    if (!stack) continue;

    const entry: StackViewEntry = {
      name: stack.name,
      baseBranch: stack.baseBranch,
      branches: stack.branches,
      isCurrent: currentStack?.name === stack.name,
      createdAt: new Date(stack.createdAt),
      updatedAt: new Date(stack.updatedAt),
    };
    
    if (stack.description) {
      entry.description = stack.description;
    }
    
    entries.push(entry);
  }
  
  return entries;
}

/**
 * Get stack visualization for UI
 */
export function getStackVisualization(repo: Repository, stackName?: string): StackBranchStatus[] {
  const manager = new StackManager(repo, repo.gitDir);
  const nodes = manager.visualize(stackName);

  return nodes.map(node => ({
    branch: node.branch,
    commit: node.commit,
    message: node.message,
    isCurrent: node.isCurrent,
    status: node.status,
    behindBy: node.behindBy,
    aheadBy: node.aheadBy,
  }));
}

/**
 * Render stack list HTML
 */
export function renderStackListHTML(stacks: StackViewEntry[]): string {
  if (stacks.length === 0) {
    return `
      <div class="stack-empty">
        <div class="stack-empty-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="6" rx="1"/>
            <rect x="3" y="11" width="18" height="6" rx="1" opacity="0.6"/>
            <rect x="3" y="19" width="18" height="2" rx="0.5" opacity="0.3"/>
          </svg>
        </div>
        <h3>No Stacks Yet</h3>
        <p>Stacked diffs help you break down large features into smaller, reviewable changes.</p>
        <button class="btn btn-primary" onclick="createStack()">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
          </svg>
          Create Stack
        </button>
      </div>
    `;
  }

  return `
    <div class="stack-container">
      <div class="stack-header">
        <h3>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="6" rx="1"/>
            <rect x="3" y="11" width="18" height="6" rx="1"/>
          </svg>
          Stacked Diffs
        </h3>
        <button class="btn btn-primary btn-sm" onclick="createStack()">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
          </svg>
          New Stack
        </button>
      </div>
      <div class="stack-list">
        ${stacks.map(stack => renderStackEntryHTML(stack)).join('')}
      </div>
    </div>
  `;
}

/**
 * Render a single stack entry
 */
function renderStackEntryHTML(stack: StackViewEntry): string {
  const currentClass = stack.isCurrent ? 'stack-entry-current' : '';
  
  return `
    <div class="stack-entry ${currentClass}" data-stack="${escapeHtml(stack.name)}">
      <div class="stack-entry-header">
        <div class="stack-entry-info">
          ${stack.isCurrent ? '<span class="stack-current-badge">CURRENT</span>' : ''}
          <span class="stack-entry-name">${escapeHtml(stack.name)}</span>
        </div>
        <span class="stack-entry-date">${formatRelativeDate(stack.updatedAt)}</span>
      </div>
      ${stack.description ? `<div class="stack-entry-description">${escapeHtml(stack.description)}</div>` : ''}
      <div class="stack-entry-meta">
        <span class="stack-entry-base">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
          </svg>
          ${escapeHtml(stack.baseBranch)}
        </span>
        <span class="stack-entry-count">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.5A2.5 2.5 0 0 1 3.5 0h8.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V1.5h-8a1 1 0 0 0-1 1v6.708A2.492 2.492 0 0 1 3.5 9h3.25a.75.75 0 0 1 0 1.5H3.5a1 1 0 0 0 0 2h5.75a.75.75 0 0 1 0 1.5H3.5A2.5 2.5 0 0 1 1 11.5v-9z"/>
            <path d="M8 4.75a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75zM8 8.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 8 8.25z"/>
          </svg>
          ${stack.branches.length} branch${stack.branches.length !== 1 ? 'es' : ''}
        </span>
      </div>
      <div class="stack-entry-actions">
        <button class="btn btn-secondary btn-sm" onclick="viewStack('${escapeHtml(stack.name)}')" title="View stack">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
            <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>
          </svg>
          View
        </button>
        <button class="btn btn-primary btn-sm" onclick="stackPush('${escapeHtml(stack.name)}')" title="Push new branch">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
          </svg>
          Push
        </button>
        <button class="btn btn-secondary btn-sm" onclick="syncStack('${escapeHtml(stack.name)}')" title="Sync stack">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
          </svg>
          Sync
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteStack('${escapeHtml(stack.name)}')" title="Delete stack">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * Render stack visualization (vertical branch view)
 */
export function renderStackVisualizationHTML(branches: StackBranchStatus[], stackName: string): string {
  if (branches.length === 0) {
    return `<div class="stack-viz-empty">No branches in this stack</div>`;
  }

  return `
    <div class="stack-viz-container">
      <div class="stack-viz-header">
        <h4>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="6" rx="1"/>
            <rect x="3" y="11" width="18" height="6" rx="1"/>
          </svg>
          ${escapeHtml(stackName)}
        </h4>
        <div class="stack-viz-actions">
          <button class="btn btn-sm btn-secondary" onclick="stackDown()">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 13.293V1.5A.5.5 0 0 1 8 1z"/>
            </svg>
            Down
          </button>
          <button class="btn btn-sm btn-secondary" onclick="stackUp()">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 2.707V14.5a.5.5 0 0 0 .5.5z"/>
            </svg>
            Up
          </button>
        </div>
      </div>
      <div class="stack-viz-branches">
        ${branches.slice().reverse().map((branch, index) => 
          renderStackBranchHTML(branch, index === 0, index === branches.length - 1)
        ).join('')}
      </div>
      <div class="stack-viz-legend">
        <span class="stack-legend-item"><span class="stack-status-dot synced"></span> Synced</span>
        <span class="stack-legend-item"><span class="stack-status-dot behind"></span> Behind</span>
        <span class="stack-legend-item"><span class="stack-status-dot ahead"></span> Ahead</span>
        <span class="stack-legend-item"><span class="stack-status-dot diverged"></span> Diverged</span>
      </div>
    </div>
  `;
}

/**
 * Render a single branch in the stack visualization
 */
function renderStackBranchHTML(branch: StackBranchStatus, isTop: boolean, isBase: boolean): string {
  const currentClass = branch.isCurrent ? 'stack-branch-current' : '';
  const baseClass = isBase ? 'stack-branch-base' : '';

  let statusBadge = '';
  switch (branch.status) {
    case 'synced':
      statusBadge = '<span class="stack-status synced" title="Synced">&#10003;</span>';
      break;
    case 'behind':
      statusBadge = `<span class="stack-status behind" title="${branch.behindBy} behind">&#8595;${branch.behindBy}</span>`;
      break;
    case 'ahead':
      statusBadge = `<span class="stack-status ahead" title="${branch.aheadBy} ahead">&#8593;${branch.aheadBy}</span>`;
      break;
    case 'diverged':
      statusBadge = '<span class="stack-status diverged" title="Diverged">&#8645;</span>';
      break;
  }

  return `
    <div class="stack-branch ${currentClass} ${baseClass}" data-branch="${escapeHtml(branch.branch)}" onclick="checkoutBranch('${escapeHtml(branch.branch)}')">
      <div class="stack-branch-connector">
        ${!isBase ? '<div class="stack-connector-line"></div>' : ''}
        <div class="stack-connector-dot ${branch.status}"></div>
      </div>
      <div class="stack-branch-content">
        <div class="stack-branch-header">
          ${branch.isCurrent ? '<span class="stack-branch-current-indicator">&#9679;</span>' : ''}
          <span class="stack-branch-name">${escapeHtml(branch.branch.replace(' (base)', ''))}</span>
          ${isBase ? '<span class="stack-branch-base-badge">BASE</span>' : ''}
          ${statusBadge}
        </div>
        <div class="stack-branch-details">
          <span class="stack-branch-commit">${escapeHtml(branch.commit)}</span>
          <span class="stack-branch-message">${escapeHtml(truncate(branch.message, 50))}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render stack creation modal
 */
export function renderStackCreateModalHTML(): string {
  return `
    <div class="modal-overlay" id="stack-create-modal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="6" rx="1"/>
              <rect x="3" y="11" width="18" height="6" rx="1"/>
            </svg>
            Create New Stack
          </span>
          <button class="modal-close" onclick="closeStackModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="stack-name">Stack Name <span class="required">*</span></label>
            <input type="text" id="stack-name" placeholder="feature-auth" required>
            <span class="form-hint">Use lowercase letters, numbers, and hyphens</span>
          </div>
          <div class="form-group">
            <label for="stack-description">Description (optional)</label>
            <textarea id="stack-description" placeholder="Authentication feature with login/logout" rows="2"></textarea>
          </div>
          <div class="form-info">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
              <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
            </svg>
            The current branch will be used as the base for this stack.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeStackModal()">Cancel</button>
          <button class="btn btn-primary" onclick="confirmCreateStack()">Create Stack</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render stack push modal
 */
export function renderStackPushModalHTML(stackName: string): string {
  return `
    <div class="modal-overlay" id="stack-push-modal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
            </svg>
            Push to Stack: ${escapeHtml(stackName)}
          </span>
          <button class="modal-close" onclick="closeStackPushModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="branch-name">Branch Name (optional)</label>
            <input type="text" id="branch-name" placeholder="Leave empty for auto-generated name">
            <span class="form-hint">Auto-generates: ${escapeHtml(stackName)}/part-N</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeStackPushModal()">Cancel</button>
          <button class="btn btn-primary" onclick="confirmStackPush()">Push Branch</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Get stack view CSS styles
 */
export function getStackStyles(): string {
  return `
    /* Stack Container */
    .stack-container {
      background: var(--bg-secondary);
      border-radius: var(--border-radius-lg);
      overflow: hidden;
    }

    .stack-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md) var(--spacing-lg);
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-default);
    }

    .stack-header h3 {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin: 0;
      font-size: var(--font-size-lg);
      color: var(--text-primary);
    }

    .stack-header h3 svg {
      opacity: 0.7;
    }

    /* Stack List */
    .stack-list {
      display: flex;
      flex-direction: column;
    }

    .stack-entry {
      padding: var(--spacing-md) var(--spacing-lg);
      border-bottom: 1px solid var(--border-default);
      transition: background var(--transition-fast);
      cursor: pointer;
    }

    .stack-entry:last-child {
      border-bottom: none;
    }

    .stack-entry:hover {
      background: var(--bg-tertiary);
    }

    .stack-entry-current {
      background: rgba(88, 166, 255, 0.05);
      border-left: 3px solid var(--accent-primary);
    }

    .stack-entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--spacing-xs);
    }

    .stack-entry-info {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .stack-current-badge {
      font-size: 10px;
      font-weight: 600;
      color: var(--accent-primary);
      background: rgba(88, 166, 255, 0.15);
      padding: 2px 6px;
      border-radius: var(--border-radius-full);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stack-entry-name {
      font-weight: 600;
      color: var(--text-primary);
      font-size: var(--font-size-base);
    }

    .stack-entry-date {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .stack-entry-description {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      margin-bottom: var(--spacing-sm);
    }

    .stack-entry-meta {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-sm);
    }

    .stack-entry-base,
    .stack-entry-count {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
    }

    .stack-entry-base svg,
    .stack-entry-count svg {
      opacity: 0.6;
    }

    .stack-entry-actions {
      display: flex;
      gap: var(--spacing-sm);
      opacity: 0;
      transition: opacity var(--transition-fast);
    }

    .stack-entry:hover .stack-entry-actions {
      opacity: 1;
    }

    /* Stack Empty State */
    .stack-empty {
      text-align: center;
      padding: var(--spacing-xxl) var(--spacing-xl);
    }

    .stack-empty-icon {
      color: var(--text-muted);
      opacity: 0.5;
      margin-bottom: var(--spacing-md);
    }

    .stack-empty h3 {
      margin: 0 0 var(--spacing-sm);
      color: var(--text-primary);
      font-size: var(--font-size-xl);
    }

    .stack-empty p {
      color: var(--text-secondary);
      margin: 0 0 var(--spacing-lg);
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }

    /* Stack Visualization */
    .stack-viz-container {
      background: var(--bg-secondary);
      border-radius: var(--border-radius-lg);
      overflow: hidden;
    }

    .stack-viz-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md) var(--spacing-lg);
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-default);
    }

    .stack-viz-header h4 {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin: 0;
      font-size: var(--font-size-base);
      font-weight: 600;
      color: var(--text-primary);
    }

    .stack-viz-actions {
      display: flex;
      gap: var(--spacing-xs);
    }

    .stack-viz-branches {
      padding: var(--spacing-md) var(--spacing-lg);
    }

    .stack-branch {
      display: flex;
      align-items: stretch;
      cursor: pointer;
      padding: var(--spacing-xs) 0;
      transition: background var(--transition-fast);
      border-radius: var(--border-radius);
      margin: 0 calc(-1 * var(--spacing-sm));
      padding-left: var(--spacing-sm);
      padding-right: var(--spacing-sm);
    }

    .stack-branch:hover {
      background: var(--bg-tertiary);
    }

    .stack-branch-current {
      background: rgba(88, 166, 255, 0.08);
    }

    .stack-branch-current:hover {
      background: rgba(88, 166, 255, 0.12);
    }

    .stack-branch-connector {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 24px;
      margin-right: var(--spacing-md);
      position: relative;
    }

    .stack-connector-line {
      width: 2px;
      flex: 1;
      background: var(--border-default);
      min-height: 20px;
    }

    .stack-connector-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid var(--bg-secondary);
      box-shadow: 0 0 0 2px var(--border-default);
      z-index: 1;
    }

    .stack-connector-dot.synced {
      background: var(--accent-success);
      box-shadow: 0 0 0 2px var(--accent-success);
    }

    .stack-connector-dot.behind {
      background: var(--accent-warning);
      box-shadow: 0 0 0 2px var(--accent-warning);
    }

    .stack-connector-dot.ahead {
      background: var(--accent-primary);
      box-shadow: 0 0 0 2px var(--accent-primary);
    }

    .stack-connector-dot.diverged {
      background: var(--accent-danger);
      box-shadow: 0 0 0 2px var(--accent-danger);
    }

    .stack-branch-content {
      flex: 1;
      min-width: 0;
    }

    .stack-branch-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-bottom: 2px;
    }

    .stack-branch-current-indicator {
      color: var(--accent-primary);
      font-size: 8px;
    }

    .stack-branch-name {
      font-weight: 500;
      color: var(--text-primary);
      font-size: var(--font-size-sm);
    }

    .stack-branch-base-badge {
      font-size: 9px;
      font-weight: 600;
      color: var(--accent-success);
      background: rgba(63, 185, 80, 0.15);
      padding: 1px 5px;
      border-radius: var(--border-radius-full);
      text-transform: uppercase;
    }

    .stack-status {
      font-size: var(--font-size-xs);
      font-weight: 600;
      padding: 1px 6px;
      border-radius: var(--border-radius);
    }

    .stack-status.synced {
      color: var(--accent-success);
      background: rgba(63, 185, 80, 0.15);
    }

    .stack-status.behind {
      color: var(--accent-warning);
      background: rgba(210, 153, 34, 0.15);
    }

    .stack-status.ahead {
      color: var(--accent-primary);
      background: rgba(88, 166, 255, 0.15);
    }

    .stack-status.diverged {
      color: var(--accent-danger);
      background: rgba(248, 81, 73, 0.15);
    }

    .stack-branch-details {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .stack-branch-commit {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-xs);
      color: var(--accent-primary);
    }

    .stack-branch-message {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .stack-viz-legend {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-sm) var(--spacing-lg);
      border-top: 1px solid var(--border-default);
      background: var(--bg-tertiary);
    }

    .stack-legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .stack-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .stack-status-dot.synced { background: var(--accent-success); }
    .stack-status-dot.behind { background: var(--accent-warning); }
    .stack-status-dot.ahead { background: var(--accent-primary); }
    .stack-status-dot.diverged { background: var(--accent-danger); }

    .stack-viz-empty {
      padding: var(--spacing-xl);
      text-align: center;
      color: var(--text-muted);
    }

    /* Form styles */
    .form-group {
      margin-bottom: var(--spacing-md);
    }

    .form-group label {
      display: block;
      margin-bottom: var(--spacing-xs);
      font-size: var(--font-size-sm);
      font-weight: 500;
      color: var(--text-primary);
    }

    .form-group .required {
      color: var(--accent-danger);
    }

    .form-hint {
      display: block;
      margin-top: var(--spacing-xs);
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .form-info {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background: rgba(88, 166, 255, 0.1);
      border-radius: var(--border-radius);
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
    }

    .form-info svg {
      flex-shrink: 0;
      margin-top: 2px;
      color: var(--accent-primary);
    }

    /* Button variants */
    .btn-sm {
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: var(--font-size-xs);
    }

    .btn-danger {
      background: var(--accent-danger);
      color: white;
    }

    .btn-danger:hover {
      filter: brightness(1.1);
    }
  `;
}

/**
 * Stack view manager component
 */
export class StackViewManager {
  private repo: Repository;
  private stackManager: StackManager;
  private container: HTMLElement | null = null;
  private stacks: StackViewEntry[] = [];
  private currentView: 'list' | 'detail' = 'list';
  private selectedStack: string | null = null;

  constructor(repo: Repository) {
    this.repo = repo;
    this.stackManager = new StackManager(repo, repo.gitDir);
  }

  /**
   * Mount to container
   */
  mount(container: HTMLElement): void {
    this.container = container;
    this.refresh();
  }

  /**
   * Refresh stack list
   */
  refresh(): void {
    this.stacks = getStackList(this.repo);
    this.render();
  }

  /**
   * Render the UI
   */
  private render(): void {
    if (!this.container) return;

    if (this.currentView === 'detail' && this.selectedStack) {
      const branches = getStackVisualization(this.repo, this.selectedStack);
      this.container.innerHTML = renderStackVisualizationHTML(branches, this.selectedStack);
    } else {
      this.container.innerHTML = renderStackListHTML(this.stacks);
    }
  }

  /**
   * Show stack detail view
   */
  showStack(stackName: string): void {
    this.selectedStack = stackName;
    this.currentView = 'detail';
    this.render();
  }

  /**
   * Show stack list view
   */
  showList(): void {
    this.selectedStack = null;
    this.currentView = 'list';
    this.render();
  }

  /**
   * Create a new stack
   */
  async createStack(name: string, description?: string): Promise<void> {
    this.stackManager.create(name, description);
    this.refresh();
  }

  /**
   * Push a new branch to the current stack
   */
  async pushToStack(branchName?: string): Promise<void> {
    this.stackManager.push(branchName);
    this.refresh();
  }

  /**
   * Sync the current stack
   */
  async syncStack(): Promise<void> {
    this.stackManager.sync();
    this.refresh();
  }

  /**
   * Delete a stack
   */
  async deleteStack(name: string): Promise<void> {
    this.stackManager.delete(name);
    this.refresh();
  }

  /**
   * Navigate up in the stack
   */
  async navigateUp(): Promise<void> {
    this.stackManager.up();
    this.refresh();
  }

  /**
   * Navigate down in the stack
   */
  async navigateDown(): Promise<void> {
    this.stackManager.down();
    this.refresh();
  }
}

// ============ Helper Functions ============

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
