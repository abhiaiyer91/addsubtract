# wit

**Git that understands your code.** A Git implementation with AI woven into the workflow.

[Website](https://wit.sh) | [Documentation](https://docs.wit.sh) | [Quickstart](https://docs.wit.sh/quickstart)

## Why wit?

- **Undo anything** - `wit undo` instead of deciphering the reflog
- **AI that helps** - commit messages, code review, semantic search over your codebase
- **Sane UX** - helpful error messages, auto-stash on branch switch, `wip`/`amend`/`uncommit`

## Quick Start

```bash
# Install
git clone https://github.com/abhiaiyer91/wit.git && cd wit
npm install && npm run build && npm link

# Use it
wit init
wit add . && wit commit -m "first commit"
wit ai commit -a -x    # AI writes the commit message
wit search "where is auth handled?"
```

That's it. You're using wit.

## What's Ready

- Full Git compatibility (push/pull to GitHub works)
- 57 commands covering standard Git workflows
- AI commit messages and code review
- Semantic search over your codebase
- Web UI (`wit web`) and Terminal UI (`wit ui`)
- Self-hosted server with PRs and issues

## What's Not (Yet)

This is early software. We're shipping fast, not perfect. Check the [ROADMAP](./ROADMAP.md) for what's coming.

## Documentation

- **[Quickstart](https://docs.wit.sh/quickstart)** - From zero to productive in 5 minutes
- **[Why wit?](https://docs.wit.sh/why-wit)** - The problems we're solving
- **[Commands](https://docs.wit.sh/commands/overview)** - Every command documented
- **[AI Features](https://docs.wit.sh/features/ai-powered)** - Commit messages, review, semantic search
- **[Full Docs](https://docs.wit.sh)** - Everything else

## Quick Reference

```bash
# The basics
wit init                 # new repo
wit add . && wit commit  # standard workflow
wit switch -c feature    # create branch
wit undo                 # undo last operation

# AI (requires OPENAI_API_KEY or ANTHROPIC_API_KEY)
wit ai commit -a -x      # AI writes commit message
wit ai review            # AI reviews your changes
wit search "how does X work?"

# Quality of life
wit wip -a               # quick save with auto-message
wit amend -m "fix typo"  # fix last commit
wit cleanup              # delete merged branches
```

## Requirements

Node.js >= 22.13.0

## Built With

wit is built on the shoulders of these excellent open source projects:

### Backend
- **[Hono](https://github.com/honojs/hono)** - Fast, lightweight web framework
- **[tRPC](https://github.com/trpc/trpc)** - End-to-end typesafe APIs
- **[Drizzle ORM](https://github.com/drizzle-team/drizzle-orm)** - TypeScript ORM with great DX
- **[better-auth](https://github.com/better-auth/better-auth)** - Authentication for TypeScript
- **[Mastra](https://github.com/mastra-ai/mastra)** - AI agent framework
- **[Vercel AI SDK](https://github.com/vercel/ai)** - AI/LLM integrations

### Frontend
- **[React](https://github.com/facebook/react)** - UI library
- **[Vite](https://github.com/vitejs/vite)** - Build tool and dev server
- **[Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)** - Utility-first CSS
- **[Radix UI](https://github.com/radix-ui/primitives)** - Unstyled, accessible components
- **[shadcn/ui](https://github.com/shadcn-ui/ui)** - Re-usable components built on Radix
- **[Monaco Editor](https://github.com/microsoft/monaco-editor)** - Code editor that powers VS Code
- **[Zustand](https://github.com/pmndrs/zustand)** - State management
- **[TanStack Query](https://github.com/TanStack/query)** - Data fetching and caching
- **[React Flow](https://github.com/xyflow/xyflow)** - Node-based graph UI
- **[Lucide](https://github.com/lucide-icons/lucide)** - Icons
- **[Shiki](https://github.com/shikijs/shiki)** - Syntax highlighting

### CLI & TUI
- **[Blessed](https://github.com/chjj/blessed)** - Terminal UI library

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT
