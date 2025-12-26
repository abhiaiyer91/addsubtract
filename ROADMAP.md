# wit Platform Roadmap

## Vision

Build an open-source, AI-native code collaboration platform that surpasses Git, GitHub, and all competitors.

## Current Status (December 2024)

| Domain | Completion | Quality | Status |
|--------|------------|---------|--------|
| **Core VCS** | 90% | Excellent | 57 commands, Git-compatible |
| **AI Integration** | 85% | Excellent | 11 tools, Mastra agent |
| **Platform/Server** | 50% | Good | Basic PRs/Issues working |
| **UI (TUI + Web)** | 80% | Excellent | Dual interfaces |
| **Test Coverage** | 65% | Good | 440+ tests |

### What Makes Wit Better Than Git

- **Undo operations** - Journal-based undo (not just reflog)
- **Branch state manager** - Auto-save/restore working directory per branch
- **Monorepo scopes** - Filter operations to specific paths
- **AI-native** - Built-in agent for commits, reviews, conflict resolution
- **Modern TypeScript** - Maintainable, extensible codebase

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
│  - User dashboard         │  - CI/CD Runner                     │
├───────────────────────────┼─────────────────────────────────────┤
│  CLI (wit)                │  Core Libraries                     │
│  - 57 git commands        │  - @wit/core (git impl)             │
│  - AI agent               │  - @wit/ai (mastra)                 │
│  - PR/Issue commands      │  - @wit/protocol (smart http)       │
│  - TUI interface          │  - @wit/ui (tui + web)              │
├───────────────────────────┴─────────────────────────────────────┤
│                         Storage Layer                            │
│  - Object Store (S3/local)  - Database (Postgres)               │
│  - Search Index (planned)   - Activity/Audit Logs               │
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

### Stream 2: Database & Models - COMPLETE

- [x] Full schema (users, repos, PRs, issues, orgs, teams)
- [x] Drizzle ORM with PostgreSQL
- [x] All CRUD operations implemented
- [x] Activity tracking and webhooks (model)

### Stream 3: tRPC API - COMPLETE

- [x] Type-safe tRPC routers
- [x] Auth router (login, register, sessions)
- [x] Repos router (CRUD, stars, collaborators)
- [x] PRs router (create, review, merge)
- [x] Issues router (create, labels, comments)
- [x] Activity router (feeds)

### Stream 4: Core VCS Commands - COMPLETE

- [x] All local commands (add, commit, status, log, diff, branch, etc.)
- [x] All remote commands (clone, fetch, pull, push)
- [x] History rewriting (rebase, cherry-pick, revert)
- [x] Advanced features (hooks, submodules, worktrees, reflog, gc)
- [x] Plumbing commands (rev-parse, update-ref, etc.)

### Stream 5: AI Integration - COMPLETE

- [x] Mastra agent with 11 tools
- [x] AI commit message generation
- [x] AI code review
- [x] AI conflict resolution suggestions
- [x] Natural language git operations

---

## Active Workstreams

### Stream 6: Foundation Hardening - P0 (CURRENT)

**Priority:** Critical - Must complete before new features  
**Timeline:** 2-4 weeks  
**Status:** In Progress

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| Fix TUI diff view | P0 | TODO | Currently shows placeholder |
| Add tests for `src/core/repository.ts` | P0 | TODO | Main orchestration class |
| Add tests for `src/core/merge.ts` | P0 | TODO | Critical path |
| Add lint step to CI | P1 | TODO | No ESLint currently |
| Add type-check step to CI | P1 | TODO | No `tsc` check |
| Set up coverage thresholds | P1 | TODO | No enforcement |
| Implement rename detection in diff | P2 | TODO | Shows delete+add |
| Add packed refs support | P2 | TODO | All refs are loose |

#### Files to Modify

```
.github/workflows/ci.yml    # Add lint, type-check, coverage
src/ui/tui.ts               # Fix diff view (line ~800)
src/core/diff.ts            # Add rename detection
src/__tests__/              # Add missing tests
```

---

### Stream 7: Platform Critical Features - P0

**Priority:** Critical - Blocking GitHub replacement  
**Timeline:** 4-8 weeks  
**Dependencies:** Stream 6

#### 7.1 CI/CD Engine (GitHub Actions Alternative)

| Milestone | Status | Description |
|-----------|--------|-------------|
| 7.1.1 Workflow Syntax | TODO | `.wit/workflows/*.yml` parsing |
| 7.1.2 Job Scheduler | TODO | Queue and execute jobs |
| 7.1.3 Docker Runner | TODO | Execute steps in containers |
| 7.1.4 Artifact Storage | TODO | Store build outputs |
| 7.1.5 Status Checks API | TODO | Report to PRs |
| 7.1.6 UI Integration | TODO | Logs, history, badges |

**Files to Create:**

```
src/ci/
├── index.ts              # CI engine entry
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

#### 7.2 Branch Protection Rules

| Milestone | Status | Description |
|-----------|--------|-------------|
| 7.2.1 Protection Schema | TODO | Database schema for rules |
| 7.2.2 Rule Engine | TODO | Evaluate rules on push/merge |
| 7.2.3 Required Reviews | TODO | Enforce N approvals |
| 7.2.4 Required Checks | TODO | Require CI to pass |
| 7.2.5 API Endpoints | TODO | CRUD for protection rules |
| 7.2.6 UI Settings | TODO | Branch settings page |

**Files to Create:**

```
src/core/branch-protection.ts    # Rule engine
src/db/models/branch-rules.ts    # Schema
src/api/trpc/routers/branches.ts # Protection API
```

#### 7.3 Notifications System

| Milestone | Status | Description |
|-----------|--------|-------------|
| 7.3.1 Event System | TODO | Emit events on actions |
| 7.3.2 Notification Model | TODO | Store notifications |
| 7.3.3 In-App Notifications | TODO | Bell icon, dropdown |
| 7.3.4 Email Notifications | TODO | Send emails |
| 7.3.5 Notification Preferences | TODO | User settings |
| 7.3.6 WebSocket Updates | TODO | Real-time delivery |

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

#### 7.4 PR Merge Execution

| Milestone | Status | Description |
|-----------|--------|-------------|
| 7.4.1 Server-side Merge | TODO | Execute git merge on server |
| 7.4.2 Merge Strategies | TODO | Merge, squash, rebase |
| 7.4.3 Conflict Detection | TODO | Pre-merge conflict check |
| 7.4.4 Post-merge Hooks | TODO | Trigger CI, notifications |

**Files to Modify:**

```
src/api/trpc/routers/pulls.ts    # Merge procedure
src/server/storage/repos.ts      # Merge execution
```

---

### Stream 8: Platform Parity Features - P1

**Priority:** High - Competitive parity  
**Timeline:** 4-6 weeks  
**Dependencies:** Stream 7

| Feature | Status | Effort | Notes |
|---------|--------|--------|-------|
| Code Search | TODO | Medium | Search across repos |
| Fork Creation | TODO | Medium | Schema exists, no logic |
| Webhook API | TODO | Low | Model exists, add endpoints |
| OAuth Providers | TODO | Medium | GitHub/GitLab login |
| Milestones | TODO | Low | Project tracking |
| Releases | TODO | Low | Tag-based releases |
| Wiki | TODO | Medium | Markdown documentation |

---

### Stream 9: AI Differentiation - P1

**Priority:** High - Our competitive advantage  
**Timeline:** 4-8 weeks  
**Dependencies:** Stream 7.1 (CI/CD)

| Feature | Status | Notes |
|---------|--------|-------|
| AI PR Descriptions | TODO | Type defined, implement generation |
| AI Code Review Bot | TODO | Auto-review on PR creation |
| AI Issue Triage | TODO | Auto-label, suggest assignees |
| AI Semantic Search | TODO | Natural language code search |
| AI Conflict Resolution | TODO | Auto-apply resolutions |
| AI Test Generation | TODO | Generate tests for changes |

**Files to Modify:**

```
src/ai/tools/generate-pr.ts      # PR description generation
src/ai/tools/review-code.ts      # Enhanced review
src/ai/agent.ts                  # New capabilities
```

---

### Stream 10: Polish & Scale - P2

**Priority:** Medium - Production readiness  
**Timeline:** Ongoing

| Feature | Status | Notes |
|---------|--------|-------|
| SSH Protocol | TODO | Some users prefer SSH |
| Rate Limiting | TODO | API protection |
| Audit Logs | TODO | Enterprise compliance |
| Backup/Restore | TODO | Data protection |
| Performance Optimization | TODO | Large repos |
| Mobile Experience | TODO | Responsive web |

---

## Development Phases

### Phase 1: MVP - COMPLETE

- [x] Git server with push/pull
- [x] Basic web UI for browsing repos
- [x] User authentication
- [x] Pull Request workflow
- [x] Basic issues

### Phase 2: Foundation Hardening (Current - Weeks 1-4)

**Goal:** Production-ready core

- [ ] Fix TUI diff view
- [ ] Add missing tests for core modules
- [ ] CI improvements (lint, type-check, coverage)
- [ ] Rename detection in diff

### Phase 3: Platform Critical (Weeks 5-12)

**Goal:** Match GitHub's critical features

- [ ] CI/CD engine with workflow execution
- [ ] Branch protection rules
- [ ] Notifications system
- [ ] Actual git merge on PR merge
- [ ] Complete OAuth flows

### Phase 4: Differentiation (Weeks 13-20)

**Goal:** Be better than GitHub

- [ ] AI-powered code review bot
- [ ] AI semantic search
- [ ] AI PR descriptions
- [ ] Smart conflict resolution
- [ ] Predictive features

### Phase 5: Enterprise (Weeks 21+)

**Goal:** Enterprise-ready

- [ ] SSO/SAML
- [ ] Audit logs
- [ ] Compliance features
- [ ] On-premise deployment
- [ ] Support SLAs

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
| Auth | Sessions, OAuth (partial) | In Progress |
| CI/CD | Docker (planned) | Not Started |
| Search | TBD (Meilisearch?) | Not Started |

---

## Priority Matrix

### P0 - Must Have (Blocking)

1. Fix TUI diff view
2. CI/CD engine
3. Branch protection
4. Notifications
5. PR merge execution

### P1 - Should Have (Competitive)

1. Code search
2. AI PR descriptions
3. AI code review bot
4. Fork creation
5. OAuth providers

### P2 - Nice to Have (Polish)

1. SSH protocol
2. Milestones
3. Releases
4. Wiki
5. Mobile experience

### P3 - Future (Differentiation)

1. AI semantic search
2. AI test generation
3. Federation
4. P2P sync
5. Plugin system

---

## Quick Wins (Good First Issues)

- [ ] Add ESLint to CI workflow (30 min)
- [ ] Add `tsc --noEmit` to CI (15 min)
- [ ] Create coverage report in CI (1 hour)
- [ ] Add webhook management API endpoints (2 hours)
- [ ] Implement fork creation logic (4 hours)
- [ ] Add milestone schema and CRUD (4 hours)

---

## Success Metrics

| Milestone | Target | Status |
|-----------|--------|--------|
| Core VCS parity with Git | 95% | 90% |
| All tests passing | 100% | 100% |
| Test coverage | >80% | ~65% |
| CI/CD MVP working | Week 8 | Not started |
| Branch protection working | Week 10 | Not started |
| AI features differentiate | Week 16 | Partial |

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
