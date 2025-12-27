/**
 * API Types - Re-exported from wit core package
 *
 * This file re-exports types from the wit package to provide
 * end-to-end type safety between the server and web app.
 */

// Re-export the AppRouter type for tRPC
export type { AppRouter } from 'wit';

// Re-export API types from wit core (with friendly names for web app)
export type {
  ApiUser as User,
  ApiRepository as Repository,
  ApiPullRequest as PullRequest,
  ApiPullRequestWithAuthor as PullRequestWithAuthor,
  ApiIssue as Issue,
  ApiIssueWithAuthor as IssueWithAuthor,
  ApiLabel as Label,
} from 'wit';

// Additional UI-specific types that extend the base types

export interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  sha?: string;
}

export interface Branch {
  name: string;
  sha: string;
  isDefault: boolean;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  date: Date;
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  oldLines: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface Comment {
  id: string;
  body: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

export interface IssueComment {
  id: string;
  body: string;
  userId: string;
  issueId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrComment {
  id: string;
  body: string;
  userId: string;
  prId: string;
  path?: string | null;
  line?: number | null;
  side?: 'LEFT' | 'RIGHT' | null;
  startLine?: number | null;
  endLine?: number | null;
  replyToId?: string | null;
  isResolved?: boolean;
  resolvedAt?: Date | null;
  resolvedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    image: string | null;
    avatarUrl: string | null;
  };
}

export interface PrReview {
  id: string;
  prId: string;
  userId: string;
  state: 'approved' | 'changes_requested' | 'commented';
  body?: string | null;
  commitSha: string;
  createdAt: Date;
}
