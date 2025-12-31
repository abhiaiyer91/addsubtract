# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required Reading

**IMPORTANT**: Before starting any task, you MUST read the `ROADMAP.md` file in this repository. Pay special attention to the **Preface** and **Vision** sections, as they provide essential context about the project's direction and goals that should inform all implementation decisions.

## What is wit?

wit is a complete Git reimplementation in TypeScript with AI capabilities built into its core. It includes a CLI tool, a self-hosted Git platform (like GitHub), and a web UI.

## Common Commands

```bash
# Build
npm run build              # TypeScript compilation
npm run typecheck          # Type check without emitting

# Test
npm test                   # Run all tests (vitest)
npm test -- src/__tests__/stash.test.ts  # Run specific test file
npm run test:watch         # Watch mode
npm run test:unit          # Unit tests only (src/)
npm run test:e2e           # Integration tests (tests/integration/)
npm run test:coverage      # Coverage report

# Development
npm run dev:cli            # Run CLI directly with tsx (npx tsx src/cli.ts)
npm run wit -- <command>   # Run any wit command during dev
npm run dev:web            # Start web UI dev server (apps/web)

# Database (PostgreSQL via Docker)
npm run docker:db          # Start PostgreSQL container
npm run db:push            # Push schema to database
npm run db:generate        # Generate migrations
npm run db:migrate         # Run migrations
npm run db:studio          # Open Drizzle Studio

# Lint
npm run lint               # ESLint
```

## Architecture Overview

### Monorepo Structure (npm workspaces)

- **Root (`src/`)** - Core wit CLI and server
- **`apps/web/`** - React + Vite web UI (shadcn/ui, tRPC client, Zustand)
- **`apps/admin/`** - Admin dashboard

### Core Source Layout (`src/`)

| Directory | Purpose |
|-----------|---------|
| `cli.ts` | CLI entry point with all command definitions |
| `commands/` | 66+ CLI commands (add, commit, branch, merge, ai, etc.) |
| `core/` | Git internals - repository, object store, refs, merge, protocol |
| `ai/` | AI features using Mastra framework - agents, tools, workflows |
| `server/` | Hono HTTP server with middleware, routes, SSH, sandbox |
| `api/trpc/` | tRPC routers for all platform features |
| `db/` | Drizzle ORM schema and migrations (PostgreSQL) |
| `ui/` | Terminal UI components (OpenTUI + Solid.js) |

### Key Design Patterns

**Error Handling**: Use `TsgitError` with helpful suggestions:
```typescript
throw new TsgitError(
  'Branch "feature" does not exist',
  ErrorCode.BRANCH_NOT_FOUND,
  ['wit branch              # List all branches',
   'wit branch feature      # Create the branch']
);
```

**Console Output Colors**:
```typescript
console.log(colors.green('✓') + ' Operation successful');
console.log(colors.yellow('warning:') + ' Something to note');
console.error(colors.red('error:') + ' Something went wrong');
```

### Technology Stack

- **Backend**: Hono (web framework), tRPC (API), Drizzle ORM (PostgreSQL), better-auth
- **AI**: Mastra framework, Vercel AI SDK, supports OpenAI/Anthropic/OpenRouter
- **Frontend**: React 19, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Zustand
- **TUI**: OpenTUI + Solid.js

### Database

PostgreSQL with Drizzle ORM. Schema files:
- `src/db/schema.ts` - Main application schema
- `src/db/auth-schema.ts` - Authentication schema

### Environment Variables

Copy `.env.example` to `.env`. Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Auth secret (required in production)
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` - For AI features
- `REPOS_DIR` - Where git repositories are stored (default: `./repos`)

## Testing Notes

- Tests use vitest with 30-second timeout for integration tests
- Integration tests run sequentially (`fileParallelism: false`) to avoid port conflicts
- Test files located in `src/__tests__/` and `tests/integration/`

## Reference Files

When implementing new features, use these as templates:
- Simple command: `src/commands/wip.ts`
- Complex command: `src/commands/merge.ts`
- AI tool: `src/ai/tools/commit.ts`
- Test file: `src/__tests__/stash.test.ts`
