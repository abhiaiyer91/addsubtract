```
 __      __  ___  _____
 \ \    / / |_ _||_   _|
  \ \/\/ /   | |   | |
   \_/\_/   |___|  |_|
```

# wit

A modern Git implementation in TypeScript with AI-powered features.

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/nicholasgriffintn/wit)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen.svg)](https://nodejs.org)

## Why wit?

Git is powerful but has well-known usability issues. **wit** addresses them while adding modern features:

| Problem            | Git                          | wit                                         |
| ------------------ | ---------------------------- | ------------------------------------------- |
| GitHub Interop     | Native                       | Full compatibility                          |
| Large files        | Needs LFS                    | Built-in chunking                           |
| Undo mistakes      | Reflog is cryptic            | Simple `wit undo`                           |
| Branch switching   | Loses uncommitted work       | Auto-stash per branch                       |
| Merge conflicts    | Inline markers               | Structured JSON                             |
| Confusing commands | `checkout` does 5 things     | Dedicated `switch`/`restore`                |
| Error messages     | Cryptic                      | Helpful with suggestions                    |
| Visual interface   | External tools needed        | Built-in TUI & Web UI                       |
| Quick saves        | No built-in solution         | `wit wip` auto-message                      |
| Fixing commits     | `git commit --amend` verbose | Simple `wit amend`                          |
| Branch cleanup     | Manual process               | `wit cleanup`                               |
| AI assistance      | None                         | Built-in AI commit messages, review, & more |

## Features

- **🔐 SHA-256 Security** - Secure hashing by default (Git still uses SHA-1)
- **🤖 AI-Powered** - Commit messages, code review, conflict resolution via OpenAI/Anthropic
- **⏪ Undo Anything** - `wit undo` reverts any operation with full journal history
- **🎨 Built-in UI** - Web UI (`wit web`) and Terminal UI (`wit ui`) included
- **📁 Large File Support** - Chunked storage without LFS
- **🔀 Auto-stash** - Never lose work when switching branches
- **📦 Monorepo Scopes** - Work with repository subsets
- **🛠️ Quality of Life** - `wip`, `amend`, `uncommit`, `cleanup`, `stats`, `blame`, `snapshot`
- **🔧 Advanced Git** - Cherry-pick, rebase, revert, stash, tags, bisect, hooks, worktrees
- **🌐 Remote Support** - Clone, fetch, pull, push operations

## Installation

```bash
git clone https://github.com/nicholasgriffintn/wit.git
cd wit
npm install
npm run build
npm link   # Makes 'wit' available globally
```

**Requirements:** Node.js >= 22.13.0

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

### Core Workflow

```bash
wit init [path]           # Create new repository
wit add <files...>        # Stage files
wit commit -m "message"   # Commit staged changes
wit commit -a -m "msg"    # Stage tracked + commit
wit status                # Show status
wit log [--oneline]       # Show history
wit diff [--staged]       # Show changes
```

### Branches & Navigation

```bash
wit branch                # List branches
wit branch feature        # Create branch
wit branch -d feature     # Delete branch
wit switch main           # Switch to branch
wit switch -c feature     # Create and switch
wit checkout feature      # Switch (git-compatible)
wit restore file.ts       # Restore file from index
```

### Undo & History

```bash
wit undo                  # Undo last operation
wit undo --steps 3        # Undo last 3 operations
wit history               # Show operation history
wit uncommit              # Undo commit, keep changes staged
wit uncommit 2            # Undo last 2 commits
wit reset [--soft|--hard] # Reset HEAD to specific state
wit stash                 # Stash working directory changes
```

### Quality of Life

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

### Merge & Conflicts

```bash
wit merge feature         # Merge branch
wit merge --conflicts     # Show conflicts
wit merge --resolve file  # Mark as resolved
wit merge --continue      # Complete merge
wit merge --abort         # Abort merge
```

### History Rewriting

```bash
wit cherry-pick <commit>  # Apply changes from specific commits
wit rebase <branch>       # Rebase current branch onto another
wit rebase --onto <new>   # Rebase onto specific base
wit revert <commit>       # Create commit that undoes changes
```

### Remote Operations

```bash
wit remote                # List configured remotes
wit remote add <n> <url>  # Add a new remote
wit clone <url> [<dir>]   # Clone a repository
wit fetch [<remote>]      # Download objects from remote
wit pull [<remote>]       # Fetch and merge
wit push [<remote>]       # Push to remote
wit push -u origin main   # Push and set upstream
```

### Tags

```bash
wit tag                   # List all tags
wit tag v1.0.0            # Create lightweight tag
wit tag -a v1.0.0 -m ""   # Create annotated tag
wit tag -d v1.0.0         # Delete a tag
```

### Advanced Features

```bash
# Hooks
wit hooks                       # List installed hooks
wit hooks install pre-commit    # Install a hook from template
wit hooks remove pre-commit     # Remove a hook
wit hooks run pre-commit        # Test a hook manually

# Submodules
wit submodule add <url> <path>  # Add a submodule
wit submodule init              # Initialize submodules
wit submodule update            # Update submodules
wit submodule status            # Show submodule status

# Worktrees
wit worktree add <path> <branch>  # Create new worktree
wit worktree list                 # List all worktrees
wit worktree remove <path>        # Remove a worktree

# Reflog & Maintenance
wit reflog                    # Show HEAD reflog
wit gc                        # Run garbage collection
wit gc --aggressive           # More aggressive optimization

# Debugging
wit show <commit>             # Show commit details
wit bisect start              # Binary search for bug
wit clean -n                  # Preview untracked files to delete
wit fsck                      # Verify object database
```

### Monorepo Scopes

```bash
wit scope                 # Show current scope
wit scope set src/        # Limit to src/
wit scope use frontend    # Use preset (frontend/backend/docs)
wit scope clear           # Full repository
```

## AI-Powered Features

wit includes AI assistance powered by [Mastra](https://mastra.ai/) with support for OpenAI and Anthropic models.

### Setup

```bash
# For OpenAI (GPT-4o, etc.)
export OPENAI_API_KEY=sk-your-key-here

# OR for Anthropic (Claude)
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional: Use a different model
export WIT_AI_MODEL=anthropic/claude-sonnet-4-20250514

# Check configuration
wit ai status
```

### AI Commands

```bash
# Natural language commands
wit ai "what files have I changed?"
wit ai "show me the last 5 commits"
wit ai "switch to main branch"

# Generate commit messages
wit ai commit              # Generate message for staged changes
wit ai commit -a           # Stage all + generate message
wit ai commit -a -x        # Stage all, generate, and commit

# Code review
wit ai review              # Review all changes
wit ai review --staged     # Review only staged changes

# Explain commits
wit ai explain             # Explain the latest commit
wit ai explain HEAD~3      # Explain specific commit

# Conflict resolution
wit ai resolve             # Help resolve merge conflicts
wit ai resolve src/file.ts # Resolve specific file
```

## Visual Interfaces

### Web UI (`wit web`)

Modern dashboard at http://localhost:3847 with:

- **Commit graph** - Visual branch history
- **Side-by-side diffs** - Syntax highlighted
- **File browser** - With status icons
- **Search** - Find commits, files, content
- **One-click staging** - Stage files instantly
- **Keyboard shortcuts** - Ctrl+P search, R refresh

```bash
wit web                   # Default port 3847
wit web --port 8080       # Custom port
```

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
    hashAlgorithm = sha1
    largeFileThreshold = 2097152
    autoStashOnSwitch = true
```

## Programmatic Usage

```typescript
import { Repository } from "wit";

// Initialize
const repo = Repository.init("/path/to/project");

// Add and commit
repo.add("file.ts");
const hash = repo.commit("Add file");

// Undo
repo.journal.undo();

// Search
import { SearchEngine } from "wit";
const search = new SearchEngine(repo);
const results = search.search("TODO");

// Work with scopes (monorepo)
repo.scopeManager.setScope({ paths: ["packages/frontend/"] });
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

# <<<<<<< HEAD

## Keyboard Shortcuts (Web UI)

| Shortcut     | Action             |
| ------------ | ------------------ |
| `Ctrl+P`     | Focus search       |
| `Ctrl+Enter` | Open commit dialog |
| `R`          | Refresh            |
| `Escape`     | Close modal        |

## Differences from Git

### What's Better

- **GitHub Compatible** - Push/pull seamlessly with GitHub, GitLab, and any Git remote
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

> > > > > > > cbf6640 (push)

## Examples

### Quick Context Switch

```bash
# Working on feature, need to fix bug
wit switch main           # Auto-saves your work
# ... fix bug ...
wit commit -a -m "Fix bug"
wit switch feature        # Auto-restores your work
```

### AI-Powered Commit Workflow

```bash
# Make changes, stage, and let AI generate the message
wit add .
wit ai commit -x          # Generate and execute commit
```

### Quick WIP Workflow

```bash
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
wit cleanup --dry-run     # Preview
wit cleanup               # Clean up with confirmation
wit cleanup --days 60     # Branches older than 60 days
```

### Create Checkpoints

```bash
wit snapshot create "before refactor"
# Do risky work...
wit snapshot restore "before refactor"  # Something went wrong? Restore!
```

### Work on Multiple Branches Simultaneously

```bash
wit worktree add ../feature-worktree feature-branch
# Now work on both branches in different directories
wit worktree remove ../feature-worktree  # Clean up when done
```

## Keyboard Shortcuts (Web UI)

| Shortcut     | Action             |
| ------------ | ------------------ |
| `Ctrl+P`     | Focus search       |
| `Ctrl+Enter` | Open commit dialog |
| `R`          | Refresh            |
| `Escape`     | Close modal        |

## What's Different from Git

### Improvements

- **SHA-256** - Secure by default
- **Undo anything** - `wit undo` reverts any operation
- **Auto-stash** - Never lose work when switching branches
- **Built-in UI** - No external tools needed
- **AI assistance** - Commit messages, code review, conflict resolution
- **Clear commands** - `switch` for branches, `restore` for files
- **Better errors** - Suggestions for typos and mistakes
- **Large files** - Chunked storage without LFS
- **Quality of life** - `wip`, `amend`, `uncommit`, `cleanup`, `stats`, `snapshot`, `blame`

### Full Compatibility

wit implements all standard Git functionality including cherry-pick, rebase, revert, stash, tags, bisect, hooks, submodules, worktrees, reflog, and garbage collection.

## License

MIT
