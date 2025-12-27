# Polish & Delight

**Category:** User Experience  
**Priority:** Medium  
**Owner:** Agent Team

---

## Strategic Context

The details matter. A lot.

The difference between "it works" and "I love it" is in the polish:
- Loading states that don't flicker
- Empty states that help instead of frustrate
- Feedback for every action
- Animations that feel natural

GitHub feels clunky because they stopped caring about these details years ago. We won't.

---

## Tasks

### TASK-POLISH-001: Loading States & Skeletons

**Priority:** P1  
**Effort:** Low (3-4 hours)  
**Dependencies:** None

#### Current State

Some pages show loading spinners. Some show nothing. Some show content that jumps when data loads. Inconsistent.

#### Requirements

1. Create skeleton components for all major content types
2. Skeletons should match the shape of the content
3. No layout shift when content loads
4. Shimmer animation on skeletons
5. Fast transitions (no flash of loading for cached data)
6. Use `keepPreviousData` in TanStack Query

#### Skeletons to Create

| Component | Skeleton For |
|-----------|--------------|
| RepoCardSkeleton | Repository list items |
| PRCardSkeleton | Pull request list items |
| IssueCardSkeleton | Issue list items |
| FileTreeSkeleton | File browser |
| DiffSkeleton | Diff viewer |
| UserCardSkeleton | User/collaborator cards |
| CommentSkeleton | Comments in timeline |

#### Files to Create

- `apps/web/src/components/skeleton/RepoCardSkeleton.tsx`
- `apps/web/src/components/skeleton/PRCardSkeleton.tsx`
- `apps/web/src/components/skeleton/IssueCardSkeleton.tsx`
- `apps/web/src/components/skeleton/FileTreeSkeleton.tsx`
- `apps/web/src/components/skeleton/DiffSkeleton.tsx`
- `apps/web/src/components/skeleton/index.tsx` - Export all

#### Implementation Pattern

```tsx
// Use shadcn/ui Skeleton component as base
import { Skeleton } from "@/components/ui/skeleton"

export function RepoCardSkeleton() {
  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-3 w-full mt-4" />
      <Skeleton className="h-3 w-3/4 mt-2" />
    </div>
  )
}

// Usage in list
function RepoList() {
  const { data, isLoading } = trpc.repos.list.useQuery();
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <RepoCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  
  return data.map(repo => <RepoCard repo={repo} />);
}
```

#### CSS for Shimmer

```css
/* Already in tailwind config, but ensure animation works */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--muted-foreground) / 0.1) 50%,
    hsl(var(--muted)) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

#### Acceptance Criteria

- [ ] All list pages have skeleton loading
- [ ] Skeletons match content shape
- [ ] No layout shift on load
- [ ] Shimmer animation works
- [ ] Cached data shows instantly (no skeleton)

---

### TASK-POLISH-002: Empty States

**Priority:** P2  
**Effort:** Low (2-3 hours)  
**Dependencies:** None

#### Current State

Empty lists show nothing or generic "No data" text. Not helpful.

#### Requirements

1. Every empty state has:
   - Relevant illustration or icon
   - Helpful message explaining the state
   - Action button (when appropriate)
2. Messages should be encouraging, not frustrating
3. Consistent styling across app

#### Empty States to Create

| Location | Message | Action |
|----------|---------|--------|
| No repositories | "You don't have any repositories yet" | "Create repository" |
| No PRs (repo) | "No pull requests yet" | "Create pull request" |
| No issues (repo) | "No issues found" | "Create issue" |
| No search results | "No results for 'query'" | "Clear search" |
| No notifications | "You're all caught up!" | None |
| No branches | "Only the default branch exists" | "Create branch" |
| No releases | "No releases published" | "Create release" |
| No collaborators | "No collaborators yet" | "Invite collaborator" |
| No webhooks | "No webhooks configured" | "Add webhook" |
| No SSH keys | "No SSH keys added" | "Add SSH key" |

#### Files to Create

- `apps/web/src/components/empty/EmptyState.tsx` - Reusable component
- Update each list to use EmptyState

#### Component Design

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;  // Lucide icon
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && (
        <div className="mb-4 text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

#### UI Examples

**No repositories:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                         📁                                  │
│                                                             │
│              You don't have any repositories yet            │
│                                                             │
│        Repositories contain all your project's files        │
│              and each file's revision history.              │
│                                                             │
│                  [Create a repository]                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**No search results:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                         🔍                                  │
│                                                             │
│              No results for "authentication"                │
│                                                             │
│         Try different keywords or check your spelling       │
│                                                             │
│                     [Clear search]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**All caught up (notifications):**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                         ✨                                  │
│                                                             │
│                   You're all caught up!                     │
│                                                             │
│           No new notifications at the moment.               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] All list pages have empty states
- [ ] Empty states have icon and message
- [ ] Action buttons work where present
- [ ] Messages are helpful and encouraging
- [ ] Consistent styling

---

### TASK-POLISH-003: Toast Notifications

**Priority:** P1  
**Effort:** Low (2-3 hours)  
**Dependencies:** None

#### Current State

Actions happen silently. User doesn't know if something succeeded or failed.

#### Requirements

1. Success toasts for positive actions
2. Error toasts for failures
3. Info toasts for neutral information
4. Auto-dismiss after 5 seconds
5. Can dismiss manually
6. Stack multiple toasts
7. Position: bottom-right

#### Actions That Need Toasts

**Success:**
- Repository created
- PR created/merged/closed
- Issue created/closed
- Comment added
- Settings saved
- Collaborator added
- Release published

**Error:**
- API errors
- Validation failures
- Permission denied
- Network errors

**Info:**
- Copied to clipboard
- PR is now mergeable
- New notification

#### Implementation

Use shadcn/ui toast (based on Radix):

```bash
# Already available via shadcn
npx shadcn-ui@latest add toast
```

```tsx
// Setup in App.tsx
import { Toaster } from "@/components/ui/toaster"

function App() {
  return (
    <>
      <RouterProvider />
      <Toaster />
    </>
  )
}

// Usage in components
import { useToast } from "@/components/ui/use-toast"

function CreateRepoButton() {
  const { toast } = useToast()
  const createRepo = trpc.repos.create.useMutation({
    onSuccess: () => {
      toast({
        title: "Repository created",
        description: "Your new repository is ready.",
      })
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  })
}
```

#### Toast Styling

```
Success:
┌─────────────────────────────────────┐
│ ✓ Repository created           [×] │
│   Your new repository is ready.    │
└─────────────────────────────────────┘

Error:
┌─────────────────────────────────────┐
│ ✗ Error                        [×] │
│   Permission denied.               │
└─────────────────────────────────────┘

Info:
┌─────────────────────────────────────┐
│ ℹ Copied to clipboard          [×] │
└─────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Toasts appear for all major actions
- [ ] Success/error variants styled correctly
- [ ] Auto-dismiss after 5 seconds
- [ ] Can dismiss manually (X button)
- [ ] Multiple toasts stack
- [ ] Position is bottom-right
- [ ] Animations are smooth

---

### TASK-POLISH-004: Optimistic Updates

**Priority:** P2  
**Effort:** Medium (4-6 hours)  
**Dependencies:** TASK-POLISH-003 (for error handling)

#### Current State

Actions wait for server response before updating UI. Feels slow.

#### Requirements

1. UI updates immediately on user action
2. Background sync to server
3. Rollback if server fails (with error toast)
4. Subtle indicator while syncing (optional)
5. No stale data after rollback

#### Actions to Make Optimistic

| Action | Optimistic Behavior |
|--------|---------------------|
| Star repo | Star count +1, star button filled |
| Unstar repo | Star count -1, star button empty |
| Close issue | Issue moves to closed, button changes |
| Reopen issue | Issue moves to open, button changes |
| Mark notification read | Notification disappears from list |
| Add comment | Comment appears immediately |
| Toggle PR draft | Draft badge toggles |
| Delete item | Item disappears from list |

#### Implementation Pattern

```tsx
// TanStack Query optimistic update pattern
const starMutation = trpc.repos.star.useMutation({
  // Called before the mutation runs
  onMutate: async ({ repoId }) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries(['repos', repoId])
    
    // Snapshot previous value
    const previousRepo = queryClient.getQueryData(['repos', repoId])
    
    // Optimistically update
    queryClient.setQueryData(['repos', repoId], (old) => ({
      ...old,
      isStarred: true,
      starCount: old.starCount + 1,
    }))
    
    // Return context for rollback
    return { previousRepo }
  },
  
  // If mutation fails, roll back
  onError: (err, variables, context) => {
    queryClient.setQueryData(
      ['repos', variables.repoId],
      context.previousRepo
    )
    toast({
      title: "Failed to star",
      description: err.message,
      variant: "destructive",
    })
  },
  
  // Always refetch after error or success
  onSettled: () => {
    queryClient.invalidateQueries(['repos', repoId])
  },
})
```

#### Files to Modify

- Components with star/unstar buttons
- Issue list/detail (close/reopen)
- PR detail (draft toggle)
- Notification list (mark read)
- Any delete actions

#### Acceptance Criteria

- [ ] Star/unstar feels instant
- [ ] Close/reopen issue feels instant
- [ ] Mark notification read feels instant
- [ ] Errors roll back with toast
- [ ] No stale data after actions
- [ ] Works with poor network

---

### TASK-POLISH-005: Responsive Design Audit

**Priority:** P2  
**Effort:** Medium (4-6 hours)  
**Dependencies:** None

#### Current State

App works on desktop. Tablet and mobile are likely broken or awkward.

#### Requirements

1. Usable on tablet (iPad)
2. Functional on mobile (last resort, but shouldn't break)
3. No horizontal scrolling
4. Touch-friendly button sizes (min 44px)
5. Collapsible sidebar on smaller screens
6. Readable content at all sizes

#### Breakpoints

```css
/* Tailwind defaults */
sm: 640px   /* Small devices */
md: 768px   /* Tablets */
lg: 1024px  /* Laptops */
xl: 1280px  /* Desktops */
2xl: 1536px /* Large screens */
```

#### Areas to Audit

| Area | Desktop | Tablet | Mobile |
|------|---------|--------|--------|
| Navigation | Sidebar | Collapsible | Hamburger menu |
| File tree | Sidebar | Collapsible | Full-screen drawer |
| Diff viewer | Full width | Full width | Horizontal scroll OK |
| Forms | Wide inputs | Full width | Full width |
| Tables | Normal | Scroll or stack | Card view |
| Command palette | Centered | Centered | Full width |

#### Common Fixes

```tsx
// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Hide on mobile
<div className="hidden md:block">

// Show only on mobile
<div className="block md:hidden">

// Responsive padding
<div className="p-4 md:p-6 lg:p-8">

// Responsive text
<h1 className="text-xl md:text-2xl lg:text-3xl">

// Touch-friendly buttons
<Button className="h-11 px-6">  {/* min 44px height */}
```

#### Mobile Navigation Pattern

```
┌─────────────────────────────────────┐
│ [≡]  wit / repo-name         [🔔]  │
├─────────────────────────────────────┤
│                                     │
│  (main content)                     │
│                                     │
└─────────────────────────────────────┘

[≡] opens drawer:
┌──────────────────┬──────────────────┐
│ Navigation       │                  │
│                  │                  │
│ 📁 Code          │                  │
│ 🔀 Pull Requests │                  │
│ 🎫 Issues        │  (dimmed)        │
│ ⚡ Actions       │                  │
│ ⚙️ Settings      │                  │
│                  │                  │
│ ──────────────── │                  │
│ Your repos       │                  │
│ • repo-1         │                  │
│ • repo-2         │                  │
└──────────────────┴──────────────────┘
```

#### Testing Checklist

- [ ] Test on real iPad (or Chrome DevTools iPad mode)
- [ ] Test on real phone (or Chrome DevTools mobile)
- [ ] Check all main pages
- [ ] Check all forms
- [ ] Check command palette
- [ ] Check diff viewer
- [ ] Verify touch targets are 44px+
- [ ] No horizontal scroll on body

#### Acceptance Criteria

- [ ] App usable on iPad
- [ ] App functional on phone
- [ ] Navigation works on all sizes
- [ ] Forms are usable on mobile
- [ ] No broken layouts
- [ ] Touch targets are adequate

---

## Agent Prompt

```
You are implementing polish and UX improvements for wit, a GitHub alternative.

Context:
- wit uses React + Tailwind + shadcn/ui
- The app has a dark theme (Linear-inspired)
- Focus on making interactions feel fast and polished
- Small details matter - animations, loading states, feedback

Your task: [TASK-ID]

Requirements:
[Copy requirements from above]

Guidelines:
- Use existing shadcn/ui components where possible
- Keep animations subtle (150-300ms)
- Ensure accessibility (aria labels, focus states)
- Test across different states (loading, empty, error, success)
- Mobile considerations if relevant

The goal: make wit feel *delightful*. Every interaction should have appropriate feedback.
```

---

## Dependencies

```
TASK-POLISH-001 ─────────────────────────► (none)
TASK-POLISH-002 ─────────────────────────► (none)
TASK-POLISH-003 ─────────────────────────► (none)
TASK-POLISH-004 ─────────────────────────► TASK-POLISH-003 (error toasts)
TASK-POLISH-005 ─────────────────────────► (none)
```

---

## Success Metrics

- No loading flicker
- Every action has feedback
- Zero broken layouts on tablet
- Users comment on how "polished" it feels
- Lighthouse performance score >90
