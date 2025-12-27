# Task: Scheduled Workflow Runner (Cron)

## Objective
Implement a scheduler that triggers workflows with `schedule` triggers at their configured cron times.

## Context

### Current State
- Workflow parser supports `schedule` trigger with cron syntax (`src/ci/parser.ts`)
- `WorkflowTrigger` type includes `schedule?: { cron: string }[]`
- No scheduler runs to execute scheduled workflows
- Cron patterns are validated but never acted upon

### Desired State
- Background scheduler checks for due workflows
- Executes workflows at configured cron times
- Records scheduled runs in database
- Shows scheduled runs in workflow UI

## Technical Requirements

### 1. Cron Scheduler Service (`src/ci/scheduler.ts`)

```typescript
import cron from 'node-cron';
import { CronJob } from 'cron';
import { CIEngine, ciEngine } from './index';
import { WorkflowExecutor } from './executor';
import { workflowRunModel } from '../db/models/workflow';
import { repoModel } from '../db/models/repository';
import { eventBus } from '../events';
import path from 'path';

interface ScheduledWorkflow {
  repoId: string;
  repoPath: string;
  workflowPath: string;
  workflowName: string;
  cronExpression: string;
}

class WorkflowScheduler {
  private jobs: Map<string, CronJob> = new Map();
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('[Scheduler] Starting workflow scheduler...');
    
    // Load all scheduled workflows
    await this.loadScheduledWorkflows();
    
    // Re-scan periodically for new/changed workflows
    setInterval(() => this.loadScheduledWorkflows(), 60 * 1000); // Every minute
    
    console.log(`[Scheduler] Started with ${this.jobs.size} scheduled workflows`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    for (const [key, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    console.log('[Scheduler] Stopped');
  }

  private async loadScheduledWorkflows(): Promise<void> {
    const repos = await repoModel.findAll();
    const scheduled: ScheduledWorkflow[] = [];

    for (const repo of repos) {
      try {
        const engine = new CIEngine(repo.diskPath);
        await engine.load();
        
        for (const workflow of engine.workflows) {
          const trigger = workflow.on;
          
          // Handle schedule triggers
          if (trigger && typeof trigger === 'object' && 'schedule' in trigger) {
            const schedules = trigger.schedule;
            if (Array.isArray(schedules)) {
              for (const schedule of schedules) {
                if (schedule.cron) {
                  scheduled.push({
                    repoId: repo.id,
                    repoPath: repo.diskPath,
                    workflowPath: workflow._path || '',
                    workflowName: workflow.name,
                    cronExpression: schedule.cron,
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        // Skip repos with invalid workflows
        console.warn(`[Scheduler] Failed to load workflows for ${repo.name}:`, error);
      }
    }

    // Update cron jobs
    this.updateJobs(scheduled);
  }

  private updateJobs(scheduled: ScheduledWorkflow[]): void {
    const newKeys = new Set<string>();

    for (const workflow of scheduled) {
      const key = `${workflow.repoId}:${workflow.workflowPath}:${workflow.cronExpression}`;
      newKeys.add(key);

      if (!this.jobs.has(key)) {
        // Create new cron job
        try {
          const job = new CronJob(
            workflow.cronExpression,
            () => this.executeScheduledWorkflow(workflow),
            null,
            true, // start
            'UTC'
          );
          this.jobs.set(key, job);
          console.log(`[Scheduler] Scheduled: ${workflow.workflowName} (${workflow.cronExpression})`);
        } catch (error) {
          console.error(`[Scheduler] Invalid cron: ${workflow.cronExpression}`, error);
        }
      }
    }

    // Remove jobs that no longer exist
    for (const [key, job] of this.jobs) {
      if (!newKeys.has(key)) {
        job.stop();
        this.jobs.delete(key);
        console.log(`[Scheduler] Removed scheduled job: ${key}`);
      }
    }
  }

  private async executeScheduledWorkflow(workflow: ScheduledWorkflow): Promise<void> {
    console.log(`[Scheduler] Executing: ${workflow.workflowName}`);
    
    try {
      const repo = await repoModel.findById(workflow.repoId);
      if (!repo) {
        console.error(`[Scheduler] Repo not found: ${workflow.repoId}`);
        return;
      }

      // Get default branch
      const defaultBranch = repo.defaultBranch || 'main';
      
      // Get latest commit on default branch
      const { execSync } = require('child_process');
      const commitSha = execSync(`git rev-parse ${defaultBranch}`, {
        cwd: repo.diskPath,
        encoding: 'utf-8',
      }).trim();

      // Create workflow run
      const run = await workflowRunModel.create({
        repoId: workflow.repoId,
        workflowPath: workflow.workflowPath,
        workflowName: workflow.workflowName,
        commitSha,
        branch: defaultBranch,
        event: 'schedule',
        eventPayload: JSON.stringify({ cron: workflow.cronExpression }),
        state: 'queued',
        triggeredById: null, // System triggered
      });

      // Execute workflow
      const engine = new CIEngine(repo.diskPath);
      await engine.load();
      
      const workflowDef = engine.workflows.find(w => w._path === workflow.workflowPath);
      if (!workflowDef) {
        throw new Error(`Workflow not found: ${workflow.workflowPath}`);
      }

      const executor = new WorkflowExecutor(
        workflowDef,
        {
          event: 'schedule',
          ref: `refs/heads/${defaultBranch}`,
          sha: commitSha,
          repository: {
            full_name: `${repo.owner?.username || repo.orgId}/${repo.name}`,
            default_branch: defaultBranch,
          },
          sender: { login: 'scheduler', id: 'system' },
        },
        repo.diskPath
      );

      await executor.execute(run.id);

      console.log(`[Scheduler] Completed: ${workflow.workflowName} (run: ${run.id})`);
      
    } catch (error) {
      console.error(`[Scheduler] Failed: ${workflow.workflowName}`, error);
    }
  }

  getStatus(): { running: boolean; jobs: number; schedules: Array<{ name: string; cron: string; next: Date | null }> } {
    const schedules = Array.from(this.jobs.entries()).map(([key, job]) => {
      const [, , cron] = key.split(':');
      return {
        name: key,
        cron,
        next: job.nextDate()?.toJSDate() || null,
      };
    });

    return {
      running: this.isRunning,
      jobs: this.jobs.size,
      schedules,
    };
  }
}

export const workflowScheduler = new WorkflowScheduler();
```

### 2. Start Scheduler with Server (`src/server/index.ts`)

```typescript
import { workflowScheduler } from '../ci/scheduler';

// After server starts
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start workflow scheduler
  await workflowScheduler.start();
});

// On shutdown
process.on('SIGTERM', async () => {
  await workflowScheduler.stop();
  // ... other cleanup
});
```

### 3. API Endpoint for Scheduler Status (`src/api/trpc/routers/workflows.ts`)

```typescript
// Add to workflows router
schedulerStatus: publicProcedure
  .query(async () => {
    return workflowScheduler.getStatus();
  }),

// List upcoming scheduled runs
upcomingScheduled: publicProcedure
  .input(z.object({ repoId: z.string().uuid().optional() }))
  .query(async ({ input }) => {
    const status = workflowScheduler.getStatus();
    
    let schedules = status.schedules;
    if (input.repoId) {
      schedules = schedules.filter(s => s.name.startsWith(input.repoId));
    }
    
    return schedules
      .filter(s => s.next)
      .sort((a, b) => (a.next?.getTime() || 0) - (b.next?.getTime() || 0))
      .slice(0, 10);
  }),
```

### 4. Web UI: Scheduled Workflows Section (`apps/web/src/routes/repo/workflows.tsx`)

Add a section showing upcoming scheduled runs:

```tsx
function ScheduledWorkflows({ repoId }: { repoId: string }) {
  const { data: upcoming } = trpc.workflows.upcomingScheduled.useQuery({ repoId });

  if (!upcoming || upcoming.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Scheduled Runs
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {upcoming.map((schedule, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{schedule.name.split(':')[1]}</span>
                <span className="text-muted-foreground ml-2">({schedule.cron})</span>
              </div>
              <span className="text-muted-foreground">
                Next: {schedule.next ? formatRelativeTime(schedule.next) : 'N/A'}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 5. Badge for Scheduled Runs

In workflow run list, show "scheduled" badge:

```tsx
{run.event === 'schedule' && (
  <Badge variant="outline" className="gap-1">
    <Clock className="h-3 w-3" />
    Scheduled
  </Badge>
)}
```

### 6. Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "cron": "^3.1.0"
  },
  "devDependencies": {
    "@types/cron": "^2.0.0"
  }
}
```

## Cron Syntax Support

Standard cron format (5 or 6 fields):
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6)
│ │ │ │ │
* * * * *
```

Examples:
- `0 0 * * *` - Daily at midnight
- `0 */6 * * *` - Every 6 hours
- `30 9 * * 1-5` - Weekdays at 9:30 AM
- `0 0 1 * *` - First of every month

## Files to Create/Modify
- `src/ci/scheduler.ts` - New file (scheduler service)
- `src/server/index.ts` - Start scheduler on boot
- `src/api/trpc/routers/workflows.ts` - Add status/upcoming endpoints
- `apps/web/src/routes/repo/workflows.tsx` - Show scheduled runs
- `package.json` - Add cron dependency

## Testing
1. Create a workflow with schedule trigger:
   ```yaml
   on:
     schedule:
       - cron: '*/5 * * * *'  # Every 5 minutes
   ```
2. Start server, verify scheduler loads workflow
3. Wait for cron trigger, verify workflow executes
4. Check database for run with `event: 'schedule'`
5. Verify UI shows scheduled badge
6. Test scheduler status API endpoint

## Success Criteria
- [ ] Scheduler starts automatically with server
- [ ] Loads scheduled workflows from all repos
- [ ] Executes workflows at correct cron times
- [ ] Creates proper workflow run records
- [ ] Shows scheduled runs in UI
- [ ] Handles invalid cron expressions gracefully
- [ ] Re-scans for new/changed schedules
- [ ] Stops cleanly on server shutdown
