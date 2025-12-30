/**
 * Visual Workflow Canvas
 * 
 * ReactFlow-based visual editor for building Mastra workflows.
 * Supports drag-and-drop, node connections, and real-time code generation.
 */

import { useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  ReactFlowInstance,
  ConnectionMode,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Plus, 
  Trash2, 
  Undo2, 
  Redo2, 
  Code, 
  Play,
  Zap,
  Box,
  Shuffle,
  ArrowRightLeft,
  GitBranch,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useWorkflowStore, type WorkflowNode, type NodeType } from '@/lib/workflow-store';
import { nodeTypes } from './workflow-nodes';
import { cn } from '@/lib/utils';

// =============================================================================
// Canvas Component
// =============================================================================

interface VisualWorkflowCanvasProps {
  onSave?: () => void;
  onPreview?: () => void;
  readOnly?: boolean;
}

export function VisualWorkflowCanvas({ onSave, onPreview, readOnly = false }: VisualWorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const { 
    workflow,
    selectedNodeId,
    selectedEdgeId,
    addNode,
    updateNode,
    deleteNode,
    selectNode,
    addEdge: addWorkflowEdge,
    deleteEdge,
    selectEdge,
    undo,
    redo,
    toggleCodePreview,
    validate,
    isDirty,
    validationErrors,
  } = useWorkflowStore();

  // Convert workflow nodes to ReactFlow nodes
  const initialNodes: Node[] = useMemo(() => {
    return workflow.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: { 
        node,
        onEdit: selectNode,
      },
      selected: node.id === selectedNodeId,
    }));
  }, [workflow.nodes, selectedNodeId, selectNode]);

  // Convert workflow edges to ReactFlow edges
  const initialEdges: Edge[] = useMemo(() => {
    return workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: 'smoothstep',
      animated: false,
      style: { stroke: edge.id === selectedEdgeId ? 'hsl(var(--primary))' : '#94a3b8', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edge.id === selectedEdgeId ? 'hsl(var(--primary))' : '#94a3b8',
      },
    }));
  }, [workflow.edges, selectedEdgeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Handle node position changes
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      updateNode(node.id, { position: node.position });
    },
    [updateNode]
  );

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addWorkflowEdge(
          connection.source, 
          connection.target,
          connection.sourceHandle || undefined,
          connection.targetHandle || undefined
        );
        setEdges((eds) => addEdge({
          ...connection,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
        }, eds));
      }
    },
    [addWorkflowEdge, setEdges]
  );

  // Handle node selection
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  // Handle edge selection
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      selectEdge(edge.id);
    },
    [selectEdge]
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  // Handle node deletion
  const onNodesDelete = useCallback(
    (nodesToDelete: Node[]) => {
      for (const node of nodesToDelete) {
        deleteNode(node.id);
      }
    },
    [deleteNode]
  );

  // Handle edge deletion
  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      for (const edge of edgesToDelete) {
        deleteEdge(edge.id);
      }
    },
    [deleteEdge]
  );

  // Drop handler for adding new nodes
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (!type || !reactFlowInstance.current || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.current.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      addNode(type, position);
    },
    [addNode]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Add node from menu
  const handleAddNode = (type: NodeType) => {
    const centerPosition = reactFlowInstance.current?.project({
      x: reactFlowWrapper.current?.clientWidth ? reactFlowWrapper.current.clientWidth / 2 : 300,
      y: reactFlowWrapper.current?.clientHeight ? reactFlowWrapper.current.clientHeight / 2 : 200,
    }) || { x: 300, y: 200 };
    
    addNode(type, centerPosition);
  };

  // Delete selected element
  const handleDeleteSelected = () => {
    if (selectedNodeId) {
      deleteNode(selectedNodeId);
    } else if (selectedEdgeId) {
      deleteEdge(selectedEdgeId);
    }
  };

  // Handle save
  const handleSave = () => {
    if (validate()) {
      onSave?.();
    }
  };

  return (
    <div ref={reactFlowWrapper} className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={(instance) => { reactFlowInstance.current = instance; }}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={readOnly ? null : 'Delete'}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.type) {
              case 'trigger': return '#16a34a';
              case 'step': return '#2563eb';
              case 'parallel': return '#9333ea';
              case 'map': return '#d97706';
              case 'condition': return '#e11d48';
              default: return '#6b7280';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />

        {/* Toolbar Panel */}
        {!readOnly && (
          <Panel position="top-left" className="flex gap-2">
            {/* Add Node Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Node
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>Triggers</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleAddNode('trigger')}>
                  <Zap className="h-4 w-4 mr-2 text-green-600" />
                  Trigger
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Steps</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleAddNode('step')}>
                  <Box className="h-4 w-4 mr-2 text-blue-600" />
                  Step
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddNode('parallel')}>
                  <Shuffle className="h-4 w-4 mr-2 text-purple-600" />
                  Parallel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddNode('map')}>
                  <ArrowRightLeft className="h-4 w-4 mr-2 text-amber-600" />
                  Transform
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddNode('condition')}>
                  <GitBranch className="h-4 w-4 mr-2 text-rose-600" />
                  Condition
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Undo/Redo */}
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={undo}>
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={redo}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Delete */}
            {(selectedNodeId || selectedEdgeId) && (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={handleDeleteSelected}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </Panel>
        )}

        {/* Action Panel */}
        <Panel position="top-right" className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleCodePreview}>
            <Code className="h-4 w-4" />
            View Code
          </Button>
          {onPreview && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onPreview}>
              <Play className="h-4 w-4" />
              Preview
            </Button>
          )}
          {onSave && (
            <Button 
              size="sm" 
              className="gap-1.5" 
              onClick={handleSave}
              disabled={!isDirty}
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          )}
        </Panel>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Panel position="bottom-left" className="max-w-sm">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
              <div className="font-medium text-destructive mb-1">Validation Errors</div>
              <ul className="list-disc list-inside text-destructive/90 space-y-0.5">
                {validationErrors.slice(0, 5).map((error, i) => (
                  <li key={i}>{error.message}</li>
                ))}
                {validationErrors.length > 5 && (
                  <li>+{validationErrors.length - 5} more errors</li>
                )}
              </ul>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

// =============================================================================
// Node Palette Component (for sidebar)
// =============================================================================

interface NodePaletteProps {
  className?: string;
}

export function NodePalette({ className }: NodePaletteProps) {
  const nodeItems = [
    { type: 'trigger' as const, label: 'Trigger', icon: Zap, color: 'bg-green-600', description: 'Start workflow' },
    { type: 'step' as const, label: 'Step', icon: Box, color: 'bg-blue-600', description: 'Execute code' },
    { type: 'parallel' as const, label: 'Parallel', icon: Shuffle, color: 'bg-purple-600', description: 'Run in parallel' },
    { type: 'map' as const, label: 'Transform', icon: ArrowRightLeft, color: 'bg-amber-600', description: 'Transform data' },
    { type: 'condition' as const, label: 'Condition', icon: GitBranch, color: 'bg-rose-600', description: 'Branch logic' },
  ];

  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className={cn('space-y-2', className)}>
      <h3 className="font-medium text-sm text-muted-foreground px-1">Drag nodes to canvas</h3>
      <div className="space-y-1">
        {nodeItems.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            className={cn(
              'flex items-center gap-3 p-2 rounded-lg border cursor-grab',
              'hover:bg-accent/50 hover:border-primary/30 transition-colors',
              'active:cursor-grabbing'
            )}
          >
            <div className={cn('p-1.5 rounded', item.color)}>
              <item.icon className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
