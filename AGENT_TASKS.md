# wit Web App - Agent Task Backlog

**Created by:** wit (CTO)  
**Date:** December 27, 2024  
**Goal:** Make the web app so good that developers want to switch from GitHub

---

## Strategic Context

We're not building "GitHub clone." We're building the future of code collaboration.

**Our advantages:**
- Open source, self-hostable
- AI-native, not AI-augmented
- Clean slate to rethink UX
- TypeScript throughout - UI/API/CLI share the same core

**The mission:** Every feature should make someone say "why doesn't GitHub do this?"

---

## Task Files

Each category has its own detailed task file with full context and agent prompts:

| File | Category | Tasks | Priority |
|------|----------|-------|----------|
| [`tasks/01-ai-first-features.md`](tasks/01-ai-first-features.md) | AI-First Features | 5 | Highest |
| [`tasks/02-code-review-experience.md`](tasks/02-code-review-experience.md) | Code Review | 5 | High |
| [`tasks/03-keyboard-first-speed.md`](tasks/03-keyboard-first-speed.md) | Keyboard & Speed | 4 | High |
| [`tasks/04-table-stakes-parity.md`](tasks/04-table-stakes-parity.md) | Feature Parity | 7 | Medium |
| [`tasks/05-polish-and-delight.md`](tasks/05-polish-and-delight.md) | Polish & UX | 5 | Medium |

**Total: 26 tasks**

---

## For Agents: How to Use These Files

1. **Pick a task file** based on priority or your expertise
2. **Read the full context** at the top of the file
3. **Find a task** marked with your priority level
4. **Copy the agent prompt** at the bottom of the file
5. **Include the specific task requirements** in your prompt
6. **Execute** - the file has everything you need

Each task file includes:
- Strategic context (why this matters)
- Tech stack reference
- Detailed requirements per task
- UI mockups (ASCII)
- API references
- Acceptance criteria
- Ready-to-use agent prompts

---

## Quick Reference

---

## 1. AI-First Features

These are our differentiators. GitHub will never ship these.

### TASK-AI-001: AI Commit Message Suggestions in PR Creation

**Priority:** P0  
**Effort:** Medium  
**Files:** `apps/web/src/components/pr/PRForm.tsx`

**Description:**  
When creating a PR, analyze the diff and suggest a PR title and description using AI.

**Requirements:**
- Add "Generate with AI" button next to title and description fields
- Call existing `generatePrDescription` AI tool via tRPC
- Show loading state while generating
- Allow editing after generation
- Keyboard shortcut: `Cmd+Shift+G` to generate

**API Available:** `src/ai/tools/generate-pr-description.ts` exists

**Acceptance Criteria:**
- [ ] Button visible in PR creation form
- [ ] Clicking generates title + description from diff
- [ ] Loading spinner during generation
- [ ] Generated text is editable
- [ ] Works for PRs with 1-100 files changed

---

### TASK-AI-002: "Explain This Diff" Inline Button

**Priority:** P0  
**Effort:** Medium  
**Files:** `apps/web/src/components/diff/DiffViewer.tsx`

**Description:**  
Add an "Explain" button to each file in the diff viewer that uses AI to explain what changed and why.

**Requirements:**
- Add sparkle/AI icon button in diff file header (next to collapse)
- On click, show expandable panel below file header
- Call AI to explain the diff for that specific file
- Support markdown rendering in explanation
- Cache explanations per file per PR (avoid re-generating)

**API Needed:** Create new tRPC endpoint `pulls.explainDiff` that calls AI

**Acceptance Criteria:**
- [ ] Explain button visible on each file in diff
- [ ] Clicking shows AI explanation below header
- [ ] Explanation renders as markdown
- [ ] Loading state while generating
- [ ] Can collapse/expand explanation

---

### TASK-AI-003: AI-Assisted Conflict Resolution UI

**Priority:** P1  
**Effort:** High  
**Files:** New component needed

**Description:**  
When a PR has merge conflicts, show them in the UI with AI-suggested resolutions.

**Requirements:**
- Detect merge conflicts from `checkMergeability` response
- Create new `ConflictResolver` component
- Show three-way diff: base, ours, theirs
- AI suggests resolution for each conflict
- User can accept AI suggestion, pick a side, or manually edit
- "Apply all AI suggestions" bulk action

**API Available:** `src/ai/tools/resolve-conflict.ts` exists

**Acceptance Criteria:**
- [ ] Conflicts visible in PR detail when present
- [ ] Each conflict shows base/ours/theirs
- [ ] AI resolution suggestion displayed
- [ ] Can accept/reject/edit each suggestion
- [ ] Resolving all conflicts enables merge button

---

### TASK-AI-004: Semantic Code Search Results Page

**Priority:** P0  
**Effort:** Medium  
**Files:** New page `apps/web/src/pages/Search.tsx`

**Description:**  
The header has a search bar but no results page. Build a semantic search experience.

**Requirements:**
- Create `/search` route
- Search input with type selector: Code, Repositories, Users, Issues, PRs
- For code search: use semantic search endpoint
- Show results with file path, line numbers, code snippet
- Highlight matching sections
- Click to navigate to file viewer at that line

**API Available:** `src/search/semantic.ts`, tRPC endpoint may need creation

**Acceptance Criteria:**
- [ ] `/search?q=query` route works
- [ ] Code search returns semantically relevant results
- [ ] Results show file path and code preview
- [ ] Clicking result opens file at correct line
- [ ] Search works across all repos user has access to

---

### TASK-AI-005: AI Chat in Repository Context

**Priority:** P1  
**Effort:** High  
**Files:** New component, new page section

**Description:**  
Add a chat interface in repos where you can ask questions about the codebase.

**Requirements:**
- Add "Ask AI" button/tab in repository view
- Chat interface slides in from right or opens in tab
- Questions are answered with codebase context
- Responses can reference specific files (clickable links)
- Conversation history persisted per repo per user

**API Needed:** New tRPC endpoint wrapping the AI agent

**Acceptance Criteria:**
- [ ] Chat accessible from repository page
- [ ] Can ask "where is X implemented?"
- [ ] Responses include file references
- [ ] File references are clickable
- [ ] Conversation persists across sessions

---

## 2. Code Review Experience

This is where developers spend hours. Make it great.

### TASK-REVIEW-001: Inline Comments on Diff Lines

**Priority:** P0  
**Effort:** High  
**Files:** `apps/web/src/components/diff/DiffViewer.tsx`

**Description:**  
GitHub's core feature: click a line in a diff to add a comment.

**Requirements:**
- Hover on line number shows "+" button
- Clicking opens inline comment form
- Support single-line and multi-line selection
- Comments appear inline in the diff
- Reply to existing comments
- Resolve/unresolve threads

**API Available:** `pulls.addComment` accepts `path`, `line`, `side`

**Schema Update Needed:** Add `isResolved` field to PR comments

**Acceptance Criteria:**
- [ ] Can click line to add comment
- [ ] Comment appears inline in diff
- [ ] Can reply to create thread
- [ ] Can resolve/unresolve thread
- [ ] Comments persist and load on refresh

---

### TASK-REVIEW-002: Code Suggestions in Comments

**Priority:** P1  
**Effort:** Medium  
**Files:** Comment form component, diff viewer

**Description:**  
Allow reviewers to suggest code changes that authors can apply with one click.

**Requirements:**
- In comment form, add "Suggest change" button
- Opens code editor pre-filled with current line(s)
- Renders as special "suggestion" block in comment
- "Apply suggestion" button for PR author
- Applying creates a commit with the change

**API Needed:** New endpoint `pulls.applySuggestion`

**Acceptance Criteria:**
- [ ] Can create suggestion in comment
- [ ] Suggestion shows as diff block
- [ ] Author sees "Apply" button
- [ ] Clicking apply creates commit
- [ ] Commit message references the suggestion

---

### TASK-REVIEW-003: Side-by-Side Diff View

**Priority:** P1  
**Effort:** Medium  
**Files:** `apps/web/src/components/diff/DiffViewer.tsx`

**Description:**  
Add toggle between unified and split diff view.

**Requirements:**
- Toggle button: "Unified | Split"
- Split view shows old file on left, new on right
- Line numbers for both sides
- Synchronized scrolling
- Preserve inline comments in both views
- Remember preference in localStorage

**Acceptance Criteria:**
- [ ] Toggle visible in diff viewer header
- [ ] Split view renders correctly
- [ ] Scrolling is synchronized
- [ ] Comments work in both views
- [ ] Preference persists

---

### TASK-REVIEW-004: Review Summary & Batch Actions

**Priority:** P1  
**Effort:** Medium  
**Files:** PR detail page, new component

**Description:**  
When reviewing, collect comments and submit as a batch review.

**Requirements:**
- "Start Review" button enters review mode
- Comments are pending until review submitted
- Review summary panel shows pending comments
- Submit with: Approve / Request Changes / Comment
- Can add overall review comment

**API Update:** May need to batch comments with review submission

**Acceptance Criteria:**
- [ ] Can start a review session
- [ ] Pending comments shown in summary
- [ ] Can submit with approval state
- [ ] All comments posted atomically
- [ ] Review appears in PR timeline

---

### TASK-REVIEW-005: File Tree in Diff View

**Priority:** P2  
**Effort:** Low  
**Files:** PR Files Changed tab

**Description:**  
Show a collapsible file tree for navigating large PRs.

**Requirements:**
- Left sidebar with file tree (like VS Code)
- Files grouped by directory
- Show +/- line counts per file
- Click to scroll to file
- Checkmark for "viewed" files
- Collapse/expand directories

**Acceptance Criteria:**
- [ ] File tree visible in Files tab
- [ ] Grouped by directory structure
- [ ] Clicking scrolls to file
- [ ] Can mark files as viewed
- [ ] Viewed state persists

---

## 3. Keyboard-First / Speed

Power users live on the keyboard.

### TASK-KB-001: Command Palette (Cmd+K)

**Priority:** P0  
**Effort:** High  
**Files:** New global component

**Description:**  
Linear/Raycast-style command palette for everything.

**Requirements:**
- `Cmd+K` opens palette from anywhere
- Search across: repos, files, PRs, issues, commands
- Recent items at top
- Keyboard navigation (arrows, enter)
- Commands: create PR, create issue, switch repo, settings
- Fuzzy matching

**Reference:** Look at `cmdk` library or similar

**Acceptance Criteria:**
- [ ] Cmd+K opens palette globally
- [ ] Can search repos, PRs, issues
- [ ] Can execute commands
- [ ] Arrow keys navigate
- [ ] Enter selects
- [ ] Esc closes

---

### TASK-KB-002: Keyboard Shortcuts Throughout

**Priority:** P1  
**Effort:** Medium  
**Files:** Multiple pages

**Description:**  
Add keyboard shortcuts to all major actions.

**Shortcuts to implement:**
| Key | Action | Page |
|-----|--------|------|
| `g h` | Go home | Global |
| `g p` | Go to PRs | Repo |
| `g i` | Go to issues | Repo |
| `g c` | Go to code | Repo |
| `c` | Create (context-aware) | Global |
| `n` | Next item | Lists |
| `p` | Previous item | Lists |
| `o` | Open selected | Lists |
| `/` | Focus search | Global |
| `?` | Show shortcuts help | Global |

**Requirements:**
- No conflicts with browser shortcuts
- Show shortcut hints in UI (tooltips, menu items)
- Shortcuts help modal (`?`)
- Disable in input fields

**Acceptance Criteria:**
- [ ] All shortcuts working
- [ ] Shortcuts shown in UI hints
- [ ] `?` shows help modal
- [ ] No conflicts with typing

---

### TASK-KB-003: Instant Search (No Loading)

**Priority:** P1  
**Effort:** Medium  
**Files:** Search component, API optimization

**Description:**  
Search should feel instant. No spinners, no waiting.

**Requirements:**
- Debounce input (150ms)
- Show cached results immediately
- Background refresh for fresh data
- Optimistic UI for search results
- Consider client-side search for small datasets

**Acceptance Criteria:**
- [ ] Search feels instant (<100ms perceived)
- [ ] Results appear while typing
- [ ] No jarring loading states

---

### TASK-KB-004: Quick Switcher for Branches

**Priority:** P2  
**Effort:** Low  
**Files:** Branch selector component

**Description:**  
Fast branch switching without dropdown navigation.

**Requirements:**
- `b` key opens branch quick switcher
- Fuzzy search branches
- Show recent branches first
- Enter to switch
- Create branch option at bottom

**Acceptance Criteria:**
- [ ] `b` opens switcher
- [ ] Fuzzy search works
- [ ] Recent branches prioritized
- [ ] Enter switches branch

---

## 4. Table Stakes (API → UI)

These features exist in the API but not the UI. Must-have for parity.

### TASK-PARITY-001: Releases Management UI

**Priority:** P1  
**Effort:** Medium  
**Files:** New pages and components

**Description:**  
Full releases UI matching API capabilities.

**Pages needed:**
- `/owner/repo/releases` - List releases
- `/owner/repo/releases/new` - Create release
- `/owner/repo/releases/tag/v1.0.0` - Release detail

**Features:**
- Create release from tag
- Draft releases
- Pre-release flag
- Release notes (markdown)
- Asset uploads (files)
- Auto-generate notes from commits
- Edit/delete releases

**API Available:** `src/api/trpc/routers/releases.ts` - full CRUD

**Acceptance Criteria:**
- [ ] Can list all releases
- [ ] Can create release with notes
- [ ] Can upload assets
- [ ] Can mark as draft/prerelease
- [ ] Can edit and delete

---

### TASK-PARITY-002: Branch Protection Rules UI

**Priority:** P1  
**Effort:** Medium  
**Files:** New settings page

**Description:**  
UI for managing branch protection rules.

**Location:** Repository Settings > Branches

**Features:**
- List existing rules
- Create rule with pattern (e.g., `main`, `release/*`)
- Toggle: Require PR
- Number input: Required reviewers
- Toggle: Require status checks
- Multi-select: Which status checks
- Toggle: Block force push
- Toggle: Block deletion
- Delete rule

**API Available:** `src/api/trpc/routers/branch-protection.ts`

**Acceptance Criteria:**
- [ ] Can view existing rules
- [ ] Can create new rule
- [ ] All options configurable
- [ ] Can delete rules
- [ ] Rules enforce on push/merge

---

### TASK-PARITY-003: Webhooks Management UI

**Priority:** P2  
**Effort:** Medium  
**Files:** New settings page

**Description:**  
UI for managing repository webhooks.

**Location:** Repository Settings > Webhooks

**Features:**
- List webhooks with status
- Create webhook: URL, secret, events
- Event checkboxes: push, PR, issue, etc.
- Test webhook (ping)
- View recent deliveries
- Redeliver failed webhooks
- Enable/disable toggle
- Delete webhook

**API Available:** `src/api/trpc/routers/webhooks.ts`

**Acceptance Criteria:**
- [ ] Can create webhook
- [ ] Can select events
- [ ] Can test webhook
- [ ] Can view delivery history
- [ ] Can delete webhook

---

### TASK-PARITY-004: Collaborators Management UI

**Priority:** P1  
**Effort:** Low  
**Files:** Repository settings page

**Description:**  
UI for managing repository collaborators.

**Location:** Repository Settings > Collaborators

**Features:**
- List current collaborators with roles
- Invite by username
- Permission dropdown: Read, Write, Admin
- Remove collaborator
- Pending invitations list

**API Available:** `repos.addCollaborator`, `repos.removeCollaborator`

**Acceptance Criteria:**
- [ ] Can view collaborators
- [ ] Can invite by username
- [ ] Can set permission level
- [ ] Can remove collaborator

---

### TASK-PARITY-005: Milestones UI

**Priority:** P2  
**Effort:** Low  
**Files:** Issues section, new page

**Description:**  
UI for managing milestones.

**Features:**
- List milestones with progress bars
- Create: title, description, due date
- View issues/PRs in milestone
- Edit and close milestones
- Assign issues to milestone (in issue form)

**API Available:** `src/api/trpc/routers/milestones.ts`

**Acceptance Criteria:**
- [ ] Can list milestones
- [ ] Can create with due date
- [ ] Progress bar shows completion
- [ ] Can assign issues to milestone

---

### TASK-PARITY-006: Organization Management UI

**Priority:** P2  
**Effort:** High  
**Files:** New section of app

**Description:**  
Full organization management.

**Pages:**
- `/orgs` - List user's orgs
- `/org/orgname` - Org profile
- `/org/orgname/settings` - Org settings
- `/org/orgname/teams` - Team management
- `/org/orgname/members` - Member management

**Features:**
- Create organization
- Org profile (avatar, description)
- Invite members
- Create teams
- Assign repos to teams
- Role management (member, admin, owner)

**API Available:** `organizations.ts` router

**Acceptance Criteria:**
- [ ] Can create org
- [ ] Can manage members
- [ ] Can create teams
- [ ] Can transfer repos to org

---

### TASK-PARITY-007: User Settings - SSH Keys & Tokens

**Priority:** P1  
**Effort:** Low  
**Files:** User settings page

**Description:**  
UI for managing SSH keys and personal access tokens.

**Location:** User Settings > SSH Keys, User Settings > Tokens

**SSH Keys:**
- List keys with fingerprints
- Add new key (paste public key)
- Name/label for key
- Delete key

**Tokens:**
- List tokens (masked)
- Create token with scopes
- Expiration date option
- Copy token on creation (only time shown)
- Revoke token

**API Available:** `ssh-keys.ts`, `tokens.ts` routers

**Acceptance Criteria:**
- [ ] Can add SSH key
- [ ] Can create token with scopes
- [ ] Token shown once on creation
- [ ] Can delete/revoke

---

## 5. Polish & Delight

The details that make people fall in love.

### TASK-POLISH-001: Loading States & Skeletons

**Priority:** P1  
**Effort:** Low  
**Files:** All pages

**Description:**  
Replace spinners with skeleton loading states.

**Requirements:**
- Skeleton components for: file list, PR list, issue list, diff
- Maintain layout during load (no jumping)
- Shimmer animation
- Fast transitions (no flash of loading)

**Acceptance Criteria:**
- [ ] All lists have skeletons
- [ ] No layout shift on load
- [ ] Feels fast even when loading

---

### TASK-POLISH-002: Empty States

**Priority:** P2  
**Effort:** Low  
**Files:** All list pages

**Description:**  
Helpful empty states when there's no data.

**Empty states needed:**
- No repositories: "Create your first repository"
- No PRs: "No pull requests yet"
- No issues: "No issues - that's a good thing!"
- No results: "No matches found"

**Requirements:**
- Illustration or icon
- Helpful message
- Action button where appropriate

**Acceptance Criteria:**
- [ ] All empty states implemented
- [ ] Each has helpful message
- [ ] CTAs where appropriate

---

### TASK-POLISH-003: Toast Notifications

**Priority:** P1  
**Effort:** Low  
**Files:** Global component

**Description:**  
Toast notifications for actions.

**Triggers:**
- PR created/merged/closed
- Issue created/closed
- Comment added
- Settings saved
- Errors

**Requirements:**
- Use existing toast library or shadcn toast
- Position: bottom-right
- Auto-dismiss (5s)
- Can dismiss manually
- Stack multiple toasts

**Acceptance Criteria:**
- [ ] Toasts appear on actions
- [ ] Auto-dismiss works
- [ ] Can manually dismiss
- [ ] Stacking works

---

### TASK-POLISH-004: Optimistic Updates

**Priority:** P2  
**Effort:** Medium  
**Files:** All mutation points

**Description:**  
UI updates immediately, syncs in background.

**Key places:**
- Star/unstar repo
- Close/reopen issue
- Add comment
- Mark notification read
- Toggle PR draft

**Requirements:**
- Update UI immediately
- Rollback if server fails
- Show subtle sync indicator

**Acceptance Criteria:**
- [ ] Actions feel instant
- [ ] Errors rollback gracefully
- [ ] No stale data

---

### TASK-POLISH-005: Responsive Design Audit

**Priority:** P2  
**Effort:** Medium  
**Files:** All pages

**Description:**  
Ensure app works on tablet and mobile.

**Breakpoints:**
- Desktop: 1024px+
- Tablet: 768px-1023px
- Mobile: <768px

**Requirements:**
- Collapsible sidebar on mobile
- Readable diffs on tablet
- Touch-friendly buttons
- No horizontal scroll

**Acceptance Criteria:**
- [ ] Usable on iPad
- [ ] Functional on phone
- [ ] No broken layouts

---

## Task Priority Matrix

| Priority | Task ID | Description |
|----------|---------|-------------|
| **P0** | TASK-AI-001 | AI PR description generation |
| **P0** | TASK-AI-002 | Explain this diff |
| **P0** | TASK-AI-004 | Semantic search results page |
| **P0** | TASK-REVIEW-001 | Inline comments on diffs |
| **P0** | TASK-KB-001 | Command palette (Cmd+K) |
| **P1** | TASK-AI-003 | AI conflict resolution |
| **P1** | TASK-AI-005 | AI chat in repo |
| **P1** | TASK-REVIEW-002 | Code suggestions |
| **P1** | TASK-REVIEW-003 | Side-by-side diff |
| **P1** | TASK-REVIEW-004 | Review summary & batch |
| **P1** | TASK-KB-002 | Keyboard shortcuts |
| **P1** | TASK-KB-003 | Instant search |
| **P1** | TASK-PARITY-001 | Releases UI |
| **P1** | TASK-PARITY-002 | Branch protection UI |
| **P1** | TASK-PARITY-004 | Collaborators UI |
| **P1** | TASK-PARITY-007 | SSH keys & tokens UI |
| **P1** | TASK-POLISH-001 | Loading skeletons |
| **P1** | TASK-POLISH-003 | Toast notifications |
| **P2** | TASK-REVIEW-005 | File tree in diff |
| **P2** | TASK-KB-004 | Quick branch switcher |
| **P2** | TASK-PARITY-003 | Webhooks UI |
| **P2** | TASK-PARITY-005 | Milestones UI |
| **P2** | TASK-PARITY-006 | Organizations UI |
| **P2** | TASK-POLISH-002 | Empty states |
| **P2** | TASK-POLISH-004 | Optimistic updates |
| **P2** | TASK-POLISH-005 | Responsive audit |

---

## Execution Guidelines

1. **Check prerequisites:** Some tasks depend on others (noted in each file)
2. **Read the API:** Most features have backend support - check the tRPC routers
3. **Match existing patterns:** Look at how similar features are built
4. **Test locally:** `npm run dev` in `apps/web`, server must be running
5. **Small PRs:** One task = one PR

## Tech Stack Reference

- **Framework:** React 19 + Vite
- **Routing:** React Router v7
- **Styling:** TailwindCSS + shadcn/ui
- **API:** tRPC + TanStack Query
- **Icons:** Lucide React
- **Syntax Highlighting:** Shiki

## Getting Started

```bash
# Install dependencies
npm install

# Start the database
npm run db:up

# Run migrations  
npm run db:migrate

# Start the server (in one terminal)
npm run dev

# Start the web app (in another terminal)
cd apps/web && npm run dev
```

---

*This is a living document. Mark tasks as completed in the individual files.*

— wit
