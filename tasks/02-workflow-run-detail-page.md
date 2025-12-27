# Task: Workflow Run Detail Page

## Objective
Create a detailed view page for individual workflow runs showing jobs, steps, logs, and timing information.

## Context

### Current State
- Workflow runs list exists at `apps/web/src/routes/repo/workflows.tsx`
- API endpoint `workflows.getRun` returns run with jobs and steps
- No detail page route exists
- Users can't view logs or drill into specific runs

### Desired State
- Detail page at `/:owner/:repo/actions/runs/:runId`
- Shows workflow metadata (name, trigger, commit, branch, actor)
- Displays job list with expand/collapse
- Shows step details with logs for each job
- Timing information (duration, started, completed)
- Actions: Cancel (if running), Re-run (if failed)

## Technical Requirements

### 1. Add Route (`apps/web/src/App.tsx`)

```tsx
import { WorkflowRunDetail } from './routes/repo/workflow-run-detail';

// Inside repo routes
<Route path="actions/runs/:runId" element={<WorkflowRunDetail />} />
```

### 2. Create Page Component (`apps/web/src/routes/repo/workflow-run-detail.tsx`)

```tsx
import { useParams, Link } from 'react-router-dom';
import { 
  CheckCircle2, XCircle, Clock, Play, RotateCcw, 
  ChevronDown, ChevronRight, GitCommit, GitBranch,
  User, Calendar, Timer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import { RepoLayout } from './components/repo-layout';
import { formatRelativeTime, formatDuration } from '@/lib/utils';

export function WorkflowRunDetail() {
  const { owner, repo, runId } = useParams();
  const { data: run, isLoading } = trpc.workflows.getRun.useQuery(
    { runId: runId! },
    { enabled: !!runId }
  );

  // ... implementation
}
```

### 3. Page Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Workflow Run Header                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [Status Icon] Workflow Name                    [Actions] │ │
│ │ Triggered by: push to main • abc1234 • 5 min ago        │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Run Summary                                                  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│ │ Duration │ │ Jobs     │ │ Started  │ │ Trigger  │        │
│ │ 2m 34s   │ │ 3/3      │ │ 5m ago   │ │ push     │        │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
├─────────────────────────────────────────────────────────────┤
│ Jobs                                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ▼ [✓] build (45s)                                       │ │
│ │   ├── [✓] Checkout (2s)                                 │ │
│ │   ├── [✓] Setup Node (5s)                               │ │
│ │   ├── [✓] Install deps (20s)                            │ │
│ │   └── [✓] Build (18s)                                   │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ ▶ [✓] test (1m 20s)                                     │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ ▶ [✓] deploy (30s)                                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4. Component Breakdown

#### RunHeader Component
```tsx
function RunHeader({ run, onCancel, onRerun }) {
  const statusConfig = {
    queued: { icon: Clock, color: 'text-yellow-500', label: 'Queued' },
    in_progress: { icon: Play, color: 'text-blue-500', label: 'In Progress' },
    completed: { icon: CheckCircle2, color: 'text-green-500', label: 'Success' },
    failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
    cancelled: { icon: XCircle, color: 'text-gray-500', label: 'Cancelled' },
  };
  
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <StatusIcon status={run.state} />
          {run.workflowName}
        </h1>
        <p className="text-muted-foreground">
          {run.event} to {run.branch} • {run.commitSha.slice(0, 7)} • {formatRelativeTime(run.createdAt)}
        </p>
      </div>
      <div className="flex gap-2">
        {run.state === 'in_progress' && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {['failed', 'cancelled'].includes(run.state) && (
          <Button onClick={onRerun}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Re-run
          </Button>
        )}
      </div>
    </div>
  );
}
```

#### JobCard Component
```tsx
function JobCard({ job, isExpanded, onToggle }) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-4 hover:bg-accent/50">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
            <StatusIcon status={job.state} conclusion={job.conclusion} />
            <span className="font-medium">{job.jobName}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {formatDuration(job.startedAt, job.completedAt)}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-10 pb-4 space-y-1">
          {job.steps?.map((step, i) => (
            <StepRow key={step.id} step={step} number={i + 1} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

#### StepRow Component
```tsx
function StepRow({ step, number }) {
  const [showLogs, setShowLogs] = useState(false);
  
  return (
    <div>
      <div 
        className="flex items-center gap-2 p-2 rounded hover:bg-accent/30 cursor-pointer"
        onClick={() => setShowLogs(!showLogs)}
      >
        <StatusIcon status={step.state} conclusion={step.conclusion} size="sm" />
        <span className="text-sm">{step.stepName}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDuration(step.startedAt, step.completedAt)}
        </span>
      </div>
      {showLogs && step.logs && (
        <div className="ml-6 mt-1">
          <LogViewer logs={step.logs} />
        </div>
      )}
    </div>
  );
}
```

#### LogViewer Component
```tsx
function LogViewer({ logs }: { logs: string }) {
  return (
    <ScrollArea className="h-[300px] rounded border bg-black">
      <pre className="p-4 text-xs text-green-400 font-mono whitespace-pre-wrap">
        {logs}
      </pre>
    </ScrollArea>
  );
}
```

### 5. Utility Functions (`apps/web/src/lib/utils.ts`)

Add duration formatting:
```typescript
export function formatDuration(start?: Date | string | null, end?: Date | string | null): string {
  if (!start) return '-';
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const seconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
```

### 6. Cancel and Re-run Mutations

```tsx
const cancelMutation = trpc.workflows.cancel.useMutation({
  onSuccess: () => {
    utils.workflows.getRun.invalidate({ runId });
    toastSuccess('Workflow cancelled');
  },
});

const rerunMutation = trpc.workflows.rerun.useMutation({
  onSuccess: (newRun) => {
    navigate(`/${owner}/${repo}/actions/runs/${newRun.id}`);
    toastSuccess('Workflow re-run started');
  },
});
```

## Files to Create/Modify
- `apps/web/src/routes/repo/workflow-run-detail.tsx` - New file (main page)
- `apps/web/src/App.tsx` - Add route
- `apps/web/src/lib/utils.ts` - Add formatDuration
- `apps/web/src/routes/repo/workflows.tsx` - Add links to detail page

## API Dependencies
Existing endpoints should work:
- `workflows.getRun` - Returns run with jobs and steps
- `workflows.cancel` - Cancel running workflow
- `workflows.rerun` - Re-run failed workflow
- `workflows.getJobLogs` - Get logs for specific job (if needed separately)

## Testing
1. Navigate to a workflow run from the list
2. Verify header shows correct status, name, trigger info
3. Expand a job and verify steps are shown
4. Click a step to view logs
5. Test cancel button on running workflow
6. Test re-run button on failed workflow
7. Verify timing information is accurate

## Success Criteria
- [ ] Route `/actions/runs/:runId` loads correctly
- [ ] Header shows workflow name, status, trigger, commit, branch
- [ ] Jobs are listed with expand/collapse
- [ ] Steps show within expanded jobs
- [ ] Logs display with proper formatting
- [ ] Cancel works for in-progress runs
- [ ] Re-run works for failed/cancelled runs
- [ ] Duration displays for jobs and steps
- [ ] Back navigation to workflow list works
