# Stream 3: tRPC API

## Mission

Build the tRPC API layer that connects the database models to the server, enabling type-safe communication between the web app, CLI, and backend.

## Context

We have:

- **Git Server** (`src/server/`) - Hono-based, handles Git Smart HTTP
- **Database** (`src/db/`) - Drizzle ORM with full schema and models for users, repos, PRs, issues

We need tRPC to expose all database operations to clients with full type safety.

## Key Deliverables

### 1. tRPC Setup (`src/api/trpc/`)

```
src/api/trpc/
├── index.ts              # Export router and types
├── trpc.ts               # tRPC instance, procedures
├── context.ts            # Request context (user, db)
├── routers/
│   ├── index.ts          # Merged router
│   ├── auth.ts           # login, logout, me, register
│   ├── users.ts          # user.get, user.update, user.search
│   ├── repos.ts          # repo.list, repo.get, repo.create, repo.delete
│   ├── pulls.ts          # pr.list, pr.get, pr.create, pr.merge, pr.close
│   ├── issues.ts         # issue.list, issue.get, issue.create, issue.close
│   ├── comments.ts       # comment.create, comment.update, comment.delete
│   └── activity.ts       # activity.feed, activity.forRepo
└── middleware/
    └── auth.ts           # isAuthed, isRepoAdmin, isRepoMember
```

### 2. Server Integration

Wire tRPC into the existing Hono server at `/trpc/*`.

### 3. Client Export

Export a client-side tRPC client for use in web app and CLI.

---

## Implementation Guide

### Step 1: Install Dependencies

```bash
pnpm add @trpc/server @trpc/client zod superjson
```

### Step 2: Create tRPC Instance

```typescript
// src/api/trpc/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// Auth middleware
const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

### Step 3: Create Context

```typescript
// src/api/trpc/context.ts
import type { Context as HonoContext } from "hono";
import { getDb, type Database } from "../../db";
import { sessionModel } from "../../db/models";
import type { User } from "../../db/schema";

export interface Context {
  db: Database;
  user: User | null;
  req: Request;
}

export async function createContext(c: HonoContext): Promise<Context> {
  const db = getDb();

  // Get session from cookie or Authorization header
  const sessionId =
    c.req.header("Authorization")?.replace("Bearer ", "") ||
    getCookie(c, "session");

  let user: User | null = null;

  if (sessionId) {
    const session = await sessionModel.findWithUser(sessionId);
    if (session && session.session.expiresAt > new Date()) {
      user = session.user;
    }
  }

  return { db, user, req: c.req.raw };
}
```

### Step 4: Create Routers

```typescript
// src/api/trpc/routers/repos.ts
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import {
  repoModel,
  starModel,
  watchModel,
  collaboratorModel,
} from "../../../db/models";
import { TRPCError } from "@trpc/server";

export const reposRouter = router({
  // List repos by owner
  list: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        ownerType: z.enum(["user", "organization"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // If viewing own repos, show all; otherwise only public
      if (ctx.user?.username === input.owner) {
        return repoModel.listByOwner(ctx.user.id, "user");
      }
      return repoModel.listPublicByOwner(
        input.owner,
        input.ownerType || "user"
      );
    }),

  // Get single repo
  get: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const result = await repoModel.findByPath(input.owner, input.repo);

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      // Check access for private repos
      if (result.repo.isPrivate) {
        if (!ctx.user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }
        const hasAccess =
          result.repo.ownerId === ctx.user.id ||
          (await collaboratorModel.hasPermission(
            result.repo.id,
            ctx.user.id,
            "read"
          ));
        if (!hasAccess) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      return result;
    }),

  // Create repo
  create: protectedProcedure
    .input(
      z.object({
        name: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/),
        description: z.string().max(500).optional(),
        isPrivate: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const diskPath = `/repos/${ctx.user.username}/${input.name}.git`;

      return repoModel.create({
        name: input.name,
        description: input.description,
        isPrivate: input.isPrivate,
        ownerId: ctx.user.id,
        ownerType: "user",
        diskPath,
        defaultBranch: "main",
      });
    }),

  // Delete repo
  delete: protectedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);
      if (!repo || repo.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return repoModel.delete(input.repoId);
    }),

  // Star/unstar
  star: protectedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return starModel.add(input.repoId, ctx.user.id);
    }),

  unstar: protectedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return starModel.remove(input.repoId, ctx.user.id);
    }),

  // Search
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(({ input }) => repoModel.search(input.query, input.limit)),
});
```

```typescript
// src/api/trpc/routers/pulls.ts
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { prModel, prReviewModel, prCommentModel } from "../../../db/models";
import { TRPCError } from "@trpc/server";

export const pullsRouter = router({
  // List PRs for a repo
  list: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        state: z.enum(["open", "closed", "merged", "all"]).default("open"),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(({ input }) =>
      prModel.listByRepo(input.repoId, input.state, input.limit, input.offset)
    ),

  // Get single PR
  get: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        number: z.number(),
      })
    )
    .query(async ({ input }) => {
      const pr = await prModel.findByNumber(input.repoId, input.number);
      if (!pr) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return pr;
    }),

  // Create PR
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        title: z.string().min(1).max(256),
        body: z.string().optional(),
        sourceBranch: z.string(),
        targetBranch: z.string(),
        headSha: z.string(),
        baseSha: z.string(),
        isDraft: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const number = await prModel.getNextNumber(input.repoId);
      return prModel.create({
        ...input,
        number,
        authorId: ctx.user.id,
        state: "open",
      });
    }),

  // Merge PR
  merge: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        mergeSha: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return prModel.merge(input.prId, input.mergeSha, ctx.user.id);
    }),

  // Close PR
  close: protectedProcedure
    .input(z.object({ prId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return prModel.close(input.prId);
    }),

  // Add review
  addReview: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        state: z.enum(["approved", "changes_requested", "commented"]),
        body: z.string().optional(),
        commitSha: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return prReviewModel.create({
        ...input,
        userId: ctx.user.id,
      });
    }),

  // Add comment
  addComment: protectedProcedure
    .input(
      z.object({
        prId: z.string().uuid(),
        body: z.string().min(1),
        path: z.string().optional(),
        line: z.number().optional(),
        side: z.enum(["LEFT", "RIGHT"]).optional(),
        commitSha: z.string().optional(),
        reviewId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return prCommentModel.create({
        ...input,
        userId: ctx.user.id,
      });
    }),
});
```

```typescript
// src/api/trpc/routers/issues.ts
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { issueModel, issueCommentModel, labelModel } from "../../../db/models";
import { TRPCError } from "@trpc/server";

export const issuesRouter = router({
  list: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        state: z.enum(["open", "closed", "all"]).default("open"),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(({ input }) =>
      issueModel.listByRepo(
        input.repoId,
        input.state,
        input.limit,
        input.offset
      )
    ),

  get: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        number: z.number(),
      })
    )
    .query(async ({ input }) => {
      const issue = await issueModel.findByNumber(input.repoId, input.number);
      if (!issue) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return issue;
    }),

  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        title: z.string().min(1).max(256),
        body: z.string().optional(),
        labelIds: z.array(z.string().uuid()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const number = await issueModel.getNextNumber(input.repoId);
      return issueModel.create({
        repoId: input.repoId,
        number,
        title: input.title,
        body: input.body,
        authorId: ctx.user.id,
        state: "open",
      });
    }),

  close: protectedProcedure
    .input(z.object({ issueId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return issueModel.close(input.issueId, ctx.user.id);
    }),

  reopen: protectedProcedure
    .input(z.object({ issueId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return issueModel.reopen(input.issueId);
    }),

  addComment: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        body: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return issueCommentModel.create({
        issueId: input.issueId,
        userId: ctx.user.id,
        body: input.body,
      });
    }),

  // Labels
  addLabel: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        labelId: z.string().uuid(),
      })
    )
    .mutation(({ input }) => issueModel.addLabel(input.issueId, input.labelId)),

  removeLabel: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
        labelId: z.string().uuid(),
      })
    )
    .mutation(({ input }) =>
      issueModel.removeLabel(input.issueId, input.labelId)
    ),
});
```

```typescript
// src/api/trpc/routers/auth.ts
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { userModel, sessionModel, oauthAccountModel } from "../../../db/models";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";

export const authRouter = router({
  // Get current user
  me: publicProcedure.query(({ ctx }) => ctx.user),

  // Register
  register: publicProcedure
    .input(
      z.object({
        username: z
          .string()
          .min(3)
          .max(39)
          .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/),
        email: z.string().email(),
        name: z.string().optional(),
        password: z.string().min(8).optional(), // Optional for OAuth
      })
    )
    .mutation(async ({ input }) => {
      // Check availability
      if (!(await userModel.isUsernameAvailable(input.username))) {
        throw new TRPCError({ code: "CONFLICT", message: "Username taken" });
      }
      if (!(await userModel.isEmailAvailable(input.email))) {
        throw new TRPCError({ code: "CONFLICT", message: "Email taken" });
      }

      // Create user (password hashing would be done here)
      const user = await userModel.create({
        username: input.username,
        email: input.email,
        name: input.name,
        passwordHash: input.password, // TODO: Hash this!
      });

      // Create session
      const sessionId = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await sessionModel.create({ id: sessionId, userId: user.id, expiresAt });

      return { user, sessionId };
    }),

  // Login
  login: publicProcedure
    .input(
      z.object({
        usernameOrEmail: z.string(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const user = await userModel.findByUsernameOrEmail(input.usernameOrEmail);
      if (!user || user.passwordHash !== input.password) {
        // TODO: Compare hashed
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const sessionId = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await sessionModel.create({ id: sessionId, userId: user.id, expiresAt });

      return { user, sessionId };
    }),

  // Logout
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const sessionId = ctx.req.headers
      .get("Authorization")
      ?.replace("Bearer ", "");
    if (sessionId) {
      await sessionModel.delete(sessionId);
    }
    return { success: true };
  }),

  // Update profile
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        bio: z.string().max(256).optional(),
        location: z.string().max(100).optional(),
        website: z.string().url().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return userModel.update(ctx.user.id, input);
    }),
});
```

### Step 5: Merge Routers

```typescript
// src/api/trpc/routers/index.ts
import { router } from "../trpc";
import { authRouter } from "./auth";
import { reposRouter } from "./repos";
import { pullsRouter } from "./pulls";
import { issuesRouter } from "./issues";
import { activityRouter } from "./activity";

export const appRouter = router({
  auth: authRouter,
  repos: reposRouter,
  pulls: pullsRouter,
  issues: issuesRouter,
  activity: activityRouter,
});

export type AppRouter = typeof appRouter;
```

### Step 6: Wire to Hono Server

```typescript
// src/server/index.ts (add to existing)
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "../api/trpc/routers";
import { createContext } from "../api/trpc/context";

// Add to existing app
app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (opts) => createContext(opts.context),
  })
);
```

### Step 7: Export Client

```typescript
// src/api/trpc/client.ts
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "./routers";

export function createClient(baseUrl: string, token?: string) {
  return createTRPCProxyClient<AppRouter>({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    ],
  });
}

export type { AppRouter };
```

---

## Success Criteria

- [ ] tRPC server running at `/trpc/*`
- [ ] All routers implemented: auth, repos, pulls, issues, activity
- [ ] Auth middleware protecting mutations
- [ ] Client export works for both web app and CLI
- [ ] Types exported for end-to-end type safety
- [ ] Tests pass for all routers

## Relevant Existing Code

- `src/db/models/*.ts` - All database operations
- `src/db/schema.ts` - Type definitions
- `src/server/index.ts` - Hono server to integrate with

## Dependencies

- Stream 2 (Database) ✅ Complete
