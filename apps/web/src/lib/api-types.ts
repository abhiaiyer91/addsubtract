/**
 * API Types - These would normally be imported from the server package
 * For now, we define mock types that match the expected API structure
 */

import { initTRPC } from '@trpc/server';

// Create a router instance for type inference
const t = initTRPC.create();

// Define input/output types

export interface User {
  id: string;
  username: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  createdAt: Date;
  updatedAt: Date;
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

// Define the router type
// This is a placeholder - in production, this would be imported from the server
export type AppRouter = ReturnType<typeof createAppRouter>;

function createAppRouter() {
  return t.router({
    auth: t.router({
      login: t.procedure.mutation(() => ({} as { user: User; token: string })),
      register: t.procedure.mutation(() => ({} as { user: User; token: string })),
      me: t.procedure.query(() => ({} as User | null)),
      logout: t.procedure.mutation(() => ({})),
    }),
    users: t.router({
      get: t.procedure.query(() => ({} as User)),
      update: t.procedure.mutation(() => ({} as User)),
      search: t.procedure.query(() => ([] as User[])),
    }),
    repos: t.router({
      get: t.procedure.query(() => ({} as { repo: Repository; owner: User })),
      list: t.procedure.query(() => ([] as Repository[])),
      create: t.procedure.mutation(() => ({} as Repository)),
      update: t.procedure.mutation(() => ({} as Repository)),
      delete: t.procedure.mutation(() => ({})),
      getTree: t.procedure.query(() => ({} as { entries: TreeEntry[] })),
      getFile: t.procedure.query(() => ({} as { content: string; sha: string })),
      getBranches: t.procedure.query(() => ([] as { name: string; sha: string; isDefault: boolean }[])),
      getCommits: t.procedure.query(() => ([] as { sha: string; message: string; author: string; date: Date }[])),
      star: t.procedure.mutation(() => ({})),
      unstar: t.procedure.mutation(() => ({})),
      isStarred: t.procedure.query(() => ({} as boolean)),
    }),
    pulls: t.router({
      list: t.procedure.query(() => ([] as (PullRequest & { author: User })[])),
      get: t.procedure.query(() => ({} as PullRequest & { author: User })),
      create: t.procedure.mutation(() => ({} as PullRequest)),
      update: t.procedure.mutation(() => ({} as PullRequest)),
      merge: t.procedure.mutation(() => ({} as PullRequest)),
      close: t.procedure.mutation(() => ({} as PullRequest)),
      reopen: t.procedure.mutation(() => ({} as PullRequest)),
      getDiff: t.procedure.query(() => ({} as { files: DiffFile[] })),
      getComments: t.procedure.query(() => ([] as Comment[])),
      addComment: t.procedure.mutation(() => ({} as Comment)),
    }),
    issues: t.router({
      list: t.procedure.query(() => ([] as (Issue & { author: User; labels: Label[] })[])),
      get: t.procedure.query(() => ({} as Issue & { author: User; labels: Label[]; assignee: User | null })),
      create: t.procedure.mutation(() => ({} as Issue)),
      update: t.procedure.mutation(() => ({} as Issue)),
      close: t.procedure.mutation(() => ({} as Issue)),
      reopen: t.procedure.mutation(() => ({} as Issue)),
      getComments: t.procedure.query(() => ([] as Comment[])),
      addComment: t.procedure.mutation(() => ({} as Comment)),
    }),
    labels: t.router({
      list: t.procedure.query(() => ([] as Label[])),
      create: t.procedure.mutation(() => ({} as Label)),
      update: t.procedure.mutation(() => ({} as Label)),
      delete: t.procedure.mutation(() => ({})),
    }),
  });
}
