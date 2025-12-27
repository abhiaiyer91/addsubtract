# Task: PR Status Check Integration

## Objective
When CI workflows complete, automatically update the associated Pull Request with check status so users can see pass/fail results directly on the PR page.

## Context

### Current State
- CI runs are triggered on PR events (`pr.created`, `pr.updated`) via `src/events/handlers/ci.ts`
- CI completion emits `ci.completed` event with `prId`, `prNumber`, `conclusion`
- PR page exists at `apps/web/src/routes/repo/pull-request.tsx`
- No connection between CI results and PR status display

### Desired State
- PR page shows CI check status (pending/success/failure)
- Each workflow run appears as a "check" on the PR
- Clicking a check links to the workflow run
- Branch protection can require these checks to pass

## Technical Requirements

### 1. Database Schema Changes (`src/db/schema.ts`)

Add a `pr_checks` table to track check status:

```typescript
export const prChecks = pgTable('pr_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  pullRequestId: uuid('pull_request_id').notNull().references(() => pullRequests.id, { onDelete: 'cascade' }),
  workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id, { onDelete: 'set null' }),
  name: text('name').notNull(), // workflow name
  status: text('status').notNull().default('pending'), // 'pending' | 'in_progress' | 'success' | 'failure' | 'cancelled'
  conclusion: text('conclusion'), // 'success' | 'failure' | 'cancelled' | 'skipped'
  detailsUrl: text('details_url'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### 2. Database Model (`src/db/models/pr-checks.ts`)

Create model with these functions:
- `create(data)` - Create a new check
- `update(id, data)` - Update check status
- `findByPrId(prId)` - Get all checks for a PR
- `findByWorkflowRunId(runId)` - Get check by workflow run
- `upsertByWorkflowRun(prId, workflowRunId, data)` - Create or update

### 3. Event Handler Updates (`src/events/handlers/ci.ts`)

When workflow starts for a PR:
```typescript
eventBus.on('workflow.started', async (event) => {
  if (event.prId) {
    await prCheckModel.create({
      pullRequestId: event.prId,
      workflowRunId: event.runId,
      name: event.workflowName,
      status: 'in_progress',
      startedAt: new Date(),
    });
  }
});
```

When workflow completes:
```typescript
// In existing ci.completed handler
if (event.payload.prId) {
  await prCheckModel.update(checkId, {
    status: event.payload.conclusion === 'success' ? 'success' : 'failure',
    conclusion: event.payload.conclusion,
    completedAt: new Date(),
  });
}
```

### 4. API Route (`src/api/trpc/routers/pulls.ts`)

Add endpoint to get PR checks:
```typescript
getChecks: publicProcedure
  .input(z.object({ pullRequestId: z.string().uuid() }))
  .query(async ({ input }) => {
    return prCheckModel.findByPrId(input.pullRequestId);
  }),
```

### 5. Web UI Updates (`apps/web/src/routes/repo/pull-request.tsx`)

Add a "Checks" section to the PR page:

```tsx
function PRChecks({ prId }: { prId: string }) {
  const { data: checks } = trpc.pulls.getChecks.useQuery({ pullRequestId: prId });
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Checks</CardTitle>
      </CardHeader>
      <CardContent>
        {checks?.map(check => (
          <div key={check.id} className="flex items-center gap-2">
            <StatusIcon status={check.status} />
            <span>{check.name}</span>
            {check.workflowRunId && (
              <Link to={`../actions/runs/${check.workflowRunId}`}>
                View run
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

### 6. Branch Protection Integration (`src/core/branch-protection.ts`)

Update `getPassedChecks()` to use the new pr_checks table:
```typescript
async function getPassedChecks(prId: string): Promise<string[]> {
  const checks = await prCheckModel.findByPrId(prId);
  return checks
    .filter(c => c.status === 'success')
    .map(c => c.name);
}
```

## Files to Modify
- `src/db/schema.ts` - Add prChecks table
- `src/db/models/pr-checks.ts` - New file
- `src/db/models/index.ts` - Export new model
- `src/events/handlers/ci.ts` - Create/update checks on workflow events
- `src/api/trpc/routers/pulls.ts` - Add getChecks endpoint
- `apps/web/src/routes/repo/pull-request.tsx` - Add checks UI
- `src/core/branch-protection.ts` - Use pr_checks for validation

## Testing
1. Create a PR on a repo with a workflow
2. Verify check appears as "pending" then "in_progress"
3. Verify check updates to "success" or "failure" on completion
4. Verify clicking check links to workflow run
5. Verify branch protection respects check status

## Success Criteria
- [ ] PR page shows all CI checks with status
- [ ] Checks update in real-time as CI progresses
- [ ] Check names link to workflow run details
- [ ] Branch protection validates against PR checks
- [ ] Merge button disabled when required checks fail
