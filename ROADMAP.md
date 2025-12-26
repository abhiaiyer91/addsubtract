# wit Platform Roadmap

## Vision

Build an open-source, AI-native code collaboration platform that surpasses Git, GitHub, and all competitors.

## Current Status (December 2024)

| Domain | Completion | Quality | Status |
|--------|------------|---------|--------|
| **Core VCS** | 95% | Excellent | 57 commands, Git-compatible |
| **AI Integration** | 95% | Excellent | 15 tools, Mastra agent, semantic search |
| **Platform/Server** | 60% | Good | Basic PRs/Issues working, needs CI/CD |
| **UI (TUI + Web)** | 80% | Excellent | Dual interfaces |
| **Test Coverage** | 80% | Excellent | 29 test files, comprehensive coverage |
| **Primitives** | 100% | Excellent | Filesystem & Knowledge fully implemented |
| **Search** | 100% | Excellent | Semantic search with embeddings |

### What Makes Wit Better Than Git

- **Undo operations** - Journal-based undo (not just reflog)
- **Branch state manager** - Auto-save/restore working directory per branch
- **Monorepo scopes** - Filter operations to specific paths
- **AI-native** - Built-in agent for commits, reviews, conflict resolution, semantic search
- **Semantic code search** - Natural language queries using embeddings
- **Modern TypeScript** - Maintainable, extensible codebase
- **Git primitives** - Filesystem and knowledge store built on git

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         wit Platform                             │
├─────────────────────────────────────────────────────────────────┤
│  Web App (React)          │  API Server (Node/Hono)             │
│  - Repository browser     │  - tRPC API (type-safe)             │
│  - Pull requests UI       │  - Git Smart HTTP                   │
│  - Issues UI              │  - WebSocket (realtime)             │
│  - User dashboard         │  - CI/CD Runner (planned)           │
├───────────────────────────┼─────────────────────────────────────┤
│  CLI (wit)                │  Core Libraries                     │
│  - 57 git commands        │  - @wit/core (git impl)             │
│  - AI agent               │  - @wit/ai (mastra + 15 tools)      │
│  - PR/Issue commands      │  - @wit/protocol (smart http)       │
│  - TUI interface          │  - @wit/ui (tui + web)              │
│  - Semantic search        │  - @wit/search (embeddings)         │
├───────────────────────────┴─────────────────────────────────────┤
│                         Storage Layer                            │
│  - Object Store (S3/local)  - Database (Postgres)               │
│  - Vector Store (local)     - Activity/Audit Logs               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Completed Workstreams

### Stream 1: Git Server (Foundation) - COMPLETE

- [x] Hono HTTP server with Smart HTTP protocol
- [x] git-upload-pack and git-receive-pack
- [x] Multi-repo support (`/:owner/:repo.git`)
- [x] Auto-create repos on first push
- [x] Token-based authentication
- [x] Protocol implementation (packfile parser/writer, refs discovery)

### Stream 2: Database & Models - COMPLETE

- [x] Full schema (users, repos, PRs, issues, orgs, teams)
- [x] Drizzle ORM with PostgreSQL
- [x] All CRUD operations implemented
- [x] Activity tracking and webhooks (model)
- [x] Milestones support
- [x] Labels for issues and PRs

### Stream 3: tRPC API - COMPLETE

- [x] Type-safe tRPC routers
- [x] Auth router (login, register, sessions)
- [x] Repos router (CRUD, stars, collaborators)
- [x] PRs router (create, review, merge)
- [x] Issues router (create, labels, comments)
- [x] Activity router (feeds)
- [x] Webhooks router
- [x] Milestones router
- [x] Users router

### Stream 4: Core VCS Commands - COMPLETE

- [x] All local commands (add, commit, status, log, diff, branch, etc.)
- [x] All remote commands (clone, fetch, pull, push)
- [x] History rewriting (rebase, cherry-pick, revert)
- [x] Advanced features (hooks, submodules, worktrees, reflog, gc)
- [x] Plumbing commands (rev-parse, update-ref, cat-file, hash-object, etc.)
- [x] Wit-specific commands (undo, wip, snapshot, uncommit, fixup, amend)
- [x] Navigation commands (up, down for commit stack)
- [x] Monorepo scopes

### Stream 5: AI Integration - COMPLETE

- [x] Mastra agent with 15 tools
- [x] AI commit message generation
- [x] AI code review (`review-pr.ts`)
- [x] AI conflict resolution suggestions
- [x] Natural language git operations
- [x] AI PR description generation (`generate-pr-description.ts`)
- [x] Semantic code search (`semantic-search.ts`)
- [x] Branch/diff/log/status tools

### Stream 6: Foundation Hardening - COMPLETE

- [x] Tests for `src/core/repository.ts` - `repository.test.ts` exists
- [x] Tests for `src/core/merge.ts` - `merge.test.ts` exists
- [x] Add lint step to CI (`npm run lint`)
- [x] Add type-check step to CI (`npm run typecheck`)
- [x] Coverage reporting in CI
- [x] Packed refs support (`packed-refs.test.ts` exists)

### Stream 7: Semantic Search - COMPLETE

- [x] Code chunking for multiple languages (TS/JS, Python, Go, Rust)
- [x] OpenAI embeddings integration
- [x] Vector store with persistence
- [x] Cosine similarity search
- [x] Path/language/type filtering
- [x] Repository indexing
- [x] Comprehensive test coverage

### Stream 8: Git Primitives - COMPLETE

- [x] Git-backed virtual filesystem (`src/primitives/filesystem.ts`)
- [x] Content-addressable knowledge store (`src/primitives/knowledge.ts`)
- [x] Branch state manager (`src/core/branch-state.ts`)
- [x] Large file support (`src/core/large-file.ts`)
- [x] Git hooks system (`src/core/hooks.ts`)

---

## Active Workstreams

### Stream 9: Platform Critical Features - P0 (CURRENT)

**Priority:** Critical - Blocking GitHub replacement  
**Timeline:** 4-8 weeks

#### 9.1 CI/CD Engine (GitHub Actions Alternative)

| Milestone | Status | Description |
|-----------|--------|-------------|
| 9.1.1 Workflow Syntax | TODO | `.wit/workflows/*.yml` parsing |
| 9.1.2 Job Scheduler | TODO | Queue and execute jobs |
| 9.1.3 Docker Runner | TODO | Execute steps in containers |
| 9.1.4 Artifact Storage | TODO | Store build outputs |
| 9.1.5 Status Checks API | TODO | Report to PRs |
| 9.1.6 UI Integration | TODO | Logs, history, badges |

**Files to Create:**

```
src/ci/
├── index.ts              # CI engine entry
├── types.ts              # Workflow types
├── parser.ts             # Workflow YAML parser
├── scheduler.ts          # Job queue and scheduling
├── runner.ts             # Job execution
├── docker.ts             # Container management
└── artifacts.ts          # Artifact storage

src/api/trpc/routers/
├── workflows.ts          # Workflow CRUD
├── runs.ts               # Run history
└── checks.ts             # Status checks
```

#### 9.2 Branch Protection Rules

| Milestone | Status | Description |
|-----------|--------|-------------|
| 9.2.1 Protection Schema | TODO | Database schema for rules |
| 9.2.2 Rule Engine | TODO | Evaluate rules on push/merge |
| 9.2.3 Required Reviews | TODO | Enforce N approvals |
| 9.2.4 Required Checks | TODO | Require CI to pass |
| 9.2.5 API Endpoints | TODO | CRUD for protection rules |
| 9.2.6 UI Settings | TODO | Branch settings page |

**Files to Create:**

```
src/core/branch-protection.ts    # Rule engine
src/db/models/branch-rules.ts    # Schema
src/api/trpc/routers/branches.ts # Protection API
```

#### 9.3 Notifications System

| Milestone | Status | Description |
|-----------|--------|-------------|
| 9.3.1 Event System | TODO | Emit events on actions |
| 9.3.2 Notification Model | TODO | Store notifications |
| 9.3.3 In-App Notifications | TODO | Bell icon, dropdown |
| 9.3.4 Email Notifications | TODO | Send emails |
| 9.3.5 Notification Preferences | TODO | User settings |
| 9.3.6 WebSocket Updates | TODO | Real-time delivery |

**Files to Create:**

```
src/notifications/
├── index.ts              # Notification service
├── events.ts             # Event definitions
├── email.ts              # Email sender
└── websocket.ts          # Real-time delivery

src/db/models/notifications.ts
src/api/trpc/routers/notifications.ts
```

#### 9.4 PR Merge Execution

| Milestone | Status | Description |
|-----------|--------|-------------|
| 9.4.1 Server-side Merge | TODO | Execute git merge on server |
| 9.4.2 Merge Strategies | TODO | Merge, squash, rebase |
| 9.4.3 Conflict Detection | TODO | Pre-merge conflict check |
| 9.4.4 Post-merge Hooks | TODO | Trigger CI, notifications |

**Files to Modify:**

```
src/api/trpc/routers/pulls.ts    # Merge procedure
src/server/storage/repos.ts      # Merge execution
```

---

### Stream 10: Platform Parity Features - P1

**Priority:** High - Competitive parity  
**Timeline:** 4-6 weeks  
**Dependencies:** Stream 9

| Feature | Status | Effort | Notes |
|---------|--------|--------|-------|
| Full-text Code Search | TODO | Medium | Meilisearch integration |
| Fork Creation | TODO | Medium | Schema exists, no logic |
| OAuth Providers (GitHub/GitLab) | TODO | Medium | Full flow not implemented |
| Releases | TODO | Low | Tag-based releases |
| Wiki | TODO | Medium | Markdown documentation |

---

### Stream 11: Diff Enhancements - P2

**Priority:** Medium - Polish  
**Timeline:** 2-4 weeks

| Feature | Status | Effort | Notes |
|---------|--------|--------|-------|
| Rename Detection | TODO | Medium | Shows delete+add currently |
| Binary Diff | TODO | Low | Better binary handling |
| Word-level Diff | TODO | Low | More granular changes |

---

### Stream 12: Enterprise & Scale - P2

**Priority:** Medium - Production readiness  
**Timeline:** Ongoing

| Feature | Status | Notes |
|---------|--------|-------|
| SSH Protocol | TODO | Some users prefer SSH |
| Rate Limiting | TODO | API protection |
| Audit Logs | TODO | Enterprise compliance |
| Backup/Restore | TODO | Data protection |
| SSO/SAML | TODO | Enterprise auth |

---

## Development Phases

### Phase 1: MVP - COMPLETE

- [x] Git server with push/pull
- [x] Basic web UI for browsing repos
- [x] User authentication
- [x] Pull Request workflow
- [x] Basic issues

### Phase 2: Foundation Hardening - COMPLETE

- [x] Tests for all core modules
- [x] CI with lint, type-check, coverage
- [x] Git primitives (filesystem, knowledge)
- [x] Hooks, branch state, large files

### Phase 3: AI Differentiation - COMPLETE

- [x] AI commit messages
- [x] AI code review
- [x] AI PR descriptions
- [x] Semantic code search
- [x] Conflict resolution suggestions

### Phase 4: Platform Critical (Current - Weeks 1-8)

**Goal:** Match GitHub's critical features

- [ ] CI/CD engine with workflow execution
- [ ] Branch protection rules
- [ ] Notifications system
- [ ] Server-side PR merge
- [ ] Complete OAuth flows

### Phase 5: Platform Parity (Weeks 9-14)

**Goal:** Full GitHub feature parity

- [ ] Full-text code search (Meilisearch)
- [ ] Fork creation
- [ ] Releases
- [ ] Wiki

### Phase 6: Enterprise (Weeks 15+)

**Goal:** Enterprise-ready

- [ ] SSH protocol
- [ ] SSO/SAML
- [ ] Audit logs
- [ ] On-premise deployment

---

## Tech Stack

| Component | Technology | Status |
|-----------|------------|--------|
| CLI | TypeScript, Commander | Complete |
| Server | Node.js, Hono | Complete |
| Database | PostgreSQL, Drizzle ORM | Complete |
| API | tRPC | Complete |
| Web | React, Vite, TailwindCSS | In Progress |
| TUI | Blessed | Complete |
| AI | Mastra (OpenAI/Anthropic) | Complete |
| Search | Embeddings + Vector Store | Complete |
| Auth | Sessions, OAuth (partial) | In Progress |
| CI/CD | Docker (planned) | Not Started |

---

## Priority Matrix

### P0 - Must Have (Blocking)

1. CI/CD engine
2. Branch protection
3. Notifications
4. PR merge execution
5. OAuth providers

### P1 - Should Have (Competitive)

1. Full-text code search (Meilisearch)
2. Fork creation
3. Releases
4. Wiki

### P2 - Nice to Have (Polish)

1. Rename detection in diff
2. SSH protocol
3. Mobile experience

### P3 - Future (Enterprise)

1. SSO/SAML
2. Audit logs
3. Federation
4. P2P sync
5. Plugin system

---

## Quick Wins (Good First Issues)

- [ ] Implement fork creation logic (4 hours)
- [ ] Add webhook management UI (4 hours)
- [ ] Create release schema and CRUD (4 hours)
- [ ] Add rename detection hint in diff output (2 hours)

---

## Success Metrics

| Milestone | Target | Status |
|-----------|--------|--------|
| Core VCS parity with Git | 95% | 95% |
| All tests passing | 100% | 100% |
| Test coverage | >80% | ~80% |
| AI features complete | 100% | 100% |
| CI/CD MVP working | Week 8 | Not started |
| Branch protection working | Week 10 | Not started |

---

## Test Coverage Summary

| Test File | Coverage |
|-----------|----------|
| `repository.test.ts` | Core operations |
| `merge.test.ts` | Merge strategies, conflicts |
| `rebase.test.ts` | Rebase operations |
| `semantic-search.test.ts` | Embeddings, chunking, vector store |
| `hooks.test.ts` | Git hooks system |
| `packed-refs.test.ts` | Packed refs handling |
| `stash.test.ts` | Stash operations |
| `worktree.test.ts` | Worktree support |
| `submodule.test.ts` | Submodule support |
| `reflog.test.ts` | Reflog operations |
| + 19 more test files | Various features |

---

## Contributing

### For Contributors

1. Check the priority matrix above
2. Pick a task from P0 or P1
3. Create a branch: `wit checkout -b feature/description`
4. Implement with tests
5. Open a PR

### Code Style

- Follow existing patterns in `src/commands/`
- Use `WitError` for user-facing errors
- Include helpful suggestions in error messages
- Add tests for new functionality
- Document public functions with JSDoc

---

## License

MIT - Built in the open.
