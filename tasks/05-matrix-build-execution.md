# Task: Matrix Build Execution

## Objective
Expand matrix strategy configurations into multiple parallel job executions, allowing workflows to test across multiple versions, platforms, or configurations simultaneously.

## Context

### Current State
- Matrix syntax is parsed in `src/ci/parser.ts` (lines 180-220)
- `WorkflowJob.strategy.matrix` type exists in `src/ci/types.ts`
- Matrix values are NOT expanded into multiple jobs
- Only a single job runs regardless of matrix configuration

### Desired State
- Matrix configurations expand into multiple job instances
- Each combination runs as a separate job
- Matrix values available in `${{ matrix.* }}` expressions
- Job names include matrix values (e.g., `build (node-18, ubuntu)`)
- `include` and `exclude` modifiers supported
- `fail-fast` strategy respected

## Example Matrix Configuration

```yaml
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        node: [16, 18, 20]
        os: [ubuntu-latest, macos-latest]
        exclude:
          - node: 16
            os: macos-latest
        include:
          - node: 20
            os: ubuntu-latest
            experimental: true
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
```

This should expand to 5 jobs:
- `test (16, ubuntu-latest)`
- `test (18, ubuntu-latest)`
- `test (18, macos-latest)`
- `test (20, ubuntu-latest)` with `experimental: true`
- `test (20, macos-latest)`

## Technical Requirements

### 1. Matrix Expansion Utility (`src/ci/matrix.ts`)

```typescript
export interface MatrixConfig {
  matrix: Record<string, any[]>;
  include?: Array<Record<string, any>>;
  exclude?: Array<Record<string, any>>;
}

export interface MatrixCombination {
  values: Record<string, any>;
  name: string; // e.g., "(18, ubuntu-latest)"
}

/**
 * Expand matrix configuration into all combinations
 */
export function expandMatrix(config: MatrixConfig): MatrixCombination[] {
  const { matrix, include = [], exclude = [] } = config;
  
  // Get all keys and their values
  const keys = Object.keys(matrix);
  if (keys.length === 0) return [];
  
  // Generate cartesian product
  const combinations = cartesianProduct(keys.map(k => matrix[k]));
  
  // Convert to objects with keys
  let results: MatrixCombination[] = combinations.map(combo => {
    const values: Record<string, any> = {};
    keys.forEach((key, i) => {
      values[key] = combo[i];
    });
    return {
      values,
      name: `(${combo.join(', ')})`,
    };
  });
  
  // Apply excludes
  results = results.filter(r => !matchesAnyExclude(r.values, exclude));
  
  // Apply includes (merge additional values or add new combinations)
  for (const inc of include) {
    const existing = results.find(r => matchesInclude(r.values, inc, keys));
    if (existing) {
      // Merge additional properties
      Object.assign(existing.values, inc);
    } else {
      // Add as new combination
      const name = `(${keys.map(k => inc[k] ?? '*').join(', ')})`;
      results.push({ values: inc, name });
    }
  }
  
  return results;
}

function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap(x => arr.map(y => [...x, y])),
    [[]]
  );
}

function matchesAnyExclude(values: Record<string, any>, excludes: Array<Record<string, any>>): boolean {
  return excludes.some(exc => 
    Object.entries(exc).every(([k, v]) => values[k] === v)
  );
}

function matchesInclude(values: Record<string, any>, inc: Record<string, any>, keys: string[]): boolean {
  return keys.every(k => !(k in inc) || values[k] === inc[k]);
}
```

### 2. Update Job Execution (`src/ci/executor.ts`)

Modify `WorkflowExecutor` to expand matrix jobs:

```typescript
import { expandMatrix, MatrixCombination } from './matrix';

interface ExpandedJob {
  originalName: string;
  expandedName: string;
  job: WorkflowJob;
  matrix: Record<string, any> | null;
}

class WorkflowExecutor {
  private expandJobs(): ExpandedJob[] {
    const expanded: ExpandedJob[] = [];
    
    for (const [jobName, job] of Object.entries(this.workflow.jobs)) {
      if (job.strategy?.matrix) {
        const combinations = expandMatrix({
          matrix: job.strategy.matrix,
          include: job.strategy.matrix.include,
          exclude: job.strategy.matrix.exclude,
        });
        
        for (const combo of combinations) {
          expanded.push({
            originalName: jobName,
            expandedName: `${jobName} ${combo.name}`,
            job,
            matrix: combo.values,
          });
        }
      } else {
        expanded.push({
          originalName: jobName,
          expandedName: jobName,
          job,
          matrix: null,
        });
      }
    }
    
    return expanded;
  }

  async execute(runId: string): Promise<void> {
    const expandedJobs = this.expandJobs();
    const failFast = this.getFailFastStrategy();
    let hasFailed = false;
    
    // Group by dependency order
    const jobOrder = this.getExpandedJobOrder(expandedJobs);
    
    for (const jobGroup of jobOrder) {
      if (failFast && hasFailed) {
        // Cancel remaining jobs
        for (const job of jobGroup) {
          await this.cancelJob(runId, job.expandedName);
        }
        continue;
      }
      
      // Execute jobs in this group in parallel
      const results = await Promise.all(
        jobGroup.map(job => this.executeJob(runId, job))
      );
      
      if (results.some(r => r.conclusion === 'failure')) {
        hasFailed = true;
      }
    }
  }

  private async executeJob(runId: string, expandedJob: ExpandedJob): Promise<JobResult> {
    // Create job run record with expanded name
    const jobRun = await jobRunModel.create({
      workflowRunId: runId,
      jobName: expandedJob.expandedName,
      state: 'in_progress',
      startedAt: new Date(),
    });

    // Build context with matrix values
    const context = this.buildContext();
    if (expandedJob.matrix) {
      context.matrix = expandedJob.matrix;
    }

    // Execute steps with matrix-aware expression evaluation
    // ...
  }
}
```

### 3. Update Expression Evaluation (`src/ci/executor.ts`)

Support `${{ matrix.* }}` expressions:

```typescript
private evaluateExpression(expr: string, context: ExecutionContext): any {
  // ... existing code ...
  
  // Handle matrix context
  if (expr.startsWith('matrix.')) {
    const key = expr.slice(7);
    return context.matrix?.[key];
  }
  
  // ... rest of evaluation
}
```

### 4. Database: Track Matrix Values (`src/db/schema.ts`)

Add matrix info to job runs:

```typescript
jobRuns: {
  // ... existing columns
  matrixValues: text('matrix_values'), // JSON string of matrix values
}
```

### 5. Update Job Run Model (`src/db/models/workflow.ts`)

```typescript
interface CreateJobRun {
  workflowRunId: string;
  jobName: string;
  matrixValues?: Record<string, any>;
  // ...
}

async create(data: CreateJobRun) {
  return db.insert(jobRuns).values({
    ...data,
    matrixValues: data.matrixValues ? JSON.stringify(data.matrixValues) : null,
  }).returning();
}
```

### 6. Web UI: Show Matrix Jobs (`apps/web/src/routes/repo/workflow-run-detail.tsx`)

Display matrix values in job cards:

```tsx
function JobCard({ job }: { job: JobRun }) {
  const matrixValues = job.matrixValues ? JSON.parse(job.matrixValues) : null;
  
  return (
    <div className="border rounded-lg">
      <div className="flex items-center gap-2 p-4">
        <StatusIcon status={job.state} />
        <span className="font-medium">{job.jobName}</span>
        {matrixValues && (
          <div className="flex gap-1 ml-2">
            {Object.entries(matrixValues).map(([key, value]) => (
              <Badge key={key} variant="outline" className="text-xs">
                {key}: {String(value)}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {/* ... steps */}
    </div>
  );
}
```

### 7. API Updates (`src/api/trpc/routers/workflows.ts`)

Include matrix values in job responses:

```typescript
getRun: publicProcedure
  .input(z.object({ runId: z.string() }))
  .query(async ({ input }) => {
    const run = await workflowRunModel.findById(input.runId);
    const jobs = await jobRunModel.findByRunId(input.runId);
    
    return {
      ...run,
      jobs: jobs.map(job => ({
        ...job,
        matrixValues: job.matrixValues ? JSON.parse(job.matrixValues) : null,
      })),
    };
  }),
```

## Files to Create/Modify
- `src/ci/matrix.ts` - New file (matrix expansion logic)
- `src/ci/executor.ts` - Expand jobs, pass matrix context
- `src/ci/index.ts` - Export matrix utilities
- `src/db/schema.ts` - Add matrixValues column to job_runs
- `src/db/models/workflow.ts` - Handle matrix values in CRUD
- `apps/web/src/routes/repo/workflow-run-detail.tsx` - Display matrix badges

## Testing

### Test Case 1: Basic Matrix
```yaml
strategy:
  matrix:
    node: [16, 18]
```
Expected: 2 jobs - `test (16)`, `test (18)`

### Test Case 2: Multi-dimensional Matrix
```yaml
strategy:
  matrix:
    node: [16, 18]
    os: [ubuntu, macos]
```
Expected: 4 jobs (cartesian product)

### Test Case 3: With Exclude
```yaml
strategy:
  matrix:
    node: [16, 18]
    os: [ubuntu, macos]
  exclude:
    - node: 16
      os: macos
```
Expected: 3 jobs (one excluded)

### Test Case 4: With Include
```yaml
strategy:
  matrix:
    node: [18]
  include:
    - node: 20
      experimental: true
```
Expected: 2 jobs, one with `experimental: true` in context

### Test Case 5: Fail-fast
```yaml
strategy:
  fail-fast: true
  matrix:
    node: [16, 18, 20]
```
If `test (16)` fails, `test (18)` and `test (20)` should be cancelled.

## Success Criteria
- [ ] Matrix configurations expand into multiple jobs
- [ ] Cartesian product generates all combinations
- [ ] `exclude` removes matching combinations
- [ ] `include` adds/merges combinations
- [ ] `${{ matrix.* }}` expressions resolve correctly
- [ ] Job names include matrix values
- [ ] Matrix values stored in database
- [ ] UI displays matrix badges on jobs
- [ ] `fail-fast: true` cancels remaining jobs on failure
- [ ] `fail-fast: false` continues all jobs regardless of failures
