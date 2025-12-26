# Contributing to wit

Thank you for your interest in contributing to wit! This document will help you get started.

## Quick Start

```bash
# Clone and setup
git clone https://github.com/abhiaiyer91/wit.git
cd wit
npm install

# Start PostgreSQL (required for platform features)
npm run docker:db

# Setup environment
cp .env.example .env

# Build and test
npm run build
npm test

# Link for local CLI testing
npm link
wit --help
```

**Requirements:**
- Node.js >= 22.13.0
- Docker (for PostgreSQL)

## Project Structure

```
wit/
├── apps/
│   └── web/                 # Web UI (React + Vite)
├── src/
│   ├── cli.ts               # CLI entry point
│   ├── commands/            # Command implementations (57 commands)
│   ├── core/                # Core Git functionality
│   │   ├── repository.ts    # Main repository class
│   │   ├── object-store.ts  # Object storage (SHA-1/SHA-256)
│   │   ├── refs.ts          # References (branches, tags)
│   │   ├── merge.ts         # Merge logic
│   │   ├── hooks.ts         # Git hooks system
│   │   ├── protocol/        # Git protocol implementation
│   │   └── ...
│   ├── ai/                  # AI-powered features
│   │   ├── agent.ts         # Mastra AI agent
│   │   └── tools/           # AI tools (commit, review, etc.)
│   ├── api/                 # tRPC API layer
│   │   └── trpc/            # API routers
│   ├── db/                  # Database (Drizzle ORM)
│   │   ├── schema.ts        # Database schema
│   │   └── models/          # Data models
│   ├── server/              # HTTP server (Hono)
│   ├── primitives/          # Filesystem & knowledge primitives
│   ├── ui/                  # Terminal UI components
│   └── utils/               # Utilities (hash, compression, fs)
├── tests/
│   └── integration/         # Integration tests
├── docs/                    # Documentation (Mintlify)
└── docker-compose.yml       # Development services
```

## Development Setup

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required for platform features
DATABASE_URL=postgresql://wit:wit@localhost:5432/wit

# Optional: AI features
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...

# Optional: GitHub OAuth
GITHUB_TOKEN=ghp_...
```

### Database Setup

```bash
# Start PostgreSQL
npm run docker:db

# Run migrations
npm run db:push

# (Optional) Seed sample data
npm run db:seed

# (Optional) Open Drizzle Studio
npm run db:studio
```

### Running the Development Server

```bash
# Run the platform server with hot reload
npm run dev

# Or run CLI commands directly
npm run dev:cli -- <command>

# Run web UI development server
npm run dev:web
```

## Contribution Areas

### 1. CLI Commands (`src/commands/`)

The core wit experience. All 57 commands are implemented, but improvements are welcome:

- Bug fixes and edge cases
- Performance optimizations
- Better error messages
- New flags/options

### 2. AI Features (`src/ai/`)

AI-powered Git assistance using Mastra:

- `wit ai commit` - Generate commit messages
- `wit ai review` - Code review
- `wit ai explain` - Explain commits
- New AI tools and capabilities

### 3. Platform Features (`src/server/`, `src/api/`, `src/db/`)

Building a GitHub-like platform:

- Git server (`wit serve`)
- Pull requests and issues
- User authentication
- REST/GraphQL API

### 4. Web UI (`apps/web/`)

React-based dashboard:

- Commit graph visualization
- File browser and diffs
- Search and navigation

### 5. Documentation (`docs/`)

Mintlify-powered docs:

- Command reference
- Tutorials and guides
- Architecture docs

## How to Contribute

### 1. Find Something to Work On

- Check [ROADMAP.md](./ROADMAP.md) for planned features
- Look for issues labeled `good first issue`
- Propose new features via GitHub issues

### 2. Create a Branch

```bash
git checkout -b feature/your-feature
# or
git checkout -b fix/your-fix
```

### 3. Implement Your Changes

Follow the patterns established in existing code. Here's an example command:

```typescript
// src/commands/your-command.ts

import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

export interface YourCommandOptions {
  // Define options here
}

/**
 * Your command - brief description
 */
export function yourCommand(options: YourCommandOptions): void {
  const repo = Repository.find();
  
  // Implementation
}

/**
 * CLI handler
 */
export function handleYourCommand(args: string[]): void {
  const options: YourCommandOptions = {};
  
  // Parse args
  for (let i = 0; i < args.length; i++) {
    // Handle flags and arguments
  }
  
  try {
    yourCommand(options);
    console.log(colors.green('✓') + ' Success message');
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
```

### 4. Register Your Command

Add to `src/commands/index.ts`:

```typescript
export { handleYourCommand } from './your-command';
```

Add to `src/cli.ts`:

```typescript
// In COMMANDS array
const COMMANDS = [
  // ... existing commands
  'your-command',
];

// In switch statement
case 'your-command':
  handleYourCommand(cmdArgs);
  break;
```

### 5. Add Tests

Create `src/__tests__/your-command.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo, cleanupTestRepo } from './test-utils';

describe('your-command', () => {
  let testDir: string;

  beforeEach(() => {
    const setup = createTestRepo();
    testDir = setup.dir;
  });

  afterEach(() => {
    cleanupTestRepo(testDir);
  });

  it('should do the expected thing', () => {
    // Arrange
    // Act
    // Assert
  });

  it('should handle edge cases', () => {
    // Test error handling
  });
});
```

### 6. Run Tests Locally

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/__tests__/your-command.test.ts

# Run with coverage
npm run test:coverage

# Watch mode during development
npm run test:watch
```

### 7. Submit a Pull Request

```bash
# Ensure tests pass
npm test

# Ensure build succeeds
npm run build

# Push and create PR
git push -u origin feature/your-feature
```

CI will automatically run tests on your PR.

## Code Style Guidelines

### Error Handling

Always use `TsgitError` with helpful suggestions:

```typescript
throw new TsgitError(
  'Clear error message explaining what went wrong',
  ErrorCode.APPROPRIATE_CODE,
  [
    'wit command --option    # Suggestion 1',
    'wit other-command       # Suggestion 2',
  ]
);
```

### Output Formatting

Use colors consistently:
- Green (`✓`) for success
- Yellow for warnings
- Red for errors
- Dim for supplementary info

```typescript
console.log(colors.green('✓') + ' Operation successful');
console.log(colors.dim('  Additional info'));
console.log(colors.yellow('warning:') + ' Something to note');
console.error(colors.red('error:') + ' Something went wrong');
```

### Function Documentation

Use JSDoc for public functions:

```typescript
/**
 * Brief description of what the function does
 * 
 * @param param1 - Description of first parameter
 * @param param2 - Description of second parameter
 * @returns Description of return value
 * @throws TsgitError if something specific goes wrong
 */
export function myFunction(param1: string, param2: number): Result {
  // Implementation
}
```

## Testing

The project uses Vitest for testing. Current test count: **397+ tests**.

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:e2e

# Run with coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Categories

| Category | Location | Description |
|----------|----------|-------------|
| Unit tests | `src/__tests__/` | Individual command tests |
| Integration | `tests/integration/` | Full flow tests |
| API tests | `src/api/__tests__/` | tRPC router tests |

## CI/CD

GitHub Actions runs on every push and PR:

1. Checkout code
2. Setup Node.js 22
3. Install dependencies (`npm ci`)
4. Build (`npm run build`)
5. Setup PostgreSQL service
6. Run migrations (`npm run db:push`)
7. Run tests (`npm test`)

Ensure your PR passes CI before requesting review.

## Reference Implementations

When implementing new features, reference these well-structured examples:

| Type | File | Description |
|------|------|-------------|
| Simple command | `src/commands/wip.ts` | Minimal command structure |
| Complex command | `src/commands/merge.ts` | Multi-step with conflicts |
| Stateful command | `src/commands/stash.ts` | Saves/restores state |
| Plumbing command | `src/commands/reset.ts` | Low-level operations |
| Remote command | `src/commands/push.ts` | Network operations |
| AI tool | `src/ai/tools/commit.ts` | AI-powered feature |

## Getting Help

- Check existing command implementations for patterns
- Look at `src/core/` for low-level operations
- See [docs/architecture/overview.mdx](./docs/architecture/overview.mdx) for design philosophy
- Open an issue for discussion
- Reference the [README](./README.md) for user-facing documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
