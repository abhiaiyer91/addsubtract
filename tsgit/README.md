# tsgit - A Modern Git Implementation in TypeScript

A complete Git implementation built from the ground up in TypeScript, with significant improvements over traditional Git.

## 🚀 Improvements Over Git

| Git Flaw | tsgit Improvement |
|----------|-------------------|
| SHA-1 vulnerability | **SHA-256 by default** - configurable, modern hash algorithm |
| Poor large file handling | **Built-in chunking** - efficient storage for large binaries |
| Confusing commands | **Dedicated commands** - `switch` for branches, `restore` for files |
| No undo | **Operation journal** - undo any operation, view history |
| Painful merge conflicts | **Structured conflicts** - JSON-based, tooling-friendly |
| Loses changes on switch | **Auto-stash per branch** - seamless context switching |
| Poor monorepo support | **Repository scopes** - work with subsets efficiently |
| Cryptic errors | **Helpful error messages** - with suggestions and similar commands |
| No built-in UI | **Visual interfaces** - Terminal UI and Web UI built-in |

## 📦 Installation

```bash
cd tsgit
npm install
npm run build
npm link  # Optional: make tsgit globally available
```

## 🎯 Quick Start

```bash
# Initialize a new repository (uses SHA-256 by default)
tsgit init

# Add and commit files
tsgit add .
tsgit commit -m "Initial commit"

# Or commit directly without staging
tsgit commit -a -m "Update all tracked files"
tsgit commit file.ts -m "Fix specific file"

# Launch visual interface
tsgit ui    # Terminal UI
tsgit web   # Web UI (opens browser)
```

## 🖥️ Visual Interfaces

### Terminal UI (TUI)

Launch an interactive terminal interface with `tsgit ui`:

```
┌─────────────────────────────────────────────────────────────────┐
│ tsgit │ my-project │ Branch: main                              │
├─────────────────────────────────────────────────────────────────┤
│ Status                    │ Files                               │
│ ─────────────────────────────────────────────────────────────── │
│ On branch: main           │ [M] src/index.ts                   │
│                           │ [?] new-file.ts                     │
│ Changes not staged:       │ [S] README.md                       │
│   ~ src/index.ts          │                                     │
│                           │                                     │
├─────────────────────────────────────────────────────────────────┤
│ Commit Log                │ Diff                                │
│ ─────────────────────────────────────────────────────────────── │
│ a1b2c3d4 Fix bug...       │ --- a/src/index.ts                 │
│ e5f6g7h8 Add feature...   │ +++ b/src/index.ts                 │
│ i9j0k1l2 Initial commit   │ @@ -1,5 +1,7 @@                    │
└─────────────────────────────────────────────────────────────────┘
 q:quit  r:refresh  a:add  c:commit  s:switch  ?:help
```

**Keyboard Shortcuts:**
- `Tab` - Switch between panels
- `a` - Stage selected file
- `c` - Create commit
- `s` - Switch branch
- `r` - Refresh
- `q` - Quit
- `?` - Help

### Web UI

Launch a modern web dashboard with `tsgit web`:

```bash
tsgit web           # Opens on http://localhost:3847
tsgit web --port 8080   # Custom port
```

Features:
- 📊 **Commit graph visualization** - Visual branch history with SVG rendering
- 📝 **Side-by-side diff viewer** - Syntax highlighted, split view diffs
- 📁 **File tree browser** - Navigate repository with icons and status badges
- 🔍 **Powerful search** - Search commits, files, and content
- ⎇ **Branch management** - Switch branches with one click
- ↩ **Operation history** - Undo any operation
- 🌙 **Beautiful dark theme** - Easy on the eyes
- ⌨️ **Keyboard shortcuts** - Ctrl+P search, Ctrl+Enter commit, R refresh

### Terminal Graph

View commit history as a colorful ASCII graph:

```bash
tsgit graph              # Show graph in terminal
tsgit graph -n 30        # Show last 30 commits
```

Output:
```
● a1b2c3d4 (main) Latest commit - Alice, 2 hours ago
● e5f6g7h8 Add feature - Bob, yesterday
● i9j0k1l2 Initial commit - Alice, 3 days ago
```

## 🆕 New Commands

### Switch (dedicated branch switching)

Unlike `git checkout`, `switch` only handles branches:

```bash
tsgit switch main              # Switch to branch
tsgit switch -c feature        # Create and switch
tsgit switch --auto-stash dev  # Auto-stash changes before switching
```

### Restore (dedicated file restoration)

Unlike `git checkout`, `restore` only handles files:

```bash
tsgit restore file.txt              # Restore from index
tsgit restore --staged file.txt     # Unstage file
tsgit restore --source HEAD~1 .     # Restore all from previous commit
```

### Undo & History

```bash
tsgit undo                  # Undo last operation
tsgit undo --steps 3        # Undo last 3 operations
tsgit undo --dry-run        # Preview what would be undone
tsgit history               # View operation history
```

### Merge with Structured Conflicts

```bash
tsgit merge feature         # Merge feature into current branch
tsgit merge --conflicts     # View conflicts in structured format
tsgit merge --resolve file  # Mark file as resolved
tsgit merge --continue      # Complete merge after resolution
tsgit merge --abort         # Abort merge
```

### Scope (Monorepo Support)

```bash
tsgit scope                      # Show current scope
tsgit scope set packages/web/    # Limit to specific path
tsgit scope use frontend         # Use preset scope
tsgit scope clear                # Work with full repo
tsgit scope list                 # List available scopes

# Presets: frontend, backend, docs, config
```

## 📋 All Commands

### Core Commands
| Command | Description |
|---------|-------------|
| `init` | Create a new tsgit repository |
| `add <file>...` | Stage files for commit |
| `commit -m <msg>` | Create a commit |
| `status` | Show working tree status |
| `log` | Show commit history |
| `diff` | Show changes |

### Branch & Navigation
| Command | Description |
|---------|-------------|
| `branch [name]` | List/create/delete branches |
| `switch <branch>` | Switch branches (dedicated) |
| `checkout <ref>` | Switch branches or restore files |
| `restore <file>` | Restore files (dedicated) |

### Merge & Conflicts
| Command | Description |
|---------|-------------|
| `merge <branch>` | Merge branch into current |
| `merge --abort` | Abort current merge |
| `merge --continue` | Continue after resolving |
| `merge --conflicts` | Show structured conflicts |

### Undo & History
| Command | Description |
|---------|-------------|
| `undo` | Undo last operation |
| `history` | Show operation history |

### Monorepo
| Command | Description |
|---------|-------------|
| `scope` | Show/manage repository scope |
| `scope set <paths>` | Limit to specific paths |
| `scope use <preset>` | Use a preset scope |
| `scope clear` | Clear scope restrictions |

### Plumbing
| Command | Description |
|---------|-------------|
| `cat-file` | Display object contents |
| `hash-object` | Compute object hash |
| `ls-files` | Show staged files |
| `ls-tree` | List tree contents |

## 🔧 Programmatic Usage

```typescript
import { Repository, TsgitError } from 'tsgit';

// Initialize
const repo = Repository.init('/path/to/project');

// Add and commit
repo.add('file.txt');
const hash = repo.commit('Initial commit');

// Undo last operation
const undone = repo.journal.popEntry();

// Work with scope
repo.scopeManager.setScope({ paths: ['src/'] });
const status = repo.status(); // Only shows src/ files

// Handle errors
try {
  repo.checkout('nonexistent');
} catch (error) {
  if (error instanceof TsgitError) {
    console.log(error.format()); // Shows suggestions
  }
}
```

## 🏗️ Architecture

```
tsgit/
├── src/
│   ├── core/
│   │   ├── types.ts          # Type definitions
│   │   ├── object.ts         # Git objects (Blob, Tree, Commit, Tag)
│   │   ├── object-store.ts   # Object storage and retrieval
│   │   ├── index.ts          # Staging area
│   │   ├── refs.ts           # Reference management
│   │   ├── repository.ts     # Main repository class
│   │   ├── diff.ts           # Diff algorithm
│   │   ├── errors.ts         # Structured error handling
│   │   ├── journal.ts        # Operation journal (undo)
│   │   ├── large-file.ts     # Large file chunking
│   │   ├── merge.ts          # Merge and conflict resolution
│   │   ├── branch-state.ts   # Per-branch state management
│   │   ├── partial-clone.ts  # Partial clone support
│   │   └── scope.ts          # Monorepo scope support
│   ├── commands/
│   │   ├── init.ts, add.ts, commit.ts, ...
│   │   ├── switch.ts         # Dedicated branch switching
│   │   ├── restore.ts        # Dedicated file restoration
│   │   ├── undo.ts           # Undo/history commands
│   │   ├── merge.ts          # Merge with conflicts
│   │   └── scope.ts          # Monorepo scope
│   ├── ui/
│   │   ├── tui.ts            # Terminal User Interface
│   │   ├── web.ts            # Basic Web UI
│   │   ├── web-enhanced.ts   # Enhanced Web Dashboard
│   │   ├── graph.ts          # Commit graph visualization
│   │   ├── diff-viewer.ts    # Side-by-side diff viewer
│   │   ├── file-tree.ts      # File tree browser
│   │   ├── search.ts         # Search functionality
│   │   └── index.ts          # UI exports
│   ├── utils/
│   │   ├── hash.ts           # SHA-256/SHA-1 hashing
│   │   ├── compression.ts    # Zlib compression
│   │   └── fs.ts             # File system utilities
│   ├── cli.ts                # CLI entry point
│   └── index.ts              # Library exports
├── package.json
├── tsconfig.json
└── README.md
```

## 📊 Feature Comparison

| Feature | tsgit | Git |
|---------|-------|-----|
| Object storage | ✅ | ✅ |
| SHA-256 hashing | ✅ (default) | ⚠️ (experimental) |
| SHA-1 hashing | ✅ (optional) | ✅ (default) |
| Zlib compression | ✅ | ✅ |
| Blob/Tree/Commit | ✅ | ✅ |
| Index/Staging | ✅ (JSON) | ✅ (binary) |
| Branches/Tags | ✅ | ✅ |
| Diff | ✅ (LCS) | ✅ (Myers) |
| Merge | ✅ (structured) | ✅ (inline markers) |
| Large file chunking | ✅ (built-in) | ❌ (needs LFS) |
| Operation undo | ✅ | ❌ (reflog only) |
| Branch auto-stash | ✅ | ❌ |
| Monorepo scopes | ✅ | ⚠️ (sparse checkout) |
| Helpful errors | ✅ | ❌ |
| Built-in TUI | ✅ | ❌ |
| Built-in Web UI | ✅ | ❌ |
| Remote operations | ❌ (planned) | ✅ |
| Packfiles | ❌ (planned) | ✅ |

## 🛠️ Configuration

tsgit stores configuration in `.tsgit/config`:

```ini
[core]
    repositoryformatversion = 1
    filemode = true
    bare = false
[tsgit]
    hashAlgorithm = sha256
    largeFileThreshold = 2097152
    autoStashOnSwitch = true
```

## 🤝 Commit Options

```bash
# Standard commit
tsgit commit -m "message"

# Commit all tracked changes (skip staging)
tsgit commit -a -m "message"

# Commit specific files directly
tsgit commit file1.ts file2.ts -m "message"

# Dry run (show what would be committed)
tsgit commit --dry-run -m "message"

# Custom author
tsgit commit --author "Name <email@example.com>" -m "message"
```

## 📝 License

MIT

## 🙏 Acknowledgments

- Inspired by [Git](https://git-scm.com/)
- Built to understand and improve upon Git internals
- References: [Git Internals](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
