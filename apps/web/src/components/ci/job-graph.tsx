import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Clock, Loader2, Ban } from 'lucide-react';

interface JobGraphNode {
  id: string;
  name: string;
  status: string;
  level: number;
  duration?: number;
}

interface JobGraphProps {
  graph: {
    nodes: JobGraphNode[];
    edges: Array<{ from: string; to: string }>;
    criticalPath: string[];
  };
  onNodeClick?: (jobName: string) => void;
}

const statusConfig = {
  pending: { icon: Clock, color: 'bg-gray-100 border-gray-300', text: 'text-gray-500', animate: false },
  queued: { icon: Clock, color: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-600', animate: false },
  in_progress: { icon: Loader2, color: 'bg-blue-50 border-blue-300', text: 'text-blue-600', animate: true },
  completed: { icon: CheckCircle2, color: 'bg-green-50 border-green-300', text: 'text-green-600', animate: false },
  failed: { icon: XCircle, color: 'bg-red-50 border-red-300', text: 'text-red-600', animate: false },
  cancelled: { icon: Ban, color: 'bg-gray-100 border-gray-300', text: 'text-gray-500', animate: false },
};

function JobNode({ data }: { data: any }) {
  const config = statusConfig[data.status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = config.icon;
  const isOnCriticalPath = data.isOnCriticalPath;
  
  return (
    <div 
      className={cn(
        'px-4 py-3 rounded-lg border-2 min-w-[140px] cursor-pointer transition-all hover:shadow-md',
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
  
  const initialNodes: Node[] = useMemo(() => {
    const NODE_HEIGHT = 60;
    const LEVEL_GAP = 200;
    const NODE_GAP = 80;
    
    // Group by level
    const levelGroups = new Map<number, JobGraphNode[]>();
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

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
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
        attributionPosition="bottom-right"
      >
        <Background />
        <Controls />
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
