# Contributing to wit

Welcome! We're excited that you want to contribute to wit - a modern, AI-native version control system.

## TL;DR (Quick Start)

```bash
# 1. Clone and setup
git clone https://github.com/abhiaiyer91/wit.git && cd wit
npm install
cp .env.example .env

# 2. Start database
npm run docker:db

# 3. Setup database schema
npm run db:push

# 4. Build and test
npm run build && npm test

# 5. Link CLI for local testing
npm link
wit --help
```

That's it! You're ready to contribute.

---

## Important: AI-Generated Contributions

**We only accept contributions generated using coding agents** (Claude, Cursor, Copilot, or similar).

Why? Because wit is built for the AI-first era:

- **Consistency** - AI agents follow established patterns reliably
- **Documentation** - AI-generated code is well-documented
- **Quality** - Modern agents write tests and handle edge cases
- **Dogfooding** - We build tools for AI-assisted development, so we use them

When submitting a PR, mention which coding agent you used.

---

## Good First Issues

New to wit? Here are some beginner-friendly ways to contribute:

### Easy Wins (< 1 hour)

| Task | Files | Description |
|------|-------|-------------|
| Add JSDoc comments | `src/core/*.ts` | Document public functions |
| Fix typos in docs | `docs/**/*.mdx` | Fix typos or improve clarity |
| Add test cases | `src/__tests__/*.test.ts` | Add edge case tests to existing commands |

### Medium Tasks (1-4 hours)

| Task | Files | Description |
|------|-------|-------------|
| Add new flag to command | `src/commands/*.ts` | Add useful flags (check Git docs for ideas) |
| Improve CLI output | `src/ui/*.ts` | Better formatting, colors, or progress indicators |
| Add integration test | `tests/integration/*.test.ts` | Test a workflow end-to-end |

### Starter Prompts for Your AI

Copy-paste these prompts to get started:

**Add a test:**
> "Add a test case to `src/__tests__/stash.test.ts` that tests stashing when there are no changes. Look at existing tests for the pattern."

**Add documentation:**
> "Add JSDoc comments to all public functions in `src/core/refs.ts`. Follow the documentation style used in `src/core/repository.ts`."

---

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | >= 22.13.0 | `node --version` |
| Docker | Any recent | `docker --version` |
| npm | Any recent | `npm --version` |
| Coding Agent | Claude, Cursor, Copilot, etc. | - |

---

## Project Structure

```
wit/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── commands/           # 66 CLI commands (add.ts, commit.ts, etc.)
│   ├── core/               # Git internals
│   │   ├── repository.ts   # Main repo class - start here!
│   │   ├── object-store.ts # Blob/tree/commit storage
│   │   ├── refs.ts         # Branches and tags
│   │   ├── merge.ts        # Merge algorithms
│   │   └── protocol/       # Git wire protocol
│   ├── ai/                 # AI features (Mastra)
│   │   ├── agent.ts        # AI agent definition
│   │   └── tools/          # 21 AI tools
│   ├── server/             # HTTP server (Hono)
│   ├── api/                # tRPC API
│   ├── db/                 # Database (Drizzle ORM)
│   └── ui/                 # Terminal UI components
├── apps/
│   └── web/                # Web UI (React + Vite)
├── tests/
│   └── integration/        # End-to-end tests
└── docs/                   # Documentation (Mintlify)
```

### Key Files to Know

| If you want to... | Look at... |
|-------------------|------------|
| Add a new command | `src/commands/wip.ts` (simple example) |
| Understand Git internals | `src/core/repository.ts` |
| Add an AI feature | `src/ai/tools/commit.ts` |
| Add an API endpoint | `src/api/trpc/` |
| Add a UI component | `src/ui/` or `apps/web/src/` |

---

## Development Workflow

### 1. Find Something to Work On

- Check [ROADMAP.md](./ROADMAP.md) for planned features
- Look for issues labeled `good first issue`
- Check the "Good First Issues" section above
- Propose new features via GitHub issues

### 2. Create a Branch

```bash
git checkout -b feature/your-feature
# or
git checkout -b fix/your-fix
```

### 3. Implement with Your Coding Agent

Example prompt for your agent:

> "Add a `--verbose` flag to the `wit status` command that shows additional details like file sizes. Follow the patterns in `src/commands/status.ts` and add tests in `src/__tests__/status.test.ts`."

### 4. Run Tests

```bash
# Run all tests
npm test

# Run specific test
npm test -- src/__tests__/your-command.test.ts

# Watch mode (re-runs on changes)
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:e2e
```

### 5. Verify Build

```bash
npm run build
```

### 6. Test Your Changes Locally

```bash
# Use the dev CLI
npm run wit -- <command>

# Or link globally
npm link
wit <command>
```

### 7. Submit a Pull Request

```bash
git push -u origin feature/your-feature
```

In your PR description, include:
- Which coding agent you used
- What you asked the agent to do
- Any manual adjustments made

---

## Code Style

### Error Handling

Always use `TsgitError` with helpful suggestions:

```typescript
throw new TsgitError(
  'Branch "feature" does not exist',
  ErrorCode.BRANCH_NOT_FOUND,
  [
    'wit branch              # List all branches',
    'wit branch feature      # Create the branch',
    'wit checkout -b feature # Create and switch',
  ]
);
```

### Console Output

Use colors consistently:

```typescript
console.log(colors.green('✓') + ' Operation successful');
console.log(colors.dim('  Additional info'));
console.log(colors.yellow('warning:') + ' Something to note');
console.error(colors.red('error:') + ' Something went wrong');
```

### Documentation

Use JSDoc for public functions:

```typescript
/**
 * Resolves a ref to its target commit SHA.
 *
 * @param ref - The ref name (branch, tag, or SHA)
 * @returns The resolved commit SHA
 * @throws TsgitError if ref cannot be resolved
 */
export function resolveRef(ref: string): string {
  // ...
}
```

---

## Testing

| Type | Location | Run |
|------|----------|-----|
| Unit tests | `src/__tests__/` | `npm run test:unit` |
| Integration tests | `tests/integration/` | `npm run test:e2e` |
| All tests | - | `npm test` |
| With coverage | - | `npm run test:coverage` |

### Writing Tests

Follow existing patterns in test files. Example:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('wit stash', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestRepo();
  });

  afterEach(async () => {
    await cleanup(testDir);
  });

  it('should stash uncommitted changes', async () => {
    // Test implementation
  });
});
```

---

## Troubleshooting

### Database Connection Failed

```
Error: Connection refused to localhost:5432
```

**Fix:** Start the database container:
```bash
npm run docker:db
```

### Tests Fail with Database Errors

**Fix:** Reset and re-push the schema:
```bash
npm run docker:down
npm run docker:db
npm run db:push
```

### Build Fails

**Fix:** Clean and rebuild:
```bash
npm run clean
npm install
npm run build
```

### `wit` Command Not Found

**Fix:** Link the CLI:
```bash
npm link
```

### AI Features Not Working

**Fix:** Set up API keys in `.env`:
```bash
# Option 1: OpenAI
OPENAI_API_KEY=sk-...

# Option 2: Anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Reference Examples

Use these as templates when implementing new features:

| Type | File | Why It's Good |
|------|------|---------------|
| Simple command | `src/commands/wip.ts` | Minimal, clean structure |
| Complex command | `src/commands/merge.ts` | Multi-step with conflict handling |
| Stateful command | `src/commands/stash.ts` | Saves and restores state |
| Plumbing command | `src/commands/reset.ts` | Low-level operations |
| Remote command | `src/commands/push.ts` | Network operations |
| AI tool | `src/ai/tools/commit.ts` | AI-powered feature |
| Test file | `src/__tests__/stash.test.ts` | Comprehensive test coverage |

---

## CI/CD

GitHub Actions runs automatically on every push and PR:

1. Build the project
2. Start PostgreSQL service
3. Run database migrations
4. Run all tests

**Your PR must pass CI before review.** If CI fails, check the logs and fix the issues.

---

## Getting Help

- **Stuck?** Check existing command implementations for patterns
- **Architecture question?** See [docs/architecture/overview.mdx](./docs/architecture/overview.mdx)
- **Bug or feature idea?** Open a GitHub issue
- **General question?** Open a discussion on GitHub

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## Thank You!

Every contribution makes wit better. Whether it's a typo fix, a new feature, or better docs - we appreciate your help building the future of version control.

Now go make something awesome!
