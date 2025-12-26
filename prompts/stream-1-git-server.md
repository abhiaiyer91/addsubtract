# Stream 1: Git Server Implementation

## Mission

Build a Git server that accepts push/pull operations over HTTP, enabling self-hosted repository hosting.

## Context

You are working on `wit`, a modern Git implementation in TypeScript. The core Git functionality (objects, packfiles, refs) already exists in `src/core/`. Your job is to create an HTTP server that exposes these capabilities so users can:

```bash
# Start the server
wit serve --port 3000

# From another machine/terminal
wit clone http://localhost:3000/myuser/myrepo.git
wit push origin main
```

## Existing Code to Leverage

The following modules already exist and should be reused:

### `src/core/protocol/smart-http.ts`

- `SmartHttpClient` - Client-side implementation of Git Smart HTTP
- `parsePktLines()`, `pktLine()`, `pktFlush()` - Packet line utilities
- Use this as reference for the protocol format

### `src/core/protocol/pack.ts`

- `readPackHeader()`, `writePackHeader()`
- Pack file parsing utilities

### `src/core/protocol/packfile-writer.ts`

- `createPackfile()` - Creates pack files from objects

### `src/core/repository.ts`

- `Repository` class - Full git repository operations
- `Repository.init()` - Initialize new repos
- `repo.objects` - Object store access

### `src/core/object-store.ts`

- `ObjectStore` - Read/write git objects

### `src/core/refs.ts`

- `RefManager` - Manage references (branches, tags)

## Deliverables

### 1. Create `src/server/index.ts`

Main server entry point using Hono:

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { gitRoutes } from "./routes/git";

const app = new Hono();

// Git Smart HTTP endpoints
app.route("/", gitRoutes);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

export function startServer(options: { port: number; reposDir: string }) {
  // Store reposDir in app context
  // Start server
}
```

### 2. Create `src/server/routes/git.ts`

Implement Git Smart HTTP protocol endpoints:

```typescript
import { Hono } from "hono";

export const gitRoutes = new Hono();

// GET /:owner/:repo/info/refs?service=git-upload-pack
// Returns refs for clone/fetch
gitRoutes.get("/:owner/:repo/info/refs", async (c) => {
  const service = c.req.query("service");
  const { owner, repo } = c.req.param();

  if (service === "git-upload-pack") {
    // Return refs for fetch/clone
    // Format: pkt-line encoded refs with capabilities
  } else if (service === "git-receive-pack") {
    // Return refs for push
  }
});

// POST /:owner/:repo/git-upload-pack
// Handles fetch/clone - client sends wants, server sends pack
gitRoutes.post("/:owner/:repo/git-upload-pack", async (c) => {
  // 1. Parse client's want/have lines
  // 2. Determine objects to send
  // 3. Create and send packfile
});

// POST /:owner/:repo/git-receive-pack
// Handles push - client sends pack, server unpacks
gitRoutes.post("/:owner/:repo/git-receive-pack", async (c) => {
  // 1. Parse ref update commands
  // 2. Receive and unpack packfile
  // 3. Update refs
  // 4. Send status response
});
```

### 3. Create `src/server/storage/repos.ts`

Repository management:

```typescript
export class RepoManager {
  constructor(private baseDir: string) {}

  // Get or create repository
  getRepo(owner: string, name: string): Repository {
    const repoPath = path.join(this.baseDir, owner, `${name}.git`);
    if (!exists(repoPath)) {
      return Repository.init(repoPath, { bare: true });
    }
    return new Repository(repoPath);
  }

  // List all repositories
  listRepos(): { owner: string; name: string }[] {}

  // Check if repo exists
  exists(owner: string, name: string): boolean {}
}
```

### 4. Create `src/commands/serve.ts`

CLI command to start the server:

```typescript
export function handleServe(args: string[]): void {
  const port = getOption(args, "--port", "3000");
  const reposDir = getOption(args, "--repos", "./repos");

  console.log(`Starting wit server on port ${port}`);
  console.log(`Repositories directory: ${reposDir}`);

  startServer({ port: parseInt(port), reposDir });
}
```

### 5. Update `src/cli.ts`

Add the serve command:

```typescript
case 'serve':
  handleServe(args.slice(1));
  break;
```

## Git Smart HTTP Protocol Reference

### Info/Refs Response Format

```
001e# service=git-upload-pack\n
0000
00a1<sha> refs/heads/main\0capability1 capability2...\n
003f<sha> refs/heads/feature\n
0000
```

### Upload-Pack Request (Clone/Fetch)

Client sends:

```
0032want <sha> capability1 capability2\n
0032want <sha>\n
0000
0009done\n
```

Server responds with packfile containing requested objects.

### Receive-Pack Request (Push)

Client sends:

```
00a4<old-sha> <new-sha> refs/heads/main\0report-status\n
0000
PACK<binary pack data>
```

Server responds:

```
0030\x01000eunpack ok\n
0019ok refs/heads/main\n
0000
```

## Testing

Create tests in `src/server/__tests__/`:

```typescript
describe("Git Server", () => {
  it("should return refs for info/refs", async () => {
    // Test ref discovery
  });

  it("should handle clone via upload-pack", async () => {
    // Test clone operation
  });

  it("should handle push via receive-pack", async () => {
    // Test push operation
  });
});
```

## Success Criteria

1. `wit serve` starts an HTTP server
2. `wit clone http://localhost:3000/user/repo.git` works
3. `wit push origin main` to the server works
4. Multiple repositories can be hosted
5. Server handles concurrent requests

## Dependencies to Add

```json
{
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0"
  }
}
```

## File Structure

```
src/server/
├── index.ts              # Server entry, startServer()
├── routes/
│   └── git.ts            # Git Smart HTTP endpoints
├── storage/
│   └── repos.ts          # Repository management
├── middleware/
│   └── auth.ts           # (Future) Authentication
└── __tests__/
    └── git.test.ts       # Integration tests
```

## Notes

- Start simple: get clone working first, then push
- Use existing `SmartHttpClient` as reference for protocol format
- Bare repositories (no working directory) for server-side storage
- Log all operations for debugging
- Handle errors gracefully with proper HTTP status codes
