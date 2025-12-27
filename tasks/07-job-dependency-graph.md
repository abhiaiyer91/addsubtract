# Task: Job Dependency Graph Visualization

## Objective
Create a visual graph showing job dependencies and execution flow in the workflow run detail page.

## Context

### Current State
- Jobs execute based on `needs` dependencies in `src/ci/executor.ts`
- Topological sort determines execution order in `src/ci/index.ts`
- UI shows jobs as a flat list
- No visual indication of which jobs depend on others
- No visualization of parallel vs sequential execution

### Desired State
- Interactive DAG (Directed Acyclic Graph) showing job relationships
- Visual distinction between parallel and sequential jobs
- Real-time status updates as jobs progress
- Click on nodes to expand job details
- Show critical path highlighting

## Technical Requirements

### 1. Graph Data Structure (`src/ci/index.ts`)

Add a function to generate graph data:

```typescript
export interface JobGraphNode {
  id: string;
  name: string;
  status: 'pending' | 'queued' | 'in_progress' | 'success' | 'failure' | 'cancelled' | 'skipped';
  dependencies: string[];
  level: number; // For layout - 0 = no deps, 1 = depends on level 0, etc.
  parallel: string[]; // Jobs that run in parallel with this one
  duration?: number;
  startedAt?: Date;
  completedAt?: Date;
}

export interface JobGraph {
  nodes: JobGraphNode[];
  edges: Array<{ from: string; to: string }>;
  levels: number;
  criticalPath: string[]; // Longest path through the graph
}

export function buildJobGraph(workflow: Workflow, jobRuns?: JobRun[]): JobGraph {
  const nodes: JobGraphNode[] = [];
  const edges: Array<{ from: string; to: string }> = [];
  const levelMap = new Map<string, number>();
  
  // Build nodes and edges
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    const deps = job.needs || [];
    const jobRun = jobRuns?.find(r => r.jobName === jobName);
    
    // Calculate level (max of dependencies + 1)
    let level = 0;
    for (const dep of deps) {
      const depLevel = levelMap.get(dep) ?? 0;
      level = Math.max(level, depLevel + 1);
    }
    levelMap.set(jobName, level);
    
    nodes.push({
      id: jobName,
      name: jobName,
      status: jobRun?.state || 'pending',
      dependencies: deps,
      level,
      parallel: [], // Filled in next pass
      duration: jobRun?.completedAt && jobRun?.startedAt 
        ? new Date(jobRun.completedAt).getTime() - new Date(jobRun.startedAt).getTime()
        : undefined,
      startedAt: jobRun?.startedAt,
      completedAt: jobRun?.completedAt,
    });
    
    // Create edges
    for (const dep of deps) {
      edges.push({ from: dep, to: jobName });
    }
  }
  
  // Find parallel jobs (same level, same dependencies)
  for (const node of nodes) {
    node.parallel = nodes
      .filter(n => n.id !== node.id && n.level === node.level)
      .filter(n => arraysEqual(n.dependencies, node.dependencies))
      .map(n => n.id);
  }
  
  // Calculate critical path
  const criticalPath = findCriticalPath(nodes, edges);
  
  return {
    nodes,
    edges,
    levels: Math.max(...nodes.map(n => n.level)) + 1,
    criticalPath,
  };
}

function findCriticalPath(nodes: JobGraphNode[], edges: Array<{ from: string; to: string }>): string[] {
  // Find longest path by duration (or node count if no durations)
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  // Topological sort
  const sorted: string[] = [];
  const visited = new Set<string>();
  
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodeMap.get(id)!;
    for (const dep of node.dependencies) {
      visit(dep);
    }
    sorted.push(id);
  }
  
  nodes.forEach(n => visit(n.id));
  
  // Find longest path
  const distance = new Map<string, number>();
  const parent = new Map<string, string | null>();
  
  for (const id of sorted) {
    const node = nodeMap.get(id)!;
    const duration = node.duration || 1;
    
    let maxDist = 0;
    let maxParent: string | null = null;
    
    for (const dep of node.dependencies) {
      const depDist = distance.get(dep) || 0;
      if (depDist > maxDist) {
        maxDist = depDist;
        maxParent = dep;
      }
    }
    
    distance.set(id, maxDist + duration);
    parent.set(id, maxParent);
  }
  
  // Backtrack from node with max distance
  let maxNode = sorted[0];
  let maxDist = 0;
  for (const [id, dist] of distance) {
    if (dist > maxDist) {
      maxDist = dist;
      maxNode = id;
    }
  }
  
  const path: string[] = [];
  let current: string | null = maxNode;
  while (current) {
    path.unshift(current);
    current = parent.get(current) || null;
  }
  
  return path;
}
```

### 2. API Endpoint (`src/api/trpc/routers/workflows.ts`)

```typescript
getJobGraph: publicProcedure
  .input(z.object({ runId: z.string().uuid() }))
  .query(async ({ input }) => {
    const run = await workflowRunModel.findById(input.runId);
    if (!run) throw new TRPCError({ code: 'NOT_FOUND' });
    
    // Load workflow definition
    const repo = await repoModel.findById(run.repoId);
    const engine = new CIEngine(repo.diskPath);
    await engine.load();
    
    const workflow = engine.workflows.find(w => w._path === run.workflowPath);
    if (!workflow) throw new TRPCError({ code: 'NOT_FOUND' });
    
    // Load job runs
    const jobRuns = await jobRunModel.findByRunId(input.runId);
    
    return buildJobGraph(workflow, jobRuns);
  }),
```

### 3. Graph Component (`apps/web/src/components/ci/job-graph.tsx`)

```tsx
import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Clock, Play, Loader2 } from 'lucide-react';

interface JobGraphProps {
  graph: {
    nodes: Array<{
      id: string;
      name: string;
      status: string;
      level: number;
      duration?: number;
    }>;
    edges: Array<{ from: string; to: string }>;
    criticalPath: string[];
  };
  onNodeClick?: (jobName: string) => void;
}

const statusConfig = {
  pending: { icon: Clock, color: 'bg-gray-100 border-gray-300', text: 'text-gray-500' },
  queued: { icon: Clock, color: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-600' },
  in_progress: { icon: Loader2, color: 'bg-blue-50 border-blue-300', text: 'text-blue-600', animate: true },
  success: { icon: CheckCircle2, color: 'bg-green-50 border-green-300', text: 'text-green-600' },
  failure: { icon: XCircle, color: 'bg-red-50 border-red-300', text: 'text-red-600' },
  cancelled: { icon: XCircle, color: 'bg-gray-100 border-gray-300', text: 'text-gray-500' },
  skipped: { icon: Clock, color: 'bg-gray-50 border-gray-200', text: 'text-gray-400' },
};

function JobNode({ data }: { data: any }) {
  const config = statusConfig[data.status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = config.icon;
  const isOnCriticalPath = data.isOnCriticalPath;
  
  return (
    <div 
      className={cn(
        'px-4 py-3 rounded-lg border-2 min-w-[140px] cursor-pointer transition-all',
        config.color,
        isOnCriticalPath && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', config.text, config.animate && 'animate-spin')} />
        <span className="font-medium text-sm">{data.label}</span>
      </div>
      {data.duration && (
        <div className="text-xs text-muted-foreground mt-1">
          {formatDuration(data.duration)}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { job: JobNode };

export function JobGraph({ graph, onNodeClick }: JobGraphProps) {
  const criticalPathSet = useMemo(() => new Set(graph.criticalPath), [graph.criticalPath]);
  
  // Convert to ReactFlow format
  const initialNodes: Node[] = useMemo(() => {
    const NODE_WIDTH = 160;
    const NODE_HEIGHT = 60;
    const LEVEL_GAP = 200;
    const NODE_GAP = 80;
    
    // Group by level
    const levelGroups = new Map<number, typeof graph.nodes>();
    for (const node of graph.nodes) {
      const group = levelGroups.get(node.level) || [];
      group.push(node);
      levelGroups.set(node.level, group);
    }
    
    return graph.nodes.map(node => {
      const levelNodes = levelGroups.get(node.level) || [];
      const indexInLevel = levelNodes.findIndex(n => n.id === node.id);
      const levelHeight = levelNodes.length * NODE_HEIGHT + (levelNodes.length - 1) * NODE_GAP;
      
      return {
        id: node.id,
        type: 'job',
        position: {
          x: node.level * LEVEL_GAP,
          y: indexInLevel * (NODE_HEIGHT + NODE_GAP) - levelHeight / 2 + 200,
        },
        data: {
          label: node.name,
          status: node.status,
          duration: node.duration,
          isOnCriticalPath: criticalPathSet.has(node.id),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });
  }, [graph.nodes, criticalPathSet]);

  const initialEdges: Edge[] = useMemo(() => {
    return graph.edges.map((edge, i) => ({
      id: `e-${i}`,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: criticalPathSet.has(edge.from) && criticalPathSet.has(edge.to) 
          ? 'hsl(var(--primary))' 
          : '#94a3b8',
        strokeWidth: criticalPathSet.has(edge.from) && criticalPathSet.has(edge.to) ? 2 : 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: criticalPathSet.has(edge.from) && criticalPathSet.has(edge.to)
          ? 'hsl(var(--primary))'
          : '#94a3b8',
      },
    }));
  }, [graph.edges, criticalPathSet]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  return (
    <div className="h-[400px] border rounded-lg bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
        attributionPosition="bottom-left"
      >
        {/* Optional: Add controls, minimap */}
      </ReactFlow>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
```

### 4. Integrate into Run Detail Page

```tsx
// In workflow-run-detail.tsx
import { JobGraph } from '@/components/ci/job-graph';

function WorkflowRunDetail() {
  const { runId } = useParams();
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  
  const { data: graph } = trpc.workflows.getJobGraph.useQuery(
    { runId: runId! },
    { enabled: !!runId, refetchInterval: 5000 } // Poll for updates
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      
      {/* Job Graph */}
      {graph && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execution Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <JobGraph 
              graph={graph} 
              onNodeClick={setSelectedJob}
            />
            <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-primary" />
                Critical path
              </span>
              <span>{graph.nodes.length} jobs</span>
              <span>{graph.levels} stages</span>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Job Details (when selected) */}
      {selectedJob && (
        <JobDetailPanel 
          jobName={selectedJob} 
          runId={runId!}
          onClose={() => setSelectedJob(null)}
        />
      )}
      
      {/* Job List (collapsed when graph shown) */}
    </div>
  );
}
```

### 5. Dependencies

Add to `apps/web/package.json`:
```json
{
  "dependencies": {
    "reactflow": "^11.10.0"
  }
}
```

## Alternative: Simple SVG Graph

If ReactFlow is too heavy, here's a simpler SVG-based approach:

```tsx
function SimpleJobGraph({ graph }: { graph: JobGraph }) {
  const LEVEL_WIDTH = 180;
  const NODE_HEIGHT = 50;
  const NODE_GAP = 20;
  
  return (
    <svg 
      width={graph.levels * LEVEL_WIDTH + 100} 
      height={Math.max(...graph.nodes.map(n => n.level)) * (NODE_HEIGHT + NODE_GAP) + 100}
      className="overflow-visible"
    >
      {/* Edges */}
      {graph.edges.map((edge, i) => {
        const from = graph.nodes.find(n => n.id === edge.from)!;
        const to = graph.nodes.find(n => n.id === edge.to)!;
        return (
          <path
            key={i}
            d={`M ${from.level * LEVEL_WIDTH + 140} ${from.index * (NODE_HEIGHT + NODE_GAP) + 25}
                C ${from.level * LEVEL_WIDTH + 160} ${from.index * (NODE_HEIGHT + NODE_GAP) + 25}
                  ${to.level * LEVEL_WIDTH - 20} ${to.index * (NODE_HEIGHT + NODE_GAP) + 25}
                  ${to.level * LEVEL_WIDTH} ${to.index * (NODE_HEIGHT + NODE_GAP) + 25}`}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.5"
            markerEnd="url(#arrow)"
          />
        );
      })}
      
      {/* Nodes */}
      {graph.nodes.map(node => (
        <g key={node.id} transform={`translate(${node.level * LEVEL_WIDTH}, ${node.index * (NODE_HEIGHT + NODE_GAP)})`}>
          <rect
            width="140"
            height={NODE_HEIGHT}
            rx="8"
            className={cn('fill-card stroke-border stroke-2')}
          />
          <text x="70" y="30" textAnchor="middle" className="text-sm fill-foreground">
            {node.name}
          </text>
        </g>
      ))}
      
      {/* Arrow marker */}
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" />
        </marker>
      </defs>
    </svg>
  );
}
```

## Files to Create/Modify
- `src/ci/index.ts` - Add buildJobGraph function
- `src/api/trpc/routers/workflows.ts` - Add getJobGraph endpoint
- `apps/web/src/components/ci/job-graph.tsx` - New file (graph component)
- `apps/web/src/routes/repo/workflow-run-detail.tsx` - Integrate graph
- `apps/web/package.json` - Add reactflow dependency

## Testing
1. Create workflow with multiple jobs and dependencies
2. Run workflow and open detail page
3. Verify graph renders with correct layout
4. Verify edges connect dependent jobs
5. Verify status colors update as jobs progress
6. Click on node, verify detail panel opens
7. Verify critical path is highlighted
8. Test with parallel jobs (same level)

## Success Criteria
- [ ] Graph renders job nodes in correct positions
- [ ] Edges show dependency relationships
- [ ] Node status updates in real-time
- [ ] Critical path highlighted
- [ ] Parallel jobs shown at same level
- [ ] Click on node shows job details
- [ ] Graph is zoomable/pannable
- [ ] Works with complex workflows (10+ jobs)
- [ ] Mobile-friendly (scrollable)
