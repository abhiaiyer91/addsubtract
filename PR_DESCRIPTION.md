# Web UI Enhancements & Workflow Features

## Summary
This PR adds comprehensive web UI improvements and implements three major workflow-related features: Visual Workflow Editor, Workflow Run Detail Page, and Job Dependency Graph Visualization.

## 🎨 Web UI Enhancements

### Layout & Design Improvements
1. **Widened Pages** - Increased max-width for better space utilization
   - Dashboard: 1400px (from 1280px)
   - Settings pages: 1200px (from 1024px)

2. **Dashboard Stats Cards** - Enhanced visual design
   - Added consistent spacing (mt-1) between numbers and labels
   - Fixed "Notifications0" display issue

3. **Header Improvements**
   - Centered search bar with balanced 3-column layout
   - Changed "wit" to "Wit" (sentence case)
   - Fixed JSX structure issues

4. **Landing Page** - Enhanced interactivity
   - Added hover effects to CTA buttons (scale, shadow, arrow animation)
   - Improved feature card hover states

5. **Authentication Pages**
   - Added Eye/EyeOff icons for password visibility toggles
   - Fixed redirect to user dashboard (/${username}) after login/signup
   - Raised forgot password page to prevent scrolling

6. **New Routes Added**
   - `/forgot-password` - Password recovery page
   - `/terms` - Terms of service page
   - `/privacy` - Privacy policy page

### Bug Fixes
1. **Token Creation Modal** - Fixed to show full token after creation
   - Changed `data.rawToken` → `data.token` to match API response
   
2. **AI Settings Links** - Fixed broken relative paths
   - Changed `settings/ai` → `/${owner}/${repo}/settings/ai`
   - Added validation for required props (repoId, owner, repoName)

3. **ScrollToTop Component** - Fixed pages opening from bottom
   - Added useLocation hook to reset scroll position on route change

## 🚀 New Features

### 1. Visual Workflow Editor
**Route**: `/:owner/:repo/actions/new` and `/actions/edit`

**Features**:
- Drag-and-drop step reordering using @dnd-kit
- Visual and YAML editor tabs with real-time sync
- Job configuration (name, runner, dependencies)
- Step library with common templates (checkout, setup-node, etc.)
- Trigger configuration (push, pull_request, workflow_dispatch)
- Monaco editor for YAML editing with syntax validation
- Save to create/update workflow files

**Components**:
- `WorkflowEditor` - Main page with tabs
- `VisualEditor` - 3-column layout (triggers, jobs, step library)
- `JobEditor` - Job configuration with sortable steps
- `SortableStep` - Draggable step component
- `YamlEditor` - Monaco YAML editor

**Dependencies Added**:
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `yaml`

### 2. Workflow Run Detail Page
**Route**: `/:owner/:repo/actions/runs/:runId`

**Features**:
- Workflow metadata (name, trigger, commit, branch, status)
- Summary cards (duration, jobs progress, trigger, run number)
- Collapsible job cards with step details
- Step-by-step logs with terminal-style viewer
- Cancel button for in-progress runs
- Auto-refresh every 3 seconds for active runs
- Breadcrumb navigation

**Components**:
- `WorkflowRunDetail` - Main detail page
- `JobCard` - Collapsible job with steps
- `StepRow` - Step with expandable logs
- `LogViewer` - Terminal-style log display

**Utilities Added**:
- `formatDuration()` - Format milliseconds to human-readable duration

### 3. Job Dependency Graph Visualization
**Location**: Integrated into Workflow Run Detail Page

**Features**:
- Interactive DAG (Directed Acyclic Graph) using ReactFlow
- Visual job dependencies and execution flow
- Status-based node coloring (queued, in_progress, completed, failed)
- Critical path highlighting
- Click on node to scroll to job in list
- Zoomable and pannable canvas
- Real-time status updates

**Components**:
- `JobGraph` - ReactFlow visualization component
- `buildJobGraph()` - Graph builder utility with critical path calculation

**Dependencies Added**:
- `reactflow`

## 📊 Statistics

### Files Changed
- **Created**: 8 new files
- **Modified**: 15+ files
- **Total Changes**: 2000+ lines

### New Routes
- `/forgot-password`
- `/terms`
- `/privacy`
- `/:owner/:repo/actions/new`
- `/:owner/:repo/actions/edit`
- `/:owner/:repo/actions/runs/:runId`

### Dependencies Added
```json
{
  "@dnd-kit/core": "^6.0.0",
  "@dnd-kit/sortable": "^7.0.0",
  "@dnd-kit/utilities": "^3.0.0",
  "yaml": "^2.3.0",
  "reactflow": "^11.10.0"
}
```

## 🎯 Key Improvements

1. **Better UX** - Wider layouts, improved navigation, password visibility toggles
2. **Visual Workflow Building** - No need to write YAML manually
3. **Detailed Run Insights** - See exactly what happened in each workflow run
4. **Dependency Visualization** - Understand job execution flow at a glance
5. **Consistent Design** - Unified spacing, colors, and interactions

## 🧪 Testing

All features tested manually:
- ✅ Visual workflow editor (create, edit, save)
- ✅ Workflow run detail page (view jobs, steps, logs)
- ✅ Job dependency graph (visualization, interactions)
- ✅ Token creation modal (shows full token)
- ✅ AI settings links (correct paths)
- ✅ Dashboard and settings layouts (proper widths)
- ✅ Authentication flows (redirects, password toggles)

## 📝 Breaking Changes

None - all changes are additive and backward compatible.

## 🔗 Related

- Implements Task 10: Visual Workflow Editor
- Implements Task 02: Workflow Run Detail Page
- Implements Task 07: Job Dependency Graph Visualization
- Fixes multiple UI/UX issues discovered during development

## 📸 Screenshots

(Screenshots would be added here showing the new features)

## Checklist

- [x] All new features working as expected
- [x] No breaking changes
- [x] Dependencies properly added
- [x] Code follows project style
- [x] Routes properly configured
- [x] Components are reusable and well-structured
- [x] Commits are clean and descriptive
