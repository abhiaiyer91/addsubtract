/**
 * Shared types for Knowledge primitive
 */

/**
 * Options for configuring a Knowledge instance
 */
export interface KnowledgeOptions {
  /** Auto-commit after each write operation (default: true) */
  autoCommit?: boolean;
}

/**
 * A history entry representing a past value of a key
 */
export interface HistoryEntry<T> {
  /** The commit hash when this value was stored */
  hash: string;
  /** The value at this point in history */
  value: T;
  /** When this value was committed */
  timestamp: Date;
  /** The commit message */
  message?: string;
}
