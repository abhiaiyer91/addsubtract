/**
 * Issue Tracking System for wit
 * Linear-inspired local-first project management
 * 
 * Features:
 * - Local-first: Issues stored in .wit/issues.json, work offline
 * - Linear-like IDs: WIT-1, WIT-2, etc.
 * - Cycles (sprints) for time-boxed work
 * - Labels, priorities, and assignments
 * - Commit integration: --closes WIT-123
 * - Fast keyboard-driven workflow
 */

import * as path from 'path';
import * as crypto from 'crypto';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';

/**
 * Issue priority levels (Linear-style)
 */
export type IssuePriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

/**
 * Issue status (Linear-style workflow)
 * These are the built-in statuses; users can define custom stages via the database
 */
export type IssueStatus = 
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'cancelled';

/**
 * Custom stage definition (for user-defined workflow stages)
 */
export interface CustomStage {
  key: string;           // Unique identifier (e.g., 'backlog', 'custom_review')
  name: string;          // Display name
  description?: string;  // Optional description
  icon: string;          // Icon to display (emoji or identifier)
  color: string;         // Hex color without #
  position: number;      // Order in the workflow
  isClosedState: boolean; // Whether this stage closes the issue
  isTriageState: boolean; // Whether this is the initial triage stage
  isDefault: boolean;    // Whether this is the default stage for new issues
}

/**
 * Issue type
 */
export type IssueType = 'feature' | 'bug' | 'improvement' | 'task' | 'chore';

/**
 * An issue in the tracker
 */
export interface Issue {
  id: string;              // UUID
  number: number;          // Sequential number for WIT-123 style IDs
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  type: IssueType;
  labels: string[];
  assignee?: string;
  cycleId?: string;        // Which cycle/sprint this belongs to
  parentId?: string;       // For sub-issues
  linkedCommits: string[]; // Commit hashes that reference this issue
  linkedBranch?: string;   // Branch created for this issue
  estimate?: number;       // Story points or hours
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  createdBy: string;
}

/**
 * A cycle (sprint) for time-boxed work
 */
export interface Cycle {
  id: string;
  number: number;          // Cycle 1, Cycle 2, etc.
  name: string;
  description?: string;
  startDate: number;
  endDate: number;
  status: 'upcoming' | 'active' | 'completed';
  issueIds: string[];
  createdAt: number;
}

/**
 * Project for grouping related issues
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  prefix: string;          // For issue IDs: PROJECT-123
  color: string;
  issueIds: string[];
  createdAt: number;
}

/**
 * Label for categorizing issues
 */
export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}

/**
 * Comment on an issue
 */
export interface Comment {
  id: string;
  issueId: string;
  author: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
}

/**
 * Issue activity/history entry
 */
export interface Activity {
  id: string;
  issueId: string;
  type: 'created' | 'status_changed' | 'assigned' | 'labeled' | 'commented' | 'linked_commit' | 'moved_cycle';
  actor: string;
  timestamp: number;
  oldValue?: string;
  newValue?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Storage format for issues
 */
interface IssueStorage {
  version: 2;
  prefix: string;          // Default prefix for issue IDs
  nextNumber: number;      // Next issue number
  nextCycleNumber: number; // Next cycle number
  issues: Issue[];
  cycles: Cycle[];
  projects: Project[];
  labels: Label[];
  comments: Comment[];
  activities: Activity[];
  customStages?: CustomStage[]; // User-defined workflow stages
}

/**
 * Default stages matching the built-in status workflow
 */
const DEFAULT_CUSTOM_STAGES: CustomStage[] = [
  { key: 'triage', name: 'Triage', icon: '◇', color: '9ca3af', position: 0, isClosedState: false, isTriageState: true, isDefault: false },
  { key: 'backlog', name: 'Backlog', icon: '○', color: '6b7280', position: 1, isClosedState: false, isTriageState: false, isDefault: true },
  { key: 'todo', name: 'Todo', icon: '◔', color: 'f59e0b', position: 2, isClosedState: false, isTriageState: false, isDefault: false },
  { key: 'in_progress', name: 'In Progress', icon: '◑', color: '3b82f6', position: 3, isClosedState: false, isTriageState: false, isDefault: false },
  { key: 'in_review', name: 'In Review', icon: '◕', color: '8b5cf6', position: 4, isClosedState: false, isTriageState: false, isDefault: false },
  { key: 'done', name: 'Done', icon: '●', color: '22c55e', position: 5, isClosedState: true, isTriageState: false, isDefault: false },
  { key: 'cancelled', name: 'Cancelled', icon: '⊘', color: 'ef4444', position: 6, isClosedState: true, isTriageState: false, isDefault: false },
];

const DEFAULT_STORAGE: IssueStorage = {
  version: 2,
  prefix: 'WIT',
  nextNumber: 1,
  nextCycleNumber: 1,
  issues: [],
  cycles: [],
  projects: [],
  labels: [],
  comments: [],
  activities: [],
  customStages: DEFAULT_CUSTOM_STAGES,
};

/**
 * Default labels
 */
const DEFAULT_LABELS: Label[] = [
  { id: 'bug', name: 'bug', color: '#ef4444', description: 'Something is broken' },
  { id: 'feature', name: 'feature', color: '#22c55e', description: 'New functionality' },
  { id: 'improvement', name: 'improvement', color: '#3b82f6', description: 'Enhancement to existing feature' },
  { id: 'documentation', name: 'docs', color: '#8b5cf6', description: 'Documentation updates' },
  { id: 'performance', name: 'performance', color: '#f59e0b', description: 'Performance improvements' },
  { id: 'security', name: 'security', color: '#dc2626', description: 'Security related' },
];

/**
 * Status display order and colors
 */
export const STATUS_CONFIG: Record<IssueStatus, { order: number; color: string; icon: string }> = {
  backlog: { order: 0, color: '#6b7280', icon: '○' },
  todo: { order: 1, color: '#f59e0b', icon: '◔' },
  in_progress: { order: 2, color: '#3b82f6', icon: '◑' },
  in_review: { order: 3, color: '#8b5cf6', icon: '◕' },
  done: { order: 4, color: '#22c55e', icon: '●' },
  cancelled: { order: 5, color: '#ef4444', icon: '⊘' },
};

/**
 * Priority display config
 */
export const PRIORITY_CONFIG: Record<IssuePriority, { order: number; color: string; icon: string }> = {
  urgent: { order: 0, color: '#ef4444', icon: '⚡' },
  high: { order: 1, color: '#f59e0b', icon: '↑' },
  medium: { order: 2, color: '#3b82f6', icon: '→' },
  low: { order: 3, color: '#6b7280', icon: '↓' },
  none: { order: 4, color: '#374151', icon: '−' },
};

/**
 * Issue Manager - handles all issue operations
 */
export class IssueManager {
  private storagePath: string;
  private issuesDir: string;
  private storage: IssueStorage;

  constructor(gitDir: string) {
    this.issuesDir = path.join(gitDir, 'issues');
    this.storagePath = path.join(this.issuesDir, 'issues.json');
    this.storage = this.load();
  }

  /**
   * Initialize issues directory and default labels
   */
  init(): void {
    mkdirp(this.issuesDir);
    
    // Add default labels if none exist
    if (this.storage.labels.length === 0) {
      this.storage.labels = [...DEFAULT_LABELS];
    }
    
    this.save();
  }

  /**
   * Load storage from disk
   */
  private load(): IssueStorage {
    if (!exists(this.storagePath)) {
      return { ...DEFAULT_STORAGE };
    }

    try {
      const content = readFile(this.storagePath).toString('utf8');
      const data = JSON.parse(content);
      return { ...DEFAULT_STORAGE, ...data };
    } catch {
      return { ...DEFAULT_STORAGE };
    }
  }

  /**
   * Save storage to disk
   */
  private save(): void {
    mkdirp(this.issuesDir);
    writeFile(this.storagePath, JSON.stringify(this.storage, null, 2));
  }

  /**
   * Get the current user (from environment)
   */
  private getCurrentUser(): string {
    return process.env.WIT_AUTHOR_NAME || 
           process.env.GIT_AUTHOR_NAME || 
           process.env.USER || 
           'anonymous';
  }

  /**
   * Record an activity
   */
  private recordActivity(
    issueId: string,
    type: Activity['type'],
    oldValue?: string,
    newValue?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.storage.activities.push({
      id: crypto.randomUUID(),
      issueId,
      type,
      actor: this.getCurrentUser(),
      timestamp: Date.now(),
      oldValue,
      newValue,
      metadata,
    });
  }

  // ========================================
  // ISSUE CRUD OPERATIONS
  // ========================================

  /**
   * Create a new issue
   */
  create(options: {
    title: string;
    description?: string;
    type?: IssueType;
    priority?: IssuePriority;
    status?: IssueStatus;
    labels?: string[];
    assignee?: string;
    cycleId?: string;
    parentId?: string;
    estimate?: number;
  }): Issue {
    const issue: Issue = {
      id: crypto.randomUUID(),
      number: this.storage.nextNumber++,
      title: options.title.trim(),
      description: options.description?.trim() || '',
      status: options.status || 'backlog',
      priority: options.priority || 'none',
      type: options.type || 'task',
      labels: options.labels || [],
      assignee: options.assignee,
      cycleId: options.cycleId,
      parentId: options.parentId,
      linkedCommits: [],
      estimate: options.estimate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: this.getCurrentUser(),
    };

    this.storage.issues.push(issue);
    this.recordActivity(issue.id, 'created');
    this.save();

    return issue;
  }

  /**
   * Get an issue by ID or number
   */
  get(idOrNumber: string | number): Issue | null {
    if (typeof idOrNumber === 'number') {
      return this.storage.issues.find(i => i.number === idOrNumber) || null;
    }
    
    // Check if it's a WIT-123 style ID
    const match = idOrNumber.match(/^([A-Z]+)-(\d+)$/i);
    if (match) {
      const num = parseInt(match[2], 10);
      return this.storage.issues.find(i => i.number === num) || null;
    }
    
    // Otherwise, try UUID
    return this.storage.issues.find(i => i.id === idOrNumber) || null;
  }

  /**
   * Update an issue
   */
  update(idOrNumber: string | number, updates: Partial<Omit<Issue, 'id' | 'number' | 'createdAt' | 'createdBy'>>): Issue | null {
    const issue = this.get(idOrNumber);
    if (!issue) return null;

    // Track status changes
    if (updates.status && updates.status !== issue.status) {
      this.recordActivity(issue.id, 'status_changed', issue.status, updates.status);
      
      // Set closedAt if moving to done/cancelled
      if (updates.status === 'done' || updates.status === 'cancelled') {
        updates.closedAt = Date.now();
      } else if (issue.closedAt) {
        updates.closedAt = undefined;
      }
    }

    // Track assignment changes
    if (updates.assignee !== undefined && updates.assignee !== issue.assignee) {
      this.recordActivity(issue.id, 'assigned', issue.assignee, updates.assignee);
    }

    // Apply updates
    Object.assign(issue, updates, { updatedAt: Date.now() });
    this.save();

    return issue;
  }

  /**
   * Delete an issue
   */
  delete(idOrNumber: string | number): boolean {
    const issue = this.get(idOrNumber);
    if (!issue) return false;

    const index = this.storage.issues.findIndex(i => i.id === issue.id);
    if (index !== -1) {
      this.storage.issues.splice(index, 1);
      
      // Remove from any cycles
      for (const cycle of this.storage.cycles) {
        const idx = cycle.issueIds.indexOf(issue.id);
        if (idx !== -1) cycle.issueIds.splice(idx, 1);
      }
      
      // Remove comments and activities
      this.storage.comments = this.storage.comments.filter(c => c.issueId !== issue.id);
      this.storage.activities = this.storage.activities.filter(a => a.issueId !== issue.id);
      
      this.save();
      return true;
    }

    return false;
  }

  /**
   * List issues with optional filters
   */
  list(options: {
    status?: IssueStatus | IssueStatus[];
    priority?: IssuePriority | IssuePriority[];
    type?: IssueType | IssueType[];
    labels?: string[];
    assignee?: string;
    cycleId?: string;
    search?: string;
    limit?: number;
    sortBy?: 'created' | 'updated' | 'priority' | 'status';
    sortOrder?: 'asc' | 'desc';
  } = {}): Issue[] {
    let issues = [...this.storage.issues];

    // Filter by status
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      issues = issues.filter(i => statuses.includes(i.status));
    }

    // Filter by priority
    if (options.priority) {
      const priorities = Array.isArray(options.priority) ? options.priority : [options.priority];
      issues = issues.filter(i => priorities.includes(i.priority));
    }

    // Filter by type
    if (options.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      issues = issues.filter(i => types.includes(i.type));
    }

    // Filter by labels
    if (options.labels && options.labels.length > 0) {
      issues = issues.filter(i => 
        options.labels!.some(l => i.labels.includes(l))
      );
    }

    // Filter by assignee
    if (options.assignee) {
      issues = issues.filter(i => i.assignee === options.assignee);
    }

    // Filter by cycle
    if (options.cycleId) {
      issues = issues.filter(i => i.cycleId === options.cycleId);
    }

    // Search in title and description
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      issues = issues.filter(i => 
        i.title.toLowerCase().includes(searchLower) ||
        i.description.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    switch (options.sortBy) {
      case 'priority':
        issues.sort((a, b) => 
          (PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order) * sortOrder
        );
        break;
      case 'status':
        issues.sort((a, b) => 
          (STATUS_CONFIG[a.status].order - STATUS_CONFIG[b.status].order) * sortOrder
        );
        break;
      case 'updated':
        issues.sort((a, b) => (a.updatedAt - b.updatedAt) * sortOrder);
        break;
      case 'created':
      default:
        issues.sort((a, b) => (a.createdAt - b.createdAt) * sortOrder);
        break;
    }

    // Limit
    if (options.limit) {
      issues = issues.slice(0, options.limit);
    }

    return issues;
  }

  /**
   * Get issue display ID (WIT-123)
   */
  getDisplayId(issue: Issue): string {
    return `${this.storage.prefix}-${issue.number}`;
  }

  /**
   * Parse a display ID to get issue number
   */
  parseDisplayId(displayId: string): number | null {
    const match = displayId.match(/^([A-Z]+)-(\d+)$/i);
    if (match) {
      return parseInt(match[2], 10);
    }
    return null;
  }

  // ========================================
  // COMMIT INTEGRATION
  // ========================================

  /**
   * Link a commit to an issue
   */
  linkCommit(idOrNumber: string | number, commitHash: string): boolean {
    const issue = this.get(idOrNumber);
    if (!issue) return false;

    if (!issue.linkedCommits.includes(commitHash)) {
      issue.linkedCommits.push(commitHash);
      issue.updatedAt = Date.now();
      this.recordActivity(issue.id, 'linked_commit', undefined, commitHash);
      this.save();
    }

    return true;
  }

  /**
   * Close an issue (usually from commit message)
   */
  close(idOrNumber: string | number, commitHash?: string): Issue | null {
    const issue = this.get(idOrNumber);
    if (!issue) return null;

    if (commitHash) {
      this.linkCommit(idOrNumber, commitHash);
    }

    return this.update(idOrNumber, { status: 'done' });
  }

  /**
   * Parse commit message for issue references
   * Supports: closes WIT-123, fixes #123, refs WIT-456
   */
  parseCommitMessage(message: string): {
    closes: number[];
    refs: number[];
  } {
    const closes: number[] = [];
    const refs: number[] = [];

    // Match "closes WIT-123" or "fixes WIT-123"
    const closePattern = /(?:closes?|fixes?|resolves?)\s+(?:WIT-)?#?(\d+)/gi;
    let match;
    while ((match = closePattern.exec(message)) !== null) {
      closes.push(parseInt(match[1], 10));
    }

    // Match "refs WIT-123" or just "WIT-123"
    const refPattern = /(?:refs?|see|re:?)?\s*WIT-(\d+)/gi;
    while ((match = refPattern.exec(message)) !== null) {
      const num = parseInt(match[1], 10);
      if (!closes.includes(num)) {
        refs.push(num);
      }
    }

    return { closes, refs };
  }

  /**
   * Process a commit and update linked issues
   */
  processCommit(message: string, commitHash: string): {
    closed: Issue[];
    referenced: Issue[];
  } {
    const { closes, refs } = this.parseCommitMessage(message);
    const closed: Issue[] = [];
    const referenced: Issue[] = [];

    for (const num of closes) {
      const issue = this.close(num, commitHash);
      if (issue) closed.push(issue);
    }

    for (const num of refs) {
      const issue = this.get(num);
      if (issue) {
        this.linkCommit(num, commitHash);
        referenced.push(issue);
      }
    }

    return { closed, referenced };
  }

  // ========================================
  // CYCLE OPERATIONS
  // ========================================

  /**
   * Create a new cycle
   */
  createCycle(options: {
    name?: string;
    description?: string;
    startDate: Date | number;
    endDate: Date | number;
  }): Cycle {
    const number = this.storage.nextCycleNumber++;
    const cycle: Cycle = {
      id: crypto.randomUUID(),
      number,
      name: options.name || `Cycle ${number}`,
      description: options.description,
      startDate: typeof options.startDate === 'number' ? options.startDate : options.startDate.getTime(),
      endDate: typeof options.endDate === 'number' ? options.endDate : options.endDate.getTime(),
      status: 'upcoming',
      issueIds: [],
      createdAt: Date.now(),
    };

    // Determine status based on dates
    const now = Date.now();
    if (now >= cycle.startDate && now < cycle.endDate) {
      cycle.status = 'active';
    } else if (now >= cycle.endDate) {
      cycle.status = 'completed';
    }

    this.storage.cycles.push(cycle);
    this.save();

    return cycle;
  }

  /**
   * Get a cycle by ID or number
   */
  getCycle(idOrNumber: string | number): Cycle | null {
    if (typeof idOrNumber === 'number') {
      return this.storage.cycles.find(c => c.number === idOrNumber) || null;
    }
    return this.storage.cycles.find(c => c.id === idOrNumber) || null;
  }

  /**
   * Get the current active cycle
   */
  getActiveCycle(): Cycle | null {
    const now = Date.now();
    return this.storage.cycles.find(c => 
      c.status === 'active' || (now >= c.startDate && now < c.endDate)
    ) || null;
  }

  /**
   * List all cycles
   */
  listCycles(status?: Cycle['status']): Cycle[] {
    let cycles = [...this.storage.cycles];
    
    if (status) {
      cycles = cycles.filter(c => c.status === status);
    }
    
    return cycles.sort((a, b) => b.startDate - a.startDate);
  }

  /**
   * Add issue to cycle
   */
  addToCycle(issueIdOrNumber: string | number, cycleIdOrNumber: string | number): boolean {
    const issue = this.get(issueIdOrNumber);
    const cycle = this.getCycle(cycleIdOrNumber);
    
    if (!issue || !cycle) return false;

    // Remove from current cycle if any
    if (issue.cycleId) {
      const oldCycle = this.getCycle(issue.cycleId);
      if (oldCycle) {
        const idx = oldCycle.issueIds.indexOf(issue.id);
        if (idx !== -1) oldCycle.issueIds.splice(idx, 1);
      }
    }

    // Add to new cycle
    issue.cycleId = cycle.id;
    if (!cycle.issueIds.includes(issue.id)) {
      cycle.issueIds.push(issue.id);
    }
    
    issue.updatedAt = Date.now();
    this.recordActivity(issue.id, 'moved_cycle', issue.cycleId, cycle.id);
    this.save();

    return true;
  }

  /**
   * Get cycle progress
   */
  getCycleProgress(cycleIdOrNumber: string | number): {
    total: number;
    done: number;
    inProgress: number;
    todo: number;
    percentage: number;
  } {
    const cycle = this.getCycle(cycleIdOrNumber);
    if (!cycle) {
      return { total: 0, done: 0, inProgress: 0, todo: 0, percentage: 0 };
    }

    const issues = this.list({ cycleId: cycle.id });
    const done = issues.filter(i => i.status === 'done' || i.status === 'cancelled').length;
    const inProgress = issues.filter(i => i.status === 'in_progress' || i.status === 'in_review').length;
    const todo = issues.filter(i => i.status === 'backlog' || i.status === 'todo').length;

    return {
      total: issues.length,
      done,
      inProgress,
      todo,
      percentage: issues.length > 0 ? Math.round((done / issues.length) * 100) : 0,
    };
  }

  // ========================================
  // LABEL OPERATIONS
  // ========================================

  /**
   * Create a label
   */
  createLabel(name: string, color: string, description?: string): Label {
    const label: Label = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      color,
      description,
    };

    this.storage.labels.push(label);
    this.save();

    return label;
  }

  /**
   * Get all labels
   */
  getLabels(): Label[] {
    return [...this.storage.labels];
  }

  /**
   * Add label to issue
   */
  addLabel(issueIdOrNumber: string | number, labelName: string): boolean {
    const issue = this.get(issueIdOrNumber);
    if (!issue) return false;

    if (!issue.labels.includes(labelName)) {
      issue.labels.push(labelName);
      issue.updatedAt = Date.now();
      this.recordActivity(issue.id, 'labeled', undefined, labelName);
      this.save();
    }

    return true;
  }

  /**
   * Remove label from issue
   */
  removeLabel(issueIdOrNumber: string | number, labelName: string): boolean {
    const issue = this.get(issueIdOrNumber);
    if (!issue) return false;

    const idx = issue.labels.indexOf(labelName);
    if (idx !== -1) {
      issue.labels.splice(idx, 1);
      issue.updatedAt = Date.now();
      this.save();
    }

    return true;
  }

  // ========================================
  // COMMENT OPERATIONS
  // ========================================

  /**
   * Add comment to issue
   */
  addComment(issueIdOrNumber: string | number, content: string): Comment | null {
    const issue = this.get(issueIdOrNumber);
    if (!issue) return null;

    const comment: Comment = {
      id: crypto.randomUUID(),
      issueId: issue.id,
      author: this.getCurrentUser(),
      content: content.trim(),
      createdAt: Date.now(),
    };

    this.storage.comments.push(comment);
    issue.updatedAt = Date.now();
    this.recordActivity(issue.id, 'commented');
    this.save();

    return comment;
  }

  /**
   * Get comments for an issue
   */
  getComments(issueIdOrNumber: string | number): Comment[] {
    const issue = this.get(issueIdOrNumber);
    if (!issue) return [];

    return this.storage.comments
      .filter(c => c.issueId === issue.id)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  // ========================================
  // ACTIVITY OPERATIONS
  // ========================================

  /**
   * Get activity for an issue
   */
  getActivity(issueIdOrNumber: string | number): Activity[] {
    const issue = this.get(issueIdOrNumber);
    if (!issue) return [];

    return this.storage.activities
      .filter(a => a.issueId === issue.id)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get recent activity across all issues
   */
  getRecentActivity(limit: number = 20): Activity[] {
    return [...this.storage.activities]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // ========================================
  // STATISTICS
  // ========================================

  /**
   * Get issue statistics
   */
  getStats(): {
    total: number;
    open: number;
    closed: number;
    byStatus: Record<IssueStatus, number>;
    byPriority: Record<IssuePriority, number>;
    byType: Record<IssueType, number>;
  } {
    const issues = this.storage.issues;
    
    const byStatus: Record<IssueStatus, number> = {
      backlog: 0, todo: 0, in_progress: 0, in_review: 0, done: 0, cancelled: 0,
    };
    
    const byPriority: Record<IssuePriority, number> = {
      urgent: 0, high: 0, medium: 0, low: 0, none: 0,
    };
    
    const byType: Record<IssueType, number> = {
      feature: 0, bug: 0, improvement: 0, task: 0, chore: 0,
    };

    for (const issue of issues) {
      byStatus[issue.status]++;
      byPriority[issue.priority]++;
      byType[issue.type]++;
    }

    const closed = byStatus.done + byStatus.cancelled;
    const open = issues.length - closed;

    return {
      total: issues.length,
      open,
      closed,
      byStatus,
      byPriority,
      byType,
    };
  }

  /**
   * Get velocity (issues closed per cycle)
   */
  getVelocity(cycleCount: number = 5): { cycle: string; completed: number }[] {
    const completedCycles = this.listCycles('completed').slice(0, cycleCount);
    
    return completedCycles.map(cycle => {
      const issues = this.list({ cycleId: cycle.id });
      const completed = issues.filter(i => i.status === 'done').length;
      
      return {
        cycle: cycle.name,
        completed,
      };
    });
  }

  // ========================================
  // CUSTOM STAGE OPERATIONS
  // ========================================

  /**
   * Get all custom stages
   */
  getStages(): CustomStage[] {
    return this.storage.customStages || DEFAULT_CUSTOM_STAGES;
  }

  /**
   * Get a stage by key
   */
  getStage(key: string): CustomStage | null {
    const stages = this.getStages();
    return stages.find(s => s.key === key) || null;
  }

  /**
   * Get stage config for display (with order, color, icon)
   */
  getStageConfig(): Record<string, { order: number; color: string; icon: string; name: string }> {
    const stages = this.getStages();
    const config: Record<string, { order: number; color: string; icon: string; name: string }> = {};
    
    for (const stage of stages) {
      config[stage.key] = {
        order: stage.position,
        color: `#${stage.color}`,
        icon: stage.icon,
        name: stage.name,
      };
    }
    
    return config;
  }

  /**
   * Create a new custom stage
   */
  createStage(options: {
    key: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    position?: number;
    isClosedState?: boolean;
    isTriageState?: boolean;
    isDefault?: boolean;
  }): CustomStage {
    const stages = this.getStages();
    
    // Check if key already exists
    if (stages.find(s => s.key === options.key)) {
      throw new Error(`Stage with key "${options.key}" already exists`);
    }
    
    const stage: CustomStage = {
      key: options.key,
      name: options.name,
      description: options.description,
      icon: options.icon || '○',
      color: options.color || '6b7280',
      position: options.position ?? stages.length,
      isClosedState: options.isClosedState || false,
      isTriageState: options.isTriageState || false,
      isDefault: options.isDefault || false,
    };
    
    // If this is the new default, unset other defaults
    if (stage.isDefault) {
      for (const s of stages) {
        s.isDefault = false;
      }
    }
    
    stages.push(stage);
    stages.sort((a, b) => a.position - b.position);
    
    this.storage.customStages = stages;
    this.save();
    
    return stage;
  }

  /**
   * Update a custom stage
   */
  updateStage(key: string, updates: Partial<Omit<CustomStage, 'key'>>): CustomStage | null {
    const stages = this.getStages();
    const stage = stages.find(s => s.key === key);
    
    if (!stage) return null;
    
    // If setting as new default, unset other defaults
    if (updates.isDefault) {
      for (const s of stages) {
        s.isDefault = false;
      }
    }
    
    Object.assign(stage, updates);
    
    // Re-sort if position changed
    if (updates.position !== undefined) {
      stages.sort((a, b) => a.position - b.position);
    }
    
    this.storage.customStages = stages;
    this.save();
    
    return stage;
  }

  /**
   * Delete a custom stage
   * Cannot delete if there are issues in this stage
   */
  deleteStage(key: string): boolean {
    const stages = this.getStages();
    const stageIndex = stages.findIndex(s => s.key === key);
    
    if (stageIndex === -1) return false;
    
    // Check if any issues use this stage
    const issuesInStage = this.list({ status: key as IssueStatus });
    if (issuesInStage.length > 0) {
      throw new Error(`Cannot delete stage "${key}" - ${issuesInStage.length} issues are using it`);
    }
    
    stages.splice(stageIndex, 1);
    
    // Re-calculate positions
    for (let i = 0; i < stages.length; i++) {
      stages[i].position = i;
    }
    
    this.storage.customStages = stages;
    this.save();
    
    return true;
  }

  /**
   * Reorder stages
   */
  reorderStages(orderedKeys: string[]): CustomStage[] {
    const stages = this.getStages();
    const stageMap = new Map(stages.map(s => [s.key, s]));
    
    const reordered: CustomStage[] = [];
    
    for (let i = 0; i < orderedKeys.length; i++) {
      const stage = stageMap.get(orderedKeys[i]);
      if (stage) {
        stage.position = i;
        reordered.push(stage);
        stageMap.delete(orderedKeys[i]);
      }
    }
    
    // Append any stages not in the ordered list
    let position = reordered.length;
    for (const stage of stageMap.values()) {
      stage.position = position++;
      reordered.push(stage);
    }
    
    this.storage.customStages = reordered;
    this.save();
    
    return reordered;
  }

  /**
   * Get the default stage
   */
  getDefaultStage(): CustomStage | null {
    const stages = this.getStages();
    return stages.find(s => s.isDefault) || stages[0] || null;
  }

  /**
   * Get the triage stage
   */
  getTriageStage(): CustomStage | null {
    const stages = this.getStages();
    return stages.find(s => s.isTriageState) || null;
  }

  /**
   * Get closed stages
   */
  getClosedStages(): CustomStage[] {
    return this.getStages().filter(s => s.isClosedState);
  }

  /**
   * Get open (active) stages
   */
  getOpenStages(): CustomStage[] {
    return this.getStages().filter(s => !s.isClosedState);
  }

  /**
   * List issues grouped by custom stage
   */
  listByStage(): Record<string, Issue[]> {
    const stages = this.getStages();
    const grouped: Record<string, Issue[]> = {};
    
    // Initialize all stages with empty arrays
    for (const stage of stages) {
      grouped[stage.key] = [];
    }
    
    // Group issues
    for (const issue of this.storage.issues) {
      const status = issue.status || 'backlog';
      if (grouped[status]) {
        grouped[status].push(issue);
      } else {
        // Put in default stage if status doesn't match any stage
        const defaultStage = this.getDefaultStage();
        if (defaultStage && grouped[defaultStage.key]) {
          grouped[defaultStage.key].push(issue);
        }
      }
    }
    
    return grouped;
  }
}
