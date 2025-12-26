# Stream 0: Server + Database Integration

## Mission

Wire the existing Git Server to the Database so that:

1. Pushes create/update repository records in the database
2. User authentication works via database sessions
3. Activity is logged on push/clone events

This is a short integration task, not a new feature build.

## Context

We have two independent systems that need to be connected:

- **Git Server** (`src/server/`) - Accepts push/pull, stores bare repos on disk
- **Database** (`src/db/`) - Has schema for users, repos, but not connected

## Key Deliverables

### 1. Initialize Database on Server Start

```typescript
// src/server/index.ts
import { initDatabase } from "../db";

export function startServer(options: ServerOptions): WitServer {
  // Initialize database
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    initDatabase(databaseUrl);
    console.log("✓ Database connected");
  } else {
    console.warn("⚠ DATABASE_URL not set - running without database");
  }

  // ... rest of server startup
}
```

### 2. Create Repository Record on First Push

```typescript
// src/server/routes/git.ts
import { repoModel, activityModel } from "../../db/models";

// In createGitRoutes, modify the receive-pack handler:

app.post("/:owner/:repo/git-receive-pack", async (c) => {
  const { owner, repo } = c.req.param();

  // Get or create repository in database
  const bareRepo = repoManager.getRepo(owner, repo, true);

  // Ensure database record exists
  const diskPath = bareRepo.gitDir;
  let dbRepo = await repoModel.findByPath(owner, repo);

  if (!dbRepo) {
    // Get user by username
    const user = await userModel.findByUsername(owner);
    if (user) {
      dbRepo = await repoModel.create({
        ownerId: user.id,
        ownerType: "user",
        name: repo.replace(".git", ""),
        diskPath,
        defaultBranch: "main",
        isPrivate: false,
      });
      console.log(`[server] Created database record for ${owner}/${repo}`);
    }
  }

  // ... process push ...

  // After successful push, log activity
  if (dbRepo && user) {
    await activityModel.create({
      actorId: user.id,
      repoId: dbRepo.id,
      type: "push",
      payload: JSON.stringify({
        ref: commands[0]?.refName,
        before: commands[0]?.oldHash,
        after: commands[0]?.newHash,
      }),
    });

    // Update pushed_at timestamp
    await repoModel.updatePushedAt(dbRepo.id);
  }

  // ... return response
});
```

### 3. Add Auth Middleware (Optional for now)

```typescript
// src/server/middleware/auth.ts
import { Context, Next } from "hono";
import { sessionModel } from "../../db/models";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const session = await sessionModel.findWithUser(token);

    if (session && session.session.expiresAt > new Date()) {
      c.set("user", session.user);
    }
  }

  await next();
}

// Apply to git routes (optional - can leave unauthenticated for now)
// app.use('/:owner/:repo/*', authMiddleware);
```

### 4. Sync Existing Bare Repos to Database

Create a utility to import existing bare repos into the database:

```typescript
// src/server/storage/sync.ts
import { repoManager } from "./repos";
import { repoModel, userModel } from "../../db/models";

export async function syncReposToDatabase(): Promise<void> {
  const bareRepos = repoManager.listRepos();

  for (const info of bareRepos) {
    const existingDbRepo = await repoModel.findByPath(info.owner, info.name);

    if (!existingDbRepo) {
      // Find or create user
      let user = await userModel.findByUsername(info.owner);

      if (!user) {
        // Create placeholder user
        user = await userModel.create({
          username: info.owner,
          email: `${info.owner}@placeholder.local`,
          name: info.owner,
        });
        console.log(`[sync] Created placeholder user: ${info.owner}`);
      }

      // Create repo record
      await repoModel.create({
        ownerId: user.id,
        ownerType: "user",
        name: info.name,
        diskPath: info.path,
        defaultBranch: "main",
        isPrivate: false,
      });

      console.log(`[sync] Synced repo: ${info.owner}/${info.name}`);
    }
  }
}
```

### 5. Add Database Status to Health Check

```typescript
// src/server/index.ts
import { healthCheck as dbHealthCheck } from "../db";

app.get("/health", async (c) => {
  const dbStatus = await dbHealthCheck();

  return c.json({
    status: dbStatus.ok ? "ok" : "degraded",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    database: {
      connected: dbStatus.ok,
      latency: dbStatus.latency,
    },
  });
});
```

---

## Files to Modify

1. `src/server/index.ts` - Add database initialization
2. `src/server/routes/git.ts` - Create/update repo records on push
3. `src/server/storage/repos.ts` - Add database integration
4. Create `src/server/middleware/auth.ts` - Auth middleware
5. Create `src/server/storage/sync.ts` - Sync utility

## Environment Variables

```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/wit
```

## Testing

```bash
# Start Postgres
docker run -d --name wit-postgres \
  -e POSTGRES_USER=wit \
  -e POSTGRES_PASSWORD=wit \
  -e POSTGRES_DB=wit \
  -p 5432:5432 \
  postgres:16

# Run migrations (if set up)
pnpm db:migrate

# Seed database
pnpm db:seed

# Start server with database
DATABASE_URL=postgresql://wit:wit@localhost:5432/wit wit serve

# Push to create a repo
cd /tmp && mkdir test && cd test
wit init
echo "hello" > README.md
wit add . && wit commit -m "init"
wit remote add origin http://localhost:3000/testuser/test.git
wit push origin main

# Check database
psql postgresql://wit:wit@localhost:5432/wit -c "SELECT * FROM repositories;"
```

## Success Criteria

- [ ] Server starts and connects to database
- [ ] First push creates repository record in database
- [ ] Subsequent pushes update `pushed_at` timestamp
- [ ] Activity is logged in `activities` table
- [ ] Health check shows database status
- [ ] Sync utility imports existing bare repos

## Dependencies

- Stream 1 (Git Server) ✅ Complete
- Stream 2 (Database) ✅ Complete
