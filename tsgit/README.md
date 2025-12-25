# wit

A modern Git implementation in TypeScript that fixes Git's most frustrating problems.

## Why wit?

Git is powerful but has well-known issues. wit addresses them:

| Problem | Git | wit |
|---------|-----|-------|
| Security | SHA-1 (broken) | SHA-256 default |
| Large files | Needs LFS | Built-in chunking |
| Undo mistakes | Reflog is cryptic | Simple `wit undo` |
| Branch switching | Loses uncommitted work | Auto-stash per branch |
| Merge conflicts | Inline markers | Structured JSON |
| Confusing commands | `checkout` does 5 things | Dedicated `switch`/`restore` |
| Error messages | Cryptic | Helpful with suggestions |
| Visual interface | External tools needed | Built-in TUI & Web UI |
| Quick saves | No built-in solution | `wit wip` auto-message |
| Fixing commits | `git commit --amend` verbose | Simple `wit amend` |
| Branch cleanup | Manual process | `wit cleanup` |
| Repository stats | External tools | Built-in `wit stats` |

## Installation

```bash
cd wit
npm install
npm run build
npm link   # Makes 'wit' available globally
```

## Quick Start

```bash
# Initialize a new repository
wit init

# Add files and commit
wit add .
wit commit -m "Initial commit"

# Or commit directly (skip staging)
wit commit -a -m "Update everything"

# Launch visual interface
wit web   # Opens web UI at http://localhost:3847
wit ui    # Terminal UI
```

## Commands

### Basic Workflow

```bash
wit init [path]           # Create new repository
wit add <files...>        # Stage files
wit add .                 # Stage all
wit commit -m "message"   # Commit staged changes
wit commit -a -m "msg"    # Stage tracked + commit
wit status                # Show status
wit log                   # Show history
wit log --oneline         # Compact history
wit diff                  # Show unstaged changes
wit diff --staged         # Show staged changes
```

### Branches

```bash
wit branch                # List branches
wit branch feature        # Create branch
wit branch -d feature     # Delete branch
wit switch main           # Switch to branch
wit switch -c feature     # Create and switch
wit checkout feature      # Switch (git-compatible)
```

### Undo & History

```bash
wit undo                  # Undo last operation
wit undo --steps 3        # Undo last 3 operations
wit history               # Show operation history
wit restore file.ts       # Restore file from index
wit restore --staged file # Unstage file
wit uncommit              # Undo commit, keep changes staged
wit uncommit 2            # Undo last 2 commits
```

### Quality of Life Commands

```bash
# Quick saves
wit wip                   # WIP commit with auto-generated message
wit wip -a                # Stage all tracked files + WIP commit
wit wip -a "fixing bug"   # WIP with custom suffix

# Fix last commit
wit amend -m "New message"  # Change commit message
wit amend                   # Add staged changes to last commit
wit amend -a                # Stage all + amend

# Fixup commits (for later squashing)
wit fixup HEAD~2          # Create fixup for 2 commits ago
wit fixup -l              # List recent commits

# Quick checkpoints
wit snapshot create       # Save current state
wit snapshot list         # List all snapshots
wit snapshot restore <id> # Restore a snapshot

# Branch cleanup
wit cleanup               # Find merged/stale branches
wit cleanup --dry-run     # Preview what would be deleted
wit cleanup --force       # Delete without confirmation

# Repository insights
wit stats                 # Show repository statistics
wit stats --all           # Detailed statistics
wit blame file.ts         # Show who changed each line
```

### Merge

```bash
wit merge feature         # Merge branch
wit merge --conflicts     # Show conflicts
wit merge --resolve file  # Mark as resolved
wit merge --continue      # Complete merge
wit merge --abort         # Abort merge
```

### Visual Interface

```bash
wit ui                    # Terminal UI
wit web                   # Web UI (http://localhost:3847)
wit web --port 8080       # Custom port
wit graph                 # ASCII commit graph
```

### Advanced Features

```bash
# Hooks - customize behavior at key points
wit hooks                       # List installed hooks
wit hooks install pre-commit    # Install a hook from template
wit hooks remove pre-commit     # Remove a hook
wit hooks run pre-commit        # Test a hook manually

# Submodules - nested repositories
wit submodule add <url> <path>  # Add a submodule
wit submodule init              # Initialize submodules
wit submodule update            # Update submodules
wit submodule status            # Show submodule status
wit submodule foreach <cmd>     # Run command in each

# Worktrees - multiple working directories
wit worktree add <path> <branch>  # Create new worktree
wit worktree list                 # List all worktrees
wit worktree remove <path>        # Remove a worktree
wit worktree prune                # Prune stale entries

# Reflog - reference history
wit reflog                    # Show HEAD reflog
wit reflog <ref>              # Show reflog for specific ref
wit reflog expire             # Prune old entries

# Garbage Collection
wit gc                        # Run garbage collection
wit gc --aggressive           # More aggressive optimization
wit gc --prune=now            # Prune immediately
```

### Monorepo Scopes

```bash
wit scope                 # Show current scope
wit scope set src/        # Limit to src/
wit scope use frontend    # Use preset (frontend/backend/docs)
wit scope clear           # Full repository
```

## Visual Interfaces

### Web UI (`wit web`)

Modern dashboard with:
- **Commit graph** - Visual branch history
- **Side-by-side diffs** - Syntax highlighted
- **File browser** - With status icons
- **Search** - Find commits, files, content
- **One-click staging** - Stage files instantly
- **Keyboard shortcuts** - Ctrl+P search, R refresh

### Terminal UI (`wit ui`)

Interactive terminal interface:
- Navigate with arrow keys
- `a` to stage files
- `c` to commit
- `s` to switch branches
- `Tab` between panels

### Terminal Graph (`wit graph`)

```
● a1b2c3d4 (main) Latest commit - Alice, today
● e5f6g7h8 Add feature - Bob, yesterday
● i9j0k1l2 Initial commit - Alice, last week
```

## Configuration

Repository config is stored in `.wit/config`:

```ini
[core]
    repositoryformatversion = 1
    filemode = true
[wit]
    hashAlgorithm = sha256
    largeFileThreshold = 2097152
    autoStashOnSwitch = true
```

## Programmatic Usage

```typescript
import { Repository } from 'wit';

// Initialize
const repo = Repository.init('/path/to/project');

// Add and commit
repo.add('file.ts');
const hash = repo.commit('Add file');

// Undo
repo.journal.popEntry();

// Search
import { SearchEngine } from 'wit';
const search = new SearchEngine(repo);
const results = search.search('TODO');
```

## Directory Structure

```
.wit/
├── HEAD              # Current branch reference
├── config            # Repository configuration
├── index             # Staging area (JSON)
├── objects/          # Content-addressable storage
│   ├── 2f/           # Object files by hash prefix
│   └── ...
├── refs/
│   ├── heads/        # Branch references
│   └── tags/         # Tag references
├── journal.json      # Operation history (for undo)
└── branch-states/    # Auto-stashed changes per branch
```

## Keyboard Shortcuts (Web UI)

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Focus search |
| `Ctrl+Enter` | Open commit dialog |
| `R` | Refresh |
| `Escape` | Close modal |

## Differences from Git

### What's Better

- **SHA-256** - Secure by default (Git still uses SHA-1)
- **Undo anything** - `wit undo` reverts any operation
- **Auto-stash** - Never lose work when switching branches
- **Built-in UI** - No external tools needed
- **Clear commands** - `switch` for branches, `restore` for files
- **Better errors** - Suggestions for typos and mistakes
- **Large files** - Chunked storage without LFS
- **Quick saves** - `wit wip` for instant WIP commits
- **Easy amend** - `wit amend` is simpler than `git commit --amend`
- **Branch cleanup** - `wit cleanup` finds and removes stale branches
- **Statistics** - `wit stats` shows repo insights
- **Snapshots** - Quick checkpoints without full commits
- **Smart blame** - Color-coded, with relative dates
- **Hooks** - Full hook system (pre-commit, post-commit, etc.)
- **Submodules** - Nested repository support
- **Worktrees** - Multiple working directories
- **Reflog** - Reference log with time-based recovery
- **GC** - Garbage collection with aggressive optimization

### What's Missing (Planned)

- Remote operations (push, pull, fetch, clone)
- Rebase
- Cherry-pick

## Examples

### Fix a Mistake

```bash
# Committed to wrong branch?
wit undo                  # Undo the commit
wit switch correct-branch
wit commit -m "Same message"
```

### Quick Context Switch

```bash
# Working on feature, need to fix bug
wit switch main           # Auto-saves your work
# ... fix bug ...
wit commit -a -m "Fix bug"
wit switch feature        # Auto-restores your work
```

### Search Repository

```bash
wit web                   # Open web UI
# Press Ctrl+P, type "TODO"
# See all commits, files, and code containing "TODO"
```

### Work on Monorepo Subset

```bash
wit scope use frontend    # Only frontend/
wit status                # Shows only frontend files
wit add .                 # Adds only frontend files
wit scope clear           # Back to full repo
```

### Quick WIP Workflow

```bash
# You're working and need to switch branches quickly
wit wip -a                # Quick save everything
wit switch other-branch   # Work on something else
# ... do other work ...
wit switch -              # Go back
wit uncommit              # Restore your WIP state
```

### Fix a Typo in Last Commit

```bash
# Made a typo in commit message?
wit amend -m "Fixed: correct message"

# Forgot to add a file?
wit add forgotten-file.ts
wit amend
```

### Clean Up Old Branches

```bash
# See what branches can be cleaned
wit cleanup --dry-run

# Clean up with confirmation
wit cleanup

# Clean up branches older than 60 days
wit cleanup --days 60 --stale
```

### Create Checkpoints

```bash
# Before doing something risky
wit snapshot create "before refactor"

# Do risky work...

# Something went wrong? Restore!
wit snapshot restore "before refactor"
```

### View Repository Stats

```bash
wit stats
# Shows:
#   - Total commits, files, lines
#   - Top contributors
#   - Language breakdown
#   - Activity patterns
```

### Work on Multiple Branches Simultaneously

```bash
# Create a worktree for feature development
wit worktree add ../feature-worktree feature-branch

# Now you can work on both branches at once
# Main worktree stays on main, feature worktree on feature-branch

# Clean up when done
wit worktree remove ../feature-worktree
```

### Set Up Pre-commit Hooks

```bash
# Install a pre-commit hook
wit hooks install pre-commit

# Edit the hook to run your linter
# The hook is at .wit/hooks/pre-commit

# Test it manually
wit hooks run pre-commit
```

### Recover from Mistakes with Reflog

```bash
# See your reference history
wit reflog

# Reference any previous state
# The reflog shows HEAD@{0}, HEAD@{1}, etc.
# You can use these with reset to recover
```

## License

MIT
