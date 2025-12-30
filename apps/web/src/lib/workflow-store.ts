/**
 * Workflow Builder Store - Simplified
 * 
 * Zustand store for managing the simplified workflow builder state.
 * Focuses on a linear, easy-to-understand workflow model.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';

// =============================================================================
// Simplified Types
// =============================================================================

export type TriggerType = 'push' | 'pull_request' | 'manual' | 'schedule';

export interface WorkflowTrigger {
  type: TriggerType;
  branches?: string[];
  paths?: string[];
  cron?: string;
}

export type StepType = 'command' | 'action' | 'ai';

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  command?: string;        // For command steps
  actionRef?: string;      // For action steps (e.g., 'actions/checkout@v4')
  actionWith?: Record<string, string>; // Action inputs
  aiPrompt?: string;       // For AI steps
  enabled: boolean;
  condition?: string;      // Optional conditional expression
}

export interface SimpleWorkflow {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  env?: Record<string, string>;
}

// =============================================================================
// Legacy Types (for backward compatibility)
// =============================================================================

// These types are kept for backward compatibility with the visual workflow canvas
// They will be deprecated once the new simplified builder is fully adopted

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
  actionRef?: string;
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
  stepIds: string[];
}

export interface MapConfig {
  transformCode: string;
}

export interface ConditionConfig {
  expression: string;
  trueBranch?: string;
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
  // Simplified workflow (new)
  simpleWorkflow: SimpleWorkflow;
  
  // Legacy workflow (for backward compatibility)
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
  
  // Simple workflow actions
  setSimpleWorkflow: (workflow: SimpleWorkflow) => void;
  updateSimpleTrigger: (trigger: Partial<WorkflowTrigger>) => void;
  addSimpleStep: (step: Omit<WorkflowStep, 'id'>, afterIndex?: number) => string;
  updateSimpleStep: (stepId: string, updates: Partial<WorkflowStep>) => void;
  deleteSimpleStep: (stepId: string) => void;
  moveSimpleStep: (fromIndex: number, toIndex: number) => void;
  
  // Legacy actions (kept for backward compatibility)
  setWorkflow: (workflow: WorkflowDefinition) => void;
  updateWorkflowMeta: (updates: Partial<Pick<WorkflowDefinition, 'name' | 'description' | 'inputSchema' | 'outputSchema'>>) => void;
  addNode: (type: NodeType, position: { x: number; y: number }, options?: { autoConnect?: boolean; afterNodeId?: string }) => string;
  addNodeAfter: (afterNodeId: string, type: NodeType) => string;
  updateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  getLastNodeInChain: () => WorkflowNode | null;
  getNextNodePosition: (afterNodeId?: string) => { x: number; y: number };
  autoLayout: () => void;
  addEdge: (source: string, target: string, sourceHandle?: string, targetHandle?: string) => string;
  updateEdge: (edgeId: string, updates: Partial<WorkflowEdge>) => void;
  deleteEdge: (edgeId: string) => void;
  selectEdge: (edgeId: string | null) => void;
  generateCode: () => string;
  toggleCodePreview: () => void;
  validate: () => boolean;
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
  reset: () => void;
  loadFromYaml: (yaml: string) => void;
}

// =============================================================================
// Default Values
// =============================================================================

const createDefaultSimpleWorkflow = (): SimpleWorkflow => ({
  id: nanoid(),
  name: 'My Workflow',
  description: '',
  trigger: { type: 'manual' },
  steps: [],
});

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
      simpleWorkflow: createDefaultSimpleWorkflow(),
      workflow: createDefaultWorkflow(),
      selectedNodeId: null,
      selectedEdgeId: null,
      isCodePreviewOpen: false,
      generatedCode: '',
      validationErrors: [],
      isDirty: false,
      history: [],
      historyIndex: -1,

      // =======================================================================
      // Simple Workflow Actions
      // =======================================================================
      
      setSimpleWorkflow: (workflow) => {
        set({ simpleWorkflow: workflow, isDirty: false });
      },

      updateSimpleTrigger: (updates) => {
        set((state) => ({
          simpleWorkflow: {
            ...state.simpleWorkflow,
            trigger: { ...state.simpleWorkflow.trigger, ...updates },
          },
          isDirty: true,
        }));
      },

      addSimpleStep: (step, afterIndex) => {
        const id = `step-${nanoid(8)}`;
        const newStep: WorkflowStep = { ...step, id };
        
        set((state) => {
          const newSteps = [...state.simpleWorkflow.steps];
          const insertIndex = afterIndex !== undefined ? afterIndex + 1 : newSteps.length;
          newSteps.splice(insertIndex, 0, newStep);
          
          return {
            simpleWorkflow: { ...state.simpleWorkflow, steps: newSteps },
            isDirty: true,
          };
        });
        
        return id;
      },

      updateSimpleStep: (stepId, updates) => {
        set((state) => ({
          simpleWorkflow: {
            ...state.simpleWorkflow,
            steps: state.simpleWorkflow.steps.map((s) =>
              s.id === stepId ? { ...s, ...updates } : s
            ),
          },
          isDirty: true,
        }));
      },

      deleteSimpleStep: (stepId) => {
        set((state) => ({
          simpleWorkflow: {
            ...state.simpleWorkflow,
            steps: state.simpleWorkflow.steps.filter((s) => s.id !== stepId),
          },
          isDirty: true,
        }));
      },

      moveSimpleStep: (fromIndex, toIndex) => {
        set((state) => {
          const newSteps = [...state.simpleWorkflow.steps];
          const [removed] = newSteps.splice(fromIndex, 1);
          newSteps.splice(toIndex, 0, removed);
          
          return {
            simpleWorkflow: { ...state.simpleWorkflow, steps: newSteps },
            isDirty: true,
          };
        });
      },

      // =======================================================================
      // Legacy Actions (for backward compatibility)
      // =======================================================================

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
        
        const targetNodes = new Set(workflow.edges.map(e => e.target));
        const sourceNodes = new Set(workflow.edges.map(e => e.source));
        
        const endNodes = workflow.nodes.filter(n => 
          targetNodes.has(n.id) && !sourceNodes.has(n.id)
        );
        
        if (endNodes.length > 0) {
          return endNodes.reduce((a, b) => a.position.x > b.position.x ? a : b);
        }
        
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
        
        const lastNode = get().getLastNodeInChain();
        if (lastNode) {
          return {
            x: lastNode.position.x + NODE_SPACING_X,
            y: lastNode.position.y,
          };
        }
        
        return { x: 100, y: 200 };
      },

      autoLayout: () => {
        const { workflow } = get();
        const NODE_SPACING_X = 250;
        const START_X = 100;
        const START_Y = 200;
        
        const sorted = topologicalSort(workflow.nodes, workflow.edges);
        
        const updatedNodes = workflow.nodes.map(node => {
          const sortIndex = sorted.findIndex(n => n.id === node.id);
          if (sortIndex === -1) {
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
        
        let connectFromNodeId: string | null = null;
        if (autoConnect && type !== 'trigger') {
          if (afterNodeId) {
            connectFromNodeId = afterNodeId;
          } else {
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

        if (!workflow.name) {
          errors.push({ message: 'Workflow must have a name' });
        }

        const triggers = workflow.nodes.filter((n) => n.type === 'trigger');
        if (triggers.length === 0) {
          errors.push({ message: 'Workflow must have at least one trigger' });
        }

        const steps = workflow.nodes.filter((n) => n.type === 'step');
        if (steps.length === 0) {
          errors.push({ message: 'Workflow must have at least one step' });
        }

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
          history: newHistory.slice(-50),
          historyIndex: newHistory.length - 1,
        });
      },

      reset: () => {
        const newWorkflow = createDefaultWorkflow();
        const newSimpleWorkflow = createDefaultSimpleWorkflow();
        set({
          workflow: newWorkflow,
          simpleWorkflow: newSimpleWorkflow,
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
      },
    }),
    {
      name: 'wit-workflow-builder',
      partialize: (state) => ({
        workflow: state.workflow,
        simpleWorkflow: state.simpleWorkflow,
      }),
    }
  )
);

// =============================================================================
// Code Generation (Legacy)
// =============================================================================

function generateMastraCode(workflow: WorkflowDefinition): string {
  const lines: string[] = [];

  lines.push("import { createWorkflow, createStep } from '@mastra/core/workflows';");
  lines.push("import { z } from 'zod';");
  lines.push('');

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

  lines.push(`export const ${toPascalCase(workflow.name)}OutputSchema = z.object({`);
  for (const field of workflow.outputSchema.fields) {
    const zodType = schemaFieldToZod(field);
    lines.push(`  ${field.name}: ${zodType},`);
  }
  lines.push('});');
  lines.push('');
  lines.push(`export type ${toPascalCase(workflow.name)}Output = z.infer<typeof ${toPascalCase(workflow.name)}OutputSchema>;`);
  lines.push('');

  const executionOrder = topologicalSort(workflow.nodes, workflow.edges);
  const stepNodes = executionOrder.filter((n) => n.type === 'step');

  lines.push('// =============================================================================');
  lines.push('// Steps');
  lines.push('// =============================================================================');
  lines.push('');

  for (const node of stepNodes) {
    const config = node.config as StepConfig;
    lines.push(`const ${toCamelCase(config.id || node.id)}Step = createStep({`);
    lines.push(`  id: '${config.id || node.id}',`);
    
    lines.push('  inputSchema: z.object({');
    for (const field of config.inputSchema.fields) {
      lines.push(`    ${field.name}: ${schemaFieldToZod(field)},`);
    }
    lines.push('  }),');
    
    lines.push('  outputSchema: z.object({');
    for (const field of config.outputSchema.fields) {
      lines.push(`    ${field.name}: ${schemaFieldToZod(field)},`);
    }
    lines.push('  }),');
    
    if (config.runCommand) {
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
      lines.push('  execute: async ({ inputData }) => {');
      lines.push(`    // Action: ${config.actionRef}`);
      lines.push('    // TODO: Implement action handler');
      lines.push('    return { success: true };');
      lines.push('  },');
    } else {
      lines.push(`  execute: ${config.executeCode},`);
    }
    
    lines.push('});');
    lines.push('');
  }

  lines.push('// =============================================================================');
  lines.push('// Workflow Definition');
  lines.push('// =============================================================================');
  lines.push('');
  lines.push(`export const ${toCamelCase(workflow.name)}Workflow = createWorkflow({`);
  lines.push(`  id: '${workflow.id}',`);
  lines.push(`  inputSchema: ${toPascalCase(workflow.name)}InputSchema,`);
  lines.push(`  outputSchema: ${toPascalCase(workflow.name)}OutputSchema,`);
  lines.push('})');

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

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

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
