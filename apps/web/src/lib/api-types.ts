/**
 * API Types - These match the actual server API structure
 * 
 * The AppRouter type is imported from the shared definition.
 * These interfaces represent the data structures used throughout the app.
 */

// Re-export the AppRouter type from the server
// This enables end-to-end type safety with tRPC
export type { AppRouter } from '../../../../src/api/trpc/routers';

export interface User {
  id: string;
  username: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Repository {
  id: string;
  ownerId: string;
  ownerType: 'user' | 'organization';
  name: string;
  description: string | null;
  isPrivate: boolean;
  isFork: boolean;
  forkedFromId: string | null;
  defaultBranch: string;
  starsCount: number;
  forksCount: number;
  watchersCount: number;
  openIssuesCount: number;
  openPrsCount: number;
  diskPath: string;
  createdAt: Date;
  updatedAt: Date;
  pushedAt: Date | null;
}

export interface PullRequest {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  sourceRepoId: string | null;
  headSha: string;
  baseSha: string;
  mergeSha: string | null;
  authorId: string;
  isDraft: boolean;
  isMergeable: boolean | null;
  createdAt: Date;
  updatedAt: Date;
  mergedAt: Date | null;
  closedAt: Date | null;
  mergedById: string | null;
}

export interface Issue {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  authorId: string;
  assigneeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  closedById: string | null;
}

export interface Label {
  id: string;
  repoId: string;
  name: string;
  color: string;
  description: string | null;
  createdAt: Date;
}

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
  createdAt: Date;
  updatedAt: Date;
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
