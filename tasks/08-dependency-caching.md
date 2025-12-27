# Task: Dependency Caching

## Objective
Implement a caching system to speed up CI builds by reusing dependencies (node_modules, pip packages, etc.) across workflow runs.

## Context

### Current State
- Every workflow run starts fresh
- Dependencies are downloaded on every build
- `actions/cache` is not implemented
- Build times are unnecessarily long

### Desired State
- Cache dependencies based on lockfile hash
- Restore cache at start of job
- Save cache after job completion
- Support multiple cache keys with fallback
- Automatic cache eviction based on size/age
- Cache hit/miss metrics

## Technical Requirements

### 1. Database Schema (`src/db/schema.ts`)

```typescript
export const caches = pgTable('caches', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  key: text('key').notNull(), // e.g., "npm-Linux-abc123"
  version: text('version').default('v1'), // Cache format version
  paths: text('paths').notNull(), // JSON array of cached paths
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  compressionType: text('compression_type').default('zstd'), // zstd, gzip, none
  storagePath: text('storage_path').notNull(), // Path to cache archive
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).defaultNow().notNull(),
  accessCount: integer('access_count').default(0),
  createdByRunId: uuid('created_by_run_id').references(() => workflowRuns.id, { onDelete: 'set null' }),
});

// Unique constraint on repo + key
// CREATE UNIQUE INDEX idx_caches_repo_key ON caches(repo_id, key);

// Index for cleanup queries
// CREATE INDEX idx_caches_last_accessed ON caches(last_accessed_at);
```

### 2. Cache Service (`src/ci/cache.ts`)

```typescript
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { db } from '../db';
import { caches } from '../db/schema';
import { eq, and, like, desc, sql } from 'drizzle-orm';

const CACHE_DIR = process.env.CACHE_DIR || path.join(process.env.HOME!, '.wit', 'cache');
const MAX_CACHE_SIZE_GB = parseInt(process.env.MAX_CACHE_SIZE_GB || '10', 10);
const CACHE_TTL_DAYS = parseInt(process.env.CACHE_TTL_DAYS || '7', 10);

export interface SaveCacheOptions {
  repoId: string;
  runId: string;
  key: string;
  paths: string[];
  workspacePath: string;
}

export interface RestoreCacheOptions {
  repoId: string;
  key: string;
  restoreKeys?: string[];
  workspacePath: string;
}

export interface CacheResult {
  hit: boolean;
  key?: string;
  size?: number;
}

class CacheService {
  constructor() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  /**
   * Save paths to cache
   */
  async save(options: SaveCacheOptions): Promise<{ key: string; size: number }> {
    const { repoId, runId, key, paths, workspacePath } = options;

    // Check if cache already exists
    const existing = await this.findExact(repoId, key);
    if (existing) {
      console.log(`[Cache] Key already exists: ${key}`);
      return { key, size: existing.sizeBytes };
    }

    // Create cache archive
    const cacheId = crypto.randomUUID();
    const storagePath = path.join(CACHE_DIR, repoId, `${cacheId}.tar.zst`);
    const storageDir = path.dirname(storagePath);

    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // Resolve and validate paths
    const resolvedPaths = paths
      .map(p => path.resolve(workspacePath, p))
      .filter(p => fs.existsSync(p));

    if (resolvedPaths.length === 0) {
      throw new Error('No valid paths to cache');
    }

    // Create tar archive with zstd compression
    const pathList = resolvedPaths.join(' ');
    try {
      execSync(`tar -cf - -C "${workspacePath}" ${paths.join(' ')} | zstd -T0 -o "${storagePath}"`, {
        stdio: 'pipe',
      });
    } catch (error) {
      // Fallback to gzip if zstd not available
      execSync(`tar -czf "${storagePath.replace('.zst', '.gz')}" -C "${workspacePath}" ${paths.join(' ')}`, {
        stdio: 'pipe',
      });
    }

    const stats = fs.statSync(storagePath);

    // Save to database
    await db.insert(caches).values({
      id: cacheId,
      repoId,
      key,
      paths: JSON.stringify(paths),
      sizeBytes: stats.size,
      storagePath,
      createdByRunId: runId,
    });

    console.log(`[Cache] Saved: ${key} (${this.formatSize(stats.size)})`);

    // Trigger cleanup if needed
    this.cleanupIfNeeded(repoId).catch(console.error);

    return { key, size: stats.size };
  }

  /**
   * Restore cache to workspace
   */
  async restore(options: RestoreCacheOptions): Promise<CacheResult> {
    const { repoId, key, restoreKeys = [], workspacePath } = options;

    // Try exact match first
    let cache = await this.findExact(repoId, key);
    let matchedKey = key;

    // Try restore keys (prefix match)
    if (!cache && restoreKeys.length > 0) {
      for (const restoreKey of restoreKeys) {
        cache = await this.findByPrefix(repoId, restoreKey);
        if (cache) {
          matchedKey = cache.key;
          break;
        }
      }
    }

    if (!cache) {
      console.log(`[Cache] Miss: ${key}`);
      return { hit: false };
    }

    // Check if file exists
    if (!fs.existsSync(cache.storagePath)) {
      console.log(`[Cache] File missing, cleaning up: ${cache.key}`);
      await db.delete(caches).where(eq(caches.id, cache.id));
      return { hit: false };
    }

    // Extract to workspace
    try {
      if (cache.storagePath.endsWith('.zst')) {
        execSync(`zstd -d "${cache.storagePath}" -c | tar -xf - -C "${workspacePath}"`, {
          stdio: 'pipe',
        });
      } else {
        execSync(`tar -xzf "${cache.storagePath}" -C "${workspacePath}"`, {
          stdio: 'pipe',
        });
      }
    } catch (error) {
      console.error(`[Cache] Extraction failed: ${error}`);
      return { hit: false };
    }

    // Update access stats
    await db.update(caches)
      .set({
        lastAccessedAt: new Date(),
        accessCount: sql`${caches.accessCount} + 1`,
      })
      .where(eq(caches.id, cache.id));

    console.log(`[Cache] Hit: ${matchedKey} (${this.formatSize(cache.sizeBytes)})`);

    return {
      hit: true,
      key: matchedKey,
      size: cache.sizeBytes,
    };
  }

  /**
   * Generate cache key from file hash
   */
  async hashFiles(workspacePath: string, patterns: string[]): Promise<string> {
    const files: string[] = [];

    for (const pattern of patterns) {
      const fullPath = path.resolve(workspacePath, pattern);
      if (fs.existsSync(fullPath)) {
        files.push(fullPath);
      }
    }

    if (files.length === 0) {
      return crypto.randomBytes(16).toString('hex');
    }

    const hash = crypto.createHash('sha256');
    for (const file of files.sort()) {
      const content = fs.readFileSync(file);
      hash.update(content);
    }

    return hash.digest('hex').slice(0, 40);
  }

  /**
   * List caches for a repo
   */
  async list(repoId: string): Promise<Array<{
    key: string;
    size: number;
    createdAt: Date;
    lastAccessedAt: Date;
    accessCount: number;
  }>> {
    const results = await db
      .select({
        key: caches.key,
        size: caches.sizeBytes,
        createdAt: caches.createdAt,
        lastAccessedAt: caches.lastAccessedAt,
        accessCount: caches.accessCount,
      })
      .from(caches)
      .where(eq(caches.repoId, repoId))
      .orderBy(desc(caches.lastAccessedAt));

    return results;
  }

  /**
   * Delete a specific cache
   */
  async delete(repoId: string, key: string): Promise<boolean> {
    const cache = await this.findExact(repoId, key);
    if (!cache) return false;

    // Delete file
    if (fs.existsSync(cache.storagePath)) {
      fs.unlinkSync(cache.storagePath);
    }

    // Delete record
    await db.delete(caches).where(eq(caches.id, cache.id));

    return true;
  }

  /**
   * Get cache statistics
   */
  async getStats(repoId: string): Promise<{
    totalSize: number;
    cacheCount: number;
    hitRate: number;
  }> {
    const result = await db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${caches.sizeBytes}), 0)`,
        cacheCount: sql<number>`COUNT(*)`,
        totalAccess: sql<number>`COALESCE(SUM(${caches.accessCount}), 0)`,
      })
      .from(caches)
      .where(eq(caches.repoId, repoId));

    return {
      totalSize: result[0]?.totalSize || 0,
      cacheCount: result[0]?.cacheCount || 0,
      hitRate: 0, // Would need separate hit/miss tracking
    };
  }

  private async findExact(repoId: string, key: string) {
    const [cache] = await db
      .select()
      .from(caches)
      .where(and(eq(caches.repoId, repoId), eq(caches.key, key)));
    return cache;
  }

  private async findByPrefix(repoId: string, prefix: string) {
    const [cache] = await db
      .select()
      .from(caches)
      .where(and(eq(caches.repoId, repoId), like(caches.key, `${prefix}%`)))
      .orderBy(desc(caches.createdAt))
      .limit(1);
    return cache;
  }

  private async cleanupIfNeeded(repoId: string): Promise<void> {
    const stats = await this.getStats(repoId);
    const maxBytes = MAX_CACHE_SIZE_GB * 1024 * 1024 * 1024;

    if (stats.totalSize <= maxBytes) return;

    // Delete oldest caches until under limit
    const allCaches = await db
      .select()
      .from(caches)
      .where(eq(caches.repoId, repoId))
      .orderBy(caches.lastAccessedAt); // Oldest first

    let currentSize = stats.totalSize;
    for (const cache of allCaches) {
      if (currentSize <= maxBytes * 0.9) break; // Keep 10% buffer

      if (fs.existsSync(cache.storagePath)) {
        fs.unlinkSync(cache.storagePath);
      }
      await db.delete(caches).where(eq(caches.id, cache.id));
      currentSize -= cache.sizeBytes;

      console.log(`[Cache] Evicted: ${cache.key}`);
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
}

export const cacheService = new CacheService();
```

### 3. Built-in Cache Action (`src/ci/executor.ts`)

```typescript
private async executeAction(step: Step, context: ExecutionContext): Promise<StepResult> {
  const actionRef = step.uses!;
  const [actionName] = actionRef.split('@');

  switch (actionName) {
    case 'actions/cache':
      return this.executeCacheAction(step, context);
    // ... other actions
  }
}

private async executeCacheAction(step: Step, context: ExecutionContext): Promise<StepResult> {
  const paths = this.evaluateExpression(step.with?.path, context);
  const key = this.evaluateExpression(step.with?.key, context);
  const restoreKeys = step.with?.['restore-keys']
    ? this.evaluateExpression(step.with['restore-keys'], context).split('\n').filter(Boolean)
    : [];

  // Parse paths (can be multiline)
  const pathList = paths.split('\n').map((p: string) => p.trim()).filter(Boolean);

  try {
    // Restore phase (runs at step execution)
    const result = await cacheService.restore({
      repoId: context.repoId,
      key,
      restoreKeys,
      workspacePath: context.workspace,
    });

    // Register post-job hook to save cache
    if (!result.hit || result.key !== key) {
      context.postJobHooks.push(async () => {
        try {
          await cacheService.save({
            repoId: context.repoId,
            runId: context.runId,
            key,
            paths: pathList,
            workspacePath: context.workspace,
          });
        } catch (error) {
          console.warn(`[Cache] Save failed: ${error}`);
        }
      });
    }

    return {
      conclusion: 'success',
      outputs: {
        'cache-hit': String(result.hit),
        'cache-matched-key': result.key || '',
      },
    };
  } catch (error) {
    console.warn(`[Cache] Restore failed: ${error}`);
    return {
      conclusion: 'success', // Cache miss is not a failure
      outputs: {
        'cache-hit': 'false',
      },
    };
  }
}
```

### 4. Hash Files Function (`src/ci/executor.ts`)

Support `hashFiles()` in expressions:

```typescript
private evaluateExpression(expr: string, context: ExecutionContext): any {
  // ... existing code ...

  // Handle hashFiles() function
  const hashMatch = expr.match(/hashFiles\(['"](.+)['"]\)/);
  if (hashMatch) {
    const pattern = hashMatch[1];
    return cacheService.hashFiles(context.workspace, pattern.split(',').map(p => p.trim()));
  }

  // ...
}
```

### 5. API Endpoints (`src/api/trpc/routers/repos.ts`)

```typescript
// List caches for a repo
listCaches: protectedProcedure
  .input(z.object({ repoId: z.string().uuid() }))
  .query(async ({ input, ctx }) => {
    // Check access
    const repo = await repoModel.findById(input.repoId);
    if (!repo) throw new TRPCError({ code: 'NOT_FOUND' });

    return cacheService.list(input.repoId);
  }),

// Delete a cache
deleteCache: protectedProcedure
  .input(z.object({ repoId: z.string().uuid(), key: z.string() }))
  .mutation(async ({ input, ctx }) => {
    // Check admin access
    const hasAccess = await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'admin');
    if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN' });

    const deleted = await cacheService.delete(input.repoId, input.key);
    if (!deleted) throw new TRPCError({ code: 'NOT_FOUND' });

    return { success: true };
  }),

// Get cache stats
getCacheStats: protectedProcedure
  .input(z.object({ repoId: z.string().uuid() }))
  .query(async ({ input }) => {
    return cacheService.getStats(input.repoId);
  }),

// Clear all caches
clearCaches: protectedProcedure
  .input(z.object({ repoId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    // Check admin access
    const hasAccess = await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'admin');
    if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN' });

    const cacheList = await cacheService.list(input.repoId);
    for (const cache of cacheList) {
      await cacheService.delete(input.repoId, cache.key);
    }

    return { deleted: cacheList.length };
  }),
```

### 6. Web UI: Cache Management (`apps/web/src/routes/repo/settings/caches.tsx`)

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Trash2, Database, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

export function CacheSettings() {
  const { repoId } = useParams();
  const utils = trpc.useUtils();

  const { data: caches, isLoading } = trpc.repos.listCaches.useQuery({ repoId: repoId! });
  const { data: stats } = trpc.repos.getCacheStats.useQuery({ repoId: repoId! });

  const deleteMutation = trpc.repos.deleteCache.useMutation({
    onSuccess: () => {
      utils.repos.listCaches.invalidate();
      utils.repos.getCacheStats.invalidate();
      toastSuccess('Cache deleted');
    },
    onError: (err) => toastError(err.message),
  });

  const clearMutation = trpc.repos.clearCaches.useMutation({
    onSuccess: (data) => {
      utils.repos.listCaches.invalidate();
      utils.repos.getCacheStats.invalidate();
      toastSuccess(`Cleared ${data.deleted} caches`);
    },
    onError: (err) => toastError(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Cache Storage
          </CardTitle>
          <CardDescription>
            Dependency caches speed up your workflow runs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold">{formatSize(stats?.totalSize || 0)}</p>
              <p className="text-sm text-muted-foreground">Total Size</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.cacheCount || 0}</p>
              <p className="text-sm text-muted-foreground">Cached Items</p>
            </div>
            <div>
              <Button
                variant="outline"
                onClick={() => clearMutation.mutate({ repoId: repoId! })}
                disabled={clearMutation.isPending || !caches?.length}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cache List */}
      <Card>
        <CardHeader>
          <CardTitle>Cached Dependencies</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : caches?.length === 0 ? (
            <p className="text-muted-foreground">No caches yet</p>
          ) : (
            <div className="space-y-2">
              {caches?.map((cache) => (
                <div
                  key={cache.key}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm truncate">{cache.key}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span>{formatSize(cache.size)}</span>
                      <span>Used {cache.accessCount} times</span>
                      <span>Last used {formatRelativeTime(cache.lastAccessedAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate({ repoId: repoId!, key: cache.key })}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
```

## Example Workflow

```yaml
name: Build
on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Cache node modules
        uses: actions/cache@v4
        with:
          path: |
            node_modules
            ~/.npm
          key: npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
          restore-keys: |
            npm-${{ runner.os }}-

      - run: npm ci
      - run: npm run build
```

## Files to Create/Modify
- `src/db/schema.ts` - Add caches table
- `src/ci/cache.ts` - New file (cache service)
- `src/ci/executor.ts` - Add cache action, hashFiles support
- `src/api/trpc/routers/repos.ts` - Add cache management endpoints
- `apps/web/src/routes/repo/settings/caches.tsx` - New file (cache UI)
- `apps/web/src/routes/repo/settings/layout.tsx` - Add cache settings link

## Testing
1. Create workflow with cache action
2. Run workflow first time (cache miss)
3. Verify cache saved after job
4. Run workflow again (cache hit)
5. Verify faster execution with cache
6. Test restore-keys prefix matching
7. Test cache eviction when over limit
8. Test cache management UI

## Success Criteria
- [ ] `actions/cache` restores cached files
- [ ] Cache saved after job completes
- [ ] `hashFiles()` generates consistent hashes
- [ ] `restore-keys` prefix matching works
- [ ] Cache eviction respects size limits
- [ ] Cache stats tracked (hits, size, access count)
- [ ] Settings UI shows caches with delete option
- [ ] Clear all caches works
- [ ] zstd compression used (with gzip fallback)
