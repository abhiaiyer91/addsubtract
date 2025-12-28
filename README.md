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

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT
