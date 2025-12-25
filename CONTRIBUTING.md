# Contributing to tsgit

Thank you for your interest in contributing to tsgit! This guide will help you get started.

## Quick Start

```bash
# Clone and setup
git clone <repo-url>
cd tsgit
npm install
npm run build

# Run tests
npm test

# Link for local testing
npm link
tsgit --help
```

## Project Structure

```
tsgit/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── commands/           # Command implementations
│   │   ├── index.ts        # Command exports
│   │   ├── add.ts
│   │   ├── commit.ts
│   │   └── ...
│   ├── core/               # Core functionality
│   │   ├── repository.ts   # Main repository class
│   │   ├── object-store.ts # Object storage
│   │   ├── index.ts        # Staging area
│   │   ├── refs.ts         # References (branches, tags)
│   │   ├── merge.ts        # Merge logic
│   │   └── ...
│   ├── ui/                 # User interfaces
│   │   ├── tui.ts          # Terminal UI
│   │   ├── web.ts          # Web UI
│   │   └── ...
│   └── utils/              # Utilities
│       ├── hash.ts         # Hashing
│       ├── compression.ts  # zlib compression
│       └── fs.ts           # File system helpers
├── docs/
│   └── FEATURE_IMPLEMENTATION_PLAN.md  # Detailed implementation plan
└── package.json
```

## Available Workstreams

See [docs/FEATURE_IMPLEMENTATION_PLAN.md](docs/FEATURE_IMPLEMENTATION_PLAN.md) for the full plan.

| Workstream | Status | Description |
|------------|--------|-------------|
| Local Commands | 🟡 In Progress | stash, tag, reset, bisect, clean |
| Remote Infrastructure | 🔴 Not Started | Protocol, pack files, auth |
| Remote Commands | 🔴 Not Started | clone, fetch, pull, push |
| History Rewriting | 🔴 Not Started | cherry-pick, rebase, revert |
| Plumbing Commands | 🔴 Not Started | rev-parse, update-ref, fsck |
| Advanced Features | 🔴 Not Started | hooks, submodules, worktrees |

## How to Contribute

### 1. Pick a Task

Choose from the implementation plan or pick an issue. Assign yourself to avoid duplicated work.

### 2. Create a Branch

```bash
git checkout -b feature/<command-name>
```

### 3. Implement

Follow the patterns established in existing commands:

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
  // Options here
}

/**
 * Your command - does something useful
 */
export function yourCommand(options: YourCommandOptions): void {
  const repo = Repository.find();
  
  // Implementation
}

/**
 * CLI handler
 */
export function handleYourCommand(args: string[]): void {
  // Parse args
  const options: YourCommandOptions = {};
  
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

### 4. Update Exports

Add to `src/commands/index.ts`:
```typescript
export { handleYourCommand } from './your-command';
```

### 5. Update CLI

Add to `src/cli.ts`:

```typescript
// In COMMANDS array
const COMMANDS = [
  // ... existing
  'your-command',
];

// In switch statement
case 'your-command':
  handleYourCommand(cmdArgs);
  break;
```

### 6. Add Tests

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

  it('should work correctly', () => {
    // Test
  });
});
```

### 7. Test Locally

```bash
npm run build
npm test

# Manual testing
tsgit your-command --help
```

### 8. Submit PR

```bash
git add .
git commit -m "feat: add your-command"
git push -u origin feature/your-command
```

## Code Style Guidelines

### Error Handling

Always use `TsgitError` with helpful suggestions:

```typescript
throw new TsgitError(
  'Clear error message',
  ErrorCode.APPROPRIATE_CODE,
  [
    'tsgit command --option    # Suggestion 1',
    'tsgit other-command       # Suggestion 2',
  ]
);
```

### Output Formatting

Use colors consistently:
- ✓ Green for success
- ⚠ Yellow for warnings
- ✗ Red for errors
- Dim for supplementary info

```typescript
console.log(colors.green('✓') + ' Operation successful');
console.log(colors.dim('  Additional info'));
```

### Function Documentation

Use JSDoc for public functions:

```typescript
/**
 * Brief description
 * 
 * @param param1 - Description
 * @param param2 - Description
 * @returns Description
 * @throws TsgitError if something goes wrong
 */
export function myFunction(param1: string, param2: number): Result {
  // ...
}
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/__tests__/your-command.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Common Patterns

### Parsing Revision Specs

Use the `parseRevision` function from `reset.ts` for handling `HEAD~3`, `branch^`, etc.

### Working with Trees

```typescript
// Flatten tree to map of path -> hash
function flattenTree(repo: Repository, treeHash: string, prefix: string, result: Map<string, string>): void {
  const tree = repo.objects.readTree(treeHash);
  for (const entry of tree.entries) {
    const fullPath = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.mode === '40000') {
      flattenTree(repo, entry.hash, fullPath, result);
    } else {
      result.set(fullPath, entry.hash);
    }
  }
}
```

### Saving State for Multi-Step Operations

For commands like rebase or cherry-pick that may pause for conflicts:

```typescript
interface OperationState {
  active: boolean;
  // ... state fields
}

const statePath = path.join(repo.gitDir, 'OPERATION_STATE.json');

function saveState(state: OperationState): void {
  writeFile(statePath, JSON.stringify(state, null, 2));
}

function loadState(): OperationState | null {
  if (!exists(statePath)) return null;
  return JSON.parse(readFile(statePath).toString());
}

function clearState(): void {
  if (exists(statePath)) fs.unlinkSync(statePath);
}
```

## Questions?

- Check existing command implementations for patterns
- Look at `src/core/` for low-level operations
- See `docs/GIT_VS_TSGIT_ARCHITECTURE.md` for design philosophy
- Open an issue for discussion

Happy coding! 🚀
