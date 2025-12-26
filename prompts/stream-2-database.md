# Stream 2: Database & Models Implementation

## Mission

Design and implement the database layer for the wit platform, enabling storage of users, organizations, repositories, pull requests, and issues.

## Context

You are building the data layer for `wit`, a GitHub alternative. The Git object storage (commits, trees, blobs) is handled by the filesystem. The database stores:

- **Metadata** about repositories (name, description, visibility)
- **Users & Organizations** for access control
- **Pull Requests & Issues** for collaboration
- **Activity** for notifications and feeds

## Tech Stack

- **PostgreSQL** - Primary database
- **Drizzle ORM** - Type-safe SQL with migrations
- **Node.js** - Runtime

## Deliverables

### 1. Create `src/db/schema.ts`

Complete Drizzle schema:

```typescript
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============ ENUMS ============

export const ownerTypeEnum = pgEnum("owner_type", ["user", "organization"]);
export const prStateEnum = pgEnum("pr_state", ["open", "closed", "merged"]);
export const issueStateEnum = pgEnum("issue_state", ["open", "closed"]);
export const reviewStateEnum = pgEnum("review_state", [
  "pending",
  "approved",
  "changes_requested",
  "commented",
]);
export const permissionEnum = pgEnum("permission", ["read", "write", "admin"]);
export const orgRoleEnum = pgEnum("org_role", ["member", "admin", "owner"]);

// ============ USERS ============

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  location: text("location"),
  website: text("website"),
  passwordHash: text("password_hash"), // null for OAuth-only users
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'github', 'google', etc.
    providerAccountId: text("provider_account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at"),
  },
  (table) => ({
    uniqueProvider: unique().on(table.provider, table.providerAccountId),
  })
);

// ============ ORGANIZATIONS ============

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(), // URL slug
  displayName: text("display_name").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  website: text("website"),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const orgMembers = pgTable(
  "org_members",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
  })
);

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId] }),
  })
);

// ============ REPOSITORIES ============

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Owner can be user or org
  ownerId: uuid("owner_id").notNull(),
  ownerType: ownerTypeEnum("owner_type").notNull(),

  name: text("name").notNull(),
  description: text("description"),

  isPrivate: boolean("is_private").notNull().default(false),
  isFork: boolean("is_fork").notNull().default(false),
  forkedFromId: uuid("forked_from_id").references(() => repositories.id),

  defaultBranch: text("default_branch").notNull().default("main"),

  // Cached stats
  starsCount: integer("stars_count").notNull().default(0),
  forksCount: integer("forks_count").notNull().default(0),
  watchersCount: integer("watchers_count").notNull().default(0),
  openIssuesCount: integer("open_issues_count").notNull().default(0),
  openPrsCount: integer("open_prs_count").notNull().default(0),

  // Filesystem path to bare repo
  diskPath: text("disk_path").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  pushedAt: timestamp("pushed_at"),
});

export const collaborators = pgTable(
  "collaborators",
  {
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: permissionEnum("permission").notNull().default("read"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repoId, table.userId] }),
  })
);

export const stars = pgTable(
  "stars",
  {
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repoId, table.userId] }),
  })
);

export const watches = pgTable(
  "watches",
  {
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repoId, table.userId] }),
  })
);

// ============ PULL REQUESTS ============

export const pullRequests = pgTable("pull_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),

  number: integer("number").notNull(), // PR #1, #2, etc. per repo

  title: text("title").notNull(),
  body: text("body"),

  state: prStateEnum("state").notNull().default("open"),

  // Branches
  sourceBranch: text("source_branch").notNull(),
  targetBranch: text("target_branch").notNull(),

  // For cross-repo PRs (forks)
  sourceRepoId: uuid("source_repo_id").references(() => repositories.id),

  // Commits
  headSha: text("head_sha").notNull(),
  baseSha: text("base_sha").notNull(),
  mergeSha: text("merge_sha"), // Set when merged

  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),

  isDraft: boolean("is_draft").notNull().default(false),
  isMergeable: boolean("is_mergeable"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  mergedAt: timestamp("merged_at"),
  closedAt: timestamp("closed_at"),
  mergedById: uuid("merged_by_id").references(() => users.id),
});

export const prReviews = pgTable("pr_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  prId: uuid("pr_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  state: reviewStateEnum("state").notNull(),
  body: text("body"),
  commitSha: text("commit_sha").notNull(), // SHA reviewed at

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const prComments = pgTable("pr_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  prId: uuid("pr_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  reviewId: uuid("review_id").references(() => prReviews.id, {
    onDelete: "cascade",
  }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // For inline comments
  path: text("path"), // File path
  line: integer("line"), // Line number
  side: text("side"), // 'LEFT' or 'RIGHT' for diff
  commitSha: text("commit_sha"),

  body: text("body").notNull(),

  // For replies
  replyToId: uuid("reply_to_id").references(() => prComments.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============ ISSUES ============

export const issues = pgTable("issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),

  number: integer("number").notNull(), // Issue #1, #2, etc.

  title: text("title").notNull(),
  body: text("body"),

  state: issueStateEnum("state").notNull().default("open"),

  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  assigneeId: uuid("assignee_id").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  closedById: uuid("closed_by_id").references(() => users.id),
});

export const issueComments = pgTable("issue_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  body: text("body").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const labels = pgTable("labels", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  color: text("color").notNull().default("888888"), // Hex color
  description: text("description"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.issueId, table.labelId] }),
  })
);

export const prLabels = pgTable(
  "pr_labels",
  {
    prId: uuid("pr_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.prId, table.labelId] }),
  })
);

// ============ ACTIVITY ============

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),

  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  repoId: uuid("repo_id").references(() => repositories.id, {
    onDelete: "cascade",
  }),

  type: text("type").notNull(), // 'push', 'pr_opened', 'issue_opened', etc.
  payload: text("payload"), // JSON data

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ WEBHOOKS ============

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),

  url: text("url").notNull(),
  secret: text("secret"),
  events: text("events").notNull(), // JSON array of event types

  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 2. Create `src/db/index.ts`

Database connection and initialization:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle>;
let pool: Pool;

export function initDatabase(connectionString: string) {
  pool = new Pool({ connectionString });
  db = drizzle(pool, { schema });
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
  }
}

export { schema };
```

### 3. Create `src/db/models/` - Query Helpers

#### `src/db/models/user.ts`

```typescript
import { eq } from "drizzle-orm";
import { getDb, schema } from "../index";

export const userModel = {
  async findById(id: string) {
    const db = getDb();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id));
    return user;
  },

  async findByUsername(username: string) {
    const db = getDb();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username));
    return user;
  },

  async findByEmail(email: string) {
    const db = getDb();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email));
    return user;
  },

  async create(data: { username: string; email: string; name?: string }) {
    const db = getDb();
    const [user] = await db.insert(schema.users).values(data).returning();
    return user;
  },

  async update(id: string, data: Partial<typeof schema.users.$inferInsert>) {
    const db = getDb();
    const [user] = await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return user;
  },
};
```

#### `src/db/models/repository.ts`

```typescript
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../index";

export const repoModel = {
  async findById(id: string) {
    const db = getDb();
    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, id));
    return repo;
  },

  async findByOwnerAndName(
    ownerName: string,
    repoName: string,
    ownerType: "user" | "organization"
  ) {
    const db = getDb();
    // This requires a join to get owner by name
    // Implementation depends on ownerType
  },

  async create(data: {
    ownerId: string;
    ownerType: "user" | "organization";
    name: string;
    description?: string;
    isPrivate?: boolean;
    diskPath: string;
  }) {
    const db = getDb();
    const [repo] = await db
      .insert(schema.repositories)
      .values(data)
      .returning();
    return repo;
  },

  async listByOwner(ownerId: string, ownerType: "user" | "organization") {
    const db = getDb();
    return db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.ownerId, ownerId),
          eq(schema.repositories.ownerType, ownerType)
        )
      );
  },

  async incrementCounter(
    id: string,
    field: "starsCount" | "forksCount" | "openIssuesCount" | "openPrsCount",
    delta: number
  ) {
    // Atomic increment
  },
};
```

#### `src/db/models/pull-request.ts`

```typescript
import { eq, and, desc } from "drizzle-orm";
import { getDb, schema } from "../index";

export const prModel = {
  async findById(id: string) {
    const db = getDb();
    const [pr] = await db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id));
    return pr;
  },

  async findByRepoAndNumber(repoId: string, number: number) {
    const db = getDb();
    const [pr] = await db
      .select()
      .from(schema.pullRequests)
      .where(
        and(
          eq(schema.pullRequests.repoId, repoId),
          eq(schema.pullRequests.number, number)
        )
      );
    return pr;
  },

  async create(data: {
    repoId: string;
    title: string;
    body?: string;
    sourceBranch: string;
    targetBranch: string;
    headSha: string;
    baseSha: string;
    authorId: string;
  }) {
    const db = getDb();

    // Get next PR number for this repo
    const [lastPr] = await db
      .select({ number: schema.pullRequests.number })
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.repoId, data.repoId))
      .orderBy(desc(schema.pullRequests.number))
      .limit(1);

    const number = (lastPr?.number ?? 0) + 1;

    const [pr] = await db
      .insert(schema.pullRequests)
      .values({ ...data, number })
      .returning();

    return pr;
  },

  async listByRepo(repoId: string, state?: "open" | "closed" | "merged") {
    const db = getDb();
    let query = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.repoId, repoId))
      .orderBy(desc(schema.pullRequests.createdAt));

    if (state) {
      query = query.where(eq(schema.pullRequests.state, state));
    }

    return query;
  },

  async merge(id: string, mergedById: string, mergeSha: string) {
    const db = getDb();
    const now = new Date();
    const [pr] = await db
      .update(schema.pullRequests)
      .set({
        state: "merged",
        mergedAt: now,
        mergedById,
        mergeSha,
        updatedAt: now,
      })
      .where(eq(schema.pullRequests.id, id))
      .returning();
    return pr;
  },

  async close(id: string) {
    const db = getDb();
    const now = new Date();
    const [pr] = await db
      .update(schema.pullRequests)
      .set({
        state: "closed",
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.pullRequests.id, id))
      .returning();
    return pr;
  },
};
```

### 4. Create `drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### 5. Create `src/db/seed.ts`

Development seed data:

```typescript
import { initDatabase, schema } from "./index";

async function seed() {
  const db = initDatabase(process.env.DATABASE_URL!);

  // Create test user
  const [user] = await db
    .insert(schema.users)
    .values({
      username: "testuser",
      email: "test@example.com",
      name: "Test User",
    })
    .returning();

  console.log("Created user:", user);

  // Create test repo
  const [repo] = await db
    .insert(schema.repositories)
    .values({
      ownerId: user.id,
      ownerType: "user",
      name: "test-repo",
      description: "A test repository",
      diskPath: "/repos/testuser/test-repo.git",
    })
    .returning();

  console.log("Created repo:", repo);

  // Create default labels
  const defaultLabels = [
    { name: "bug", color: "d73a4a", description: "Something isn't working" },
    {
      name: "enhancement",
      color: "a2eeef",
      description: "New feature or request",
    },
    {
      name: "documentation",
      color: "0075ca",
      description: "Improvements or additions to documentation",
    },
    {
      name: "good first issue",
      color: "7057ff",
      description: "Good for newcomers",
    },
  ];

  for (const label of defaultLabels) {
    await db.insert(schema.labels).values({ ...label, repoId: repo.id });
  }

  console.log("Created labels");

  process.exit(0);
}

seed().catch(console.error);
```

## Dependencies to Add

```json
{
  "dependencies": {
    "drizzle-orm": "^0.33.0",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.24.0",
    "@types/pg": "^8.11.0"
  }
}
```

## Scripts to Add

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:seed": "ts-node src/db/seed.ts"
  }
}
```

## File Structure

```
src/db/
├── index.ts              # Connection, getDb()
├── schema.ts             # All table definitions
├── drizzle.config.ts     # Drizzle configuration
├── migrations/           # Generated migrations
├── models/
│   ├── user.ts           # User queries
│   ├── repository.ts     # Repo queries
│   ├── pull-request.ts   # PR queries
│   ├── issue.ts          # Issue queries
│   └── index.ts          # Export all models
└── seed.ts               # Development data
```

## Testing

Create tests in `src/db/__tests__/`:

```typescript
import { initDatabase, getDb, schema } from "../index";
import { userModel } from "../models/user";

beforeAll(async () => {
  initDatabase(process.env.TEST_DATABASE_URL!);
});

describe("User Model", () => {
  it("should create a user", async () => {
    const user = await userModel.create({
      username: "test",
      email: "test@test.com",
    });

    expect(user.id).toBeDefined();
    expect(user.username).toBe("test");
  });

  it("should find user by username", async () => {
    const user = await userModel.findByUsername("test");
    expect(user).toBeDefined();
  });
});
```

## Success Criteria

1. All tables created with proper relationships
2. Migrations generated and runnable
3. Models provide type-safe query helpers
4. Seed script creates development data
5. All tests pass

## Notes

- Use UUIDs for all primary keys (better for distributed systems)
- Store timestamps with timezone
- Use enums for fixed value sets
- Index foreign keys and commonly queried fields
- Consider soft deletes for important data (add `deletedAt` column)
- PR/Issue numbers are per-repository (like GitHub)
