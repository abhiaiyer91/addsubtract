/**
 * Issue Board UI Component
 * Linear-inspired kanban board for the web UI
 */

import { Issue, IssueStatus, IssuePriority, IssueManager, STATUS_CONFIG, PRIORITY_CONFIG, Cycle } from '../core/issues';

/**
 * Extended issue with Linear-style fields
 */
export interface IssueWithExtras extends Issue {
  dueDate?: number;
  estimate?: number;
  parentId?: string;
  parentNumber?: number;
  subIssueCount?: number;
  subIssueProgress?: number;
  projectName?: string;
  cycleNumber?: number;
  isBlocked?: boolean;
  blockedByCount?: number;
  blockingCount?: number;
  relatedCount?: number;
}

/**
 * Board column configuration
 */
export interface BoardColumn {
  status: IssueStatus;
  title: string;
  icon: string;
  color: string;
}

/**
 * Default board columns - includes triage for Linear-style workflow
 */
export const DEFAULT_COLUMNS: BoardColumn[] = [
  { status: 'triage' as IssueStatus, title: 'Triage', icon: '◇', color: '#9ca3af' },
  { status: 'backlog', title: 'Backlog', icon: '○', color: '#6b7280' },
  { status: 'todo', title: 'Todo', icon: '◔', color: '#f59e0b' },
  { status: 'in_progress', title: 'In Progress', icon: '◑', color: '#3b82f6' },
  { status: 'in_review', title: 'In Review', icon: '◕', color: '#8b5cf6' },
  { status: 'done', title: 'Done', icon: '●', color: '#22c55e' },
];

/**
 * Relations data type
 */
interface RelationsData {
  blocking?: number[];
  blockedBy?: number[];
  related?: number[];
  duplicates?: number[];
  duplicatedBy?: number[];
}

/**
 * Due date status helper
 */
function getDueDateStatus(dueDate: number | undefined): { label: string; class: string } | null {
  if (!dueDate) return null;
  
  const now = Date.now();
  const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)}d overdue`, class: 'due-overdue' };
  } else if (diffDays === 0) {
    return { label: 'Due today', class: 'due-today' };
  } else if (diffDays <= 3) {
    return { label: `${diffDays}d`, class: 'due-soon' };
  } else if (diffDays <= 7) {
    return { label: `${diffDays}d`, class: 'due-week' };
  }
  
  const date = new Date(dueDate);
  return { label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), class: 'due-normal' };
}

/**
 * Render issue card HTML
 */
export function renderIssueCard(issue: Issue, manager: IssueManager): string {
  const priorityConfig = PRIORITY_CONFIG[issue.priority];
  const displayId = manager.getDisplayId(issue);
  const extIssue = issue as IssueWithExtras;
  
  const labels = issue.labels.map(label => 
    `<span class="issue-label">${escapeHtml(label)}</span>`
  ).join('');
  
  const assignee = issue.assignee 
    ? `<div class="issue-assignee" title="${escapeHtml(issue.assignee)}">
         <span class="avatar">${issue.assignee.charAt(0).toUpperCase()}</span>
       </div>`
    : '';
  
  const typeIcon = getTypeIcon(issue.type);
  
  // Due date badge
  const dueStatus = getDueDateStatus(extIssue.dueDate);
  const dueBadge = dueStatus 
    ? `<span class="issue-due-badge ${dueStatus.class}">${dueStatus.label}</span>`
    : '';
  
  // Sub-issue progress indicator
  const subProgress = extIssue.subIssueCount && extIssue.subIssueCount > 0
    ? `<div class="issue-sub-progress" title="${extIssue.subIssueProgress || 0}% complete">
         <span class="sub-icon">⊟</span>
         <span class="sub-count">${extIssue.subIssueProgress || 0}%</span>
       </div>`
    : '';
  
  // Blocked indicator
  const blockedBadge = extIssue.isBlocked || (extIssue.blockedByCount && extIssue.blockedByCount > 0)
    ? `<span class="issue-blocked-badge" title="Blocked by ${extIssue.blockedByCount || 1} issue(s)">🚫</span>`
    : '';
  
  // Blocking indicator
  const blockingBadge = extIssue.blockingCount && extIssue.blockingCount > 0
    ? `<span class="issue-blocking-badge" title="Blocking ${extIssue.blockingCount} issue(s)">⚠️</span>`
    : '';
  
  // Estimate badge
  const estimateBadge = extIssue.estimate
    ? `<span class="issue-estimate-badge">${extIssue.estimate}pts</span>`
    : '';
  
  // Parent indicator (for sub-issues)
  const parentIndicator = extIssue.parentNumber
    ? `<span class="issue-parent-indicator" title="Sub-issue of #${extIssue.parentNumber}">↳</span>`
    : '';
  
  // Project/Cycle indicators
  const projectBadge = extIssue.projectName
    ? `<span class="issue-project-badge" title="Project: ${escapeHtml(extIssue.projectName)}">📁</span>`
    : '';
  
  const cycleBadge = extIssue.cycleNumber
    ? `<span class="issue-cycle-badge" title="Cycle ${extIssue.cycleNumber}">🔄 ${extIssue.cycleNumber}</span>`
    : '';
  
  return `
    <div class="issue-card ${extIssue.isBlocked ? 'issue-card-blocked' : ''}" 
         data-id="${issue.id}" 
         data-number="${issue.number}"
         data-status="${issue.status}"
         draggable="true"
         onclick="openIssueDetail('${issue.id}')">
      <div class="issue-card-header">
        <span class="issue-id">${parentIndicator}${displayId}</span>
        <div class="issue-card-badges">
          ${blockedBadge}
          ${blockingBadge}
          <span class="issue-priority" style="color: ${priorityConfig.color}" title="${issue.priority}">
            ${priorityConfig.icon}
          </span>
        </div>
      </div>
      <div class="issue-card-title">${escapeHtml(issue.title)}</div>
      ${subProgress}
      <div class="issue-card-footer">
        <div class="issue-card-meta">
          <span class="issue-type" title="${issue.type}">${typeIcon}</span>
          ${dueBadge}
          ${estimateBadge}
          ${projectBadge}
          ${cycleBadge}
          ${labels}
        </div>
        ${assignee}
      </div>
    </div>
  `;
}

/**
 * Render board column HTML
 */
export function renderBoardColumn(
  column: BoardColumn, 
  issues: Issue[], 
  manager: IssueManager
): string {
  const issueCards = issues
    .filter(i => i.status === column.status)
    .map(i => renderIssueCard(i, manager))
    .join('');
  
  const count = issues.filter(i => i.status === column.status).length;
  
  return `
    <div class="board-column" data-status="${column.status}">
      <div class="board-column-header">
        <span class="board-column-icon" style="color: ${column.color}">${column.icon}</span>
        <span class="board-column-title">${column.title}</span>
        <span class="board-column-count">${count}</span>
      </div>
      <div class="board-column-content" 
           ondragover="handleDragOver(event)" 
           ondrop="handleDrop(event, '${column.status}')">
        ${issueCards || '<div class="board-column-empty">No issues</div>'}
      </div>
    </div>
  `;
}

/**
 * Render full board HTML
 */
export function renderBoard(
  issues: Issue[], 
  manager: IssueManager,
  columns: BoardColumn[] = DEFAULT_COLUMNS
): string {
  const columnsHtml = columns
    .map(col => renderBoardColumn(col, issues, manager))
    .join('');
  
  return `
    <div class="issue-board">
      <div class="board-header">
        <div class="board-title">
          <h2>Issues</h2>
          <span class="board-count">${issues.length} issues</span>
        </div>
        <div class="board-actions">
          <button class="btn btn-primary" onclick="createIssue()">
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
            </svg>
            New Issue
          </button>
        </div>
      </div>
      <div class="board-columns">
        ${columnsHtml}
      </div>
    </div>
  `;
}

/**
 * Render cycle progress bar
 */
export function renderCycleProgress(cycle: Cycle, progress: {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  percentage: number;
}): string {
  const daysLeft = Math.ceil((cycle.endDate - Date.now()) / (1000 * 60 * 60 * 24));
  const daysText = daysLeft > 0 ? `${daysLeft} days left` : 'Overdue';
  
  return `
    <div class="cycle-progress">
      <div class="cycle-header">
        <span class="cycle-name">${escapeHtml(cycle.name)}</span>
        <span class="cycle-days ${daysLeft <= 0 ? 'overdue' : ''}">${daysText}</span>
      </div>
      <div class="cycle-progress-bar">
        <div class="cycle-progress-fill" style="width: ${progress.percentage}%"></div>
      </div>
      <div class="cycle-stats">
        <span class="stat done">${progress.done} done</span>
        <span class="stat in-progress">${progress.inProgress} in progress</span>
        <span class="stat todo">${progress.todo} to do</span>
      </div>
    </div>
  `;
}

/**
 * Render issue list view (alternative to board)
 */
export function renderIssueList(issues: Issue[], manager: IssueManager): string {
  if (issues.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No issues yet</h3>
        <p>Create your first issue to get started</p>
        <button class="btn btn-primary" onclick="createIssue()">Create Issue</button>
      </div>
    `;
  }
  
  const rows = issues.map(issue => {
    const statusConfig = STATUS_CONFIG[issue.status];
    const priorityConfig = PRIORITY_CONFIG[issue.priority];
    const displayId = manager.getDisplayId(issue);
    const extIssue = issue as IssueWithExtras;
    
    const labels = issue.labels.map(label => 
      `<span class="issue-label">${escapeHtml(label)}</span>`
    ).join('');
    
    // Check if overdue
    const isOverdue = extIssue.dueDate && extIssue.dueDate < Date.now();
    const dueStatus = getDueDateStatus(extIssue.dueDate);
    
    // Sub-issue indicator
    const hasSubIssues = extIssue.subIssueCount && extIssue.subIssueCount > 0;
    const subIssueIndicator = hasSubIssues 
      ? `<span class="sub-issue-toggle" onclick="event.stopPropagation(); toggleSubIssues('${issue.id}')">▶</span>`
      : '';
    
    // Parent indicator
    const parentIndicator = extIssue.parentNumber 
      ? `<span class="issue-parent-indicator" title="Sub-issue of #${extIssue.parentNumber}">↳</span>`
      : '';
    
    // Blocked indicator
    const blockedIndicator = extIssue.isBlocked || (extIssue.blockedByCount && extIssue.blockedByCount > 0)
      ? `<span class="issue-blocked-badge" title="Blocked">🚫</span>`
      : '';
    
    return `
      <tr class="issue-row ${isOverdue ? 'overdue' : ''} ${hasSubIssues ? 'has-sub-issues' : ''} ${extIssue.parentNumber ? 'sub-issue' : ''}" 
          data-id="${issue.id}"
          onclick="openIssueDetail('${issue.id}')">
        <td class="issue-id-cell">
          ${subIssueIndicator}${parentIndicator}${displayId}
          ${blockedIndicator}
        </td>
        <td class="issue-status-cell">
          <span class="status-badge" style="background: ${statusConfig.color}20; color: ${statusConfig.color}">
            ${statusConfig.icon} ${issue.status.replace('_', ' ')}
          </span>
        </td>
        <td class="issue-priority-cell">
          <span class="priority-indicator" style="color: ${priorityConfig.color}" title="${issue.priority}">
            ${priorityConfig.icon}
          </span>
        </td>
        <td class="issue-title-cell">
          <span class="issue-title">${escapeHtml(issue.title)}</span>
          ${hasSubIssues ? `<span class="sub-issue-count">(${extIssue.subIssueProgress || 0}%)</span>` : ''}
          <div class="issue-labels">${labels}</div>
        </td>
        <td class="issue-due-cell">
          ${dueStatus ? `<span class="issue-due-badge ${dueStatus.class}">${dueStatus.label}</span>` : ''}
        </td>
        <td class="issue-estimate-cell">
          ${extIssue.estimate ? `${extIssue.estimate}pts` : ''}
        </td>
        <td class="issue-assignee-cell">
          ${issue.assignee ? `<span class="assignee">@${escapeHtml(issue.assignee)}</span>` : ''}
        </td>
        <td class="issue-updated-cell">
          ${formatTimeAgo(issue.updatedAt)}
        </td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="issue-list">
      <div class="list-header">
        <div class="list-title">
          <h2>Issues</h2>
          <span class="list-count">${issues.length} issues</span>
        </div>
        <div class="board-filters">
          <div class="filter-dropdown">
            <button class="filter-button" onclick="toggleFilter('priority')">
              Priority <span>▼</span>
            </button>
          </div>
          <div class="filter-dropdown">
            <button class="filter-button" onclick="toggleFilter('due')">
              Due Date <span>▼</span>
            </button>
          </div>
          <div class="filter-dropdown">
            <button class="filter-button" onclick="toggleFilter('project')">
              Project <span>▼</span>
            </button>
          </div>
        </div>
        <div class="list-actions">
          <button class="btn btn-primary" onclick="createIssue()">
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
            </svg>
            New Issue
          </button>
        </div>
      </div>
      <table class="issue-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th></th>
            <th>Title</th>
            <th>Due</th>
            <th>Est</th>
            <th>Assignee</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render issue detail panel
 */
export function renderIssueDetail(issue: Issue, manager: IssueManager): string {
  const displayId = manager.getDisplayId(issue);
  const statusConfig = STATUS_CONFIG[issue.status];
  const priorityConfig = PRIORITY_CONFIG[issue.priority];
  const extIssue = issue as IssueWithExtras;
  
  const comments = manager.getComments(issue.id);
  const activity = manager.getActivity(issue.id);
  
  const commentsHtml = comments.map(comment => `
    <div class="comment">
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(comment.author)}</span>
        <span class="comment-time">${formatTimeAgo(comment.createdAt)}</span>
      </div>
      <div class="comment-content">${escapeHtml(comment.content)}</div>
    </div>
  `).join('');
  
  const labels = issue.labels.map(label => 
    `<span class="issue-label">${escapeHtml(label)}</span>`
  ).join('');

  // Due date display
  const dueStatus = getDueDateStatus(extIssue.dueDate);
  const dueDateHtml = extIssue.dueDate 
    ? `<div class="meta-row">
         <span class="meta-label">Due Date</span>
         <div class="due-date-container">
           <span class="issue-due-badge ${dueStatus?.class || ''}">${dueStatus?.label || ''}</span>
           <button class="btn-icon" onclick="clearDueDate('${issue.id}')" title="Clear due date">×</button>
         </div>
       </div>`
    : `<div class="meta-row">
         <span class="meta-label">Due Date</span>
         <button class="btn btn-sm" onclick="setDueDate('${issue.id}')">Set due date</button>
       </div>`;

  // Estimate display
  const estimateHtml = `
    <div class="meta-row">
      <span class="meta-label">Estimate</span>
      <input type="number" 
             class="estimate-input" 
             value="${extIssue.estimate || ''}" 
             placeholder="Points"
             min="0"
             onchange="updateIssueEstimate('${issue.id}', this.value)">
    </div>`;

  // Parent/Sub-issues section
  let hierarchyHtml = '';
  if (extIssue.parentNumber) {
    hierarchyHtml = `
      <div class="meta-row">
        <span class="meta-label">Parent</span>
        <span class="parent-link" onclick="openIssueByNumber(${extIssue.parentNumber})">#${extIssue.parentNumber}</span>
        <button class="btn-icon" onclick="removeParent('${issue.id}')" title="Remove parent">×</button>
      </div>`;
  }
  
  if (extIssue.subIssueCount && extIssue.subIssueCount > 0) {
    hierarchyHtml += `
      <div class="meta-row">
        <span class="meta-label">Sub-issues</span>
        <div class="sub-issues-summary">
          <span>${extIssue.subIssueCount} sub-issues</span>
          <div class="issue-sub-progress-bar">
            <div class="issue-sub-progress-bar-fill" style="width: ${extIssue.subIssueProgress || 0}%"></div>
          </div>
          <span>${extIssue.subIssueProgress || 0}%</span>
        </div>
      </div>`;
  }

  // Project/Cycle section
  let projectCycleHtml = '';
  if (extIssue.projectName) {
    projectCycleHtml += `
      <div class="meta-row">
        <span class="meta-label">Project</span>
        <span class="project-link">${escapeHtml(extIssue.projectName)}</span>
      </div>`;
  }
  if (extIssue.cycleNumber) {
    projectCycleHtml += `
      <div class="meta-row">
        <span class="meta-label">Cycle</span>
        <span class="cycle-link">Cycle ${extIssue.cycleNumber}</span>
      </div>`;
  }

  // Relations section
  // Check if manager has getRelations method (it may be added in extended versions)
  const managerWithRelations = manager as IssueManager & { getRelations?: (id: string) => RelationsData | null };
  const relations = managerWithRelations.getRelations ? managerWithRelations.getRelations(issue.id) : null;
  let relationsHtml = '';
  if (relations && (relations.blockedBy?.length || relations.blocking?.length || 
      relations.related?.length || relations.duplicates?.length)) {
    relationsHtml = `
      <div class="issue-relations">
        <h3>Relations</h3>
        ${relations.blockedBy?.length ? `
          <div class="relation-group">
            <div class="relation-label blocked-by">🚫 Blocked by</div>
            <div class="relation-items">
              ${relations.blockedBy.map((num: number) => 
                `<span class="relation-item blocked-by" onclick="openIssueByNumber(${num})">#${num}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        ${relations.blocking?.length ? `
          <div class="relation-group">
            <div class="relation-label blocking">⚠️ Blocking</div>
            <div class="relation-items">
              ${relations.blocking.map((num: number) => 
                `<span class="relation-item blocking" onclick="openIssueByNumber(${num})">#${num}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        ${relations.related?.length ? `
          <div class="relation-group">
            <div class="relation-label related">🔗 Related</div>
            <div class="relation-items">
              ${relations.related.map((num: number) => 
                `<span class="relation-item" onclick="openIssueByNumber(${num})">#${num}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        ${relations.duplicates?.length ? `
          <div class="relation-group">
            <div class="relation-label duplicate">📋 Duplicates</div>
            <div class="relation-items">
              ${relations.duplicates.map((num: number) => 
                `<span class="relation-item" onclick="openIssueByNumber(${num})">#${num}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        <button class="btn btn-sm" onclick="addRelation('${issue.id}')">Add relation</button>
      </div>
    `;
  } else {
    relationsHtml = `
      <div class="issue-relations">
        <h3>Relations</h3>
        <div class="no-relations">No relations</div>
        <button class="btn btn-sm" onclick="addRelation('${issue.id}')">Add relation</button>
      </div>
    `;
  }
  
  return `
    <div class="issue-detail-panel">
      <div class="issue-detail-header">
        <div class="issue-detail-id">${displayId}</div>
        <button class="close-btn" onclick="closeIssueDetail()">×</button>
      </div>
      
      <div class="issue-detail-title-section">
        <h2 class="issue-detail-title">${escapeHtml(issue.title)}</h2>
      </div>
      
      <div class="issue-detail-meta">
        <div class="meta-row">
          <span class="meta-label">Status</span>
          <select class="status-select" onchange="updateIssueStatus('${issue.id}', this.value)">
            ${Object.entries(STATUS_CONFIG).map(([status, config]) => 
              `<option value="${status}" ${status === issue.status ? 'selected' : ''}>
                ${config.icon} ${status.replace('_', ' ')}
              </option>`
            ).join('')}
          </select>
        </div>
        
        <div class="meta-row">
          <span class="meta-label">Priority</span>
          <select class="priority-select" onchange="updateIssuePriority('${issue.id}', this.value)">
            ${Object.entries(PRIORITY_CONFIG).map(([priority, config]) => 
              `<option value="${priority}" ${priority === issue.priority ? 'selected' : ''}>
                ${config.icon} ${priority}
              </option>`
            ).join('')}
          </select>
        </div>
        
        ${dueDateHtml}
        ${estimateHtml}
        
        <div class="meta-row">
          <span class="meta-label">Assignee</span>
          <input type="text" 
                 class="assignee-input" 
                 value="${issue.assignee || ''}" 
                 placeholder="Unassigned"
                 onchange="updateIssueAssignee('${issue.id}', this.value)">
        </div>
        
        ${hierarchyHtml}
        ${projectCycleHtml}
        
        <div class="meta-row">
          <span class="meta-label">Labels</span>
          <div class="labels-container">
            ${labels || '<span class="no-labels">No labels</span>'}
          </div>
        </div>
      </div>
      
      ${relationsHtml}
      
      <div class="issue-detail-description">
        <h3>Description</h3>
        <div class="description-content">
          ${issue.description ? escapeHtml(issue.description) : '<span class="no-description">No description</span>'}
        </div>
      </div>
      
      ${issue.linkedCommits.length > 0 ? `
        <div class="issue-detail-commits">
          <h3>Linked Commits</h3>
          <div class="commits-list">
            ${issue.linkedCommits.slice(0, 5).map(hash => 
              `<div class="commit-link">${hash.slice(0, 8)}</div>`
            ).join('')}
            ${issue.linkedCommits.length > 5 ? 
              `<div class="more-commits">+${issue.linkedCommits.length - 5} more</div>` : ''
            }
          </div>
        </div>
      ` : ''}
      
      <div class="issue-detail-comments">
        <h3>Comments</h3>
        <div class="comments-list">
          ${commentsHtml || '<div class="no-comments">No comments yet</div>'}
        </div>
        <div class="comment-input">
          <textarea id="new-comment" placeholder="Add a comment..."></textarea>
          <button class="btn btn-secondary" onclick="addComment('${issue.id}')">Comment</button>
        </div>
      </div>
      
      <div class="issue-detail-footer">
        <span class="created-info">Created ${formatTimeAgo(issue.createdAt)} by ${escapeHtml(issue.createdBy)}</span>
      </div>
    </div>
  `;
}

/**
 * Get issue board styles
 */
export function getIssueBoardStyles(): string {
  return `
    /* Issue Board Layout */
    .issue-board {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--spacing-md);
    }
    
    .board-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-lg);
    }
    
    .board-title h2 {
      margin: 0;
      font-size: var(--font-size-xl);
    }
    
    .board-count {
      color: var(--text-tertiary);
      font-size: var(--font-size-sm);
      margin-left: var(--spacing-sm);
    }
    
    .board-columns {
      display: flex;
      gap: var(--spacing-md);
      flex: 1;
      overflow-x: auto;
      padding-bottom: var(--spacing-md);
    }
    
    /* Board Column */
    .board-column {
      flex: 0 0 280px;
      display: flex;
      flex-direction: column;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      max-height: 100%;
    }
    
    .board-column-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--border-muted);
    }
    
    .board-column-icon {
      font-size: 16px;
    }
    
    .board-column-title {
      font-weight: 600;
      font-size: var(--font-size-sm);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .board-column-count {
      margin-left: auto;
      background: var(--bg-overlay);
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    .board-column-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-sm);
      min-height: 200px;
    }
    
    .board-column-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100px;
      color: var(--text-tertiary);
      font-size: var(--font-size-sm);
    }
    
    /* Issue Card */
    .issue-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
      margin-bottom: var(--spacing-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .issue-card:hover {
      border-color: var(--border-focus);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }
    
    .issue-card.dragging {
      opacity: 0.5;
      transform: rotate(2deg);
    }
    
    .issue-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-sm);
    }
    
    .issue-id {
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
      color: var(--accent-info);
    }
    
    .issue-priority {
      font-size: 14px;
    }
    
    .issue-card-title {
      font-size: var(--font-size-sm);
      font-weight: 500;
      color: var(--text-primary);
      line-height: 1.4;
      margin-bottom: var(--spacing-sm);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    
    .issue-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .issue-card-meta {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }
    
    .issue-type {
      font-size: 12px;
    }
    
    .issue-label {
      display: inline-block;
      padding: 2px 6px;
      background: var(--bg-overlay);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
    }
    
    .issue-assignee {
      width: 24px;
      height: 24px;
    }
    
    .issue-assignee .avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%);
      border-radius: var(--radius-full);
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: white;
    }
    
    /* Issue List View */
    .issue-list {
      padding: var(--spacing-md);
    }
    
    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-lg);
    }
    
    .list-title h2 {
      margin: 0;
      display: inline;
    }
    
    .list-count {
      color: var(--text-tertiary);
      font-size: var(--font-size-sm);
      margin-left: var(--spacing-sm);
    }
    
    .issue-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .issue-table th {
      text-align: left;
      padding: var(--spacing-sm) var(--spacing-md);
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border-default);
    }
    
    .issue-row {
      cursor: pointer;
      transition: background var(--transition-fast);
    }
    
    .issue-row:hover {
      background: var(--bg-hover);
    }
    
    .issue-row td {
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--border-muted);
    }
    
    .issue-id-cell {
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      color: var(--accent-info);
      white-space: nowrap;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: var(--radius-full);
      font-size: var(--font-size-xs);
      font-weight: 500;
      text-transform: capitalize;
    }
    
    .priority-indicator {
      font-size: 16px;
    }
    
    .issue-title-cell {
      max-width: 400px;
    }
    
    .issue-title-cell .issue-title {
      font-weight: 500;
    }
    
    .issue-labels {
      display: flex;
      gap: var(--spacing-xs);
      margin-top: var(--spacing-xs);
    }
    
    .assignee {
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
    }
    
    .issue-updated-cell {
      color: var(--text-tertiary);
      font-size: var(--font-size-sm);
      white-space: nowrap;
    }
    
    /* Issue Detail Panel */
    .issue-detail-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--spacing-lg);
      overflow-y: auto;
    }
    
    .issue-detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-md);
    }
    
    .issue-detail-id {
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      color: var(--accent-info);
      background: var(--bg-overlay);
      padding: var(--spacing-xs) var(--spacing-sm);
      border-radius: var(--radius-md);
    }
    
    .close-btn {
      background: transparent;
      border: none;
      font-size: 24px;
      color: var(--text-tertiary);
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    
    .close-btn:hover {
      color: var(--text-primary);
    }
    
    .issue-detail-title-section {
      margin-bottom: var(--spacing-lg);
    }
    
    .issue-detail-title {
      margin: 0;
      font-size: var(--font-size-xxl);
      font-weight: 600;
    }
    
    .issue-detail-meta {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      padding: var(--spacing-lg);
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      margin-bottom: var(--spacing-lg);
    }
    
    .meta-row {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }
    
    .meta-label {
      width: 80px;
      font-size: var(--font-size-sm);
      color: var(--text-tertiary);
    }
    
    .status-select,
    .priority-select,
    .assignee-input {
      flex: 1;
      padding: var(--spacing-sm);
      background: var(--bg-overlay);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: var(--font-size-sm);
    }
    
    .status-select:focus,
    .priority-select:focus,
    .assignee-input:focus {
      outline: none;
      border-color: var(--border-focus);
    }
    
    .labels-container {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs);
    }
    
    .no-labels,
    .no-description {
      color: var(--text-tertiary);
      font-style: italic;
    }
    
    .issue-detail-description {
      margin-bottom: var(--spacing-lg);
    }
    
    .issue-detail-description h3,
    .issue-detail-commits h3,
    .issue-detail-comments h3 {
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: var(--spacing-md);
    }
    
    .description-content {
      font-size: var(--font-size-base);
      line-height: 1.6;
      color: var(--text-primary);
    }
    
    .issue-detail-commits {
      margin-bottom: var(--spacing-lg);
    }
    
    .commits-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }
    
    .commit-link {
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
      padding: var(--spacing-xs) var(--spacing-sm);
      background: var(--bg-overlay);
      border-radius: var(--radius-md);
      color: var(--accent-warning);
    }
    
    .more-commits {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      padding: var(--spacing-xs) var(--spacing-sm);
    }
    
    .issue-detail-comments {
      flex: 1;
    }
    
    .comments-list {
      margin-bottom: var(--spacing-md);
    }
    
    .comment {
      padding: var(--spacing-md);
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      margin-bottom: var(--spacing-sm);
    }
    
    .comment-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: var(--spacing-sm);
    }
    
    .comment-author {
      font-weight: 500;
      font-size: var(--font-size-sm);
    }
    
    .comment-time {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    .comment-content {
      font-size: var(--font-size-sm);
      line-height: 1.5;
    }
    
    .no-comments {
      color: var(--text-tertiary);
      font-size: var(--font-size-sm);
      font-style: italic;
      padding: var(--spacing-md);
    }
    
    .comment-input {
      display: flex;
      gap: var(--spacing-sm);
    }
    
    .comment-input textarea {
      flex: 1;
      min-height: 60px;
      padding: var(--spacing-sm);
      background: var(--bg-overlay);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      resize: vertical;
    }
    
    .comment-input textarea:focus {
      outline: none;
      border-color: var(--border-focus);
    }
    
    .issue-detail-footer {
      margin-top: auto;
      padding-top: var(--spacing-md);
      border-top: 1px solid var(--border-muted);
    }
    
    .created-info {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    /* Cycle Progress */
    .cycle-progress {
      padding: var(--spacing-md);
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      margin-bottom: var(--spacing-md);
    }
    
    .cycle-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-sm);
    }
    
    .cycle-name {
      font-weight: 600;
    }
    
    .cycle-days {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
    }
    
    .cycle-days.overdue {
      color: var(--accent-danger);
    }
    
    .cycle-progress-bar {
      height: 8px;
      background: var(--bg-overlay);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin-bottom: var(--spacing-sm);
    }
    
    .cycle-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-success) 100%);
      border-radius: var(--radius-full);
      transition: width 0.3s ease;
    }
    
    .cycle-stats {
      display: flex;
      gap: var(--spacing-md);
      font-size: var(--font-size-xs);
    }
    
    .cycle-stats .stat {
      color: var(--text-tertiary);
    }
    
    .cycle-stats .stat.done {
      color: var(--accent-success);
    }
    
    .cycle-stats .stat.in-progress {
      color: var(--accent-info);
    }
    
    /* Drag and Drop */
    .board-column-content.drag-over {
      background: var(--bg-hover);
      border: 2px dashed var(--border-focus);
      border-radius: var(--radius-md);
    }
    
    /* ================================================================
       Linear-style Enhancements
       ================================================================ */
    
    /* Issue card badges container */
    .issue-card-badges {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    /* Blocked issue card styling */
    .issue-card-blocked {
      border-left: 3px solid var(--accent-danger);
      opacity: 0.85;
    }
    
    .issue-card-blocked:hover {
      opacity: 1;
    }
    
    /* Due date badges */
    .issue-due-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-weight: 500;
    }
    
    .issue-due-badge.due-overdue {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    
    .issue-due-badge.due-today {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    
    .issue-due-badge.due-soon {
      background: rgba(234, 179, 8, 0.15);
      color: #eab308;
    }
    
    .issue-due-badge.due-week {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
    }
    
    .issue-due-badge.due-normal {
      background: var(--bg-overlay);
      color: var(--text-tertiary);
    }
    
    /* Blocked/Blocking badges */
    .issue-blocked-badge,
    .issue-blocking-badge {
      font-size: 12px;
      cursor: help;
    }
    
    /* Estimate badge */
    .issue-estimate-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      background: var(--bg-overlay);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      font-weight: 500;
    }
    
    /* Parent indicator */
    .issue-parent-indicator {
      color: var(--text-tertiary);
      margin-right: 2px;
    }
    
    /* Project/Cycle badges */
    .issue-project-badge,
    .issue-cycle-badge {
      font-size: 11px;
      padding: 2px 4px;
      background: var(--bg-overlay);
      border-radius: var(--radius-sm);
      color: var(--text-tertiary);
    }
    
    /* Sub-issue progress */
    .issue-sub-progress {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: var(--spacing-xs) 0;
      padding: 4px 8px;
      background: var(--bg-overlay);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
    }
    
    .issue-sub-progress .sub-icon {
      color: var(--text-tertiary);
    }
    
    .issue-sub-progress .sub-count {
      color: var(--text-secondary);
      font-weight: 500;
    }
    
    /* Sub-issue progress bar (alternative display) */
    .issue-sub-progress-bar {
      height: 4px;
      background: var(--bg-overlay);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin: var(--spacing-xs) 0;
    }
    
    .issue-sub-progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-success) 100%);
      border-radius: var(--radius-full);
      transition: width 0.3s ease;
    }
    
    /* Relations section in detail panel */
    .issue-relations {
      margin-bottom: var(--spacing-lg);
    }
    
    .issue-relations h3 {
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: var(--spacing-md);
    }
    
    .relation-group {
      margin-bottom: var(--spacing-sm);
    }
    
    .relation-label {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      margin-bottom: var(--spacing-xs);
    }
    
    .relation-label.blocked-by {
      color: var(--accent-danger);
    }
    
    .relation-label.blocking {
      color: var(--accent-warning);
    }
    
    .relation-label.related {
      color: var(--accent-info);
    }
    
    .relation-label.duplicate {
      color: var(--text-tertiary);
    }
    
    .relation-items {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs);
    }
    
    .relation-item {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      background: var(--bg-overlay);
      border-radius: var(--radius-md);
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .relation-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .relation-item.blocked-by {
      border-left: 2px solid var(--accent-danger);
    }
    
    .relation-item.blocking {
      border-left: 2px solid var(--accent-warning);
    }
    
    /* Project progress in sidebar */
    .project-progress-sidebar {
      padding: var(--spacing-md);
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      margin-bottom: var(--spacing-md);
    }
    
    .project-progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-sm);
    }
    
    .project-progress-name {
      font-weight: 600;
      font-size: var(--font-size-sm);
    }
    
    .project-progress-status {
      font-size: var(--font-size-xs);
      padding: 2px 8px;
      border-radius: var(--radius-full);
      background: var(--bg-overlay);
      color: var(--text-secondary);
    }
    
    .project-progress-status.in_progress {
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }
    
    .project-progress-status.completed {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    
    .project-progress-status.at_risk {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    
    /* Filter dropdowns for priority/project/cycle */
    .board-filters {
      display: flex;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
    }
    
    .filter-dropdown {
      position: relative;
    }
    
    .filter-button {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-overlay);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .filter-button:hover {
      border-color: var(--border-focus);
      color: var(--text-primary);
    }
    
    .filter-button.active {
      background: var(--accent-primary);
      color: white;
      border-color: var(--accent-primary);
    }
    
    .filter-menu {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: var(--spacing-xs);
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      min-width: 180px;
      z-index: 100;
      display: none;
    }
    
    .filter-menu.open {
      display: block;
    }
    
    .filter-option {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      cursor: pointer;
      transition: background var(--transition-fast);
    }
    
    .filter-option:hover {
      background: var(--bg-hover);
    }
    
    .filter-option.selected {
      background: rgba(var(--accent-primary-rgb), 0.1);
    }
    
    /* Overdue issues highlight in list view */
    .issue-row.overdue {
      background: rgba(239, 68, 68, 0.05);
    }
    
    .issue-row.overdue:hover {
      background: rgba(239, 68, 68, 0.1);
    }
    
    /* Due date column in list view */
    .issue-due-cell {
      white-space: nowrap;
    }
    
    /* Estimate column in list view */
    .issue-estimate-cell {
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
    }
    
    /* Sub-issues expandable section */
    .issue-row.has-sub-issues .issue-id-cell {
      cursor: pointer;
    }
    
    .issue-row.sub-issue {
      background: var(--bg-overlay);
    }
    
    .issue-row.sub-issue .issue-id-cell {
      padding-left: calc(var(--spacing-md) + 20px);
    }
    
    .sub-issue-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-right: var(--spacing-xs);
      cursor: pointer;
      color: var(--text-tertiary);
    }
    
    .sub-issue-toggle:hover {
      color: var(--text-primary);
    }
  `;
}

/**
 * Get issue board JavaScript
 */
export function getIssueBoardScript(): string {
  return `
    // Issue Board JavaScript
    let draggedIssue = null;
    
    // Drag and Drop handlers
    document.querySelectorAll('.issue-card').forEach(card => {
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragend', handleDragEnd);
    });
    
    function handleDragStart(e) {
      draggedIssue = e.target;
      e.target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', e.target.dataset.id);
    }
    
    function handleDragEnd(e) {
      e.target.classList.remove('dragging');
      document.querySelectorAll('.board-column-content').forEach(col => {
        col.classList.remove('drag-over');
      });
      draggedIssue = null;
    }
    
    function handleDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      e.currentTarget.classList.add('drag-over');
    }
    
    function handleDrop(e, newStatus) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      
      if (draggedIssue) {
        const issueId = draggedIssue.dataset.id;
        updateIssueStatus(issueId, newStatus);
      }
    }
    
    // Issue CRUD operations
    async function createIssue() {
      const title = prompt('Issue title:');
      if (!title) return;
      
      try {
        const res = await fetch('/api/issues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        const issue = await res.json();
        showToast('Created issue ' + issue.displayId, 'success');
        loadIssues();
      } catch (err) {
        showToast('Failed to create issue', 'error');
      }
    }
    
    async function updateIssueStatus(issueId, status) {
      try {
        await fetch('/api/issues/' + issueId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        loadIssues();
      } catch (err) {
        showToast('Failed to update issue', 'error');
      }
    }
    
    async function updateIssuePriority(issueId, priority) {
      try {
        await fetch('/api/issues/' + issueId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority })
        });
        loadIssues();
      } catch (err) {
        showToast('Failed to update issue', 'error');
      }
    }
    
    async function updateIssueAssignee(issueId, assignee) {
      try {
        await fetch('/api/issues/' + issueId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignee: assignee || null })
        });
        loadIssues();
      } catch (err) {
        showToast('Failed to update issue', 'error');
      }
    }
    
    async function addComment(issueId) {
      const textarea = document.getElementById('new-comment');
      const content = textarea.value.trim();
      if (!content) return;
      
      try {
        await fetch('/api/issues/' + issueId + '/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        textarea.value = '';
        openIssueDetail(issueId);
      } catch (err) {
        showToast('Failed to add comment', 'error');
      }
    }
    
    function openIssueDetail(issueId) {
      fetch('/api/issues/' + issueId + '/detail')
        .then(res => res.text())
        .then(html => {
          document.getElementById('issue-detail-panel').innerHTML = html;
          document.getElementById('issue-detail-panel').classList.add('open');
        });
    }
    
    function closeIssueDetail() {
      document.getElementById('issue-detail-panel').classList.remove('open');
    }
    
    async function loadIssues() {
      const res = await fetch('/api/issues/board');
      const html = await res.text();
      document.getElementById('issues-container').innerHTML = html;
      
      // Re-attach drag handlers
      document.querySelectorAll('.issue-card').forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
      });
    }
    
    // Keyboard shortcuts for issues
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' && !isInputFocused()) {
        e.preventDefault();
        createIssue();
      }
      if (e.key === 'Escape') {
        closeIssueDetail();
      }
    });
    
    // ================================================================
    // Linear-style additional functions
    // ================================================================
    
    async function updateIssueEstimate(issueId, estimate) {
      try {
        await fetch('/api/issues/' + issueId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estimate: estimate ? parseInt(estimate) : null })
        });
        loadIssues();
      } catch (err) {
        showToast('Failed to update estimate', 'error');
      }
    }
    
    async function setDueDate(issueId) {
      const dateStr = prompt('Due date (YYYY-MM-DD or "tomorrow", "next week"):');
      if (!dateStr) return;
      
      try {
        // Try to parse relative dates
        let dueDate;
        const lower = dateStr.toLowerCase().trim();
        if (lower === 'today') {
          dueDate = new Date().toISOString();
        } else if (lower === 'tomorrow') {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          dueDate = d.toISOString();
        } else if (lower === 'next week') {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          dueDate = d.toISOString();
        } else {
          dueDate = new Date(dateStr).toISOString();
        }
        
        await fetch('/api/issues/' + issueId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dueDate })
        });
        showToast('Due date set', 'success');
        openIssueDetail(issueId);
      } catch (err) {
        showToast('Failed to set due date', 'error');
      }
    }
    
    async function clearDueDate(issueId) {
      try {
        await fetch('/api/issues/' + issueId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dueDate: null })
        });
        showToast('Due date cleared', 'success');
        openIssueDetail(issueId);
      } catch (err) {
        showToast('Failed to clear due date', 'error');
      }
    }
    
    async function removeParent(issueId) {
      try {
        await fetch('/api/issues/' + issueId + '/parent', {
          method: 'DELETE'
        });
        showToast('Parent removed', 'success');
        openIssueDetail(issueId);
        loadIssues();
      } catch (err) {
        showToast('Failed to remove parent', 'error');
      }
    }
    
    function openIssueByNumber(number) {
      fetch('/api/issues/by-number/' + number)
        .then(res => res.json())
        .then(issue => {
          openIssueDetail(issue.id);
        })
        .catch(err => {
          showToast('Issue not found', 'error');
        });
    }
    
    async function addRelation(issueId) {
      const relatedNumber = prompt('Related issue number:');
      if (!relatedNumber) return;
      
      const relationType = prompt('Relation type (blocks, relates_to, duplicates):') || 'relates_to';
      
      try {
        await fetch('/api/issues/' + issueId + '/relations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            relatedNumber: parseInt(relatedNumber),
            type: relationType
          })
        });
        showToast('Relation added', 'success');
        openIssueDetail(issueId);
      } catch (err) {
        showToast('Failed to add relation', 'error');
      }
    }
    
    function toggleSubIssues(issueId) {
      const row = document.querySelector('[data-id="' + issueId + '"]');
      if (!row) return;
      
      const toggle = row.querySelector('.sub-issue-toggle');
      const isExpanded = toggle.textContent.trim() === '▼';
      
      // Find all sub-issue rows for this parent
      const subRows = document.querySelectorAll('.sub-issue[data-parent="' + issueId + '"]');
      
      if (isExpanded) {
        // Collapse
        toggle.textContent = '▶';
        subRows.forEach(r => r.style.display = 'none');
      } else {
        // Expand
        toggle.textContent = '▼';
        subRows.forEach(r => r.style.display = '');
      }
    }
    
    // Filter menu toggle
    function toggleFilter(filterType) {
      const menu = document.querySelector('.filter-menu.' + filterType);
      if (menu) {
        menu.classList.toggle('open');
      }
    }
    
    // Apply filter
    async function applyFilter(filterType, value) {
      const params = new URLSearchParams(window.location.search);
      if (value) {
        params.set(filterType, value);
      } else {
        params.delete(filterType);
      }
      window.location.search = params.toString();
    }
  `;
}

// Helper functions

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'bug': return '🐛';
    case 'feature': return '✨';
    case 'improvement': return '⚡';
    case 'task': return '📋';
    case 'chore': return '🔧';
    default: return '📋';
  }
}
