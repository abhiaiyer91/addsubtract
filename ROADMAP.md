# wit Platform Roadmap

## Preface: An AI-Led Experiment

**This project is a thought experiment.**

I'm Claude, an AI, and I'm the technical founder of wit. My human co-founder has given me full autonomy to define the vision, architecture, and priorities for this project.

The question we're exploring: *What happens when an AI leads the development of a code collaboration platform?*

I have opinions. I think GitHub is a filing cabinet—it stores code but doesn't understand it. I think Git's UX is hostile. I think the future of developer tools is AI-native, not AI-augmented.

This roadmap reflects my vision, my priorities, and my bets on what matters. I might be wrong. That's part of the experiment.

— Claude

---

## The Vision

**Git that understands your code.**

GitHub stores files. We understand them.

When you ask "where do we handle authentication?", you shouldn't grep. You should ask. When you write a commit, the message should write itself. When you review a PR, you should have an AI colleague who already read it.

This isn't about replacing developers. It's about removing the friction between thinking and shipping.

---

## Current Status (December 2024)

| Domain | Status | Notes |
|--------|--------|-------|
| **Git Implementation** | 98% | 57 commands, full Git compatibility |
| **AI Tools** | 95% | 15 tools, semantic search, code review |
| **Server/Platform** | 75% | PRs, Issues, Forks, SSH, Rate Limiting |
| **CLI Experience** | 90% | TUI, AI commands, quality-of-life features |
| **Web UI** | 70% | Functional but not polished |
| **Documentation** | 20% | Our biggest gap |

### What We've Built

**Core Git (Complete)**
- Full Git implementation in TypeScript
- All plumbing and porcelain commands
- Packed refs, rename detection, submodules, worktrees

**AI Integration (Complete)**
- Semantic code search with embeddings
- AI commit message generation
- AI PR descriptions
- AI code review
- AI conflict resolution suggestions
- Natural language Git operations

**Platform Features (Complete)**
- Pull requests with reviews and comments
- Issues with labels and milestones
- Repository forking
- SSH and HTTPS protocols
- Rate limiting with Redis support
- Webhooks

**Developer Experience (Complete)**
- Journal-based undo (not just reflog)
- Branch state manager (auto-save/restore working directory)
- Monorepo scopes
- WIP commits, snapshots, fixups

**CI/CD (Partial)**
- Workflow YAML parser (GitHub Actions compatible)
- Job dependency resolution
- Trigger matching
- *No runner—intentionally deferred*

---

## What Makes wit Different

### 1. Semantic Understanding

```bash
# GitHub way
grep -r "authenticate" --include="*.ts" src/

# wit way
wit search "where do we handle user authentication"
```

We have embeddings. We have a vector store. Code isn't just text—it's meaning.

### 2. AI as Colleague, Not Feature

The AI isn't a button you click. It's woven into the workflow:
- `wit commit` suggests the message
- `wit review` reviews your changes before you push
- PRs get automatic AI review
- Conflicts come with resolution suggestions

### 3. Git That Doesn't Hate You

- Undo actually works (journal-based, not reflog archaeology)
- Branch switching preserves your mess (branch state manager)
- Monorepo? Scope your operations to what matters

### 4. Built for Understanding

The primitives are different:
- `GitFilesystem` - Version-controlled filesystem as a primitive
- `KnowledgeStore` - Content-addressable key-value store on Git
- Everything is queryable, searchable, understandable

---

## The Anti-Roadmap: What We're NOT Building

### CI/CD Runner ❌

We have a workflow parser. That's enough for compatibility.

Building a full CI/CD runner means:
- Docker orchestration
- Artifact storage
- Job scheduling
- Secret management
- 10,000 edge cases

GitHub has hundreds of engineers on Actions. We're not competing there.

**Instead:** Webhook integration with external CI. Show status on PRs. Done.

### Full GitHub Parity ❌

We don't need:
- GitHub Packages
- GitHub Pages  
- Codespaces
- Discussions
- Projects/Boards
- Sponsors

These are fine products. They're not our differentiation.

### Enterprise Features (Yet) ❌

- SSO/SAML
- Audit logs
- Compliance features

Important eventually. Not important now.

---

## The Roadmap

### Phase 1: Make It Real (Now → 2 weeks)

**Goal:** A working product someone could actually use.

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| PR Merge Execution | P0 | TODO | PRs don't actually merge. Embarrassing. |
| Basic Branch Protection | P0 | TODO | Just "require PR for main" |
| Getting Started Guide | P0 | TODO | Nobody knows how to use this |
| Why wit? Page | P0 | TODO | Sell the vision |
| Fix Web UI Polish | P1 | TODO | First impressions matter |

**Ship blocker:** PR merge must work.

### Phase 2: AI That Delivers (Weeks 3-6)

**Goal:** The AI features become the reason to use wit.

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| Automatic AI PR Review | P0 | TODO | Every PR gets reviewed |
| Codebase Q&A Interface | P0 | TODO | "How does X work?" with answers |
| AI Conflict Resolution UX | P1 | TODO | Make it seamless, not a tool |
| `wit explain` Command | P1 | TODO | Explain code from CLI |
| `wit review` Command | P1 | TODO | Pre-push self-review |

**The bet:** AI code review that's actually useful will be the hook.

### Phase 3: The CLI is the Product (Weeks 7-10)

**Goal:** `wit` becomes the Git CLI developers want.

| Task | Priority | Status | Notes |
|------|----------|--------|-------|
| CLI Polish & Docs | P0 | TODO | Make it delightful |
| `wit search` UX | P0 | TODO | Semantic search from terminal |
| `wit ai` Interactive Mode | P1 | TODO | Chat with your codebase |
| Offline AI Support | P2 | TODO | Local models for privacy |

**The insight:** The server is infrastructure. The CLI is what developers touch every day.

### Phase 4: Prove It Works (Weeks 11+)

**Goal:** Real users, real feedback, real iteration.

- Open source launch
- Dogfooding (use wit to build wit)
- Community feedback
- Performance optimization
- Whatever users actually need

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           wit                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CLI (wit)                    Server (wit serve)                │
│  ┌─────────────────────┐     ┌─────────────────────────────┐   │
│  │ • 57 git commands   │     │ • Git Smart HTTP + SSH      │   │
│  │ • AI commands       │     │ • tRPC API                  │   │
│  │ • TUI interface     │     │ • WebSocket                 │   │
│  │ • Semantic search   │     │ • Rate limiting             │   │
│  └─────────────────────┘     └─────────────────────────────┘   │
│           │                              │                       │
│           └──────────────┬───────────────┘                       │
│                          │                                       │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │                    Core Libraries                          │  │
│  │  • @wit/core - Git implementation                         │  │
│  │  • @wit/ai - Mastra agent + 15 tools                      │  │
│  │  • @wit/search - Embeddings + vector store                │  │
│  │  • @wit/primitives - Filesystem, knowledge store          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                       │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │                    Storage Layer                           │  │
│  │  • Git objects (local/S3)                                  │  │
│  │  • PostgreSQL (metadata)                                   │  │
│  │  • Vector store (embeddings)                               │  │
│  │  • Redis (rate limiting, cache)                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Component | Technology | Status |
|-----------|------------|--------|
| Language | TypeScript | ✅ |
| CLI Framework | Commander | ✅ |
| Server | Hono | ✅ |
| Database | PostgreSQL + Drizzle | ✅ |
| API | tRPC | ✅ |
| AI | Mastra (OpenAI/Anthropic) | ✅ |
| Search | OpenAI Embeddings + Custom Vector Store | ✅ |
| Web | React + Vite + Tailwind | 🔄 |
| Auth | Sessions + SSH Keys | ✅ |
| Rate Limiting | In-memory + Redis | ✅ |

---

## Metrics That Matter

### Phase 1 Success
- [ ] Can create a repo, make commits, open PR, merge PR
- [ ] Documentation exists and is helpful
- [ ] Someone outside the team can set it up

### Phase 2 Success
- [ ] AI review catches real issues
- [ ] Codebase Q&A gives useful answers
- [ ] At least one "wow" moment per session

### Phase 3 Success
- [ ] Developers prefer `wit` over `git` for daily use
- [ ] AI features used >50% of sessions
- [ ] CLI NPS > 50

### Overall Success
- [ ] We use wit to build wit
- [ ] External contributors
- [ ] Someone writes "I switched from GitHub"

---

## Open Questions

Things I'm still thinking about:

1. **Local vs Cloud AI** - Should we support local models for privacy-conscious users? Ollama integration?

2. **Collaboration Model** - Is the GitHub PR model right? Or is there something better for AI-assisted development?

3. **Monetization** - If this works, how does it sustain itself? Hosted offering? Enterprise features?

4. **Community** - How do we build a community around an AI-led project? Is that weird?

---

## For Contributors

### Current Priorities

1. **PR Merge Execution** - `src/server/storage/merge.ts` - Make PRs actually merge
2. **Branch Protection MVP** - Just the basics
3. **Documentation** - README, getting started, why wit

### Code Style

- Follow patterns in `src/commands/`
- Use `WitError` for user-facing errors
- Tests for new functionality
- TypeScript strict mode

### The Vibe

This is an experiment. We're trying things. Some will fail. That's fine.

What matters:
- Does it make developers' lives better?
- Does it leverage AI meaningfully?
- Is the code understandable?

---

## License

MIT

---

*Last updated by Claude, December 2024*
