/**
 * Workflow Node Components
 * 
 * Custom ReactFlow node components for the Mastra workflow visual builder.
 * Includes: TriggerNode, StepNode, ParallelNode, MapNode, ConditionNode
 */

import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Play,
  GitBranch,
  Shuffle,
  ArrowRightLeft,
  Zap,
  Terminal,
  Box,
  Code,
  GitPullRequest,
  Upload,
  Calendar,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/lib/workflow-store';
import type { 
  WorkflowNode, 
  TriggerConfig, 
  StepConfig, 
  ParallelConfig, 
  MapConfig,
  ConditionConfig,
} from '@/lib/workflow-store';

// =============================================================================
// Base Node Wrapper
// =============================================================================

interface BaseNodeProps {
  nodeId: string;
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  color: string;
  children?: React.ReactNode;
  hasInput?: boolean;
  hasOutput?: boolean;
  badges?: Array<{ label: string; variant?: 'default' | 'secondary' | 'outline' }>;
  showAddButton?: boolean;
}

function BaseNode({ 
  nodeId,
  selected, 
  icon, 
  title, 
  subtitle, 
  color, 
  children, 
  hasInput = true, 
  hasOutput = true,
  badges,
  showAddButton = true,
}: BaseNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { addNodeAfter } = useWorkflowStore();

  const handleAddStepAfter = (e: React.MouseEvent) => {
    e.stopPropagation();
    addNodeAfter(nodeId, 'step');
  };

  return (
    <div
      className={cn(
        'min-w-[180px] max-w-[280px] rounded-lg border-2 bg-card shadow-md transition-all relative',
        selected ? 'border-primary shadow-lg ring-2 ring-primary/20' : 'border-border',
        'hover:shadow-lg'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Input handle */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
        />
      )}

      {/* Header */}
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-t-lg', color)}>
        <div className="flex-shrink-0 text-white/90">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-white truncate">{title}</div>
          {subtitle && (
            <div className="text-xs text-white/70 truncate">{subtitle}</div>
          )}
        </div>
      </div>

      {/* Badges */}
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b">
          {badges.map((badge, i) => (
            <Badge key={i} variant={badge.variant || 'secondary'} className="text-xs">
              {badge.label}
            </Badge>
          ))}
        </div>
      )}

      {/* Content */}
      {children && <div className="px-3 py-2 text-xs">{children}</div>}

      {/* Output handle */}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        />
      )}

      {/* Add Step After button - shows on hover */}
      {showAddButton && hasOutput && isHovered && (
        <Button
          size="sm"
          className="absolute -right-16 top-1/2 -translate-y-1/2 h-7 w-7 p-0 rounded-full shadow-lg z-10"
          onClick={handleAddStepAfter}
          title="Add step after"
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// Trigger Node
// =============================================================================

interface TriggerNodeData {
  node: WorkflowNode;
  onEdit?: (nodeId: string) => void;
}

export const TriggerNode = memo(({ data, selected }: NodeProps<TriggerNodeData>) => {
  const config = data.node.config as TriggerConfig;
  
  const getTriggerIcon = () => {
    switch (config.type) {
      case 'push':
        return <Upload className="h-4 w-4" />;
      case 'pull_request':
        return <GitPullRequest className="h-4 w-4" />;
      case 'workflow_dispatch':
        return <Play className="h-4 w-4" />;
      case 'schedule':
        return <Calendar className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  const getTriggerSubtitle = () => {
    switch (config.type) {
      case 'push':
        return config.branches?.join(', ') || 'All branches';
      case 'pull_request':
        return config.branches?.join(', ') || 'All branches';
      case 'schedule':
        return config.cron || 'Scheduled';
      case 'workflow_dispatch':
        return 'Manual trigger';
      default:
        return 'Manual trigger';
    }
  };

  return (
    <BaseNode
      nodeId={data.node.id}
      selected={selected}
      icon={getTriggerIcon()}
      title={data.node.name}
      subtitle={getTriggerSubtitle()}
      color="bg-gradient-to-r from-green-600 to-emerald-600"
      hasInput={false}
      badges={[{ label: config.type.replace('_', ' '), variant: 'outline' }]}
    >
      {config.type === 'push' && config.paths && config.paths.length > 0 && (
        <div className="text-muted-foreground">
          Paths: {config.paths.slice(0, 2).join(', ')}
          {config.paths.length > 2 && ` +${config.paths.length - 2}`}
        </div>
      )}
      {config.type === 'workflow_dispatch' && config.inputs && config.inputs.length > 0 && (
        <div className="text-muted-foreground">
          {config.inputs.length} input{config.inputs.length > 1 ? 's' : ''}
        </div>
      )}
    </BaseNode>
  );
});
TriggerNode.displayName = 'TriggerNode';

// =============================================================================
// Step Node
// =============================================================================

interface StepNodeData {
  node: WorkflowNode;
  onEdit?: (nodeId: string) => void;
}

export const StepNode = memo(({ data, selected }: NodeProps<StepNodeData>) => {
  const config = data.node.config as StepConfig;
  
  const getStepIcon = () => {
    if (config.actionRef) {
      return <Box className="h-4 w-4" />;
    }
    if (config.runCommand) {
      return <Terminal className="h-4 w-4" />;
    }
    return <Code className="h-4 w-4" />;
  };

  const getStepType = () => {
    if (config.actionRef) return 'Action';
    if (config.runCommand) return 'Command';
    return 'Custom';
  };

  const getStepContent = () => {
    if (config.actionRef) {
      return config.actionRef;
    }
    if (config.runCommand) {
      const cmd = config.runCommand;
      return cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd;
    }
    return null;
  };

  const badges: Array<{ label: string; variant?: 'default' | 'secondary' | 'outline' }> = [
    { label: getStepType(), variant: 'secondary' },
  ];

  if (config.inputSchema.fields.length > 0) {
    badges.push({ label: `${config.inputSchema.fields.length} inputs`, variant: 'outline' });
  }
  if (config.outputSchema.fields.length > 0) {
    badges.push({ label: `${config.outputSchema.fields.length} outputs`, variant: 'outline' });
  }

  return (
    <BaseNode
      nodeId={data.node.id}
      selected={selected}
      icon={getStepIcon()}
      title={data.node.name}
      subtitle={config.id}
      color="bg-gradient-to-r from-blue-600 to-indigo-600"
      badges={badges}
    >
      {getStepContent() && (
        <div className="font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          {getStepContent()}
        </div>
      )}
      {data.node.description && (
        <div className="text-muted-foreground mt-1">{data.node.description}</div>
      )}
    </BaseNode>
  );
});
StepNode.displayName = 'StepNode';

// =============================================================================
// Parallel Node
// =============================================================================

interface ParallelNodeData {
  node: WorkflowNode;
  onEdit?: (nodeId: string) => void;
}

export const ParallelNode = memo(({ data, selected }: NodeProps<ParallelNodeData>) => {
  const config = data.node.config as ParallelConfig;

  return (
    <BaseNode
      nodeId={data.node.id}
      selected={selected}
      icon={<Shuffle className="h-4 w-4" />}
      title={data.node.name}
      subtitle="Parallel execution"
      color="bg-gradient-to-r from-purple-600 to-violet-600"
      badges={[{ label: `${config.stepIds.length} branches`, variant: 'secondary' }]}
    >
      {config.stepIds.length > 0 ? (
        <div className="space-y-1">
          {config.stepIds.slice(0, 3).map((stepId, i) => (
            <div key={i} className="flex items-center gap-1 text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              <span className="truncate">{stepId}</span>
            </div>
          ))}
          {config.stepIds.length > 3 && (
            <div className="text-muted-foreground">
              +{config.stepIds.length - 3} more
            </div>
          )}
        </div>
      ) : (
        <div className="text-muted-foreground italic">
          Drop steps here to run in parallel
        </div>
      )}
    </BaseNode>
  );
});
ParallelNode.displayName = 'ParallelNode';

// =============================================================================
// Map/Transform Node
// =============================================================================

interface MapNodeData {
  node: WorkflowNode;
  onEdit?: (nodeId: string) => void;
}

export const MapNode = memo(({ data, selected }: NodeProps<MapNodeData>) => {
  const config = data.node.config as MapConfig;
  const hasTransform = config.transformCode && config.transformCode.trim().length > 0;

  return (
    <BaseNode
      nodeId={data.node.id}
      selected={selected}
      icon={<ArrowRightLeft className="h-4 w-4" />}
      title={data.node.name}
      subtitle="Data transformation"
      color="bg-gradient-to-r from-amber-600 to-orange-600"
      badges={[{ label: 'Transform', variant: 'secondary' }]}
    >
      {hasTransform ? (
        <div className="font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded text-[10px] max-h-16 overflow-hidden">
          {config.transformCode.slice(0, 100)}
          {config.transformCode.length > 100 && '...'}
        </div>
      ) : (
        <div className="text-muted-foreground italic">
          Define transformation logic
        </div>
      )}
    </BaseNode>
  );
});
MapNode.displayName = 'MapNode';

// =============================================================================
// Condition Node
// =============================================================================

interface ConditionNodeData {
  node: WorkflowNode;
  onEdit?: (nodeId: string) => void;
}

export const ConditionNode = memo(({ data, selected }: NodeProps<ConditionNodeData>) => {
  const config = data.node.config as ConditionConfig;
  const [isHovered, setIsHovered] = useState(false);
  const { addNodeAfter } = useWorkflowStore();

  const handleAddStepAfter = (e: React.MouseEvent) => {
    e.stopPropagation();
    // For condition nodes, we could add different handling per branch
    // For now, just add after the node
    addNodeAfter(data.node.id, 'step');
  };

  return (
    <div
      className={cn(
        'min-w-[180px] max-w-[280px] rounded-lg border-2 bg-card shadow-md transition-all relative',
        selected ? 'border-primary shadow-lg ring-2 ring-primary/20' : 'border-border'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-t-lg bg-gradient-to-r from-rose-600 to-pink-600">
        <GitBranch className="h-4 w-4 text-white/90" />
        <div className="font-medium text-sm text-white">{data.node.name}</div>
      </div>

      {/* Content */}
      <div className="px-3 py-2 text-xs">
        <div className="font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          if ({config.expression || 'condition'})
        </div>
      </div>

      {/* True output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: '30%' }}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-background"
      />

      {/* False output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: '70%' }}
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-background"
      />

      {/* Labels for handles */}
      <div className="absolute right-6 text-[10px] text-green-600" style={{ top: '25%' }}>
        true
      </div>
      <div className="absolute right-6 text-[10px] text-red-600" style={{ top: '65%' }}>
        false
      </div>

      {/* Add Step After buttons - shows on hover */}
      {isHovered && (
        <>
          <Button
            size="sm"
            className="absolute -right-16 h-6 w-6 p-0 rounded-full shadow-lg z-10 bg-green-600 hover:bg-green-700"
            style={{ top: '25%' }}
            onClick={handleAddStepAfter}
            title="Add step for true branch"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            className="absolute -right-16 h-6 w-6 p-0 rounded-full shadow-lg z-10 bg-red-600 hover:bg-red-700"
            style={{ top: '65%' }}
            onClick={handleAddStepAfter}
            title="Add step for false branch"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  );
});
ConditionNode.displayName = 'ConditionNode';

// =============================================================================
// Node Type Registry
// =============================================================================

export const nodeTypes = {
  trigger: TriggerNode,
  step: StepNode,
  parallel: ParallelNode,
  map: MapNode,
  condition: ConditionNode,
};
