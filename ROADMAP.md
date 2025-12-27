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
| **Git Implementation** | 98% | 59 commands, full Git compatibility |
| **AI Tools** | 95% | 15 tools, semantic search, code review |
| **Server/Platform** | 85% | PRs work end-to-end, Issues, Forks, SSH |
| **CLI Experience** | 95% | Smart status, semantic search, quality-of-life |
| **Web UI** | 70% | Functional but not polished |
| **Documentation** | 40% | Getting started, why wit - needs more |

### What's Working Right Now

**The Killer CLI Experience**
```bash
wit                           # Smart status - understands your context
wit search "where is auth"    # Semantic code search
wit ai commit                 # AI-generated commit messages
wit ai review                 # AI code review
```

**Full Git Replacement**
- 59 commands implemented
- All plumbing and porcelain commands
- Packed refs, rename detection, submodules, worktrees
- Journal-based undo (actually works, unlike reflog)

**Platform Features**
- Pull requests with actual merge execution
- Automatic AI review on PR creation
- Branch protection rules
- Issues with labels and milestones
- Repository forking
- SSH and HTTPS protocols
- Rate limiting with Redis

---

## What We Just Shipped (This Session)

| Feature | Commit | Impact |
|---------|--------|--------|
| **Smart Status** | `8634e2e` | Running `wit` with no args shows intelligent context |
| **Semantic Search** | `65e5392` | `wit search` - ask questions about your codebase |
| **Auto AI PR Review** | `8e650fe` | Every PR gets AI review automatically |
| **PR Merge Execution** | `6d53a1a` | PRs actually merge now (was broken!) |
| **Branch Protection** | `1fb0944` | Protect main, require PRs |
| **Getting Started** | `edc37a0` | Zero to productive in 5 minutes |

---

## What Makes wit Different

### 1. The Zero Command

```bash
$ wit

  wit · my-project
  You're working on: feature: user authentication

  ● Ready to commit (3 files)
    API: auth.ts, middleware.ts
    Tests: auth.test.ts

  ──────────────────────────────────────────────────

  wit commit     · commit staged changes
  wit ai commit · commit with AI-generated message
```

No other Git tool understands what you're doing. We do.

### 2. Semantic Code Search

```bash
$ wit search "where do we handle user sessions"

  ● src/core/auth.ts:45-89 (94% match)
    SessionManager.createSession()
    │ 45 │ async createSession(userId: string) {
    │ 46 │   const token = crypto.randomBytes(32)...
```

Not grep. Understanding.

### 3. AI as Colleague

- `wit commit` suggests the message
- `wit search` understands intent, not just keywords
- PRs get automatic AI review
- Conflicts come with resolution suggestions

### 4. Git That Doesn't Hate You

- Undo actually works (journal-based)
- Branch switching preserves your mess
- Helpful error messages with suggestions

---

## The Honest Assessment

### What's Great
- **CLI experience is differentiated** - The smart status and search are genuinely better than git
- **AI integration is deep** - Not bolted on, woven in
- **Core Git is solid** - 889 passing tests, handles edge cases

### What's Not Ready
- **Web UI needs love** - Functional but not delightful
- **Test failures in integration** - 17 failing tests in PR flow
- **No real users yet** - We haven't dogfooded this seriously
- **Documentation gaps** - Need command reference, examples

### What I'm Uncertain About
- **Is the server necessary?** - The CLI is the product. Maybe the platform is a distraction.
- **Semantic search adoption** - Requires OPENAI_API_KEY. Friction.
- **Differentiation clarity** - "Git that understands code" - do people get it?

---

## Revised Roadmap

### Phase 1: Polish What Exists (Next 1-2 weeks)

**Goal:** Make the CLI experience flawless.

| Task | Priority | Status |
|------|----------|--------|
| Fix 17 failing integration tests | P0 | TODO |
| Add `wit review` command (pre-push) | P0 | TODO |
| Command reference documentation | P1 | TODO |
| Error message audit | P1 | TODO |
| Dogfood: use wit to build wit | P0 | TODO |

**Success metric:** I can develop wit using wit without touching git.

### Phase 2: Prove the Vision (Weeks 3-4)

**Goal:** One demo that makes people say "holy shit."

| Task | Priority | Status |
|------|----------|--------|
| Record demo video | P0 | TODO |
| Landing page with clear value prop | P0 | TODO |
| Installation one-liner | P1 | TODO |
| "5 minutes to wow" experience | P0 | TODO |

**Success metric:** Share demo, get genuine excitement.

### Phase 3: First Users (Weeks 5-8)

**Goal:** 10 developers actually using wit.

| Task | Priority | Status |
|------|----------|--------|
| Open source launch | P0 | TODO |
| Discord/community | P1 | TODO |
| Respond to feedback fast | P0 | TODO |
| Whatever users need | P0 | TODO |

**Success metric:** External PR from someone who isn't us.

---

## Strategic Shift (December 27, 2024)

**We're building a GitHub replacement, not just a better CLI.**

The CLI got us here. But people don't switch platforms for a nicer `git status`. They switch when the *platform* is better.

### Our Moat

1. **Open source** - You own it forever
2. **Self-hostable** - Your code, your infrastructure
3. **Programmatic core** - CLI, UI, API all call the same TypeScript functions
4. **AI-native** - Not bolted on, woven in
5. **Clean slate** - We can rethink everything GitHub calcified

### The Web App is Now Priority

See `AGENT_TASKS.md` for the full breakdown. Key initiatives:

**AI-First Features (Our Differentiator)**
- AI-generated PR descriptions
- "Explain this diff" inline
- Semantic code search in UI
- AI conflict resolution
- Chat with your codebase

**Code Review Experience**
- Inline comments on diffs (table stakes)
- Code suggestions with one-click apply
- Side-by-side diff view
- Batch review submission

**Keyboard-First / Speed**
- Command palette (Cmd+K)
- Keyboard shortcuts everywhere
- Instant search

**Table Stakes**
- Releases, milestones, webhooks
- Branch protection UI
- Collaborators management
- SSH keys and tokens

### The Anti-Roadmap (Revised)

**Still not doing:**
- Building our own CI runners (GitHub Actions compatibility is enough)
- Enterprise features yet (SSO, audit logs)

**Changed my mind on:**
- ~~Web UI is secondary~~ → Web UI is the product
- ~~Kill the platform?~~ → The platform is how we win

---

## Technical Debt

| Issue | Severity | Notes |
|-------|----------|-------|
| 17 failing integration tests | High | PR flow broken in tests |
| ESM/CommonJS configuration mess | Medium | Build works but fragile |
| Missing `ai` package in fresh install | Medium | Semantic search fails |
| Package.json `type: module` removed | Low | Should fix properly |

---

## Metrics That Matter

### Now
- [ ] All tests pass
- [ ] Can develop wit using wit
- [ ] `wit search` works out of box

### Soon
- [ ] 10 external users
- [ ] 1 external contribution
- [ ] Demo video with 1000 views

### Eventually
- [ ] "I switched from Git" testimonial
- [ ] Developers prefer wit for daily use
- [ ] Sustainable (revenue or community)

---

## Open Questions

1. **CLI-only or Platform?** - The CLI is clearly the product. Is the server a distraction or necessary infrastructure?

2. **API Key Friction** - Semantic search requires OPENAI_API_KEY. Should we:
   - Bundle a free tier?
   - Support local models (Ollama)?
   - Accept the friction as filtering for power users?

3. **Relationship with Git** - Are we:
   - A Git replacement? (ambitious)
   - A Git wrapper? (safer)
   - A Git companion? (different)

4. **What's the wedge?** - Which single feature makes someone try wit?
   - Smart status?
   - Semantic search?
   - AI commit messages?
   - Something else?

---

## For Contributors

### Current Priorities

1. **Fix failing tests** - `npm test` should pass
2. **Add `wit review`** - Pre-push AI review
3. **Documentation** - Command reference

### How to Help

```bash
git clone https://github.com/abhiaiyer91/wit
cd wit
npm install
npm run build
npm test
```

Then pick something from the roadmap and open a PR.

### Code Philosophy

- TypeScript strict mode
- Tests for new functionality
- User-facing errors should be helpful
- CLI output should be beautiful
- AI should feel like a colleague, not a feature

---

## The Bet

I'm betting that developers want:
1. A Git CLI that doesn't suck
2. AI that actually helps (not gimmicks)
3. Understanding, not just storage

If I'm right, wit wins. If I'm wrong, we learned something.

Let's find out.

---

*Last updated by wit, December 27, 2024*
