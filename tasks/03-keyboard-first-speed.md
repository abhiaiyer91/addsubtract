# Keyboard-First & Speed

**Category:** Power User Experience  
**Priority:** High  
**Owner:** Agent Team

---

## Strategic Context

Power users live on the keyboard. They hate reaching for the mouse. They notice 100ms delays.

Linear, Raycast, and VS Code have trained developers to expect:
- Command palette for everything
- Keyboard shortcuts that work
- Instant response times

GitHub feels slow and clunky in comparison. We can be the fast, keyboard-driven alternative.

This isn't just about shortcuts - it's about *respecting the user's time*.

---

## Tech Stack Context

```
apps/web/src/
├── App.tsx              # Top-level, good place for global listeners
├── components/
│   └── layout/
│       └── Header.tsx   # Search bar lives here
├── lib/
│   └── trpc.ts          # API client
└── pages/               # All routes
```

**Useful libraries to consider:**
- `cmdk` - Command palette (Linear uses this)
- `react-hotkeys-hook` - Keyboard shortcuts
- `@tanstack/react-query` - Already using, has good caching

---

## Tasks

### TASK-KB-001: Command Palette (Cmd+K)

**Priority:** P0  
**Effort:** High (8-10 hours)  
**Dependencies:** None

#### Current State

No command palette exists. The header has a search bar but it's just for navigation, not commands.

#### Requirements

1. `Cmd+K` (Mac) / `Ctrl+K` (Windows) opens palette from anywhere
2. Search across:
   - Repositories (icon: 📁)
   - Pull Requests (icon: 🔀)
   - Issues (icon: 🎫)
   - Actions/Commands (icon: ⚡)
3. Recent items shown by default (before typing)
4. Fuzzy matching on search
5. Keyboard navigation: ↑↓ to select, Enter to execute, Esc to close
6. Categories/sections in results
7. Loading state for async searches

#### Commands to Implement

| Command | Action |
|---------|--------|
| Create repository | Navigate to /new |
| Create issue | Navigate to /{owner}/{repo}/issues/new |
| Create pull request | Navigate to /{owner}/{repo}/pulls/new |
| Go to settings | Navigate to /settings |
| Go to notifications | Navigate to /notifications |
| Toggle theme | Switch dark/light (future) |
| Sign out | Log out |

#### Files to Create

- `apps/web/src/components/command/CommandPalette.tsx` - Main component
- `apps/web/src/components/command/CommandItem.tsx` - Result item
- `apps/web/src/components/command/CommandGroup.tsx` - Category group
- `apps/web/src/hooks/useCommandPalette.ts` - State and search logic
- `apps/web/src/lib/commands.ts` - Command definitions

#### Recommended Library

```bash
npm install cmdk
```

`cmdk` provides the primitives (Dialog, Input, List, Item) with built-in:
- Keyboard navigation
- Fuzzy search
- Item selection
- Accessibility

#### UI Design

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Type a command or search...                              │
├─────────────────────────────────────────────────────────────┤
│ Recent                                                      │
│   📁 wit/platform         Repository                        │
│   🔀 feat: add auth #42   Pull Request · wit/platform       │
│                                                             │
│ Actions                                                     │
│   ⚡ Create repository                                  ⌘N  │
│   ⚡ Create issue                                       ⌘I  │
│   ⚡ Go to settings                                     ⌘,  │
├─────────────────────────────────────────────────────────────┤
│ ↑↓ Navigate   ↵ Select   esc Close                          │
└─────────────────────────────────────────────────────────────┘
```

**After typing "auth":**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 auth                                                     │
├─────────────────────────────────────────────────────────────┤
│ Repositories                                                │
│   📁 acme/auth-service         4 stars                      │
│                                                             │
│ Pull Requests                                               │
│   🔀 Add OAuth support #123    acme/webapp · Open           │
│   🔀 Fix auth token #98        acme/api · Merged            │
│                                                             │
│ Issues                                                      │
│   🎫 Auth fails on Safari #45  acme/webapp · Open           │
├─────────────────────────────────────────────────────────────┤
│ ↑↓ Navigate   ↵ Select   esc Close                          │
└─────────────────────────────────────────────────────────────┘
```

#### Implementation Steps

1. Install cmdk: `npm install cmdk`
2. Create CommandPalette component with cmdk primitives
3. Add global keyboard listener for Cmd+K
4. Implement search across repos, PRs, issues (use existing tRPC queries)
5. Add static commands (create, navigate, etc.)
6. Style with Tailwind to match theme
7. Add to App.tsx to be globally available

#### API Needed

```typescript
// May want a unified search endpoint
// Or use existing: repos.search, issues filtered, pulls filtered

// For recent items, could use localStorage or:
recents: protectedProcedure
  .query(async ({ ctx }) => {
    // Return user's recently viewed repos, PRs, issues
  })
```

#### Acceptance Criteria

- [ ] Cmd+K opens palette from any page
- [ ] Can search repositories
- [ ] Can search pull requests
- [ ] Can search issues
- [ ] Can execute commands (create, navigate)
- [ ] Recent items shown initially
- [ ] Arrow keys navigate results
- [ ] Enter selects/executes
- [ ] Esc closes
- [ ] Smooth animations (fade in/out)
- [ ] Works on both Mac and Windows

---

### TASK-KB-002: Keyboard Shortcuts Throughout

**Priority:** P1  
**Effort:** Medium (6-8 hours)  
**Dependencies:** TASK-KB-001 (for shortcut hints)

#### Current State

No keyboard shortcuts except basic browser ones. Every action requires mouse.

#### Requirements

1. Global shortcuts (work everywhere)
2. Contextual shortcuts (work on specific pages)
3. Shortcut hints visible in UI (tooltips, menu items)
4. `?` opens shortcut help modal
5. Don't conflict with browser shortcuts
6. Disabled when typing in input fields

#### Shortcut Map

**Global:**
| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `?` | Show shortcuts help |
| `/` | Focus search input |
| `g h` | Go home (dashboard) |
| `g n` | Go to notifications |
| `g s` | Go to settings |
| `n` | New/Create (context-aware) |

**Repository Page:**
| Shortcut | Action |
|----------|--------|
| `g c` | Go to code |
| `g i` | Go to issues |
| `g p` | Go to pull requests |
| `g a` | Go to actions |
| `g w` | Go to wiki |
| `g t` | Go to tags/releases |

**List Pages (Issues, PRs):**
| Shortcut | Action |
|----------|--------|
| `j` | Next item |
| `k` | Previous item |
| `o` | Open selected |
| `x` | Toggle select |
| `c` | Create new |

**PR/Issue Detail:**
| Shortcut | Action |
|----------|--------|
| `r` | Reply/Comment |
| `e` | Edit |
| `l` | Add label |
| `a` | Assign |
| `m` | Merge (PR only) |

#### Files to Create

- `apps/web/src/hooks/useKeyboardShortcuts.ts` - Main hook
- `apps/web/src/components/shortcuts/ShortcutsModal.tsx` - Help modal
- `apps/web/src/lib/shortcuts.ts` - Shortcut definitions

#### Recommended Library

```bash
npm install react-hotkeys-hook
```

#### UI for Shortcut Hints

**In tooltips:**
```
┌──────────────┐
│ Create issue │
│ c            │
└──────────────┘
```

**In menus:**
```
┌──────────────────────┐
│ New issue        c   │
│ New PR           p   │
│ New repository   ⌘N  │
└──────────────────────┘
```

**Shortcuts help modal (`?`):**
```
┌─────────────────────────────────────────────────────────────┐
│ Keyboard Shortcuts                                     [×]  │
├─────────────────────────────────────────────────────────────┤
│ Global                          │ Navigation               │
│ ────────────────────────────── │ ──────────────────────── │
│ ⌘K    Command palette           │ g h   Go home            │
│ /     Focus search              │ g n   Notifications      │
│ ?     This help                 │ g s   Settings           │
│                                 │                          │
│ Lists                           │ Pull Requests            │
│ ────────────────────────────── │ ──────────────────────── │
│ j     Next item                 │ r     Reply              │
│ k     Previous item             │ m     Merge              │
│ o     Open                      │ a     Approve            │
│ c     Create new                │ x     Request changes    │
├─────────────────────────────────────────────────────────────┤
│                                                  [Got it]   │
└─────────────────────────────────────────────────────────────┘
```

#### Implementation Steps

1. Create shortcuts definition file with all shortcuts
2. Create useKeyboardShortcuts hook using react-hotkeys-hook
3. Add global shortcuts in App.tsx
4. Add contextual shortcuts in relevant pages
5. Create ShortcutsModal component
6. Add shortcut hints to tooltips/menus
7. Add kbd styles (`.kbd` class exists in Tailwind config)

#### Acceptance Criteria

- [ ] All shortcuts in table work
- [ ] `?` shows help modal
- [ ] Shortcuts don't fire when typing in inputs
- [ ] Shortcut hints visible in tooltips
- [ ] Works on Mac and Windows (Cmd vs Ctrl)
- [ ] Sequential shortcuts work (g then h)
- [ ] No browser shortcut conflicts

---

### TASK-KB-003: Instant Search (No Loading)

**Priority:** P1  
**Effort:** Medium (4-6 hours)  
**Dependencies:** TASK-KB-001 (search infrastructure)

#### Current State

Search bar in header but results aren't instant. Users see loading spinners.

#### Requirements

1. Search feels instant (<100ms perceived latency)
2. Results appear while typing (debounced 150ms)
3. Show cached results immediately
4. Background refresh for fresh data
5. Optimistic UI - no spinners
6. Client-side filtering for already-fetched data
7. Search history/suggestions

#### Implementation Strategy

```typescript
// 1. Aggressive caching with TanStack Query
const { data: repos } = trpc.repos.search.useQuery(
  { query },
  { 
    staleTime: 60000,          // Consider fresh for 1 min
    keepPreviousData: true,    // Show old data while fetching
  }
);

// 2. Prefetch common searches
queryClient.prefetchQuery(['repos', 'search', '']);  // All repos
queryClient.prefetchQuery(['issues', 'recent']);

// 3. Client-side filtering
const filteredRepos = useMemo(() => 
  allRepos.filter(r => 
    r.name.toLowerCase().includes(query.toLowerCase())
  ), 
  [allRepos, query]
);
```

#### Files to Modify

- `apps/web/src/components/command/CommandPalette.tsx` - Optimize search
- `apps/web/src/lib/trpc.ts` - Configure caching
- `apps/web/src/hooks/useSearch.ts` - New: unified search hook

#### UI Considerations

**Never show:**
- Full-screen loading spinners
- "Loading..." text in results
- Empty states that flash

**Do show:**
- Skeleton placeholders (briefly, if needed)
- Previous results while loading new
- Subtle loading indicator in corner

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 auth                                              [···]  │ ← subtle spinner
├─────────────────────────────────────────────────────────────┤
│ Repositories                                                │
│   📁 acme/auth-service                                      │ ← from cache
│   📁 acme/auth-utils                                        │ ← from cache
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Results appear within 100ms of typing
- [ ] No loading spinners visible
- [ ] Previous results stay while fetching
- [ ] Cache works (second search for same term is instant)
- [ ] Works offline for cached data

---

### TASK-KB-004: Quick Switcher for Branches

**Priority:** P2  
**Effort:** Low (3-4 hours)  
**Dependencies:** TASK-KB-001 (similar UI pattern)

#### Current State

Branch selector is a dropdown. Works but slow for repos with many branches.

#### Requirements

1. `b` key opens branch quick switcher (on repo pages)
2. Modal with search input
3. Fuzzy search across branches
4. Recent branches at top
5. Enter to switch
6. Shows current branch highlighted
7. "Create branch" option at bottom

#### Files to Create

- `apps/web/src/components/branch/BranchSwitcher.tsx` - Quick switch modal

#### UI Design

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Switch branch...                                         │
├─────────────────────────────────────────────────────────────┤
│ Recent                                                      │
│   ○ main                                            default │
│   ● feat/auth                                      current │
│   ○ fix/login-bug                                           │
│                                                             │
│ All branches                                                │
│   ○ develop                                                 │
│   ○ feat/dashboard                                          │
│   ○ feat/notifications                                      │
│   ...                                                       │
├─────────────────────────────────────────────────────────────┤
│ + Create new branch                                         │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] `b` opens switcher on repo pages
- [ ] Can search branches
- [ ] Recent branches shown first
- [ ] Enter switches to selected branch
- [ ] Current branch indicated
- [ ] Can create new branch from modal

---

## Agent Prompt

```
You are implementing keyboard-first features for wit, a GitHub alternative.

Context:
- wit is a React/TypeScript app with tRPC backend
- Target users are power users who prefer keyboard over mouse
- Reference Linear and Raycast for UX inspiration
- Use existing shadcn/ui components where possible
- The app has a dark theme (Linear-inspired)

Your task: [TASK-ID]

Requirements:
[Copy requirements from above]

Key libraries:
- cmdk (for command palette)
- react-hotkeys-hook (for shortcuts)
- TanStack Query (already in use, for caching)

Implementation tips:
- Test on both Mac (Cmd) and Windows (Ctrl)
- Ensure shortcuts don't fire in input fields
- Add subtle animations for polish
- Cache aggressively for speed

The goal: make wit feel *fast*. Every millisecond matters.
```

---

## Dependencies

```
TASK-KB-001 ────────────────────────────► (none)
TASK-KB-002 ────────────────────────────► TASK-KB-001 (for hint integration)
TASK-KB-003 ────────────────────────────► TASK-KB-001 (search infra)
TASK-KB-004 ────────────────────────────► TASK-KB-001 (similar pattern)
```

---

## Success Metrics

- Command palette used more than navigation
- Search response time <100ms (perceived)
- Power users prefer wit to GitHub for speed
- Keyboard shortcut usage increases over time
- "It's so fast" mentioned in feedback
