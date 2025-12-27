# AI-First Features

**Category:** Core Differentiator  
**Priority:** Highest  
**Owner:** Agent Team

---

## Strategic Context

This is how we win. GitHub will never ship these features because Microsoft is afraid of AI making mistakes on their platform. We're not.

AI in wit isn't a feature - it's the foundation. Every interaction should feel like you have a senior engineer looking over your shoulder who has read the entire codebase.

These tasks make the web app feel *intelligent*.

---

## Tech Stack Context

```
apps/web/
├── src/
│   ├── components/     # React components
│   ├── pages/          # Route pages
│   ├── lib/
│   │   └── trpc.ts     # tRPC client setup
│   └── App.tsx         # Router setup

src/
├── ai/
│   ├── tools/          # 15 AI tools already built
│   ├── agent.ts        # Mastra agent config
│   └── mastra.ts       # AI provider setup
├── api/trpc/routers/   # Backend endpoints
└── search/             # Semantic search engine
```

**Key patterns:**
- tRPC for type-safe API calls
- TanStack Query for data fetching (via tRPC)
- shadcn/ui components (Radix primitives)
- Tailwind for styling

---

## Tasks

### TASK-AI-001: AI Commit Message Suggestions in PR Creation

**Priority:** P0  
**Effort:** Medium (4-6 hours)  
**Dependencies:** None

#### Current State

The PR creation form (`apps/web/src/components/pr/PRForm.tsx`) has title and description fields but no AI assistance. The backend already has `generatePrDescription` AI tool.

#### Requirements

1. Add "Generate with AI" button next to title field
2. Add "Generate with AI" button next to description field  
3. On click, analyze the diff between base and compare branches
4. Generate contextual title and description
5. Show loading state during generation
6. Populate fields with generated content (user can edit)
7. Keyboard shortcut: `Cmd+Shift+G` to generate both

#### Files to Modify

- `apps/web/src/components/pr/PRForm.tsx` - Add AI buttons
- `src/api/trpc/routers/pulls.ts` - May need new endpoint

#### API Reference

```typescript
// Existing AI tool: src/ai/tools/generate-pr-description.ts
// You may need to expose this via tRPC

// The PR form already fetches commits between branches
// Use that diff data for context
```

#### Acceptance Criteria

- [ ] "Generate" button visible next to title and description
- [ ] Button shows loading spinner while generating
- [ ] Generated content appears in fields
- [ ] Content is editable after generation
- [ ] Works for PRs with 1-100 changed files
- [ ] Graceful error handling if AI fails

---

### TASK-AI-002: "Explain This Diff" Inline Button

**Priority:** P0  
**Effort:** Medium (4-6 hours)  
**Dependencies:** None

#### Current State

The diff viewer (`apps/web/src/components/diff/DiffViewer.tsx`) shows file diffs with expand/collapse but no AI explanation capability.

#### Requirements

1. Add sparkle/wand icon button in each file's header row
2. On click, expand a panel below the file header
3. Call AI to explain what changed in this file and why
4. Render explanation as markdown
5. Cache explanations (don't regenerate on re-render)
6. Collapse/expand the explanation panel

#### Files to Modify

- `apps/web/src/components/diff/DiffViewer.tsx` - Add button and panel
- `src/api/trpc/routers/pulls.ts` - Add `explainFileDiff` endpoint

#### New Endpoint Needed

```typescript
// src/api/trpc/routers/pulls.ts
explainFileDiff: protectedProcedure
  .input(z.object({
    pullRequestId: z.number(),
    filePath: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    // Get the diff for this file
    // Call AI to explain it
    // Return explanation text
  })
```

#### UI Design

```
┌─────────────────────────────────────────────────┐
│ 📄 src/components/Auth.tsx  +45 -12    [✨] [▼] │
├─────────────────────────────────────────────────┤
│ 💡 AI Explanation                               │
│                                                 │
│ This change adds OAuth support to the auth      │
│ component. Key changes:                         │
│ - New `useOAuth` hook integration               │
│ - Added Google and GitHub provider buttons      │
│ - Refactored token storage to use httpOnly...   │
│                                                 │
│                                        [Collapse]│
├─────────────────────────────────────────────────┤
│  @@ -45,12 +45,57 @@                            │
│    const [user, setUser] = useState(null);      │
│  + const { signIn } = useOAuth();               │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Sparkle button visible on each file header
- [ ] Clicking shows explanation panel
- [ ] Explanation renders as markdown
- [ ] Loading state while generating
- [ ] Can collapse/expand explanation
- [ ] Cached (clicking again doesn't regenerate)

---

### TASK-AI-003: AI-Assisted Conflict Resolution UI

**Priority:** P1  
**Effort:** High (8-12 hours)  
**Dependencies:** None

#### Current State

When PRs have merge conflicts, `checkMergeability` returns conflict info but the UI just shows "has conflicts" without helping resolve them.

#### Requirements

1. When PR has conflicts, show "Resolve Conflicts" button
2. Open conflict resolution modal/page
3. For each conflicting file, show three-way view:
   - Base (common ancestor)
   - Ours (target branch)
   - Theirs (source branch)
4. AI suggests resolution for each conflict
5. User can: Accept AI / Pick Ours / Pick Theirs / Edit manually
6. "Apply All AI Suggestions" bulk action
7. Save resolved files and mark conflicts resolved

#### Files to Create/Modify

- `apps/web/src/components/pr/ConflictResolver.tsx` - New component
- `apps/web/src/components/pr/ConflictFile.tsx` - Single file conflicts
- `apps/web/src/pages/pr/[id]/conflicts.tsx` - New page (optional)
- `src/api/trpc/routers/pulls.ts` - Add resolution endpoints

#### API Reference

```typescript
// Existing: src/ai/tools/resolve-conflict.ts
// Has AI conflict resolution logic

// Need endpoints:
// - pulls.getConflicts - Get conflict details
// - pulls.resolveConflict - Apply resolution
```

#### UI Design

```
┌──────────────────────────────────────────────────────────┐
│ Resolve Merge Conflicts                    [Apply All AI] │
├──────────────────────────────────────────────────────────┤
│ 📄 src/config.ts                                         │
│ ┌─────────────────┬─────────────────┬─────────────────┐  │
│ │     BASE        │      OURS       │     THEIRS      │  │
│ ├─────────────────┼─────────────────┼─────────────────┤  │
│ │ port: 3000      │ port: 3000      │ port: 8080      │  │
│ │                 │ host: local     │                 │  │
│ └─────────────────┴─────────────────┴─────────────────┘  │
│                                                          │
│ 💡 AI Suggestion:                                        │
│ ┌────────────────────────────────────────────────────┐   │
│ │ port: 8080  // Updated port from theirs            │   │
│ │ host: local // Keep host from ours                 │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ [Accept AI] [Use Ours] [Use Theirs] [Edit Manually]      │
├──────────────────────────────────────────────────────────┤
│ 📄 src/api/routes.ts                                     │
│ ...                                                      │
└──────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Conflict resolver accessible from PR with conflicts
- [ ] Three-way diff view for each file
- [ ] AI suggestion shown for each conflict
- [ ] Can accept/reject individual suggestions
- [ ] Can bulk apply all AI suggestions
- [ ] Resolving enables merge button

---

### TASK-AI-004: Semantic Code Search Results Page

**Priority:** P0  
**Effort:** Medium (4-6 hours)  
**Dependencies:** None

#### Current State

Header has search input but no results page. The semantic search engine exists (`src/search/`) but isn't exposed in the web UI.

#### Requirements

1. Create `/search` route
2. Search input with tabs: Code, Repositories, Issues, PRs
3. Code tab uses semantic search (AI embeddings)
4. Other tabs use standard text search
5. Results show: file path, line numbers, code snippet with highlighting
6. Click result → navigate to file viewer at that line
7. Search within specific repo or across all accessible repos

#### Files to Create/Modify

- `apps/web/src/pages/Search.tsx` - New page
- `apps/web/src/components/search/SearchResults.tsx` - Results component
- `apps/web/src/components/search/CodeResult.tsx` - Code snippet display
- `src/api/trpc/routers/search.ts` - May need new router

#### API Reference

```typescript
// Existing: src/search/semantic.ts
// SemanticSearch class with search() method

// May need tRPC endpoint:
search: protectedProcedure
  .input(z.object({
    query: z.string(),
    type: z.enum(['code', 'repos', 'issues', 'prs']),
    repoId: z.number().optional(),
  }))
  .query(async ({ input }) => { ... })
```

#### UI Design

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 [where is authentication handled          ] [Search] │
├─────────────────────────────────────────────────────────┤
│ [Code] [Repositories] [Issues] [Pull Requests]          │
├─────────────────────────────────────────────────────────┤
│ 3 results for "where is authentication handled"         │
│                                                         │
│ 📄 src/core/auth.ts:45-67                    94% match  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 45 │ export class AuthManager {                     │ │
│ │ 46 │   async authenticate(token: string) {         │ │
│ │ 47 │     // Validate JWT and extract user...       │ │
│ │ ...│                                               │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ 📄 src/middleware/auth.ts:12-34              87% match  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ...                                                 │ │
└─────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] `/search?q=query` route works
- [ ] Tabs for different search types
- [ ] Code search returns semantically relevant results
- [ ] Results show file path and code preview
- [ ] Match percentage/relevance shown
- [ ] Clicking result opens file at correct line
- [ ] Syntax highlighting in snippets

---

### TASK-AI-005: AI Chat in Repository Context

**Priority:** P1  
**Effort:** High (8-12 hours)  
**Dependencies:** TASK-AI-004 (uses same search infrastructure)

#### Current State

No chat interface. The AI agent exists (`src/ai/agent.ts`) with tools but isn't accessible from the web UI.

#### Requirements

1. Add "Ask AI" button in repository header
2. Opens slide-over panel from right (or dedicated tab)
3. Chat interface with message history
4. AI has full repository context (can search code, see structure)
5. Responses can reference files (rendered as clickable links)
6. Conversation history persisted per repo per user
7. Suggested questions on empty state

#### Files to Create/Modify

- `apps/web/src/components/ai/ChatPanel.tsx` - Chat UI
- `apps/web/src/components/ai/ChatMessage.tsx` - Message component
- `apps/web/src/components/ai/ChatInput.tsx` - Input with send
- `src/api/trpc/routers/ai.ts` - New router for AI chat
- `src/db/schema.ts` - Add chat history table (optional)

#### API Needed

```typescript
// New router: src/api/trpc/routers/ai.ts
export const aiRouter = router({
  chat: protectedProcedure
    .input(z.object({
      repoId: z.number(),
      message: z.string(),
      conversationId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Run AI agent with repo context
      // Return response with file references
    }),
    
  getConversation: protectedProcedure
    .input(z.object({ repoId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Return chat history
    }),
});
```

#### UI Design

```
┌──────────────────────────────────────────────────────────┐
│ repo-name                              [Ask AI ✨] [⚙️]  │
├──────────────────────────────────────────────────────────┤
│                                    ┌────────────────────┐│
│  (repo content)                    │ 🤖 Ask about code  ││
│                                    │                    ││
│                                    │ Try asking:        ││
│                                    │ • Where is auth?   ││
│                                    │ • How do tests run?││
│                                    │ • Explain index.ts ││
│                                    │                    ││
│                                    │ ─────────────────  ││
│                                    │                    ││
│                                    │ You: Where is      ││
│                                    │ authentication     ││
│                                    │ handled?           ││
│                                    │                    ││
│                                    │ AI: Auth is in     ││
│                                    │ `src/core/auth.ts` ││
│                                    │ The AuthManager    ││
│                                    │ class handles...   ││
│                                    │                    ││
│                                    │ [Type message...] 📤││
│                                    └────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] "Ask AI" button in repo header
- [ ] Chat panel opens on click
- [ ] Can send messages and receive responses
- [ ] File references are clickable
- [ ] Conversation persists (refresh doesn't lose it)
- [ ] Loading state while AI thinks
- [ ] Error handling for AI failures

---

## Agent Prompt

```
You are implementing AI-first features for wit, a GitHub alternative. 

Context:
- wit is a TypeScript monorepo with React frontend (apps/web) and Node backend (src/)
- The AI infrastructure already exists in src/ai/ - you're exposing it to the web UI
- Use tRPC for API calls, TanStack Query handles caching
- UI components use shadcn/ui (Radix) + Tailwind
- Keep the Linear-inspired dark theme aesthetic

Your task: [TASK-ID]

Requirements:
[Copy requirements from above]

Start by:
1. Reading the existing files mentioned to understand current patterns
2. Check if needed API endpoints exist
3. Create/modify backend endpoints first
4. Build the frontend components
5. Test the full flow

Code style:
- TypeScript strict mode
- Functional components with hooks
- Tailwind for styling (no CSS files)
- Handle loading and error states
- Add appropriate aria labels for accessibility

When done, the feature should feel native to the app - not bolted on.
```

---

## Dependencies

```
TASK-AI-001 ──────────────────────────► (none)
TASK-AI-002 ──────────────────────────► (none)  
TASK-AI-003 ──────────────────────────► (none)
TASK-AI-004 ──────────────────────────► (none)
TASK-AI-005 ──────────────────────────► TASK-AI-004 (shared search)
```

---

## Success Metrics

- Users can generate PR descriptions with one click
- Users can understand any diff without reading code
- Merge conflicts have suggested resolutions
- "Where is X?" questions get answered instantly
- Developers prefer wit's AI to ChatGPT for code questions
