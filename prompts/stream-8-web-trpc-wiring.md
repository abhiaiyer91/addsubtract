# Stream 8: Web App → tRPC Wiring

## Mission

Connect the web app's mock data to real tRPC endpoints. The web app is complete but uses hardcoded mock data. We need to replace mocks with actual tRPC calls.

## Context

We have:

- **Web App** (`apps/web/`) - Complete Vite + React app with all pages
- **tRPC API** (`src/api/trpc/`) - All routers implemented
- **tRPC Client** (`apps/web/src/lib/trpc.tsx`) - Client setup exists

The web app pages use mock data. We need to wire them to real API calls.

## Files to Update

### 1. Repository Page (`apps/web/src/routes/repo/index.tsx`)

**Current:** Uses `mockRepo`, `mockOwner`, `mockTree`, `mockReadme`

**Target:**

```typescript
import { useParams } from "react-router-dom";
import { trpc } from "@/lib/trpc";

export function RepoPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();

  // Fetch real data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery({
    owner: owner!,
    repo: repo!,
  });

  // Fetch tree (need to add this endpoint to API)
  const { data: tree } = trpc.repos.getTree.useQuery(
    {
      owner: owner!,
      repo: repo!,
      ref: repoData?.repo.defaultBranch || "main",
      path: "",
    },
    { enabled: !!repoData }
  );

  // Fetch README
  const { data: readme } = trpc.repos.getFile.useQuery(
    {
      owner: owner!,
      repo: repo!,
      ref: repoData?.repo.defaultBranch || "main",
      path: "README.md",
    },
    { enabled: !!repoData }
  );

  if (repoLoading) return <Loading />;
  if (!repoData) return <NotFound />;

  const { repo: repoInfo, owner: ownerInfo } = repoData;

  // ... rest of component using real data
}
```

### 2. Issues Page (`apps/web/src/routes/repo/issues.tsx`)

**Current:** Uses mock issues array

**Target:**

```typescript
export function IssuesPage() {
  const { owner, repo } = useParams();

  // Get repo first to get ID
  const { data: repoData } = trpc.repos.get.useQuery({
    owner: owner!,
    repo: repo!,
  });

  // Fetch issues
  const { data: issues, isLoading } = trpc.issues.list.useQuery(
    {
      repoId: repoData?.repo.id!,
      state: "open",
      limit: 50,
    },
    { enabled: !!repoData?.repo.id }
  );

  // Create issue mutation
  const createIssue = trpc.issues.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch
      utils.issues.list.invalidate();
    },
  });

  // ... rest of component
}
```

### 3. Pull Requests Page (`apps/web/src/routes/repo/pulls.tsx`)

**Target:**

```typescript
export function PullsPage() {
  const { owner, repo } = useParams();

  const { data: repoData } = trpc.repos.get.useQuery({
    owner: owner!,
    repo: repo!,
  });

  const { data: pulls, isLoading } = trpc.pulls.list.useQuery(
    {
      repoId: repoData?.repo.id!,
      state: "open",
      limit: 50,
    },
    { enabled: !!repoData?.repo.id }
  );

  // ... rest
}
```

### 4. Issue Detail Page (`apps/web/src/routes/repo/issue-detail.tsx`)

**Target:**

```typescript
export function IssueDetailPage() {
  const { owner, repo, number } = useParams();
  const issueNumber = parseInt(number!);

  const { data: repoData } = trpc.repos.get.useQuery({
    owner: owner!,
    repo: repo!,
  });

  const { data: issue, isLoading } = trpc.issues.get.useQuery(
    {
      repoId: repoData?.repo.id!,
      number: issueNumber,
    },
    { enabled: !!repoData?.repo.id }
  );

  const { data: comments } = trpc.comments.listForIssue.useQuery(
    { issueId: issue?.id! },
    { enabled: !!issue?.id }
  );

  const addComment = trpc.comments.create.useMutation();
  const closeIssue = trpc.issues.close.useMutation();

  // ... rest
}
```

### 5. PR Detail Page (`apps/web/src/routes/repo/pull-detail.tsx`)

**Target:**

```typescript
export function PullDetailPage() {
  const { owner, repo, number } = useParams();
  const prNumber = parseInt(number!);

  const { data: repoData } = trpc.repos.get.useQuery({
    owner: owner!,
    repo: repo!,
  });

  const { data: pr } = trpc.pulls.get.useQuery(
    {
      repoId: repoData?.repo.id!,
      number: prNumber,
    },
    { enabled: !!repoData?.repo.id }
  );

  const { data: reviews } = trpc.pulls.listReviews.useQuery(
    { prId: pr?.id! },
    { enabled: !!pr?.id }
  );

  const mergePr = trpc.pulls.merge.useMutation();
  const addReview = trpc.pulls.addReview.useMutation();

  // ... rest
}
```

### 6. Login Page (`apps/web/src/routes/login.tsx`)

**Target:**

```typescript
export function LoginPage() {
  const navigate = useNavigate();
  const login = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      // Store token
      localStorage.setItem("token", data.sessionId);
      navigate("/");
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    login.mutate({
      usernameOrEmail: formData.get("email") as string,
      password: formData.get("password") as string,
    });
  };

  // ... rest
}
```

### 7. Owner Page (`apps/web/src/routes/owner.tsx`)

**Target:**

```typescript
export function OwnerPage() {
  const { owner } = useParams();

  const { data: user } = trpc.users.getByUsername.useQuery({
    username: owner!,
  });

  const { data: repos } = trpc.repos.list.useQuery({
    owner: owner!,
  });

  // ... rest
}
```

---

## API Endpoints to Add

The web app needs some endpoints that may not exist yet:

### 1. `repos.getTree` - Get directory listing

```typescript
// src/api/trpc/routers/repos.ts
getTree: publicProcedure
  .input(z.object({
    owner: z.string(),
    repo: z.string(),
    ref: z.string(),
    path: z.string().default(""),
  }))
  .query(async ({ input }) => {
    // Read from git bare repo on disk
    // Return array of { name, path, type, size }
  }),
```

### 2. `repos.getFile` - Get file content

```typescript
getFile: publicProcedure
  .input(z.object({
    owner: z.string(),
    repo: z.string(),
    ref: z.string(),
    path: z.string(),
  }))
  .query(async ({ input }) => {
    // Read file from git bare repo
    // Return { content, size, encoding }
  }),
```

### 3. `repos.getCommits` - Get commit history

```typescript
getCommits: publicProcedure
  .input(z.object({
    owner: z.string(),
    repo: z.string(),
    ref: z.string().default("HEAD"),
    limit: z.number().default(30),
  }))
  .query(async ({ input }) => {
    // Walk commit history from git repo
  }),
```

### 4. `repos.getBranches` - List branches

```typescript
getBranches: publicProcedure
  .input(z.object({
    owner: z.string(),
    repo: z.string(),
  }))
  .query(async ({ input }) => {
    // List branches from git repo
  }),
```

---

## Implementation Steps

1. **Add missing API endpoints** to `src/api/trpc/routers/repos.ts`
2. **Update each page** to use real tRPC queries
3. **Add loading states** using `isLoading` from queries
4. **Add error handling** for failed queries
5. **Add optimistic updates** for mutations
6. **Test end-to-end** with real data

---

## Success Criteria

- [ ] Repo page shows real repository data
- [ ] File tree loads from actual git repo
- [ ] Issues list shows real issues from DB
- [ ] PRs list shows real PRs from DB
- [ ] Login/register creates real sessions
- [ ] Create issue/PR actually creates records
- [ ] No more mock data in any page
- [ ] Loading states work correctly
- [ ] Errors are handled gracefully

## Dependencies

- Stream 3 (tRPC API) ✅ Complete
- Stream 4 (Web App) ✅ Complete
- Server must be running with database connected
