# Code Review Experience

**Category:** Core Workflow  
**Priority:** High  
**Owner:** Agent Team

---

## Strategic Context

Code review is where developers spend hours every day. GitHub's review experience hasn't meaningfully evolved in years. It's functional but not delightful.

We can do better:
- Inline comments that don't suck
- Suggestions you can apply with one click
- AI that already read the PR before you did
- Keyboard-driven workflow

If we nail code review, developers will *want* to use wit.

---

## Tech Stack Context

```
apps/web/src/
├── components/
│   ├── diff/
│   │   └── DiffViewer.tsx    # Current diff implementation
│   └── pr/
│       ├── PRDetail.tsx      # PR detail page
│       ├── PRTimeline.tsx    # Activity timeline
│       └── PRForm.tsx        # Create/edit PR
├── pages/
│   └── pr/
│       └── [id].tsx          # PR detail route

src/api/trpc/routers/
└── pulls.ts                   # PR endpoints
```

**Current diff implementation:**
- Parses unified diff format
- Shows hunks with line numbers
- Collapsible file sections
- No inline commenting yet

---

## Tasks

### TASK-REVIEW-001: Inline Comments on Diff Lines

**Priority:** P0  
**Effort:** High (8-12 hours)  
**Dependencies:** None

#### Current State

The diff viewer shows changes but you can't comment on specific lines. The API already supports line comments (`path`, `line`, `side` fields exist in `prComments` schema).

#### Requirements

1. Hover on any line number shows a "+" button
2. Clicking opens inline comment form below that line
3. Support single-line comments
4. Support multi-line selection (shift+click to select range)
5. Comments appear inline in the diff
6. Reply to existing comments (threading)
7. Resolve/unresolve threads
8. Edit and delete own comments

#### Database Schema Update

```typescript
// Add to src/db/schema.ts - prComments table
isResolved: boolean('is_resolved').default(false),
resolvedAt: timestamp('resolved_at'),
resolvedBy: integer('resolved_by').references(() => users.id),
```

#### Files to Modify

- `apps/web/src/components/diff/DiffViewer.tsx` - Add comment triggers
- `apps/web/src/components/diff/DiffLine.tsx` - New: single line component
- `apps/web/src/components/diff/InlineComment.tsx` - New: comment display
- `apps/web/src/components/diff/CommentForm.tsx` - New: comment input
- `apps/web/src/components/diff/CommentThread.tsx` - New: thread display
- `src/api/trpc/routers/pulls.ts` - Add resolve/unresolve endpoints
- `src/db/schema.ts` - Add isResolved field

#### UI Design

```
┌─────────────────────────────────────────────────────────────┐
│  @@ -45,6 +45,12 @@ export function authenticate() {        │
├─────────────────────────────────────────────────────────────┤
│     45 │     45 │   const token = getToken();              │
│  +  46 │        │   [+]                                    │ ← hover shows +
│     47 │     46 │   if (!token) {                          │
│        │  +  47 │     validateToken(token);                │
│        │  +  48 │     logAccess(token);                    │
├─────────────────────────────────────────────────────────────┤
│ 💬 Comment on line 47-48                           [@jane]  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Should we add error handling here in case validateToken │ │
│ │ throws?                                                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│   ↳ @john: Good catch, will fix                            │
│   ↳ [Reply...                                    ] [Send]   │
│                                         [✓ Resolve thread]  │
├─────────────────────────────────────────────────────────────┤
│     49 │     49 │   return user;                           │
└─────────────────────────────────────────────────────────────┘
```

#### API Updates

```typescript
// Add to pulls.ts router

resolveComment: protectedProcedure
  .input(z.object({ commentId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    // Mark comment thread as resolved
  }),

unresolveComment: protectedProcedure
  .input(z.object({ commentId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    // Mark comment thread as unresolved
  }),
```

#### Acceptance Criteria

- [ ] "+" button appears on line hover
- [ ] Clicking opens inline comment form
- [ ] Comment appears inline after submission
- [ ] Can reply to create thread
- [ ] Can resolve/unresolve threads
- [ ] Can edit own comments
- [ ] Can delete own comments
- [ ] Comments persist and load correctly
- [ ] Multi-line selection works

---

### TASK-REVIEW-002: Code Suggestions in Comments

**Priority:** P1  
**Effort:** Medium (6-8 hours)  
**Dependencies:** TASK-REVIEW-001

#### Current State

Once inline comments exist, we can add code suggestions - a special type of comment that proposes specific code changes.

#### Requirements

1. In comment form, add "Suggest change" toggle/button
2. When active, show code editor pre-filled with selected line(s)
3. User edits code to show their suggestion
4. Renders as special "suggestion" block with diff
5. PR author sees "Apply suggestion" button
6. Applying creates a commit with that exact change
7. Batch apply multiple suggestions at once

#### Files to Create/Modify

- `apps/web/src/components/diff/CommentForm.tsx` - Add suggestion mode
- `apps/web/src/components/diff/SuggestionBlock.tsx` - New: render suggestion
- `apps/web/src/components/diff/SuggestionEditor.tsx` - New: code editor
- `src/api/trpc/routers/pulls.ts` - Add applySuggestion endpoint

#### Schema Update

```typescript
// In prComments, the body can contain suggestion markdown
// Format: ```suggestion
//         new code here
//         ```

// Or add dedicated field:
suggestion: text('suggestion'), // The suggested code change
suggestionApplied: boolean('suggestion_applied').default(false),
suggestionCommitSha: varchar('suggestion_commit_sha', { length: 64 }),
```

#### UI Design

```
┌─────────────────────────────────────────────────────────────┐
│ Add comment                                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [Normal] [📝 Suggest change]                            │ │
│ │                                                         │ │
│ │ Consider using optional chaining:                       │ │
│ │                                                         │ │
│ │ ```suggestion                                           │ │
│ │ const name = user?.profile?.name ?? 'Anonymous';        │ │
│ │ ```                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                         [Cancel] [Comment]  │
└─────────────────────────────────────────────────────────────┘

Rendered suggestion:
┌─────────────────────────────────────────────────────────────┐
│ 💡 Suggested change                                @jane    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ - const name = user.profile.name || 'Anonymous';        │ │
│ │ + const name = user?.profile?.name ?? 'Anonymous';      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Consider using optional chaining                            │
│                                                             │
│ (for PR author):               [Apply suggestion] [Dismiss] │
└─────────────────────────────────────────────────────────────┘
```

#### API Needed

```typescript
// Add to pulls.ts
applySuggestion: protectedProcedure
  .input(z.object({
    pullRequestId: z.number(),
    commentId: z.number(),
  }))
  .mutation(async ({ input, ctx }) => {
    // 1. Get the suggestion from comment
    // 2. Get the file content from source branch
    // 3. Apply the change at the specified line
    // 4. Create a commit with message "Apply suggestion from @user"
    // 5. Mark suggestion as applied
    // 6. Return new commit SHA
  }),

applyAllSuggestions: protectedProcedure
  .input(z.object({ pullRequestId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    // Apply all pending suggestions in one commit
  }),
```

#### Acceptance Criteria

- [ ] Can toggle "Suggest change" mode in comment form
- [ ] Code editor pre-fills with current line content
- [ ] Suggestion renders as diff block
- [ ] PR author sees "Apply" button
- [ ] Clicking apply creates commit
- [ ] Commit message references the suggestion
- [ ] Batch apply works for multiple suggestions
- [ ] Applied suggestions show "Applied in abc123" state

---

### TASK-REVIEW-003: Side-by-Side Diff View

**Priority:** P1  
**Effort:** Medium (4-6 hours)  
**Dependencies:** TASK-REVIEW-001

#### Current State

Only unified diff view exists. Many developers prefer side-by-side (split) view.

#### Requirements

1. Toggle button in diff header: "Unified | Split"
2. Split view shows old content left, new content right
3. Line numbers on both sides
4. Synchronized scrolling
5. Inline comments work in both views
6. Remember preference in localStorage
7. Per-file toggle (some files unified, others split)

#### Files to Modify

- `apps/web/src/components/diff/DiffViewer.tsx` - Add toggle, implement split
- `apps/web/src/components/diff/UnifiedDiff.tsx` - Extract current logic
- `apps/web/src/components/diff/SplitDiff.tsx` - New: side-by-side view

#### UI Design

**Toggle:**
```
┌─────────────────────────────────────────────────────────────┐
│ Files changed (12)                    [Unified ▾] [Split]   │
└─────────────────────────────────────────────────────────────┘
```

**Split View:**
```
┌─────────────────────────────────────────────────────────────┐
│ 📄 src/auth.ts                                    [✨] [▼]  │
├────────────────────────────┬────────────────────────────────┤
│         OLD                │           NEW                  │
├────────────────────────────┼────────────────────────────────┤
│  45 │ const token = get(); │  45 │ const token = get();     │
│  46 │ if (!token) {        │  46 │ if (!token) {            │
│  47 │   return null;       │  47 │   throw new Error();     │  ← changed
│     │                      │  48 │   logError();            │  ← added
│  48 │ }                    │  49 │ }                        │
└────────────────────────────┴────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Toggle visible in diff header
- [ ] Split view renders correctly
- [ ] Line numbers on both sides
- [ ] Synchronized scrolling works
- [ ] Comments work in split view
- [ ] Preference saved to localStorage
- [ ] Can toggle per-file

---

### TASK-REVIEW-004: Review Summary & Batch Actions

**Priority:** P1  
**Effort:** Medium (6-8 hours)  
**Dependencies:** TASK-REVIEW-001

#### Current State

Can submit reviews with states (approve/request changes) but no "pending review" workflow. Comments are submitted immediately, not batched.

#### Requirements

1. "Start review" button enters review mode
2. In review mode, comments are pending (not submitted yet)
3. Floating review summary panel shows pending comments count
4. Can navigate between pending comments
5. Submit review with: Approve / Request Changes / Comment only
6. Overall review summary textarea
7. All pending comments submitted atomically with review

#### Files to Create/Modify

- `apps/web/src/components/pr/ReviewContext.tsx` - New: React context for review state
- `apps/web/src/components/pr/ReviewPanel.tsx` - New: floating summary panel
- `apps/web/src/components/pr/SubmitReview.tsx` - New: submit dialog
- `apps/web/src/components/diff/CommentForm.tsx` - Integrate with review mode
- `src/api/trpc/routers/pulls.ts` - Update to handle batch submission

#### UI Design

**Review Mode Banner:**
```
┌─────────────────────────────────────────────────────────────┐
│ ✏️ You're reviewing this PR    3 pending comments           │
│                               [View comments] [Finish review]│
└─────────────────────────────────────────────────────────────┘
```

**Submit Review Dialog:**
```
┌─────────────────────────────────────────────────────────────┐
│ Submit Review                                          [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Review summary (optional):                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Good changes overall. A few minor suggestions.          │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ○ Comment                                                   │
│   Submit general feedback without approval                  │
│                                                             │
│ ○ Approve ✓                                                 │
│   Submit feedback and approve these changes                 │
│                                                             │
│ ○ Request changes ✗                                         │
│   Submit feedback that must be addressed                    │
│                                                             │
│ 3 pending comments will be submitted                        │
│                                                             │
│                                  [Cancel] [Submit review]   │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] "Start review" enters review mode
- [ ] Comments in review mode are pending
- [ ] Review summary panel shows pending count
- [ ] Can finish review with approval state
- [ ] All comments submitted with review
- [ ] Review appears in timeline
- [ ] Can cancel review (discards pending comments)

---

### TASK-REVIEW-005: File Tree in Diff View

**Priority:** P2  
**Effort:** Low (3-4 hours)  
**Dependencies:** None

#### Current State

PR Files tab shows flat list of files. Large PRs are hard to navigate.

#### Requirements

1. Collapsible left sidebar with file tree
2. Files grouped by directory
3. Show +/- line counts per file
4. Color coding: green (added), red (deleted), yellow (modified)
5. Click to scroll to file in main view
6. "Viewed" checkmark per file
7. Collapse/expand directories
8. Hide sidebar toggle

#### Files to Create/Modify

- `apps/web/src/components/diff/FileTree.tsx` - New: tree component
- `apps/web/src/components/pr/FilesChanged.tsx` - Add sidebar layout

#### UI Design

```
┌─────────┬───────────────────────────────────────────────────┐
│ Files   │ Files changed (45)                   [▣] [Tree ▾] │
│         ├───────────────────────────────────────────────────┤
│ ▼ src/  │                                                   │
│   ▼ api/│ 📄 src/api/auth.ts  +23 -5                        │
│     ☑ au│ ┌─────────────────────────────────────────────────┐
│     ☐ us│ │ @@ -1,5 +1,23 @@                               │
│   ▼ comp│ │ ...                                            │
│     ☐ Bu│ └─────────────────────────────────────────────────┘
│     ☑ He│                                                   │
│   ☐ inde│ 📄 src/api/users.ts  +5 -2                        │
│ ▼ tests/│ ...                                               │
│   ☐ auth│                                                   │
│         │                                                   │
│─────────│                                                   │
│ 5/45    │                                                   │
│ viewed  │                                                   │
└─────────┴───────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] File tree in collapsible sidebar
- [ ] Grouped by directory structure
- [ ] Shows +/- counts per file
- [ ] Click scrolls to file
- [ ] Can mark files as "viewed"
- [ ] Viewed count shown
- [ ] Directories collapsible
- [ ] Sidebar can be hidden

---

## Agent Prompt

```
You are implementing code review features for wit, a GitHub alternative.

Context:
- The diff viewer is in apps/web/src/components/diff/DiffViewer.tsx
- PR API routes are in src/api/trpc/routers/pulls.ts
- The database schema for PR comments already has path, line, side fields
- Use shadcn/ui components and Tailwind for styling
- Follow the existing dark theme (Linear-inspired)

Your task: [TASK-ID]

Requirements:
[Copy requirements from above]

Implementation order:
1. Schema updates (if any) - add to src/db/schema.ts
2. API endpoints - add to pulls.ts router
3. React components - create/modify in apps/web/src/components/
4. Integration - wire up components to API

Key patterns:
- Use tRPC's useMutation for actions
- Use TanStack Query's invalidation after mutations
- Handle optimistic updates where appropriate
- Show loading states during API calls

The code review experience should feel fast and intuitive. Every interaction should have immediate feedback.
```

---

## Dependencies

```
TASK-REVIEW-001 ─────────────────────────► (none)
TASK-REVIEW-002 ─────────────────────────► TASK-REVIEW-001
TASK-REVIEW-003 ─────────────────────────► TASK-REVIEW-001
TASK-REVIEW-004 ─────────────────────────► TASK-REVIEW-001
TASK-REVIEW-005 ─────────────────────────► (none)
```

---

## Success Metrics

- Review workflow is faster than GitHub
- Inline comments feel instant
- Code suggestions reduce review round-trips
- Developers use keyboard shortcuts for common actions
- "Viewed" files tracking helps with large PRs
