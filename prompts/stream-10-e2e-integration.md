# Stream 10: End-to-End Integration

## Mission

Wire everything together: Server + Database + tRPC API in a single running application. Ensure all components work together and add tests.

## Context

We have built separately:

- **Git Server** (`src/server/`) - HTTP endpoints for push/pull
- **Database** (`src/db/`) - Drizzle schema + models
- **tRPC API** (`src/api/trpc/`) - Type-safe routers
- **Web App** (`apps/web/`) - Vite + React frontend
- **Primitives** (`src/primitives/`) - Knowledge + Filesystem

These need to be wired together into a cohesive system.

## Key Tasks

### 1. Unified Server Entry Point

Update `src/server/index.ts` to include all routes:

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { trpcServer } from "@hono/trpc-server";

// Routes
import { gitRoutes } from "./routes/git";
import { appRouter } from "../api/trpc/routers";
import { createContext } from "../api/trpc/context";

// Database
import { initDatabase, healthCheck as dbHealthCheck } from "../db";

// Storage
import { RepoManager } from "./storage/repos";

export async function startServer(options: ServerOptions) {
  const { port = 3000, reposPath = "./repos", host = "0.0.0.0" } = options;

  // Initialize database
  await initDatabase();
  console.log("✓ Database connected");

  // Initialize repo storage
  const repoManager = new RepoManager(reposPath);
  console.log(`✓ Repos directory: ${reposPath}`);

  // Create app
  const app = new Hono();

  // CORS for web app
  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173", "http://localhost:3000"],
      credentials: true,
    })
  );

  // Health check
  app.get("/health", async (c) => {
    const dbStatus = await dbHealthCheck();
    return c.json({
      status: dbStatus.connected ? "healthy" : "degraded",
      services: {
        server: "up",
        database: dbStatus.connected ? "up" : "down",
        repos: repoManager.listRepos().length,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Git Smart HTTP protocol routes
  app.route("/:owner/:repo.git", gitRoutes);

  // tRPC API
  app.use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      createContext,
    })
  );

  // Static files for web app (production)
  // app.use('/*', serveStatic({ root: './apps/web/dist' }))

  // Start server
  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  console.log(`\n🚀 wit server running at http://${host}:${port}`);
  console.log(`   Git:  http://${host}:${port}/:owner/:repo.git`);
  console.log(`   API:  http://${host}:${port}/trpc`);
  console.log(`   Health: http://${host}:${port}/health\n`);
}
```

### 2. Environment Configuration

Create `.env.example`:

```bash
# Database
DATABASE_URL=postgresql://localhost:5432/wit

# Server
PORT=3000
HOST=0.0.0.0
REPOS_PATH=./repos

# Auth
JWT_SECRET=your-secret-key-here
SESSION_DURATION=7d

# AI (optional)
OPENAI_API_KEY=sk-...
AI_REVIEW_ENABLED=false

# GitHub OAuth (for wit CLI)
WIT_GITHUB_CLIENT_ID=Ov23liMqOvVmaVU7515C
```

### 3. Docker Compose Setup

Create `docker-compose.yml`:

```yaml
version: "3.8"

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: wit
      POSTGRES_PASSWORD: wit
      POSTGRES_DB: wit
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wit"]
      interval: 5s
      timeout: 5s
      retries: 5

  server:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://wit:wit@db:5432/wit
      PORT: 3000
      REPOS_PATH: /repos
    volumes:
      - repos_data:/repos
    depends_on:
      db:
        condition: service_healthy

volumes:
  postgres_data:
  repos_data:
```

### 4. Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Create repos directory
RUN mkdir -p /repos

EXPOSE 3000

CMD ["node", "dist/server/index.js", "serve", "--port", "3000"]
```

### 5. Integration Tests

Create `tests/integration/full-flow.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../src/api/trpc/routers";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const API_URL = "http://localhost:3000";

// tRPC client for tests
const api = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
    }),
  ],
});

describe("E2E Integration", () => {
  describe("Health Check", () => {
    it("returns healthy status", async () => {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();

      expect(data.status).toBe("healthy");
      expect(data.services.server).toBe("up");
      expect(data.services.database).toBe("up");
    });
  });

  describe("User Flow", () => {
    let sessionToken: string;
    let userId: string;

    it("registers a new user", async () => {
      const user = await api.auth.register.mutate({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
        name: "Test User",
      });

      expect(user.username).toBe("testuser");
      userId = user.id;
    });

    it("logs in", async () => {
      const session = await api.auth.login.mutate({
        usernameOrEmail: "testuser",
        password: "password123",
      });

      expect(session.sessionId).toBeDefined();
      sessionToken = session.sessionId;
    });

    it("gets current user", async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      const user = await authApi.auth.me.query();

      expect(user.username).toBe("testuser");
    });
  });

  describe("Repository Flow", () => {
    let repoId: string;

    it("creates a repository", async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      const repo = await authApi.repos.create.mutate({
        name: "test-repo",
        description: "A test repository",
        isPrivate: false,
      });

      expect(repo.name).toBe("test-repo");
      repoId = repo.id;
    });

    it("pushes to repository via Git", async () => {
      // Create temp directory
      await execAsync("rm -rf /tmp/test-repo && mkdir /tmp/test-repo");

      // Initialize wit repo
      await execAsync("cd /tmp/test-repo && wit init");
      await execAsync(
        'cd /tmp/test-repo && echo "# Test" > README.md && wit add . && wit commit -m "Initial"'
      );
      await execAsync(
        `cd /tmp/test-repo && wit remote add origin ${API_URL}/testuser/test-repo.git`
      );
      await execAsync("cd /tmp/test-repo && wit push origin main");
    });

    it("clones repository", async () => {
      await execAsync("rm -rf /tmp/test-repo-clone");
      await execAsync(
        `cd /tmp && wit clone ${API_URL}/testuser/test-repo.git test-repo-clone`
      );

      // Verify
      const { stdout } = await execAsync("cat /tmp/test-repo-clone/README.md");
      expect(stdout.trim()).toBe("# Test");
    });

    it("lists commits", async () => {
      const commits = await api.repos.getCommits.query({
        owner: "testuser",
        repo: "test-repo",
        limit: 10,
      });

      expect(commits.length).toBeGreaterThan(0);
      expect(commits[0].message).toBe("Initial");
    });
  });

  describe("Issue Flow", () => {
    let issueId: string;

    it("creates an issue", async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      const issue = await authApi.issues.create.mutate({
        repoId,
        title: "Bug: Something is broken",
        body: "Please fix this",
      });

      expect(issue.number).toBe(1);
      issueId = issue.id;
    });

    it("lists issues", async () => {
      const issues = await api.issues.list.query({
        repoId,
        state: "open",
      });

      expect(issues.length).toBe(1);
      expect(issues[0].title).toBe("Bug: Something is broken");
    });

    it("closes issue", async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      await authApi.issues.close.mutate({ issueId });

      const issue = await api.issues.get.query({ issueId });
      expect(issue.state).toBe("closed");
    });
  });

  describe("Pull Request Flow", () => {
    let prId: string;

    it("creates a PR", async () => {
      // First create a branch with changes
      await execAsync(
        'cd /tmp/test-repo && wit checkout -b feature && echo "new" > new.txt && wit add . && wit commit -m "Add feature"'
      );
      await execAsync("cd /tmp/test-repo && wit push origin feature");

      const authApi = createAuthenticatedClient(sessionToken);
      const pr = await authApi.pulls.create.mutate({
        repoId,
        title: "Add new feature",
        sourceBranch: "feature",
        targetBranch: "main",
      });

      expect(pr.number).toBe(1);
      prId = pr.id;
    });

    it("lists PRs", async () => {
      const prs = await api.pulls.list.query({
        repoId,
        state: "open",
      });

      expect(prs.length).toBe(1);
    });

    it("merges PR", async () => {
      const authApi = createAuthenticatedClient(sessionToken);
      await authApi.pulls.merge.mutate({
        prId,
        mergeSha: "TODO", // Would compute actual merge
      });

      const pr = await api.pulls.get.query({ prId });
      expect(pr.state).toBe("merged");
    });
  });
});

function createAuthenticatedClient(token: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
    ],
  });
}
```

### 6. Package.json Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/cli.ts serve",
    "dev:web": "cd apps/web && npm run dev",
    "build": "tsc && esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js",
    "build:web": "cd apps/web && npm run build",
    "start": "node dist/cli.js serve",
    "db:migrate": "drizzle-kit push",
    "db:seed": "tsx src/db/seed.ts",
    "db:studio": "drizzle-kit studio",
    "test": "vitest",
    "test:e2e": "vitest run tests/integration",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  }
}
```

---

## Files to Create/Update

```
.env.example              # Environment template
docker-compose.yml        # Local development setup
Dockerfile                # Production container
src/server/index.ts       # Unified server (update)
tests/integration/        # E2E tests
  full-flow.test.ts
package.json              # Add scripts (update)
```

---

## Success Criteria

- [ ] `npm run dev` starts server with all routes
- [ ] `/health` returns database + server status
- [ ] Git push/pull works via HTTP
- [ ] tRPC API accessible at `/trpc`
- [ ] User registration/login flow works
- [ ] Repository CRUD works
- [ ] Issue/PR flows work
- [ ] Docker compose spins up working system
- [ ] All integration tests pass

## Run Order

1. Start Postgres: `docker compose up db -d`
2. Run migrations: `npm run db:migrate`
3. Seed data: `npm run db:seed`
4. Start server: `npm run dev`
5. Start web: `npm run dev:web`
6. Run tests: `npm run test:e2e`

## Dependencies

- Stream 1 (Git Server) ✅
- Stream 2 (Database) ✅
- Stream 3 (tRPC API) ✅
- Stream 4 (Web App) ✅
