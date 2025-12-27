# Task: Build Artifact Storage

## Objective
Implement artifact upload and download functionality for CI workflows, allowing jobs to share files and persist build outputs.

## Context

### Current State
- No artifact support exists
- Jobs cannot share files between each other
- Build outputs are lost after workflow completion
- `actions/upload-artifact` and `actions/download-artifact` are not implemented

### Desired State
- Jobs can upload artifacts (files/directories)
- Subsequent jobs can download artifacts from previous jobs
- Artifacts persist after workflow completion
- Users can download artifacts from the UI
- Artifacts have configurable retention periods

## Technical Requirements

### 1. Database Schema (`src/db/schema.ts`)

```typescript
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowRunId: uuid('workflow_run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  jobRunId: uuid('job_run_id').references(() => jobRuns.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  path: text('path').notNull(), // Storage path on disk
  sizeBytes: integer('size_bytes').notNull(),
  fileCount: integer('file_count').notNull().default(1),
  contentType: text('content_type').default('application/zip'),
  checksum: text('checksum'), // SHA256 hash
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Index for cleanup queries
// CREATE INDEX idx_artifacts_expires ON artifacts(expires_at) WHERE expires_at IS NOT NULL;
```

### 2. Artifact Storage Service (`src/ci/artifacts.ts`)

```typescript
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { db } from '../db';
import { artifacts } from '../db/schema';
import { eq } from 'drizzle-orm';

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || path.join(process.env.HOME!, '.wit', 'artifacts');
const DEFAULT_RETENTION_DAYS = 90;

export interface UploadArtifactOptions {
  workflowRunId: string;
  jobRunId: string;
  name: string;
  sourcePath: string; // File or directory to upload
  retentionDays?: number;
}

export interface DownloadArtifactOptions {
  workflowRunId: string;
  name: string;
  destPath: string;
}

class ArtifactService {
  constructor() {
    // Ensure artifacts directory exists
    if (!fs.existsSync(ARTIFACTS_DIR)) {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
  }

  /**
   * Upload an artifact (file or directory)
   */
  async upload(options: UploadArtifactOptions): Promise<{ id: string; size: number }> {
    const { workflowRunId, jobRunId, name, sourcePath, retentionDays = DEFAULT_RETENTION_DAYS } = options;
    
    // Validate source exists
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source path does not exist: ${sourcePath}`);
    }

    // Create artifact storage path
    const artifactId = crypto.randomUUID();
    const storagePath = path.join(ARTIFACTS_DIR, workflowRunId, `${artifactId}.zip`);
    const storageDir = path.dirname(storagePath);
    
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // Create zip archive
    const { size, fileCount, checksum } = await this.createArchive(sourcePath, storagePath);

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    // Save to database
    const [artifact] = await db.insert(artifacts).values({
      id: artifactId,
      workflowRunId,
      jobRunId,
      name,
      path: storagePath,
      sizeBytes: size,
      fileCount,
      checksum,
      expiresAt,
    }).returning();

    console.log(`[Artifacts] Uploaded: ${name} (${this.formatSize(size)}, ${fileCount} files)`);
    
    return { id: artifact.id, size };
  }

  /**
   * Download an artifact by name
   */
  async download(options: DownloadArtifactOptions): Promise<void> {
    const { workflowRunId, name, destPath } = options;
    
    // Find artifact
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.workflowRunId, workflowRunId))
      .where(eq(artifacts.name, name));

    if (!artifact) {
      throw new Error(`Artifact not found: ${name}`);
    }

    if (!fs.existsSync(artifact.path)) {
      throw new Error(`Artifact file missing: ${artifact.path}`);
    }

    // Extract to destination
    await this.extractArchive(artifact.path, destPath);
    
    console.log(`[Artifacts] Downloaded: ${name} to ${destPath}`);
  }

  /**
   * List artifacts for a workflow run
   */
  async list(workflowRunId: string): Promise<Array<{
    id: string;
    name: string;
    sizeBytes: number;
    fileCount: number;
    createdAt: Date;
    expiresAt: Date | null;
  }>> {
    return db
      .select({
        id: artifacts.id,
        name: artifacts.name,
        sizeBytes: artifacts.sizeBytes,
        fileCount: artifacts.fileCount,
        createdAt: artifacts.createdAt,
        expiresAt: artifacts.expiresAt,
      })
      .from(artifacts)
      .where(eq(artifacts.workflowRunId, workflowRunId));
  }

  /**
   * Get artifact file stream for download
   */
  async getStream(artifactId: string): Promise<{ stream: fs.ReadStream; filename: string; size: number }> {
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId));

    if (!artifact) {
      throw new Error('Artifact not found');
    }

    return {
      stream: fs.createReadStream(artifact.path),
      filename: `${artifact.name}.zip`,
      size: artifact.sizeBytes,
    };
  }

  /**
   * Delete expired artifacts
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();
    
    const expired = await db
      .select()
      .from(artifacts)
      .where(lte(artifacts.expiresAt, now));

    for (const artifact of expired) {
      // Delete file
      if (fs.existsSync(artifact.path)) {
        fs.unlinkSync(artifact.path);
      }
      
      // Delete parent dir if empty
      const dir = path.dirname(artifact.path);
      try {
        const files = fs.readdirSync(dir);
        if (files.length === 0) {
          fs.rmdirSync(dir);
        }
      } catch {}
    }

    // Delete database records
    await db.delete(artifacts).where(lte(artifacts.expiresAt, now));
    
    console.log(`[Artifacts] Cleaned up ${expired.length} expired artifacts`);
    return expired.length;
  }

  private async createArchive(sourcePath: string, destPath: string): Promise<{ size: number; fileCount: number; checksum: string }> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      const hash = crypto.createHash('sha256');
      let fileCount = 0;

      output.on('close', () => {
        const size = archive.pointer();
        resolve({ size, fileCount, checksum: hash.digest('hex') });
      });

      archive.on('error', reject);
      archive.on('data', (chunk) => hash.update(chunk));
      archive.on('entry', () => fileCount++);

      archive.pipe(output);

      const stat = fs.statSync(sourcePath);
      if (stat.isDirectory()) {
        archive.directory(sourcePath, false);
      } else {
        archive.file(sourcePath, { name: path.basename(sourcePath) });
      }

      archive.finalize();
    });
  }

  private async extractArchive(archivePath: string, destPath: string): Promise<void> {
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      fs.createReadStream(archivePath)
        .pipe(unzipper.Extract({ path: destPath }))
        .on('close', resolve)
        .on('error', reject);
    });
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
}

export const artifactService = new ArtifactService();
```

### 3. Built-in Actions (`src/ci/executor.ts`)

Add support for upload/download artifact actions:

```typescript
private async executeAction(step: Step, context: ExecutionContext): Promise<StepResult> {
  const actionRef = step.uses!;
  const [actionName] = actionRef.split('@');
  
  switch (actionName) {
    case 'actions/upload-artifact':
      return this.executeUploadArtifact(step, context);
    
    case 'actions/download-artifact':
      return this.executeDownloadArtifact(step, context);
    
    // ... other actions
  }
}

private async executeUploadArtifact(step: Step, context: ExecutionContext): Promise<StepResult> {
  const name = this.evaluateExpression(step.with?.name || 'artifact', context);
  const pathPattern = this.evaluateExpression(step.with?.path || '.', context);
  const retentionDays = parseInt(step.with?.['retention-days'] || '90', 10);
  
  // Resolve path relative to workspace
  const sourcePath = path.resolve(context.workspace, pathPattern);
  
  try {
    const result = await artifactService.upload({
      workflowRunId: context.runId,
      jobRunId: context.jobRunId,
      name,
      sourcePath,
      retentionDays,
    });
    
    return {
      conclusion: 'success',
      outputs: { 'artifact-id': result.id },
    };
  } catch (error) {
    return {
      conclusion: 'failure',
      error: error.message,
    };
  }
}

private async executeDownloadArtifact(step: Step, context: ExecutionContext): Promise<StepResult> {
  const name = this.evaluateExpression(step.with?.name || 'artifact', context);
  const destPath = this.evaluateExpression(step.with?.path || '.', context);
  
  // Resolve path relative to workspace
  const fullPath = path.resolve(context.workspace, destPath);
  
  try {
    await artifactService.download({
      workflowRunId: context.runId,
      name,
      destPath: fullPath,
    });
    
    return { conclusion: 'success' };
  } catch (error) {
    return {
      conclusion: 'failure',
      error: error.message,
    };
  }
}
```

### 4. API Endpoints (`src/api/trpc/routers/workflows.ts`)

```typescript
// List artifacts for a run
listArtifacts: publicProcedure
  .input(z.object({ runId: z.string().uuid() }))
  .query(async ({ input }) => {
    return artifactService.list(input.runId);
  }),

// Download artifact (returns presigned URL or triggers download)
downloadArtifact: publicProcedure
  .input(z.object({ artifactId: z.string().uuid() }))
  .query(async ({ input }) => {
    const { filename, size } = await artifactService.getStream(input.artifactId);
    return {
      downloadUrl: `/api/artifacts/${input.artifactId}/download`,
      filename,
      size,
    };
  }),
```

### 5. Download Route (`src/server/routes/artifacts.ts`)

```typescript
import { Router } from 'express';
import { artifactService } from '../../ci/artifacts';

const router = Router();

router.get('/:artifactId/download', async (req, res) => {
  try {
    const { stream, filename, size } = await artifactService.getStream(req.params.artifactId);
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', size);
    
    stream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: 'Artifact not found' });
  }
});

export default router;
```

### 6. Web UI: Artifacts Section (`apps/web/src/routes/repo/workflow-run-detail.tsx`)

```tsx
function ArtifactsSection({ runId }: { runId: string }) {
  const { data: artifacts } = trpc.workflows.listArtifacts.useQuery({ runId });

  if (!artifacts || artifacts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />
          Artifacts
          <Badge variant="secondary">{artifacts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {artifacts.map((artifact) => (
            <div 
              key={artifact.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <FileArchive className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{artifact.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(artifact.sizeBytes)} • {artifact.fileCount} files
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(`/api/artifacts/${artifact.id}/download`)}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 7. Cleanup Job (`src/ci/scheduler.ts`)

Add periodic cleanup for expired artifacts:

```typescript
// In scheduler start()
setInterval(() => {
  artifactService.cleanupExpired().catch(console.error);
}, 60 * 60 * 1000); // Every hour
```

## Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "archiver": "^6.0.0",
    "unzipper": "^0.10.0"
  },
  "devDependencies": {
    "@types/archiver": "^6.0.0"
  }
}
```

## Files to Create/Modify
- `src/db/schema.ts` - Add artifacts table
- `src/ci/artifacts.ts` - New file (artifact service)
- `src/ci/executor.ts` - Add upload/download action handlers
- `src/api/trpc/routers/workflows.ts` - Add artifact endpoints
- `src/server/routes/artifacts.ts` - New file (download route)
- `src/server/index.ts` - Register artifacts route
- `apps/web/src/routes/repo/workflow-run-detail.tsx` - Add artifacts UI
- `src/ci/scheduler.ts` - Add cleanup job
- `package.json` - Add archiver, unzipper

## Example Workflow

```yaml
name: Build and Test
on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 30

  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/
      - run: npm test
```

## Testing
1. Create workflow with upload-artifact step
2. Run workflow, verify artifact uploaded
3. Check database for artifact record
4. Verify artifact file exists on disk
5. Test download from UI
6. Create workflow with download-artifact step
7. Verify files extracted correctly
8. Test artifact expiration cleanup
9. Verify expired artifacts deleted

## Success Criteria
- [ ] `actions/upload-artifact` creates zip and stores files
- [ ] `actions/download-artifact` extracts files to workspace
- [ ] Artifacts listed in workflow run detail page
- [ ] Users can download artifacts from UI
- [ ] Artifact metadata stored in database
- [ ] Retention period configurable per-artifact
- [ ] Expired artifacts automatically cleaned up
- [ ] Checksums validated on download (optional)
