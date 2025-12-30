import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  HandHeart,
  Sparkles,
  CircleDot,
  GitFork,
  Search,
  Tag,
  Signal,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Users,
  Rocket,
  Code,
  FileText,
  CheckCircle2,
  Github,
  Copy,
  Check,
  Terminal,
  Bot,
  BookOpen,
  TestTube,
  Zap,
  GitBranch,
  Layout,
  Shield,
  Globe,
  Server,
  Gamepad2,
  Filter,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';

// Priority config
const PRIORITY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  urgent: { label: 'Urgent', icon: <AlertCircle className="h-3 w-3" />, color: 'text-red-500' },
  high: { label: 'High', icon: <Signal className="h-3 w-3" />, color: 'text-orange-500' },
  medium: { label: 'Medium', icon: <Signal className="h-3 w-3" />, color: 'text-yellow-500' },
  low: { label: 'Low', icon: <Signal className="h-3 w-3" />, color: 'text-blue-500' },
  none: { label: 'No priority', icon: <Signal className="h-3 w-3" />, color: 'text-muted-foreground' },
};

type LabelFilter = 'all' | 'help-wanted' | 'good-first-issue';

// Define all contribution prompts with categories
interface ContributionPrompt {
  id: string;
  title: string;
  category: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  tags: string[];
  prompt: string;
}

const CONTRIBUTION_PROMPTS: ContributionPrompt[] = [
  // P0 - Critical
  {
    id: 'quickstart-tutorial',
    title: "Create '5 Minutes to Wow' Quickstart Tutorial",
    category: 'Documentation',
    priority: 'P0',
    tags: ['docs', 'onboarding', 'beginner-friendly'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me create a "5 minutes to wow" quickstart tutorial that gets new users productive immediately.

1. First, understand what wit offers by exploring:
   - README.md for the project overview
   - ROADMAP.md for the vision and features
   - docs/ folder for existing documentation structure

2. Create a new quickstart guide at docs/quickstart.mdx that covers:
   - Installing wit (once we have the one-liner)
   - Initializing a repo: wit init
   - The "zero command" experience: just running 'wit' to see smart status
   - Making an AI-powered commit: wit ai commit
   - Semantic code search: wit search "where do we handle X"
   - Opening a PR with AI description: wit pr create

3. The tutorial should:
   - Be completable in under 5 minutes
   - Show the "wow" moments - AI commit messages, semantic search, smart status
   - Use a realistic example project
   - Include screenshots or terminal output examples
   - Follow the existing docs style (check docs/mint.json)

4. Update docs/mint.json to add the quickstart to navigation

5. Test that the tutorial actually works by following it yourself

The goal: a new user should think "this is way better than git" within 5 minutes.`,
  },
  {
    id: 'install-script',
    title: 'Create Installation One-Liner Script',
    category: 'Infrastructure',
    priority: 'P0',
    tags: ['devops', 'installation', 'shell'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me create a simple installation script like nvm or rustup uses.

1. Study how other tools do this:
   - nvm: curl -o- https://raw.githubusercontent.com/.../install.sh | bash
   - rustup: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

2. Create an install script that:
   - Detects the OS (macOS, Linux, Windows via WSL)
   - Downloads the appropriate binary or uses npm
   - Adds wit to the PATH
   - Verifies the installation
   - Shows a welcome message with next steps

3. The script should handle:
   - Different shells (bash, zsh, fish)
   - Permission issues gracefully
   - Network failures with helpful errors
   - Existing installations (upgrade path)

4. Create the install script at scripts/install.sh

5. Update README.md with the one-liner installation command

6. Test on different environments if possible

The goal: 'curl ... | sh' should just work and get someone to 'wit --version' in under 30 seconds.`,
  },
  {
    id: 'document-cli-commands',
    title: 'Document All 72+ CLI Commands',
    category: 'Documentation',
    priority: 'P0',
    tags: ['docs', 'cli', 'reference'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me create comprehensive documentation for all CLI commands.

1. First, get the full list of commands:
   - Look at src/commands/ - each .ts file is a command
   - Run: ls src/commands/*.ts | wc -l to count them
   - Check docs/commands/ to see what's already documented

2. For each undocumented command, create a .mdx file in docs/commands/:
   - Read the command source to understand all options
   - Follow the existing doc format (check docs/mint.json)
   
3. Each command doc should include:
   - Brief description (one sentence)
   - Full description with use cases
   - Syntax: wit <command> [options]
   - All available flags with descriptions
   - 3-5 practical examples
   - Tips and common workflows
   - Related commands section

4. Priority commands to document:
   - AI commands: agent, ai, search
   - Platform: pr, issue, cycle, project, stack
   - Quality of life: wip, amend, uncommit, undo, cleanup
   - Advanced: worktree, bisect, stash

5. Update docs/mint.json navigation as you add docs

6. Test each example in the docs actually works

The goal: any wit command should have clear, helpful documentation.`,
  },
  {
    id: 'fix-integration-tests',
    title: 'Fix All Failing Integration Tests',
    category: 'Testing',
    priority: 'P0',
    tags: ['testing', 'quality', 'bugs'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me fix all failing integration tests so the test suite passes completely.

1. Run the full test suite and identify failures:
   npm test 2>&1 | tee test-output.txt
   
2. Categorize the failures:
   - Look at tests/integration/ for integration tests
   - Check src/__tests__/ for unit tests
   - Group failures by module/feature

3. For each failing test:
   - Read the test to understand what it's verifying
   - Find the relevant source code
   - Determine if the bug is in:
     a) The test itself (outdated expectations)
     b) The implementation (actual bug)
     c) Test setup/teardown (environment issue)

4. Common failure patterns to look for:
   - Async timing issues (need await or longer timeout)
   - File system race conditions
   - Database state not cleaned up between tests
   - Mock not properly configured

5. Fix one test at a time:
   - npm test -- --grep "test name" to run single test
   - Fix and verify before moving on
   - Commit each fix separately with clear message

6. Priority test files:
   - tests/integration/pr-flow.test.ts
   - tests/integration/issue-management.test.ts
   - tests/integration/git-operations.test.ts

The goal: npm test should show all green - 100% pass rate.`,
  },
  // P1 - High Priority
  {
    id: 'landing-page',
    title: 'Build the Landing Page',
    category: 'Web UI',
    priority: 'P1',
    tags: ['frontend', 'marketing', 'design'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me build a compelling landing page that explains what wit is and why developers should use it.

1. First, understand wit's value proposition from:
   - ROADMAP.md - especially "What Makes wit Different" section
   - The zero command experience
   - AI-powered features (semantic search, AI commits, AI review)
   - "Git that doesn't hate you" philosophy

2. Create or update the landing page at apps/web/src/routes/index.tsx:
   - Hero section: "Git that understands your code"
   - Feature highlights with demos/animations:
     * The zero command (wit shows smart status)
     * Semantic search ("where do we handle auth?")
     * AI commit messages
     * AI code review on PRs
   - Comparison with traditional Git/GitHub
   - Quick install section
   - CTA to docs/quickstart

3. Design considerations:
   - Use the existing UI components from @/components/ui/
   - Make it visually striking - this is the first impression
   - Mobile responsive
   - Fast loading (optimize images, lazy load)
   - Dark mode support (already in the app)

4. Add terminal-style demos showing wit in action

5. Test on mobile and desktop

The goal: a developer landing here should immediately understand why wit is special and want to try it.`,
  },
  {
    id: 'esm-cjs-fix',
    title: 'Fix ESM/CommonJS Configuration',
    category: 'Infrastructure',
    priority: 'P1',
    tags: ['build', 'typescript', 'technical-debt'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me clean up the ESM/CommonJS module configuration to make the build more robust.

1. Understand the current state:
   - Check package.json for "type": "module" or "type": "commonjs"
   - Review tsconfig.json for module settings
   - Look at how imports/exports are done across the codebase
   - Check for .mjs/.cjs file extensions

2. Identify issues:
   - Search for 'require(' usage that should be import
   - Look for __dirname/__filename usage (not available in ESM)
   - Check for dynamic imports that might break
   - Find dependencies that only work in CJS

3. Fix the configuration:
   - Standardize on ESM throughout
   - Update tsconfig.json module settings appropriately
   - Fix any require() calls to use import
   - Use import.meta.url instead of __dirname
   - Update build scripts if needed

4. Test thoroughly:
   - npm run build should complete without warnings
   - npm test should pass
   - Try running wit commands manually
   - Test in both Node.js and browser (for web app)

5. Document any gotchas in CONTRIBUTING.md

The goal: the build should "just work" without module-related warnings or errors.`,
  },
  {
    id: 'ai-package-check',
    title: 'Add AI Package Dependency Check',
    category: 'Infrastructure',
    priority: 'P1',
    tags: ['ai', 'error-handling', 'dx'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me add a check for the 'ai' package dependency so semantic search works on fresh installs.

1. Understand the problem:
   - Semantic search features use the 'ai' package for embeddings
   - On fresh installs, this might not be installed
   - This causes confusing errors for new users

2. Find where the issue occurs:
   - Look at src/search/embeddings.ts
   - Check src/search/semantic.ts
   - Find where the 'ai' package is imported

3. Implement a graceful check:
   - Before using AI features, check if the package is available
   - If missing, show a helpful error message:
     "Semantic search requires the 'ai' package. Run: npm install ai"
   - Or better: auto-install it if possible
   - Consider making it an optional peer dependency

4. Add the check in key places:
   - wit search command
   - wit ai commands
   - Semantic search API endpoints

5. Test the fix:
   - Remove the ai package and verify the error message
   - Install it and verify features work
   - Run the full test suite

The goal: new users should never see a cryptic "module not found" error - they should get clear instructions.`,
  },
  {
    id: 'improve-error-messages',
    title: 'Improve Error Messages Across All Commands',
    category: 'User Experience',
    priority: 'P1',
    tags: ['ux', 'cli', 'error-handling'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me audit and improve error messages to be helpful, not frustrating.

1. Find all error messages in the codebase:
   - Search for: throw new Error, console.error, .error(
   - Focus on src/commands/ and src/core/
   - Look for generic messages like "Invalid", "Failed", "Error"

2. For each error, improve it to include:
   - What went wrong (specific, not generic)
   - Why it went wrong (context)
   - How to fix it (actionable suggestion)
   - Example of correct usage if applicable

3. Error message template:
   Before: "Invalid branch name"
   After: "Branch name 'my branch' is invalid - branch names cannot contain spaces.
          Try: wit branch my-branch
          See: wit branch --help for naming rules"

4. Create a consistent error formatting:
   - Use chalk for colors (red for error, yellow for suggestion)
   - Always suggest a next step
   - Include relevant command help

5. Test error scenarios:
   - Try invalid inputs for each command
   - Verify messages are helpful
   - Check that suggestions actually work

6. Focus areas:
   - src/commands/branch.ts
   - src/commands/commit.ts
   - src/commands/merge.ts
   - src/commands/pr.ts
   - src/core/refs.ts

wit's philosophy is "Git that doesn't hate you" - errors should help users succeed.`,
  },
  {
    id: 'test-coverage',
    title: 'Add Comprehensive Test Coverage',
    category: 'Testing',
    priority: 'P1',
    tags: ['testing', 'quality', 'coverage'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me increase test coverage for untested functions.

1. Identify what needs tests:
   - Run: npm test -- --coverage to see current coverage
   - Look for files with low coverage in src/core/ and src/commands/
   - Check which functions have no tests at all

2. Understand the testing patterns:
   - Look at existing tests in src/__tests__/
   - The project uses vitest
   - Tests use describe/it/expect patterns
   - Many tests create temporary git repos

3. Write tests for these priority areas:
   - src/core/refs.ts - reference management
   - src/core/merge.ts - merge operations
   - src/core/diff.ts - diff generation
   - src/commands/stash.ts - stash operations
   - src/commands/rebase.ts - rebase operations
   - src/ai/tools/ - AI tool functions

4. For each function, test:
   - Happy path (normal operation)
   - Edge cases (empty input, null, undefined)
   - Error cases (invalid input, missing files)
   - Boundary conditions

5. Test file naming: src/__tests__/<module>.test.ts

6. Run tests frequently: npm test

7. Aim for meaningful coverage, not just line coverage

The goal: confidence that changes don't break existing functionality.`,
  },
  {
    id: 'stacked-diffs',
    title: 'Implement Stacked Diffs Workflow',
    category: 'Platform',
    priority: 'P1',
    tags: ['git', 'workflow', 'prs'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the stacked diffs feature for managing dependent PRs.

1. Understand current implementation:
   - Look at src/commands/stack.ts
   - Check database models in src/db/models/stacks.ts
   - Review API in src/api/trpc/stacks.ts

2. Stacked diffs workflow should support:
   - Create a stack: wit stack create feature-name
   - Add branch to stack: wit stack push
   - View stack: wit stack (shows all PRs in order)
   - Rebase stack: wit stack rebase (update all branches)
   - Submit stack: wit stack submit (create PRs for all)

3. Key features to implement/improve:
   - Automatic rebasing when base changes
   - Clear visualization of stack dependencies
   - Sync stack state with remote
   - Handle conflicts in stack gracefully
   - Bulk operations (merge all, close all)

4. UI improvements (apps/web):
   - Stack visualization component
   - Show PR dependencies graphically
   - One-click rebase entire stack
   - Stack health status (conflicts, CI status)

5. CLI output should show:
   - Stack tree structure
   - PR status for each branch
   - Which branches need rebasing
   - Merge order

6. Write tests for stack operations

7. Add documentation for stacked workflow

The goal: make managing dependent PRs as easy as a single PR.`,
  },
  {
    id: 'pr-review-experience',
    title: 'Improve PR Review Experience',
    category: 'Platform',
    priority: 'P1',
    tags: ['code-review', 'pr', 'ux'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the pull request review experience.

1. Understand current PR implementation:
   - src/commands/pr.ts - CLI commands
   - src/api/trpc/pullRequests.ts - API
   - apps/web/src/routes/pr/ - Web UI

2. CLI review improvements (wit pr review):
   - wit pr review 123 - start reviewing PR #123
   - Show diff with syntax highlighting in terminal
   - Navigate between files with keyboard
   - Add comments inline from CLI
   - Approve/request changes from CLI

3. Add review features:
   - Code suggestions (like GitHub's)
   - Batch comments (submit all at once)
   - Review templates
   - Auto-review checklist
   - "LGTM" quick approve

4. AI-powered review enhancements:
   - Summarize changes before review
   - Highlight risky changes
   - Suggest reviewers based on code ownership
   - Auto-detect common issues

5. Web UI improvements:
   - Side-by-side diff view
   - Collapse/expand files
   - Mark files as viewed
   - Jump to next unreviewed file
   - Keyboard shortcuts for review actions

6. Review workflow:
   - wit pr checkout 123 - check out PR locally
   - wit pr test 123 - run tests on PR
   - wit pr approve 123 --message "LGTM"

7. Write tests and documentation

The goal: reviewing code should be fast and thorough with AI assistance.`,
  },
  {
    id: 'merge-queue',
    title: 'Implement Merge Queue',
    category: 'Platform',
    priority: 'P1',
    tags: ['ci-cd', 'automation', 'prs'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the merge queue feature for safe, automated merging.

1. Understand current implementation:
   - src/commands/merge-queue.ts
   - src/db/models/mergeQueue*.ts
   - src/api/trpc/mergeQueue.ts
   - src/events/handlers/merge-queue.ts

2. Merge queue workflow:
   - wit mq add 123 - add PR #123 to queue
   - wit mq status - show queue status
   - wit mq remove 123 - remove from queue
   - wit mq pause/resume - control queue

3. Key features to implement/improve:
   - Batching: merge multiple PRs together
   - Speculative merging: test PRs in parallel
   - Priority levels: urgent PRs jump queue
   - Automatic rebase before merge
   - Required checks before merge

4. Safety features:
   - Rollback on CI failure
   - Conflict detection before queueing
   - Branch protection integration
   - Notify on queue failures

5. Queue visualization (CLI and Web):
   - Show queue order
   - Show each PR's status (testing, waiting, merging)
   - Estimated time to merge
   - Show batches and their composition

6. Events and notifications:
   - Notify when PR enters queue
   - Notify on merge success/failure
   - Notify on position change

7. Write tests for queue operations

8. Add documentation

The goal: PRs should merge automatically and safely without babysitting.`,
  },
  {
    id: 'github-import',
    title: 'Implement GitHub Import/Migration',
    category: 'Platform',
    priority: 'P1',
    tags: ['migration', 'github', 'import'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the GitHub import functionality.

1. Understand current implementation:
   - src/commands/github-import.ts
   - src/core/git-migration.ts

2. Import features:
   - Import repository (code + history)
   - Import issues
   - Import pull requests
   - Import wiki
   - Import releases
   - Import GitHub Actions workflows

3. CLI command: wit github-import
   - wit github-import owner/repo
   - wit github-import --issues
   - wit github-import --prs
   - wit github-import --all

4. Authentication:
   - GitHub token input
   - OAuth flow option
   - Secure token storage

5. Migration mapping:
   - User mapping (GitHub -> wit users)
   - Label migration
   - Milestone migration
   - Project board migration

6. Progress tracking:
   - Show import progress
   - Resume interrupted imports
   - Error handling and retry
   - Import log/report

7. Post-import:
   - Verify import completeness
   - Link to original for reference
   - Redirect setup

8. Web UI:
   - Import wizard
   - Progress visualization
   - Import history

9. Write tests and documentation

The goal: migrate from GitHub seamlessly with all history preserved.`,
  },
  {
    id: 'search-improvements',
    title: 'Add Search Improvements',
    category: 'Platform',
    priority: 'P1',
    tags: ['search', 'ai', 'ux'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the search functionality.

1. Understand current implementation:
   - src/commands/search.ts
   - src/search/ - search module
   - src/api/trpc/search.ts

2. Search types:
   - Code search (file contents)
   - File path search
   - Commit search
   - Issue search
   - PR search
   - User search

3. Code search features:
   - Regex support
   - Language filter
   - Path filter
   - Case sensitivity toggle
   - Whole word match

4. CLI improvements:
   - wit search "pattern"
   - wit search "pattern" --type code|issue|pr|commit
   - wit search "pattern" --path "src/**"
   - wit search "pattern" --lang typescript
   - wit search --regex "function\\s+\\w+"

5. Search results:
   - Syntax highlighted matches
   - Context lines
   - File path and line number
   - Click to open (web)
   - Result count and timing

6. Advanced features:
   - Search history
   - Saved searches
   - Search within results
   - Export results

7. Web UI:
   - Global search bar
   - Advanced search page
   - Filters sidebar
   - Result previews

8. Write tests and documentation

The goal: find anything in your repository instantly.`,
  },
  {
    id: 'web-ide-terminal',
    title: 'Build Web-Based IDE Terminal',
    category: 'Web UI',
    priority: 'P1',
    tags: ['frontend', 'terminal', 'ide'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the web-based IDE terminal experience.

1. Understand current implementation:
   - apps/web/src/components/ide/
   - src/server/sandbox/ - sandbox providers
   - Check terminal component implementation

2. Terminal improvements:
   - Full xterm.js integration
   - Proper color support (256 colors)
   - Copy/paste support
   - Scrollback buffer
   - Search in terminal output
   - Multiple terminal tabs

3. Shell integration:
   - Proper shell detection (bash, zsh, fish)
   - Working directory sync with file tree
   - Environment variable support
   - Shell history

4. Sandbox providers:
   - src/server/sandbox/e2b.ts - E2B provider
   - src/server/sandbox/daytona.ts - Daytona provider
   - src/server/sandbox/docker.ts - Docker provider
   - Add provider status indicator
   - Graceful fallback between providers

5. IDE integration:
   - Open file from terminal (click on path)
   - Run current file
   - Git commands with visual feedback
   - wit commands integrated

6. Performance:
   - WebSocket connection management
   - Reconnection handling
   - Output buffering for large outputs

7. Write tests and documentation

The goal: the terminal should feel as responsive as a native terminal.`,
  },
  {
    id: 'file-tree-git-status',
    title: 'Implement File Tree with Git Status',
    category: 'Web UI',
    priority: 'P1',
    tags: ['frontend', 'git', 'ide'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the file tree component to show Git status.

1. Understand current implementation:
   - apps/web/src/components/ide/file-tree.tsx
   - src/ui/file-tree.ts (CLI version)

2. Git status indicators:
   - Modified files: orange dot or M
   - Added/new files: green dot or A
   - Deleted files: red dot or D
   - Renamed files: blue dot or R
   - Untracked files: gray dot or ?
   - Ignored files: dimmed

3. Directory status:
   - Show status if any child has changes
   - Aggregate child statuses
   - Collapse indicator for dirs with changes

4. File tree features:
   - Expand/collapse directories
   - File icons by extension
   - Right-click context menu
   - Drag and drop (move/copy)
   - Multi-select with Shift/Cmd

5. Context menu actions:
   - New file/folder
   - Rename
   - Delete
   - Copy path
   - Stage/unstage (for changed files)
   - View diff (for changed files)
   - Open in terminal

6. Performance:
   - Virtual scrolling for large trees
   - Lazy load directory contents
   - Debounce status updates

7. Keyboard navigation:
   - Arrow keys to navigate
   - Enter to open file
   - Space to toggle directory

8. Write tests and documentation

The goal: see Git status at a glance while browsing files.`,
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Add Keyboard Shortcuts System',
    category: 'Web UI',
    priority: 'P1',
    tags: ['frontend', 'ux', 'accessibility'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me implement a comprehensive keyboard shortcuts system.

1. Understand current shortcuts:
   - apps/web/src/components/CommandPalette.tsx
   - Check for existing hotkey handling

2. Core shortcuts to implement:
   - Cmd+K: Command palette
   - Cmd+P: Quick file open
   - Cmd+Shift+P: All commands
   - Cmd+B: Toggle sidebar
   - Cmd+J: Toggle terminal
   - Cmd+S: Save file
   - Cmd+W: Close tab
   - Cmd+/: Toggle comment

3. Git shortcuts:
   - Cmd+Shift+G: Git panel
   - Cmd+Enter: Commit staged changes
   - Cmd+Shift+K: Push
   - Cmd+Shift+L: Pull

4. Navigation:
   - Cmd+1-9: Switch to tab N
   - Cmd+Tab: Next tab
   - Cmd+Shift+Tab: Previous tab
   - Cmd+\`: Toggle between editor/terminal

5. Shortcut system architecture:
   - Global shortcut registry
   - Context-aware shortcuts (different in editor vs terminal)
   - Customizable shortcuts
   - Conflict detection

6. Shortcuts help:
   - Cmd+?: Show all shortcuts
   - Shortcut hints in menus
   - Shortcut search in command palette

7. Settings:
   - Keyboard shortcuts settings page
   - Import/export shortcuts
   - Preset schemes (VS Code, Vim, etc.)

8. Write tests and documentation

The goal: power users should never need the mouse.`,
  },
  {
    id: 'diff-viewer',
    title: 'Implement Diff Viewer Improvements',
    category: 'Web UI',
    priority: 'P1',
    tags: ['frontend', 'git', 'code-review'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the diff viewer component.

1. Understand current implementation:
   - apps/web/src/components/diff-viewer.tsx
   - src/ui/diff-viewer.ts (CLI version)

2. View modes:
   - Side-by-side (two columns)
   - Inline/unified (single column)
   - Split (resizable panes)
   - Toggle between modes

3. Diff features:
   - Syntax highlighting in diffs
   - Line numbers (old and new)
   - Expand collapsed context
   - Jump to next/previous change
   - Word-level diff highlighting

4. Interactivity:
   - Click line to add comment
   - Select lines for multi-line comment
   - Hover to show blame info
   - Copy button for code blocks

5. Navigation:
   - File list sidebar
   - Jump to file
   - Collapse/expand files
   - Show only changed files
   - Filter by file type

6. Large diff handling:
   - Virtual scrolling
   - Lazy render off-screen hunks
   - "Load more" for huge diffs
   - Diff stats summary

7. AI integration:
   - "Explain this change" button
   - AI-generated change summary
   - Risk highlighting

8. Write tests and documentation

The goal: reviewing diffs should be fast and informative.`,
  },
  {
    id: 'notifications-system',
    title: 'Implement Notifications System',
    category: 'Platform',
    priority: 'P1',
    tags: ['notifications', 'ux', 'real-time'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the notifications system.

1. Understand current implementation:
   - src/db/models/notifications.ts
   - src/commands/inbox.ts
   - src/api/trpc/notifications.ts

2. Notification types:
   - PR assigned to you
   - PR review requested
   - PR commented
   - PR merged/closed
   - Issue assigned
   - Issue commented
   - Mentioned in comment
   - CI failed
   - Push to watched repo

3. CLI improvements:
   - wit inbox - show notifications
   - wit inbox --unread
   - wit inbox --mark-read 123
   - wit inbox --mark-all-read
   - Desktop notifications opt-in

4. Web notifications:
   - Notification bell in header
   - Dropdown with recent notifications
   - Click to navigate to item
   - Mark as read
   - Real-time updates (WebSocket)

5. Email notifications:
   - Email preferences settings
   - Digest vs immediate
   - Per-repo settings
   - Unsubscribe links

6. Notification preferences:
   - Settings page for preferences
   - Per-notification-type toggle
   - Quiet hours
   - DND mode

7. Push notifications:
   - Browser push notifications
   - Mobile push (future)

8. Write tests and documentation

The goal: never miss important updates without being overwhelmed.`,
  },
  {
    id: 'demo-video-script',
    title: 'Create Demo Video Script',
    category: 'Marketing',
    priority: 'P1',
    tags: ['marketing', 'video', 'content'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me create a script for a demo video.

1. Video structure (2-3 minutes):
   - Hook (10 seconds): "What if Git understood your code?"
   - Problem (20 seconds): Git/GitHub pain points
   - Solution (90 seconds): wit demo
   - Call to action (10 seconds): Try it

2. Key demos to show:
   - The zero command: just 'wit' shows smart status
   - AI commit: wit ai commit generates perfect messages
   - Semantic search: wit search "where do we handle auth?"
   - AI code review: wit review on a PR
   - Conflict resolution: wit ai resolve

3. Script format:
   [VISUAL]: What's on screen
   [NARRATION]: What to say
   [TIMING]: Duration

4. Terminal recordings:
   - Use asciinema or similar
   - Clean terminal setup
   - Realistic but fast typing
   - Good example repos

5. Create the script in docs/demo-script.md:
   - Full narration text
   - Timing for each section
   - Notes for b-roll/graphics
   - Music/sound suggestions

6. Deliverables:
   - Written script
   - Terminal command sequences
   - Example repositories to use

The goal: a compelling video that shows why wit is special in under 3 minutes.`,
  },
  {
    id: 'architecture-docs',
    title: 'Write Architecture Documentation',
    category: 'Documentation',
    priority: 'P1',
    tags: ['docs', 'architecture', 'onboarding'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me write architecture documentation.

1. Check existing docs:
   - docs/architecture/overview.mdx
   - docs/architecture/events.mdx
   - docs/architecture/primitives.mdx

2. Document the system architecture:
   - High-level system diagram
   - Component interactions
   - Data flow
   - Technology stack

3. Key areas to document:
   - Core Git implementation (src/core/)
   - AI system (src/ai/)
   - Server architecture (src/server/)
   - Database schema (src/db/)
   - Event system (src/events/)
   - CLI structure (src/commands/)

4. For each component:
   - Purpose and responsibility
   - Key files and modules
   - Public interfaces
   - Dependencies
   - Extension points

5. Diagrams to create:
   - System context diagram
   - Component diagram
   - Sequence diagrams for key flows
   - Database ER diagram

6. Write for two audiences:
   - Contributors: how to work on the code
   - Self-hosters: how to deploy and customize

7. Add to docs/architecture/

The goal: new contributors should understand the system quickly.`,
  },
  {
    id: 'document-ai-tools',
    title: 'Document All AI Tools',
    category: 'Documentation',
    priority: 'P1',
    tags: ['docs', 'ai', 'reference'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me document all 28 AI tools.

1. List all tools in src/ai/tools/:
   - Read each tool file
   - Understand inputs/outputs
   - Note what each tool does

2. Create docs/ai/tools.mdx covering:
   - Overview of the AI tool system
   - How tools are used by agents
   - How to add new tools

3. For each tool, document:
   - Name and description
   - Input parameters (with types)
   - Output format
   - Example usage
   - When it's used by agents

4. Tool categories:
   - Git operations tools
   - File system tools
   - AI generation tools
   - Search tools
   - Virtual filesystem tools

5. Show example interactions:
   - Agent decides to use tool
   - Tool input/output
   - How result affects next action

6. Document the tool registry:
   - How tools are registered
   - Tool configuration
   - Tool permissions

7. Include code examples for adding new tools

The goal: developers should understand and extend the AI tool system.`,
  },
  {
    id: 'database-docs',
    title: 'Add Database Schema Documentation',
    category: 'Documentation',
    priority: 'P1',
    tags: ['docs', 'database', 'reference'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me document the database schema.

1. Find all models:
   - src/db/models/ - all 37 model files
   - src/db/schema.ts - main schema
   - drizzle.config.ts - Drizzle configuration

2. Create docs/database/schema.mdx covering:
   - Overview of database design
   - Drizzle ORM usage
   - Migration strategy

3. Document each table:
   - Table name and purpose
   - All columns with types
   - Primary/foreign keys
   - Indexes
   - Relationships

4. Create ER diagram:
   - Visual representation
   - Show relationships
   - Group by domain (users, repos, issues, etc.)

5. Document key relationships:
   - User -> Repositories
   - Repository -> Pull Requests -> Comments
   - Organization -> Teams -> Members
   - etc.

6. Migration guide:
   - How migrations work
   - Creating new migrations
   - Running migrations
   - Rollback procedures

7. Query patterns:
   - Common query examples
   - Performance considerations
   - Index usage

The goal: understand the data model at a glance.`,
  },
  {
    id: 'api-docs',
    title: 'Create API Reference Documentation',
    category: 'Documentation',
    priority: 'P1',
    tags: ['docs', 'api', 'reference'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me create comprehensive API documentation.

1. Find all API routers:
   - src/api/trpc/ - all 35 tRPC routers
   - Document each procedure

2. Check existing API docs:
   - docs/api-reference/ folder
   - See what's already documented

3. For each router, document:
   - Router name and purpose
   - All procedures (queries and mutations)
   - Input types
   - Output types
   - Authentication requirements
   - Example requests/responses

4. API documentation format:
   ## repositoryRouter
   
   ### repository.list
   Get all repositories for the authenticated user.
   
   **Input:** { limit?: number, offset?: number }
   **Output:** Repository[]
   **Auth:** Required

5. Document authentication:
   - Token-based auth
   - Session auth
   - OAuth flows

6. Add to docs/api-reference/:
   - One file per router or domain
   - Update mint.json navigation

7. Include tRPC client usage examples

The goal: developers should be able to integrate with wit's API.`,
  },
  {
    id: 'ci-job-visualization',
    title: 'Implement CI Job Visualization',
    category: 'Platform',
    priority: 'P1',
    tags: ['ci-cd', 'frontend', 'visualization'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve CI job visualization.

1. Understand current implementation:
   - src/ci/ - CI system
   - apps/web/src/components/job-graph.tsx
   - src/db/models/workflowRuns.ts

2. Job graph visualization:
   - DAG (directed acyclic graph) layout
   - Job nodes with status colors
   - Dependency arrows
   - Real-time status updates

3. Job node display:
   - Job name
   - Status icon (pending, running, success, failed)
   - Duration
   - Click to expand details

4. Step details:
   - List steps within job
   - Step status and duration
   - Expandable log output
   - Error highlighting

5. Log viewer:
   - Full log output
   - ANSI color support
   - Search within logs
   - Download logs
   - Follow live output

6. Workflow run page:
   - Workflow summary
   - Job graph
   - Re-run button
   - Cancel button
   - Trigger info

7. CLI commands:
   - wit ci status run-id
   - wit ci logs run-id/job-name
   - wit ci watch run-id

8. Write tests and documentation

The goal: understand CI status at a glance with detailed drill-down.`,
  },
  {
    id: 'code-review-suggestions',
    title: 'Add Code Review Suggestions',
    category: 'Platform',
    priority: 'P1',
    tags: ['code-review', 'pr', 'collaboration'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me implement code suggestions in reviews.

1. Understand current implementation:
   - apps/web/src/components/suggestion-block.tsx
   - src/api/trpc/pullRequests.ts
   - PR comments system

2. Suggestion features:
   - Suggest specific code changes in review
   - Show diff preview
   - One-click apply
   - Batch apply all suggestions

3. Creating suggestions:
   - Select lines in diff view
   - Write replacement code
   - Preview the change
   - Submit as suggestion comment

4. Suggestion format:
   \`\`\`suggestion
   const newCode = "better code";
   \`\`\`

5. Applying suggestions:
   - "Apply suggestion" button
   - Creates commit with change
   - Attribution to suggester
   - Batch apply multiple

6. Web UI:
   - Suggestion block component
   - Apply button
   - Applied state indicator
   - Conflicts detection

7. CLI support:
   - wit pr review --suggest
   - wit pr apply-suggestion comment-id
   - wit pr apply-all-suggestions

8. AI suggestions:
   - AI-generated improvement suggestions
   - Explain why change is suggested
   - Confidence level

9. Write tests and documentation

The goal: reviewers can suggest exact changes, authors can apply with one click.`,
  },
  {
    id: 'conflict-resolution',
    title: 'Implement Conflict Resolution UI',
    category: 'Platform',
    priority: 'P1',
    tags: ['git', 'merge', 'ux'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the conflict resolution experience.

1. Understand current implementation:
   - src/ui/conflict-resolver.ts
   - apps/web/src/components/conflict-resolver.tsx
   - src/core/merge.ts

2. Conflict display:
   - Show base, ours, theirs versions
   - Highlight conflict markers
   - Side-by-side or three-way view

3. Resolution options:
   - Accept ours
   - Accept theirs
   - Accept both (in order)
   - Manual edit
   - AI suggestion

4. Web UI features:
   - Three-way merge view
   - Click to accept version
   - Inline editing
   - Preview resolved result
   - Mark as resolved

5. AI-powered resolution:
   - wit ai resolve
   - AI suggests merged version
   - Explain reasoning
   - Confidence indicator
   - Accept or modify

6. CLI improvements:
   - wit merge --continue
   - wit conflicts (list conflicts)
   - wit resolve file.ts --ours
   - wit resolve file.ts --ai

7. Batch resolution:
   - Resolve all with same strategy
   - Skip non-conflicting files
   - Progress indicator

8. Write tests and documentation

The goal: resolving conflicts should be intuitive with AI assistance.`,
  },
  {
    id: 'first-run-experience',
    title: 'Implement First-Run Experience',
    category: 'User Experience',
    priority: 'P1',
    tags: ['ux', 'onboarding', 'cli'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me create a great first-run experience.

1. First run detection:
   - Check if wit has been used before
   - Check for existing git config
   - Detect git experience level

2. Interactive setup:
   - wit init (first time)
   - Welcome message
   - Guided configuration

3. Setup steps:
   - User name and email
   - Default editor
   - AI provider (optional)
   - SSH key setup help
   - Show key features

4. Feature tour:
   - Highlight wit-specific features
   - Show example commands
   - Quick tips

5. Migration help:
   - Detect existing git repos
   - Import git config
   - Explain wit differences

6. Skip option:
   - wit init --skip-setup
   - Non-interactive mode
   - Reasonable defaults

7. Help after setup:
   - Suggest next commands
   - Link to documentation
   - Quick reference card

8. Write tests and documentation

The goal: new users should feel welcomed and productive immediately.`,
  },
  {
    id: 'undo-redo',
    title: 'Add Undo/Redo for All Operations',
    category: 'CLI',
    priority: 'P1',
    tags: ['git', 'ux', 'safety'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the undo/redo functionality.

1. Understand current implementation:
   - src/commands/undo.ts
   - Journal-based undo system

2. Operations to make undoable:
   - Commit (uncommit)
   - Merge (abort merge)
   - Rebase (abort rebase)
   - Branch delete (restore branch)
   - File changes (restore file)
   - Stage/unstage

3. Journal system:
   - Record each operation
   - Store state before/after
   - Chain of operations

4. Commands:
   - wit undo - undo last operation
   - wit undo --list - show undo history
   - wit undo --steps 3 - undo multiple
   - wit redo - redo last undo

5. Smart undo:
   - Show what will be undone
   - Confirm destructive undos
   - Handle conflicts on undo

6. Operation descriptions:
   - Clear messages: "Undo commit 'feat: add login'"
   - Show affected files
   - Time since operation

7. Safety:
   - Can't undo pushed commits (warn)
   - Undo undo (redo)
   - Clear undo history on cleanup

8. Write tests and documentation

The goal: mistakes should be easily reversible.`,
  },
  {
    id: 'branch-comparison',
    title: 'Add Branch Comparison View',
    category: 'Platform',
    priority: 'P1',
    tags: ['git', 'branches', 'ux'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me build a branch comparison feature.

1. Understand current implementation:
   - src/ui/branch-compare.ts
   - apps/web/src/routes/

2. Compare features:
   - Show commits between branches
   - Show file diff summary
   - Ahead/behind counts

3. CLI command: wit compare
   - wit compare main...feature
   - wit compare --stat
   - wit compare --commits

4. Web UI:
   - Branch selector (base and compare)
   - Commits list between
   - Files changed summary
   - Link to full diff

5. Display:
   - "feature is 5 commits ahead, 2 behind main"
   - List of unique commits
   - Changed files with stats

6. Actions:
   - Create PR button
   - Merge button (if fast-forward)
   - Rebase button

7. Visual:
   - Branch graph showing divergence
   - Commit timeline
   - File change indicators

8. Write tests and documentation

The goal: understand differences between branches at a glance.`,
  },
  {
    id: 'repository-forking',
    title: 'Implement Repository Forking',
    category: 'Platform',
    priority: 'P1',
    tags: ['git', 'collaboration', 'repos'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve repository forking.

1. Understand current implementation:
   - Check if fork exists in API
   - src/api/trpc/repositories.ts

2. Fork workflow:
   - Fork button on repo page
   - Choose destination (user/org)
   - Clone fork locally
   - Set up upstream remote

3. CLI commands:
   - wit fork owner/repo
   - wit fork owner/repo --clone
   - wit fork owner/repo --org myorg

4. Fork management:
   - List forks of a repo
   - Sync fork with upstream
   - Show fork network

5. Sync with upstream:
   - wit sync (fetch + merge upstream)
   - wit sync --rebase
   - Show sync status

6. Web UI:
   - Fork button
   - Fork dialog with options
   - Fork indicator on repo page
   - Upstream link

7. Pull request from fork:
   - Create PR to upstream
   - Show fork in PR

8. Write tests and documentation

The goal: fork workflow should be seamless.`,
  },
  // P2 - Medium Priority (AI Features)
  {
    id: 'hybrid-search',
    title: 'Implement Hybrid Search (Keyword + Semantic)',
    category: 'AI',
    priority: 'P2',
    tags: ['ai', 'search', 'advanced'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me implement hybrid search that combines keyword matching with semantic understanding.

1. Understand current search implementations:
   - src/search/semantic.ts - vector/embedding based search
   - Look for any existing keyword search
   - Check how results are ranked

2. Design hybrid search:
   - Keyword search: fast, exact matches, good for function names
   - Semantic search: understands intent, finds related code
   - Combine: use keyword for precision, semantic for recall

3. Implementation approach:
   - Run both searches in parallel
   - Merge results with weighted scoring
   - Keyword matches get boost (exact match = high confidence)
   - Semantic matches fill in conceptual gaps
   - Remove duplicates, keep highest score

4. Scoring algorithm:
   score = (keyword_score * 0.6) + (semantic_score * 0.4)
   - Adjust weights based on query type
   - Short queries favor keyword
   - Question-style queries favor semantic

5. Update wit search command:
   - Add --mode flag: keyword, semantic, hybrid (default)
   - Show which type of match for each result
   - Improve result formatting

6. Test with queries like:
   - "getUserById" (keyword should win)
   - "how do we authenticate users" (semantic should win)
   - "auth middleware" (hybrid should combine both)

The goal: search should find what you're looking for regardless of how you phrase it.`,
  },
  {
    id: 'explain-code-tool',
    title: 'Add Code Explanation AI Tool',
    category: 'AI',
    priority: 'P2',
    tags: ['ai', 'tools', 'documentation'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me add an AI tool that explains code to users.

1. Study existing AI tools:
   - Look at src/ai/tools/ for patterns
   - Check src/ai/agent.ts for tool registration
   - Understand the Mastra integration in src/ai/services/

2. Create the explainCode tool:
   - Input: file path, optional line range, optional question
   - Output: clear explanation of what the code does

3. Tool implementation (src/ai/tools/explain-code.ts):
   - Read the specified file/lines
   - Include surrounding context for understanding
   - Use AI to generate explanation
   - Support different detail levels (brief, detailed, eli5)

4. Add CLI command: wit explain
   - wit explain src/core/merge.ts
   - wit explain src/core/merge.ts:45-89
   - wit explain src/core/merge.ts --question "why do we use recursion here?"
   - wit explain --diff HEAD~1 (explain recent changes)

5. Features to include:
   - Explain function purpose
   - Describe parameters and return values
   - Note any side effects
   - Mention related code
   - Suggest improvements if asked

6. Write tests for the tool

7. Add documentation in docs/commands/explain.mdx

The goal: any developer should be able to quickly understand unfamiliar code.`,
  },
  {
    id: 'test-generation-tool',
    title: 'Add Test Generation AI Tool',
    category: 'AI',
    priority: 'P2',
    tags: ['ai', 'testing', 'automation'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me add an AI tool that generates tests for functions.

1. Study the codebase:
   - Look at existing tests in src/__tests__/
   - Understand the vitest patterns used
   - Check src/ai/tools/ for tool patterns

2. Create generateTests tool (src/ai/tools/generate-tests.ts):
   - Input: file path or function name
   - Output: complete test file with multiple test cases

3. Test generation should:
   - Analyze the function signature and types
   - Understand the function's purpose from code + comments
   - Generate tests for:
     * Happy path (normal usage)
     * Edge cases (empty, null, boundary values)
     * Error cases (invalid input)
     * Type checking (if TypeScript)

4. Add CLI command: wit ai test
   - wit ai test src/core/refs.ts
   - wit ai test src/core/refs.ts --function resolveRef
   - wit ai test src/core/refs.ts --output src/__tests__/refs.test.ts
   - wit ai test --coverage (generate tests for uncovered code)

5. Output format:
   - Follow existing test conventions
   - Include clear test descriptions
   - Add setup/teardown if needed
   - Generate mocks for dependencies

6. Write tests for the test generator (meta!)

7. Add documentation in docs/commands/ai.mdx

The goal: developers can quickly generate a solid test foundation for any code.`,
  },
  {
    id: 'refactor-suggestions-tool',
    title: 'Add Refactoring Suggestions AI Tool',
    category: 'AI',
    priority: 'P2',
    tags: ['ai', 'refactoring', 'code-quality'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me add an AI tool that suggests code refactoring improvements.

1. Study existing tools in src/ai/tools/

2. Create refactor tool (src/ai/tools/refactor.ts):
   - Input: file path or code selection
   - Output: refactoring suggestions with explanations

3. Refactoring categories to detect:
   - Extract function (long functions)
   - Extract variable (repeated expressions)
   - Simplify conditionals (nested if/else)
   - Remove duplication (similar code blocks)
   - Improve naming (unclear variable/function names)
   - Add types (missing TypeScript types)
   - Performance (inefficient patterns)

4. Add CLI command: wit ai refactor
   - wit ai refactor src/core/merge.ts
   - wit ai refactor src/core/merge.ts --apply (auto-apply safe changes)
   - wit ai refactor --type extract-function src/core/merge.ts:45-89
   - wit ai refactor --explain (show why each suggestion helps)

5. For each suggestion provide:
   - What to change
   - Why it improves the code
   - Before/after code snippets
   - Confidence level (safe to auto-apply?)

6. Safety features:
   - Never auto-apply risky changes
   - Show diff before applying
   - Run tests after applying

7. Write tests and documentation

The goal: help developers continuously improve code quality with AI assistance.`,
  },
  // P2 - Platform Features
  {
    id: 'issue-templates',
    title: 'Add Issue Templates and Automation',
    category: 'Platform',
    priority: 'P2',
    tags: ['issues', 'automation', 'templates'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me add issue templates and automation features.

1. Understand current issue system:
   - src/commands/issue.ts
   - src/db/models/issues.ts, issueTemplates.ts
   - src/api/trpc/issues.ts

2. Implement issue templates:
   - Bug report template
   - Feature request template
   - Question/support template
   - Custom templates per repo

3. Template structure:
   - Title prefix (e.g., "[Bug]", "[Feature]")
   - Pre-filled sections with prompts
   - Required fields
   - Auto-labels based on template

4. Add CLI support:
   - wit issue create --template bug
   - wit issue templates list
   - wit issue templates create
   - Interactive mode fills template fields

5. Automation features:
   - Auto-assign based on labels/paths
   - Auto-label based on content (AI)
   - Auto-triage with priority (AI)
   - Auto-link related issues
   - Auto-close stale issues

6. Triage agent improvements:
   - Check src/ai/agents/triage.ts
   - Improve categorization accuracy
   - Add confidence scores
   - Support custom triage rules

7. Web UI:
   - Template selector when creating issue
   - Preview before submit
   - Template management in settings

8. Write tests and documentation

The goal: issues should be well-structured and automatically organized.`,
  },
  {
    id: 'repo-statistics',
    title: 'Add Repository Statistics Dashboard',
    category: 'Platform',
    priority: 'P2',
    tags: ['analytics', 'visualization', 'dashboard'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me build a comprehensive repository statistics dashboard.

1. Understand current stats:
   - src/commands/stats.ts
   - src/commands/wrapped.ts (Spotify Wrapped-style)
   - src/api/trpc/dashboard.ts

2. Statistics to track and display:
   - Commit frequency (daily, weekly, monthly)
   - Top contributors
   - Code churn (lines added/removed)
   - File hotspots (most changed files)
   - PR metrics (time to merge, review time)
   - Issue metrics (time to close, label distribution)
   - Branch statistics

3. CLI dashboard: wit stats
   - wit stats --period 30d
   - wit stats --contributor username
   - wit stats --file src/core/
   - wit stats --format json (for scripting)

4. Visualizations (CLI):
   - Commit activity graph (like GitHub's)
   - Contributor bar chart
   - Language breakdown
   - ASCII charts for terminal

5. Web dashboard (apps/web):
   - Interactive charts (use existing chart library)
   - Time period selector
   - Drill-down into details
   - Export to PNG/PDF

6. "Wrapped" improvements:
   - More interesting insights
   - Shareable cards
   - Team wrapped (not just individual)
   - Custom time periods

7. Add caching for expensive queries

8. Write tests and documentation

The goal: understand your repository's health and activity at a glance.`,
  },
  {
    id: 'release-management',
    title: 'Implement Release Management',
    category: 'Platform',
    priority: 'P2',
    tags: ['releases', 'versioning', 'automation'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve release management features.

1. Understand current implementation:
   - src/commands/release.ts
   - src/db/models/releases.ts
   - src/api/trpc/releases.ts

2. CLI improvements:
   - wit release create v1.0.0
   - wit release create --auto (auto version bump)
   - wit release list
   - wit release notes v1.0.0 (show release notes)
   - wit release delete v1.0.0

3. Release creation workflow:
   - Select target (branch or commit)
   - Version number (semver validation)
   - Release title
   - Release notes (markdown)
   - Pre-release flag
   - Draft mode

4. Auto-generated release notes:
   - List commits since last release
   - Group by conventional commit type
   - Highlight breaking changes
   - Contributors list
   - AI-enhanced summaries

5. Release assets:
   - Upload binaries/artifacts
   - Generate checksums
   - Asset management UI
   - Download counts

6. Web UI:
   - Releases page
   - Create release form
   - Edit/delete releases
   - Markdown preview
   - Asset upload

7. Notifications:
   - Notify watchers on new release
   - RSS feed for releases

8. Write tests and documentation

The goal: creating releases should be easy with auto-generated, informative notes.`,
  },
  {
    id: 'organization-management',
    title: 'Add Organization Management',
    category: 'Platform',
    priority: 'P2',
    tags: ['orgs', 'teams', 'access-control'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve organization management.

1. Understand current implementation:
   - src/db/models/organizations.ts
   - src/db/models/teams.ts
   - src/api/trpc/organizations.ts

2. Organization features:
   - Create organization
   - Invite members
   - Member roles (owner, admin, member)
   - Remove members
   - Transfer ownership

3. Teams:
   - Create teams within org
   - Add/remove team members
   - Team permissions
   - Nested teams (optional)
   - @org/team-name mentions

4. Repository access:
   - Org-wide repositories
   - Team-based access
   - Per-repo permissions
   - Default permissions for new repos

5. CLI commands:
   - wit org create myorg
   - wit org invite user@email.com
   - wit org members
   - wit org teams
   - wit org team create backend-team

6. Web UI:
   - Organization settings page
   - Members list with roles
   - Teams management
   - Repository access matrix
   - Billing (placeholder)

7. SSO (future prep):
   - SAML placeholder
   - OAuth app management
   - Audit log

8. Write tests and documentation

The goal: teams should be able to collaborate with proper access control.`,
  },
  {
    id: 'project-boards',
    title: 'Implement Project Boards',
    category: 'Platform',
    priority: 'P2',
    tags: ['projects', 'kanban', 'planning'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve project board functionality.

1. Understand current implementation:
   - src/commands/project.ts
   - src/db/models/projects.ts
   - src/api/trpc/projects.ts

2. Project board types:
   - Kanban board (columns)
   - Table view
   - Calendar view
   - Timeline/Gantt view

3. Board features:
   - Custom columns (Todo, In Progress, Done, etc.)
   - Drag and drop cards
   - Card filters and search
   - Card grouping
   - Swimlanes

4. Card content:
   - Link to issues
   - Link to PRs
   - Custom fields
   - Labels
   - Assignees
   - Due dates
   - Priority

5. CLI commands:
   - wit project create "Q1 Sprint"
   - wit project list
   - wit project add-issue 123
   - wit project move 123 --column "In Progress"
   - wit project view (TUI board)

6. Automation:
   - Auto-move on PR merge
   - Auto-move on issue close
   - Auto-add based on labels
   - Custom automation rules

7. Web UI:
   - Kanban board component
   - Drag and drop interface
   - Column management
   - Filters sidebar
   - Board settings

8. Write tests and documentation

The goal: manage work visually with automated project tracking.`,
  },
  {
    id: 'cycle-management',
    title: 'Add Cycle/Sprint Management',
    category: 'Platform',
    priority: 'P2',
    tags: ['sprints', 'cycles', 'planning'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve cycle (sprint) management.

1. Understand current implementation:
   - src/commands/cycle.ts
   - src/db/models/cycles.ts
   - src/api/trpc/cycles.ts

2. Cycle features:
   - Create cycles with dates
   - Add issues to cycles
   - Cycle progress tracking
   - Cycle history

3. CLI commands:
   - wit cycle create "Sprint 23" --start 2024-01-01 --end 2024-01-14
   - wit cycle list
   - wit cycle current
   - wit cycle add 123 (add issue)
   - wit cycle stats

4. Cycle planning:
   - Capacity planning
   - Point estimation
   - Carryover from previous cycle
   - Velocity tracking

5. Cycle views:
   - Issues in cycle
   - Progress (% complete)
   - Burndown chart
   - Remaining work

6. Web UI:
   - Cycle management page
   - Cycle selector
   - Progress visualization
   - Burndown/burnup charts
   - Cycle retrospective template

7. Automation:
   - Auto-close cycle on end date
   - Move incomplete items to next cycle
   - Cycle start/end notifications

8. Write tests and documentation

The goal: plan and track work in time-boxed cycles with visibility.`,
  },
  {
    id: 'journal-docs',
    title: 'Implement Journal/Documentation System',
    category: 'Platform',
    priority: 'P2',
    tags: ['docs', 'wiki', 'collaboration'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the journal (Notion-like documentation) feature.

1. Understand current implementation:
   - src/commands/journal.ts
   - src/db/models/journalPages.ts
   - src/api/trpc/journal.ts

2. Journal features:
   - Create pages with rich text
   - Nested pages (hierarchy)
   - Page templates
   - Full-text search
   - Page history

3. Editor features:
   - Markdown support
   - Rich text formatting
   - Code blocks with syntax highlighting
   - Images and embeds
   - Tables
   - Checklists
   - Callouts/admonitions

4. CLI commands:
   - wit journal new "Meeting Notes"
   - wit journal list
   - wit journal view page-id
   - wit journal edit page-id
   - wit journal search "keyword"

5. Organization:
   - Folders/categories
   - Tags
   - Favorites/pinned pages
   - Recent pages
   - Breadcrumb navigation

6. Collaboration:
   - Page comments
   - Mentioned users
   - Page sharing
   - View history

7. Web UI:
   - WYSIWYG editor
   - Page tree sidebar
   - Search with preview
   - Version history viewer

8. Write tests and documentation

The goal: documentation should live alongside code, not in a separate tool.`,
  },
  // Continue with more prompts...
  {
    id: 'activity-feed',
    title: 'Add Activity Feed',
    category: 'Platform',
    priority: 'P2',
    tags: ['activity', 'feed', 'social'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me improve the activity feed.

1. Understand current implementation:
   - src/db/models/activities.ts
   - src/api/trpc/activity.ts
   - src/events/ - event system

2. Activity types to track:
   - Commits pushed
   - Branches created/deleted
   - PRs opened/merged/closed
   - Issues created/closed
   - Comments added
   - Reviews submitted
   - Releases published
   - Stars/forks

3. Feed views:
   - Repository activity
   - User activity
   - Organization activity
   - Following feed (people you follow)

4. CLI command: wit activity
   - wit activity - recent repo activity
   - wit activity --user alice
   - wit activity --repo org/project
   - wit activity --type pr,issue

5. Web UI:
   - Activity feed on dashboard
   - Activity tab on repo page
   - Activity tab on user profile
   - Infinite scroll loading
   - Filter by type

6. Feed item display:
   - User avatar
   - Action description
   - Timestamp (relative)
   - Link to relevant page
   - Preview/context where helpful

7. Real-time updates:
   - New activities appear live
   - "New activity" indicator
   - WebSocket integration

8. Write tests and documentation

The goal: stay informed about what's happening in your projects.`,
  },
  // Add more P2 and P3 items following the same pattern...
  {
    id: 'git-achievements',
    title: 'Add Git Achievements/Gamification',
    category: 'Fun',
    priority: 'P3',
    tags: ['gamification', 'fun', 'engagement'],
    prompt: `I'm contributing to wit, an AI-native Git platform. Please help me add a fun achievements system.

1. Achievement ideas:
   - First Commit: Make your first commit
   - Early Bird: Commit before 7am
   - Night Owl: Commit after midnight
   - Streak: 7 days of commits
   - Century: 100 commits in a repo
   - Bug Hunter: Close 10 issues
   - Reviewer: Review 10 PRs
   - Merge Master: Merge 50 PRs
   - Documentation Hero: Commit to docs/
   - Test Champion: Add test files

2. Command: wit achievements
   - Show earned achievements
   - Show progress on locked ones
   - Display achievement badges

3. Achievement storage:
   - Local achievements file
   - Sync with wit server
   - Profile display

4. Triggers:
   - On commit, check achievements
   - On PR merge, check achievements
   - On issue close, check achievements

5. Display:
   - Achievement unlocked notification
   - Badge in wit wrapped
   - Profile achievement showcase

6. Fun stats:
   - Total achievements earned
   - Rarest achievement
   - Leaderboard (optional)

7. Write tests (and have fun!)

The goal: make using wit delightful with small rewards.`,
  },
];

// Category definitions
const CATEGORIES = [
  { id: 'all', label: 'All Tasks', icon: Sparkles, color: 'text-primary' },
  { id: 'Documentation', label: 'Documentation', icon: BookOpen, color: 'text-blue-500' },
  { id: 'Testing', label: 'Testing', icon: TestTube, color: 'text-green-500' },
  { id: 'AI', label: 'AI Features', icon: Bot, color: 'text-purple-500' },
  { id: 'CLI', label: 'CLI', icon: Terminal, color: 'text-orange-500' },
  { id: 'Platform', label: 'Platform', icon: Server, color: 'text-cyan-500' },
  { id: 'Web UI', label: 'Web UI', icon: Layout, color: 'text-pink-500' },
  { id: 'Infrastructure', label: 'Infrastructure', icon: Server, color: 'text-yellow-500' },
  { id: 'User Experience', label: 'User Experience', icon: Zap, color: 'text-amber-500' },
  { id: 'Marketing', label: 'Marketing', icon: Rocket, color: 'text-red-500' },
  { id: 'Security', label: 'Security', icon: Shield, color: 'text-rose-500' },
  { id: 'Fun', label: 'Fun', icon: Gamepad2, color: 'text-violet-500' },
];

const PRIORITY_COLORS = {
  P0: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/30', label: 'Critical' },
  P1: { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500/30', label: 'High' },
  P2: { bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/30', label: 'Medium' },
  P3: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30', label: 'Low' },
};

function ContributeSkeleton() {
  return (
    <div className="container max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function ContributePage() {
  const [activeTab, setActiveTab] = useState<'wit' | 'repos'>('wit');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['all']));
  const [labelFilter, setLabelFilter] = useState<LabelFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>();

  const { data: summary, isLoading: summaryLoading } = trpc.issues.contributionSummary.useQuery();
  const { data: issues, isLoading: issuesLoading } = trpc.issues.listContributionIssues.useQuery({
    labelFilter,
    priority: priorityFilter as any,
    limit: 50,
  });

  const isLoading = summaryLoading || issuesLoading;

  // Filter prompts based on search, category, and priority
  const filteredPrompts = useMemo(() => {
    return CONTRIBUTION_PROMPTS.filter((prompt) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch = 
          prompt.title.toLowerCase().includes(q) ||
          prompt.category.toLowerCase().includes(q) ||
          prompt.tags.some(tag => tag.toLowerCase().includes(q)) ||
          prompt.prompt.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      
      // Category filter
      if (selectedCategory !== 'all' && prompt.category !== selectedCategory) {
        return false;
      }
      
      // Priority filter
      if (selectedPriority && prompt.priority !== selectedPriority) {
        return false;
      }
      
      return true;
    });
  }, [searchQuery, selectedCategory, selectedPriority]);

  // Group prompts by category for display
  const groupedPrompts = useMemo(() => {
    const groups: Record<string, ContributionPrompt[]> = {};
    filteredPrompts.forEach((prompt) => {
      if (!groups[prompt.category]) {
        groups[prompt.category] = [];
      }
      groups[prompt.category].push(prompt);
    });
    return groups;
  }, [filteredPrompts]);

  // Count prompts by priority
  const priorityCounts = useMemo(() => {
    const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
    CONTRIBUTION_PROMPTS.forEach((p) => {
      counts[p.priority]++;
    });
    return counts;
  }, []);

  // Count prompts by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: CONTRIBUTION_PROMPTS.length };
    CONTRIBUTION_PROMPTS.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, []);

  // Filter issues by search query
  const filteredIssues = issues?.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.issue.title.toLowerCase().includes(q) ||
      item.repo.name.toLowerCase().includes(q) ||
      `#${item.issue.number}`.includes(q)
    );
  });

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedPriority(null);
  };

  if (isLoading) {
    return <ContributeSkeleton />;
  }

  return (
    <div className="container max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20">
            <Heart className="h-8 w-8 text-pink-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Contribute to Wit</h1>
            <p className="text-muted-foreground">
              {CONTRIBUTION_PROMPTS.length} actionable tasks ready for AI-powered contributions
            </p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'wit' | 'repos')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="wit" className="gap-2">
            <Rocket className="h-4 w-4" />
            Contribute to Wit
          </TabsTrigger>
          <TabsTrigger value="repos" className="gap-2">
            <HandHeart className="h-4 w-4" />
            Help Repositories
          </TabsTrigger>
        </TabsList>

        {/* Contribute to Wit Tab */}
        <TabsContent value="wit" className="mt-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar */}
            <div className="lg:w-64 flex-shrink-0 space-y-4">
              {/* Priority Stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">By Priority</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(['P0', 'P1', 'P2', 'P3'] as const).map((priority) => (
                    <button
                      key={priority}
                      onClick={() => setSelectedPriority(selectedPriority === priority ? null : priority)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors',
                        selectedPriority === priority
                          ? PRIORITY_COLORS[priority].bg + ' ' + PRIORITY_COLORS[priority].text
                          : 'hover:bg-muted'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn('font-medium', PRIORITY_COLORS[priority].text)}>{priority}</span>
                        <span className="text-muted-foreground">{PRIORITY_COLORS[priority].label}</span>
                      </span>
                      <Badge variant="secondary" className="text-xs">{priorityCounts[priority]}</Badge>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Categories */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Categories</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    const count = categoryCounts[category.id] || 0;
                    if (count === 0 && category.id !== 'all') return null;
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors',
                          selectedCategory === category.id
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted'
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className={cn('h-4 w-4', category.color)} />
                          <span>{category.label}</span>
                        </span>
                        <Badge variant="secondary" className="text-xs">{count}</Badge>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card className="bg-gradient-to-br from-primary/5 to-purple-500/5">
                <CardContent className="p-4 space-y-3">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">{CONTRIBUTION_PROMPTS.length}</div>
                    <div className="text-xs text-muted-foreground">Total Tasks</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div>
                      <div className="text-lg font-semibold">72+</div>
                      <div className="text-xs text-muted-foreground">CLI Commands</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold">28</div>
                      <div className="text-xs text-muted-foreground">AI Tools</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content */}
            <div className="flex-1 space-y-4">
              {/* Search and Filters Bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tasks, categories, or tags..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {(searchQuery || selectedCategory !== 'all' || selectedPriority) && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                    <X className="h-4 w-4" />
                    Clear filters
                  </Button>
                )}
              </div>

              {/* Active Filters */}
              {(selectedCategory !== 'all' || selectedPriority) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Filters:</span>
                  {selectedCategory !== 'all' && (
                    <Badge variant="secondary" className="gap-1">
                      {selectedCategory}
                      <button onClick={() => setSelectedCategory('all')}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {selectedPriority && (
                    <Badge 
                      variant="secondary" 
                      className={cn('gap-1', PRIORITY_COLORS[selectedPriority as keyof typeof PRIORITY_COLORS].text)}
                    >
                      {selectedPriority}
                      <button onClick={() => setSelectedPriority(null)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              )}

              {/* Results Count */}
              <div className="text-sm text-muted-foreground">
                Showing {filteredPrompts.length} of {CONTRIBUTION_PROMPTS.length} tasks
              </div>

              {/* Prompts List */}
              {filteredPrompts.length === 0 ? (
                <Card className="p-12 text-center">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No tasks found</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your search or filters
                  </p>
                  <Button variant="outline" onClick={clearFilters}>
                    Clear all filters
                  </Button>
                </Card>
              ) : selectedCategory === 'all' ? (
                // Grouped by category view
                <div className="space-y-4">
                  {Object.entries(groupedPrompts).map(([category, prompts]) => (
                    <Collapsible 
                      key={category} 
                      open={expandedCategories.has(category) || expandedCategories.has('all')}
                      onOpenChange={() => toggleCategory(category)}
                    >
                      <Card>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base flex items-center gap-2">
                                {expandedCategories.has(category) || expandedCategories.has('all') ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                                {CATEGORIES.find(c => c.id === category)?.label || category}
                                <Badge variant="secondary">{prompts.length}</Badge>
                              </CardTitle>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-3">
                            {prompts.map((prompt) => (
                              <CopyablePrompt key={prompt.id} prompt={prompt} />
                            ))}
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  ))}
                </div>
              ) : (
                // Flat list view for single category
                <div className="space-y-3">
                  {filteredPrompts.map((prompt) => (
                    <CopyablePrompt key={prompt.id} prompt={prompt} />
                  ))}
                </div>
              )}

              {/* How It Works */}
              <Card className="bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-cyan-500/5 border-emerald-500/20">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-5 w-5 text-emerald-500" />
                    How AI-Powered Contributing Works
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold">1</div>
                      <div>
                        <div className="font-medium">Copy a Prompt</div>
                        <div className="text-sm text-muted-foreground">Find a task and click "Copy Prompt"</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold">2</div>
                      <div>
                        <div className="font-medium">Paste into AI Agent</div>
                        <div className="text-sm text-muted-foreground">Use Claude, Cursor, Copilot, etc.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold">3</div>
                      <div>
                        <div className="font-medium">Open a PR</div>
                        <div className="text-sm text-muted-foreground">Submit your contribution!</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* CTA */}
              <Card className="bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="p-3 rounded-full bg-primary/10">
                      <GitFork className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <h3 className="text-lg font-semibold">Ready to contribute?</h3>
                      <p className="text-muted-foreground text-sm">
                        Fork the repository and start building!
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <a 
                        href="https://github.com/abhiaiyer91/wit" 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        <Button className="gap-2">
                          <Github className="h-4 w-4" />
                          View on GitHub
                        </Button>
                      </a>
                      <a 
                        href="https://github.com/abhiaiyer91/wit/blob/main/CONTRIBUTING.md" 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" className="gap-2">
                          <FileText className="h-4 w-4" />
                          Guide
                        </Button>
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Help Repositories Tab */}
        <TabsContent value="repos" className="mt-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setLabelFilter('all')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{summary?.total ?? 0}</div>
                    <div className="text-sm text-muted-foreground">Total Open Tasks</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card 
              className={cn(
                "hover:border-green-500/50 transition-colors cursor-pointer",
                labelFilter === 'help-wanted' && "border-green-500/50 bg-green-500/5"
              )}
              onClick={() => setLabelFilter('help-wanted')}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <HandHeart className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{summary?.helpWanted ?? 0}</div>
                    <div className="text-sm text-muted-foreground">Help Wanted</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card 
              className={cn(
                "hover:border-purple-500/50 transition-colors cursor-pointer",
                labelFilter === 'good-first-issue' && "border-purple-500/50 bg-purple-500/5"
              )}
              onClick={() => setLabelFilter('good-first-issue')}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{summary?.goodFirstIssue ?? 0}</div>
                    <div className="text-sm text-muted-foreground">Good First Issues</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search issues..."
                className="pl-9 h-9 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Tabs value={labelFilter} onValueChange={(v) => setLabelFilter(v as LabelFilter)}>
                <TabsList>
                  <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
                  <TabsTrigger value="help-wanted" className="text-xs sm:text-sm">Help Wanted</TabsTrigger>
                  <TabsTrigger value="good-first-issue" className="text-xs sm:text-sm">Good First Issue</TabsTrigger>
                </TabsList>
              </Tabs>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Signal className="h-4 w-4" />
                    <span className="hidden sm:inline">Priority</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setPriorityFilter(undefined)}>
                    All Priorities
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPriorityFilter('urgent')}>
                    <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
                    Urgent
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter('high')}>
                    <Signal className="h-4 w-4 mr-2 text-orange-500" />
                    High
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter('medium')}>
                    <Signal className="h-4 w-4 mr-2 text-yellow-500" />
                    Medium
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter('low')}>
                    <Signal className="h-4 w-4 mr-2 text-blue-500" />
                    Low
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Issues List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDot className="h-5 w-5 text-green-500" />
                Open Tasks
              </CardTitle>
              <CardDescription>
                {filteredIssues?.length ?? 0} issue{(filteredIssues?.length ?? 0) !== 1 ? 's' : ''} available for contribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!filteredIssues || filteredIssues.length === 0 ? (
                <div className="text-center py-12">
                  <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No issues found</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {searchQuery
                      ? 'Try a different search term'
                      : 'No contribution-worthy issues are available right now. Check back later or create issues with "help wanted" or "good first issue" labels!'}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredIssues.map((item) => (
                    <IssueCard key={item.issue.id} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Copyable prompt component
interface CopyablePromptProps {
  prompt: ContributionPrompt;
}

function CopyablePrompt({ prompt }: CopyablePromptProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const priorityStyle = PRIORITY_COLORS[prompt.priority];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      'border rounded-lg p-4 transition-all',
      priorityStyle.border,
      expanded && 'bg-muted/30'
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge variant="secondary" className={cn('text-xs', priorityStyle.bg, priorityStyle.text)}>
              {prompt.priority}
            </Badge>
            <span className="font-medium">{prompt.title}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {prompt.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
            {prompt.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{prompt.tags.length - 3} more</span>
            )}
          </div>
          
          {expanded && (
            <div className="mt-4 p-3 rounded-md bg-background border">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono overflow-x-auto">
                {prompt.prompt}
              </pre>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
          >
            {expanded ? 'Hide' : 'Preview'}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface IssueCardProps {
  item: {
    issue: {
      id: string;
      number: number;
      title: string;
      body?: string | null;
      state: string;
      priority: string;
      createdAt: Date | string;
    };
    repo: {
      id: string;
      name: string;
      ownerUsername: string | null;
    };
    author: {
      id: string;
      name: string;
      username: string | null;
      avatarUrl: string | null;
    } | null;
    labels: Array<{ id: string; name: string; color: string }>;
  };
}

function IssueCard({ item }: IssueCardProps) {
  const { issue, repo, author, labels } = item;
  const priorityInfo = PRIORITY_CONFIG[issue.priority || 'none'];
  const repoPath = repo.ownerUsername ? `/${repo.ownerUsername}/${repo.name}` : '#';
  const issuePath = repo.ownerUsername 
    ? `/${repo.ownerUsername}/${repo.name}/issues/${issue.number}` 
    : '#';

  return (
    <div className="py-4 hover:bg-muted/30 transition-colors -mx-6 px-6">
      <div className="flex items-start gap-4">
        {/* Priority indicator */}
        <div className={cn('flex-shrink-0 mt-1', priorityInfo.color)} title={priorityInfo.label}>
          {priorityInfo.icon}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Repository */}
          <Link
            to={repoPath}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            {repo.ownerUsername}/{repo.name}
          </Link>

          {/* Title */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={issuePath}
              className="font-medium text-foreground hover:text-primary transition-colors"
            >
              {issue.title}
            </Link>
          </div>

          {/* Labels */}
          <div className="flex items-center gap-2 flex-wrap">
            {labels.map((label) => (
              <Badge
                key={label.id}
                variant="secondary"
                className="text-xs font-normal px-2 py-0"
                style={{
                  backgroundColor: `#${label.color}20`,
                  color: `#${label.color}`,
                  borderColor: `#${label.color}40`,
                }}
              >
                <Tag className="h-3 w-3 mr-1" />
                {label.name}
              </Badge>
            ))}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">#{issue.number}</span>
            <span className="text-muted-foreground/50">-</span>
            <span>opened {formatRelativeTime(issue.createdAt)}</span>
            {author?.username && (
              <>
                <span className="text-muted-foreground/50">by</span>
                <Link
                  to={`/${author.username}`}
                  className="hover:text-foreground transition-colors flex items-center gap-1"
                >
                  {author.avatarUrl && (
                    <img
                      src={author.avatarUrl}
                      alt={author.username}
                      className="h-4 w-4 rounded-full"
                    />
                  )}
                  {author.username}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Action */}
        <Link to={issuePath} className="flex-shrink-0">
          <Button variant="outline" size="sm">
            View Issue
          </Button>
        </Link>
      </div>
    </div>
  );
}
