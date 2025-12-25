/**
 * Operation Journal
 * Tracks all repository operations and enables undo/redo functionality
 */

import * as path from 'path';
import * as crypto from 'crypto';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';

/**
 * State snapshot for a point in time
 */
export interface StateSnapshot {
  head: string;           // HEAD content (ref or commit hash)
  branch: string | null;  // Current branch name, null if detached
  indexHash: string;      // Hash of serialized index for reference
}

/**
 * A single journal entry representing one operation
 */
export interface JournalEntry {
  id: string;
  timestamp: number;
  operation: string;
  args: string[];
  description: string;
  beforeState: StateSnapshot;
  afterState: StateSnapshot;
  // Optional: files affected
  affectedFiles?: string[];
  // Optional: for commits, store the commit hash
  commitHash?: string;
  // Optional: additional context for undo
  context?: Record<string, unknown>;
}

/**
 * Journal configuration
 */
export interface JournalConfig {
  maxEntries: number;        // Maximum entries to keep
  autoCleanup: boolean;      // Automatically remove old entries
}

const DEFAULT_CONFIG: JournalConfig = {
  maxEntries: 100,
  autoCleanup: true,
};

/**
 * Operation Journal for tracking and undoing operations
 */
export class Journal {
  private journalPath: string;
  private snapshotsDir: string;
  private entries: JournalEntry[] = [];
  private config: JournalConfig;

  constructor(gitDir: string, config: Partial<JournalConfig> = {}) {
    this.journalPath = path.join(gitDir, 'journal.json');
    this.snapshotsDir = path.join(gitDir, 'snapshots');
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.load();
  }

  /**
   * Initialize journal directories
   */
  init(): void {
    mkdirp(this.snapshotsDir);
    this.save();
  }

  /**
   * Load journal from disk
   */
  private load(): void {
    if (!exists(this.journalPath)) {
      this.entries = [];
      return;
    }

    try {
      const content = readFile(this.journalPath).toString('utf8');
      const data = JSON.parse(content);
      this.entries = data.entries || [];
    } catch {
      this.entries = [];
    }
  }

  /**
   * Save journal to disk
   */
  private save(): void {
    const data = {
      version: 1,
      entries: this.entries,
    };
    writeFile(this.journalPath, JSON.stringify(data, null, 2));
  }

  /**
   * Record an operation
   */
  record(
    operation: string,
    args: string[],
    description: string,
    beforeState: StateSnapshot,
    afterState: StateSnapshot,
    options: {
      affectedFiles?: string[];
      commitHash?: string;
    } = {}
  ): JournalEntry {
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      operation,
      args,
      description,
      beforeState,
      afterState,
      ...options,
    };

    this.entries.push(entry);

    // Cleanup old entries if needed
    if (this.config.autoCleanup && this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    this.save();
    return entry;
  }

  /**
   * Get the last entry
   */
  getLastEntry(): JournalEntry | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  /**
   * Get entry by ID
   */
  getEntry(id: string): JournalEntry | null {
    return this.entries.find(e => e.id === id) || null;
  }

  /**
   * Pop the last entry (for undo)
   */
  popEntry(): JournalEntry | null {
    const entry = this.entries.pop();
    if (entry) {
      this.save();
    }
    return entry || null;
  }

  /**
   * Get operation history
   */
  history(limit: number = 20): JournalEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  /**
   * Get all entries (oldest first)
   */
  getAllEntries(): JournalEntry[] {
    return [...this.entries];
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.save();
  }

  /**
   * Get entries count
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Check if journal is empty
   */
  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /**
   * Find entries by operation type
   */
  findByOperation(operation: string): JournalEntry[] {
    return this.entries.filter(e => e.operation === operation);
  }

  /**
   * Find entries affecting a specific file
   */
  findByFile(filePath: string): JournalEntry[] {
    return this.entries.filter(e => 
      e.affectedFiles?.includes(filePath)
    );
  }

  /**
   * Get entries in a time range
   */
  getEntriesInRange(startTime: number, endTime: number): JournalEntry[] {
    return this.entries.filter(e => 
      e.timestamp >= startTime && e.timestamp <= endTime
    );
  }
}

/**
 * Format a journal entry for display
 */
export function formatJournalEntry(entry: JournalEntry, index?: number): string {
  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleString();
  const indexStr = index !== undefined ? `${index}. ` : '';
  
  let output = `${indexStr}${entry.operation} - ${entry.description}\n`;
  output += `   Time: ${dateStr}\n`;
  output += `   ID: ${entry.id.slice(0, 8)}\n`;
  
  if (entry.commitHash) {
    output += `   Commit: ${entry.commitHash.slice(0, 8)}\n`;
  }
  
  if (entry.affectedFiles && entry.affectedFiles.length > 0) {
    output += `   Files: ${entry.affectedFiles.slice(0, 3).join(', ')}`;
    if (entry.affectedFiles.length > 3) {
      output += ` (+${entry.affectedFiles.length - 3} more)`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Format history for display
 */
export function formatHistory(entries: JournalEntry[]): string {
  if (entries.length === 0) {
    return 'No operations recorded yet.\n';
  }

  let output = 'Recent operations:\n\n';
  entries.forEach((entry, index) => {
    output += formatJournalEntry(entry, index + 1);
    output += '\n';
  });

  return output;
}

/**
 * Operations that can be undone
 */
export const UNDOABLE_OPERATIONS = [
  'commit',
  'add',
  'checkout',
  'branch-create',
  'branch-delete',
  'reset',
  'stash',
  'merge',
  'cherry-pick',
  'rebase',
  'revert',
];

/**
 * Check if an operation is undoable
 */
export function isUndoable(operation: string): boolean {
  return UNDOABLE_OPERATIONS.includes(operation);
}
