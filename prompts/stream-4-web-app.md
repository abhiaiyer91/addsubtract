# Stream 4: Web Application

## Mission

Build a modern, beautiful web application for browsing repositories, managing pull requests, and handling issues. This is the GitHub.com equivalent.

## Context

We have:

- **Git Server** (`src/server/`) - Handles clone/push/pull
- **Database** (`src/db/`) - Full schema for users, repos, PRs, issues
- **tRPC API** (`src/api/trpc/`) - Type-safe API (in progress)

We need a React/Next.js frontend that consumes the tRPC API.

## Tech Stack

- **Vite** + **React 19**
- **React Router** for routing
- **TailwindCSS** + **shadcn/ui**
- **TanStack Query** (via tRPC React)
- **Monaco Editor** for code viewing
- **Shiki** for syntax highlighting

## Key Deliverables

### 1. Project Structure

```
apps/web/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.tsx                   # Entry point
│   ├── App.tsx                    # Root with providers + router
│   ├── routes/
│   │   ├── index.tsx              # Landing/dashboard
│   │   ├── login.tsx              # Auth
│   │   ├── register.tsx
│   │   ├── owner.tsx              # User/org profile
│   │   ├── repo/
│   │   │   ├── index.tsx          # Repo home (README)
│   │   │   ├── tree.tsx           # Directory browser
│   │   │   ├── blob.tsx           # File viewer
│   │   │   ├── commits.tsx        # Commit history
│   │   │   ├── branches.tsx       # Branch list
│   │   │   ├── pulls.tsx          # PR list
│   │   │   ├── pull-detail.tsx    # PR detail
│   │   │   ├── issues.tsx         # Issue list
│   │   │   ├── issue-new.tsx      # Create issue
│   │   │   ├── issue-detail.tsx   # Issue detail
│   │   │   └── settings.tsx       # Repo settings
│   │   └── settings.tsx           # User settings
│   ├── components/
│   │   ├── ui/                    # shadcn components
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   ├── sidebar.tsx
│   │   │   └── footer.tsx
│   │   ├── repo/
│   │   │   ├── file-tree.tsx
│   │   │   ├── code-viewer.tsx
│   │   │   ├── branch-selector.tsx
│   │   │   └── commit-list.tsx
│   │   ├── diff/
│   │   │   ├── diff-viewer.tsx
│   │   │   ├── diff-line.tsx
│   │   │   └── inline-comment.tsx
│   │   ├── pr/
│   │   │   ├── pr-card.tsx
│   │   │   ├── pr-timeline.tsx
│   │   │   ├── review-form.tsx
│   │   │   └── merge-button.tsx
│   │   ├── issue/
│   │   │   ├── issue-card.tsx
│   │   │   ├── issue-form.tsx
│   │   │   └── label-picker.tsx
│   │   └── markdown/
│   │       └── renderer.tsx
│   ├── lib/
│   │   ├── trpc.ts                # tRPC client setup
│   │   ├── auth.ts                # Auth utilities
│   │   └── utils.ts
│   └── styles/
│       └── globals.css
└── package.json
```

### 2. Core Pages

#### Landing Page

- Hero section with value prop
- Quick start instructions
- Feature highlights

#### Repository Home (`/[owner]/[repo]`)

- README display
- File tree (collapsible)
- Branch/tag selector
- Clone URL
- Star/watch buttons
- Stats (stars, forks, watchers)

#### File Browser (`/[owner]/[repo]/tree/[...path]`)

- Directory listing with icons
- Breadcrumb navigation
- Last commit info per file
- Click to navigate/view

#### Code Viewer (`/[owner]/[repo]/blob/[...path]`)

- Syntax highlighted code
- Line numbers (clickable for linking)
- Raw/blame view toggle
- Edit button (for authed users)

#### Pull Request List (`/[owner]/[repo]/pulls`)

- Filter by state (open/closed/merged)
- Author filter
- Label filter
- Sort by date/activity

#### Pull Request Detail (`/[owner]/[repo]/pulls/[number]`)

- Title, description, author
- Files changed tab with diff viewer
- Conversation tab with timeline
- Review form
- Merge/close buttons

#### Issue List (`/[owner]/[repo]/issues`)

- Filter by state, author, label
- Search
- New issue button

#### Issue Detail (`/[owner]/[repo]/issues/[number]`)

- Title, description
- Comments thread
- Labels, assignees
- Close/reopen button

---

## Implementation Guide

### Step 1: Create Vite App

```bash
mkdir -p apps/web && cd apps/web
pnpm create vite . --template react-ts
pnpm add react-router-dom @trpc/client @trpc/react-query @tanstack/react-query superjson
pnpm add -D tailwindcss postcss autoprefixer
pnpm dlx tailwindcss init -p
pnpm dlx shadcn@latest init
```

### Step 2: Set Up tRPC Client

```typescript
// src/lib/trpc.ts
import { useState } from "react";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../api/trpc/routers"; // Adjust path

export const trpc = createTRPCReact<AppRouter>();

function getAuthToken(): string | null {
  return localStorage.getItem("token");
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: superjson,
      links: [
        httpBatchLink({
          url: import.meta.env.VITE_API_URL || "http://localhost:3000/trpc",
          headers: () => {
            const token = getAuthToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Step 3: App with Router

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TRPCProvider } from "./lib/trpc";
import { Header } from "./components/layout/header";
import { Home } from "./routes/index";
import { Login } from "./routes/login";
import { RepoPage } from "./routes/repo";
import { PullsPage } from "./routes/repo/pulls";
import { PullDetailPage } from "./routes/repo/pull-detail";
import { IssuesPage } from "./routes/repo/issues";
import { IssueDetailPage } from "./routes/repo/issue-detail";
import "./styles/globals.css";

export function App() {
  return (
    <TRPCProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-background font-sans antialiased">
          <Header />
          <main className="container mx-auto px-4 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/:owner/:repo" element={<RepoPage />} />
              <Route path="/:owner/:repo/tree/*" element={<RepoPage />} />
              <Route path="/:owner/:repo/blob/*" element={<RepoPage />} />
              <Route path="/:owner/:repo/pulls" element={<PullsPage />} />
              <Route
                path="/:owner/:repo/pulls/:number"
                element={<PullDetailPage />}
              />
              <Route path="/:owner/:repo/issues" element={<IssuesPage />} />
              <Route
                path="/:owner/:repo/issues/:number"
                element={<IssueDetailPage />}
              />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </TRPCProvider>
  );
}
```

### Step 4: Entry Point

```typescript
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

````

### Step 5: Repository Page

```typescript
// src/routes/repo/index.tsx
import { useParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { FileTree } from "../../components/repo/file-tree";
import { BranchSelector } from "../../components/repo/branch-selector";
import { Markdown } from "../../components/markdown/renderer";
import { Star, GitFork } from "lucide-react";
import { Button } from "../../components/ui/button";

export function RepoPage() {
  const { owner: ownerParam, repo: repoParam } = useParams<{
    owner: string;
    repo: string;
  }>();

  const { data: repoData } = trpc.repos.get.useQuery({
    owner: ownerParam!,
    repo: repoParam!,
  });

  const { data: tree } = trpc.repos.getTree.useQuery({
    owner: ownerParam!,
    repo: repoParam!,
    path: "",
    ref: repoData?.repo.defaultBranch || "main",
  });

  const { data: readme } = trpc.repos.getFile.useQuery({
    owner: ownerParam!,
    repo: repoParam!,
    path: "README.md",
    ref: repoData?.repo.defaultBranch || "main",
  });

  if (!repoData) return <div>Loading...</div>;

  const { repo, owner } = repoData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-muted-foreground">
              {owner.name || owner.username}/
            </span>
            {repo.name}
          </h1>
          {repo.description && (
            <p className="text-muted-foreground mt-1">{repo.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Star className="w-4 h-4 mr-1" />
            Star
            <span className="ml-1 px-1.5 py-0.5 bg-muted rounded text-xs">
              {repo.starsCount}
            </span>
          </Button>
          <Button variant="outline" size="sm">
            <GitFork className="w-4 h-4 mr-1" />
            Fork
            <span className="ml-1 px-1.5 py-0.5 bg-muted rounded text-xs">
              {repo.forksCount}
            </span>
          </Button>
        </div>
      </div>

      {/* Branch selector + actions */}
      <div className="flex items-center gap-4">
        <BranchSelector
          defaultBranch={repo.defaultBranch}
          owner={ownerParam!}
          repo={repoParam!}
        />
        <Button variant="secondary" size="sm">
          Clone
        </Button>
      </div>

      {/* File tree */}
      <div className="border rounded-lg">
        <FileTree
          entries={tree?.entries || []}
          owner={ownerParam!}
          repo={repoParam!}
        />
      </div>

      {/* README */}
      {readme && (
        <div className="border rounded-lg p-6">
          <Markdown content={readme.content} />
        </div>
      )}
    </div>
  );
}
````

### Step 6: File Tree Component

```typescript
// src/components/repo/file-tree.tsx
import { File, Folder } from "lucide-react";
import { Link } from "react-router-dom";

interface TreeEntry {
  name: string;
  type: "file" | "directory";
  path: string;
}

export function FileTree({
  entries,
  owner,
  repo,
}: {
  entries: TreeEntry[];
  owner: string;
  repo: string;
}) {
  // Sort: directories first, then files
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="divide-y">
      {sorted.map((entry) => (
        <Link
          key={entry.path}
          to={`/${owner}/${repo}/${
            entry.type === "directory" ? "tree" : "blob"
          }/${entry.path}`}
          className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          {entry.type === "directory" ? (
            <Folder className="w-4 h-4 text-blue-400" />
          ) : (
            <File className="w-4 h-4 text-muted-foreground" />
          )}
          <span>{entry.name}</span>
        </Link>
      ))}
    </div>
  );
}
```

### Step 7: Diff Viewer Component

```typescript
// src/components/diff/diff-viewer.tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffFile {
  path: string;
  oldPath?: string;
  hunks: {
    oldStart: number;
    newStart: number;
    lines: DiffLine[];
  }[];
}

export function DiffViewer({ files }: { files: DiffFile[] }) {
  return (
    <div className="space-y-4">
      {files.map((file) => (
        <div key={file.path} className="border rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-2 font-mono text-sm border-b">
            {file.oldPath && file.oldPath !== file.path ? (
              <>
                <span className="text-red-400">{file.oldPath}</span>
                <span className="mx-2">→</span>
                <span className="text-green-400">{file.path}</span>
              </>
            ) : (
              file.path
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-sm">
              <tbody>
                {file.hunks.map((hunk, i) => (
                  <HunkView key={i} hunk={hunk} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function HunkView({ hunk }: { hunk: DiffFile["hunks"][0] }) {
  return (
    <>
      <tr className="bg-blue-500/10">
        <td colSpan={3} className="px-4 py-1 text-blue-400">
          @@ -{hunk.oldStart} +{hunk.newStart} @@
        </td>
      </tr>
      {hunk.lines.map((line, i) => (
        <tr
          key={i}
          className={cn(
            line.type === "add" && "bg-green-500/10",
            line.type === "remove" && "bg-red-500/10"
          )}
        >
          <td className="w-12 px-2 text-right text-muted-foreground select-none">
            {line.oldLineNumber || ""}
          </td>
          <td className="w-12 px-2 text-right text-muted-foreground select-none">
            {line.newLineNumber || ""}
          </td>
          <td className="px-4">
            <span
              className={cn(
                "mr-2",
                line.type === "add" && "text-green-400",
                line.type === "remove" && "text-red-400"
              )}
            >
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            {line.content}
          </td>
        </tr>
      ))}
    </>
  );
}
```

### Step 8: Pull Request Page

```typescript
// src/routes/repo/pull-detail.tsx
import { useParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { DiffViewer } from "../../components/diff/diff-viewer";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { GitMerge, GitPullRequest, X } from "lucide-react";

export function PullDetailPage() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();

  const prNumber = parseInt(number!);

  const { data: pr } = trpc.pulls.get.useQuery({
    owner: owner!,
    repo: repo!,
    number: prNumber,
  });

  const { data: diff } = trpc.pulls.getDiff.useQuery({
    owner: owner!,
    repo: repo!,
    number: prNumber,
  });

  const mergeMutation = trpc.pulls.merge.useMutation();

  if (!pr) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {pr.title}
              <span className="text-muted-foreground">#{pr.number}</span>
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={pr.state === "open" ? "default" : "secondary"}>
                {pr.state === "open" ? (
                  <GitPullRequest className="w-3 h-3 mr-1" />
                ) : pr.state === "merged" ? (
                  <GitMerge className="w-3 h-3 mr-1" />
                ) : (
                  <X className="w-3 h-3 mr-1" />
                )}
                {pr.state}
              </Badge>
              <span className="text-muted-foreground">
                {pr.author.username} wants to merge {pr.sourceBranch} into{" "}
                {pr.targetBranch}
              </span>
            </div>
          </div>

          {pr.state === "open" && (
            <Button
              onClick={() => mergeMutation.mutate({ prId: pr.id })}
              disabled={!pr.isMergeable}
            >
              <GitMerge className="w-4 h-4 mr-2" />
              Merge pull request
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="conversation">Conversation</TabsTrigger>
          <TabsTrigger value="files">Files changed</TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="mt-4">
          <div className="prose dark:prose-invert">
            {pr.body || <em>No description provided.</em>}
          </div>
          {/* TODO: Comments/reviews timeline */}
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          {diff && <DiffViewer files={diff.files} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## Design Guidelines

### Colors (Dark Theme)

```css
:root {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14.9%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --border: 0 0% 14.9%;
}
```

### Typography

- **Headings:** font-bold, tracking-tight
- **Code:** font-mono (JetBrains Mono or Fira Code)
- **Body:** font-sans (Inter or system)

### Spacing

- Use consistent spacing: 4, 8, 16, 24, 32, 48, 64
- Cards/panels: rounded-lg border
- Buttons: rounded-md

---

## Success Criteria

- [ ] Landing page with login/register
- [ ] Repository browser with file tree
- [ ] Code viewer with syntax highlighting
- [ ] Pull request list and detail pages
- [ ] Diff viewer with line-by-line display
- [ ] Issue list and detail pages
- [ ] User profile page
- [ ] Dark theme, responsive design
- [ ] tRPC integration working end-to-end

## Dependencies

- Stream 3 (tRPC API) - Can start with mocked data
