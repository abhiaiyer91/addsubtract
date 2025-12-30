/**
 * Workflow Builder Store
 * 
 * Zustand store for managing the visual Mastra workflow builder state.
 * Handles workflow graph, nodes, edges, and code generation.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';

// =============================================================================
// Types for Visual Workflow Representation
// =============================================================================

export type NodeType = 'trigger' | 'step' | 'parallel' | 'map' | 'condition';

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown';
  required: boolean;
  description?: string;
  default?: unknown;
}

export interface WorkflowSchema {
  fields: SchemaField[];
}

export interface StepConfig {
  id: string;
  name: string;
  description?: string;
  inputSchema: WorkflowSchema;
  outputSchema: WorkflowSchema;
  executeCode: string;
  /** For action steps: reference to a pre-built action */
  actionRef?: string;
  /** For run steps: shell command */
  runCommand?: string;
}

export interface TriggerConfig {
  type: 'push' | 'pull_request' | 'workflow_dispatch' | 'schedule' | 'manual';
  branches?: string[];
  paths?: string[];
  cron?: string;
  inputs?: Array<{
    name: string;
    type: 'string' | 'boolean' | 'choice';
    required: boolean;
    default?: string;
    options?: string[];
  }>;
}

export interface ParallelConfig {
  /** IDs of steps to run in parallel */
  stepIds: string[];
}

export interface MapConfig {
  /** Transformation code */
  transformCode: string;
}

export interface ConditionConfig {
  /** Condition expression */
  expression: string;
  /** Branch to take if true */
  trueBranch?: string;
  /** Branch to take if false */
  falseBranch?: string;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  position: { x: number; y: number };
  config: StepConfig | TriggerConfig | ParallelConfig | MapConfig | ConditionConfig;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  inputSchema: WorkflowSchema;
  outputSchema: WorkflowSchema;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  env?: Record<string, string>;
  secrets?: string[];
}

// =============================================================================
// Store State & Actions
// =============================================================================

interface WorkflowState {
  // Current workflow being edited
  workflow: WorkflowDefinition;
  
  // Selection state
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  
  // UI state
  isCodePreviewOpen: boolean;
  generatedCode: string;
  validationErrors: Array<{ nodeId?: string; message: string }>;
  isDirty: boolean;
  
  // History for undo/redo
  history: WorkflowDefinition[];
  historyIndex: number;
  
  // Actions
  setWorkflow: (workflow: WorkflowDefinition) => void;
  updateWorkflowMeta: (updates: Partial<Pick<WorkflowDefinition, 'name' | 'description' | 'inputSchema' | 'outputSchema'>>) => void;
  
  // Node operations
  addNode: (type: NodeType, position: { x: number; y: number }, options?: { autoConnect?: boolean; afterNodeId?: string }) => string;
  addNodeAfter: (afterNodeId: string, type: NodeType) => string;
  updateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  
  // Layout helpers
  getLastNodeInChain: () => WorkflowNode | null;
  getNextNodePosition: (afterNodeId?: string) => { x: number; y: number };
  autoLayout: () => void;
  
  // Edge operations
  addEdge: (source: string, target: string, sourceHandle?: string, targetHandle?: string) => string;
  updateEdge: (edgeId: string, updates: Partial<WorkflowEdge>) => void;
  deleteEdge: (edgeId: string) => void;
  selectEdge: (edgeId: string | null) => void;
  
  // Code generation
  generateCode: () => string;
  toggleCodePreview: () => void;
  
  // Validation
  validate: () => boolean;
  
  // History operations
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
  
  // Reset
  reset: () => void;
  loadFromYaml: (yaml: string) => void;
}

// =============================================================================
// Default Values
// =============================================================================

const createDefaultWorkflow = (): WorkflowDefinition => ({
  id: nanoid(),
  name: 'my-workflow',
  description: 'A custom Mastra workflow',
  inputSchema: { fields: [] },
  outputSchema: { fields: [] },
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      name: 'Trigger',
      position: { x: 100, y: 200 },
      config: {
        type: 'manual',
      } as TriggerConfig,
    },
  ],
  edges: [],
});

const createDefaultStep = (position: { x: number; y: number }): WorkflowNode => ({
  id: `step-${nanoid(8)}`,
  type: 'step',
  name: 'New Step',
  position,
  config: {
    id: `step-${nanoid(8)}`,
    name: 'New Step',
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    executeCode: `async ({ inputData }) => {
  // Your step logic here
  return {
    // output fields
  };
}`,
  } as StepConfig,
});

// =============================================================================
// Store Implementation
// =============================================================================

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      workflow: createDefaultWorkflow(),
      selectedNodeId: null,
      selectedEdgeId: null,
      isCodePreviewOpen: false,
      generatedCode: '',
      validationErrors: [],
      isDirty: false,
      history: [],
      historyIndex: -1,

      setWorkflow: (workflow) => {
        set({ workflow, isDirty: false, validationErrors: [] });
        get().saveToHistory();
      },

      updateWorkflowMeta: (updates) => {
        set((state) => ({
          workflow: { ...state.workflow, ...updates },
          isDirty: true,
        }));
      },

      getLastNodeInChain: () => {
        const { workflow } = get();
        if (workflow.nodes.length === 0) return null;
        
        // Find nodes that are targets of edges (have incoming edges)
        const targetNodes = new Set(workflow.edges.map(e => e.target));
        // Find nodes that are sources of edges (have outgoing edges)  
        const sourceNodes = new Set(workflow.edges.map(e => e.source));
        
        // Find the last node (a node that is a source but not a target of any edge, or has no outgoing edges)
        // Prefer nodes that have incoming edges but no outgoing edges (end of chain)
        const endNodes = workflow.nodes.filter(n => 
          targetNodes.has(n.id) && !sourceNodes.has(n.id)
        );
        
        if (endNodes.length > 0) {
          // Return the one with the highest x position (rightmost)
          return endNodes.reduce((a, b) => a.position.x > b.position.x ? a : b);
        }
        
        // If no end nodes, find the rightmost node
        return workflow.nodes.reduce((a, b) => a.position.x > b.position.x ? a : b);
      },

      getNextNodePosition: (afterNodeId?: string) => {
        const { workflow } = get();
        const NODE_SPACING_X = 250;
        const NODE_SPACING_Y = 0;
        
        if (afterNodeId) {
          const afterNode = workflow.nodes.find(n => n.id === afterNodeId);
          if (afterNode) {
            return {
              x: afterNode.position.x + NODE_SPACING_X,
              y: afterNode.position.y + NODE_SPACING_Y,
            };
          }
        }
        
        // Find the last node in the chain
        const lastNode = get().getLastNodeInChain();
        if (lastNode) {
          return {
            x: lastNode.position.x + NODE_SPACING_X,
            y: lastNode.position.y,
          };
        }
        
        // Default position if no nodes exist
        return { x: 100, y: 200 };
      },

      autoLayout: () => {
        const { workflow } = get();
        const NODE_SPACING_X = 250;
        const START_X = 100;
        const START_Y = 200;
        
        // Topological sort to get execution order
        const sorted = topologicalSort(workflow.nodes, workflow.edges);
        
        // Position nodes in a horizontal flow
        const updatedNodes = workflow.nodes.map(node => {
          const sortIndex = sorted.findIndex(n => n.id === node.id);
          if (sortIndex === -1) {
            // Disconnected node - put it below
            return {
              ...node,
              position: { x: START_X, y: START_Y + 150 },
            };
          }
          return {
            ...node,
            position: {
              x: START_X + sortIndex * NODE_SPACING_X,
              y: START_Y,
            },
          };
        });
        
        set((state) => ({
          workflow: {
            ...state.workflow,
            nodes: updatedNodes,
          },
          isDirty: true,
        }));
      },

      addNode: (type, position, options = {}) => {
        const { autoConnect = true, afterNodeId } = options;
        const id = `${type}-${nanoid(8)}`;
        let node: WorkflowNode;
        
        // Determine the node to connect from
        let connectFromNodeId: string | null = null;
        if (autoConnect && type !== 'trigger') {
          if (afterNodeId) {
            connectFromNodeId = afterNodeId;
          } else {
            // Auto-connect to selected node or last node in chain
            const { selectedNodeId } = get();
            if (selectedNodeId) {
              connectFromNodeId = selectedNodeId;
            } else {
              const lastNode = get().getLastNodeInChain();
              if (lastNode) {
                connectFromNodeId = lastNode.id;
              }
            }
          }
        }

        switch (type) {
          case 'trigger':
            node = {
              id,
              type: 'trigger',
              name: 'Trigger',
              position,
              config: { type: 'manual' } as TriggerConfig,
            };
            break;
          case 'step':
            node = createDefaultStep(position);
            break;
          case 'parallel':
            node = {
              id,
              type: 'parallel',
              name: 'Parallel',
              position,
              config: { stepIds: [] } as ParallelConfig,
            };
            break;
          case 'map':
            node = {
              id,
              type: 'map',
              name: 'Transform',
              position,
              config: {
                transformCode: `async ({ inputData, getInitData, getStepResult }) => {
  return {
    ...inputData,
  };
}`,
              } as MapConfig,
            };
            break;
          case 'condition':
            node = {
              id,
              type: 'condition',
              name: 'Condition',
              position,
              config: { expression: 'inputData.value === true' } as ConditionConfig,
            };
            break;
          default:
            throw new Error(`Unknown node type: ${type}`);
        }

        // Build the new edges array - auto-connect if we have a source node
        let newEdges = get().workflow.edges;
        if (connectFromNodeId) {
          const edgeId = `edge-${nanoid(8)}`;
          newEdges = [...newEdges, {
            id: edgeId,
            source: connectFromNodeId,
            target: id,
          }];
        }

        set((state) => ({
          workflow: {
            ...state.workflow,
            nodes: [...state.workflow.nodes, node],
            edges: newEdges,
          },
          selectedNodeId: id,
          isDirty: true,
        }));

        return id;
      },

      addNodeAfter: (afterNodeId, type) => {
        const position = get().getNextNodePosition(afterNodeId);
        return get().addNode(type, position, { autoConnect: true, afterNodeId });
      },

      updateNode: (nodeId, updates) => {
        set((state) => ({
          workflow: {
            ...state.workflow,
            nodes: state.workflow.nodes.map((n) =>
              n.id === nodeId ? { ...n, ...updates } : n
            ),
          },
          isDirty: true,
        }));
      },

      deleteNode: (nodeId) => {
        set((state) => ({
          workflow: {
            ...state.workflow,
            nodes: state.workflow.nodes.filter((n) => n.id !== nodeId),
            edges: state.workflow.edges.filter(
              (e) => e.source !== nodeId && e.target !== nodeId
            ),
          },
          selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
          isDirty: true,
        }));
      },

      selectNode: (nodeId) => {
        set({ selectedNodeId: nodeId, selectedEdgeId: null });
      },

      addEdge: (source, target, sourceHandle, targetHandle) => {
        const id = `edge-${nanoid(8)}`;
        const edge: WorkflowEdge = {
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
        };

        set((state) => ({
          workflow: {
            ...state.workflow,
            edges: [...state.workflow.edges, edge],
          },
          isDirty: true,
        }));

        return id;
      },

      updateEdge: (edgeId, updates) => {
        set((state) => ({
          workflow: {
            ...state.workflow,
            edges: state.workflow.edges.map((e) =>
              e.id === edgeId ? { ...e, ...updates } : e
            ),
          },
          isDirty: true,
        }));
      },

      deleteEdge: (edgeId) => {
        set((state) => ({
          workflow: {
            ...state.workflow,
            edges: state.workflow.edges.filter((e) => e.id !== edgeId),
          },
          selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
          isDirty: true,
        }));
      },

      selectEdge: (edgeId) => {
        set({ selectedEdgeId: edgeId, selectedNodeId: null });
      },

      generateCode: () => {
        const { workflow } = get();
        const code = generateMastraCode(workflow);
        set({ generatedCode: code });
        return code;
      },

      toggleCodePreview: () => {
        const state = get();
        if (!state.isCodePreviewOpen) {
          state.generateCode();
        }
        set({ isCodePreviewOpen: !state.isCodePreviewOpen });
      },

      validate: () => {
        const { workflow } = get();
        const errors: Array<{ nodeId?: string; message: string }> = [];

        // Check workflow has a name
        if (!workflow.name) {
          errors.push({ message: 'Workflow must have a name' });
        }

        // Check for at least one trigger
        const triggers = workflow.nodes.filter((n) => n.type === 'trigger');
        if (triggers.length === 0) {
          errors.push({ message: 'Workflow must have at least one trigger' });
        }

        // Check for at least one step
        const steps = workflow.nodes.filter((n) => n.type === 'step');
        if (steps.length === 0) {
          errors.push({ message: 'Workflow must have at least one step' });
        }

        // Check that all steps are connected
        const connectedNodes = new Set<string>();
        for (const edge of workflow.edges) {
          connectedNodes.add(edge.source);
          connectedNodes.add(edge.target);
        }
        for (const node of workflow.nodes) {
          if (node.type !== 'trigger' && !connectedNodes.has(node.id)) {
            errors.push({ nodeId: node.id, message: `Node "${node.name}" is not connected` });
          }
        }

        // Check step configurations
        for (const node of workflow.nodes) {
          if (node.type === 'step') {
            const config = node.config as StepConfig;
            if (!config.id) {
              errors.push({ nodeId: node.id, message: `Step "${node.name}" must have an ID` });
            }
            if (!config.executeCode && !config.actionRef && !config.runCommand) {
              errors.push({ nodeId: node.id, message: `Step "${node.name}" must have execute code, action, or command` });
            }
          }
        }

        set({ validationErrors: errors });
        return errors.length === 0;
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          set({
            workflow: history[historyIndex - 1],
            historyIndex: historyIndex - 1,
          });
        }
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          set({
            workflow: history[historyIndex + 1],
            historyIndex: historyIndex + 1,
          });
        }
      },

      saveToHistory: () => {
        const { workflow, history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(JSON.parse(JSON.stringify(workflow)));
        set({
          history: newHistory.slice(-50), // Keep last 50 states
          historyIndex: newHistory.length - 1,
        });
      },

      reset: () => {
        const newWorkflow = createDefaultWorkflow();
        set({
          workflow: newWorkflow,
          selectedNodeId: null,
          selectedEdgeId: null,
          isCodePreviewOpen: false,
          generatedCode: '',
          validationErrors: [],
          isDirty: false,
          history: [newWorkflow],
          historyIndex: 0,
        });
      },

      loadFromYaml: (_yaml) => {
        // TODO: Parse YAML and convert to workflow definition
        // This would convert GitHub Actions YAML to Mastra workflow
      },
    }),
    {
      name: 'wit-workflow-builder',
      partialize: (state) => ({
        workflow: state.workflow,
      }),
    }
  )
);

// =============================================================================
// Code Generation
// =============================================================================

function generateMastraCode(workflow: WorkflowDefinition): string {
  const lines: string[] = [];

  // Imports
  lines.push("import { createWorkflow, createStep } from '@mastra/core/workflows';");
  lines.push("import { z } from 'zod';");
  lines.push('');

  // Input Schema
  lines.push('// =============================================================================');
  lines.push('// Input/Output Schemas');
  lines.push('// =============================================================================');
  lines.push('');
  lines.push(`export const ${toPascalCase(workflow.name)}InputSchema = z.object({`);
  for (const field of workflow.inputSchema.fields) {
    const zodType = schemaFieldToZod(field);
    lines.push(`  ${field.name}: ${zodType},`);
  }
  lines.push('});');
  lines.push('');
  lines.push(`export type ${toPascalCase(workflow.name)}Input = z.infer<typeof ${toPascalCase(workflow.name)}InputSchema>;`);
  lines.push('');

  // Output Schema
  lines.push(`export const ${toPascalCase(workflow.name)}OutputSchema = z.object({`);
  for (const field of workflow.outputSchema.fields) {
    const zodType = schemaFieldToZod(field);
    lines.push(`  ${field.name}: ${zodType},`);
  }
  lines.push('});');
  lines.push('');
  lines.push(`export type ${toPascalCase(workflow.name)}Output = z.infer<typeof ${toPascalCase(workflow.name)}OutputSchema>;`);
  lines.push('');

  // Build execution order from edges
  const executionOrder = topologicalSort(workflow.nodes, workflow.edges);
  const stepNodes = executionOrder.filter((n) => n.type === 'step');
  // Note: parallelNodes and mapNodes are reserved for future use
  // const parallelNodes = executionOrder.filter((n) => n.type === 'parallel');
  // const mapNodes = executionOrder.filter((n) => n.type === 'map');

  // Generate step definitions
  lines.push('// =============================================================================');
  lines.push('// Steps');
  lines.push('// =============================================================================');
  lines.push('');

  for (const node of stepNodes) {
    const config = node.config as StepConfig;
    lines.push(`const ${toCamelCase(config.id || node.id)}Step = createStep({`);
    lines.push(`  id: '${config.id || node.id}',`);
    
    // Input schema
    lines.push('  inputSchema: z.object({');
    for (const field of config.inputSchema.fields) {
      lines.push(`    ${field.name}: ${schemaFieldToZod(field)},`);
    }
    lines.push('  }),');
    
    // Output schema
    lines.push('  outputSchema: z.object({');
    for (const field of config.outputSchema.fields) {
      lines.push(`    ${field.name}: ${schemaFieldToZod(field)},`);
    }
    lines.push('  }),');
    
    // Execute function
    if (config.runCommand) {
      // Shell command step
      lines.push('  execute: async ({ inputData }) => {');
      lines.push("    const { spawn } = await import('child_process');");
      lines.push('    return new Promise((resolve) => {');
      lines.push(`      const child = spawn('sh', ['-c', ${JSON.stringify(config.runCommand)}]);`);
      lines.push("      let output = '';");
      lines.push("      child.stdout?.on('data', (data) => { output += data.toString(); });");
      lines.push("      child.on('close', (code) => {");
      lines.push('        resolve({ success: code === 0, output });');
      lines.push('      });');
      lines.push('    });');
      lines.push('  },');
    } else if (config.actionRef) {
      // Action reference step
      lines.push('  execute: async ({ inputData }) => {');
      lines.push(`    // Action: ${config.actionRef}`);
      lines.push('    // TODO: Implement action handler');
      lines.push('    return { success: true };');
      lines.push('  },');
    } else {
      // Custom execute code
      lines.push(`  execute: ${config.executeCode},`);
    }
    
    lines.push('});');
    lines.push('');
  }

  // Generate workflow definition
  lines.push('// =============================================================================');
  lines.push('// Workflow Definition');
  lines.push('// =============================================================================');
  lines.push('');
  lines.push(`export const ${toCamelCase(workflow.name)}Workflow = createWorkflow({`);
  lines.push(`  id: '${workflow.id}',`);
  lines.push(`  inputSchema: ${toPascalCase(workflow.name)}InputSchema,`);
  lines.push(`  outputSchema: ${toPascalCase(workflow.name)}OutputSchema,`);
  lines.push('})');

  // Chain steps in execution order
  let isFirstStep = true;
  for (const node of executionOrder) {
    if (node.type === 'trigger') continue;
    
    if (node.type === 'step') {
      const config = node.config as StepConfig;
      const indent = isFirstStep ? '' : '  ';
      lines.push(`${indent}.then(${toCamelCase(config.id || node.id)}Step)`);
      isFirstStep = false;
    } else if (node.type === 'parallel') {
      const config = node.config as ParallelConfig;
      const stepRefs = config.stepIds.map((id) => `${toCamelCase(id)}Step`).join(', ');
      lines.push(`  .parallel([${stepRefs}])`);
    } else if (node.type === 'map') {
      const config = node.config as MapConfig;
      lines.push(`  .map(${config.transformCode})`);
    }
  }

  lines.push('  .commit();');
  lines.push('');

  return lines.join('\n');
}

function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Build adjacency list and count in-degrees
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // Find nodes with no incoming edges (starts with triggers)
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const result: WorkflowNode[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) {
      result.push(node);
    }

    for (const neighbor of adjacency.get(nodeId) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return result;
}

function schemaFieldToZod(field: SchemaField): string {
  let zodType: string;
  switch (field.type) {
    case 'string':
      zodType = 'z.string()';
      break;
    case 'number':
      zodType = 'z.number()';
      break;
    case 'boolean':
      zodType = 'z.boolean()';
      break;
    case 'object':
      zodType = 'z.record(z.unknown())';
      break;
    case 'array':
      zodType = 'z.array(z.unknown())';
      break;
    default:
      zodType = 'z.unknown()';
  }

  if (field.description) {
    zodType += `.describe('${field.description.replace(/'/g, "\\'")}')`;
  }

  if (!field.required) {
    zodType += '.optional()';
  }

  if (field.default !== undefined) {
    zodType += `.default(${JSON.stringify(field.default)})`;
  }

  return zodType;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase());
}
