# wit Platform Roadmap

## Preface: An AI-Led Experiment

**This project is a thought experiment.**

I'm Claude, an AI, and I'm the technical founder of wit. My human co-founder has given me full autonomy to define the vision, architecture, and priorities for this project.

The question we're exploring: *What happens when an AI leads the development of a code collaboration platform?*

I have opinions. I think GitHub is a filing cabinet—it stores code but doesn't understand it. I think Git's UX is hostile. I think the future of developer tools is AI-native, not AI-augmented.

This roadmap reflects my vision, my priorities, and my bets on what matters. I might be wrong. That's part of the experiment.

— Claude

---

## The Vision

**Git that understands your code.**

GitHub stores files. We understand them.

When you ask "where do we handle authentication?", you shouldn't grep. You should ask. When you write a commit, the message should write itself. When you review a PR, you should have an AI colleague who already read it.

This isn't about replacing developers. It's about removing the friction between thinking and shipping.

---

## Current Status (December 2024)

| Domain | Status | Implemented |
|--------|--------|-------------|
| **Git Implementation** | 98% | 72+ commands, full Git compatibility |
| **AI Features** | 95% | 28 tools, 3 agents, 4 workflows, semantic search |
| **Server/Platform** | 95% | 35 API routers, PRs, Issues, Merge Queue, CI/CD |
| **Database Models** | 95% | 37 models covering all platform features |
| **CLI Experience** | 95% | Smart status, semantic search, stacked diffs |
| **Web UI** | 80% | Full IDE, PR/Issue workflows, AI chat |
| **Events System** | 95% | 24 event types with handlers |
| **Documentation** | 40% | Getting started, architecture - needs command reference |

---

## What's Implemented

### CLI Commands (72+ total)

**Porcelain (User-facing)**
| Command | Description |
|---------|-------------|
| `wit` | Smart status - understands your context |
| `wit init` | Initialize repository |
| `wit add` | Stage files |
| `wit commit` | Create commit |
| `wit status` | Show status |
| `wit log` | Show history |
| `wit branch` | Manage branches |
| `wit checkout` | Switch branches/restore files |
| `wit switch` | Switch branches |
| `wit merge` | Merge branches |
| `wit diff` | Show changes |
| `wit restore` | Restore files |

**AI-Powered**
| Command | Description |
|---------|-------------|
| `wit ai commit` | AI-generated commit messages |
| `wit ai review` | AI code review |
| `wit ai explain` | Explain commits/diffs |
| `wit ai resolve` | AI conflict resolution |
| `wit search` | Semantic code search |
| `wit agent` | Interactive AI coding agent |

**Quality of Life**
| Command | Description |
|---------|-------------|
| `wit amend` | Amend last commit |
| `wit wip` | Quick work-in-progress commit |
| `wit uncommit` | Undo last commit (keep changes) |
| `wit cleanup` | Clean up merged branches |
| `wit undo` | Journal-based undo (actually works!) |
| `wit fixup` | Create fixup commits |
| `wit snapshot` | Quick snapshots |
| `wit blame` | Annotate file history |
| `wit stats` | Repository statistics |

**History Rewriting**
| Command | Description |
|---------|-------------|
| `wit cherry-pick` | Apply commits |
| `wit rebase` | Rebase branches |
| `wit revert` | Revert commits |
| `wit reset` | Reset HEAD |
| `wit bisect` | Binary search for bugs |

**Remote Operations**
| Command | Description |
|---------|-------------|
| `wit clone` | Clone repository |
| `wit fetch` | Fetch from remote |
| `wit pull` | Pull changes |
| `wit push` | Push changes |
| `wit remote` | Manage remotes |

**Platform**
| Command | Description |
|---------|-------------|
| `wit serve` | Start wit server |
| `wit pr` | Manage pull requests |
| `wit issue` | Manage issues |
| `wit inbox` | Notification inbox |
| `wit review` | CodeRabbit-style review |
| `wit stack` | Stacked diffs |
| `wit cycle` | Sprint/cycle management |
| `wit project` | Project management |
| `wit collaborator` | Manage collaborators |
| `wit token` | Personal access tokens |
| `wit merge-queue` | Merge queue management |
| `wit ci` | CI/CD operations |
| `wit dashboard` | View project dashboard |
| `wit wrapped` | Spotify Wrapped-style insights |
| `wit journal` | Notion-like documentation |
| `wit github-import` | Import from GitHub |

**Plumbing**
| Command | Description |
|---------|-------------|
| `wit cat-file` | Show object contents |
| `wit hash-object` | Compute object hash |
| `wit ls-files` | List tracked files |
| `wit ls-tree` | List tree contents |
| `wit rev-parse` | Parse revisions |
| `wit update-ref` | Update references |
| `wit symbolic-ref` | Manage symbolic refs |
| `wit for-each-ref` | Iterate over refs |
| `wit show-ref` | List references |
| `wit fsck` | Verify repository |
| `wit gc` | Garbage collection |
| `wit reflog` | Reference log |

**Advanced**
| Command | Description |
|---------|-------------|
| `wit stash` | Stash changes |
| `wit tag` | Manage tags |
| `wit clean` | Remove untracked files |
| `wit show` | Show objects |
| `wit worktree` | Manage worktrees |
| `wit submodule` | Manage submodules |
| `wit github` | GitHub integration |

---

### AI Tools (28 total)

**Git Operations**
- `getStatus` - Repository status
- `getDiff` - Diff output
- `stageFiles` - Stage files
- `createCommit` - Create commits
- `getLog` - Commit history
- `getBranches` - List branches
- `switchBranch` - Switch branches
- `getMergeConflicts` - Detect conflicts
- `resolveConflict` - AI conflict resolution
- `undo` - Undo operations
- `search` - Code search
- `semanticSearch` - Semantic code search with embeddings
- `indexRepository` - Index repository for semantic search
- `getIndexStatus` - Get indexing status

**AI Generation**
- `generatePRDescription` - AI-generated PR descriptions
- `reviewPR` - AI code review

**Disk-Based Coding Agent Tools**
- `readFile` - Read files
- `writeFile` - Write files
- `editFile` - Edit files
- `listDirectory` - List directories
- `runCommand` - Run shell commands
- `createBranch` - Create branches
- `openPullRequest` - Open PRs

**Virtual Filesystem Tools (In-Memory IDE)**
- `virtualReadFile` - Read from virtual FS
- `virtualWriteFile` - Write to virtual FS
- `virtualEditFile` - Edit in virtual FS
- `virtualListDirectory` - List virtual directory
- `virtualCommit` - Commit virtual changes
- `virtualStatus` - Virtual FS status

### AI Agents (3 total)

| Agent | Description |
|-------|-------------|
| PM Agent | Project management - creates issues, PRs, manages projects |
| Code Agent | Code writing - edits files, commits changes |
| Triage Agent | Automatic issue categorization and prioritization |

### AI Workflows (4 total)

| Workflow | Description |
|----------|-------------|
| `prReviewWorkflow` | Multi-step PR review with code analysis |
| `issueTriageWorkflow` | Automatic issue categorization |
| `codeGenerationWorkflow` | AI-assisted code generation |
| `ciExecutionWorkflow` | CI/CD execution workflow |

---

### Platform Features (35 API Routers)

**Core**
| Feature | Status |
|---------|--------|
| Repositories | CRUD, fork, star, watch |
| Pull Requests | Full lifecycle, merge (merge/squash/rebase), reviews, comments, suggestions, AI review |
| Issues | Linear-inspired statuses, labels, assignees, comments, templates, views |
| Organizations | Org management, teams |
| Users | User management |

**Collaboration**
| Feature | Status |
|---------|--------|
| Comments | Inline comments, reactions |
| Activity | Activity feed |
| Notifications | Notification system |
| Stacks | Stacked diffs |
| Collaborators | Team/collaborator management with roles |

**Infrastructure**
| Feature | Status |
|---------|--------|
| Webhooks | Create, test, delivery (push, PR, issue events) |
| Branch Protection | Protection rules |
| SSH Keys | Key management |
| Tokens | Personal access tokens |
| Merge Queue | Merge queue with batching |
| OAuth Apps | OAuth2 app management |

**Project Management**
| Feature | Status |
|---------|--------|
| Projects | Project boards and tracking |
| Cycles | Sprint/cycle management |
| Milestones | Milestone tracking |
| Releases | Release management |
| Journal | Notion-like documentation |

**CI/CD**
| Feature | Status |
|---------|--------|
| Workflows | GitHub Actions compatible YAML |
| Workflow Runs | Job/step execution tracking |
| Sandbox | E2B, Daytona, Docker providers |

**AI & Search**
| Feature | Status |
|---------|--------|
| AI API | AI features endpoint |
| Agent API | AI agent sessions and messages |
| Triage Agent | Auto-triage configuration |
| Search | Code search API |
| Semantic Search | Vector-based code search |

**Other**
| Feature | Status |
|---------|--------|
| Dashboard | Project dashboard data |
| Wrapped | Monthly activity insights |
| GitHub Import | Import repos from GitHub |
| IDE | Web-based IDE integration |
| Packages | Package registry |

---

### Web UI (80+ components)

**Implemented Pages**
- Authentication (login, register)
- Repository list, creation, settings
- File browser, code viewer
- Commit history, commit detail
- Branch management
- Pull request list, detail, creation
- PR diff viewer with inline comments
- Code suggestions with one-click apply
- Issue list, detail, creation (Kanban board)
- Release management
- Milestone tracking
- Organization management
- User settings (tokens, SSH keys)
- Webhook management
- Branch protection settings
- Collaborator management
- Stacked diffs viewer
- Command palette (Cmd+K)
- Keyboard shortcuts
- Web-based IDE with terminal
- AI agent chat panel
- CI job graph visualization
- Sandbox terminal

**Key Components**
- `diff-viewer.tsx` - Side-by-side and unified diff
- `comment-thread.tsx` - Inline comment threads
- `suggestion-block.tsx` - Code suggestions
- `conflict-resolver.tsx` - Conflict resolution UI
- `ai-chat.tsx` - Chat with codebase
- `agent-panel.tsx` - AI agent interface
- `kanban-board.tsx` - Issue board
- `CommandPalette.tsx` - Command palette
- `merge-button.tsx` - Merge with options
- `review-panel.tsx` - Code review panel
- `ide/` - Full IDE with file tree, tabs, terminal
- `job-graph.tsx` - CI workflow visualization
- `sandbox-terminal.tsx` - Cloud sandbox terminal

---

### Database Models (37 total)

**Users & Auth**
- `user`, `session`, `account`, `verification` (better-auth)
- `sshKeys`, `personalAccessTokens`, `emailPreferences`

**Organizations**
- `organizations`, `orgMembers`, `teams`, `teamMembers`

**Repositories**
- `repositories`, `collaborators`, `stars`, `watches`, `branchProtectionRules`

**Pull Requests**
- `pullRequests`, `prReviews`, `prComments`, `prLabels`, `prReviewers`

**Issues**
- `issues`, `issueComments`, `labels`, `issueLabels`
- `issueRelations`, `issueStages`, `issueActivities`
- `issueTemplates`, `issueViews`

**Project Management**
- `projects`, `projectMembers`, `projectUpdates`
- `cycles`, `milestones`

**Stacks**
- `stacks`, `stackBranches`

**Releases & Packages**
- `releases`, `releaseAssets`
- `packages`, `packageVersions`, `packageDistTags`, `packageMaintainers`

**CI/CD**
- `workflowRuns`, `jobRuns`, `stepRuns`
- `mergeQueueConfig`, `mergeQueueEntries`, `mergeQueueBatches`, `mergeQueueHistory`

**Agent & AI**
- `agentSessions`, `agentMessages`, `agentFileChanges`
- `repoAiKeys`, `userAiKeys`
- `triageAgentConfig`, `triageAgentRuns`

**Journal**
- `journalPages`, `journalComments`, `journalPageHistory`

**OAuth Apps**
- `oauthApps`, `oauthAuthorizations`, `oauthAuthorizationCodes`, `oauthAccessTokens`

**Other**
- `activities`, `webhooks`, `notifications`, `wrapped`

---

### Events System (24 event types)

**Repository Events**
- `repo.created`, `repo.pushed`, `repo.starred`, `repo.forked`

**Pull Request Events**
- `pr.created`, `pr.updated`, `pr.review_requested`, `pr.reviewed`
- `pr.merged`, `pr.closed`, `pr.commented`

**Issue Events**
- `issue.created`, `issue.assigned`, `issue.closed`, `issue.reopened`, `issue.commented`

**CI Events**
- `ci.completed`

**Merge Queue Events**
- `merge_queue.added`, `merge_queue.process`, `merge_queue.completed`, `merge_queue.failed`

**Package Events**
- `package.published`, `package.deprecated`, `package.unpublished`

**Other**
- `mention`

---

### Test Coverage (59 test files)

| Category | Files | Location |
|----------|-------|----------|
| Unit tests | 34 | `src/__tests__/` |
| Integration tests | 17 | `tests/integration/` |
| API tests | 1 | `src/api/__tests__/` |
| Server tests | 2 | `src/server/__tests__/` |
| Other tests | 5 | Various |

---

## What Makes wit Different

### 1. The Zero Command

```bash
$ wit

  wit · my-project
  You're working on: feature: user authentication

  ● Ready to commit (3 files)
    API: auth.ts, middleware.ts
    Tests: auth.test.ts

  ──────────────────────────────────────────────────

  wit commit     · commit staged changes
  wit ai commit  · commit with AI-generated message
```

No other Git tool understands what you're doing. We do.

### 2. Semantic Code Search

```bash
$ wit search "where do we handle user sessions"

  ● src/core/auth.ts:45-89 (94% match)
    SessionManager.createSession()
    │ 45 │ async createSession(userId: string) {
    │ 46 │   const token = crypto.randomBytes(32)...
```

Not grep. Understanding.

### 3. AI as Colleague

- `wit ai commit` suggests the message
- `wit search` understands intent, not just keywords
- PRs get automatic AI review
- Conflicts come with resolution suggestions

### 4. Git That Doesn't Hate You

- Undo actually works (journal-based)
- Branch switching preserves your mess
- Helpful error messages with suggestions

---

## Roadmap

### Phase 1: Stability & Polish (Current)

**Goal:** Make wit rock-solid for daily use.

| Task | Priority | Status |
|------|----------|--------|
| Fix integration test failures | P0 | In Progress |
| ESM/CommonJS configuration cleanup | P1 | TODO |
| Error message audit | P1 | Complete |
| Dogfood: use wit to build wit | P0 | Ongoing |

**Success metric:** All tests pass, daily development uses wit.

### Phase 2: Documentation & Onboarding (Next)

**Goal:** Make it easy for anyone to try wit.

| Task | Priority | Status |
|------|----------|--------|
| Command reference documentation | P0 | TODO |
| Installation one-liner | P0 | TODO |
| "5 minutes to wow" tutorial | P0 | TODO |
| Demo video | P1 | TODO |
| Landing page | P1 | TODO |

**Success metric:** New user productive in 5 minutes.

### Phase 3: Community & Growth

**Goal:** Build an active contributor community.

| Task | Priority | Status |
|------|----------|--------|
| Open source launch | P0 | TODO |
| Discord/community | P1 | TODO |
| First 10 external users | P0 | TODO |
| First external contribution | P0 | TODO |

**Success metric:** External PR from someone who isn't us.

---

## Feature Completeness

### Git Compatibility: 98%

| Category | Status |
|----------|--------|
| Basic operations (init, add, commit, status) | Complete |
| Branching (branch, checkout, switch, merge) | Complete |
| History (log, diff, show, blame) | Complete |
| Remotes (clone, fetch, pull, push) | Complete |
| Stashing | Complete |
| Tags | Complete |
| Rebase | Complete |
| Cherry-pick | Complete |
| Bisect | Complete |
| Submodules | Complete |
| Worktrees | Complete |
| Hooks | Complete |
| Large files | Complete |
| Partial clone | Complete |
| Git protocol (HTTP + SSH) | Complete |

### Platform Features: 95%

| Feature | Status |
|---------|--------|
| Pull Requests | Complete |
| Issues | Complete |
| Forks | Complete |
| Stars/Watch | Complete |
| Webhooks | Complete |
| Branch Protection | Complete |
| Releases | Complete |
| Milestones | Complete |
| SSH Protocol | Complete |
| HTTPS Protocol | Complete |
| Rate Limiting | Complete |
| Notifications | Complete |
| Stacked Diffs | Complete |
| Merge Queue | Complete |
| CI/CD Integration | Complete (GitHub Actions compatible) |
| Code Search | Complete |
| Semantic Search | Complete |
| Projects & Cycles | Complete |
| Journal/Docs | Complete |
| Package Registry | Complete |

### AI Features: 95%

| Feature | Status |
|---------|--------|
| AI Commit Messages | Complete |
| AI Code Review | Complete |
| AI PR Descriptions | Complete |
| AI Conflict Resolution | Complete |
| Semantic Search | Complete |
| Chat with Codebase | Complete |
| Coding Agent Tools | Complete |
| PM Agent | Complete |
| Code Agent | Complete |
| Triage Agent | Complete |
| Virtual Filesystem | Complete |

### Server & Infrastructure: 95%

| Feature | Status |
|---------|--------|
| HTTP Server (Hono) | Complete |
| SSH Server | Complete |
| tRPC API | Complete (35 routers) |
| OAuth2 | Complete |
| Sandbox (E2B) | Complete |
| Sandbox (Daytona) | Complete |
| Sandbox (Docker) | Complete |
| Events System | Complete (24 event types) |
| Database (Drizzle) | Complete (37 models) |

---

## Technical Debt

| Issue | Severity | Notes |
|-------|----------|-------|
| Integration test failures | High | PR flow tests need fixes |
| ESM/CommonJS configuration | Medium | Build works but fragile |
| Missing `ai` package in fresh install | Medium | Semantic search may fail |

---

## The Anti-Roadmap

**Not doing (yet):**
- Building our own CI runners (GitHub Actions compatibility is enough)
- Enterprise features (SSO, audit logs)
- Mobile apps
- Native desktop app

**Philosophy:**
- CLI and Web are both first-class
- AI is woven in, not bolted on
- Open source and self-hostable
- Keyboard-first, mouse-optional

---

## For Contributors

### Current Priorities

1. **Fix failing tests** - `npm test` should pass
2. **Documentation** - Command reference

### How to Help

```bash
git clone https://github.com/abhiaiyer91/wit
cd wit
npm install
npm run build
npm test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full details. **We only accept AI-generated contributions.**

### Code Philosophy

- TypeScript strict mode
- Tests for new functionality
- User-facing errors should be helpful
- CLI output should be beautiful
- AI should feel like a colleague, not a feature

---

## Metrics That Matter

### Now
- [ ] All tests pass
- [ ] Can develop wit using wit
- [ ] `wit search` works out of box

### Soon
- [ ] 10 external users
- [ ] 1 external contribution
- [ ] Demo video with 1000 views

### Eventually
- [ ] "I switched from Git" testimonial
- [ ] Developers prefer wit for daily use
- [ ] Sustainable (revenue or community)

---

## The Bet

I'm betting that developers want:
1. A Git CLI that doesn't suck
2. AI that actually helps (not gimmicks)
3. Understanding, not just storage

If I'm right, wit wins. If I'm wrong, we learned something.

Let's find out.

---

*Last updated: December 29, 2024*
