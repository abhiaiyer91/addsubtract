# Task: Live Log Streaming for CI Runs

## Objective
Stream CI logs in real-time to the web UI as jobs execute, instead of only showing logs after completion.

## Context

### Current State
- Logs are stored in `step_runs.logs` column after step completes
- `workflows.getJobLogs` API returns logs from database
- No real-time updates during execution
- Users must refresh to see new logs

### Desired State
- Logs stream live as they're written during execution
- WebSocket/SSE subscription for log updates
- UI auto-scrolls as new logs arrive
- Logs persist to database for historical viewing

## Technical Requirements

### 1. Log Storage Strategy

Logs will be written to:
1. **Temporary file** during execution (for streaming)
2. **Database** after step completes (for persistence)

Log file location: `~/.wit/logs/{runId}/{jobName}/{stepNumber}.log`

### 2. Backend: Log Writer (`src/ci/log-writer.ts`)

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

class LogWriter extends EventEmitter {
  private basePath: string;
  private streams: Map<string, fs.WriteStream> = new Map();

  constructor() {
    super();
    this.basePath = path.join(os.homedir(), '.wit', 'logs');
  }

  private getLogPath(runId: string, jobName: string, stepNumber: number): string {
    return path.join(this.basePath, runId, jobName, `${stepNumber}.log`);
  }

  async write(runId: string, jobName: string, stepNumber: number, content: string): Promise<void> {
    const logPath = this.getLogPath(runId, jobName, stepNumber);
    const dir = path.dirname(logPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const key = `${runId}:${jobName}:${stepNumber}`;
    let stream = this.streams.get(key);
    
    if (!stream) {
      stream = fs.createWriteStream(logPath, { flags: 'a' });
      this.streams.set(key, stream);
    }

    stream.write(content);
    
    // Emit for real-time subscribers
    this.emit('log', { runId, jobName, stepNumber, content });
  }

  async close(runId: string, jobName: string, stepNumber: number): Promise<string> {
    const key = `${runId}:${jobName}:${stepNumber}`;
    const stream = this.streams.get(key);
    
    if (stream) {
      stream.end();
      this.streams.delete(key);
    }

    // Read full log for database storage
    const logPath = this.getLogPath(runId, jobName, stepNumber);
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, 'utf-8');
    }
    return '';
  }

  async read(runId: string, jobName: string, stepNumber: number, offset = 0): Promise<string> {
    const logPath = this.getLogPath(runId, jobName, stepNumber);
    if (!fs.existsSync(logPath)) return '';
    
    const content = fs.readFileSync(logPath, 'utf-8');
    return content.slice(offset);
  }

  cleanup(runId: string): void {
    const runDir = path.join(this.basePath, runId);
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  }
}

export const logWriter = new LogWriter();
```

### 3. Update Executor (`src/ci/executor.ts`)

Modify `executeStep` to stream logs:

```typescript
import { logWriter } from './log-writer';

private async executeStep(step: Step, context: ExecutionContext, stepNumber: number): Promise<StepResult> {
  const { runId, jobName } = context;
  
  // ... existing setup code ...

  if (step.run) {
    const child = spawn('sh', ['-c', command], { 
      cwd: context.workspace,
      env: { ...process.env, ...context.env },
    });

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      logWriter.write(runId, jobName, stepNumber, text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      logWriter.write(runId, jobName, stepNumber, text);
    });

    // ... wait for completion ...
    
    // Close log file and get full content
    const fullLog = await logWriter.close(runId, jobName, stepNumber);
    
    // Store in database
    await stepRunModel.update(stepRunId, { logs: fullLog });
  }
  
  // ...
}
```

### 4. WebSocket/SSE Subscription (`src/api/trpc/routers/workflows.ts`)

Add subscription for log streaming:

```typescript
import { observable } from '@trpc/server/observable';
import { logWriter } from '../../ci/log-writer';

// Add to workflows router
subscribeLogs: publicProcedure
  .input(z.object({
    runId: z.string(),
    jobName: z.string().optional(),
  }))
  .subscription(({ input }) => {
    return observable<{ jobName: string; stepNumber: number; content: string }>((emit) => {
      const handler = (data: { runId: string; jobName: string; stepNumber: number; content: string }) => {
        if (data.runId === input.runId) {
          if (!input.jobName || data.jobName === input.jobName) {
            emit.next({
              jobName: data.jobName,
              stepNumber: data.stepNumber,
              content: data.content,
            });
          }
        }
      };

      logWriter.on('log', handler);
      
      return () => {
        logWriter.off('log', handler);
      };
    });
  }),

// Endpoint to get current logs (with offset for pagination)
getLogs: publicProcedure
  .input(z.object({
    runId: z.string(),
    jobName: z.string(),
    stepNumber: z.number(),
    offset: z.number().default(0),
  }))
  .query(async ({ input }) => {
    // First try file (for in-progress)
    const fileLogs = await logWriter.read(input.runId, input.jobName, input.stepNumber, input.offset);
    if (fileLogs) {
      return { logs: fileLogs, source: 'file' };
    }
    
    // Fall back to database (for completed)
    const stepRun = await stepRunModel.findByJobAndNumber(input.runId, input.jobName, input.stepNumber);
    if (stepRun?.logs) {
      return { logs: stepRun.logs.slice(input.offset), source: 'db' };
    }
    
    return { logs: '', source: 'none' };
  }),
```

### 5. Web UI: Live Log Component (`apps/web/src/components/ci/live-logs.tsx`)

```tsx
import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LiveLogsProps {
  runId: string;
  jobName: string;
  stepNumber: number;
  isRunning: boolean;
}

export function LiveLogs({ runId, jobName, stepNumber, isRunning }: LiveLogsProps) {
  const [logs, setLogs] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Initial load
  const { data: initialLogs } = trpc.workflows.getLogs.useQuery({
    runId,
    jobName,
    stepNumber,
    offset: 0,
  });

  useEffect(() => {
    if (initialLogs?.logs) {
      setLogs(initialLogs.logs);
    }
  }, [initialLogs]);

  // Subscribe to live updates if running
  trpc.workflows.subscribeLogs.useSubscription(
    { runId, jobName },
    {
      enabled: isRunning,
      onData: (data) => {
        if (data.stepNumber === stepNumber) {
          setLogs(prev => prev + data.content);
        }
      },
    }
  );

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="relative">
      <ScrollArea 
        ref={scrollRef}
        className="h-[400px] rounded border bg-black"
        onScroll={handleScroll}
      >
        <pre className="p-4 text-xs text-green-400 font-mono whitespace-pre-wrap">
          {logs || 'Waiting for logs...'}
        </pre>
      </ScrollArea>
      
      {!autoScroll && (
        <button
          className="absolute bottom-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded text-sm"
          onClick={() => {
            setAutoScroll(true);
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }}
        >
          Jump to bottom
        </button>
      )}
    </div>
  );
}
```

### 6. ANSI Color Support (Optional Enhancement)

Add ANSI color parsing for nicer log display:

```tsx
import AnsiToHtml from 'ansi-to-html';

const convert = new AnsiToHtml({
  fg: '#22c55e',
  bg: '#000',
  newline: true,
  escapeXML: true,
});

function LogContent({ logs }: { logs: string }) {
  const html = convert.toHtml(logs);
  return (
    <pre 
      className="p-4 text-xs font-mono whitespace-pre-wrap"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

## Files to Create/Modify
- `src/ci/log-writer.ts` - New file (log file management)
- `src/ci/executor.ts` - Stream logs during execution
- `src/api/trpc/routers/workflows.ts` - Add subscribeLogs, getLogs endpoints
- `apps/web/src/components/ci/live-logs.tsx` - New file (live log viewer)
- `apps/web/src/routes/repo/workflow-run-detail.tsx` - Use LiveLogs component
- `package.json` - Add `ansi-to-html` dependency (optional)

## WebSocket Setup

Ensure tRPC WebSocket adapter is configured in `src/server/index.ts`:

```typescript
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server: httpServer });
applyWSSHandler({
  wss,
  router: appRouter,
  createContext,
});
```

And in frontend `apps/web/src/lib/trpc.ts`:

```typescript
import { createWSClient, wsLink } from '@trpc/client';

const wsClient = createWSClient({
  url: `ws://localhost:3000/trpc`,
});

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({ url: '/trpc' }),
    }),
  ],
});
```

## Testing
1. Start a workflow with a long-running step
2. Open run detail page immediately
3. Verify logs appear in real-time
4. Verify auto-scroll works
5. Scroll up manually, verify "Jump to bottom" appears
6. Wait for completion, verify logs persist in database
7. Refresh page, verify historical logs load from database

## Success Criteria
- [ ] Logs stream in real-time during execution
- [ ] No polling - uses WebSocket subscription
- [ ] Auto-scroll follows new content
- [ ] Manual scroll disables auto-scroll
- [ ] "Jump to bottom" button when scrolled up
- [ ] Logs persist to database after completion
- [ ] Historical runs show logs from database
- [ ] ANSI colors render correctly (optional)
