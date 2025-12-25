# tsgit

A modern Git implementation in TypeScript that fixes Git's most frustrating problems.

## Why tsgit?

Git is powerful but has well-known issues. tsgit addresses them:

| Problem | Git | tsgit |
|---------|-----|-------|
| Security | SHA-1 (broken) | SHA-256 default |
| Large files | Needs LFS | Built-in chunking |
| Undo mistakes | Reflog is cryptic | Simple `tsgit undo` |
| Branch switching | Loses uncommitted work | Auto-stash per branch |
| Merge conflicts | Inline markers | Structured JSON |
| Confusing commands | `checkout` does 5 things | Dedicated `switch`/`restore` |
| Error messages | Cryptic | Helpful with suggestions |
| Visual interface | External tools needed | Built-in TUI & Web UI |
| Quick saves | No built-in solution | `tsgit wip` auto-message |
| Fixing commits | `git commit --amend` verbose | Simple `tsgit amend` |
| Branch cleanup | Manual process | `tsgit cleanup` |
| Repository stats | External tools | Built-in `tsgit stats` |

## Installation

```bash
cd tsgit
npm install
npm run build
npm link   # Makes 'tsgit' available globally
```

## Quick Start

```bash
# Initialize a new repository
tsgit init

# Add files and commit
tsgit add .
tsgit commit -m "Initial commit"

# Or commit directly (skip staging)
tsgit commit -a -m "Update everything"

# Launch visual interface
tsgit web   # Opens web UI at http://localhost:3847
tsgit ui    # Terminal UI
```

## Commands

### Basic Workflow

```bash
tsgit init [path]           # Create new repository
tsgit add <files...>        # Stage files
tsgit add .                 # Stage all
tsgit commit -m "message"   # Commit staged changes
tsgit commit -a -m "msg"    # Stage tracked + commit
tsgit status                # Show status
tsgit log                   # Show history
tsgit log --oneline         # Compact history
tsgit diff                  # Show unstaged changes
tsgit diff --staged         # Show staged changes
```

### Branches

```bash
tsgit branch                # List branches
tsgit branch feature        # Create branch
tsgit branch -d feature     # Delete branch
tsgit switch main           # Switch to branch
tsgit switch -c feature     # Create and switch
tsgit checkout feature      # Switch (git-compatible)
```

### Undo & History

```bash
tsgit undo                  # Undo last operation
tsgit undo --steps 3        # Undo last 3 operations
tsgit history               # Show operation history
tsgit restore file.ts       # Restore file from index
tsgit restore --staged file # Unstage file
tsgit uncommit              # Undo commit, keep changes staged
tsgit uncommit 2            # Undo last 2 commits
```

### Quality of Life Commands

```bash
# Quick saves
tsgit wip                   # WIP commit with auto-generated message
tsgit wip -a                # Stage all tracked files + WIP commit
tsgit wip -a "fixing bug"   # WIP with custom suffix

# Fix last commit
tsgit amend -m "New message"  # Change commit message
tsgit amend                   # Add staged changes to last commit
tsgit amend -a                # Stage all + amend

# Fixup commits (for later squashing)
tsgit fixup HEAD~2          # Create fixup for 2 commits ago
tsgit fixup -l              # List recent commits

# Quick checkpoints
tsgit snapshot create       # Save current state
tsgit snapshot list         # List all snapshots
tsgit snapshot restore <id> # Restore a snapshot

# Branch cleanup
tsgit cleanup               # Find merged/stale branches
tsgit cleanup --dry-run     # Preview what would be deleted
tsgit cleanup --force       # Delete without confirmation

# Repository insights
tsgit stats                 # Show repository statistics
tsgit stats --all           # Detailed statistics
tsgit blame file.ts         # Show who changed each line
```

### Merge

```bash
tsgit merge feature         # Merge branch
tsgit merge --conflicts     # Show conflicts
tsgit merge --resolve file  # Mark as resolved
tsgit merge --continue      # Complete merge
tsgit merge --abort         # Abort merge
```

### Visual Interface

```bash
tsgit ui                    # Terminal UI
tsgit web                   # Web UI (http://localhost:3847)
tsgit web --port 8080       # Custom port
tsgit graph                 # ASCII commit graph
```

### Monorepo Scopes

```bash
tsgit scope                 # Show current scope
tsgit scope set src/        # Limit to src/
tsgit scope use frontend    # Use preset (frontend/backend/docs)
tsgit scope clear           # Full repository
```

## Visual Interfaces

### Web UI (`tsgit web`)

Modern dashboard with:
- **Commit graph** - Visual branch history
- **Side-by-side diffs** - Syntax highlighted
- **File browser** - With status icons
- **Search** - Find commits, files, content
- **One-click staging** - Stage files instantly
- **Keyboard shortcuts** - Ctrl+P search, R refresh

### Terminal UI (`tsgit ui`)

Interactive terminal interface:
- Navigate with arrow keys
- `a` to stage files
- `c` to commit
- `s` to switch branches
- `Tab` between panels

### Terminal Graph (`tsgit graph`)

```
● a1b2c3d4 (main) Latest commit - Alice, today
● e5f6g7h8 Add feature - Bob, yesterday
● i9j0k1l2 Initial commit - Alice, last week
```

## Configuration

Repository config is stored in `.tsgit/config`:

```ini
[core]
    repositoryformatversion = 1
    filemode = true
[tsgit]
    hashAlgorithm = sha256
    largeFileThreshold = 2097152
    autoStashOnSwitch = true
```

## Programmatic Usage

```typescript
import { Repository } from 'tsgit';

// Initialize
const repo = Repository.init('/path/to/project');

// Add and commit
repo.add('file.ts');
const hash = repo.commit('Add file');

// Undo
repo.journal.popEntry();

// Search
import { SearchEngine } from 'tsgit';
const search = new SearchEngine(repo);
const results = search.search('TODO');
```

## Directory Structure

```
.tsgit/
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
- **Undo anything** - `tsgit undo` reverts any operation
- **Auto-stash** - Never lose work when switching branches
- **Built-in UI** - No external tools needed
- **Clear commands** - `switch` for branches, `restore` for files
- **Better errors** - Suggestions for typos and mistakes
- **Large files** - Chunked storage without LFS
- **Quick saves** - `tsgit wip` for instant WIP commits
- **Easy amend** - `tsgit amend` is simpler than `git commit --amend`
- **Branch cleanup** - `tsgit cleanup` finds and removes stale branches
- **Statistics** - `tsgit stats` shows repo insights
- **Snapshots** - Quick checkpoints without full commits
- **Smart blame** - Color-coded, with relative dates

### What's Missing (Planned)

- Remote operations (push, pull, fetch, clone)
- Rebase
- Cherry-pick
- Stash command (auto-stash exists)
- Hooks
- Submodules

## Examples

### Fix a Mistake

```bash
# Committed to wrong branch?
tsgit undo                  # Undo the commit
tsgit switch correct-branch
tsgit commit -m "Same message"
```

### Quick Context Switch

```bash
# Working on feature, need to fix bug
tsgit switch main           # Auto-saves your work
# ... fix bug ...
tsgit commit -a -m "Fix bug"
tsgit switch feature        # Auto-restores your work
```

### Search Repository

```bash
tsgit web                   # Open web UI
# Press Ctrl+P, type "TODO"
# See all commits, files, and code containing "TODO"
```

### Work on Monorepo Subset

```bash
tsgit scope use frontend    # Only frontend/
tsgit status                # Shows only frontend files
tsgit add .                 # Adds only frontend files
tsgit scope clear           # Back to full repo
```

### Quick WIP Workflow

```bash
# You're working and need to switch branches quickly
tsgit wip -a                # Quick save everything
tsgit switch other-branch   # Work on something else
# ... do other work ...
tsgit switch -              # Go back
tsgit uncommit              # Restore your WIP state
```

### Fix a Typo in Last Commit

```bash
# Made a typo in commit message?
tsgit amend -m "Fixed: correct message"

# Forgot to add a file?
tsgit add forgotten-file.ts
tsgit amend
```

### Clean Up Old Branches

```bash
# See what branches can be cleaned
tsgit cleanup --dry-run

# Clean up with confirmation
tsgit cleanup

# Clean up branches older than 60 days
tsgit cleanup --days 60 --stale
```

### Create Checkpoints

```bash
# Before doing something risky
tsgit snapshot create "before refactor"

# Do risky work...

# Something went wrong? Restore!
tsgit snapshot restore "before refactor"
```

### View Repository Stats

```bash
tsgit stats
# Shows:
#   - Total commits, files, lines
#   - Top contributors
#   - Language breakdown
#   - Activity patterns
```

## License

MIT
