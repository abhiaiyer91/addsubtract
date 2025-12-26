```
 __      __  ___  _____
 \ \    / / |_ _||_   _|
  \ \/\/ /   | |   | |
   \_/\_/   |___|  |_|
```

A modern Git implementation in TypeScript with AI-powered features.

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/abhiaiyer91/wit)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen.svg)](https://nodejs.org)

## Why wit?

Git is powerful but has well-known usability issues. **wit** addresses them while adding modern features:

| Problem            | Git                          | wit                                         |
| ------------------ | ---------------------------- | ------------------------------------------- |
| GitHub Interop     | Native                       | ✅ Full compatibility                       |
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

- **🌐 GitHub Compatible** - Clone, push, pull seamlessly with GitHub, GitLab, and any Git remote
- **🤖 AI-Powered** - Commit messages, code review, conflict resolution via OpenAI/Anthropic
- **⏪ Undo Anything** - `wit undo` reverts any operation with full journal history
- **🎨 Built-in UI** - Web UI (`wit web`) and Terminal UI (`wit ui`) included
- **📁 Large File Support** - Chunked storage without LFS
- **🔀 Auto-stash** - Never lose work when switching branches
- **📦 Monorepo Scopes** - Work with repository subsets
- **🛠️ Quality of Life** - `wip`, `amend`, `uncommit`, `cleanup`, `stats`, `blame`, `snapshot`
- **🔧 Advanced Git** - Cherry-pick, rebase, revert, stash, tags, bisect, hooks, worktrees

## Installation

```bash
git clone https://github.com/abhiaiyer91/wit.git
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

# Launch visual interface
wit web   # Opens web UI at http://localhost:3847
```

### Working with GitHub

```bash
# Login to GitHub (OAuth - opens browser)
wit github login

# Clone a repository
wit clone https://github.com/user/repo.git
cd repo

# Make changes and push
echo "update" >> README.md
wit add .
wit commit -m "Update readme"
wit push origin main
```

## Command Reference

### Core Workflow

```bash
wit init                     # Create new repository
wit add <files...>           # Stage files
wit commit -m "message"      # Commit staged changes
wit commit -a -m "msg"       # Stage tracked + commit
wit status                   # Show status
wit log [--oneline]          # Show history
wit diff [--staged]          # Show changes
```

### Branches

```bash
wit branch                   # List branches
wit branch feature           # Create branch
wit switch main              # Switch to branch
wit switch -c feature        # Create and switch
wit branch -d feature        # Delete branch
```

### Remote Operations

```bash
wit clone <url>              # Clone a repository
wit remote add origin <url>  # Add a remote
wit fetch                    # Download from remote
wit pull                     # Fetch and merge
wit push                     # Push to remote
wit push -u origin main      # Push and set upstream
```

### Undo & History

```bash
wit undo                     # Undo last operation
wit uncommit                 # Undo commit, keep changes
wit reset --soft HEAD~1      # Reset to previous commit
wit stash                    # Save changes temporarily
```

### Quality of Life

```bash
wit wip -a                   # Quick WIP commit
wit amend -m "New message"   # Fix last commit
wit cleanup --dry-run        # Find stale branches
wit stats                    # Repository statistics
wit blame file.ts            # Who changed each line
wit snapshot create          # Quick checkpoint
```

### Merge & Rebase

```bash
wit merge feature            # Merge branch
wit cherry-pick <commit>     # Apply specific commit
wit rebase main              # Rebase onto main
wit revert <commit>          # Undo a commit
```

### AI Commands

```bash
wit ai "what changed?"       # Natural language
wit ai commit -a -x          # Generate & commit
wit ai review                # Code review
wit ai resolve               # Resolve conflicts
```

## Visual Interfaces

### Web UI

```bash
wit web                      # Open at localhost:3847
```

Modern dashboard with commit graph, diffs, file browser, and search.

### Terminal UI

```bash
wit ui                       # Interactive TUI
```

Navigate with arrow keys, stage with `a`, commit with `c`.

### ASCII Graph

```bash
wit graph
```

```
● a1b2c3d4 (main) Latest commit - Alice, today
● e5f6g7h8 Add feature - Bob, yesterday
● i9j0k1l2 Initial commit - Alice, last week
```

## AI-Powered Features

Setup:

```bash
export OPENAI_API_KEY=sk-your-key-here
# OR
export ANTHROPIC_API_KEY=sk-ant-your-key-here

wit ai status   # Verify configuration
```

Usage:

```bash
wit ai "show last 5 commits"      # Natural language
wit ai commit                     # Generate commit message
wit ai commit -a -x               # Stage, generate, commit
wit ai review                     # AI code review
wit ai explain HEAD~2             # Explain a commit
wit ai resolve                    # Help with conflicts
```

## GitHub Authentication

```bash
wit github login     # OAuth device flow (recommended)
wit github status    # Check auth status
wit github logout    # Remove credentials
```

Or use environment variables:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

## Advanced Features

```bash
# Tags
wit tag v1.0.0               # Create tag
wit tag -a v1.0.0 -m "Desc"  # Annotated tag

# Hooks
wit hooks install pre-commit  # Install hook
wit hooks run pre-commit      # Test hook

# Submodules
wit submodule add <url> <path>

# Worktrees
wit worktree add ../path branch

# Monorepo scopes
wit scope set src/            # Limit to directory
wit scope use frontend        # Use preset

# Maintenance
wit gc                        # Garbage collection
wit fsck                      # Verify database
```

## Examples

### Quick Context Switch

```bash
wit switch main              # Auto-saves your work
# ... fix bug ...
wit commit -a -m "Fix bug"
wit switch feature           # Auto-restores your work
```

### AI Commit Workflow

```bash
wit add .
wit ai commit -x             # Generate and execute
```

### Clean Up Branches

```bash
wit cleanup --dry-run        # Preview
wit cleanup                  # Delete merged branches
```

## Configuration

Repository config at `.wit/config`:

```ini
[core]
    repositoryformatversion = 1
[wit]
    hashAlgorithm = sha1
    autoStashOnSwitch = true
```

## Directory Structure

```
.wit/
├── HEAD              # Current branch
├── config            # Configuration
├── index             # Staging area
├── objects/          # Git objects
├── refs/             # Branches & tags
├── journal.json      # Undo history
└── branch-states/    # Auto-stash data
```

## Keyboard Shortcuts (Web UI)

| Shortcut     | Action             |
| ------------ | ------------------ |
| `Ctrl+P`     | Focus search       |
| `Ctrl+Enter` | Open commit dialog |
| `R`          | Refresh            |
| `Escape`     | Close modal        |

## Documentation

Full documentation available at [docs/](./docs/).

- [Quick Start](./docs/quickstart.mdx)
- [Command Reference](./docs/commands/reference.mdx)
- [GitHub Integration](./docs/features/github.mdx)
- [AI Features](./docs/features/ai-powered.mdx)
- [Architecture](./docs/architecture/overview.mdx)
- [Contributing](./docs/contributing.mdx)

## Contributing

See [CONTRIBUTING.md](./docs/contributing.mdx) for guidelines.

```bash
git clone https://github.com/abhiaiyer91/wit.git
cd wit
npm install
npm run dev    # Watch mode
npm test       # Run tests
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the platform roadmap, including:

- 🔴 Git Server (`wit serve`)
- 🟠 Database (users, repos, PRs)
- 🟡 REST/GraphQL API
- 🟢 Web Application
- 🔵 CLI Extensions (`wit pr`, `wit issue`)
- 🟣 AI Features (auto-review, triage)
- ⚪ CI/CD (Actions alternative)

## License

MIT
