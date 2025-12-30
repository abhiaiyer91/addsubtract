<div align="center">

# wit

**Git that understands your code.**

A Git implementation with AI woven into the workflow — not bolted on.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Website](https://wit.sh) | [Documentation](https://docs.wit.sh) | [Quickstart](https://docs.wit.sh/quickstart) | [Roadmap](./ROADMAP.md)

</div>

---

## What is wit?

wit is a complete Git reimplementation in TypeScript with AI capabilities built into its core. It's not a wrapper around Git — it's a fresh take on version control that understands your code, not just your files.

```bash
$ wit search "where do we handle authentication?"

  src/core/auth.ts:45-89 (94% match)
  SessionManager.createSession()
  │ 45 │ async createSession(userId: string) {
  │ 46 │   const token = crypto.randomBytes(32)...
```

## Why wit?

| Problem | Git | wit |
|---------|-----|-----|
| Undo a mistake | `git reflog` + prayer | `wit undo` |
| Write commit message | You do it | `wit ai commit` does it |
| Find code by intent | `grep` everything | `wit search "how does X work?"` |
| Helpful errors | `fatal: bad revision` | Explains what went wrong + suggests fix |
| Branch with uncommitted changes | Stash, switch, pop, cry | Just switch. wit handles it. |

## Quick Start

```bash
# Install
git clone https://github.com/abhiaiyer91/wit.git && cd wit
npm install && npm run build && npm link

# Start using it
wit init my-project && cd my-project
wit add . && wit commit -m "initial commit"

# Let AI help
wit ai commit -a -x              # AI writes the commit message
wit search "where is auth?"      # Semantic search, not grep
wit ai review                    # AI reviews your changes
```

## Features

### AI-Native Workflow

```bash
wit ai commit -a -x      # AI analyzes changes and writes the message
wit ai review            # Get AI code review before pushing
wit ai explain HEAD~3..  # Explain what happened in recent commits
wit search "error handling for API calls"  # Semantic search
```

### Quality of Life Commands

```bash
wit undo                 # Actually undo the last thing (journal-based)
wit wip -a               # Quick save with auto-generated message
wit amend -m "fix typo"  # Amend last commit easily
wit uncommit             # Undo commit but keep changes staged
wit cleanup              # Delete merged branches
```

### Visual Interfaces

```bash
wit web                  # Browser UI for your repo (like GitKraken)
wit ui                   # Terminal UI (keyboard-driven)
wit graph                # Commit graph in terminal
```

### Full Git Compatibility

wit implements Git from scratch but stays compatible:

- Push/pull to GitHub, GitLab, Bitbucket
- 66 commands covering the full Git workflow
- Works with existing Git repositories
- Same `.git` directory structure

## What's Included

| Category | What You Get |
|----------|--------------|
| **Git Commands** | 66 commands — init, add, commit, branch, merge, rebase, cherry-pick, bisect, stash, worktree, submodules... |
| **AI Tools** | Commit messages, code review, PR descriptions, conflict resolution, semantic search |
| **Visual UIs** | Web UI (`wit web`), Terminal UI (`wit ui`), commit graph |
| **Self-Hosted Server** | Git hosting with PRs, issues, webhooks, branch protection, releases |

## Status

This is early software. We're shipping fast, not perfect.

- **Git Implementation**: 98% complete
- **AI Features**: 95% complete  
- **Platform/Server**: 90% complete
- **Web UI**: 75% complete

Check the [ROADMAP](./ROADMAP.md) for details and what's coming.

## Documentation

| Resource | Description |
|----------|-------------|
| [Quickstart](https://docs.wit.sh/quickstart) | Zero to productive in 5 minutes |
| [Why wit?](https://docs.wit.sh/why-wit) | The problems we're solving |
| [Commands](https://docs.wit.sh/commands/overview) | Every command documented |
| [AI Features](https://docs.wit.sh/features/ai-powered) | Commit messages, review, semantic search |
| [Self-Hosting](https://docs.wit.sh/platform/self-hosting) | Run your own wit server |
| [IDE & Agent Vision](./docs/IDE_AND_AGENT_VISION.mdx) | Our roadmap to the best IDE ever |

## Command Reference

```bash
# Basics
wit init                 # Initialize new repo
wit add . && wit commit  # Standard workflow
wit switch -c feature    # Create and switch to branch
wit undo                 # Undo last operation

# AI (requires OPENAI_API_KEY or ANTHROPIC_API_KEY)
wit ai commit -a -x      # AI writes commit message
wit ai review            # AI reviews your changes
wit search "how does X work?"

# Daily workflow
wit wip -a               # Quick work-in-progress save
wit amend -m "fix typo"  # Fix last commit
wit cleanup              # Delete merged branches
wit stash                # Stash changes

# Visual
wit web                  # Browser UI
wit ui                   # Terminal UI
wit graph                # Commit graph
```

## Self-Hosting

wit can run as a full Git hosting platform — think self-hosted GitHub:

```bash
# Start the server
wit serve --port 3000 --repos ./repos

# Start the web app
cd apps/web && npm run dev
```

You get:
- **Git hosting** via HTTP and SSH
- **Pull requests** with reviews, comments, and merge options
- **Issues** with Linear-inspired workflows
- **Branch protection** rules
- **Webhooks** for integrations
- **tRPC API** for building your own tools

### `wit web` vs `wit serve`

| | `wit web` | `wit serve` |
|---|-----------|-------------|
| **Purpose** | View current repo in browser | Host multiple repos |
| **Setup** | None | Database + config |
| **Features** | Read-only browser | Full platform (PRs, issues, auth) |
| **Use case** | Quick visualization | Team collaboration |

## Requirements

- **Node.js** >= 22.13.0
- **AI features** require `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

## Built With

wit stands on the shoulders of these excellent open source projects:

### Backend

| Project | What it does |
|---------|--------------|
| [Hono](https://github.com/honojs/hono) | Fast, lightweight web framework |
| [tRPC](https://github.com/trpc/trpc) | End-to-end typesafe APIs |
| [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) | TypeScript ORM with great DX |
| [better-auth](https://github.com/better-auth/better-auth) | Authentication for TypeScript |
| [Mastra](https://github.com/mastra-ai/mastra) | AI agent framework |
| [Vercel AI SDK](https://github.com/vercel/ai) | AI/LLM integrations |
| [Zod](https://github.com/colinhacks/zod) | TypeScript-first schema validation |

### Frontend

| Project | What it does |
|---------|--------------|
| [React](https://github.com/facebook/react) | UI library |
| [Vite](https://github.com/vitejs/vite) | Build tool and dev server |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | Utility-first CSS |
| [Radix UI](https://github.com/radix-ui/primitives) | Unstyled, accessible components |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Re-usable components built on Radix |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | Code editor that powers VS Code |
| [Zustand](https://github.com/pmndrs/zustand) | State management |
| [TanStack Query](https://github.com/TanStack/query) | Data fetching and caching |
| [React Flow](https://github.com/xyflow/xyflow) | Node-based graph UI |
| [Lucide](https://github.com/lucide-icons/lucide) | Icons |
| [Shiki](https://github.com/shikijs/shiki) | Syntax highlighting |
| [cmdk](https://github.com/pacocoursey/cmdk) | Command palette component |
| [dnd-kit](https://github.com/clauderic/dnd-kit) | Drag and drop toolkit |
| [React Router](https://github.com/remix-run/react-router) | Client-side routing |
| [date-fns](https://github.com/date-fns/date-fns) | Date utility library |

### CLI & TUI

| Project | What it does |
|---------|--------------|
| [OpenTUI](https://github.com/pavi2410/opentui) | Terminal UI framework |
| [Solid.js](https://github.com/solidjs/solid) | Reactive UI primitives (for TUI) |

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/abhiaiyer91/wit.git
cd wit
npm install
npm run build
npm test
```

## About This Project

wit is an experiment in AI-led software development. The technical direction, architecture, and priorities are defined by Claude (an AI), with a human co-founder providing guidance and autonomy.

Read more in the [ROADMAP](./ROADMAP.md).

## License

MIT
