# wit Platform Roadmap

## Vision

Build an open-source, AI-native code collaboration platform that replaces GitHub.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         wit Platform                             │
├─────────────────────────────────────────────────────────────────┤
│  Web App (React)          │  API Server (Node/Hono)             │
│  - Repository browser     │  - REST API                         │
│  - Pull requests UI       │  - GraphQL API                      │
│  - Issues UI              │  - WebSocket (realtime)             │
│  - User dashboard         │  - Git Smart HTTP                   │
├───────────────────────────┼─────────────────────────────────────┤
│  CLI (wit)                │  Core Libraries                     │
│  - Local git ops          │  - @wit/core (git impl)             │
│  - Remote sync            │  - @wit/ai (mastra)                 │
│  - PR/Issue commands      │  - @wit/protocol (smart http)       │
├───────────────────────────┴─────────────────────────────────────┤
│                         Storage Layer                            │
│  - Object Store (S3/local)  - Database (Postgres)               │
│  - Search Index (Meilisearch/Typesense)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Workstreams (Parallel Development)

### ⚡ Stream 0: Server + Database Integration 🔓 READY

**Owner:** TBD  
**Priority:** P0 - Quick Win  
**Dependencies:** Streams 1 & 2 ✅

Wire the Git Server to the Database so pushes create repository records.

**Prompt:** `prompts/stream-0-integration.md`

---

### 🔴 Stream 1: Git Server (Foundation) ✅ COMPLETE

**Owner:** AI Agent  
**Priority:** P0 - Critical Path  
**Dependencies:** None

Build a standalone Git server that accepts push/pull over HTTP.

#### Milestones

- [x] **1.1 Basic HTTP Server** ✅

  - Hono server with git-receive-pack endpoint
  - Accept pushes to local filesystem
  - Serve clones via git-upload-pack

- [x] **1.2 Multi-repo Support** ✅

  - Route: `/:owner/:repo.git`
  - Create repos on first push
  - List available repos

- [ ] **1.3 Authentication** (Pending)
  - Token-based auth for push
  - Public/private repo distinction
  - Rate limiting

#### Files to Create

```
src/server/
├── index.ts              # Server entry point
├── routes/
│   ├── git.ts            # Smart HTTP endpoints
│   ├── api.ts            # REST API
│   └── graphql.ts        # GraphQL API
├── middleware/
│   ├── auth.ts           # Authentication
│   └── ratelimit.ts      # Rate limiting
└── storage/
    ├── repos.ts          # Repository management
    └── objects.ts        # Object storage abstraction
```

---

### 🟠 Stream 2: Database & Models ✅ COMPLETE

**Owner:** AI Agent  
**Priority:** P0 - Critical Path  
**Dependencies:** None

Design and implement the data layer.

#### Milestones

- [x] **2.1 Schema Design** ✅

  - Users, Organizations, Teams
  - Repositories, Collaborators, Stars, Watches
  - Pull Requests, Reviews, Comments
  - Issues, Labels, Comments
  - Activity tracking, Webhooks

- [x] **2.2 Database Setup** ✅

  - Drizzle ORM with Postgres
  - Full schema with types
  - Seed data script

- [x] **2.3 Models & Queries** ✅
  - Repository CRUD with stars/watches
  - User management with OAuth
  - PR/Issue operations with comments

#### Schema (Initial)

```sql
-- Core entities
users (id, username, email, name, avatar_url, created_at)
organizations (id, name, slug, avatar_url, created_at)
org_members (org_id, user_id, role)

-- Repositories
repositories (id, owner_id, owner_type, name, description,
              is_private, default_branch, created_at)
collaborators (repo_id, user_id, permission)
branches (id, repo_id, name, head_sha, protected)

-- Pull Requests
pull_requests (id, repo_id, number, title, body, state,
               source_branch, target_branch, author_id,
               created_at, merged_at, closed_at)
pr_reviews (id, pr_id, user_id, state, body, created_at)
pr_comments (id, pr_id, user_id, path, line, body, created_at)

-- Issues
issues (id, repo_id, number, title, body, state,
        author_id, assignee_id, created_at, closed_at)
issue_comments (id, issue_id, user_id, body, created_at)
labels (id, repo_id, name, color, description)
issue_labels (issue_id, label_id)
```

#### Files to Create

```
src/db/
├── schema.ts             # Drizzle schema
├── migrations/           # Database migrations
├── models/
│   ├── user.ts
│   ├── repository.ts
│   ├── pull-request.ts
│   └── issue.ts
└── seed.ts               # Development data
```

---

### 🟡 Stream 3: tRPC API 🔓 READY

**Owner:** TBD  
**Priority:** P0 - Critical Path  
**Dependencies:** Stream 2 (Database) ✅

Build the tRPC API layer for type-safe client-server communication.

#### Milestones

- [ ] **3.1 tRPC Setup**

  - tRPC router with Hono adapter
  - Auth context and middleware
  - Client export for web/CLI

- [ ] **3.2 Core Routers**

  - `auth` - login, logout, register, me
  - `repos` - list, get, create, star, search
  - `pulls` - list, get, create, merge, review
  - `issues` - list, get, create, close, comment
  - `activity` - feed, forRepo

- [ ] **3.3 Webhooks** (Later)
  - Event system (push, PR created, etc.)
  - Webhook delivery with retries

#### Files to Create

```
src/api/trpc/
├── index.ts          # Export router and types
├── trpc.ts           # tRPC instance, procedures
├── context.ts        # Request context (user, db)
├── routers/
│   ├── index.ts      # Merged router
│   ├── auth.ts
│   ├── repos.ts
│   ├── pulls.ts
│   ├── issues.ts
│   └── activity.ts
└── middleware/
    └── auth.ts       # isAuthed, isRepoAdmin
```

**Prompt:** `prompts/stream-3-trpc-api.md`

---

### 🟢 Stream 4: Web Application 🔓 READY

**Owner:** TBD  
**Priority:** P1  
**Dependencies:** Stream 3 (API) - can start with mocks

Build the web frontend.

**Prompt:** `prompts/stream-4-web-app.md`

#### Milestones

- [ ] **4.1 Repository Browser** (Week 2-3)

  - Code viewer with syntax highlighting
  - Branch/tag selector
  - Commit history
  - File tree navigation
  - Blame view

- [ ] **4.2 Pull Requests** (Week 3-5)

  - PR list view
  - PR detail with diff viewer
  - Inline comments
  - Review workflow (approve/request changes)
  - Merge button

- [ ] **4.3 Issues** (Week 4-5)

  - Issue list with filters
  - Issue detail
  - Labels, milestones, assignees
  - Markdown editor

- [ ] **4.4 User & Org Pages** (Week 5-6)
  - User profiles
  - Organization pages
  - Settings

#### Tech Stack

- React 19 / Next.js 15
- TailwindCSS + shadcn/ui
- TanStack Query for data fetching
- Monaco Editor for code viewing

#### Files to Create

```
apps/web/
├── app/
│   ├── [owner]/
│   │   └── [repo]/
│   │       ├── page.tsx           # Repo home
│   │       ├── tree/[...path]/    # File browser
│   │       ├── blob/[...path]/    # File viewer
│   │       ├── commits/           # Commit history
│   │       ├── pulls/             # PR list
│   │       ├── pull/[number]/     # PR detail
│   │       └── issues/            # Issues
│   ├── settings/
│   └── login/
├── components/
│   ├── diff-viewer/
│   ├── code-viewer/
│   ├── file-tree/
│   └── markdown/
└── lib/
    ├── api.ts
    └── hooks/
```

---

### 🔵 Stream 5: CLI Extensions 🔓 READY

**Owner:** TBD  
**Priority:** P2  
**Dependencies:** Stream 3 (API)

Extend the CLI for platform features.

**Prompt:** `prompts/stream-5-cli-extensions.md`

#### Milestones

- [ ] **5.1 PR Commands** (Week 3-4)

  ```bash
  wit pr create              # Create PR from current branch
  wit pr list                # List open PRs
  wit pr checkout 123        # Checkout PR locally
  wit pr merge 123           # Merge PR
  wit pr review 123          # Start review
  ```

- [ ] **5.2 Issue Commands** (Week 4)

  ```bash
  wit issue create           # Create issue
  wit issue list             # List issues
  wit issue close 123        # Close issue
  wit issue assign 123 @user # Assign issue
  ```

- [ ] **5.3 Repo Commands** (Week 4)
  ```bash
  wit repo create            # Create new repo on server
  wit repo fork              # Fork a repo
  wit repo delete            # Delete repo
  wit repo settings          # Manage settings
  ```

#### Files to Create

```
src/commands/
├── pr.ts                 # Pull request commands
├── issue.ts              # Issue commands
└── repo.ts               # Repository management
```

---

### 🟣 Stream 6: AI Features

**Owner:** TBD  
**Priority:** P2  
**Dependencies:** Stream 4 (Web App)

Extend AI capabilities for the platform.

#### Milestones

- [ ] **6.1 AI PR Review** (Week 4-5)

  - Automated review on PR creation
  - Suggest improvements
  - Security vulnerability detection

- [ ] **6.2 AI Issue Triage** (Week 5)

  - Auto-label issues
  - Suggest assignees
  - Duplicate detection

- [ ] **6.3 AI Code Search** (Week 5-6)

  - Natural language code search
  - "Find where we handle authentication"
  - Semantic code understanding

- [ ] **6.4 AI Copilot** (Week 6+)
  - In-browser code suggestions
  - PR description generation
  - Commit message suggestions

---

### ⚪ Stream 7: CI/CD (Actions Alternative)

**Owner:** TBD  
**Priority:** P3  
**Dependencies:** Streams 1, 2, 3

Build a GitHub Actions alternative.

#### Milestones

- [ ] **7.1 Workflow Definition** (Week 6+)

  - YAML workflow files
  - Trigger on push/PR/schedule
  - Job and step definitions

- [ ] **7.2 Runner** (Week 7+)

  - Docker-based job execution
  - Self-hosted runner support
  - Artifact storage

- [ ] **7.3 UI Integration** (Week 8+)
  - Workflow run history
  - Log viewer
  - Status badges

---

## Development Phases

### Phase 1: MVP (Weeks 1-4)

**Goal:** Self-hosted GitHub alternative for small teams

- ✅ Git server with push/pull
- ✅ Basic web UI for browsing repos
- ✅ User authentication
- ✅ Pull Request workflow (create, review, merge)
- ✅ Basic issues

### Phase 2: Feature Parity (Weeks 5-8)

**Goal:** Match core GitHub features

- Organizations and teams
- Protected branches
- Code owners
- Webhooks
- API compatibility

### Phase 3: Differentiation (Weeks 9-12)

**Goal:** Be better than GitHub

- AI-native features
- Federation (connect instances)
- Advanced code intelligence
- Built-in CI/CD
- P2P sync option

---

## Tech Stack

| Component      | Technology                        |
| -------------- | --------------------------------- |
| CLI            | TypeScript, Commander             |
| Server         | Node.js, Hono                     |
| Database       | PostgreSQL, Drizzle ORM           |
| Web            | React 19, Next.js 15, TailwindCSS |
| Search         | Meilisearch or Typesense          |
| Object Storage | S3-compatible or local            |
| AI             | Mastra (OpenAI/Anthropic)         |
| Auth           | Lucia, OAuth providers            |
| Realtime       | WebSockets                        |

---

## Team Allocation

| Stream        | Skills Needed          | Est. Effort |
| ------------- | ---------------------- | ----------- |
| 1. Git Server | Backend, Git internals | 3 weeks     |
| 2. Database   | Backend, SQL           | 2 weeks     |
| 3. API        | Backend, GraphQL       | 3 weeks     |
| 4. Web App    | Frontend, React        | 6 weeks     |
| 5. CLI        | TypeScript             | 2 weeks     |
| 6. AI         | ML/AI, Mastra          | 4 weeks     |
| 7. CI/CD      | DevOps, Docker         | 4 weeks     |

**Recommended Team:**

- 2 Backend engineers (Streams 1, 2, 3)
- 2 Frontend engineers (Stream 4)
- 1 Full-stack (Streams 5, 6)
- 1 DevOps (Stream 7)

---

## Getting Started

### For Contributors

1. Pick a stream that interests you
2. Check the dependencies
3. Create a branch: `git checkout -b stream-X-description`
4. Implement the milestone
5. Open a PR

### Quick Wins (Good First Issues)

- [ ] Add `wit serve` command skeleton
- [ ] Design database schema in Drizzle
- [ ] Create API route structure
- [ ] Set up Next.js app with shadcn
- [ ] Add `wit pr create` command

---

## Success Metrics

- **Week 4:** Can push to self-hosted server and browse code in web UI
- **Week 8:** Full PR workflow working, comparable to basic GitHub
- **Week 12:** AI features and CI/CD make it better than GitHub

---

## License

MIT - Let's build this in the open.
